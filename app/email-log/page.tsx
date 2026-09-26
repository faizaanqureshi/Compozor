"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { AlertTriangle, ArchiveRestore, ArrowDownLeft, ArrowLeft, ArrowUpRight, Check, Download, FileText, Info, Loader2, Mail, Paperclip, Search, Send, Sparkles, Trash2 } from "lucide-react";
import { clientsKey, emailLogKey } from "@/lib/swr-keys";
import {
  ApiError,
  Client,
  DocumentOut,
  EmailLogEntry,
  EmailLogStreamEvent,
  bulkDeleteEmailLogEntries,
  getEmailLogHtml,
  listActiveRuns,
  listArchivedEmailLog,
  listClients,
  listEmailLog,
  purgeEmailLogEntries,
  resolveEmailLogEntry,
  restoreEmailLogEntries,
  sendEmailLogEntry,
  subscribeToEmailLogStream,
  updateEmailLogEntry,
} from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { AgentActivityDisclosure, TraceStep } from "@/components/agent-activity-disclosure";
import { EmailDraftEditor } from "@/components/email-draft-editor";
import { EmailBody } from "@/components/email-body";
import { EmailHtmlFrame } from "@/components/email-html-frame";
import { Linkify } from "@/components/linkify";
import { PurgeConfirmDialog } from "@/components/purge-confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Human-readable label for each pipeline stage while a thread is being
// processed live (see event_broadcast.py / email_reply_pipeline.py on the
// backend for where these are emitted).
const STAGE_LABELS: Record<string, string> = {
  junk_check: "Checking for spam…",
  intent_classification: "Reading the question…",
  document_processing: "Processing attachment(s)…",
  qa_answer: "Answering the question…",
  answer_review: "Checking the answer against its sources…",
};

type LiveRun = {
  stage: string | null;
  trace: TraceStep[];
  draftText: string;
};

// Tabs filter whole threads, client-side, from one cached list - switching is
// instant and every tab can show its count.
type View = "all" | "review" | "drafts" | "received" | "sent";

const viewOptions: { value: View; label: string }[] = [
  { value: "all", label: "All" },
  { value: "review", label: "Needs review" },
  { value: "drafts", label: "Drafts" },
  { value: "received", label: "Received" },
  { value: "sent", label: "Sent" },
];

type MessageTone = "issue" | "warning" | "received" | "sent" | "muted";

// The one label a staff member needs for a message: what happened to it.
function messageState(entry: EmailLogEntry): { label: string; tone: MessageTone } {
  if (entry.status === "needs_human_attention") {
    return entry.resolved_at ? { label: "Resolved", tone: "muted" } : { label: "Needs review", tone: "issue" };
  }
  if (entry.status === "draft") {
    if (entry.delivery_state === "sending") return { label: "Sending…", tone: "muted" };
    if (entry.delivery_state === "uncertain") return { label: "Delivery unconfirmed", tone: "warning" };
    if (entry.delivery_state === "failed") return { label: "Send failed", tone: "issue" };
    return { label: "Draft", tone: "warning" };
  }
  if (entry.status === "sent") return { label: entry.autosent ? "Auto-sent" : "Sent", tone: "sent" };
  return { label: "Received", tone: "received" };
}

function threadNeedsReview(thread: Thread) {
  return thread.messages.some((m) => m.status === "needs_human_attention" && !m.resolved_at);
}

function threadHasDraft(thread: Thread) {
  return thread.messages.some((m) => m.status === "draft");
}

// Thread-level state: anything needing a human outranks what happened last.
function threadState(thread: Thread): { label: string; tone: MessageTone } {
  if (threadNeedsReview(thread)) return { label: "Needs review", tone: "issue" };
  const draft = [...thread.messages].reverse().find((m) => m.status === "draft");
  if (draft) return messageState(draft);
  return messageState(thread.messages[thread.messages.length - 1]);
}

function matchesView(thread: Thread, view: View) {
  const latest = thread.messages[thread.messages.length - 1];
  switch (view) {
    case "review":
      return threadNeedsReview(thread);
    case "drafts":
      return threadHasDraft(thread);
    case "received":
      return latest.direction === "inbound";
    case "sent":
      return latest.direction === "outbound" && latest.status === "sent";
    default:
      return true;
  }
}

