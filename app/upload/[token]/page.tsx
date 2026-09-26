"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, FileText, Loader2, Lock, RotateCcw, Upload, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ProgressRule } from "@/components/stat-strip";
import { cn } from "@/lib/utils";
import {
  MAX_UPLOAD_BATCH_BYTES,
  MAX_UPLOAD_FILE_BYTES,
  PublicChecklist,
  PublicUploadApiError,
  UploadItemStatusOut,
  completeUploadItem,
  createUploadBatch,
  finalizeUploadBatch,
  getPublicChecklist,
  getUploadBatchStatus,
  getUploadLinkInfo,
  initUploadItem,
  uploadClientFile,
} from "@/lib/public-upload-api";

// Same set of extensions the authenticated document vault accepts (see
// app/clients/[id]/page.tsx's DocumentVaultCard) - this feature is another
// entry point into the same document pipeline, not a separate file-type
// policy.
const ACCEPT =
  ".pdf,.csv,.tsv,.xls,.xlsx,.xlsm,.ods,.rtf,.docx,.odt,.pptx,.md,.txt,.json,.xml,.html,.htm,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff,.bmp";

const UPLOAD_CONCURRENCY = 5;

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

type ClientPhase = "pending" | "uploading" | "uploaded" | "failed";

interface QueueEntry {
  key: string;
  file: File;
  itemId: number | null;
  clientPhase: ClientPhase;
  progress: number;
  clientError: string | null;
  // Filled in once polling picks up this item's server-side status.
  serverStatus: UploadItemStatusOut["status"] | null;
  serverError: string | null;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>
) {
  let index = 0;
  async function next(): Promise<void> {
    const i = index++;
    if (i >= items.length) return;
    await worker(items[i]);
    return next();
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => next())
  );
}

