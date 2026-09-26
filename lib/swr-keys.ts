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

export const workflowsKey = () => ["workflows"] as const;

export const packagesKey = () => ["packages"] as const;

// Client detail page sections. Cached so reopening a client renders the last
// known state immediately and revalidates in the background.
export const clientKey = (clientId: number) => ["client", clientId] as const;
export const clientChecklistKey = (clientId: number) => ["client-checklist", clientId] as const;
export const clientThreadsKey = (clientId: number) => ["client-threads", clientId] as const;
export const clientDocumentsKey = (clientId: number) => ["client-documents", clientId] as const;
export const clientMemoryNotesKey = (clientId: number) => ["client-memory-notes", clientId] as const;
export const clientCommitmentsKey = (clientId: number) => ["client-commitments", clientId] as const;
// Written by the page's live workflow refresher (SSE + polling), not fetched by SWR.
export const clientWorkflowSnapshotKey = (clientId: number) => ["client-workflow-snapshot", clientId] as const;

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
