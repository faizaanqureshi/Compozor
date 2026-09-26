"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Minus, X } from "lucide-react";
import { buildRunTimeline, formatDuration, formatOffset, splitAttempts, type TimelineEntry, type TraceStep } from "@/lib/agent-activity";
import { cn } from "@/lib/utils";

// Re-renders once a second while something is live, so running rows and
// elapsed totals keep counting between server refreshes.
export function useNow(live: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  return now;
}

export function runTimeline(run: { tool_trajectory: (Omit<TraceStep, "round"> & { round?: number })[] | null; started_at: string | null; completed_at: string | null }, running: boolean) {
  const trace = (run.tool_trajectory ?? []).map((step, i) => ({ ...step, round: step.round ?? i + 1 }));
  const { current, previous } = splitAttempts(trace, run.started_at);
  return {
    entries: buildRunTimeline(current, { startedAt: run.started_at, completedAt: run.completed_at, running }),
    earlier: buildRunTimeline(previous, { running: false }),
  };
}

function Marker({ entry, nested }: { entry: TimelineEntry; nested?: boolean }) {
  if (entry.state === "running") return <Loader2 className="size-3 animate-spin text-foreground" />;
  if (nested && entry.state === "done") return <span className="size-1 rounded-full bg-muted-foreground/50" />;
  if (entry.kind === "gap") return <span className="size-1.5 rounded-full border border-muted-foreground/60 bg-card" />;
  if (entry.state === "failed") return <X className="size-3 text-destructive" />;
  if (entry.state === "stopped") return <Minus className="size-3 text-muted-foreground" />;
  return <Check className="size-3 text-muted-foreground" />;
}

