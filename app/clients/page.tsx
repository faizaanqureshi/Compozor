"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { clientsKey, emailLogKey } from "@/lib/swr-keys";
import {
  AlertTriangle,
  ArchiveRestore,
  ArrowUp,
  Check,
  ChevronRight,
  Download,
  Loader2,
  Mail,
  Package as PackageIcon,
  Plus,
  Search,
  Trash2,
  Workflow as WorkflowIcon,
  X as XIcon,
} from "lucide-react";
import {
  ApiError,
  ChecklistSummary,
  Client,
  ClientPackage,
  ClientStatus,
  ClientWorkflowStatus,
  EmailLogEntry,
  WorkflowRunStatus,
  bulkDeleteClients,
  createClient,
  downloadClientDocumentsZip,
  listArchivedClients,
  listClients,
  listEmailLog,
  listInboxConnections,
  restoreClients,
  sendChecklistReminder,
  unassignPackageFromClient,
  unassignWorkflowFromClient,
  watchInboxConnection,
} from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ClientImportModal } from "@/components/client-import-modal";
import { WorkflowFormDialog } from "@/components/workflow-form-dialog";
import { PackageFormDialog } from "@/components/package-form-dialog";
import { AssignWorkflowDialog } from "@/components/assign-workflow-dialog";
import { AssignPackageDialog } from "@/components/assign-package-dialog";

type WorkflowTone = "success" | "warning" | "attention" | "neutral";
type SortKey = "name" | "email" | "documents" | "activity" | "status";
type Sort = { key: SortKey; direction: "asc" | "desc" };

const toneClasses: Record<WorkflowTone, string> = {
  success: "bg-success",
  warning: "bg-amber-500",
  attention: "bg-destructive",
  neutral: "bg-muted-foreground/40",
};

// null status = assigned but never run yet (checklist not complete).
// Reuses the same tone-dot idiom as the Status column above rather than
// introducing a second visual language for what's conceptually the same
// "status" concept - see toneClasses.
function workflowStatusTone(status: WorkflowRunStatus | null): WorkflowTone {
  switch (status) {
    case "completed":
      return "success";
    case "needs_review":
    case "failed":
      return "attention";
    case "running":
    case "queued":
      return "warning";
    case null:
      return "neutral";
  }
}

function workflowStatusLabel(status: WorkflowRunStatus | null): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "needs_review":
      return "Needs review";
    case "failed":
      return "Failed";
    case "running":
      return "Running";
    case "queued":
      return "Queued";
    case null:
      return "Not started";
  }
}

function describeActivity(entry: EmailLogEntry) {
  const needsAttention = entry.status === "needs_human_attention";
  const isOutbound = entry.direction === "outbound";

  const label = needsAttention
    ? "Needs your review"
    : isOutbound
      ? entry.status === "sent"
        ? "Reminder sent"
        : "Reply drafted"
      : "Email received";

  const Icon = needsAttention ? AlertTriangle : isOutbound ? Check : Mail;
  const iconTone = needsAttention
    ? "bg-amber-500/10 text-amber-600 dark:text-amber-500"
    : isOutbound
      ? "bg-accent/15 text-accent"
      : "bg-muted text-muted-foreground";

  return { label, Icon, iconTone };
}

function outstandingCount(summary?: ChecklistSummary) {
  return summary ? summary.total - summary.received : 0;
}

function deriveWorkflowStatus(
  client: Client,
  summary?: ChecklistSummary
): { label: string; tone: WorkflowTone } {
  if (client.status === "inactive") return { label: "Inactive", tone: "neutral" };
  if (summary && summary.total > 0) {
    if (summary.wrong > 0) return { label: "Under review", tone: "warning" };
    if (summary.missing > 0) return { label: "Awaiting docs", tone: "warning" };
    return { label: "Complete", tone: "success" };
  }
  return { label: "Active", tone: "success" };
}

