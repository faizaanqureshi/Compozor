"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { clientsKey, emailLogKey } from "@/lib/swr-keys";
import {
  ArchiveRestore,
  ArrowUp,
  Download,
  Loader2,
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
  ClientWithChecklistSummary,
  ClientWorkflowStatus,
  WorkflowRunStatus,
  bulkDeleteClients,
  createClient,
  downloadClientDocumentsZip,
  listArchivedClients,
  listClients,
  listEmailLog,
  listInboxConnections,
  purgeClients,
  restoreClients,
  sendChecklistReminder,
  unassignPackageFromClient,
  unassignWorkflowFromClient,
  watchInboxConnection,
} from "@/lib/api";
import { cn, formatRelativeTime, formatShortDate } from "@/lib/utils";
import { relativeDays, startOfDay, TIER_META } from "@/lib/checklist-urgency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
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
import { PurgeConfirmDialog } from "@/components/purge-confirm-dialog";
import { Panel, panelTableHead } from "@/components/panel";
import { ProgressRule, StatStrip, type StatStripItem } from "@/components/stat-strip";
import { OutstandingDocuments, outstandingRows } from "@/components/outstanding-documents";
import { BacklogBreakdown } from "@/components/backlog-breakdown";
import { CorrespondenceChart } from "@/components/correspondence-chart";
import { RecentActivity } from "@/components/recent-activity";

type WorkflowTone = "success" | "warning" | "attention" | "neutral";
type SortKey = "name" | "documents" | "activity" | "status";
type Sort = { key: SortKey; direction: "asc" | "desc" };

const toneClasses: Record<WorkflowTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  attention: "bg-destructive",
  neutral: "bg-muted-foreground/40",
};

// null status = assigned but never run yet (checklist not complete).
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

function outstandingCount(summary?: ChecklistSummary) {
  return summary ? summary.total - summary.received : 0;
}

