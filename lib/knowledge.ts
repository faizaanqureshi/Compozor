// Firm knowledge: what the assistant may know about the firm. Presentation
// rules only; the backend decides what reaches a client.

export type Audience = "clients" | "internal";

export const AUDIENCE_OPTIONS: { value: Audience; title: string; body: string }[] = [
  { value: "clients", title: "OK to tell clients", body: "Can be used to answer client emails." },
  { value: "internal", title: "Internal only", body: "Guides the assistant. Never shared." },
];

export const audienceLabel = (audience: Audience) => (audience === "clients" ? "Clients" : "Internal");

// Starting points for an empty knowledge base. Each opens the add dialog
// prefilled, so firms see the shape of a useful entry rather than a blank box.
export const KNOWLEDGE_EXAMPLES: { title: string; prompt: string; body: string }[] = [
  {
    title: "Fees",
    prompt: "What you charge for your common services",
    body: "Personal tax return: $___ for one person, $___ for a couple.\nPayment is due when ___.",
  },
  {
    title: "Office hours",
    prompt: "When you're open and how to reach you",
    body: "Monday to Friday, ___ to ___.\nBest way to reach us: ___.",
  },
  {
    title: "Holiday closures",
    prompt: "Dates the office is closed",
    body: "Closed from ___ to ___. Emails are answered from ___.",
  },
];

export const KNOWLEDGE_UPLOAD_ACCEPT = ".pdf,.docx,.txt,.md";

// Automated messages (reminders, receipts, invitations) aren't answers worth keeping.
const AUTOMATED_CATEGORIES = new Set([
  "reminder",
  "commitment_followup",
  "checklist_update",
  "receipt",
  "portal_invitation",
  "meeting_proposal",
  "acknowledgment",
]);

export function canSaveAsKnowledge(entry: {
  direction: string;
  status: string;
  thread_id: string | null;
  content: string | null;
  safety_checks?: { category?: string | null } | null;
}): boolean {
  if (entry.direction !== "outbound" || entry.status !== "sent" || !entry.thread_id) return false;
  if (!(entry.content ?? "").trim()) return false;
  const category = entry.safety_checks?.category;
  return !category || !AUTOMATED_CATEGORIES.has(category);
}

export function updatedLabel(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const days = Math.floor((now.getTime() - then.getTime()) / 86_400_000);
  if (days < 1 && now.toDateString() === then.toDateString()) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(then.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

// "Dec 31, 2026" for a YYYY-MM-DD end date, read as a calendar day (no time zone shift).
export function validUntilLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
