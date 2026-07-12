"use client";

// Horizontal bars for comparing cost across a handful of categories
// (feature/model/client) - horizontal rather than vertical columns because
// these labels (feature names, model ids, client names) run long. One
// sequential hue (chart-2, the forest-teal step of the palette), direct
// value-at-tip labels per mark, so nothing depends on hovering - a title
// attribute still surfaces the exact pair on hover/focus for parity with
// the other charts.

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BarChartPoint {
  label: string;
  value: number;
}

// A quiet empty-state track (no data to compare) rather than nothing at all,
// so an unused org's admin page still reads as "the same dashboard, empty"
// instead of a missing section.
const PLACEHOLDER_ROWS = 3;

// Matches UsageTable's row limit below it in the same card - past this many
// categories, the bars stop being a quick scan and the list should collapse
// behind the same expand toggle as the table.
const BAR_ROW_LIMIT = 5;

export function CostBarChart({
  data,
  formatValue,
}: {
  data: BarChartPoint[];
  formatValue: (value: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (data.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: PLACEHOLDER_ROWS }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 opacity-40">
            <span className="h-3 w-20 shrink-0 rounded-full bg-muted" />
            <span className="h-3 flex-1 rounded-full bg-muted" />
          </div>
        ))}
        <span className="text-xs text-muted-foreground">No usage yet</span>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 0) || 1;
  const hasMore = data.length > BAR_ROW_LIMIT;
  const visible = expanded ? data : data.slice(0, BAR_ROW_LIMIT);

  return (
    <div className="flex flex-col gap-3">
      {visible.map((d, i) => (
        <div
          key={i}
          className="flex items-center gap-3"
          title={`${d.label}: ${formatValue(d.value)}`}
        >
          <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{d.label}</span>
          <div className="relative h-3 flex-1 rounded-full bg-muted">
            <div
              className="h-3 rounded-full bg-[var(--color-chart-2)] transition-[width]"
              style={{ width: `${Math.max((d.value / max) * 100, d.value > 0 ? 2 : 0)}%` }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-xs text-foreground/80 tabular-nums">
            {formatValue(d.value)}
          </span>
        </div>
      ))}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? "Show less" : `Show all ${data.length}`}
          <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}
