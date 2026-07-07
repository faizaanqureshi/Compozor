"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  ChevronRight,
  Mail,
  Plus,
  Search,
} from "lucide-react";
import {
  ApiError,
  ChecklistSummary,
  Client,
  ClientStatus,
  EmailLogEntry,
  createClient,
  listChecklistItems,
  listClients,
  listEmailLog,
  sendChecklistReminder,
} from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type WorkflowTone = "positive" | "warning" | "attention" | "neutral";
type SortKey = "name" | "email" | "documents" | "activity" | "status";
type Sort = { key: SortKey; direction: "asc" | "desc" };

const toneClasses: Record<WorkflowTone, string> = {
  positive: "bg-accent",
  warning: "bg-amber-500",
  attention: "bg-destructive",
  neutral: "bg-muted-foreground/40",
};

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
    if (summary.wrong > 0) return { label: "Under review", tone: "attention" };
    if (summary.missing > 0) return { label: "Awaiting docs", tone: "warning" };
    return { label: "Complete", tone: "positive" };
  }
  return client.status === "pending"
    ? { label: "Pending", tone: "neutral" }
    : { label: "Active", tone: "positive" };
}

export default function ClientsPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[] | null>(null);
  const [checklists, setChecklists] = useState<Record<number, ChecklistSummary>>({});
  const [emailLog, setEmailLog] = useState<EmailLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>({ key: "name", direction: "asc" });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<ClientStatus>("pending");
  const [submitting, setSubmitting] = useState(false);

  const [reminderState, setReminderState] = useState<
    Record<number, "sending" | "sent">
  >({});

  const refresh = () => {
    listClients()
      .then(setClients)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(refresh, []);

  useEffect(() => {
    if (!clients || clients.length === 0) return;
    let cancelled = false;

    Promise.all(
      clients.map((c) =>
        listChecklistItems(c.id)
          .then((summary) => [c.id, summary] as const)
          .catch(() => null)
      )
    ).then((results) => {
      if (cancelled) return;
      const next: Record<number, ChecklistSummary> = {};
      for (const r of results) if (r) next[r[0]] = r[1];
      setChecklists(next);
    });

    listEmailLog()
      .then((entries) => {
        if (cancelled) return;
        setEmailLog(entries);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [clients]);

  const clientsById = useMemo(() => {
    const map: Record<number, Client> = {};
    for (const c of clients ?? []) map[c.id] = c;
    return map;
  }, [clients]);

  const lastActivity = useMemo(() => {
    const next: Record<number, string> = {};
    for (const entry of emailLog) {
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
        const summary = checklists[c.id];
        const items = (summary?.items ?? []).filter(
          (i) => i.status === "missing" || i.status === "wrong"
        );
        return { client: c, items };
      })
      .filter((w) => w.items.length > 0);
  }, [clients, checklists]);

  const recentActivity = useMemo(() => {
    const sorted = [...emailLog].sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    const groups: { entry: EmailLogEntry; label: string; count: number }[] = [];
    for (const entry of sorted) {
      const { label } = describeActivity(entry);
      const last = groups[groups.length - 1];
      if (last && last.entry.client_id === entry.client_id && last.label === label) {
        last.count += 1;
      } else {
        groups.push({ entry, label, count: 1 });
      }
    }
    return groups.slice(0, 6);
  }, [emailLog]);

  const stats = useMemo(() => {
    const counts = { active: 0, pending: 0, inactive: 0 };
    for (const c of clients ?? []) counts[c.status]++;
    return {
      total: clients?.length ?? 0,
      active: counts.active,
      pending: counts.pending,
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
            (outstandingCount(checklists[a.id]) - outstandingCount(checklists[b.id])) *
            dir
          );
        case "activity":
          return (
            (lastActivity[a.id] ?? "").localeCompare(lastActivity[b.id] ?? "") * dir
          );
        case "status":
          return (
            deriveWorkflowStatus(a, checklists[a.id]).label.localeCompare(
              deriveWorkflowStatus(b, checklists[b.id]).label
            ) * dir
          );
      }
    });
  }, [clients, checklists, lastActivity, search, sort]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createClient({ name, email, status });
      setName("");
      setEmail("");
      setStatus("pending");
      setOpen(false);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
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
    <div className="flex w-full flex-col gap-12">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-6xl font-thin tracking-tight [font-family:var(--font-denton)]">
            Clients
          </h1>
          <p className="text-sm text-muted-foreground">
            {waiting.length > 0
              ? `Waiting on ${waiting.reduce((n, w) => n + w.items.length, 0)} document${
                  waiting.reduce((n, w) => n + w.items.length, 0) === 1 ? "" : "s"
                } from ${waiting.length} client${waiting.length === 1 ? "" : "s"}.`
              : `${stats.active} active client${stats.active === 1 ? "" : "s"} · all caught up.`}
          </p>
        </div>
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
                  <Label htmlFor="client-status">Status</Label>
                  <select
                    id="client-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as ClientStatus)}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="pending">Pending</option>
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

      {error && !open && <p className="text-sm text-destructive">{error}</p>}

      <section className="flex flex-col gap-4">
        <div className="flex items-center gap-2 text-xs font-medium tracking-wide text-amber-600 uppercase dark:text-amber-500">
          <AlertTriangle className="size-3.5" />
          Waiting for action
        </div>
        <div className="flex flex-col gap-2.5">
          {waiting.map(({ client, items }) => {
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
                className="group/waiting flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-3.5 transition-colors hover:bg-amber-500/[0.07]"
              >
                <div className="flex flex-col gap-1.5">
                  <span className="font-medium underline-offset-4 group-hover/waiting:underline">
                    {client.name}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {items.slice(0, 3).map((i) => (
                      <span
                        key={i.id}
                        className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400"
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
          {waiting.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">
              Nothing outstanding — every client is caught up.
            </p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Recent activity
        </div>
        <div className="relative flex flex-col">
          {recentActivity.length > 1 && (
            <div className="absolute top-2 bottom-2 left-3.5 w-px bg-border/70" />
          )}
          {recentActivity.map(({ entry, label, count }) => (
            <ActivityRow
              key={entry.id}
              entry={entry}
              label={label}
              count={count}
              clientName={clientsById[entry.client_id]?.name ?? "Unknown client"}
            />
          ))}
          {recentActivity.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">No activity yet.</p>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            All clients
          </div>
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-foreground/50" />
            <Input
              placeholder="Search clients…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56 border-none bg-muted/60 pl-8 shadow-none focus-visible:ring-1 focus-visible:ring-ring/30"
            />
          </div>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left">
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
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const summary = checklists[c.id];
              const activity = lastActivity[c.id];
              const workflow = deriveWorkflowStatus(c, summary);
              return (
                <tr key={c.id} className="group/row">
                  <td className="border-b border-border/50 py-3 pr-4">
                    <Link
                      href={`/clients/${c.id}`}
                      className="font-medium underline-offset-4 group-hover/row:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="border-b border-border/50 py-3 pr-4 text-foreground/70">
                    {c.email}
                  </td>
                  <td className="border-b border-border/50 py-3 pr-4 text-foreground/70">
                    {summary
                      ? summary.total > 0
                        ? `${summary.received} of ${summary.total} received`
                        : "No checklist"
                      : "—"}
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
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  {clients?.length === 0 ? "No clients yet." : "No clients match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ActivityRow({
  entry,
  label,
  count,
  clientName,
}: {
  entry: EmailLogEntry;
  label: string;
  count: number;
  clientName: string;
}) {
  const { Icon, iconTone } = describeActivity(entry);

  return (
    <div className="relative flex items-center gap-3 py-2">
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
          <span className="text-foreground/60"> — {label}</span>
          {count > 1 && (
            <span className="text-foreground/60"> ({count}×)</span>
          )}
        </span>
        <span className="shrink-0 text-xs text-foreground/55">
          {formatRelativeTime(entry.created_at)}
        </span>
      </div>
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
