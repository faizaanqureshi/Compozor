"use client";

import { useMemo } from "react";
import type { EmailLogEntry } from "@/lib/api";
import { MS_PER_DAY, startOfDay } from "@/lib/checklist-urgency";
import { formatShortDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/panel";

const DAYS = 30;

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Rounds the axis ceiling up to a readable number.
function niceCeiling(max: number) {
  if (max <= 4) return 4;
  const step = max <= 20 ? 5 : max <= 50 ? 10 : 25;
  return Math.ceil(max / step) * step;
}

export function CorrespondenceChart({ entries, loading }: { entries: EmailLogEntry[] | undefined; loading: boolean }) {
  const series = useMemo(() => {
    const today = startOfDay(new Date());
    const days = Array.from({ length: DAYS }, (_, i) => {
      const date = new Date(today.getTime() - (DAYS - 1 - i) * MS_PER_DAY);
      return { date, received: 0, sent: 0 };
    });
    const index = new Map(days.map((d, i) => [dayKey(d.date), i]));
    for (const entry of entries ?? []) {
      const i = index.get(dayKey(new Date(entry.created_at)));
      if (i === undefined) continue;
      if (entry.direction === "inbound") days[i].received++;
      else if (entry.status === "sent") days[i].sent++;
    }
    return days;
  }, [entries]);

  const received = series.reduce((n, d) => n + d.received, 0);
  const sent = series.reduce((n, d) => n + d.sent, 0);
  const ceiling = niceCeiling(Math.max(...series.map((d) => Math.max(d.received, d.sent))));
  const height = (v: number) => `${(v / ceiling) * 100}%`;

  return (
    <Panel title="Correspondence" meta="Last 30 days">
      {loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <figure className="flex flex-col gap-5">
          <div className="flex flex-wrap gap-x-10 gap-y-3">
            <SeriesTotal label="Received from clients" value={received} swatch="bg-chart-2" />
            <SeriesTotal label="Sent to clients" value={sent} swatch="bg-chart-4" />
          </div>

          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
            {/* Y axis: ceiling, midpoint, zero */}
            <div className="flex h-40 flex-col justify-between text-right text-[0.6875rem] text-muted-foreground tabular-nums">
              <span className="-translate-y-1/2">{ceiling}</span>
              <span>{ceiling / 2}</span>
              <span className="translate-y-1/2">0</span>
            </div>
            <div className="relative h-40">
              <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
                <div className="border-t border-border/70" />
                <div className="border-t border-dashed border-border/70" />
                <div className="border-t border-border" />
              </div>
              {/* One pair of columns per day, received then sent. */}
              <div
                className="absolute inset-0 flex items-end gap-px sm:gap-1"
                role="img"
                aria-label={`Over the last 30 days, ${received} emails were received from clients and ${sent} were sent to clients.`}
              >
                {series.map((d, i) => (
                  <div
                    key={i}
                    className="group/day flex h-full flex-1 items-end justify-center gap-px rounded-t-sm hover:bg-muted/60"
                    title={`${formatShortDate(d.date.toISOString())}: ${d.received} received · ${d.sent} sent`}
                  >
                    <span className="w-full max-w-2 rounded-t-xs bg-chart-2" style={{ height: height(d.received) }} />
                    <span className="w-full max-w-2 rounded-t-xs bg-chart-4" style={{ height: height(d.sent) }} />
                  </div>
                ))}
              </div>
            </div>
            <div />
            <div className="mt-2 flex justify-between text-[0.6875rem] text-muted-foreground">
              <span>{formatShortDate(series[0].date.toISOString())}</span>
              <span className="hidden sm:inline">{formatShortDate(series[Math.floor(DAYS / 2)].date.toISOString())}</span>
              <span>Today</span>
            </div>
          </div>
        </figure>
      )}
    </Panel>
  );
}

function SeriesTotal({ label, value, swatch }: { label: string; value: number; swatch: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className={`size-2 rounded-xs ${swatch}`} aria-hidden />
        {label}
      </span>
      <span className="text-2xl font-light tracking-tight tabular-nums">{value}</span>
    </div>
  );
}
