"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, ChevronRight } from "lucide-react";
import type { ChecklistItem, Client, ClientWithChecklistSummary } from "@/lib/api";
import { cn, formatRelativeTime, formatShortDate } from "@/lib/utils";
import { computeTier, startOfDay, TIER_META, TIER_RANK, type Tier } from "@/lib/checklist-urgency";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel, panelTableHead } from "@/components/panel";

export interface OutstandingRow {
  client: Client;
  item: ChecklistItem;
  tier: Tier;
  daysUntil: number | null;
}

// Every document still owed (missing, or received but wrong), with its
// deadline tier. Shared by the panel below and the page's summary figures so
// both count the same thing.
export function outstandingRows(clients: ClientWithChecklistSummary[] | undefined): OutstandingRow[] {
  const today = startOfDay(new Date());
  const list: OutstandingRow[] = [];
  for (const client of clients ?? []) {
    for (const item of client.checklist_summary.items) {
      if (item.status !== "missing" && item.status !== "wrong") continue;
      list.push({ client, item, ...computeTier(item, today) });
    }
  }
  return list;
}

// One row per client, not per document; a client's individual documents
// open beneath their row.
interface ClientGroup {
  client: Client;
  allItems: OutstandingRow[];
  worstTier: Tier;
  earliestDaysUntil: number | null;
  oldestCreatedAt: string;
}

type SortKey = "urgency" | "client" | "age";
type Sort = { key: SortKey; direction: "asc" | "desc" };

const TIERS: Tier[] = ["overdue", "due_soon", "on_track"];

function deadlineLabel(row: OutstandingRow): string {
  if (!row.item.expected_date_range_end) return "No deadline";
  if (row.tier === "overdue") return `Overdue · ${formatRelativeTime(row.item.expected_date_range_end)}`;
  if (row.tier === "due_soon") return `Due ${formatRelativeTime(row.item.expected_date_range_end)}`;
  return formatShortDate(row.item.expected_date_range_end);
}

// How long a request has been outstanding, independent of any deadline.
function waitingLabel(createdAt: string): string {
  return formatRelativeTime(createdAt).replace(/ ago$/, "");
}

