// Plain-language descriptions of a service's schedule, shared by the Services
// page, the service form and the client page.
import type { Service, ServiceCadence, ServiceInput } from "@/lib/api";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];

export const CADENCE_LABELS: Record<ServiceCadence, string> = {
  one_off: "One-off",
  yearly: "Every year",
  quarterly: "Every quarter",
  monthly: "Every month",
};

const PERIOD_NOUN: Record<ServiceCadence, string> = {
  one_off: "it's assigned",
  yearly: "the year ends",
  quarterly: "each quarter ends",
  monthly: "each month ends",
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "Due Apr 30" or "Due 1 month after each quarter ends". */
export function dueDescription(service: Pick<ServiceInput, "cadence" | "due_rule" | "due_month" | "due_day" |
  "due_months_after" | "due_days_after">): string {
  if (service.due_rule === "fixed_date" && service.due_month && service.due_day) {
    return `Due ${MONTHS[service.due_month - 1].slice(0, 3)} ${service.due_day}`;
  }
  const parts = [
    service.due_months_after ? plural(service.due_months_after, "month") : null,
    service.due_days_after ? plural(service.due_days_after, "day") : null,
  ].filter(Boolean);
  return `Due ${parts.join(" and ")} after ${PERIOD_NOUN[service.cadence]}`;
}

/** "Every year · Due Apr 30". */
export function scheduleDescription(service: Service): string {
  return `${CADENCE_LABELS[service.cadence]} · ${dueDescription(service)}`;
}

/** "Feb 15, 2027" from an ISO date (read as a calendar day, not a time). */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${d}, ${y}`;
}
