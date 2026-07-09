"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, Paperclip, Sparkles } from "lucide-react";
import { clientsKey, emailLogKey } from "@/lib/swr-keys";
import {
  ApiError,
  Client,
  DocumentOut,
  EmailLogEntry,
  EmailStatus,
  listClients,
  listEmailLog,
  sendEmailLogEntry,
} from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const statusOptions: { value: EmailStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "received", label: "Received" },
  { value: "draft", label: "Draft" },
  { value: "needs_human_attention", label: "Needs attention" },
  { value: "sent", label: "Sent" },
];

type StatusTone = "positive" | "neutral" | "attention";

const statusTone: Record<EmailStatus, StatusTone> = {
  received: "positive",
  sent: "positive",
  draft: "neutral",
  needs_human_attention: "attention",
};

const statusToneClasses: Record<StatusTone, string> = {
  positive: "bg-accent",
  neutral: "bg-muted-foreground/40",
  attention: "bg-destructive",
};

const statusLabels: Record<EmailStatus, string> = {
  received: "Received",
  sent: "Sent",
  draft: "Draft",
  needs_human_attention: "Needs attention",
};

function normalizeSubject(subject: string | null) {
  if (!subject) return null;
  return subject.replace(/^\s*(re|fwd?)\s*:\s*/gi, "").trim() || subject;
}

type Thread = {
  key: string;
  clientId: number;
  subject: string | null;
  messages: EmailLogEntry[];
};

