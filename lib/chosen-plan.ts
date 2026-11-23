// The plan a visitor clicked on the pricing page, kept in this browser until
// they finish onboarding, so it can be offered as one click to pay. Every
// sign-up still starts the free trial; this only remembers the choice.
import type { PlanKey } from "@/lib/api";

const KEY = "compozor:chosen-plan";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PLAN_KEYS: PlanKey[] = ["solo", "team", "practice", "firm"];

export type ChosenPlan = { plan: PlanKey; currency: "CAD" | "USD" };

export function saveChosenPlan(choice: ChosenPlan) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...choice, at: Date.now() }));
  } catch {
    /* preference only */
  }
}

export function readChosenPlan(): ChosenPlan | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!saved || Date.now() - saved.at > MAX_AGE_MS || !PLAN_KEYS.includes(saved.plan)) return null;
    return { plan: saved.plan, currency: saved.currency === "USD" ? "USD" : "CAD" };
  } catch {
    return null;
  }
}

export function clearChosenPlan() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* preference only */
  }
}
