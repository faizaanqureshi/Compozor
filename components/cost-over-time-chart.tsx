"use client";

// A restrained, single-series area chart with no external charting
// dependency - the dataset here (a handful to a few hundred time buckets)
// doesn't warrant pulling in a charting library. Follows the dataviz
// conventions used elsewhere in this app: one sequential hue, a light area
// wash, a hairline baseline/gridlines, and a hover crosshair + tooltip -
// never a legend, since a single series is already named by the section
// title.
//
// The SVG's viewBox is kept in sync with the container's actual measured
// pixel size (via ResizeObserver) rather than a fixed viewBox scaled to fit
// via preserveAspectRatio - that non-uniform scaling was stretching both
// the geometry and the <text> glyphs (font size scales with the transform
// too), since the container's aspect ratio never matches a fixed
// width:height ratio. A 1:1 viewBox-to-pixel mapping means nothing is ever
// resized after the fact, so text renders at its literal font size.

import { useEffect, useMemo, useRef, useState } from "react";

// The sidebar's own color token - same brand teal-charcoal in both light and
// dark mode (see --sidebar in globals.css) - so the line matches the
// sidebar exactly rather than approximating it with a separate hue.
const LINE_COLOR = "var(--color-sidebar)";

export interface ChartPoint {
  label: string;
  value: number;
}

const PADDING = { top: 16, right: 12, bottom: 28, left: 12 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function useContainerSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

export function CostOverTimeChart({
  data,
  formatValue,
}: {
  data: ChartPoint[];
  formatValue: (value: number) => string;
}) {
  const [containerRef, { width, height }] = useContainerSize<HTMLDivElement>();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const isEmpty = data.length === 0;
  // An empty window still gets the full chart chrome (axis, $0 gridline, a
  // flat baseline) rather than collapsing to a bare sentence - a "no data
  // yet" org should still look like the same dashboard, just quiet.
  const plotted = useMemo(
    () => (isEmpty ? [{ label: "", value: 0 }, { label: "", value: 0 }] : data),
    [isEmpty, data]
  );

  const plotWidth = Math.max(width - PADDING.left - PADDING.right, 0);
  const plotHeight = Math.max(height - PADDING.top - PADDING.bottom, 0);
  const baselineY = PADDING.top + plotHeight;

  const maxValue = useMemo(
    () => (isEmpty ? 1 : niceMax(Math.max(...plotted.map((d) => d.value), 0))),
    [isEmpty, plotted]
  );

  const points = useMemo(
    () =>
      plotted.map((d, i) => {
        const x =
          plotted.length > 1
            ? PADDING.left + (i / (plotted.length - 1)) * plotWidth
            : PADDING.left + plotWidth / 2;
        const y = baselineY - (maxValue === 0 ? 0 : (d.value / maxValue) * plotHeight);
        return { x, y, ...d };
      }),
    [plotted, maxValue, plotWidth, baselineY, plotHeight]
  );

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
      : "";

  const ticks = [0, 0.5, 1].map((f) => ({
    y: baselineY - f * plotHeight,
    value: maxValue * f,
  }));

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isEmpty || points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - relativeX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  };

  const hovered = !isEmpty && hoverIndex !== null ? points[hoverIndex] : null;
  // Keep the tooltip from clipping off the right edge for points near the end.
  const tooltipAlign = hovered && width > 0 && hovered.x > width * 0.7 ? "right" : "left";

  return (
    <div ref={containerRef} className="relative h-56">
      {width > 0 && height > 0 && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-full w-full touch-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
          role="img"
          aria-label="Cost over time"
        >
          {ticks.map((t, i) => (
            <line
              key={i}
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={t.y}
              y2={t.y}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
          ))}
          {isEmpty ? (
            <line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={baselineY}
              y2={baselineY}
              stroke={LINE_COLOR}
              strokeWidth={2}
              strokeDasharray="1 5"
              strokeLinecap="round"
              opacity={0.4}
            />
          ) : (
            <>
              <path d={areaPath} fill={LINE_COLOR} fillOpacity={0.1} stroke="none" />
              <path
                d={linePath}
                fill="none"
                stroke={LINE_COLOR}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </>
          )}

          {hovered && (
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PADDING.top}
              y2={baselineY}
              stroke="var(--color-border)"
              strokeWidth={1}
            />
          )}
          {!isEmpty &&
            points.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={p.y}
                r={hoverIndex === i ? 5 : 4}
                fill={LINE_COLOR}
                stroke="var(--color-card)"
                strokeWidth={2}
                opacity={hoverIndex === i || hoverIndex === null ? 1 : 0.35}
              />
            ))}

          {ticks.map((t, i) => (
            <text
              key={i}
              x={PADDING.left}
              y={t.y - 4}
              fontSize={9}
              fill="var(--color-muted-foreground)"
            >
              {formatValue(t.value)}
            </text>
          ))}
          {!isEmpty &&
            // A single point IS both the first and last point - labeling it
            // twice at the same x (once left-anchored, once right-anchored)
            // renders as one string glued to another, e.g. "Jul 9Jul 9".
            (points.length > 1 ? [points[0], points[points.length - 1]] : points).map(
              (p, i) =>
                p && (
                  <text
                    key={i}
                    x={p.x}
                    y={height - 8}
                    fontSize={10}
                    fill="var(--color-muted-foreground)"
                    textAnchor={points.length === 1 ? "middle" : i === 0 ? "start" : "end"}
                  >
                    {p.label}
                  </text>
                )
            )}
        </svg>
      )}

      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="rounded-full bg-card px-3 py-1 text-xs text-muted-foreground">
            No usage yet
          </span>
        </div>
      )}

      {hovered && width > 0 && (
        <div
          className="pointer-events-none absolute top-2 flex flex-col gap-0.5 rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-sm"
          style={{
            [tooltipAlign === "left" ? "left" : "right"]:
              tooltipAlign === "left"
                ? `${(hovered.x / width) * 100}%`
                : `${100 - (hovered.x / width) * 100}%`,
          }}
        >
          <span className="text-muted-foreground">{hovered.label}</span>
          <span className="font-medium text-popover-foreground">{formatValue(hovered.value)}</span>
        </div>
      )}
    </div>
  );
}
