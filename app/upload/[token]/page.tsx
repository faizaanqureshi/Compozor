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
import { PortalQuestionnaires } from "@/components/portal-questionnaires";
import { ProgressRule } from "@/components/stat-strip";
import type { PortalReadiness, PortalState } from "@/lib/client-portal-api";
import { portalView } from "@/lib/portal-view";
import { cn } from "@/lib/utils";
import {
  MAX_UPLOAD_BATCH_BYTES,
  MAX_UPLOAD_FILE_BYTES,
  PublicChecklist,
  PublicUploadApiError,
  UploadItemStatusOut,
  UploadLinkInfo,
  completeUploadItem,
  createUploadBatch,
  finalizeUploadBatch,
  getPublicChecklist,
  getUploadBatchStatus,
  getUploadLinkInfo,
  initUploadItem,
  removeUploadItem,
  uploadClientFile,
} from "@/lib/public-upload-api";

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
  abortController: AbortController | null;
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

  const [linkInfo, setLinkInfo] = useState<UploadLinkInfo | null | { error: string }>(null);
  // Server-calculated portal readiness: the bootstrap from the link, then
  // verified portal state. Upload permission is never decided here.
  const [readiness, setReadiness] = useState<PortalReadiness | null>(null);
  // A questionnaire is open and takes the full width.
  const [questionnaireOpen, setQuestionnaireOpen] = useState(false);
  const [checklist, setChecklist] = useState<PublicChecklist | null>(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [finalized, setFinalized] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchIdRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadLinkInfo = useCallback(() => {
    getUploadLinkInfo(token)
      .then((info) => {
        setLinkInfo(info);
        setReadiness(info.portal ?? null);
      })
      .catch((e) =>
        setLinkInfo({
          error:
            e instanceof PublicUploadApiError
              ? e.message
              : "This upload link is invalid or has been revoked. Please contact your firm for a new one.",
        })
      );
  }, [token]);

  useEffect(() => {
    loadLinkInfo();
  }, [loadLinkInfo]);

  const onPortalState = useCallback((state: PortalState) => {
    setReadiness(state.readiness);
    setChecklist(state.checklist);
  }, []);

  const onLinkInvalid = useCallback((message: string) => setLinkInfo({ error: message }), []);

  const refreshChecklist = useCallback(() => {
    getPublicChecklist(token).then(setChecklist).catch(() => {});
  }, [token]);

  useEffect(() => {
    refreshChecklist();
    // The checklist updates as background processing matches uploaded
    // files to requirements - a light, independent poll (not tied to the
    // upload-batch poll below) keeps it
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
      const abortController = new AbortController();
      updateEntry(entry.key, { clientPhase: "uploading", clientError: null, abortController });
      let itemId: number | null = null;
      // A file removed before its server id reached the queue would otherwise stay
      // on the server and block submission. Cancellation is idempotent.
      const cancelIfRemoved = () => {
        if (!abortController.signal.aborted || itemId === null) return false;
        void removeUploadItem(token, id, itemId).catch(() => {});
        return true;
      };
      try {
        const init = await initUploadItem(token, id, entry.file);
        itemId = init.item_id;
        if (cancelIfRemoved()) return;
        updateEntry(entry.key, { itemId: init.item_id });
        await uploadClientFile(token, id, init, entry.file,
          (fraction) => updateEntry(entry.key, { progress: fraction }), abortController.signal);
        await completeUploadItem(token, id, init.item_id);
        if (cancelIfRemoved()) return;
        updateEntry(entry.key, { clientPhase: "uploaded", progress: 1, serverStatus: "queued", abortController: null });
      } catch (e) {
        if (abortController.signal.aborted) { cancelIfRemoved(); return; }
        updateEntry(entry.key, {
          clientPhase: "failed",
          abortController: null,
          clientError:
            e instanceof PublicUploadApiError ? e.message : "Upload failed. Please retry.",
        });
        // The server refuses new uploads while a required questionnaire is
        // outstanding; re-read the portal state instead of guessing.
        if (e instanceof PublicUploadApiError && e.status === 403) loadLinkInfo();
      }
    },
    [token, updateEntry, loadLinkInfo]
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
        const base = { key, file, itemId: null, progress: 0, serverStatus: null, serverError: null, abortController: null } as const;
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

      let id: number;
      try {
        id = await ensureBatch();
      } catch (e) {
        const message = e instanceof PublicUploadApiError ? e.message : "Upload failed. Please retry.";
        setQueue((prev) => [
          ...prev,
          ...accepted.map((file, i) => ({
            key: `${Date.now()}-err-${i}-${file.name}`, file, itemId: null, clientPhase: "failed" as const,
            progress: 0, clientError: message, serverStatus: null, serverError: null,
            abortController: null,
          })),
        ]);
        if (e instanceof PublicUploadApiError && e.status === 403) loadLinkInfo();
        return;
      }
      const entries: QueueEntry[] = accepted.map((file, i) => ({
        key: `${Date.now()}-ok-${i}-${file.name}`,
        file,
        itemId: null,
        clientPhase: "pending",
        progress: 0,
        clientError: null,
        serverStatus: null,
        serverError: null,
        abortController: null,
      }));
      setQueue((prev) => [...prev, ...entries]);
      startPolling(id);
      await runWithConcurrency(entries, UPLOAD_CONCURRENCY, (entry) => uploadOne(entry, id));
    },
    [ensureBatch, uploadOne, queue, loadLinkInfo, startPolling]
  );

  const retryOne = useCallback(
    async (entry: QueueEntry) => {
      const id = batchIdRef.current;
      if (id === null) return;
      await uploadOne(entry, id);
    },
    [uploadOne]
  );

  const removeOne = useCallback(async (entry: QueueEntry) => {
    entry.abortController?.abort();
    setQueue((prev) => prev.filter((e) => e.key !== entry.key));
    const id = batchIdRef.current;
    if (id === null || entry.itemId === null) return;
    try {
      await removeUploadItem(token, id, entry.itemId);
    } catch (error) {
      setQueue((prev) => [...prev, { ...entry, abortController: null, clientPhase: "failed",
        clientError: error instanceof PublicUploadApiError
          ? error.message : "This file could not be removed. Please try again." }]);
    }
  }, [token]);

  const finishAndProcess = useCallback(async () => {
    const id = batchIdRef.current;
    if (id === null) return;
    const itemIds = queue.flatMap((entry) => entry.itemId === null ? [] : [entry.itemId]);
    setSubmitError(null);
    try {
      await finalizeUploadBatch(token, id, itemIds);
      setQueue((prev) => prev.map((entry) => ({ ...entry, serverStatus: "submitted" })));
      setFinalized(true);
      startPolling(id);
    } catch (error) {
      setSubmitError(error instanceof PublicUploadApiError
        ? error.message : "The files could not be submitted. Please try again.");
      // A conflict can mean files were sent back for another check; refresh their status.
      if (error instanceof PublicUploadApiError && error.status === 409) startPolling(id);
    }
  }, [token, startPolling, queue]);

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
    setSubmitError(null);
  }, []);

  const isUploading = queue.some((e) => e.clientPhase === "uploading" || e.clientPhase === "pending");
  const hasUnresolvedFailures = queue.some((e) => e.clientPhase === "failed" || e.serverStatus === "failed" || e.serverStatus === "rejected");
  const securityPending = queue.some((e) => e.clientPhase === "uploaded" && e.serverStatus !== "cleared");
  const canCompleteUpload = queue.length > 0 && !isUploading && !securityPending && !hasUnresolvedFailures
    && queue.every((entry) => entry.itemId !== null && entry.serverStatus === "cleared");
  const readyCount = queue.filter((e) => e.serverStatus === "cleared").length;
  const failedCount = queue.filter((e) => e.clientPhase === "failed" || e.serverStatus === "failed" || e.serverStatus === "rejected").length;

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
          <h1 className="text-4xl leading-tight font-light tracking-tight text-balance [font-family:var(--font-display)] sm:text-5xl">
            This link isn&apos;t available
          </h1>
          <p className="text-sm text-pretty text-muted-foreground">{linkInfo.error}</p>
        </div>
      </PublicShell>
    );
  }

  const hasChecklist = checklist !== null && checklist.total > 0;
  const view = portalView(readiness);
  const questionnaireState = readiness?.questionnaire_state ?? "none";
  // Required questionnaires come before documents; optional ones follow them.
  const questionnairesFirst = questionnaireState === "required_outstanding" || questionnaireState === "required_complete";
  const loaded = linkInfo !== null;

  return (
    <PublicShell firm={firm}>
      <div className="flex flex-col gap-4">
        <p className="flex items-center gap-3 text-[0.6875rem] tracking-widest text-muted-foreground uppercase">
          <span aria-hidden className="h-px w-7 bg-accent" />
          Client portal
        </p>
        {linkInfo ? (
          <>
            <h1 className="text-[2.5rem] leading-[1.05] font-light tracking-tight text-balance [font-family:var(--font-display)] sm:text-5xl lg:text-6xl">
              {view.requiredFirst
                ? firstName
                  ? `${firstName}, a few questions before your documents.`
                  : "A few questions before your documents."
                : firstName
                  ? `${firstName}, share your documents with ${firm}.`
                  : `Share your documents with ${firm}.`}
            </h1>
            <p className="max-w-xl text-[0.9375rem] leading-relaxed text-pretty text-foreground/80">
              {view.requiredFirst
                ? `${firm} needs some answers first. They decide which documents to request, and you can save and come back at any time. Your secure upload opens as soon as you submit.`
                : `Upload everything below in one go. Files go straight to ${firm} over an encrypted connection, and you'll see each one checked off as it's received.`}
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-14 w-full max-w-xl" />
            <Skeleton className="h-4 w-80" />
          </div>
        )}
      </div>

      {loaded && view.showQuestionnaires && (
        <div className={cn("min-w-0", !questionnairesFirst && "order-last")}>
          <PortalQuestionnaires
            token={token}
            questionnaireState={questionnaireState}
            organizationName={firm ?? undefined}
            onState={onPortalState}
            onLinkInvalid={onLinkInvalid}
            onFocusChange={setQuestionnaireOpen}
            onNoQuestionnaires={loadLinkInfo}
          />
        </div>
      )}

      {loaded && !questionnaireOpen && !view.showUploader && (
        <section
          aria-label="Upload files"
          className="flex w-full flex-col items-start gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-6"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-foreground/70">
            <Lock className="size-4" />
          </span>
          <h2 className="text-[0.9375rem] font-medium tracking-tight">Document upload opens after the questionnaire</h2>
          <p className="text-sm text-pretty text-muted-foreground">
            Your answers decide which documents {firm ?? "your firm"} needs. Once you submit, your document checklist and
            secure upload appear here.
          </p>
        </section>
      )}

      {/* Hidden rather than unmounted while a questionnaire is open, so an
          in-progress upload queue survives opening an optional questionnaire. */}
      {loaded && view.showUploader && (
        <div
          className={cn(
            "grid grid-cols-[minmax(0,1fr)] items-start gap-6",
            hasChecklist && "lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-8",
            questionnaireOpen && "hidden"
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
                    accept={linkInfo && !("error" in linkInfo) ? linkInfo.supported_extensions.join(",") : undefined}
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
                    <p className="text-xs text-muted-foreground">
                      {linkInfo && !("error" in linkInfo)
                        ? linkInfo.supported_formats_description
                        : "PDFs, photos, spreadsheets and documents. Add as many as you need."}
                    </p>
                  </div>
                </div>
              </>
            )}

            {queue.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="tabular-nums">
                    {readyCount} of {queue.length} ready to submit
                    {failedCount > 0 && <span className="text-destructive"> · {failedCount} failed</span>}
                  </span>
                </div>
                <ProgressRule value={readyCount} total={queue.length} className="w-full" />
                <ul className="flex max-h-96 flex-col divide-y divide-border/60 overflow-y-auto rounded-lg ring-1 ring-foreground/10">
                  {queue.map((entry) => (
                    <QueueRow key={entry.key} entry={entry} canRemove={!finalized}
                      onRetry={() => retryOne(entry)} onRemove={() => removeOne(entry)} />
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
                      ? "Remove or replace files that couldn’t be accepted."
                      : securityPending
                        ? "Files are still being checked. You can wait or remove a file."
                        : "Everything is ready. Submit when you’re satisfied with the list."}
                </span>
                <Button disabled={!canCompleteUpload} onClick={() => setConfirmOpen(true)}>
                  {isUploading && <Loader2 className="animate-spin" />}
                  {isUploading ? "Uploading…" : `Submit to ${firm ?? "your firm"}`}
                </Button>
              </div>
            )}
            {submitError && <p role="alert" className="text-xs text-destructive">{submitError}</p>}
          </section>
        </div>
      )}

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
            <Button onClick={onConfirmDone}>Submit files</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicShell>
  );
}

