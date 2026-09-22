"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  RotateCcw,
  Trash2,
  UploadCloud,
  XCircle,
} from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
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

  if (linkInfo !== null && "error" in linkInfo) {
    return (
      <PublicShell>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
            Upload link unavailable
          </h1>
          <p className="text-sm text-destructive">{linkInfo.error}</p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-thin tracking-tight [font-family:var(--font-denton)] sm:text-4xl">
          Secure document upload
        </h1>
        <p className="text-sm text-muted-foreground">
          {linkInfo
            ? `For ${linkInfo.client_name} · ${linkInfo.organization_name}`
            : "Loading…"}
        </p>
      </div>

      <ChecklistPanel checklist={checklist} />

      {!finalized && (
        <div
          role="button"
          tabIndex={0}
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
            if (e.key === "Enter") fileInputRef.current?.click();
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
            dragOver
              ? "border-accent bg-accent/5"
              : "border-border/70 hover:border-border hover:bg-muted/30"
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
          <UploadCloud className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Click to upload</span>{" "}
            or drag and drop your documents — as many as you need, all at once.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Up to {formatBytes(MAX_UPLOAD_FILE_BYTES)} per file · {formatBytes(MAX_UPLOAD_BATCH_BYTES)} per upload
          </p>
        </div>
      )}

      {queue.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {uploadedCount} / {queue.length} uploaded
              {failedCount > 0 && (
                <span className="text-destructive"> · {failedCount} failed</span>
              )}
            </span>
          </div>
          <Progress value={(uploadedCount / queue.length) * 100} />

          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-2">
            {queue.map((entry) => (
              <QueueRow
                key={entry.key}
                entry={entry}
                onRetry={() => retryOne(entry)}
                onRemove={() => removeOne(entry)}
              />
            ))}
          </div>

          {!finalized && (
            <div className="flex flex-col gap-1.5">
              <Button
                disabled={!canCompleteUpload}
                onClick={() => setConfirmOpen(true)}
                className="self-start"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="animate-spin" /> Uploading…
                  </>
                ) : (
                  "Finish upload"
                )}
              </Button>
              {!isUploading && hasUnresolvedFailures && (
                <p className="text-xs text-destructive">
                  Retry or remove the failed file(s) above before finishing.
                </p>
              )}
            </div>
          )}

          {finalized && (
            <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-3">
              <p className="text-sm font-medium text-foreground">
                Files uploaded successfully
              </p>
              <p className="text-sm text-muted-foreground">
                Your documents are being processed. You can close this page,
                or upload more documents if you forgot something.
              </p>
              <Button variant="outline" size="sm" onClick={onUploadMore} className="self-start">
                Upload more documents
              </Button>
            </div>
          )}
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Is everything added?</DialogTitle>
            <DialogDescription>
              Make sure you&apos;ve uploaded all the documents you want to
              send. You can review the requested document checklist above
              before finishing.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Go Back
            </Button>
            <Button onClick={onConfirmDone}>Yes, I&apos;m Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicShell>
  );
}

function QueueRow({
  entry,
  onRetry,
  onRemove,
}: {
  entry: QueueEntry;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const label = entry.serverStatus ?? entry.clientPhase;
  const isTerminalFail = entry.clientPhase === "failed" || entry.serverStatus === "failed";
  const isDone = entry.serverStatus === "completed";
  return (
    <div className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 text-sm">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{entry.file.name}</span>
        {entry.clientPhase === "uploading" && (
          <span className="w-24 shrink-0">
            <Progress value={entry.progress * 100} size="sm" />
          </span>
        )}
        <StatusBadge label={label} isTerminalFail={isTerminalFail} isDone={isDone} />
        {entry.clientPhase === "failed" && (
          <>
            <Button variant="ghost" size="icon-sm" onClick={onRetry} aria-label="Retry">
              <RotateCcw className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Remove">
              <Trash2 className="size-3.5" />
            </Button>
          </>
        )}
      </div>
      {entry.clientPhase === "failed" && entry.clientError && (
        <p className="pl-0.5 text-xs text-destructive">{entry.clientError}</p>
      )}
    </div>
  );
}

function ChecklistPanel({ checklist }: { checklist: PublicChecklist | null }) {
  // Received first, so the client sees progress before what's left. Hooks
  // must run unconditionally, so this computes even when checklist is
  // null/empty (harmless empty-array work) - the early returns below it.
  const items = useMemo(
    () =>
      [...(checklist?.items ?? [])].sort((a, b) => {
        const rank = (s: string) => (s === "received" ? 0 : s === "wrong" ? 1 : 2);
        return rank(a.status) - rank(b.status);
      }),
    [checklist]
  );

  if (checklist === null || checklist.total === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Documents requested from you
        </h2>
        <span className="shrink-0 text-xs text-muted-foreground">
          {checklist.received} of {checklist.total} received
        </span>
      </div>
      <Progress value={(checklist.received / checklist.total) * 100} size="sm" />
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            {item.status === "received" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                "flex flex-col",
                item.status === "received" && "text-muted-foreground line-through decoration-muted-foreground/50"
              )}
            >
              <span>
                {item.doc_type_needed}
                {item.status === "wrong" && (
                  <span className="ml-1.5 text-xs text-accent no-underline">(replacement needed)</span>
                )}
              </span>
              {item.description && (
                <span className="text-xs font-normal text-muted-foreground no-underline">{item.description}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({
  label,
  isTerminalFail,
  isDone,
}: {
  label: string;
  isTerminalFail: boolean;
  isDone: boolean;
}) {
  if (isTerminalFail) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-destructive">
        <XCircle className="size-3.5" /> Failed
      </span>
    );
  }
  if (isDone) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-accent">
        <CheckCircle2 className="size-3.5" /> Done
      </span>
    );
  }
  return (
    <span className="shrink-0 text-xs text-muted-foreground capitalize">
      {label.replace(/_/g, " ")}
    </span>
  );
}

function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full w-full flex-col items-center gap-4 bg-background px-4 py-10 sm:py-16">
      <div className="flex w-full max-w-xl flex-col gap-6 rounded-2xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
        {children}
      </div>
      <p className="text-xs text-muted-foreground">
        By uploading, you agree to Compozor&apos;s{" "}
        <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