function Row({ entry, origin, span, now, nested = false, operations }: {
  entry: TimelineEntry; origin?: number; span: number; now: number; nested?: boolean;
  // The toggle for a model step's Python operations, when it has any.
  operations?: { count: number; open: boolean; toggle: () => void };
}) {
  const end = entry.end ?? (entry.state === "running" ? now : undefined);
  const duration = entry.start !== undefined && end !== undefined ? end - entry.start : undefined;
  const offset = origin !== undefined && entry.start !== undefined ? entry.start - origin : undefined;
  const hasBar = offset !== undefined && duration !== undefined && span > 0;
  const hasMore = entry.details.length > 0 || entry.notes.length > 0;
  return (
    <li className={cn("relative grid grid-cols-[1rem_minmax(0,1fr)_auto] gap-x-3 sm:grid-cols-[2.75rem_1rem_minmax(0,1fr)_7rem_3.75rem]", nested ? "py-1.5" : "py-2.5")}>
      <span className="hidden pt-px text-right text-[0.6875rem] text-muted-foreground/70 tabular-nums sm:block">
        {offset !== undefined ? formatOffset(offset) : ""}
      </span>
      <span className="relative z-10 flex h-4 items-center justify-center bg-card">
        <Marker entry={entry} nested={nested} />
      </span>
      <div className={cn("min-w-0 leading-snug break-words", nested ? "pl-3 text-xs" : "text-[0.8125rem]",
        entry.state === "failed" ? "text-destructive" : entry.kind === "gap" || nested ? "text-muted-foreground" : entry.state === "running" ? "text-foreground" : "text-foreground/85",
        nested && entry.state === "running" && "text-foreground")}>
        <p>{entry.title}{entry.state === "running" && "…"}</p>
        {operations && (
          <button type="button" onClick={operations.toggle} aria-expanded={operations.open}
            className="mt-1 text-xs text-muted-foreground transition-colors hover:text-foreground">
            {operations.open ? "Hide" : "Show"} {operations.count} Python operation{operations.count === 1 ? "" : "s"}
          </button>
        )}
        {entry.state === "failed" && entry.details.length > 0 ? (
          <ul className="mt-1.5 space-y-1 text-xs leading-relaxed">{entry.details.map((d, i) => <li key={i}>{d}</li>)}</ul>
        ) : hasMore && (
          <details className="group/details mt-1 text-xs leading-relaxed text-muted-foreground">
            <summary className="w-fit cursor-pointer list-none transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
              <span className="group-open/details:hidden">Details</span><span className="hidden group-open/details:inline">Hide details</span>
            </summary>
            <ul className="mt-1.5 space-y-1 border-l border-border pl-3">
              {[...entry.details, ...entry.notes].map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </details>
        )}
        {entry.state === "failed" && entry.notes.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{entry.notes.at(-1)}</p>}
      </div>
      {/* Where this step sits within the run: a quiet waterfall, desktop only. */}
      <span className="hidden h-4 items-center sm:flex" aria-hidden>
        <span className="relative h-1 w-full rounded-full bg-muted">
          {hasBar && <span
            className={cn("absolute inset-y-0 rounded-full",
              entry.state === "failed" ? "bg-destructive/60" : entry.state === "running" ? "bg-foreground/70"
                : entry.kind === "gap" ? "bg-muted-foreground/25" : "bg-foreground/35")}
            style={{ left: `${Math.min(100, (offset / span) * 100)}%`, width: `max(2px, ${Math.min(100, (duration / span) * 100)}%)` }}
          />}
        </span>
      </span>
      <span className={cn("pt-px text-right text-xs tabular-nums", entry.state === "running" ? "text-foreground" : "text-muted-foreground")}>
        {duration !== undefined && duration >= 1000 ? formatDuration(duration) : ""}
      </span>
    </li>
  );
}

function TimelineList({ entries, origin, span, now }: { entries: TimelineEntry[]; origin?: number; span: number; now: number }) {
  // Python operations stay visible while their step runs, then fold away.
  const [toggled, setToggled] = useState<string[]>([]);
  return (
    <ol className="relative before:absolute before:inset-y-4 before:left-2 before:w-px before:bg-border sm:before:left-[calc(2.75rem+0.75rem+0.5rem)]">
      {entries.flatMap(entry => {
        const children = entry.children ?? [];
        const open = entry.state === "running" ? !toggled.includes(entry.key) : toggled.includes(entry.key);
        const toggle = () => setToggled(prev => prev.includes(entry.key) ? prev.filter(k => k !== entry.key) : [...prev, entry.key]);
        return [
          <Row key={entry.key} entry={entry} origin={origin} span={span} now={now}
            operations={children.length ? { count: children.length, open, toggle } : undefined} />,
          ...(open ? children.map(child => <Row key={child.key} entry={child} origin={origin} span={span} now={now} nested />) : []),
        ];
      })}
    </ol>
  );
}

/**
 * A run's steps in order, with when each started, how long it took, and
 * where that time sits in the whole run. Rows cover the full elapsed time,
 * including preparation between steps, so nothing is left unexplained.
 */
export function WorkflowRunTimeline({ entries, earlier, startedAt, completedAt, running }: {
  entries: TimelineEntry[]; earlier: TimelineEntry[]; startedAt: string | null; completedAt: string | null; running: boolean;
}) {
  const now = useNow(running);
  const origin = startedAt ? Date.parse(startedAt) : entries.find(e => e.start !== undefined)?.start;
  const finish = running ? now : completedAt ? Date.parse(completedAt) : Math.max(...entries.map(e => e.end ?? e.start ?? 0));
  const span = origin !== undefined ? Math.max(1, finish - origin) : 0;
  const earlierOrigin = earlier.find(e => e.start !== undefined)?.start;
  const earlierSpan = earlierOrigin !== undefined ? Math.max(1, ...earlier.map(e => (e.end ?? e.start ?? 0) - earlierOrigin)) : 0;

  return (
    <div className="flex flex-col gap-3">
      {entries.length === 0
        ? <p className="text-xs text-muted-foreground">No steps recorded for this run.</p>
        : <TimelineList entries={entries} origin={origin} span={span} now={now} />}
      {earlier.length > 0 && (
        <details className="group/earlier text-xs text-muted-foreground">
          <summary className="w-fit cursor-pointer list-none transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
            Earlier attempt · {earlier.filter(e => e.kind === "step").length} steps
          </summary>
          <div className="mt-2 opacity-80">
            <TimelineList entries={earlier} origin={earlierOrigin} span={earlierSpan} now={now} />
          </div>
        </details>
      )}
    </div>
  );
}
