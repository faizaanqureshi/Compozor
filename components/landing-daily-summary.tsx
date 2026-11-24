import depth from "@/components/landing-depth.module.css";
import { Sun } from "lucide-react";

const DONE: [string, string][] = [
  ["42", "clients chased"],
  ["61", "documents filed and checked"],
  ["7", "personal tax returns prepared"],
];

const NEEDS_YOU = [
  "3 returns ready to approve",
  "Maya Chen asked about her RRSP limit",
];

/** Static illustration of the daily summary email. Fictional data; nothing here runs. */
export function LandingDailySummary() {
  return (
    <figure className={`${depth.paper} overflow-hidden rounded-xl border border-border bg-card`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <p className="flex items-center gap-2 text-sm">
          <Sun className="size-3.5 text-marketing-forest dark:text-marketing-brass" aria-hidden />
          Your daily summary
        </p>
        <span className="text-[0.625rem] uppercase tracking-widest text-muted-foreground">
          Illustrative preview
        </span>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Yesterday</p>
          <dl className="mt-3 grid grid-cols-3 gap-3">
            {DONE.map(([count, label]) => (
              <div key={label}>
                <dt className="sr-only">{label}</dt>
                <dd className="text-2xl font-light tracking-tight tabular-nums">{count}</dd>
                <dd className="mt-1 text-xs leading-snug text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="border-t border-border pt-4">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Needs you</p>
          <ul className="mt-3 space-y-2 text-sm">
            {NEEDS_YOU.map((item) => (
              <li key={item} className="flex gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="border-t border-border pt-4 text-sm text-muted-foreground">
          Due this week: Q4 HST for 12 clients, 9 complete.
        </p>
      </div>
      <figcaption className="border-t border-border px-5 py-3 text-[0.625rem] text-muted-foreground sm:px-6">
        Fictional example · no emails are sent here
      </figcaption>
    </figure>
  );
}