export default function ClientsPage() {
  const router = useRouter();
  const {
    data: clients,
    error: clientsError,
    isLoading: clientsLoading,
    mutate: mutateClients,
  } = useSWR(clientsKey(), listClients);
  const {
    data: emailLog,
    error: emailLogError,
    isLoading: emailLogLoading,
    mutate: mutateEmailLog,
  } = useSWR(emailLogKey(), () => listEmailLog());
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "name", direction: "asc" });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [status, setStatus] = useState<ClientStatus>("active");
  const [submitting, setSubmitting] = useState(false);

  const [reminderState, setReminderState] = useState<
    Record<number, "sending" | "sent">
  >({});

  const [gmailBanner, setGmailBanner] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);

  // The Gmail OAuth callback always redirects the browser here (see
  // FRONTEND_CONTEXT.md "Gmail connection"), whether the connect flow was
  // started from onboarding or from settings. Starting push notifications
  // isn't automatic on connect, so this is also the one place responsible
  // for kicking that off.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const provider = params.has("outlook") ? "outlook" : "gmail";
    const gmailStatus = params.get(provider);
    if (!gmailStatus) return;

    const email = params.get("email");
    const reason = params.get("reason");
    window.history.replaceState({}, "", window.location.pathname);

    (async () => {
      if (gmailStatus === "connected") {
        try {
          const connections = await listInboxConnections();
          const match = email
            ? connections.find(
                (c) => (c.provider ?? "gmail") === provider && c.email_address.toLowerCase() === email.toLowerCase()
              )
            : connections[0];
          if (match && provider === "gmail") await watchInboxConnection(match.id);
          setGmailBanner({
            type: "success",
            message: `Connected ${email ?? "your mailbox"}.`,
          });
        } catch (e) {
          setGmailBanner({
            type: "error",
            message: e instanceof ApiError ? e.message : String(e),
          });
        }
      } else if (gmailStatus === "error") {
        setGmailBanner({
          type: "error",
          message: reason ?? "Failed to connect mailbox.",
        });
      }
    })();
  }, []);

  const fetchError = clientsError
    ? clientsError instanceof ApiError
      ? clientsError.message
      : String(clientsError)
    : emailLogError
      ? emailLogError instanceof ApiError
        ? emailLogError.message
        : String(emailLogError)
      : null;

  const clientsById = useMemo(() => {
    const map: Record<number, Client> = {};
    for (const c of clients ?? []) map[c.id] = c;
    return map;
  }, [clients]);

  const lastActivity = useMemo(() => {
    const next: Record<number, string> = {};
    for (const entry of emailLog ?? []) {
      const existing = next[entry.client_id];
      if (!existing || entry.created_at > existing) {
        next[entry.client_id] = entry.created_at;
      }
    }
    return next;
  }, [emailLog]);

  const waiting = useMemo(() => {
    return (clients ?? [])
      .map((c) => {
        const items = c.checklist_summary.items.filter(
          (i) => i.status === "missing" || i.status === "wrong"
        );
        return { client: c, items };
      })
      .filter((w) => w.items.length > 0);
  }, [clients]);

  const recentActivity = useMemo(() => {
    const sorted = [...(emailLog ?? [])].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    const byClient = new Map<number, EmailLogEntry[]>();
    for (const entry of sorted) {
      const list = byClient.get(entry.client_id);
      if (list) list.push(entry);
      else byClient.set(entry.client_id, [entry]);
    }
    const groups = Array.from(byClient.entries()).map(([clientId, entries]) => {
      const counts: { label: string; count: number }[] = [];
      for (const entry of entries) {
        const { label } = describeActivity(entry);
        const existing = counts.find((c) => c.label === label);
        if (existing) existing.count += 1;
        else counts.push({ label, count: 1 });
      }
      return { clientId, entries, counts, latest: entries[0].created_at };
    });
    groups.sort((a, b) => b.latest.localeCompare(a.latest));
    return groups.slice(0, 6);
  }, [emailLog]);

  const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());
  const toggleExpanded = (clientId: number) => {
    setExpandedClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  // Batch client selection, for bulk actions (currently just "assign
  // workflow") - lives on this table rather than on the Workflows page, so
  // picking who a workflow runs for happens in the same place you're
  // already looking at/sorting/searching clients.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleSelected = (clientId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const stats = useMemo(() => {
    const counts = { active: 0, inactive: 0 };
    for (const c of clients ?? []) counts[c.status]++;
    return {
      total: clients?.length ?? 0,
      active: counts.active,
      inactive: counts.inactive,
    };
  }, [clients]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = (clients ?? []).filter(
      (c) =>
        !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
    );
    const dir = sort.direction === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "email":
          return a.email.localeCompare(b.email) * dir;
        case "documents":
          return (
            (outstandingCount(a.checklist_summary) - outstandingCount(b.checklist_summary)) *
            dir
          );
        case "activity":
          return (
            (lastActivity[a.id] ?? "").localeCompare(lastActivity[b.id] ?? "") * dir
          );
        case "status":
          return (
            deriveWorkflowStatus(a, a.checklist_summary).label.localeCompare(
              deriveWorkflowStatus(b, b.checklist_summary).label
            ) * dir
          );
      }
    });
  }, [clients, lastActivity, search, sort]);

  const allVisibleSelected = rows.length > 0 && rows.every((c) => selectedIds.has(c.id));
  const toggleSelectAll = () => {
    setSelectedIds(allVisibleSelected ? new Set() : new Set(rows.map((c) => c.id)));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createClient({
        name,
        email,
        phone: phone.trim() || undefined,
        company_name: companyName.trim() || undefined,
        status,
      });
      setName("");
      setEmail("");
      setPhone("");
      setCompanyName("");
      setStatus("active");
      setOpen(false);
      mutateClients();
      mutateEmailLog();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const loading = clientsLoading || emailLogLoading;

  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const onDownloadZip = async (e: React.MouseEvent, clientId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDownloadingId(clientId);
    setError(null);
    try {
      await downloadClientDocumentsZip(clientId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setDownloadingId(null);
    }
  };

  const sendReminder = async (e: React.MouseEvent, clientId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setReminderState((prev) => ({ ...prev, [clientId]: "sending" }));
    try {
      await sendChecklistReminder(clientId);
      setReminderState((prev) => ({ ...prev, [clientId]: "sent" }));
    } catch {
      setReminderState((prev) => {
        const next = { ...prev };
        delete next[clientId];
        return next;
      });
    }
  };

  return (
    <div className="relative isolate flex min-h-full w-full flex-col gap-8">
      {gmailBanner && (
        <div
          className={cn(
            "flex items-center justify-between gap-4 rounded-lg border px-4 py-3 text-sm",
            gmailBanner.type === "success"
              ? "border-accent/30 bg-accent/[0.06] text-accent"
              : "border-destructive/30 bg-destructive/[0.06] text-destructive"
          )}
        >
          <span>{gmailBanner.message}</span>
          <button
            onClick={() => setGmailBanner(null)}
            className="text-xs font-medium underline-offset-4 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-thin tracking-tight [font-family:var(--font-denton)] sm:text-5xl md:text-6xl">
            Clients
          </h1>
          {loading ? (
            <Skeleton className="h-4 w-56" />
          ) : (
            <p className="text-sm text-muted-foreground">
              {waiting.length > 0
                ? `Waiting on ${waiting.reduce((n, w) => n + w.items.length, 0)} document${
                    waiting.reduce((n, w) => n + w.items.length, 0) === 1 ? "" : "s"
                  } from ${waiting.length} client${waiting.length === 1 ? "" : "s"}.`
                : `${stats.active} active client${stats.active === 1 ? "" : "s"} · all caught up.`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
        <WorkflowFormDialog onSaved={() => {}} variant="outline" />
        <PackageFormDialog onSaved={() => {}} variant="outline" />
        <ClientImportModal onImported={() => mutateClients()} />
        <ArchivedClientsDialog onRestored={() => mutateClients()} />
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus />
            Add client
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <DialogHeader>
                <DialogTitle>Add client</DialogTitle>
                <DialogDescription>
                  Add a new client to your organization.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="client-name">Name</Label>
                  <Input
                    id="client-name"
                    required
                    placeholder="Jane Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="client-email">Email</Label>
                  <Input
                    id="client-email"
                    required
                    type="email"
                    placeholder="jane@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="client-phone">Phone number</Label>
                  <Input
                    id="client-phone"
                    type="tel"
                    placeholder="Optional..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="client-company">Company name</Label>
                  <Input
                    id="client-company"
                    placeholder="Optional..."
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="client-status">Status</Label>
                  <select
                    id="client-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ClientStatus)}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Adding…" : "Add client"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {(error || fetchError) && !open && (
        <p className="text-sm text-destructive">{error || fetchError}</p>
      )}

      <section className="flex flex-col gap-4">
        {!loading && waiting.length === 0 ? (
          <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-chart-2 uppercase dark:text-chart-4">
            <Check className="size-3.5" />
            No action needed
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-amber-600 uppercase dark:text-amber-500">
            <AlertTriangle className="size-3.5" />
            Waiting for action
          </div>
        )}
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-2">
            {loading &&
              Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-[4.75rem] w-full rounded-xl" />
              ))}
            {!loading &&
              waiting.map(({ client, items }, i) => {
                const state = reminderState[client.id];
                return (
                  <div
                    key={client.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => router.push(`/clients/${client.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push(`/clients/${client.id}`);
                    }}
                    style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                    className="group/waiting flex cursor-pointer animate-blur-in-sm items-center justify-between gap-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3.5 transition-colors hover:bg-amber-500/[0.07]"
                  >
                    <div className="flex flex-col gap-1.5">
                      <span className="font-thin underline-offset-4 [font-family:var(--font-denton)] group-hover/waiting:underline">
                        {client.name}
                      </span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {items.slice(0, 3).map((i) => (
                          <span
                            key={i.id}
                            className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-300"
                          >
                            {i.doc_type_needed}
                          </span>
                        ))}
                        {items.length > 3 && (
                          <span className="text-xs text-muted-foreground">
                            +{items.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        disabled={state === "sending" || state === "sent"}
                        onClick={(e) => sendReminder(e, client.id)}
                        className="rounded-full border border-amber-600/30 px-3 py-1.5 text-xs font-medium text-amber-700 opacity-0 transition-opacity group-hover/waiting:opacity-100 hover:bg-amber-500/10 disabled:opacity-100 dark:text-amber-400"
                      >
                        {state === "sent"
                          ? "Sent"
                          : state === "sending"
                            ? "Sending…"
                            : "Send reminder"}
                      </button>
                      <ChevronRight className="size-4 text-amber-700/50 dark:text-amber-400/50" />
                    </div>
                  </div>
                );
              })}
            {!loading && waiting.length === 0 && (
              <p className="animate-blur-in-sm py-3 text-sm text-muted-foreground">
                Nothing outstanding — every client is caught up.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Recent activity
        </div>
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <div className="relative flex flex-col">
            {loading && (
              <div className="flex flex-col gap-3 py-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            )}
            {!loading && recentActivity.length > 1 && (
              <div className="absolute top-2 bottom-2 left-3.5 w-px bg-border/70" />
            )}
            {!loading &&
              recentActivity.map((group, i) => (
                <ActivityGroupRow
                  key={group.clientId}
                  group={group}
                  expanded={expandedClients.has(group.clientId)}
                  onToggle={() => toggleExpanded(group.clientId)}
                  clientName={clientsById[group.clientId]?.name ?? "Unknown client"}
                  delayMs={60 + Math.min(i, 6) * 40}
                />
              ))}
            {!loading && recentActivity.length === 0 && (
              <p className="animate-blur-in-sm py-3 text-sm text-muted-foreground">No activity yet.</p>
            )}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            All clients
          </div>
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-foreground/50" />
            <Input
              placeholder="Search clients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full border-none bg-muted/60 pl-8 shadow-none focus-visible:ring-1 focus-visible:ring-ring/30 sm:w-56"
            />
          </div>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg bg-accent/[0.08] px-4 py-2.5 text-sm animate-blur-in-sm">
            <span className="font-medium text-accent">
              {selectedIds.size} client{selectedIds.size === 1 ? "" : "s"} selected
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <AssignPackageDialog
                clientIds={Array.from(selectedIds)}
                onAssigned={() => setSelectedIds(new Set())}
                trigger={
                  <Button variant="secondary" size="sm">
                    <PackageIcon />
                    Assign package
                  </Button>
                }
              />
              <AssignWorkflowDialog
                clientIds={Array.from(selectedIds)}
                onAssigned={() => setSelectedIds(new Set())}
                trigger={
                  <Button variant="secondary" size="sm">
                    <WorkflowIcon />
                    Assign workflow
                  </Button>
                }
              />
              <BulkDeleteClientsButton
                clientIds={Array.from(selectedIds)}
                onDeleted={() => {
                  setSelectedIds(new Set());
                  mutateClients();
                }}
              />
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                <XIcon />
                Clear
              </Button>
            </div>
          </div>
        )}
        <div className="rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] border-collapse text-sm">
            <thead>
              <tr className="text-left">
                <th className="w-8 border-b border-border/50 py-2 pr-2">
                  <input
                    type="checkbox"
                    aria-label="Select all clients"
                    className="size-4 rounded border-input accent-primary"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                  />
                </th>
                <SortableTh label="Name" sortKey="name" sort={sort} onSort={toggleSort} />
                <SortableTh label="Email" sortKey="email" sort={sort} onSort={toggleSort} />
                <SortableTh
                  label="Documents"
                  sortKey="documents"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Last activity"
                  sortKey="activity"
                  sort={sort}
                  onSort={toggleSort}
                />
                <SortableTh
                  label="Status"
                  sortKey="status"
                  sort={sort}
                  onSort={toggleSort}
                />
                <th className="border-b border-border/70 py-2 pr-4 text-[11px] font-medium tracking-wide text-muted-foreground/70">
                  Workflow
                </th>
                <th className="border-b border-border/70 py-2 pr-4 text-[11px] font-medium tracking-wide text-muted-foreground/70">
                  Package(s)
                </th>
              </tr>
            </thead>
            <tbody>
              {loading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="border-b border-border/50 py-3 pr-4">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))}
              {!loading &&
                rows.map((c, i) => {
                  const summary = c.checklist_summary;
                  const activity = lastActivity[c.id];
                  const workflow = deriveWorkflowStatus(c, summary);
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        "group/row animate-blur-in-sm",
                        selectedIds.has(c.id) && "bg-accent/[0.05]"
                      )}
                      style={{ animationDelay: `${120 + Math.min(i, 10) * 25}ms` }}
                    >
                      <td className="border-b border-border/50 py-3 pr-2">
                        <input
                          type="checkbox"
                          aria-label={`Select ${c.name}`}
                          className="size-4 rounded border-input accent-primary"
                          checked={selectedIds.has(c.id)}
                          onChange={() => toggleSelected(c.id)}
                        />
                      </td>
                      <td className="border-b border-border/50 py-3 pr-4">
                        <Link
                          href={`/clients/${c.id}`}
                          className="font-thin underline-offset-4 [font-family:var(--font-denton)] group-hover/row:underline"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="border-b border-border/50 py-3 pr-4 text-foreground/70">
                        {c.email}
                      </td>
                      <td className="border-b border-border/50 py-3 pr-4 text-foreground/70">
                        <span className="inline-flex items-center gap-1.5">
                          {summary
                            ? summary.total > 0
                              ? `${summary.received} of ${summary.total} received`
                              : "No checklist"
                            : "—"}
                          {summary && summary.received > 0 && (
                            <button
                              type="button"
                              title="Download documents (.zip)"
                              disabled={downloadingId === c.id}
                              onClick={(e) => onDownloadZip(e, c.id)}
                              className="text-muted-foreground/50 transition-colors hover:text-foreground disabled:opacity-50"
                            >
                              {downloadingId === c.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Download className="size-3.5" />
                              )}
                            </button>
                          )}
                        </span>
                      </td>
                      <td className="border-b border-border/50 py-3 pr-4 text-foreground/70">
                        {activity ? formatRelativeTime(activity) : "No activity yet"}
                      </td>
                      <td className="border-b border-border/50 py-3 pr-4">
                        <span className="inline-flex items-center gap-2">
                          <span className={cn("size-1.5 rounded-full", toneClasses[workflow.tone])} />
                          <span className="text-foreground/80">{workflow.label}</span>
                        </span>
                      </td>
                      <td className="border-b border-border/50 py-3 pr-4">
                        <WorkflowStatusCell
                          clientId={c.id}
                          workflowStatuses={c.workflow_statuses}
                          onRemoved={() => mutateClients()}
                        />
                      </td>
                      <td className="border-b border-border/50 py-3 pr-4">
                        <PackageStatusCell
                          clientId={c.id}
                          assignedPackages={c.assigned_packages}
                          onRemoved={() => mutateClients()}
                        />
                      </td>
                    </tr>
                  );
                })}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="animate-blur-in-sm py-8 text-center text-muted-foreground">
                    {clients?.length === 0 ? "No clients yet." : "No clients match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function WorkflowStatusCell({
  clientId,
  workflowStatuses,
  onRemoved,
}: {
  clientId: number;
  workflowStatuses: ClientWorkflowStatus[];
  onRemoved: () => void;
}) {
  if (workflowStatuses.length === 0) {
    return <span className="text-foreground/40">—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {workflowStatuses.map((w) => (
        <WorkflowStatusBadge key={w.workflow_id} clientId={clientId} workflowStatus={w} onRemoved={onRemoved} />
      ))}
    </div>
  );
}

// Hover reveals an unassign "x" in place of the status label, so removing
// a workflow from a client is possible right from the table row without
// opening the client's own page - kept compact (swap, not grow) so
// hovering one row doesn't reflow its neighbors.
function WorkflowStatusBadge({
  clientId,
  workflowStatus,
  onRemoved,
}: {
  clientId: number;
  workflowStatus: ClientWorkflowStatus;
  onRemoved: () => void;
}) {
  const [removing, setRemoving] = useState(false);

  const onRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRemoving(true);
    try {
      await unassignWorkflowFromClient(workflowStatus.workflow_id, clientId);
      onRemoved();
    } catch {
      setRemoving(false);
    }
  };

  return (
    <span className="group/wf inline-flex items-center gap-1.5">
      <span
        className={cn("size-1.5 shrink-0 rounded-full", toneClasses[workflowStatusTone(workflowStatus.status)])}
      />
      <span className="max-w-40 truncate text-foreground/80" title={workflowStatus.workflow_name}>
        {workflowStatus.workflow_name}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground group-hover/wf:hidden">
        {workflowStatusLabel(workflowStatus.status)}
      </span>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        title={`Remove ${workflowStatus.workflow_name}`}
        className="hidden shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive group-hover/wf:inline-flex disabled:opacity-50"
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

function PackageStatusCell({
  clientId,
  assignedPackages,
  onRemoved,
}: {
  clientId: number;
  assignedPackages: ClientPackage[];
  onRemoved: () => void;
}) {
  if (assignedPackages.length === 0) {
    return <span className="text-foreground/40">—</span>;
  }
  return (
    <div className="flex flex-col gap-1">
      {assignedPackages.map((p) => (
        <PackageStatusBadge key={p.package_id} clientId={clientId} pkg={p} onRemoved={onRemoved} />
      ))}
    </div>
  );
}

// Same hover-reveals-remove-"x" pattern as WorkflowStatusBadge - packages
// don't have a run status to show, so this is just the name plus removal.
function PackageStatusBadge({
  clientId,
  pkg,
  onRemoved,
}: {
  clientId: number;
  pkg: ClientPackage;
  onRemoved: () => void;
}) {
  const [removing, setRemoving] = useState(false);

  const onRemove = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setRemoving(true);
    try {
      await unassignPackageFromClient(pkg.package_id, clientId);
      onRemoved();
    } catch {
      setRemoving(false);
    }
  };

  return (
    <span className="group/pkg inline-flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger
          render={<span className="max-w-40 cursor-default truncate text-foreground/80" />}
        >
          {pkg.package_name}
        </TooltipTrigger>
        <TooltipContent>{pkg.package_name}</TooltipContent>
      </Tooltip>
      <button
        type="button"
        onClick={onRemove}
        disabled={removing}
        title={`Remove ${pkg.package_name}`}
        className="hidden shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive group-hover/pkg:inline-flex disabled:opacity-50"
      >
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

function BulkDeleteClientsButton({
  clientIds,
  onDeleted,
}: {
  clientIds: number[];
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await bulkDeleteClients(clientIds);
      setConfirming(false);
      onDeleted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        className="text-destructive hover:bg-destructive/10"
        onClick={() => setConfirming(true)}
      >
        <Trash2 />
        Delete
      </Button>

      <Dialog open={confirming} onOpenChange={(open) => !deleting && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {clientIds.length} client{clientIds.length === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              {clientIds.length === 1 ? "This client moves" : "These clients move"} to the Archive
              and disappear from this list. Restore{clientIds.length === 1 ? " it" : " them"} from
              the Archive button above within 7 days, or {clientIds.length === 1 ? "it's" : "they're"}{" "}
              permanently deleted along with all checklist items, uploaded documents, email logs,
              memory notes, and workflow/package assignments.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={deleting}>
              {deleting ? "Deleting…" : `Delete ${clientIds.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ArchivedClientsDialog({ onRestored }: { onRestored: () => void }) {
  const [open, setOpen] = useState(false);
  const [archived, setArchived] = useState<Client[] | null>(null);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    listArchivedClients()
      .then(setArchived)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  const openDialog = () => {
    setOpen(true);
    setError(null);
    setArchived(null);
    refresh();
  };

  const onRestore = async (clientId: number) => {
    setRestoringId(clientId);
    setError(null);
    try {
      await restoreClients([clientId]);
      refresh();
      onRestored();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setRestoringId(null);
    }
  };

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
              Deleted clients stay here for 7 days before being permanently removed - restore one
              to bring it back exactly as it was.
            </DialogDescription>
          </DialogHeader>

          {archived === null ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : archived.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing archived.</p>
          ) : (
            <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
              {archived.map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-muted"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{client.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {client.email} · Deleted{" "}
                      {client.archived_at ? formatRelativeTime(client.archived_at) : ""}
                    </span>
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    disabled={restoringId === client.id}
                    onClick={() => onRestore(client.id)}
                  >
                    {restoringId === client.id ? "Restoring…" : "Restore"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ActivityGroupRow({
  group,
  expanded,
  onToggle,
  clientName,
  delayMs = 0,
}: {
  group: {
    clientId: number;
    entries: EmailLogEntry[];
    counts: { label: string; count: number }[];
    latest: string;
  };
  expanded: boolean;
  onToggle: () => void;
  clientName: string;
  delayMs?: number;
}) {
  const latestEntry = group.entries[0];
  const { Icon, iconTone } = describeActivity(latestEntry);
  const hasMultiple = group.entries.length > 1;
  const summary = group.counts
    .map(({ label, count }) => (count > 1 ? `${count}× ${label}` : label))
    .join(" · ");

  return (
    <div
      className="relative flex flex-col animate-blur-in-sm"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div
        role={hasMultiple ? "button" : undefined}
        tabIndex={hasMultiple ? 0 : undefined}
        onClick={hasMultiple ? onToggle : undefined}
        onKeyDown={
          hasMultiple
            ? (e) => {
                if (e.key === "Enter") onToggle();
              }
            : undefined
        }
        className={cn(
          "relative flex items-center gap-3 py-2",
          hasMultiple && "cursor-pointer"
        )}
      >
        <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full bg-background">
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-full",
              iconTone
            )}
          >
            <Icon className="size-3.5" />
          </span>
        </span>
        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
          <span className="truncate text-sm">
            <span className="font-medium">{clientName}</span>
            <span className="text-foreground/60"> — {summary}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-foreground/55">
            {formatRelativeTime(group.latest)}
            {hasMultiple && (
              <ChevronRight
                className={cn(
                  "size-3.5 text-foreground/40 transition-transform",
                  expanded && "rotate-90"
                )}
              />
            )}
          </span>
        </div>
      </div>
      {hasMultiple && expanded && (
        <div className="mb-1 ml-10 flex flex-col gap-1 border-l border-border/60 pl-4">
          {group.entries.map((entry) => {
            const { label } = describeActivity(entry);
            return (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 py-1 text-xs text-foreground/60"
              >
                <span>{label}</span>
                <span>{formatRelativeTime(entry.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th className="border-b border-border/70 py-2 pr-4 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex items-center gap-1 transition-colors",
          active ? "text-foreground" : "hover:text-foreground/70"
        )}
      >
        {label}
        <ArrowUp
          className={cn(
            "size-3 transition-transform",
            active ? "opacity-100" : "opacity-0",
            active && sort.direction === "desc" && "rotate-180"
          )}
        />
      </button>
    </th>
  );
}
