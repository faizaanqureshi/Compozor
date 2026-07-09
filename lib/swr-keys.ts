import { EmailStatus, InboundEmailCategory, InboundEmailReviewStatus } from "@/lib/api";

// Centralized so pages that fetch the same resource (e.g. clients/page.tsx and
// email-log/page.tsx both list the full email log) share one SWR cache entry
// instead of refetching on every navigation between them.
export const clientsKey = () => ["clients"] as const;

export const emailLogKey = (status?: EmailStatus) =>
  ["email-log", status ?? "all"] as const;

export const organizationKey = () => ["organization"] as const;

export const inboxConnectionsKey = () => ["inbox-connections"] as const;

export const unmatchedEmailsKey = (filters?: {
  review_status?: InboundEmailReviewStatus;
  category?: InboundEmailCategory;
}) =>
  [
    "unmatched-emails",
    filters?.review_status ?? "all",
    filters?.category ?? "all",
  ] as const;
