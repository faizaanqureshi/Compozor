"use client";

import { useMemo } from "react";
import { MS_PER_DAY, startOfDay } from "@/lib/checklist-urgency";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/panel";
import type { OutstandingRow } from "@/components/outstanding-documents";

// How long outstanding requests have been waiting, in fixed buckets: is the
// backlog fresh, or is a stale tail building up that nobody is chasing?
const AGE_BUCKETS = [
  { label: "Under 4 days", maxDays: 3 },
  { label: "4 to 7 days", maxDays: 7 },
  { label: "8 to 14 days", maxDays: 14 },
  { label: "15 to 30 days", maxDays: 30 },
  { label: "Over 30 days", maxDays: Infinity },
] as const;

const TOP_DOCUMENT_TYPES = 5;

export function BacklogBreakdown({ rows, loading }: { rows: OutstandingRow[]; loading: boolean }) {
  const { ages, medianDays, documentTypes } = useMemo(() => {
    const today = startOfDay(new Date());
    const waits = rows.map((r) =>
      Math.max(0, Math.round((today.getTime() - startOfDay(new Date(r.item.created_at)).getTime()) / MS_PER_DAY))
    );
    const ages = AGE_BUCKETS.map((b) => ({ label: b.label, value: 0 }));
    for (const days of waits) ages[AGE_BUCKETS.findIndex((b) => days <= b.maxDays)].value++;

    const sorted = [...waits].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianDays =
      sorted.length === 0 ? null : sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);

    // Which documents are holding things up, by how many clients still owe one.
    const byType = new Map<string, Set<number>>();
    for (const r of rows) {
      const key = r.item.doc_type_needed.trim();
      const clients = byType.get(key) ?? new Set<number>();
      clients.add(r.client.id);
      byType.set(key, clients);
    }
    const documentTypes = [...byType.entries()]
      .map(([label, clients]) => ({ label, value: clients.size }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
      .slice(0, TOP_DOCUMENT_TYPES);

    return { ages, medianDays, documentTypes };
  }, [rows]);

  return (
    <Panel
      title="Backlog"
      meta={
        !loading && medianDays !== null
          ? `Typical wait ${medianDays} day${medianDays === 1 ? "" : "s"}`
          : undefined
      }
    >
      {loading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No outstanding requests.</p>
      ) : (
        <div className="flex flex-col gap-6">
          <BarList caption="Time outstanding" items={ages} unit="document" barClass="bg-chart-2" />
          <div className="h-px bg-border/70" />
          <BarList caption="Most requested" items={documentTypes} unit="client" barClass="bg-chart-4" />
        </div>
      )}
    </Panel>
  );
}

// Labelled rows with a hairline bar beneath each, scaled to the largest
// value in the list; the same treatment as the marketing report previews.
function BarList({
  caption,
  items,
  unit,
  barClass,
}: {
  caption: string;
  items: { label: string; value: number }[];
  unit: string;
  barClass: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <figure className="flex flex-col gap-3.5">
      <figcaption className="text-[0.6875rem] tracking-wider text-muted-foreground uppercase">{caption}</figcaption>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={cn("truncate", item.value === 0 && "text-muted-foreground")}>{item.label}</span>
              <span
                className="shrink-0 text-muted-foreground tabular-nums"
                title={`${item.value} ${unit}${item.value === 1 ? "" : "s"}`}
              >
                {item.value}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className={cn("h-full rounded-full", barClass)} style={{ width: `${(item.value / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
