"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, ChevronRight, FileText, Users, type LucideIcon } from "lucide-react";
import type { ChecklistItem, Client, ClientWithChecklistSummary } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { computeTier, MS_PER_DAY, startOfDay, TIER_META, TIER_RANK, type Tier } from "@/lib/checklist-urgency";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface OutstandingRow {
  client: Client;
  item: ChecklistItem;
  tier: Tier;
  daysUntil: number | null;
}

// One row per client in the table, not per document - a client with several
// outstanding items no longer repeats their name once per row (see COM-8
// follow-up); the documents themselves live in an expandable dropdown per
// client instead.
interface ClientGroup {
  client: Client;
  allItems: OutstandingRow[];
  worstTier: Tier;
  earliestDaysUntil: number | null;
  oldestCreatedAt: string;
}

type UrgencySortKey = "urgency" | "client" | "deadline" | "age";
type UrgencySort = { key: UrgencySortKey; direction: "asc" | "desc" };

function deadlineLabel(row: OutstandingRow): string {
  if (!row.item.expected_date_range_end) return "No deadline";
  if (row.tier === "overdue") return `Overdue — ${formatRelativeTime(row.item.expected_date_range_end)}`;
  if (row.tier === "due_soon") return `Due ${formatRelativeTime(row.item.expected_date_range_end)}`;
  return new Date(`${row.item.expected_date_range_end}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// How long the request has been outstanding, independent of any deadline -
// every row here is by definition not yet received (status missing/wrong),
// so this is time since the item was requested, never "since received."
function ageLabel(row: OutstandingRow): string {
  return formatRelativeTime(row.item.created_at).replace(/^in /, "");
}

// How long outstanding requests have been sitting, bucketed - unlike a
// by-document-type breakdown (which mostly just restates the table), this
// answers something the table and the pie chart don't: is the backlog fresh,
// or is it accumulating a stale tail nobody's chasing. Fixed buckets (not
// top-N + Other) since there are only ever these five.
const AGE_BUCKETS = [
  { label: "0–3d", maxDays: 3 },
  { label: "4–7d", maxDays: 7 },
  { label: "8–14d", maxDays: 14 },
  { label: "15–30d", maxDays: 30 },
  { label: "30d+", maxDays: Infinity },
] as const;

export function UrgencyDashboard({
  clients,
  loading,
  reminderState,
  onSendReminder,
}: {
  clients: ClientWithChecklistSummary[] | undefined;
  loading: boolean;
  reminderState: Record<number, "sending">;
  onSendReminder: (e: React.MouseEvent, clientId: number, itemIds: number[]) => void;
}) {
  const [sort, setSort] = useState<UrgencySort>({ key: "urgency", direction: "asc" });
  const [filterTier, setFilterTier] = useState<Tier | null>(null);
  const toggleFilter = (tier: Tier) => setFilterTier((prev) => (prev === tier ? null : tier));

  // Which outstanding items are explicitly excluded from a client's next
  // reminder - unchecked in that client's dropdown. Empty by default, so
  // "click Remind without touching anything" sends about all of them; ids
  // are globally unique across clients, so one flat set is enough (see
  // ClientGroupRow, which intersects this against its own visibleItems).
  const [deselectedItemIds, setDeselectedItemIds] = useState<Set<number>>(new Set());
  const toggleItemSelected = (itemId: number) =>
    setDeselectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

  const rows = useMemo(() => {
    const today = startOfDay(new Date());
    const list: OutstandingRow[] = [];
    for (const client of clients ?? []) {
      for (const item of client.checklist_summary.items) {
        if (item.status !== "missing" && item.status !== "wrong") continue;
        const { tier, daysUntil } = computeTier(item, today);
        list.push({ client, item, tier, daysUntil });
      }
    }
    return list;
  }, [clients]);

  const stats = useMemo(() => {
    const overdue = rows.filter((r) => r.tier === "overdue").length;
    const dueSoon = rows.filter((r) => r.tier === "due_soon").length;
    const onTrack = rows.length - overdue - dueSoon;
    const clientsNeedingAction = new Set(rows.map((r) => r.client.id)).size;
    return { total: rows.length, overdue, dueSoon, onTrack, clientsNeedingAction };
  }, [rows]);

  // Ticks every second so the reminder cooldown countdown (15s, see the
  // backend's MANUAL_REMINDER_COOLDOWN) actually counts down live instead of
  // freezing at whatever moment the dashboard first mounted - fine to always
  // run while this is on screen, a once-a-second re-render of a stat table
  // is negligible.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Grouped by client - the table shows one row per client (see ClientGroup),
  // with that client's individual documents revealed in a per-row dropdown
  // rather than repeating the client's name once per outstanding document.
  const clientGroups = useMemo(() => {
    const byClient = new Map<number, OutstandingRow[]>();
    for (const r of rows) {
      const list = byClient.get(r.client.id);
      if (list) list.push(r);
      else byClient.set(r.client.id, [r]);
    }
    const groups: ClientGroup[] = [];
    for (const items of byClient.values()) {
      let worstTier: Tier = "on_track";
      let earliestDaysUntil: number | null = null;
      let oldestCreatedAt = items[0].item.created_at;
      for (const r of items) {
        if (TIER_RANK[r.tier] < TIER_RANK[worstTier]) worstTier = r.tier;
        if (r.daysUntil !== null && (earliestDaysUntil === null || r.daysUntil < earliestDaysUntil)) {
          earliestDaysUntil = r.daysUntil;
        }
        if (r.item.created_at < oldestCreatedAt) oldestCreatedAt = r.item.created_at;
      }
      groups.push({ client: items[0].client, allItems: items, worstTier, earliestDaysUntil, oldestCreatedAt });
    }
    return groups;
  }, [rows]);

  const sortedGroups = useMemo(() => {
    const dir = sort.direction === "asc" ? 1 : -1;
    const byDeadline = (a: ClientGroup, b: ClientGroup) => {
      if (a.earliestDaysUntil === null && b.earliestDaysUntil === null) return 0;
      if (a.earliestDaysUntil === null) return 1;
      if (b.earliestDaysUntil === null) return -1;
      return (a.earliestDaysUntil - b.earliestDaysUntil) * dir;
    };
    return [...clientGroups].sort((a, b) => {
      switch (sort.key) {
        case "urgency": {
          const rankDiff = TIER_RANK[a.worstTier] - TIER_RANK[b.worstTier];
          return rankDiff !== 0 ? rankDiff * dir : byDeadline(a, b);
        }
        case "client":
          return a.client.name.localeCompare(b.client.name) * dir;
        case "deadline":
          return byDeadline(a, b);
        case "age":
          return (new Date(a.oldestCreatedAt).getTime() - new Date(b.oldestCreatedAt).getTime()) * dir;
      }
    });
  }, [clientGroups, sort]);

  const toggleSort = (key: UrgencySortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  // Filtering by tier drops any client with no matching document entirely,
  // and - per the ask - the dropdown for a client that does match only shows
  // that client's documents in the filtered tier, not their full list.
  const visibleGroups = useMemo(() => {
    if (!filterTier) return sortedGroups.map((g) => ({ ...g, visibleItems: g.allItems }));
    return sortedGroups
      .map((g) => ({ ...g, visibleItems: g.allItems.filter((r) => r.tier === filterTier) }))
      .filter((g) => g.visibleItems.length > 0);
  }, [sortedGroups, filterTier]);

  const visibleItemCount = useMemo(
    () => visibleGroups.reduce((sum, g) => sum + g.visibleItems.length, 0),
    [visibleGroups]
  );

  const [expandedClientIds, setExpandedClientIds] = useState<Set<number>>(new Set());
  const toggleExpanded = (clientId: number) =>
    setExpandedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });

  const ageBreakdown = useMemo(() => {
    const today = startOfDay(new Date());
    const counts = AGE_BUCKETS.map((b) => ({ label: b.label, count: 0 }));
    for (const r of rows) {
      const created = startOfDay(new Date(r.item.created_at));
      const daysOutstanding = Math.max(0, Math.round((today.getTime() - created.getTime()) / MS_PER_DAY));
      const bucketIndex = AGE_BUCKETS.findIndex((b) => daysOutstanding <= b.maxDays);
      counts[bucketIndex === -1 ? counts.length - 1 : bucketIndex].count += 1;
    }
    return counts;
  }, [rows]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (stats.total === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-card p-4 text-sm text-success ring-1 ring-foreground/10">
        <Check className="size-3.5" />
        Nothing outstanding — every client is caught up.
      </div>
    );
  }

  return (
    <div className="flex animate-blur-in-sm flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl bg-muted/30 p-4 ring-1 ring-foreground/10">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Outstanding documents"
          value={stats.total}
          icon={FileText}
          onClick={() => setFilterTier(null)}
        />
        <StatTile
          label="Overdue"
          value={stats.overdue}
          tone="destructive"
          active={filterTier === "overdue"}
          onClick={() => toggleFilter("overdue")}
        />
        <StatTile
          label="Due within 3 days"
          value={stats.dueSoon}
          tone="accent"
          active={filterTier === "due_soon"}
          onClick={() => toggleFilter("due_soon")}
        />
        <StatTile
          label="On track"
          value={stats.onTrack}
          tone="success"
          active={filterTier === "on_track"}
          onClick={() => toggleFilter("on_track")}
        />
        <StatTile label="Clients needing action" value={stats.clientsNeedingAction} icon={Users} />
      </div>

      <p className="-mt-2 text-xs text-muted-foreground">
        Click a tile to filter the documents below.
      </p>

      <Accordion defaultValue={["table"]} className="rounded-2xl bg-card ring-1 ring-foreground/10">
        <AccordionItem value="table" className="border-none">
          <AccordionTrigger className="items-center px-4 py-3.5 text-xs tracking-widest text-muted-foreground uppercase hover:no-underline">
            Outstanding documents
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {filterTier && (
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  Showing {TIER_META[filterTier].label.toLowerCase()} only ({visibleItemCount})
                </span>
                <button
                  type="button"
                  onClick={() => setFilterTier(null)}
                  className="font-medium text-foreground/80 underline-offset-2 hover:underline"
                >
                  Clear filter
                </button>
              </div>
            )}
            <div className="max-h-72 overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="text-left">
                    <SortableTh label="Client" sortKey="client" sort={sort} onSort={toggleSort} />
                    <th className="border-b border-border/70 py-1.5 pr-4 text-xs tracking-widest text-muted-foreground/70 uppercase">
                      Documents
                    </th>
                    <SortableTh label="Age" sortKey="age" sort={sort} onSort={toggleSort} />
                    <SortableTh label="Deadline" sortKey="deadline" sort={sort} onSort={toggleSort} />
                    <th className="border-b border-border/70 py-1.5 text-right text-xs tracking-widest text-muted-foreground/70">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGroups.map((group) => (
                    <ClientGroupRow
                      key={group.client.id}
                      group={group}
                      expanded={expandedClientIds.has(group.client.id)}
                      onToggleExpand={() => toggleExpanded(group.client.id)}
                      deselectedItemIds={deselectedItemIds}
                      onToggleItemSelected={toggleItemSelected}
                      now={now}
                      reminderState={reminderState}
                      onSendReminder={onSendReminder}
                    />
                  ))}
                  {visibleGroups.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-center text-sm text-muted-foreground">
                        No {filterTier ? TIER_META[filterTier].label.toLowerCase() : "outstanding"} documents.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
      </div>

      <Accordion defaultValue={["insights"]} className="rounded-2xl bg-card ring-1 ring-foreground/10">
        <AccordionItem value="insights" className="border-none">
          <AccordionTrigger className="items-center px-4 py-3.5 text-xs tracking-widest text-muted-foreground uppercase hover:no-underline">
            Insights
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-1 gap-6 pt-2 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <span className="text-[0.625rem] tracking-widest text-muted-foreground uppercase">
                  Outstanding documents by deadline status
                </span>
                <UrgencyPieChart stats={stats} />
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-[0.625rem] tracking-widest text-muted-foreground uppercase">
                  Outstanding documents by age
                </span>
                <AgeBarChart data={ageBreakdown} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
  active,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: number;
  tone?: "destructive" | "accent" | "success";
  active?: boolean;
  icon?: LucideIcon;
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground/50" />}
      </div>
      <span
        className={cn(
          "text-2xl font-light tracking-tight tabular-nums sm:text-3xl",
          tone === "destructive" && "text-destructive",
          tone === "accent" && "text-accent",
          tone === "success" && "text-success"
        )}
      >
        {value}
      </span>
    </>
  );

  const toneRing =
    tone === "destructive"
      ? "bg-destructive/[0.06] ring-destructive/40"
      : tone === "accent"
        ? "bg-accent/[0.06] ring-accent/40"
        : tone === "success"
          ? "bg-success/[0.06] ring-success/40"
          : "";

  if (!onClick) {
    return (
      <div className="flex flex-col gap-0.5 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex cursor-pointer flex-col gap-0.5 rounded-xl bg-card p-3 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/40",
        active && toneRing
      )}
    >
      {content}
    </button>
  );
}

function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: UrgencySortKey;
  sort: UrgencySort;
  onSort: (key: UrgencySortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th className="border-b border-border/70 py-1.5 pr-4 text-xs tracking-widest text-muted-foreground/70 uppercase">
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

const REMINDER_COOLDOWN_MS = 60 * 1000;

// Real, server-tracked cooldown (Client.last_reminder_sent_at), not just a
// disabled-until-reload local flag - a page refresh or a second tab must not
// let someone re-send within the window. The backend enforces the same 1min
// window independently (POST /clients/{id}/checklist-reminder returns 429) -
// this is a double-click/double-submit guard, not a spam-prevention
// throttle, so it's short enough that `now` needs to actually tick (see
// UrgencyDashboard's interval) for the countdown to recover on its own.
function reminderCooldownSecondsLeft(client: Client, now: number): number | null {
  if (!client.last_reminder_sent_at) return null;
  const elapsed = now - new Date(client.last_reminder_sent_at).getTime();
  if (elapsed >= REMINDER_COOLDOWN_MS) return null;
  return Math.ceil((REMINDER_COOLDOWN_MS - elapsed) / 1000);
}

function ClientGroupRow({
  group,
  expanded,
  onToggleExpand,
  deselectedItemIds,
  onToggleItemSelected,
  now,
  reminderState,
  onSendReminder,
}: {
  group: ClientGroup & { visibleItems: OutstandingRow[] };
  expanded: boolean;
  onToggleExpand: () => void;
  deselectedItemIds: Set<number>;
  onToggleItemSelected: (itemId: number) => void;
  now: number;
  reminderState: Record<number, "sending">;
  onSendReminder: (e: React.MouseEvent, clientId: number, itemIds: number[]) => void;
}) {
  const meta = TIER_META[group.worstTier];
  const count = group.visibleItems.length;

  // Worst-first within the dropdown too, independent of the outer table's
  // sort key - there's no per-document sort control anymore, so this is
  // always the sensible default (most urgent document for this client on top).
  const sortedItems = useMemo(() => {
    return [...group.visibleItems].sort((a, b) => {
      const rankDiff = TIER_RANK[a.tier] - TIER_RANK[b.tier];
      if (rankDiff !== 0) return rankDiff;
      if (a.daysUntil === null && b.daysUntil === null) return 0;
      if (a.daysUntil === null) return 1;
      if (b.daysUntil === null) return -1;
      return a.daysUntil - b.daysUntil;
    });
  }, [group.visibleItems]);

  // What's actually about to be reminded about - everything shown, unless
  // some documents were unchecked in the dropdown (all checked by default).
  const selectedItemIds = sortedItems
    .filter((row) => !deselectedItemIds.has(row.item.id))
    .map((row) => row.item.id);

  const state = reminderState[group.client.id];
  const cooldownSecondsLeft = reminderCooldownSecondsLeft(group.client, now);
  const onCooldown = cooldownSecondsLeft !== null;
  const nothingSelected = selectedItemIds.length === 0;
  const partialSelection = selectedItemIds.length > 0 && selectedItemIds.length < count;

  return (
    <>
      <tr
        className="group/row animate-blur-in-sm cursor-pointer border-b border-border/40 text-sm transition-colors last:border-0 hover:bg-muted/30"
        onClick={onToggleExpand}
        aria-expanded={expanded}
      >
        <td className="py-1.5 pr-4">
          <div className="flex items-center gap-1.5">
            <ChevronRight
              className={cn(
                "size-3 shrink-0 text-muted-foreground transition-transform",
                expanded && "rotate-90"
              )}
            />
            <Link
              href={`/clients/${group.client.id}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium underline-offset-4 !no-underline group-hover/row:!underline"
            >
              {group.client.name}
            </Link>
          </div>
        </td>
        <td className="py-1.5 pr-4 text-muted-foreground">
          {count} document{count === 1 ? "" : "s"}
        </td>
        <td className="py-1.5 pr-4 text-muted-foreground">
          {formatRelativeTime(group.oldestCreatedAt).replace(/^in /, "")}
        </td>
        <td className="py-1.5 pr-4">
          <span className={cn("flex items-center gap-1.5", meta.text)}>
            <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
            {TIER_META[group.worstTier].label}
          </span>
        </td>
        <td className="py-1.5 text-right">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={state === "sending" || onCooldown || nothingSelected}
            title={
              cooldownSecondsLeft !== null
                ? `You can remind again in ${cooldownSecondsLeft}s`
                : nothingSelected
                  ? "Select at least one document to remind about"
                  : undefined
            }
            onClick={(e) => onSendReminder(e, group.client.id, selectedItemIds)}
          >
            {state === "sending"
              ? "Sending…"
              : onCooldown
                ? `Sent · ${cooldownSecondsLeft}s`
                : partialSelection
                  ? `Remind (${selectedItemIds.length})`
                  : "Remind"}
          </Button>
        </td>
      </tr>
      {expanded &&
        sortedItems.map((row) => {
          const itemMeta = TIER_META[row.tier];
          return (
            <tr key={row.item.id} className="border-b border-border/40 bg-muted/20 text-sm last:border-0">
              <td className="py-1.5 pr-2 pl-[22px]">
                <input
                  type="checkbox"
                  checked={!deselectedItemIds.has(row.item.id)}
                  onChange={() => onToggleItemSelected(row.item.id)}
                  aria-label={`Include ${row.item.doc_type_needed} in the reminder`}
                  className="size-3.5 rounded border-input accent-primary"
                />
              </td>
              <td className="py-1.5 pr-4 text-foreground/90">
                {row.item.doc_type_needed}
                {row.item.package_name && (
                  <span className="text-muted-foreground"> · {row.item.package_name}</span>
                )}
                {row.item.wrong_attempt_count > 0 && (
                  <span
                    className="text-accent"
                    title={
                      row.item.last_wrong_doc_type
                        ? `Last wrong submission: ${row.item.last_wrong_doc_type}`
                        : undefined
                    }
                  >
                    {" "}
                    (resubmitted ×{row.item.wrong_attempt_count})
                  </span>
                )}
              </td>
              <td className="py-1.5 pr-4 text-muted-foreground">{ageLabel(row)}</td>
              <td className="py-1.5 pr-4">
                <span className={cn("flex items-center gap-1.5", itemMeta.text)}>
                  <span className={cn("size-1.5 shrink-0 rounded-full", itemMeta.dot)} />
                  {deadlineLabel(row)}
                </span>
              </td>
              <td className="py-1.5" />
            </tr>
          );
        })}
    </>
  );
}

