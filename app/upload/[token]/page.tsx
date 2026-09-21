"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  RotateCcw,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  PublicUploadApiError,
  UploadItemStatusOut,
  completeUploadItem,
  createUploadBatch,
  finalizeUploadBatch,
  getUploadBatchStatus,
  getUploadLinkInfo,
  initUploadItem,
  uploadFileToR2,
} from "@/lib/public-upload-api";

// Same set of extensions the authenticated document vault accepts (see
// app/clients/[id]/page.tsx's DocumentVaultCard) - this feature is another
// entry point into the same document pipeline, not a separate file-type
// policy.
const ACCEPT =
  ".pdf,.csv,.tsv,.xls,.xlsx,.xlsm,.ods,.rtf,.docx,.odt,.pptx,.md,.txt,.json,.xml,.html,.htm,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff,.bmp";

const UPLOAD_CONCURRENCY = 5;

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
    { client_name: string; organization_name: string } | null | "error"
  >(null);
  const [queue, setQueue] = useState<QueueEntry[]>([]);
  const [finalized, setFinalized] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchIdRef = useRef<number | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getUploadLinkInfo(token)
      .then(setLinkInfo)
      .catch(() => setLinkInfo("error"));
  }, [token]);

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
        await uploadFileToR2(init.upload_url, init.headers, entry.file, (fraction) =>
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
      const id = await ensureBatch();
      const entries: QueueEntry[] = files.map((file, i) => ({
        key: `${Date.now()}-${i}-${file.name}`,
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
    [ensureBatch, uploadOne]
  );

  const retryOne = useCallback(
    async (entry: QueueEntry) => {
      const id = batchIdRef.current;
      if (id === null) return;
      await uploadOne(entry, id);
    },
    [uploadOne]
  );

  const finishAndProcess = useCallback(async () => {
    const id = batchIdRef.current;
    if (id === null) return;
    await finalizeUploadBatch(token, id);
    setFinalized(true);
    startPolling(id);
  }, [token, startPolling]);

  const allDone =
    queue.length > 0 &&
    queue.every((e) => e.clientPhase === "uploaded" || e.clientPhase === "failed");
  const anyUploading = queue.some((e) => e.clientPhase === "uploading" || e.clientPhase === "pending");
  const uploadedCount = queue.filter((e) => e.clientPhase === "uploaded").length;
  const failedCount = queue.filter((e) => e.clientPhase === "failed").length;

  if (linkInfo === "error") {
    return (
      <PublicShell>
        <p className="text-sm text-destructive">
          This upload link is invalid or has been revoked. Please contact your
          accountant for a new one.
        </p>
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
              <QueueRow key={entry.key} entry={entry} onRetry={() => retryOne(entry)} />
            ))}
          </div>

          {!finalized && (
            <Button
              disabled={!allDone || anyUploading}
              onClick={finishAndProcess}
              className="self-start"
            >
              {anyUploading ? (
                <>
                  <Loader2 className="animate-spin" /> Uploading…
                </>
              ) : (
                "Done — start processing"
              )}
            </Button>
          )}

          {finalized && (
            <p className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
              Your files have been securely uploaded. Compozor will continue
              processing them automatically — you can close this page.
            </p>
          )}
        </div>
      )}
    </PublicShell>
  );
}

function QueueRow({
  entry,
  onRetry,
}: {
  entry: QueueEntry;
  onRetry: () => void;
}) {
  const label = entry.serverStatus ?? entry.clientPhase;
  const isTerminalFail = entry.clientPhase === "failed" || entry.serverStatus === "failed";
  const isDone = entry.serverStatus === "completed";
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate">{entry.file.name}</span>
      {entry.clientPhase === "uploading" && (
        <span className="w-24 shrink-0">
          <Progress value={entry.progress * 100} size="sm" />
        </span>
      )}
      <StatusBadge label={label} isTerminalFail={isTerminalFail} isDone={isDone} />
      {isTerminalFail && entry.clientPhase === "failed" && (
        <Button variant="ghost" size="icon-sm" onClick={onRetry} aria-label="Retry">
          <RotateCcw className="size-3.5" />
        </Button>
      )}
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
    <div className="flex min-h-full w-full items-start justify-center bg-background px-4 py-10 sm:py-16">
      <div className="flex w-full max-w-xl flex-col gap-6 rounded-2xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
        {children}
      </div>
    </div>
  );
}