function deriveClientStatus(
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

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export default function ClientsPage() {
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

  const [reminderState, setReminderState] = useState<Record<number, "sending">>({});

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

  const outstanding = useMemo(() => outstandingRows(clients), [clients]);

  // Headline figures for the summary strip.
  const overview = useMemo(() => {
    const now = new Date();
    let active = 0;
    let inactive = 0;
    let addedThisMonth = 0;
    let received = 0;
    let requested = 0;
    let workflowReviews = 0;
    for (const c of clients ?? []) {
      if (c.status === "active") active++;
      else inactive++;
      const created = new Date(c.created_at);
      if (created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth()) addedThisMonth++;
      received += c.checklist_summary.received;
      requested += c.checklist_summary.total;
      workflowReviews += c.workflow_statuses.filter(
        (w) => w.status === "needs_review" || w.status === "failed"
      ).length;
    }
    const overdue = outstanding.filter((r) => r.tier === "overdue").length;
    const dueSoon = outstanding.filter((r) => r.tier === "due_soon").length;
    const nextDeadline = outstanding
      .filter((r) => r.daysUntil !== null && r.daysUntil >= 0)
      .sort((a, b) => a.daysUntil! - b.daysUntil!)[0];
    const openEmails = (emailLog ?? []).filter((e) => !e.archived_at);
    const escalations = openEmails.filter((e) => e.status === "needs_human_attention" && !e.resolved_at).length;
    const drafts = openEmails.filter((e) => e.direction === "outbound" && e.status === "draft").length;
    return {
      active,
      inactive,
      addedThisMonth,
      received,
      requested,
      overdue,
      dueSoon,
      nextDeadline,
      escalations,
      drafts,
      workflowReviews,
    };
  }, [clients, emailLog, outstanding]);

  const summaryItems: StatStripItem[] = useMemo(() => {
    const o = overview;
    const today = startOfDay(new Date());
    const needsYou = o.escalations + o.drafts + o.workflowReviews;
    const collected = o.requested ? Math.round((o.received / o.requested) * 100) : 0;
    return [
      {
        label: "Active clients",
        value: o.active,
        detail:
          [o.inactive > 0 && `${o.inactive} inactive`, o.addedThisMonth > 0 && `${o.addedThisMonth} added this month`]
            .filter(Boolean)
            .join(" · ") || "All active",
      },
      {
        label: "Documents",
        value: (
          <>
            {o.received}
            <span className="text-muted-foreground/70">/{o.requested}</span>
          </>
        ),
        detail:
          o.requested === 0 ? (
            "Nothing requested yet"
          ) : (
            <span className="flex items-center gap-2">
              <ProgressRule value={o.received} total={o.requested} />
              {collected}% collected
            </span>
          ),
      },
      {
        label: "Outstanding",
        value: outstanding.length,
        tone: o.overdue > 0 ? "text-destructive" : undefined,
        detail:
          outstanding.length === 0
            ? "Nothing outstanding"
            : [o.overdue > 0 && `${o.overdue} overdue`, o.dueSoon > 0 && `${o.dueSoon} due soon`]
                .filter(Boolean)
                .join(" · ") || "Nothing overdue",
      },
      {
        label: "Next deadline",
        value: o.nextDeadline ? formatShortDate(o.nextDeadline.item.expected_date_range_end!) : "—",
        tone: o.nextDeadline?.tier === "due_soon" ? TIER_META.due_soon.text : undefined,
        detail: o.nextDeadline
          ? `${o.nextDeadline.client.name} · ${relativeDays(o.nextDeadline.item.expected_date_range_end!, today)}`
          : "No upcoming deadlines",
      },
      {
        label: "Needs you",
        value: needsYou,
        tone: o.escalations > 0 ? "text-destructive" : needsYou > 0 ? "text-warning-foreground" : undefined,
        detail:
          [
            o.escalations > 0 && `${o.escalations} escalated`,
            o.drafts > 0 && `${plural(o.drafts, "draft")}`,
            o.workflowReviews > 0 && `${o.workflowReviews} to review`,
          ]
            .filter(Boolean)
            .join(" · ") || "Nothing waiting on you",
      },
    ];
  }, [overview, outstanding.length]);

  // Batch client selection, for bulk actions - lives on this table rather
  // than on the Workflows page, so picking who a workflow runs for happens in
  // the same place you're already looking at/sorting/searching clients.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleSelected = (clientId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

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
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        !!c.company_name?.toLowerCase().includes(q)
    );
    const dir = sort.direction === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
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
            deriveClientStatus(a, a.checklist_summary).label.localeCompare(
              deriveClientStatus(b, b.checklist_summary).label
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

  // itemIds is whichever documents the outstanding panel's checkboxes left
  // selected for this client (all of them by default) - one email covering
  // just that set. See lib/api.ts's sendChecklistReminder.
  const sendReminder = async (e: React.MouseEvent, clientId: number, itemIds: number[]) => {
    e.preventDefault();
    e.stopPropagation();
    setReminderState((prev) => ({ ...prev, [clientId]: "sending" }));
    try {
      await sendChecklistReminder(clientId, itemIds);
      // Wait for client.last_reminder_sent_at to refresh before clearing
      // "sending" - that timestamp drives the cooldown countdown.
      await mutateClients();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setReminderState((prev) => {
        const next = { ...prev };
        delete next[clientId];
        return next;
      });
    }
  };

  const clientsWaiting = new Set(outstanding.map((r) => r.client.id)).size;

  return (
    <div className="relative isolate mx-auto flex min-h-full w-full max-w-[96rem] flex-col gap-6">
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

      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl leading-tight font-thin tracking-tight [font-family:var(--font-denton)] md:text-5xl">
            Clients
          </h1>
          {loading ? (
            <Skeleton className="h-4 w-56" />
          ) : (
            <p className="text-sm text-pretty text-muted-foreground">
              {outstanding.length > 0
                ? `Waiting on ${plural(outstanding.length, "document")} from ${plural(clientsWaiting, "client")}.`
                : `${plural(overview.active, "active client")} · all caught up.`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <WorkflowFormDialog onSaved={() => {}} variant="ghost" />
          <PackageFormDialog onSaved={() => {}} variant="ghost" />
          <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
          <ClientImportModal onImported={() => mutateClients()} />
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
                <div className="flex flex-col gap-5">
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
                    <NativeSelect
                      id="client-status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value as ClientStatus)}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </NativeSelect>
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
      </header>

      {(error || fetchError) && !open && (
        <p className="text-sm text-destructive">{error || fetchError}</p>
      )}

      <StatStrip
        label="Practice summary"
        items={summaryItems}
        loading={loading}
        columns="grid-cols-2 lg:grid-cols-5 [&>*:last-child]:max-lg:col-span-2"
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <OutstandingDocuments
            clients={clients}
            loading={loading}
            reminderState={reminderState}
            onSendReminder={sendReminder}
          />
          <CorrespondenceChart entries={emailLog} loading={loading} />
        </div>
        {/* Two columns on tablets, a rail beside the main column on xl. */}
        <aside className="grid min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-6 md:grid-cols-2 xl:flex xl:flex-col xl:items-stretch">
          <BacklogBreakdown rows={outstanding} loading={loading} />
          <RecentActivity entries={emailLog} clientsById={clientsById} loading={loading} />
        </aside>
      </div>

      <Panel
        title="All clients"
        meta={loading ? undefined : `${clients?.length ?? 0}`}
        action={
          <>
            <div className="relative flex items-center">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-foreground/50" />
              <Input
                placeholder="Search clients…"
                aria-label="Search clients"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 w-44 border-none bg-muted/60 pl-8 shadow-none focus-visible:ring-1 focus-visible:ring-ring/30 sm:w-56"
              />
            </div>
            <ArchivedClientsDialog onRestored={() => mutateClients()} />
          </>
        }
      >
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-accent/[0.08] px-4 py-2.5 text-sm animate-fade-in">
            <span className="font-medium text-accent">
              {plural(selectedIds.size, "client")} selected
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <AssignPackageDialog
                clientIds={Array.from(selectedIds)}
                onAssigned={() => {
                  setSelectedIds(new Set());
                  mutateClients();
                }}
                trigger={
                  <Button variant="secondary" size="sm">
                    <PackageIcon />
                    Assign package
                  </Button>
                }
              />
              <AssignWorkflowDialog
                clientIds={Array.from(selectedIds)}
                onAssigned={() => {
                  setSelectedIds(new Set());
                  mutateClients();
                }}
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

        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {clients?.length === 0 ? "No clients yet." : "No clients match your search."}
          </p>
        ) : (
          <>
            {/* Phones: one compact entry per client. */}
            <ul className="-my-1 flex flex-col divide-y divide-border/60 md:hidden">
              {rows.map((c) => (
                <ClientListItem
                  key={c.id}
                  client={c}
                  activity={lastActivity[c.id]}
                  selected={selectedIds.has(c.id)}
                  onToggleSelected={() => toggleSelected(c.id)}
                />
              ))}
            </ul>

            {/* Tablet and up: the full table. */}
            <div className="-mx-5 hidden overflow-x-auto px-5 md:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/70">
                    <th className="w-8 py-1.5 pr-2 pb-2.5 text-left">
                      <input
                        type="checkbox"
                        aria-label="Select all clients"
                        className="size-4 rounded border-input accent-primary"
                        checked={allVisibleSelected}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <SortableTh label="Client" sortKey="name" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Documents" sortKey="documents" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                    <th className={cn(panelTableHead, "hidden lg:table-cell")}>Workflows</th>
                    <th className={cn(panelTableHead, "hidden lg:table-cell")}>Packages</th>
                    <SortableTh
                      label="Last activity"
                      sortKey="activity"
                      sort={sort}
                      onSort={toggleSort}
                      className="pr-0 text-right"
                    />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const summary = c.checklist_summary;
                    const activity = lastActivity[c.id];
                    const clientStatus = deriveClientStatus(c, summary);
                    return (
                      <tr
                        key={c.id}
                        className={cn(
                          "group/row border-b border-border/50 align-top transition-colors last:border-0 hover:bg-muted/30",
                          selectedIds.has(c.id) && "bg-accent/[0.05]"
                        )}
                      >
                        <td className="py-3 pr-2">
                          <input
                            type="checkbox"
                            aria-label={`Select ${c.name}`}
                            className="mt-0.5 size-4 rounded border-input accent-primary"
                            checked={selectedIds.has(c.id)}
                            onChange={() => toggleSelected(c.id)}
                          />
                        </td>
                        <td className="max-w-72 py-3 pr-4">
                          <div className="flex min-w-0 flex-col">
                            <Link
                              href={`/clients/${c.id}`}
                              className="truncate font-medium underline-offset-4 group-hover/row:underline"
                            >
                              {c.name}
                            </Link>
                            <span className="truncate text-xs text-muted-foreground">
                              {c.company_name ? `${c.company_name} · ${c.email}` : c.email}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          {summary.total > 0 ? (
                            <div className="flex flex-col gap-1.5">
                              <span className="inline-flex items-center gap-1.5 text-foreground/80 tabular-nums">
                                {summary.received}
                                <span className="text-muted-foreground">of {summary.total}</span>
                                {summary.received > 0 && (
                                  <button
                                    type="button"
                                    title="Download documents (.zip)"
                                    aria-label={`Download ${c.name}'s documents`}
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
                              <ProgressRule value={summary.received} total={summary.total} />
                            </div>
                          ) : (
                            <span className="text-muted-foreground">No requests</span>
                          )}
                        </td>
                        <td className="py-3 pr-4 whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            <span className={cn("size-1.5 rounded-full", toneClasses[clientStatus.tone])} />
                            <span className="text-foreground/80">{clientStatus.label}</span>
                          </span>
                        </td>
                        <td className="hidden py-3 pr-4 lg:table-cell">
                          <WorkflowStatusCell
                            clientId={c.id}
                            workflowStatuses={c.workflow_statuses}
                            onRemoved={() => mutateClients()}
                          />
                        </td>
                        <td className="hidden py-3 pr-4 lg:table-cell">
                          <PackageStatusCell
                            clientId={c.id}
                            assignedPackages={c.assigned_packages}
                            onRemoved={() => mutateClients()}
                          />
                        </td>
                        <td className="py-3 text-right whitespace-nowrap text-muted-foreground">
                          {activity ? formatRelativeTime(activity) : "No activity"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}

function ClientListItem({
  client,
  activity,
  selected,
  onToggleSelected,
}: {
  client: ClientWithChecklistSummary;
  activity: string | undefined;
  selected: boolean;
  onToggleSelected: () => void;
}) {
  const summary = client.checklist_summary;
  const clientStatus = deriveClientStatus(client, summary);
  return (
    <li className={cn("flex items-start gap-3 py-3", selected && "bg-accent/[0.05]")}>
      <input
        type="checkbox"
        aria-label={`Select ${client.name}`}
        className="mt-1 size-4 shrink-0 rounded border-input accent-primary"
        checked={selected}
        onChange={onToggleSelected}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-baseline justify-between gap-3">
          <Link href={`/clients/${client.id}`} className="truncate font-medium underline-offset-4 hover:underline">
            {client.name}
          </Link>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-foreground/80">
            <span className={cn("size-1.5 rounded-full", toneClasses[clientStatus.tone])} />
            {clientStatus.label}
          </span>
        </div>
        <span className="truncate text-xs text-muted-foreground">{client.email}</span>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          {summary.total > 0 && (
            <>
              <ProgressRule value={summary.received} total={summary.total} className="w-10" />
              <span className="tabular-nums">
                {summary.received} of {summary.total}
              </span>
              <span aria-hidden>·</span>
            </>
          )}
          <span className="truncate">{activity ? formatRelativeTime(activity) : "No activity"}</span>
        </div>
      </div>
    </li>
  );
}

function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={cn(panelTableHead, className)}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 uppercase transition-colors",
          active ? "text-foreground" : "hover:text-foreground"
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
  const [confirming, setConfirming] = useState(false);

  const onRemove = async () => {
    setRemoving(true);
    try {
      await unassignWorkflowFromClient(workflowStatus.workflow_id, clientId);
      setConfirming(false);
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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirming(true);
        }}
        title={`Remove ${workflowStatus.workflow_name}`}
        className="hidden shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive group-hover/wf:inline-flex"
      >
        <XIcon className="size-3" />
      </button>
      <RemoveAssignmentDialog
        open={confirming}
        onOpenChange={setConfirming}
        kind="workflow"
        itemName={workflowStatus.workflow_name}
        removing={removing}
        onConfirm={onRemove}
      />
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
  const [confirming, setConfirming] = useState(false);

  const onRemove = async () => {
    setRemoving(true);
    try {
      await unassignPackageFromClient(pkg.package_id, clientId);
      setConfirming(false);
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
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setConfirming(true);
        }}
        title={`Remove ${pkg.package_name}`}
        className="hidden shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive group-hover/pkg:inline-flex"
      >
        <XIcon className="size-3" />
      </button>
      <RemoveAssignmentDialog
        open={confirming}
        onOpenChange={setConfirming}
        kind="package"
        itemName={pkg.package_name}
        removing={removing}
        onConfirm={onRemove}
      />
    </span>
  );
}

// Shared by WorkflowStatusBadge and PackageStatusBadge - hovering to reveal
// the "x" makes it easy to remove an assignment by accident, so both go
// through this same short confirm instead of unassigning immediately.
function RemoveAssignmentDialog({
  open,
  onOpenChange,
  kind,
  itemName,
  removing,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "package" | "workflow";
  itemName: string;
  removing: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !removing && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="pr-8">Delete “{itemName}”?</DialogTitle>
          <DialogDescription>This removes the {kind} from this client.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={removing}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={removing}>
            {removing ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
              {clientIds.length === 1 ? "This client" : "These clients"} will be archived for 7
              days, then deleted permanently.
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
  const [restoringAll, setRestoringAll] = useState(false);
  const [purging, setPurging] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
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

  const onRestoreAll = async () => {
    if (!archived || archived.length === 0) return;
    setRestoringAll(true);
    setError(null);
    try {
      await restoreClients(archived.map((c) => c.id));
      refresh();
      onRestored();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setRestoringAll(false);
    }
  };

  const onDeletePermanently = async (clientIds: number[]) => {
    setPurging(true);
    setError(null);
    try {
      await purgeClients(clientIds);
      setConfirmDeleteId(null);
      setConfirmDeleteAll(false);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setPurging(false);
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
              to bring it back exactly as it was, or delete it for good right away.
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
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={restoringId === client.id}
                        onClick={() => onRestore(client.id)}
                      >
                        {restoringId === client.id ? "Restoring…" : "Restore"}
                      </Button>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        className="text-destructive hover:bg-destructive/10"
                        title="Delete permanently"
                        onClick={() => setConfirmDeleteId(client.id)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>

      <PurgeConfirmDialog
        open={confirmDeleteId !== null}
        onOpenChange={(next) => !next && setConfirmDeleteId(null)}
        count={1}
        itemLabel="client"
        purging={purging}
        onConfirm={() => confirmDeleteId !== null && onDeletePermanently([confirmDeleteId])}
      />
      <PurgeConfirmDialog
        open={confirmDeleteAll}
        onOpenChange={setConfirmDeleteAll}
        count={archived?.length ?? 0}
        itemLabel="client"
        purging={purging}
        onConfirm={() => archived && onDeletePermanently(archived.map((c) => c.id))}
      />
    </>
  );
}

