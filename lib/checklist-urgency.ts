import type { ChecklistItem } from "@/lib/api";

// "Deadline" isn't a dedicated field anywhere in the data model - the closest
// thing is ChecklistItem.expected_date_range_end, an AI-extracted date that's
// null whenever a request had no date context. Treating "no deadline" the
// same as "deadline >3 days out" (both = on_track) is deliberate, not a
// missing-data workaround - see the design discussion on COM-8.
//
// Shared between components/urgency-dashboard.tsx and the client detail
// page's checklist table so "red/yellow/neutral" means the exact same thing
// everywhere it's shown, not two independently-drifting copies of this logic.
export type Tier = "overdue" | "due_soon" | "on_track";

export const MS_PER_DAY = 86_400_000;

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function computeTier(item: ChecklistItem, today: Date): { tier: Tier; daysUntil: number | null } {
  if (!item.expected_date_range_end) return { tier: "on_track", daysUntil: null };
  const end = startOfDay(new Date(`${item.expected_date_range_end}T00:00:00`));
  const daysUntil = Math.round((end.getTime() - today.getTime()) / MS_PER_DAY);
  if (daysUntil < 0) return { tier: "overdue", daysUntil };
  if (daysUntil <= 3) return { tier: "due_soon", daysUntil };
  return { tier: "on_track", daysUntil };
}

export const TIER_RANK: Record<Tier, number> = { overdue: 0, due_soon: 1, on_track: 2 };

// Reuses the app's existing semantic tokens (DESIGN_SYSTEM.md §6) rather than
// inventing a new severity color: destructive = broken/critical, accent =
// needs attention, success = the calm default.
export const TIER_META: Record<Tier, { label: string; dot: string; text: string }> = {
  overdue: { label: "Overdue", dot: "bg-destructive", text: "text-destructive" },
  due_soon: { label: "Due soon", dot: "bg-accent", text: "text-accent" },
  on_track: { label: "On track", dot: "bg-success", text: "text-muted-foreground" },
};
