import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface StatStripItem {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  // A semantic text class for the figure (e.g. text-destructive) when it
  // signals something; most figures stay in the default foreground.
  tone?: string;
}

// One band of headline figures separated by hairlines, answering "where do
// things stand?" before any detail. Cells draw their own top/left hairlines
// and the grid is pulled up and left by one pixel, so the outer row and
// column edges are clipped at any column count, with no empty-cell artifacts.
export function StatStrip({
  items,
  loading,
  skeletonCount = 5,
  columns = "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
  label,
}: {
  items: StatStripItem[];
  loading?: boolean;
  skeletonCount?: number;
  columns?: string;
  label: string;
}) {
  return (
    <section aria-label={label} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className={cn("-mt-px -ml-px grid", columns)}>
        {loading
          ? Array.from({ length: skeletonCount }).map((_, i) => (
              <div key={i} className="flex flex-col gap-3 border-t border-l border-border p-5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-12" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))
          : items.map((item) => (
              <div key={item.label} className="flex min-w-0 flex-col gap-1.5 border-t border-l border-border p-5">
                <span className="text-[0.6875rem] tracking-wider text-muted-foreground uppercase">{item.label}</span>
                <span className={cn("text-2xl font-light tracking-tight tabular-nums", item.tone)}>{item.value}</span>
                {item.detail !== undefined && (
                  <span className="truncate text-xs text-muted-foreground">{item.detail}</span>
                )}
              </div>
            ))}
      </div>
    </section>
  );
}

// Thin collection-progress rule used inside strip details and table cells.
export function ProgressRule({ value, total, className }: { value: number; total: number; className?: string }) {
  return (
    <span className={cn("block h-1 w-16 overflow-hidden rounded-full bg-muted", className)} aria-hidden>
      <span
        className="block h-full rounded-full bg-success"
        style={{ width: `${total ? Math.min(100, (value / total) * 100) : 0}%` }}
      />
    </span>
  );
}