function ChartEmptyState() {
  return <p className="text-xs text-muted-foreground">Nothing to chart yet.</p>;
}

// Plain SVG donut (stroke-dasharray per segment) rather than a charting
// library. Same three tiers/colors as the stat tiles and stacked bar above
// it - this is the same data as another form, not a new dimension, per the
// user's explicit ask for a pie specifically on deadline status.
function UrgencyPieChart({
  stats,
}: {
  stats: { total: number; overdue: number; dueSoon: number; onTrack: number };
}) {
  const { total, overdue, dueSoon, onTrack } = stats;
  if (total === 0) return <ChartEmptyState />;

  const data: { label: string; count: number; color: string }[] = [
    { label: "Overdue", count: overdue, color: "var(--color-destructive)" },
    { label: "Due soon", count: dueSoon, color: "var(--color-accent)" },
    { label: "On track", count: onTrack, color: "var(--color-success)" },
  ].filter((d) => d.count > 0);

  const radius = 40;
  const strokeWidth = 11;
  const circumference = 2 * Math.PI * radius;
  // Prefix-sum of fractions so each segment's start offset is a lookup, not
  // a mutation carried across the render map (React Compiler flags
  // reassigning a captured variable inside a render-time callback).
  const cumulativeFractions = data.reduce<number[]>((acc, d, i) => {
    acc.push((i === 0 ? 0 : acc[i - 1]) + d.count / total);
    return acc;
  }, []);

  return (
    <div className="mx-auto flex w-fit flex-col items-center gap-4 sm:flex-row">
      <div className="relative size-32 shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--color-muted)" strokeWidth={strokeWidth} />
          {data.map((d, i) => {
            const fraction = d.count / total;
            const dash = fraction * circumference;
            const startFraction = i === 0 ? 0 : cumulativeFractions[i - 1];
            const offset = -startFraction * circumference;
            return (
              <circle
                key={d.label}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={strokeWidth}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={offset}
              >
                <title>{`${d.label}: ${d.count} (${Math.round(fraction * 100)}%)`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-light tracking-tight text-foreground tabular-nums">{total}</span>
          <span className="text-[9px] tracking-widest text-muted-foreground uppercase">outstanding</span>
        </div>
      </div>
      <div className="flex w-40 shrink-0 flex-col gap-1.5 sm:w-44">
        {data.map((d) => (
          <div key={d.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex min-w-0 items-center gap-1.5 truncate text-foreground/90">
              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="truncate">{d.label}</span>
            </span>
            <span className="shrink-0 text-muted-foreground tabular-nums">
              {d.count} · {Math.round((d.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Vertical columns (bars growing from a shared baseline) rather than
// horizontal - the bucket labels are short (0–3d, 4–7d...), unlike the long
// client names that made the earlier client chart horizontal.
function AgeBarChart({ data }: { data: { label: string; count: number }[] }) {
  if (data.length === 0) return <ChartEmptyState />;
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex h-40 items-end gap-3 sm:gap-4">
      {data.map((d) => (
        <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-xs tabular-nums text-foreground/80">{d.count}</span>
          <div className="flex w-full flex-1 items-end">
            {/* Magnitude comparison across categories that are already
                direct-labeled below - one muted sequential hue (chart-2,
                the same primary series color the marketing charts use),
                not a categorical rainbow. "Sequential" means more-is-darker,
                not just taller - opacity carries that (a flat color with
                only height varying reads as one flat block, not a ramp). */}
            <div
              className="w-full rounded-t-sm bg-chart-2 transition-[height]"
              style={{
                height: `${Math.max((d.count / max) * 100, d.count > 0 ? 4 : 0)}%`,
                opacity: d.count > 0 ? 0.45 + 0.55 * (d.count / max) : 0.25,
              }}
              title={`${d.label}: ${d.count}`}
            />
          </div>
          <span className="w-full truncate text-center text-[11px] text-muted-foreground" title={d.label}>
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}