export default function EmailLogPage() {
  const [status, setStatus] = useState<EmailStatus | "all">("all");
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<Record<number, string>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);

  const filterStatus = status === "all" ? undefined : status;
  const {
    data: entries,
    error: entriesError,
    isLoading: entriesLoading,
    mutate: mutateEntries,
  } = useSWR(emailLogKey(filterStatus), () => listEmailLog(filterStatus));
  const { data: clientsData } = useSWR(clientsKey(), listClients);
  const error = entriesError
    ? entriesError instanceof ApiError
      ? entriesError.message
      : String(entriesError)
    : null;

  const clientsById = useMemo(() => {
    const map: Record<number, Client> = {};
    for (const c of clientsData ?? []) map[c.id] = c;
    return map;
  }, [clientsData]);

  const threads = useMemo<Thread[]>(() => {
    if (!entries) return [];
    const map = new Map<string, EmailLogEntry[]>();
    for (const entry of entries) {
      const key = entry.thread_id ?? `single-${entry.id}`;
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
    const result: Thread[] = Array.from(map.entries()).map(([key, messages]) => {
      const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at));
      const subjectSource = sorted.find((m) => m.subject) ?? sorted[0];
      return {
        key,
        clientId: sorted[0].client_id,
        subject: normalizeSubject(subjectSource.subject),
        messages: sorted,
      };
    });
    result.sort((a, b) => {
      const aLatest = a.messages[a.messages.length - 1].created_at;
      const bLatest = b.messages[b.messages.length - 1].created_at;
      return bLatest.localeCompare(aLatest);
    });
    return result;
  }, [entries]);

  useEffect(() => {
    if (threads.length === 0) {
      setSelectedKey(null);
      return;
    }
    if (!threads.some((t) => t.key === selectedKey)) {
      setSelectedKey(threads[0].key);
    }
  }, [threads, selectedKey]);

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [status]);

  const selectedThread = threads.find((t) => t.key === selectedKey) ?? null;
  const loading = entriesLoading;

  const onSend = async (entry: EmailLogEntry) => {
    setSendingId(entry.id);
    setRowError((prev) => ({ ...prev, [entry.id]: "" }));
    try {
      await sendEmailLogEntry(entry.client_id, entry.id);
      mutateEntries();
    } catch (e) {
      setRowError((prev) => ({
        ...prev,
        [entry.id]: e instanceof ApiError ? e.message : String(e),
      }));
    } finally {
      setSendingId(null);
    }
  };

  const toggleThreadSelection = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allVisibleSelected =
    threads.length > 0 && threads.every((t) => selectedKeys.has(t.key));

  const toggleSelectAll = () => {
    setSelectedKeys(allVisibleSelected ? new Set() : new Set(threads.map((t) => t.key)));
  };

  const selectedDrafts = useMemo(
    () =>
      threads
        .filter((t) => selectedKeys.has(t.key))
        .flatMap((t) => t.messages.filter((m) => m.status === "draft")),
    [threads, selectedKeys]
  );

  const onBulkSend = async () => {
    setBulkSending(true);
    await Promise.allSettled(selectedDrafts.map((m) => sendEmailLogEntry(m.client_id, m.id)));
    setBulkSending(false);
    setSelectedKeys(new Set());
    mutateEntries();
  };

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-6xl font-thin tracking-tight [font-family:var(--font-denton)]">
          Email log
        </h1>
        <p className="text-sm text-muted-foreground">
          Every message sent or received across all clients.
        </p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          {statusOptions.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={status === opt.value ? "default" : "ghost"}
              onClick={() => setStatus(opt.value)}
              className="rounded-lg"
            >
              {opt.label}
            </Button>
          ))}
        </div>
        {selectedKeys.size > 0 && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {selectedKeys.size} selected
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={selectedDrafts.length === 0 || bulkSending}
              onClick={onBulkSend}
            >
              {bulkSending
                ? "Sending…"
                : `Send ${selectedDrafts.length} draft${selectedDrafts.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-6" style={{ height: "calc(100vh - 21rem)" }}>
        <div className="flex w-[22rem] shrink-0 flex-col rounded-xl border border-border/60">
          <div className="flex items-center gap-2.5 border-b border-border/60 px-3 py-2">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              className="size-3.5 shrink-0 accent-foreground"
              aria-label="Select all"
            />
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {loading ? "…" : `${threads.length} thread${threads.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading &&
              Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5 border-b border-border/40 px-3 py-2.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            {!loading &&
              threads.map((thread, i) => (
                <ThreadRow
                  key={thread.key}
                  thread={thread}
                  client={clientsById[thread.clientId]}
                  selected={thread.key === selectedKey}
                  checked={selectedKeys.has(thread.key)}
                  onSelect={() => setSelectedKey(thread.key)}
                  onCheck={() => toggleThreadSelection(thread.key)}
                  delayMs={Math.min(i, 10) * 25}
                />
              ))}
            {!loading && threads.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No entries.
              </p>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto rounded-xl border border-border/60">
          {loading ? (
            <div className="flex flex-col gap-4 p-6">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-5 w-64" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="flex flex-col gap-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          ) : selectedThread ? (
            <div
              className="flex flex-col gap-4 p-6 animate-blur-in-sm"
              style={{ animationDelay: "100ms" }}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-medium">
                    {selectedThread.subject || "(no subject)"}
                  </h2>
                  <Link
                    href={`/clients/${selectedThread.clientId}`}
                    className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  >
                    {clientsById[selectedThread.clientId]?.name ??
                      `#${selectedThread.clientId}`}
                  </Link>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                {selectedThread.messages.map((entry) => (
                  <MessageCard
                    key={entry.id}
                    entry={entry}
                    sending={sendingId === entry.id}
                    error={rowError[entry.id]}
                    onSend={() => onSend(entry)}
                  />
                ))}
              </div>
            </div>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a thread to read it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadRow({
  thread,
  client,
  selected,
  checked,
  onSelect,
  onCheck,
  delayMs = 0,
}: {
  thread: Thread;
  client?: Client;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onCheck: () => void;
  delayMs?: number;
}) {
  const latest = thread.messages[thread.messages.length - 1];
  const hasAttention = thread.messages.some((m) => m.status === "needs_human_attention");
  const tone = hasAttention ? "attention" : statusTone[latest.status];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
      style={{ animationDelay: `${delayMs}ms` }}
      className={cn(
        "flex w-full cursor-pointer animate-blur-in-sm items-start gap-2.5 border-b border-border/40 px-3 py-2.5 text-left transition-colors hover:bg-muted/40",
        selected && "bg-muted/60"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={onCheck}
        className="mt-1 size-3.5 shrink-0 accent-foreground"
      />
      <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", statusToneClasses[tone])} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">
            {client?.name ?? `#${thread.clientId}`}
          </span>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            {formatRelativeTime(latest.created_at)}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5">
          {latest.direction === "outbound" ? (
            <ArrowUpRight className="size-3 shrink-0 text-muted-foreground/70" />
          ) : (
            <ArrowDownLeft className="size-3 shrink-0 text-muted-foreground/70" />
          )}
          <span className="truncate text-xs text-muted-foreground">
            {thread.subject || "(no subject)"}
          </span>
          {thread.messages.length > 1 && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground">
              {thread.messages.length}
            </span>
          )}
          {thread.messages.some((m) => m.autosent) && (
            <Sparkles className="size-3 shrink-0 text-accent" />
          )}
        </div>
      </div>
    </div>
  );
}

function MessageCard({
  entry,
  sending,
  error,
  onSend,
}: {
  entry: EmailLogEntry;
  sending: boolean;
  error?: string;
  onSend: () => void;
}) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border/50 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          {entry.direction === "outbound" ? (
            <ArrowUpRight className="size-3.5 text-muted-foreground/70" />
          ) : (
            <ArrowDownLeft className="size-3.5 text-muted-foreground/70" />
          )}
          {entry.direction === "outbound"
            ? entry.to_email ?? "Outbound"
            : entry.from_email ?? "Inbound"}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {formatRelativeTime(entry.created_at)}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              "size-1.5 rounded-full",
              statusToneClasses[statusTone[entry.status]]
            )}
          />
          <span className="text-sm text-foreground/80">{statusLabels[entry.status]}</span>
        </span>
        <AutosendCell entry={entry} />
      </div>
      {entry.status === "needs_human_attention" && entry.escalation_reason && (
        <p className="text-xs text-amber-600 dark:text-amber-500">
          {entry.escalation_reason}
        </p>
      )}
      <p className="whitespace-pre-wrap text-sm text-foreground/80">
        {entry.content || "(no body)"}
      </p>
      {entry.documents.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {entry.documents.map((doc) => (
            <AttachmentRow key={doc.id} doc={doc} />
          ))}
        </div>
      )}
      {entry.status === "draft" && (
        <div>
          <Button size="sm" disabled={sending} onClick={onSend}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function attachmentFilename(doc: DocumentOut) {
  const path = doc.s3_path.split("/").pop() ?? doc.s3_path;
  return path.replace(/^[a-f0-9-]{20,}[-_]/i, "");
}

function AttachmentRow({ doc }: { doc: DocumentOut }) {
  const filename = attachmentFilename(doc);
  const content = (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-xs">
      <Paperclip className="size-3 shrink-0 text-muted-foreground/70" />
      <span className="truncate">{filename}</span>
      {doc.classified_type && (
        <span className="shrink-0 truncate text-muted-foreground">
          · {doc.classified_type}
        </span>
      )}
    </span>
  );

  if (!doc.download_url) return content;

  return (
    <a
      href={doc.download_url}
      target="_blank"
      rel="noopener noreferrer"
      className="w-fit transition-opacity hover:opacity-70"
    >
      {content}
    </a>
  );
}

function AutosendCell({ entry }: { entry: EmailLogEntry }) {
  if (entry.automation_level_at_decision === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const detail = (
    <>
      {entry.autosend_confidence !== null && (
        <p>Confidence: {entry.autosend_confidence.toFixed(2)}</p>
      )}
      {entry.autosend_threshold !== null && (
        <p>Threshold: {entry.autosend_threshold.toFixed(2)}</p>
      )}
      {entry.autosend_error && <p>Error: {entry.autosend_error}</p>}
    </>
  );

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                "inline-flex cursor-default items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                entry.autosent
                  ? "bg-accent/15 text-accent"
                  : "bg-muted text-muted-foreground"
              )}
            />
          }
        >
          {entry.autosent ? (
            <>
              <Sparkles className="size-3" />
              Auto
            </>
          ) : (
            "Manual"
          )}
        </TooltipTrigger>
        <TooltipContent>{detail}</TooltipContent>
      </Tooltip>
      {entry.autosend_error && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex items-center text-amber-600 dark:text-amber-500" />
            }
          >
            <AlertTriangle className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{entry.autosend_error}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