function snippet(content: string | null, length = 140) {
  const flat = (content ?? "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length).trimEnd()}…` : flat;
}

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

// Shared by the main list and the Archive popup - a "thread" is purely a
// client-side grouping of EmailLogEntry rows sharing a thread_id (or a
// synthetic single-message key), newest thread first.
function groupIntoThreads(entries: EmailLogEntry[]): Thread[] {
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
}

function ArchivedEmailLogDialog({
  clientsById,
  onRestored,
}: {
  clientsById: Record<number, Client>;
  onRestored: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [restoringKey, setRestoringKey] = useState<string | null>(null);
  const [restoringAll, setRestoringAll] = useState(false);
  const [purging, setPurging] = useState(false);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    listArchivedEmailLog()
      .then((entries) => setThreads(groupIntoThreads(entries)))
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  const openDialog = () => {
    setOpen(true);
    setError(null);
    setThreads(null);
    refresh();
  };

  const onRestore = async (thread: Thread) => {
    setRestoringKey(thread.key);
    setError(null);
    try {
      await restoreEmailLogEntries(thread.messages.map((m) => m.id));
      refresh();
      onRestored();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setRestoringKey(null);
    }
  };

  const onRestoreAll = async () => {
    if (!threads || threads.length === 0) return;
    setRestoringAll(true);
    setError(null);
    try {
      await restoreEmailLogEntries(threads.flatMap((t) => t.messages.map((m) => m.id)));
      refresh();
      onRestored();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setRestoringAll(false);
    }
  };

  const onDeletePermanently = async (emailLogIds: number[]) => {
    setPurging(true);
    setError(null);
    try {
      await purgeEmailLogEntries(emailLogIds);
      setConfirmDeleteKey(null);
      setConfirmDeleteAll(false);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setPurging(false);
    }
  };

  const threadToDelete = threads?.find((t) => t.key === confirmDeleteKey) ?? null;

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}>
        <ArchiveRestore />
        Archive
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive</DialogTitle>
            <DialogDescription>
              Deleted threads stay here for 7 days before being permanently removed - restore one
              to bring it back exactly as it was, or delete it for good right away.
            </DialogDescription>
          </DialogHeader>

          {threads === null ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : threads.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing archived.</p>
          ) : (
            <>
              <div className="flex items-center justify-end gap-1.5">
                <Button variant="ghost" size="sm" onClick={onRestoreAll} disabled={restoringAll}>
                  {restoringAll ? "Restoring…" : "Restore all"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => setConfirmDeleteAll(true)}
                >
                  Delete all
                </Button>
              </div>
              <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                {threads.map((thread) => {
                  const latest = thread.messages[thread.messages.length - 1];
                  return (
                    <div
                      key={thread.key}
                      className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-muted"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {thread.subject ?? "(no subject)"}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {clientsById[thread.clientId]?.name ?? "Unknown client"} · Deleted{" "}
                          {latest.archived_at ? formatRelativeTime(latest.archived_at) : ""}
                        </span>
                      </span>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={restoringKey === thread.key}
                          onClick={() => onRestore(thread)}
                        >
                          {restoringKey === thread.key ? "Restoring…" : "Restore"}
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          className="text-destructive hover:bg-destructive/10"
                          title="Delete permanently"
                          onClick={() => setConfirmDeleteKey(thread.key)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>

      <PurgeConfirmDialog
        open={confirmDeleteKey !== null}
        onOpenChange={(next) => !next && setConfirmDeleteKey(null)}
        count={1}
        itemLabel="thread"
        purging={purging}
        onConfirm={() => threadToDelete && onDeletePermanently(threadToDelete.messages.map((m) => m.id))}
      />
      <PurgeConfirmDialog
        open={confirmDeleteAll}
        onOpenChange={setConfirmDeleteAll}
        count={threads?.length ?? 0}
        itemLabel="thread"
        purging={purging}
        onConfirm={() => threads && onDeletePermanently(threads.flatMap((t) => t.messages.map((m) => m.id)))}
      />
    </>
  );
}

export default function EmailLogPage() {
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [resendEntry, setResendEntry] = useState<EmailLogEntry | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<Record<number, string>>({});
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null);

  const {
    data: entries,
    error: entriesError,
    isLoading: entriesLoading,
    mutate: mutateEntries,
  } = useSWR(emailLogKey(), () => listEmailLog());
  const { data: clientsData } = useSWR(clientsKey(), listClients);
  const error = entriesError
    ? entriesError instanceof ApiError
      ? entriesError.message
      : String(entriesError)
    : null;

  // Live pipeline state, keyed the same way `threads` groups entries
  // (thread_id, or single-${email_log_id} when there isn't one) so a live
  // run and its eventual persisted thread line up under the same key -
  // see resolveRunKey below for how that key gets resolved per event.
  const [liveRuns, setLiveRuns] = useState<Record<string, LiveRun>>({});
  const mutateEntriesRef = useRef(mutateEntries);
  mutateEntriesRef.current = mutateEntries;
  // Manual test-tool runs have no thread_id, so there's nothing to key on
  // until the first (pipeline_started) event tells us the new inbound
  // email's id - remembered per client for the rest of that run's events.
  // Only reliable within one continuous SSE connection; a reconnect
  // mid-run loses this mapping (acceptable - the manual test tool is a
  // lower-stakes case than real inbound mail, which always has a stable
  // Gmail thread_id and doesn't depend on this at all).
  const manualRunKeyByClientRef = useRef<Record<number, string>>({});

  useEffect(() => {
    let cancelled = false;

    listActiveRuns()
      .then((runs) => {
        if (cancelled) return;
        setLiveRuns((prev) => {
          const next = { ...prev };
          for (const run of runs) {
            // Only real Gmail threads (stable thread_id) can be seeded
            // this way - a manual-test run with no thread_id has no key
            // to seed until its own pipeline_started event arrives.
            if (run.thread_id && !next[run.thread_id]) {
              next[run.thread_id] = { stage: null, trace: [], draftText: "" };
            }
          }
          return next;
        });
      })
      .catch(() => {
        // Best-effort - live state will still catch up from the stream.
      });

    function resolveRunKey(event: EmailLogStreamEvent): string | null {
      const clientId = event.client_id;
      if (clientId == null) return null;
      const threadId = event.thread_id as string | null | undefined;
      if (threadId) return threadId;
      if (event.type === "pipeline_started" && typeof event.inbound_email_id === "number") {
        const key = `single-${event.inbound_email_id}`;
        manualRunKeyByClientRef.current[clientId] = key;
        return key;
      }
      return manualRunKeyByClientRef.current[clientId] ?? null;
    }

    const unsubscribe = subscribeToEmailLogStream(
      (event) => {
        const key = resolveRunKey(event);
        if (key == null) return;

        if (event.type === "pipeline_started") {
          // The new inbound row now exists in the DB - refetch so it
          // (and its thread) shows up in the list right away.
          mutateEntriesRef.current();
        }
        if (event.type === "pipeline_finished") {
          setLiveRuns((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
          });
          mutateEntriesRef.current();
          return;
        }

        setLiveRuns((prev) => {
          const existing = prev[key] ?? { stage: null, trace: [], draftText: "" };
          switch (event.type) {
            case "pipeline_started":
            case "stage_started":
              return { ...prev, [key]: { ...existing, stage: (event.stage as string) ?? "processing" } };
            case "stage_completed":
              return { ...prev, [key]: { ...existing, stage: null } };
            case "tool_call_started":
              return {
                ...prev,
                [key]: {
                  ...existing,
                  trace: [
                    ...existing.trace,
                    {
                      round: event.round as number,
                      tool: event.tool as string,
                      arguments: event.arguments as Record<string, unknown>,
                    },
                  ],
                },
              };
            case "tool_call_result": {
              const idx = existing.trace.findIndex(
                (s) => s.round === event.round && s.tool === event.tool && s.result == null
              );
              const trace =
                idx === -1
                  ? [
                      ...existing.trace,
                      { round: event.round as number, tool: event.tool as string, result: event.result as string },
                    ]
                  : existing.trace.map((s, i) => (i === idx ? { ...s, result: event.result as string } : s));
              return { ...prev, [key]: { ...existing, trace } };
            }
            case "text_delta":
              return {
                ...prev,
                [key]: { ...existing, draftText: existing.draftText + ((event.delta as string) ?? "") },
              };
            default:
              return prev;
          }
        });
      },
      (err) => {
        console.error("email-log stream error", err);
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const clientsById = useMemo(() => {
    const map: Record<number, Client> = {};
    for (const c of clientsData ?? []) map[c.id] = c;
    return map;
  }, [clientsData]);

  const allThreads = useMemo<Thread[]>(() => (entries ? groupIntoThreads(entries) : []), [entries]);
  const viewCounts = useMemo(() => {
    const counts = {} as Record<View, number>;
    for (const option of viewOptions) counts[option.value] = allThreads.filter((t) => matchesView(t, option.value)).length;
    return counts;
  }, [allThreads]);
  const threads = useMemo<Thread[]>(() => {
    const q = query.trim().toLowerCase();
    return allThreads.filter((t) => {
      if (!matchesView(t, view)) return false;
      if (!q) return true;
      const name = clientsById[t.clientId]?.name ?? "";
      return (
        name.toLowerCase().includes(q) ||
        (t.subject ?? "").toLowerCase().includes(q) ||
        t.messages.some((m) => (m.content ?? "").toLowerCase().includes(q))
      );
    });
  }, [allThreads, view, query, clientsById]);

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
  }, [view]);

  const selectedThread = threads.find((t) => t.key === selectedKey) ?? null;
  const loading = entriesLoading;

  const onSend = async (entry: EmailLogEntry, confirmResend = false) => {
    setSendingId(entry.id);
    setRowError((prev) => ({ ...prev, [entry.id]: "" }));
    try {
      await sendEmailLogEntry(entry.client_id, entry.id, confirmResend);
      setResendEntry(null);
      mutateEntries();
    } catch (e) {
      if (e instanceof ApiError && e.code === "confirm_resend") setResendEntry(entry);
      mutateEntries();
      setRowError((prev) => ({
        ...prev,
        [entry.id]: e instanceof ApiError ? e.message : String(e),
      }));
    } finally {
      setSendingId(null);
    }
  };

  const onResolve = async (entry: EmailLogEntry) => {
    setResolvingId(entry.id);
    setRowError((prev) => ({ ...prev, [entry.id]: "" }));
    try {
      await resolveEmailLogEntry(entry.client_id, entry.id);
      mutateEntries();
    } catch (e) {
      setRowError((prev) => ({
        ...prev,
        [entry.id]: e instanceof ApiError ? e.message : String(e),
      }));
    } finally {
      setResolvingId(null);
    }
  };

  // Inline composer: saves edits, and Send saves first when there are any.
  const onSaveDraft = async (entry: EmailLogEntry, update: { subject: string; content: string }) => {
    await updateEmailLogEntry(entry.client_id, entry.id, update);
    await mutateEntries();
  };

  const onSaveAndSend = async (entry: EmailLogEntry, update: { subject: string; content: string } | null) => {
    if (update) {
      setRowError((prev) => ({ ...prev, [entry.id]: "" }));
      try {
        await updateEmailLogEntry(entry.client_id, entry.id, update);
      } catch (e) {
        setRowError((prev) => ({ ...prev, [entry.id]: e instanceof ApiError ? e.message : String(e) }));
        return;
      }
    }
    await onSend(entry);
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
    const outcomes = await Promise.allSettled(selectedDrafts.map((m) => sendEmailLogEntry(m.client_id, m.id)));
    setRowError((prev) => {
      const next = { ...prev };
      outcomes.forEach((outcome, index) => {
        if (outcome.status === "rejected") next[selectedDrafts[index].id] = String(outcome.reason.message ?? outcome.reason);
      });
      return next;
    });
    setBulkSending(false);
    setSelectedKeys(new Set());
    mutateEntries();
  };

  const selectedMessageIds = useMemo(
    () =>
      threads
        .filter((t) => selectedKeys.has(t.key))
        .flatMap((t) => t.messages.map((m) => m.id)),
    [threads, selectedKeys]
  );

  const onBulkDelete = async () => {
    setBulkDeleting(true);
    setBulkDeleteError(null);
    try {
      await bulkDeleteEmailLogEntries(selectedMessageIds);
      setConfirmingDelete(false);
      setSelectedKeys(new Set());
      mutateEntries();
    } catch (e) {
      setBulkDeleteError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBulkDeleting(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-6.5rem)] w-full flex-col gap-6 md:h-[calc(100vh-3rem)] xl:h-[calc(100vh-5rem)]">
      <Dialog open={resendEntry !== null} onOpenChange={(open) => !open && sendingId === null && setResendEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send this email again?</DialogTitle>
            <DialogDescription>
              The mailbox did not confirm the earlier attempt. Sending again could create a duplicate if it was already delivered.
            </DialogDescription>
          </DialogHeader>
          {resendEntry && rowError[resendEntry.id] && <p className="text-sm text-muted-foreground">{rowError[resendEntry.id]}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={sendingId !== null} onClick={() => setResendEntry(null)}>Cancel</Button>
            <Button disabled={sendingId !== null} onClick={() => resendEntry && onSend(resendEntry, true)}>
              {sendingId !== null ? "Sending…" : "Send again"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-4xl leading-tight font-thin tracking-tight [font-family:var(--font-denton)] md:text-5xl">
            Email log
          </h1>
          <p className="text-sm text-muted-foreground">
            Every conversation with your clients, what Compozor sent, and what&apos;s waiting on you.
          </p>
        </div>
        <ArchivedEmailLogDialog clientsById={clientsById} onRestored={() => mutateEntries()} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter threads" className="flex flex-wrap items-center gap-1">
          {viewOptions.map((opt) => {
            const count = viewCounts[opt.value] ?? 0;
            const active = view === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(opt.value)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[0.8125rem] transition-colors",
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {opt.value === "review" && count > 0 && !active && <span className="size-1.5 rounded-full bg-destructive" />}
                {opt.value === "drafts" && count > 0 && !active && <span className="size-1.5 rounded-full bg-warning" />}
                {opt.label}
                {!loading && (
                  <span className={cn("tabular-nums", active ? "text-background/70" : "text-muted-foreground/70")}>{count}</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients, subjects, messages"
            aria-label="Search email"
            className="h-9 pl-9"
          />
        </div>
      </div>

      <Dialog
        open={confirmingDelete}
        onOpenChange={(open) => !bulkDeleting && setConfirmingDelete(open)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedKeys.size} thread{selectedKeys.size === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              {selectedKeys.size === 1 ? "This thread" : "These threads"} will be archived for 7
              days, then deleted permanently.
            </DialogDescription>
          </DialogHeader>
          {bulkDeleteError && <p className="text-sm text-destructive">{bulkDeleteError}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmingDelete(false)}
              disabled={bulkDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={onBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? "Deleting…" : `Delete ${selectedKeys.size}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex min-h-0 flex-1 flex-col gap-6 xl:flex-row">
        <div
          className={cn(
            "w-full flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:flex md:max-h-80 md:shrink-0 xl:max-h-none xl:w-[24rem]",
            mobileDetailOpen ? "hidden md:flex" : "flex"
          )}
        >
          <div className="flex min-h-12 items-center gap-3 border-b border-border px-4">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              className="size-3.5 shrink-0 accent-foreground"
              aria-label="Select all"
            />
            {selectedKeys.size > 0 ? (
              <div className="flex flex-1 items-center justify-between gap-2">
                <span className="text-[0.8125rem] text-foreground">{selectedKeys.size} selected</span>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={selectedDrafts.length === 0 || bulkSending}
                    onClick={onBulkSend}
                  >
                    <Send />
                    {bulkSending
                      ? "Sending…"
                      : `Send ${selectedDrafts.length} draft${selectedDrafts.length === 1 ? "" : "s"}`}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Delete selected threads"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
            ) : (
              <span className="text-[0.8125rem] text-muted-foreground">
                {loading ? "Loading…" : `${threads.length} thread${threads.length === 1 ? "" : "s"}`}
              </span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading &&
              Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2 border-b border-border/60 px-4 py-3.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            {!loading &&
              threads.map((thread) => (
                <ThreadRow
                  key={thread.key}
                  thread={thread}
                  client={clientsById[thread.clientId]}
                  selected={thread.key === selectedKey}
                  checked={selectedKeys.has(thread.key)}
                  selecting={selectedKeys.size > 0}
                  onSelect={() => {
                    setSelectedKey(thread.key);
                    setMobileDetailOpen(true);
                  }}
                  onCheck={() => toggleThreadSelection(thread.key)}
                  live={liveRuns[thread.key]}
                />
              ))}
            {!loading && threads.length === 0 && (
              <p className="animate-fade-in px-4 py-10 text-center text-sm text-muted-foreground">
                {query ? "No threads match your search." : view === "all" ? "No emails yet." : "Nothing here right now."}
              </p>
            )}
          </div>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto rounded-xl bg-card ring-1 ring-foreground/10 md:block",
            mobileDetailOpen ? "block" : "hidden"
          )}
        >
          {loading ? (
            <div className="flex flex-col gap-5 p-6 sm:p-8">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-72" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : selectedThread ? (
            <ThreadView
              key={selectedThread.key}
              thread={selectedThread}
              client={clientsById[selectedThread.clientId]}
              live={liveRuns[selectedThread.key]}
              sendingId={sendingId}
              resolvingId={resolvingId}
              rowError={rowError}
              onBack={() => setMobileDetailOpen(false)}
              onSaveDraft={onSaveDraft}
              onSaveAndSend={onSaveAndSend}
              onResolve={onResolve}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center animate-fade-in">
              <Mail className="size-5 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">Select a thread to read it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const toneText: Record<MessageTone, string> = {
  issue: "text-destructive",
  warning: "text-warning-foreground",
  received: "text-foreground",
  sent: "text-muted-foreground",
  muted: "text-muted-foreground",
};

function StateLabel({ state, className }: { state: { label: string; tone: MessageTone }; className?: string }) {
  const Icon =
    state.tone === "received" ? ArrowDownLeft : state.tone === "sent" ? (state.label === "Auto-sent" ? Sparkles : ArrowUpRight) : null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-medium", toneText[state.tone], className)}>
      {Icon ? (
        <Icon className="size-3" />
      ) : (
        <span
          className={cn(
            "size-1.5 rounded-full",
            state.tone === "issue" ? "bg-destructive" : state.tone === "warning" ? "bg-warning" : "bg-muted-foreground/50"
          )}
        />
      )}
      {state.label}
    </span>
  );
}

function ThreadRow({
  thread,
  client,
  selected,
  checked,
  selecting,
  onSelect,
  onCheck,
  live,
}: {
  thread: Thread;
  client?: Client;
  selected: boolean;
  checked: boolean;
  selecting: boolean;
  onSelect: () => void;
  onCheck: () => void;
  live?: LiveRun;
}) {
  const latest = thread.messages[thread.messages.length - 1];
  const state = threadState(thread);
  const attachments = thread.messages.reduce((n, m) => n + m.documents.length, 0);
  const author = latest.direction === "inbound" ? (client?.name?.split(" ")[0] ?? "Client") : "You";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-current={selected || undefined}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
      className={cn(
        "group/row relative flex w-full cursor-pointer items-start gap-3 border-b border-border/60 px-4 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        selected && "bg-muted/50 hover:bg-muted/50 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-foreground"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={onCheck}
        aria-label={`Select conversation with ${client?.name ?? `#${thread.clientId}`}`}
        className={cn(
          "mt-0.5 size-3.5 shrink-0 accent-foreground transition-opacity",
          checked || selecting ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-medium">{client?.name ?? `Client #${thread.clientId}`}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatRelativeTime(latest.created_at)}</span>
        </div>
        <span className="truncate text-[0.8125rem] text-foreground/85">{thread.subject || "(no subject)"}</span>
        <span className="line-clamp-1 text-xs text-muted-foreground">
          <span className="text-foreground/60">{author}:</span> {snippet(latest.content) || "No message body."}
        </span>
        <div className="mt-1 flex items-center gap-3">
          {live ? (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
              <Loader2 className="size-3 animate-spin" />
              {STAGE_LABELS[live.stage ?? ""] ?? "Processing…"}
            </span>
          ) : (
            <StateLabel state={state} />
          )}
          {attachments > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Paperclip className="size-3" />
              {attachments}
            </span>
          )}
          {thread.messages.length > 1 && (
            <span className="text-xs text-muted-foreground">{thread.messages.length} messages</span>
          )}
        </div>
      </div>
    </div>
  );
}

function ThreadView({
  thread,
  client,
  live,
  sendingId,
  resolvingId,
  rowError,
  onBack,
  onSaveDraft,
  onSaveAndSend,
  onResolve,
}: {
  thread: Thread;
  client?: Client;
  live?: LiveRun;
  sendingId: number | null;
  resolvingId: number | null;
  rowError: Record<number, string>;
  onBack: () => void;
  onSaveDraft: (entry: EmailLogEntry, update: { subject: string; content: string }) => Promise<void>;
  onSaveAndSend: (entry: EmailLogEntry, update: { subject: string; content: string } | null) => Promise<void>;
  onResolve: (entry: EmailLogEntry) => void;
}) {
  // Older messages collapse to one line; the latest two, and anything that
  // needs a human (drafts, unresolved reviews), stay open.
  const alwaysOpen = (m: EmailLogEntry, i: number) =>
    i >= thread.messages.length - 2 || m.status === "draft" || (m.status === "needs_human_attention" && !m.resolved_at);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const started = thread.messages[0].created_at;

  return (
    <div className="flex flex-col animate-fade-in">
      <header className="z-10 flex flex-col gap-3 border-b border-border/70 bg-card px-4 py-4 sm:sticky sm:top-0 sm:px-6 sm:py-5 lg:px-8">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden"
        >
          <ArrowLeft className="size-3.5" />
          All threads
        </button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 className="text-xl leading-snug font-light tracking-tight text-balance">{thread.subject || "(no subject)"}</h2>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <Link href={`/clients/${thread.clientId}`} className="text-foreground hover:underline">
                {client?.name ?? `Client #${thread.clientId}`}
              </Link>
              {client?.email && (
                <>
                  <span aria-hidden className="text-muted-foreground/50">·</span>
                  {client.email}
                </>
              )}
              <span aria-hidden className="text-muted-foreground/50">·</span>
              {thread.messages.length} message{thread.messages.length === 1 ? "" : "s"} since {formatDate(started)}
            </p>
          </div>
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={`/clients/${thread.clientId}`} />}>
            Open client
            <ArrowUpRight />
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        {thread.messages.map((entry, i) =>
          alwaysOpen(entry, i) || expanded.has(entry.id) ? (
            <MessageItem
              key={entry.id}
              entry={entry}
              client={client}
              sending={sendingId === entry.id}
              resolving={resolvingId === entry.id}
              error={rowError[entry.id]}
              onSaveDraft={(update) => onSaveDraft(entry, update)}
              onSaveAndSend={(update) => onSaveAndSend(entry, update)}
              onResolve={() => onResolve(entry)}
            />
          ) : (
            <button
              key={entry.id}
              type="button"
              onClick={() => setExpanded((prev) => new Set(prev).add(entry.id))}
              className="flex w-full items-center gap-3 rounded-xl bg-card px-4 py-3 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <span className="shrink-0 text-[0.8125rem] font-medium">
                {entry.direction === "inbound" ? client?.name ?? "Client" : "Your firm"}
              </span>
              <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-muted-foreground">{snippet(entry.content, 200)}</span>
              {entry.documents.length > 0 && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="shrink-0 text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
            </button>
          )
        )}
        {live && <LiveRunCard run={live} />}
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function MessageItem({
  entry,
  client,
  sending,
  resolving,
  error,
  onSaveDraft,
  onSaveAndSend,
  onResolve,
}: {
  entry: EmailLogEntry;
  client?: Client;
  sending: boolean;
  resolving: boolean;
  error?: string;
  onSaveDraft: (update: { subject: string; content: string }) => Promise<void>;
  onSaveAndSend: (update: { subject: string; content: string } | null) => Promise<void>;
  onResolve: () => void;
}) {
  const inbound = entry.direction === "inbound";
  const state = messageState(entry);
  const senderName = inbound ? client?.name ?? entry.from_email ?? "Client" : "Your firm";
  const address = inbound ? entry.from_email : entry.to_email;
  const unresolved = entry.status === "needs_human_attention" && !entry.resolved_at;
  const isDraft = entry.status === "draft";

  return (
    <article
      className={cn(
        "flex min-w-0 flex-col gap-5 rounded-xl bg-card p-4 ring-1 ring-foreground/15 sm:p-5",
        isDraft && "ring-warning/60"
      )}
    >
      <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-b border-border/60 pb-4 sm:grid-cols-[2rem_minmax(0,1fr)_auto]">
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-medium text-foreground"
        >
          {inbound ? initials(senderName) || "C" : <ArrowUpRight className="size-3.5" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium">{senderName}</span>
            {(inbound || entry.automation_level_at_decision) && (
              <span className="text-xs text-muted-foreground">
                {inbound ? "Client" : entry.autosent ? "Sent automatically by Compozor" : "Prepared by Compozor"}
              </span>
            )}
          </div>
          {address && (
            <span className="break-all text-xs text-muted-foreground">
              {inbound ? "From" : "To"} {address}
            </span>
          )}
        </div>
        <div className="col-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-start-auto sm:flex-col sm:items-end">
          <AutomationDetail entry={entry}>
            <StateLabel state={state} />
          </AutomationDetail>
          <time dateTime={entry.created_at} title={new Date(entry.created_at).toLocaleString()} className="text-xs text-muted-foreground tabular-nums">
            {formatDateTime(entry.created_at)}
          </time>
        </div>
      </div>

      {entry.status === "needs_human_attention" && entry.escalation_reason && (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-lg px-4 py-3 text-sm sm:flex-row sm:items-start sm:justify-between",
            unresolved ? "bg-destructive/[0.06] text-foreground" : "bg-muted/60 text-muted-foreground"
          )}
        >
          <div className="flex items-start gap-2.5">
            {unresolved ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0" />
            )}
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{unresolved ? "Needs your review" : "Reviewed"}</span>
              <span className="text-pretty whitespace-pre-wrap text-muted-foreground">{entry.escalation_reason}</span>
            </div>
          </div>
          {unresolved && (
            <Button size="sm" variant="outline" className="shrink-0 bg-card" disabled={resolving} onClick={onResolve}>
              <Check />
              {resolving ? "Resolving…" : "Mark resolved"}
            </Button>
          )}
        </div>
      )}

      {isDraft ? (
        <DraftComposer entry={entry} sending={sending} onSave={onSaveDraft} onSend={onSaveAndSend} />
      ) : inbound && entry.has_html ? (
        <div className="min-w-0 sm:pl-11">
          <EmailHtmlFrame
            cacheKey={["email-html", entry.id]}
            load={() => getEmailLogHtml(entry.id)}
            fallback={<EmailBody content={entry.content} />}
          />
        </div>
      ) : (
        <EmailBody content={entry.content} className="max-w-prose sm:pl-11" />
      )}

      {entry.documents.length > 0 && (
        <div className={cn("flex flex-col gap-2", !isDraft && "sm:pl-11")}>
          <span className="text-xs text-muted-foreground">
            {entry.documents.length} attachment{entry.documents.length === 1 ? "" : "s"}
          </span>
          <div className="grid gap-2 sm:grid-cols-2">
            {entry.documents.map((doc) => (
              <AttachmentTile key={doc.id} doc={doc} />
            ))}
          </div>
        </div>
      )}

      {error && <p className={cn("text-xs text-destructive", !isDraft && "sm:pl-11")}>{error}</p>}
    </article>
  );
}

function DraftComposer({
  entry,
  sending,
  onSave,
  onSend,
}: {
  entry: EmailLogEntry;
  sending: boolean;
  onSave: (update: { subject: string; content: string }) => Promise<void>;
  onSend: (update: { subject: string; content: string } | null) => Promise<void>;
}) {
  const [subject, setSubject] = useState(entry.subject ?? "");
  const [content, setContent] = useState(entry.content ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const dirty = subject !== (entry.subject ?? "") || content.trim() !== (entry.content ?? "").trim();
  const locked = entry.delivery_state === "sending" || entry.delivery_state === "uncertain";
  const busy = saving || sending;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave({ subject, content });
      setSavedAt(Date.now());
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-lg border border-input bg-card px-3">
        <label htmlFor={`draft-subject-${entry.id}`} className="shrink-0 text-xs text-muted-foreground">
          Subject
        </label>
        <input
          id={`draft-subject-${entry.id}`}
          value={subject}
          disabled={locked || busy}
          onChange={(e) => setSubject(e.target.value)}
          className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none disabled:opacity-60"
        />
      </div>
      <EmailDraftEditor content={content} onChange={setContent} className="bg-card" />
      {entry.autosend_error && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          Held for review: {entry.autosend_error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {locked
            ? "Delivery in progress. Editing is paused."
            : dirty
              ? "Unsaved changes"
              : savedAt
                ? "Draft saved"
                : "Not sent yet. Edit, then send when ready."}
        </span>
        <div className="flex items-center gap-2">
          {dirty && !locked && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setSubject(entry.subject ?? "");
                setContent(entry.content ?? "");
              }}
            >
              Discard changes
            </Button>
          )}
          <Button variant="outline" size="sm" className="bg-card" disabled={!dirty || busy || locked || !content.trim()} onClick={save}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
          <Button size="sm" disabled={busy || !content.trim() || entry.delivery_state === "sending"} onClick={() => onSend(dirty ? { subject, content } : null)}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            {sending ? "Sending…" : dirty ? "Save & send" : "Send"}
          </Button>
        </div>
      </div>
      {saveError && <p className="text-xs text-destructive">{saveError}</p>}
    </div>
  );
}

function AttachmentTile({ doc }: { doc: DocumentOut }) {
  const name = doc.resolved_display_name || doc.original_filename || "Attachment";
  const detail = [doc.classified_type !== name ? doc.classified_type : null, doc.year].filter(Boolean).join(" · ");
  const body = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <FileText className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[0.8125rem] font-medium">{name}</span>
        <span className="truncate text-xs text-muted-foreground">{doc.download_url ? detail || "Open file" : "File unavailable"}</span>
      </span>
      {doc.download_url && <Download className="size-4 shrink-0 text-muted-foreground transition-colors group-hover/file:text-foreground" />}
    </>
  );
  const className = "group/file flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5";
  if (!doc.download_url) return <div className={cn(className, "opacity-70")}>{body}</div>;
  return (
    <a href={doc.download_url} target="_blank" rel="noopener noreferrer" title={name} className={cn(className, "transition-colors hover:bg-muted/40")}>
      {body}
    </a>
  );
}

// Why an automated decision went the way it did, on hover of the state label.
function AutomationDetail({ entry, children }: { entry: EmailLogEntry; children: React.ReactNode }) {
  const lines = [
    entry.automation_level_at_decision && (entry.autosent ? "Sent automatically" : "Held for staff review"),
    entry.autosend_confidence !== null && `Confidence ${entry.autosend_confidence.toFixed(2)}${entry.autosend_threshold !== null ? ` (threshold ${entry.autosend_threshold.toFixed(2)})` : ""}`,
    entry.safety_checks && (entry.safety_checks.passed ? "Safety review passed" : "Safety review: staff review required"),
    entry.safety_checks?.reason,
  ].filter(Boolean) as string[];
  if (lines.length === 0) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-default" />}>{children}</TooltipTrigger>
      <TooltipContent className="flex-col items-start gap-0.5">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}

// A pseudo-message for a thread currently mid-pipeline - there's no persisted
// EmailLog row yet (the draft/autosend is created when the pipeline
// finishes), so this renders from live SSE state until the list refetches.
function LiveRunCard({ run }: { run: LiveRun }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-accent/[0.06] p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-accent">
        <Loader2 className="size-3.5 animate-spin" />
        {STAGE_LABELS[run.stage ?? ""] ?? "Processing…"}
      </div>
      {run.draftText && (
        <p className="whitespace-pre-wrap text-sm text-foreground/70">
          <Linkify text={run.draftText} />
        </p>
      )}
      {run.trace.length > 0 && <AgentActivityDisclosure trajectory={run.trace} defaultOpen />}
    </div>
  );
}