// Words a client understands for each stage, from picking a file to it being
// checked on the firm's side.
function entryStatus(entry: QueueEntry): { label: string; tone: "muted" | "done" | "failed" } {
  if (entry.clientPhase === "failed" || entry.serverStatus === "failed" || entry.serverStatus === "rejected") {
    return { label: "Upload failed", tone: "failed" };
  }
  switch (entry.serverStatus) {
    case "completed":
      return { label: "Received", tone: "done" };
    case "submitted":
    case "processing":
      return { label: "Submitted", tone: "done" };
    case "cleared":
      return { label: "Ready to submit", tone: "done" };
    case "scanning":
    case "queued":
      return { label: "Checking file", tone: "muted" };
    case "awaiting_upload":
      return { label: "Uploading", tone: "muted" };
  }
  switch (entry.clientPhase) {
    case "pending":
      return { label: "Uploading", tone: "muted" };
    case "uploading":
      return { label: `Uploading ${Math.round(entry.progress * 100)}%`, tone: "muted" };
    default:
      return { label: "Checking file", tone: "muted" };
  }
}

function formatFileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function QueueRow({ entry, canRemove, onRetry, onRemove }: {
  entry: QueueEntry; canRemove: boolean; onRetry: () => void; onRemove: () => void;
}) {
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
        {(canRemove || failedLocally) && <div className="-mr-1.5 flex shrink-0 items-center">
          {failedLocally && (
            <Button variant="ghost" size="icon-sm" onClick={onRetry} aria-label={`Retry ${entry.file.name}`}>
              <RotateCcw className="size-3.5" />
            </Button>
          )}
          {canRemove && (
              <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove ${entry.file.name}`}>
                <X className="size-3.5" />
              </Button>
          )}
        </div>}
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
