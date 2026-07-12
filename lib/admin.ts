import type { UsageBucket } from "@/lib/api";

// Mirrors the backend's INTERNAL_ADMIN_EMAILS allowlist (see
// accounting-saas/app/config.py's internal_admin_emails) so the sidebar icon
// and /admin pages don't flash for non-admins. This is a UX nicety only, not
// the real security boundary - the backend's get_internal_admin dependency
// (checked against *verified* Clerk emails) is what actually enforces this,
// and NEXT_PUBLIC_* values are baked into the client bundle anyway.
const ADMIN_EMAILS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export const isAdminEmail = (email?: string | null) =>
  !!email && ADMIN_EMAILS.has(email.toLowerCase());

// Shared by the org list page's cross-org chart and the org detail page's
// by-period chart - both let the viewer pick the same four granularities.
export const USAGE_BUCKETS: { value: UsageBucket; label: string }[] = [
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

export function periodLabel(iso: string, bucket: UsageBucket): string {
  const date = new Date(iso);
  if (bucket === "year") return date.toLocaleDateString(undefined, { year: "numeric" });
  if (bucket === "month") return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// The date-range filter shared by the org list page and the org detail
// page - both scope every stat, chart, and table on the page to the same
// window (see RangeToggle), so a viewer never sees the hero total spend
// disagree with the table below it. "all" omits start/end entirely rather
// than passing a start of "the epoch," since the backend already treats a
// missing start as unbounded.
export type RangePreset = "all" | "7d" | "30d" | "90d" | "year";

export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "year", label: "This year" },
];

export function rangeLabel(range: RangePreset): string {
  return RANGE_PRESETS.find((r) => r.value === range)?.label ?? "All time";
}

// The chart used to expose bucket granularity (day/week/month/year) as its
// own separate selector, but that read as a second, redundant filter next
// to the range toggle above it - so the bucket is now derived from the
// range instead of chosen independently, picking whichever granularity
// keeps the trend chart legible (a year of daily buckets is unreadable
// noise; a week of monthly buckets is a single flat line).
export function autoBucketForRange(range: RangePreset): UsageBucket {
  switch (range) {
    case "7d":
    case "30d":
      return "day";
    case "90d":
      return "week";
    case "year":
    case "all":
      return "month";
  }
}

export function rangeToWindow(range: RangePreset): { start?: string; end?: string } {
  if (range === "all") return {};
  const now = new Date();
  if (range === "year") {
    return { start: new Date(now.getFullYear(), 0, 1).toISOString() };
  }
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return { start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString() };
}
