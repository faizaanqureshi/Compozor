import { EmailStatus, InboundEmailCategory, InboundEmailReviewStatus, UsageBucket } from "@/lib/api";
import type { RangePreset } from "@/lib/admin";

// Centralized so pages that fetch the same resource (e.g. clients/page.tsx and
// email-log/page.tsx both list the full email log) share one SWR cache entry
// instead of refetching on every navigation between them.
export const clientsKey = () => ["clients"] as const;

export const emailLogKey = (status?: EmailStatus, resolved?: boolean) =>
  ["email-log", status ?? "all", resolved ?? "any"] as const;

export const organizationKey = () => ["organization"] as const;

export const inboxConnectionsKey = () => ["inbox-connections"] as const;

export const calendarConnectionsKey = () => ["calendar-connections"] as const;

export const clientMeetingsKey = (clientId: number) => ["client-meetings", clientId] as const;

export const unmatchedEmailsKey = (filters?: {
  review_status?: InboundEmailReviewStatus;
  category?: InboundEmailCategory;
}) =>
  [
    "unmatched-emails",
    filters?.review_status ?? "all",
    filters?.category ?? "all",
  ] as const;

export const adminOrganizationsKey = (range: RangePreset) => ["admin-organizations", range] as const;

export const adminUsageOverviewKey = (bucket: UsageBucket, range: RangePreset) =>
  ["admin-usage-overview", bucket, range] as const;

export const adminOrganizationUsageKey = (organizationId: number, bucket: UsageBucket, range: RangePreset) =>
  ["admin-organization-usage", organizationId, bucket, range] as const;