export default function PublicUploadPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  const [linkInfo, setLinkInfo] = useState<
    { client_name: string; organization_name: string } | null | { error: string }
  >(null);
  const [checklist, setChecklist] = useState<PublicChecklist | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [finalized, setFinalized] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchIdRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getUploadLinkInfo(token)
      .then(setLinkInfo)
      .catch((e) =>
        setLinkInfo({
          error:
            e instanceof PublicUploadApiError
              ? e.message
              : "This upload link is invalid or has been revoked. Please contact your firm for a new one.",
        })
      );
  }, [token]);

  const refreshChecklist = useCallback(() => {
    getPublicChecklist(token).then(setChecklist).catch(() => {});
  }, [token]);

  useEffect(() => {
    refreshChecklist();
    // The checklist updates as background processing matches uploaded
    // files to requirements - a light, independent poll (not tied to the
    // upload-batch poll below, which only starts after finalize) keeps it
    // current for as long as the client has the page open, per "the
    // simplest sensible refresh mechanism" rather than adding sockets.
    const id = setInterval(refreshChecklist, 8000);
    return () => clearInterval(id);
  }, [refreshChecklist]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const ensureBatch = useCallback(async () => {
    if (batchIdRef.current !== null) return batchIdRef.current;
    const created = await createUploadBatch(token);
    batchIdRef.current = created.batch_id;
    return created.batch_id;
  }, [token]);

  const updateEntry = useCallback((key: string, patch: Partial<QueueEntry>) => {
    setQueue((prev) =>
      prev.map((e) => (e.key === key ? { ...e, ...patch } : e))
    );
  }, []);

  const uploadOne = useCallback(
    async (entry: QueueEntry, id: number) => {
      updateEntry(entry.key, { clientPhase: "uploading", clientError: null });
      try {
        const init = await initUploadItem(token, id, entry.file);
        updateEntry(entry.key, { itemId: init.item_id });
        await uploadClientFile(token, id, init, entry.file, (fraction) =>
          updateEntry(entry.key, { progress: fraction })
        );
        await completeUploadItem(token, id, init.item_id);
        updateEntry(entry.key, { clientPhase: "uploaded", progress: 1 });
      } catch (e) {
        updateEntry(entry.key, {
          clientPhase: "failed",
          clientError:
            e instanceof PublicUploadApiError ? e.message : "Upload failed. Please retry.",
        });
      }
    },
    [token, updateEntry]
  );

  const startPolling = useCallback(
    (id: number) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const status = await getUploadBatchStatus(token, id);
          setQueue((prev) =>
            prev.map((e) => {
              const match = status.items.find((i) => i.item_id === e.itemId);
              if (!match) return e;
              return { ...e, serverStatus: match.status, serverError: match.error };
            })
          );
          if (status.status === "completed" || status.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          // Transient - the next tick will retry.
        }
      }, 2000);
    },
    [token]
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      // Reject obviously invalid files before ever starting a network
      // request - one oversized file must not block the rest of an
      // otherwise-valid selection. The backend re-validates both limits
      // authoritatively (against the real, R2-verified size at completion
      // time for the per-file cap), this is purely a fast client-side UX
      // pre-check.
      let runningTotal = queue
        .filter((e) => e.clientPhase !== "failed")
        .reduce((sum, e) => sum + e.file.size, 0);
      const accepted: File[] = [];
      const rejected: QueueEntry[] = [];
      files.forEach((file, i) => {
        const key = `${Date.now()}-${i}-${file.name}`;
        const base = { key, file, itemId: null, progress: 0, serverStatus: null, serverError: null } as const;
        if (file.size > MAX_UPLOAD_FILE_BYTES) {
          rejected.push({ ...base, clientPhase: "failed",
            clientError: `Exceeds the ${formatBytes(MAX_UPLOAD_FILE_BYTES)} per-file limit.` });
          return;
        }
        if (runningTotal + file.size > MAX_UPLOAD_BATCH_BYTES) {
          rejected.push({ ...base, clientPhase: "failed",
            clientError: `Would exceed the ${formatBytes(MAX_UPLOAD_BATCH_BYTES)} session limit. Remove some files and try again.` });
          return;
        }
        runningTotal += file.size;
        accepted.push(file);
      });
      if (rejected.length > 0) {
        setQueue((prev) => [...prev, ...rejected]);
      }
      if (accepted.length === 0) return;

      const id = await ensureBatch();
      const entries: QueueEntry[] = accepted.map((file, i) => ({
        key: `${Date.now()}-ok-${i}-${file.name}`,
        file,
        itemId: null,
        clientPhase: "pending",
        progress: 0,
        clientError: null,
        serverStatus: null,
        serverError: null,
      }));
      setQueue((prev) => [...prev, ...entries]);
      await runWithConcurrency(entries, UPLOAD_CONCURRENCY, (entry) => uploadOne(entry, id));
    },
    [ensureBatch, uploadOne, queue]
  );

  const retryOne = useCallback(
    async (entry: QueueEntry) => {
      const id = batchIdRef.current;
      if (id === null) return;
      await uploadOne(entry, id);
    },
    [uploadOne]
  );

  const removeOne = useCallback((entry: QueueEntry) => {
    // A failed file that's been dropped from the queue no longer blocks
    // completion - it was never uploaded, so there's nothing server-side
    // to clean up (no item_id was ever confirmed for it).
    setQueue((prev) => prev.filter((e) => e.key !== entry.key));
  }, []);

  const finishAndProcess = useCallback(async () => {
    const id = batchIdRef.current;
    if (id === null) return;
    await finalizeUploadBatch(token, id);
    setFinalized(true);
    startPolling(id);
  }, [token, startPolling]);

  const onUploadMore = useCallback(() => {
    // Start a genuinely new batch, not reopen the finalized one - the old
    // batch keeps processing in the background regardless (nothing here
    // touches its server-side state), we're only resetting what's needed
    // for a fresh upload session in the UI. The old batch's poll interval
    // only existed to update queue entries that are about to be cleared
    // anyway, so it's safe to stop; the checklist keeps refreshing on its
    // own independent poll either way.
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    batchIdRef.current = null;
    setQueue([]);
    setFinalized(false);
  }, []);

  const isUploading = queue.some((e) => e.clientPhase === "uploading" || e.clientPhase === "pending");
  const hasUnresolvedFailures = queue.some((e) => e.clientPhase === "failed");
  // Centralized completion gate: every file must have actually succeeded -
  // a failed file only stops blocking once it's retried to success or
  // explicitly removed, never just because time passed.
  const canCompleteUpload = queue.length > 0 && !isUploading && !hasUnresolvedFailures;
  const uploadedCount = queue.filter((e) => e.clientPhase === "uploaded").length;
  const failedCount = queue.filter((e) => e.clientPhase === "failed").length;

  const onConfirmDone = useCallback(async () => {
    // Re-check rather than trust the dialog having been reachable only in
    // a valid state - guards against a stale click racing a state change.
    if (!canCompleteUpload) {
      setConfirmOpen(false);
      return;
    }
    setConfirmOpen(false);
    await finishAndProcess();
  }, [canCompleteUpload, finishAndProcess]);

  const firm = linkInfo && !("error" in linkInfo) ? linkInfo.organization_name : null;
  const firstName = linkInfo && !("error" in linkInfo) ? linkInfo.client_name.split(" ")[0] : null;

  if (linkInfo !== null && "error" in linkInfo) {
    return (
      <PublicShell firm={null}>
        <div className="mx-auto flex max-w-lg flex-col gap-4 py-10 text-center sm:py-20">
          <h1 className="text-4xl leading-tight font-thin tracking-tight text-balance [font-family:var(--font-denton)] sm:text-5xl">
            This link isn&apos;t available
          </h1>
          <p className="text-sm text-pretty text-muted-foreground">{linkInfo.error}</p>
        </div>
      </PublicShell>
    );
  }

  const hasChecklist = checklist !== null && checklist.total > 0;

  return (
    <PublicShell firm={firm}>
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-3 text-[0.6875rem] tracking-widest text-muted-foreground uppercase">
          <span aria-hidden className="h-px w-7 bg-accent" />
          Document request
        </p>
        {linkInfo ? (
          <>
            <h1 className="text-[2.5rem] leading-[1.05] font-thin tracking-tight text-balance [font-family:var(--font-denton)] sm:text-5xl lg:text-6xl">
              {firstName ? `${firstName}, share your documents with ${firm}.` : `Share your documents with ${firm}.`}
            </h1>
            <p className="max-w-xl text-[0.9375rem] leading-relaxed text-pretty text-foreground/80">
              {`Upload everything below in one go. Files go straight to ${firm} over an encrypted connection, and you'll see each one checked off as it's received.`}
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-14 w-full max-w-xl" />
            <Skeleton className="h-4 w-80" />
          </div>
        )}
      </div>

      <div
        className={cn(
          "grid grid-cols-[minmax(0,1fr)] items-start gap-6",
          hasChecklist && "lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-8"
        )}
      >
        {hasChecklist && <ChecklistPanel checklist={checklist} />}

        <section
          aria-label="Upload files"
          className={cn(
            "flex min-w-0 flex-col gap-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6",
            !hasChecklist && "mx-auto w-full max-w-2xl"
          )}
        >
          {finalized ? (
            <div className="flex animate-fade-in flex-col items-start gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-success/10 text-success">
                <Check className="size-4" />
              </span>
              <h2 className="text-xl font-light tracking-tight">Sent to {firm ?? "your firm"}.</h2>
              <p className="text-sm text-pretty text-muted-foreground">
                Your files are being checked against the request{hasChecklist ? " and will be ticked off as they're matched" : ""}.
                You can close this page, or add anything you missed.
              </p>
              <Button variant="outline" onClick={onUploadMore}>
                Upload more files
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[0.9375rem] font-medium tracking-tight">Your files</h2>
                <span className="text-xs text-muted-foreground">
                  Up to {formatBytes(MAX_UPLOAD_FILE_BYTES)} each · {formatBytes(MAX_UPLOAD_BATCH_BYTES)} in total
                </span>
              </div>
              <div
                role="button"
                tabIndex={0}
                aria-label="Choose files to upload"
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  addFiles(Array.from(e.dataTransfer.files ?? []));
                }}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  queue.length > 0 ? "py-8" : "py-14",
                  dragOver ? "border-foreground/50 bg-muted/60" : "border-foreground/20 hover:border-foreground/35 hover:bg-muted/30"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
                <span className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground/70">
                  <Upload className="size-4" />
                </span>
                <div className="flex flex-col gap-1">
                  <p className="text-sm">
                    <span className="font-medium">Choose files</span>
                    <span className="text-muted-foreground"> or drag them here</span>
                  </p>
                  <p className="text-xs text-muted-foreground">PDFs, photos, spreadsheets and documents. Add as many as you need.</p>
                </div>
              </div>
            </>
          )}

          {queue.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  {uploadedCount} of {queue.length} uploaded
                  {failedCount > 0 && <span className="text-destructive"> · {failedCount} failed</span>}
                </span>
              </div>
              <ProgressRule value={uploadedCount} total={queue.length} className="w-full" />
              <ul className="flex max-h-96 flex-col divide-y divide-border/60 overflow-y-auto rounded-lg ring-1 ring-foreground/10">
                {queue.map((entry) => (
                  <QueueRow key={entry.key} entry={entry} onRetry={() => retryOne(entry)} onRemove={() => removeOne(entry)} />
                ))}
              </ul>
            </div>
          )}

          {!finalized && queue.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
              <span className={cn("text-xs", hasUnresolvedFailures && !isUploading ? "text-destructive" : "text-muted-foreground")}>
                {isUploading
                  ? "Keep this page open until uploading finishes."
                  : hasUnresolvedFailures
                    ? "Retry or remove the files that failed before sending."
                    : "Everything's uploaded. Send when you're ready."}
              </span>
              <Button disabled={!canCompleteUpload} onClick={() => setConfirmOpen(true)}>
                {isUploading && <Loader2 className="animate-spin" />}
                {isUploading ? "Uploading…" : `Send to ${firm ?? "your firm"}`}
              </Button>
            </div>
          )}
        </section>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Is everything here?</DialogTitle>
            <DialogDescription>
              {hasChecklist
                ? "Check the requested list before sending. You can still upload more afterwards."
                : "You can still upload more after sending."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Go back
            </Button>
            <Button onClick={onConfirmDone}>Send files</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicShell>
  );
}

