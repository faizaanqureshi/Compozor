"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, FileText, Users, type LucideIcon } from "lucide-react";
import type { ChecklistItem, Client, ClientWithChecklistSummary } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// Reserved for document-TYPE identity only (see the --doc-* tokens in
// globals.css) - deliberately never accent/destructive/success, so a
// doc-type color is never mistaken for an urgency signal on the same page.
// Validated as a categorical set via the dataviz skill's validate_palette.js.
const DOC_TYPE_COLORS = [
  "var(--color-doc-1)",
  "var(--color-doc-2)",
  "var(--color-doc-3)",
  "var(--color-doc-4)",
];
const DOC_TYPE_OTHER_COLOR = "var(--color-muted-foreground)";

// "Deadline" isn't a dedicated field anywhere in the data model - the closest
// thing is ChecklistItem.expected_date_range_end, an AI-extracted date that's
// null whenever a request had no date context. Treating "no deadline" the
// same as "deadline >3 days out" (both = on_track) is deliberate, not a
// missing-data workaround - see the design discussion on COM-8.
type Tier = "overdue" | "due_soon" | "on_track";

interface OutstandingRow {
  client: Client;
  item: ChecklistItem;
  tier: Tier;
  daysUntil: number | null;
}

const MS_PER_DAY = 86_400_000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function computeTier(item: ChecklistItem, today: Date): { tier: Tier; daysUntil: number | null } {
  if (!item.expected_date_range_end) return { tier: "on_track", daysUntil: null };
  const end = startOfDay(new Date(`${item.expected_date_range_end}T00:00:00`));
  const daysUntil = Math.round((end.getTime() - today.getTime()) / MS_PER_DAY);
  if (daysUntil < 0) return { tier: "overdue", daysUntil };
  if (daysUntil <= 3) return { tier: "due_soon", daysUntil };
  return { tier: "on_track", daysUntil };
}

// Reuses the app's existing semantic tokens (DESIGN_SYSTEM.md §6) rather than
// inventing a new severity color: destructive = broken/critical, accent =
// needs attention, success = the calm default. Color lives only in the
// Deadline column's dot+text - table rows themselves stay plain/neutral.
const TIER_META: Record<Tier, { label: string; dot: string; text: string }> = {
  overdue: { label: "Overdue", dot: "bg-destructive", text: "text-destructive" },
  due_soon: { label: "Due soon", dot: "bg-accent", text: "text-accent" },
  on_track: { label: "On track", dot: "bg-success", text: "text-muted-foreground" },
};

const TIER_RANK: Record<Tier, number> = { overdue: 0, due_soon: 1, on_track: 2 };

type UrgencySortKey = "urgency" | "client" | "document" | "deadline" | "age";
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

