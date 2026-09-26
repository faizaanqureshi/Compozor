import { cn } from "@/lib/utils";

// The dashboard's standard section card: a quiet title with optional muted
// meta beside it, actions on the right, and a hairline ring for an edge.
// Shared by the Clients overview and the client details page.
export function Panel({
  title,
  meta,
  action,
  loadError,
  className,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  // One failed request shows a quiet note in its own section instead of
  // breaking the whole page.
  loadError?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10", className)}>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="text-[0.9375rem] font-medium tracking-tight">{title}</h2>
          {meta && <div className="text-sm text-muted-foreground">{meta}</div>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>
      {loadError ? (
        <p className="text-sm text-muted-foreground" title={loadError}>
          Couldn&apos;t load this section right now.
        </p>
      ) : (
        children
      )}
    </section>
  );
}

// Quiet uppercase table header cell, shared by dashboard tables.
export const panelTableHead =
  "py-1.5 pr-4 pb-2.5 text-left text-[0.6875rem] font-normal tracking-wider text-muted-foreground uppercase";