// Words a client understands for each stage, from picking a file to it being
// checked on the firm's side.
function entryStatus(entry: QueueEntry): { label: string; tone: "muted" | "done" | "failed" } {
  if (entry.clientPhase === "failed" || entry.serverStatus === "failed") return { label: "Failed", tone: "failed" };
  switch (entry.serverStatus) {
    case "completed":
      return { label: "Received", tone: "done" };
    case "processing":
      return { label: "Checking", tone: "muted" };
    case "queued":
      return { label: "Queued", tone: "muted" };
  }
  switch (entry.clientPhase) {
    case "pending":
      return { label: "Waiting", tone: "muted" };
    case "uploading":
      return { label: `${Math.round(entry.progress * 100)}%`, tone: "muted" };
    default:
      return { label: "Uploaded", tone: "done" };
  }
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function QueueRow({ entry, onRetry, onRemove }: { entry: QueueEntry; onRetry: () => void; onRemove: () => void }) {
  const status = entryStatus(entry);
  const failedLocally = entry.clientPhase === "failed";
  const error = entry.clientError ?? entry.serverError;
  return (
    <li className="flex flex-col gap-1.5 px-3.5 py-3">
      <div className="flex items-center gap-3">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm">{entry.file.name}</span>
          <span className="text-xs text-muted-foreground">{formatFileSize(entry.file.size)}</span>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 text-xs tabular-nums",
            status.tone === "failed" ? "text-destructive" : status.tone === "done" ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {status.tone === "done" && <Check className="size-3.5 text-success" />}
          {status.label}
        </span>
        {failedLocally && (
          <div className="-mr-1.5 flex shrink-0 items-center">
            <Button variant="ghost" size="icon-sm" onClick={onRetry} aria-label={`Retry ${entry.file.name}`}>
              <RotateCcw className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${entry.file.name}`}>
              <X className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      {entry.clientPhase === "uploading" && (
        <ProgressRule value={entry.progress} total={1} className="ml-7 w-auto" />
      )}
      {status.tone === "failed" && error && <p className="pl-7 text-xs text-destructive">{error}</p>}
    </li>
  );
}

// What the firm asked for, most actionable first: anything to resend, then
// what's still needed, then what has arrived.
function ChecklistPanel({ checklist }: { checklist: PublicChecklist }) {
  const items = useMemo(
    () =>
      [...checklist.items].sort((a, b) => {
        const rank = (s: string) => (s === "wrong" ? 0 : s === "missing" ? 1 : 2);
        return rank(a.status) - rank(b.status);
      }),
    [checklist]
  );
  const remaining = checklist.total - checklist.received;

  return (
    <section aria-label="Requested documents" className="flex flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6 lg:sticky lg:top-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[0.9375rem] font-medium tracking-tight">Requested documents</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            {checklist.received} of {checklist.total}
          </span>
        </div>
        <ProgressRule value={checklist.received} total={checklist.total} className="w-full" />
        <p className="text-xs text-muted-foreground">
          {remaining === 0 ? "Everything has been received. Thank you." : `${remaining} still needed.`}
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border/60">
        {items.map((item, i) => {
          const received = item.status === "received";
          const wrong = item.status === "wrong";
          return (
            <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                  received ? "bg-success/10 text-success" : wrong ? "ring-1 ring-warning" : "ring-1 ring-foreground/25"
                )}
              >
                {received && <Check className="size-3" />}
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className={cn("text-sm", received && "text-muted-foreground")}>{item.doc_type_needed}</span>
                {wrong ? (
                  <span className="text-xs text-warning-foreground">Please send this again. The last file didn&apos;t match.</span>
                ) : received ? (
                  <span className="text-xs text-muted-foreground">Received</span>
                ) : (
                  item.description && <span className="text-xs text-pretty text-muted-foreground">{item.description}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// The firm's page, not Compozor's: the firm name leads, Compozor signs off
// quietly in the footer.
function PublicShell({ firm, children }: { firm: string | null; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-5 sm:px-8">
          <span className="truncate text-sm font-medium">{firm ?? ""}</span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" />
            Secure upload
          </span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-5 py-10 sm:px-8 sm:py-16">{children}</main>
      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-5 text-xs text-muted-foreground sm:px-8">
          <span className="inline-flex items-center gap-2">
            Powered by
            <Image src="/compozor-wordmark.png" alt="Compozor" width={789} height={140} className="h-3.5 w-auto opacity-70" />
          </span>
          <span className={cn(!firm && "hidden")}>
            By uploading, you agree to the{" "}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </span>
        </div>
      </footer>
    </div>
  );
}
