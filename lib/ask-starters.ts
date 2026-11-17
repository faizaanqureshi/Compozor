import type { AskScope } from "./ask";

export const GLOBAL_STARTERS = [
  "Who's still missing their T4?",
  "Which workflow runs need review?",
  "Who hasn't replied in two weeks?",
  "Which drafts are waiting for my approval?",
];

// Starter questions follow what the staff member is looking at.
export function scopedStarters(scope: AskScope | null): string[] {
  if (!scope) return GLOBAL_STARTERS;
  const first = (scope.clientName ?? scope.label).split(/\s+/)[0];
  switch (scope.kind) {
    case "client":
      return [
        `When did we last follow up with ${first}, and what has come in?`,
        `What's still outstanding for ${first}?`,
        `Draft a friendly check-in email to ${first}`,
        `Anything in ${first}'s workflow runs that needs review?`,
      ];
    case "workflow":
      return [
        "Which clients is this workflow ready to run for?",
        "Why did recent runs need review?",
        "Run it for everyone whose documents are complete",
        "What does this workflow produce?",
      ];
    case "run":
      return ["Why did this run need review?", "What did it produce?", "Can I retry it?", "Re-run it"];
    case "email":
      return [
        "Summarise this thread",
        "Draft a reply",
        `What has ${first} sent us so far?`,
        `What's still outstanding for ${first}?`,
      ];
  }
}