export function UrgencyDashboard({
  clients,
  loading,
  reminderState,
  onSendReminder,
}: {
  clients: ClientWithChecklistSummary[] | undefined;
  loading: boolean;
  reminderState: Record<number, "sending" | "sent">;
  onSendReminder: (e: React.MouseEvent, clientId: number) => void;
}) {
  const [sort, setSort] = useState<UrgencySort>({ key: "urgency", direction: "asc" });
  const [filterTier, setFilterTier] = useState<Tier | null>(null);
  const toggleFilter = (tier: Tier) => setFilterTier((prev) => (prev === tier ? null : tier));

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

  // Read once via a lazy useState initializer, not a bare Date.now() call in
  // the render body - React's purity rules flag calling an impure function
  // during render, and this is the documented escape hatch for it.
  const [now] = useState(() => Date.now());

  const sortedRows = useMemo(() => {
    const dir = sort.direction === "asc" ? 1 : -1;
    const byDeadline = (a: OutstandingRow, b: OutstandingRow) => {
      if (a.daysUntil === null && b.daysUntil === null) return 0;
      if (a.daysUntil === null) return 1;
      if (b.daysUntil === null) return -1;
      return (a.daysUntil - b.daysUntil) * dir;
    };
    return [...rows].sort((a, b) => {
      switch (sort.key) {
        case "urgency": {
          const rankDiff = TIER_RANK[a.tier] - TIER_RANK[b.tier];
          return rankDiff !== 0 ? rankDiff * dir : byDeadline(a, b);
        }
        case "client":
          return a.client.name.localeCompare(b.client.name) * dir;
        case "document":
          return a.item.doc_type_needed.localeCompare(b.item.doc_type_needed) * dir;
        case "deadline":
          return byDeadline(a, b);
        case "age":
          return (
            (new Date(a.item.created_at).getTime() - new Date(b.item.created_at).getTime()) * dir
          );
      }
    });
  }, [rows, sort]);

  const toggleSort = (key: UrgencySortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  const visibleRows = useMemo(
    () => (filterTier ? sortedRows.filter((r) => r.tier === filterTier) : sortedRows),
    [sortedRows, filterTier]
  );

  // Top 4 document types by outstanding count, everything else folded into
  // "Other" - per the dataviz skill's series-count ladder, more than ~4
  // categorical slices stop being a quick scan.
  const docTypeBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.item.doc_type_needed, (counts.get(r.item.doc_type_needed) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 4).map(([label, count]) => ({ label, count }));
    const otherCount = sorted.slice(4).reduce((sum, [, c]) => sum + c, 0);
    return otherCount > 0 ? [...top, { label: "Other", count: otherCount }] : top;
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

      <Accordion defaultValue={["insights"]} className="rounded-2xl bg-card ring-1 ring-foreground/10">
        <AccordionItem value="insights" className="border-none">
          <AccordionTrigger className="items-center px-4 py-3.5 text-xs font-medium tracking-wide text-muted-foreground uppercase hover:no-underline">
            Insights
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="grid grid-cols-1 gap-6 pt-2 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <span className="text-xs text-muted-foreground">Outstanding documents by deadline status</span>
                <UrgencyPieChart stats={stats} />
              </div>
              <div className="flex flex-col gap-3">
                <span className="text-xs text-muted-foreground">
                  Outstanding documents by type{docTypeBreakdown.length >= 5 && " (top 4)"}
                </span>
                <DocTypeBarChart data={docTypeBreakdown} />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        {filterTier && (
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {TIER_META[filterTier].label.toLowerCase()} only ({visibleRows.length})
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
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="text-left">
                <SortableTh label="Client" sortKey="client" sort={sort} onSort={toggleSort} />
                <SortableTh label="Document" sortKey="document" sort={sort} onSort={toggleSort} />
                <SortableTh label="Deadline" sortKey="deadline" sort={sort} onSort={toggleSort} />
                <SortableTh label="Age" sortKey="age" sort={sort} onSort={toggleSort} />
                <th className="border-b border-border/70 py-1.5 text-right text-[11px] font-medium tracking-wide text-muted-foreground/70">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <UrgencyRow
                  key={row.item.id}
                  row={row}
                  now={now}
                  reminderState={reminderState}
                  onSendReminder={onSendReminder}
                />
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-xs text-muted-foreground">
                    No {filterTier ? TIER_META[filterTier].label.toLowerCase() : "outstanding"} documents.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        {Icon && <Icon className="size-3.5 shrink-0 text-muted-foreground/50" />}
      </div>
      <span
        className={cn(
          "text-2xl font-semibold",
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
    <th className="border-b border-border/70 py-1.5 pr-4 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
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

const REMINDER_COOLDOWN_MS = 12 * 60 * 60 * 1000;

// Real, server-tracked cooldown (Client.last_reminder_sent_at), not just a
// disabled-until-reload local flag - a page refresh or a second tab must not
// let someone re-send within the window. The backend enforces the same 12h
// window independently (POST /clients/{id}/checklist-reminder returns 429),
// so this is the matching UI, not the only guard.
function reminderCooldownHoursLeft(client: Client, now: number): number | null {
  if (!client.last_reminder_sent_at) return null;
  const elapsed = now - new Date(client.last_reminder_sent_at).getTime();
  if (elapsed >= REMINDER_COOLDOWN_MS) return null;
  return Math.ceil((REMINDER_COOLDOWN_MS - elapsed) / (60 * 60 * 1000));
}

function UrgencyRow({
  row,
  now,
  reminderState,
  onSendReminder,
}: {
  row: OutstandingRow;
  now: number;
  reminderState: Record<number, "sending" | "sent">;
  onSendReminder: (e: React.MouseEvent, clientId: number) => void;
}) {
  const meta = TIER_META[row.tier];
  const state = reminderState[row.client.id];
  const cooldownHoursLeft = reminderCooldownHoursLeft(row.client, now);
  const onCooldown = state === "sent" || cooldownHoursLeft !== null;

  return (
    <tr className="animate-blur-in-sm border-b border-border/40 text-xs transition-colors last:border-0 hover:bg-muted/30">
      <td className="py-1.5 pr-4">
        <Link href={`/clients/${row.client.id}`} className="font-medium hover:underline">
          {row.client.name}
        </Link>
      </td>
      <td className="py-1.5 pr-4">
        {row.item.doc_type_needed}
        {row.item.package_name && (
          <span className="ml-1.5 text-muted-foreground">· {row.item.package_name}</span>
        )}
        {row.item.wrong_attempt_count > 0 && (
          <span
            className="ml-1.5 text-accent"
            title={
              row.item.last_wrong_doc_type
                ? `Last wrong submission: ${row.item.last_wrong_doc_type}`
                : undefined
            }
          >
            (resubmitted ×{row.item.wrong_attempt_count})
          </span>
        )}
      </td>
      <td className="py-1.5 pr-4">
        <span className={cn("flex items-center gap-1.5", meta.text)}>
          <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
          {deadlineLabel(row)}
        </span>
      </td>
      <td className="py-1.5 pr-4 text-muted-foreground">{ageLabel(row)}</td>
      <td className="py-1.5 text-right">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          disabled={state === "sending" || onCooldown}
          title={cooldownHoursLeft !== null ? `You can remind again in about ${cooldownHoursLeft}h` : undefined}
          onClick={(e) => onSendReminder(e, row.client.id)}
        >
          {state === "sending" ? "Sending…" : onCooldown ? "Sent" : "Remind"}
        </Button>
      </td>
    </tr>
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
  const strokeWidth = 16;
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
          <span className="text-2xl font-semibold text-foreground">{total}</span>
          <span className="text-[8px] tracking-wide text-muted-foreground uppercase">outstanding</span>
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
// horizontal - doc-type labels are short (T4, NOA, receipt...), unlike the
// long client names that made the earlier client chart horizontal.
function DocTypeBarChart({ data }: { data: { label: string; count: number }[] }) {
  if (data.length === 0) return <ChartEmptyState />;
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex h-40 items-end gap-3 sm:gap-4">
      {data.map((d, i) => {
        const color = i < DOC_TYPE_COLORS.length ? DOC_TYPE_COLORS[i] : DOC_TYPE_OTHER_COLOR;
        return (
          <div key={d.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <span className="text-xs font-medium text-foreground/80 tabular-nums">{d.count}</span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-md transition-[height]"
                style={{
                  height: `${Math.max((d.count / max) * 100, d.count > 0 ? 4 : 0)}%`,
                  backgroundColor: color,
                }}
                title={`${d.label}: ${d.count}`}
              />
            </div>
            <span className="w-full truncate text-center text-[11px] text-muted-foreground" title={d.label}>
              {d.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