export function OutstandingDocuments({
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
  const [sort, setSort] = useState<Sort>({ key: "urgency", direction: "asc" });
  const [filterTier, setFilterTier] = useState<Tier | null>(null);

  // Documents unchecked in a client's dropdown are left out of that client's
  // next reminder. Empty by default, so Remind covers everything shown.
  const [deselectedItemIds, setDeselectedItemIds] = useState<Set<number>>(new Set());
  const toggleItemSelected = (itemId: number) =>
    setDeselectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });

  const rows = useMemo(() => outstandingRows(clients), [clients]);

  const counts = useMemo(() => {
    const byTier: Record<Tier, number> = { overdue: 0, due_soon: 0, on_track: 0 };
    for (const r of rows) byTier[r.tier]++;
    return byTier;
  }, [rows]);

  // Ticks every second so the reminder cooldown counts down live.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const groups = useMemo(() => {
    const byClient = new Map<number, OutstandingRow[]>();
    for (const r of rows) {
      const list = byClient.get(r.client.id);
      if (list) list.push(r);
      else byClient.set(r.client.id, [r]);
    }
    const result: ClientGroup[] = [];
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
      result.push({ client: items[0].client, allItems: items, worstTier, earliestDaysUntil, oldestCreatedAt });
    }
    return result;
  }, [rows]);

  const visibleGroups = useMemo(() => {
    const dir = sort.direction === "asc" ? 1 : -1;
    const byDeadline = (a: ClientGroup, b: ClientGroup) => {
      if (a.earliestDaysUntil === null && b.earliestDaysUntil === null) return 0;
      if (a.earliestDaysUntil === null) return 1;
      if (b.earliestDaysUntil === null) return -1;
      return (a.earliestDaysUntil - b.earliestDaysUntil) * dir;
    };
    const sorted = [...groups].sort((a, b) => {
      switch (sort.key) {
        case "urgency": {
          const rankDiff = TIER_RANK[a.worstTier] - TIER_RANK[b.worstTier];
          return rankDiff !== 0 ? rankDiff * dir : byDeadline(a, b);
        }
        case "client":
          return a.client.name.localeCompare(b.client.name) * dir;
        case "age":
          return a.oldestCreatedAt.localeCompare(b.oldestCreatedAt) * dir;
      }
    });
    // Filtering drops clients with nothing in the tier, and a remaining
    // client's dropdown only lists its documents in that tier.
    return sorted
      .map((g) => ({ ...g, visibleItems: filterTier ? g.allItems.filter((r) => r.tier === filterTier) : g.allItems }))
      .filter((g) => g.visibleItems.length > 0);
  }, [groups, sort, filterTier]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    );

  const [expandedClientIds, setExpandedClientIds] = useState<Set<number>>(new Set());
  const toggleExpanded = (clientId: number) =>
    setExpandedClientIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });

  if (loading) {
    return (
      <Panel title="Outstanding documents">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-1.5 w-full rounded-full" />
          <Skeleton className="h-4 w-64" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </Panel>
    );
  }

  if (rows.length === 0) {
    return (
      <Panel title="Outstanding documents">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-3.5 text-success" />
          Nothing outstanding. Every client is caught up.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Outstanding documents"
      meta={`${rows.length} from ${groups.length} client${groups.length === 1 ? "" : "s"}`}
    >
      <div className="flex flex-col gap-3">
        {/* Share of outstanding documents by deadline status. */}
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {TIERS.filter((t) => counts[t] > 0).map((t) => (
            <span
              key={t}
              className={cn("h-full transition-opacity", TIER_META[t].dot, filterTier && filterTier !== t && "opacity-25")}
              style={{ flexGrow: counts[t] }}
            />
          ))}
        </div>
        <div role="group" aria-label="Filter by deadline status" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <TierFilter label="All" count={rows.length} active={filterTier === null} onClick={() => setFilterTier(null)} />
          {TIERS.map((t) => (
            <TierFilter
              key={t}
              label={TIER_META[t].label}
              count={counts[t]}
              dot={TIER_META[t].dot}
              active={filterTier === t}
              onClick={() => setFilterTier((prev) => (prev === t ? null : t))}
            />
          ))}
        </div>
      </div>

      <div className="-mx-5 max-h-[34rem] overflow-y-auto px-5">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b border-border/70">
              <SortableTh label="Client" sortKey="client" sort={sort} onSort={toggleSort} />
              <th className={cn(panelTableHead, "hidden sm:table-cell")}>Documents</th>
              <SortableTh label="Waiting" sortKey="age" sort={sort} onSort={toggleSort} className="hidden md:table-cell" />
              <SortableTh
                label="Deadline"
                sortKey="urgency"
                sort={sort}
                onSort={toggleSort}
                className="pr-0 text-right sm:pr-4 sm:text-left"
              />
              <th className={cn(panelTableHead, "hidden pr-0 text-right sm:table-cell")}>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map((group) => (
              <ClientGroupRows
                key={group.client.id}
                group={group}
                expanded={expandedClientIds.has(group.client.id)}
                onToggleExpand={() => toggleExpanded(group.client.id)}
                deselectedItemIds={deselectedItemIds}
                onToggleItemSelected={toggleItemSelected}
                now={now}
                sending={reminderState[group.client.id] === "sending"}
                onSendReminder={onSendReminder}
              />
            ))}
            {visibleGroups.length === 0 && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                  No {filterTier ? TIER_META[filterTier].label.toLowerCase() : "outstanding"} documents.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function TierFilter({
  label,
  count,
  dot,
  active,
  onClick,
}: {
  label: string;
  count: number;
  dot?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={count === 0 && !active}
      className={cn(
        "inline-flex items-center gap-1.5 py-1 transition-colors disabled:opacity-40",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {dot && <span className={cn("size-1.5 rounded-full", dot)} />}
      <span className={cn(active && "underline decoration-foreground/30 underline-offset-[6px]")}>{label}</span>
      <span className="tabular-nums text-muted-foreground">{count}</span>
    </button>
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
    <th className={cn(panelTableHead, className)} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 uppercase transition-colors", active ? "text-foreground" : "hover:text-foreground")}
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

// Server-tracked cooldown (Client.last_reminder_sent_at), so a reload or a
// second tab can't re-send inside the window. The backend enforces the same
// window (429); this is a double-submit guard.
function reminderCooldownSecondsLeft(client: Client, now: number): number | null {
  if (!client.last_reminder_sent_at) return null;
  const elapsed = now - new Date(client.last_reminder_sent_at).getTime();
  if (elapsed >= REMINDER_COOLDOWN_MS) return null;
  return Math.ceil((REMINDER_COOLDOWN_MS - elapsed) / 1000);
}

function ClientGroupRows({
  group,
  expanded,
  onToggleExpand,
  deselectedItemIds,
  onToggleItemSelected,
  now,
  sending,
  onSendReminder,
}: {
  group: ClientGroup & { visibleItems: OutstandingRow[] };
  expanded: boolean;
  onToggleExpand: () => void;
  deselectedItemIds: Set<number>;
  onToggleItemSelected: (itemId: number) => void;
  now: number;
  sending: boolean;
  onSendReminder: (e: React.MouseEvent, clientId: number, itemIds: number[]) => void;
}) {
  const count = group.visibleItems.length;
  const worstVisible = group.visibleItems.reduce<Tier>(
    (worst, r) => (TIER_RANK[r.tier] < TIER_RANK[worst] ? r.tier : worst),
    "on_track"
  );
  const meta = TIER_META[worstVisible];

  // Most urgent first within a client.
  const sortedItems = useMemo(
    () =>
      [...group.visibleItems].sort((a, b) => {
        const rankDiff = TIER_RANK[a.tier] - TIER_RANK[b.tier];
        if (rankDiff !== 0) return rankDiff;
        if (a.daysUntil === null && b.daysUntil === null) return 0;
        if (a.daysUntil === null) return 1;
        if (b.daysUntil === null) return -1;
        return a.daysUntil - b.daysUntil;
      }),
    [group.visibleItems]
  );
  const mostUrgent = sortedItems[0];

  const selectedItemIds = sortedItems.filter((r) => !deselectedItemIds.has(r.item.id)).map((r) => r.item.id);
  const cooldownSecondsLeft = reminderCooldownSecondsLeft(group.client, now);
  const onCooldown = cooldownSecondsLeft !== null;
  const nothingSelected = selectedItemIds.length === 0;
  const partialSelection = selectedItemIds.length > 0 && selectedItemIds.length < count;

  const remindButton = (
    <Button
      variant="outline"
      size="sm"
      disabled={sending || onCooldown || nothingSelected}
      title={
        onCooldown
          ? `You can remind again in ${cooldownSecondsLeft}s`
          : nothingSelected
            ? "Select at least one document to remind about"
            : undefined
      }
      onClick={(e) => onSendReminder(e, group.client.id, selectedItemIds)}
    >
      {sending
        ? "Sending…"
        : onCooldown
          ? `Sent · ${cooldownSecondsLeft}s`
          : partialSelection
            ? `Remind (${selectedItemIds.length})`
            : "Remind"}
    </Button>
  );

  return (
    <>
      <tr
        className="group/row cursor-pointer border-b border-border/50 transition-colors hover:bg-muted/40"
        onClick={onToggleExpand}
        aria-expanded={expanded}
      >
        <td className="py-2.5 pr-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <ChevronRight
              className={cn("size-3 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
            />
            <div className="flex min-w-0 flex-col">
              <Link
                href={`/clients/${group.client.id}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate font-medium underline-offset-4 hover:underline"
              >
                {group.client.name}
              </Link>
              <span className="text-xs text-muted-foreground sm:hidden">
                {count} document{count === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </td>
        <td className="hidden py-2.5 pr-4 text-muted-foreground sm:table-cell">
          <span className="text-foreground/80">{count}</span> · {mostUrgent.item.doc_type_needed}
          {count > 1 && <span> and {count - 1} more</span>}
        </td>
        <td className="hidden py-2.5 pr-4 whitespace-nowrap text-muted-foreground md:table-cell">
          {waitingLabel(group.oldestCreatedAt)}
        </td>
        <td className="py-2.5 pr-0 whitespace-nowrap sm:pr-4">
          <div className="flex flex-col items-end gap-1.5 sm:items-start">
            <span className={cn("inline-flex items-center gap-1.5", meta.text)}>
              <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
              {meta.label}
            </span>
            {/* Phones: no separate action column, so the button sits under the status. */}
            <div className="sm:hidden">{remindButton}</div>
          </div>
        </td>
        <td className="hidden py-2.5 text-right sm:table-cell">
          {remindButton}
        </td>
      </tr>
      {expanded &&
        sortedItems.map((row) => {
          const itemMeta = TIER_META[row.tier];
          return (
            <tr key={row.item.id} className="border-b border-border/50 bg-muted/30 animate-fade-in">
              <td className="py-2 pr-4 pl-4.5">
                <label className="flex min-w-0 cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={!deselectedItemIds.has(row.item.id)}
                    onChange={() => onToggleItemSelected(row.item.id)}
                    aria-label={`Include ${row.item.doc_type_needed} in the reminder`}
                    className="mt-0.5 size-3.5 shrink-0 rounded border-input accent-primary"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-foreground/90">{row.item.doc_type_needed}</span>
                    <span className="sm:hidden">{(row.item.package_name || row.item.wrong_attempt_count > 0) && (
                  <span className="text-xs text-muted-foreground">
                    {row.item.package_name}
                    {row.item.package_name && row.item.wrong_attempt_count > 0 && " · "}
                    {row.item.wrong_attempt_count > 0 && (
                      <span
                        className="text-destructive"
                        title={
                          row.item.last_wrong_doc_type ? `Last wrong submission: ${row.item.last_wrong_doc_type}` : undefined
                        }
                      >
                        Wrong file received ×{row.item.wrong_attempt_count}
                      </span>
                    )}
                  </span>
                )}</span>
                  </span>
                </label>
              </td>
              <td className="hidden py-2 pr-4 sm:table-cell">{(row.item.package_name || row.item.wrong_attempt_count > 0) && (
                  <span className="text-xs text-muted-foreground">
                    {row.item.package_name}
                    {row.item.package_name && row.item.wrong_attempt_count > 0 && " · "}
                    {row.item.wrong_attempt_count > 0 && (
                      <span
                        className="text-destructive"
                        title={
                          row.item.last_wrong_doc_type ? `Last wrong submission: ${row.item.last_wrong_doc_type}` : undefined
                        }
                      >
                        Wrong file received ×{row.item.wrong_attempt_count}
                      </span>
                    )}
                  </span>
                )}</td>
              <td className="hidden py-2 pr-4 whitespace-nowrap text-muted-foreground md:table-cell">
                {waitingLabel(row.item.created_at)}
              </td>
              <td className="py-2 pr-0 text-right whitespace-nowrap sm:pr-4 sm:text-left">
                <span className={cn("inline-flex items-center gap-1.5", itemMeta.text)}>
                  <span className={cn("size-1.5 shrink-0 rounded-full", itemMeta.dot)} />
                  {deadlineLabel(row)}
                </span>
              </td>
              <td className="hidden py-2 sm:table-cell" />
            </tr>
          );
        })}
    </>
  );
}
