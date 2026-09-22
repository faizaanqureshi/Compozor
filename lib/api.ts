import { subscribeSSE } from "./sse";
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function responseError(res: Response): Promise<ApiError> {
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    message = typeof body.detail === "string"
      ? body.detail
      : JSON.stringify(body.detail ?? body);
  } catch {
    // A proxy or storage outage can return a non-JSON error page.
  }
  return new ApiError(res.status, message);
}

type ClerkGlobal = {
  loaded?: boolean;
  load?: () => Promise<void>;
  session?: { getToken: () => Promise<string | null> };
};

// On a hard refresh, Clerk's bootstrap script hasn't run yet, so
// `window.Clerk` itself is briefly undefined - not just unloaded. Bailing out
// as soon as that's true (rather than waiting for the script to attach it)
// made every early fetch (e.g. onboarding's on-mount load) race the page
// load: lose the race and the backend's 401 forced a sign-out redirect for a
// user who was, in fact, signed in. Poll for the global for a couple seconds
// before giving up, in addition to the existing `load()` wait below for once
// it exists but hasn't finished validating the session.
async function waitForClerkGlobal(timeoutMs = 3000): Promise<ClerkGlobal | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const clerk = (window as unknown as { Clerk?: ClerkGlobal }).Clerk;
    if (clerk) return clerk;
    if (Date.now() >= deadline) return undefined;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const clerk = await waitForClerkGlobal();
  if (!clerk) return null;
  if (!clerk.loaded && clerk.load) await clerk.load();
  if (!clerk.session) return null;
  return clerk.session.getToken();
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      const redirect = encodeURIComponent(
        window.location.pathname + window.location.search
      );
      window.location.href = `/sign-in?redirect_url=${redirect}`;
    }
    throw new ApiError(401, "Not authenticated");
  }
  if (!res.ok) {
    throw await responseError(res);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function json(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ---------- Types ----------

export type ClientStatus = "active" | "inactive";
export type ChecklistItemStatus = "missing" | "received" | "wrong";
export type EmailDirection = "inbound" | "outbound";
export type EmailStatus = "received" | "draft" | "sent" | "needs_human_attention";
export type InboxConnectionStatus = "active" | "needs_reauth";
export type AutomationLevel =
  | "no_automation"
  | "medium_automation"
  | "high_automation";
export type InboundEmailCategory =
  | "potential_new_client"
  | "spam"
  | "automated"
  | "other";
export type InboundEmailReviewStatus = "needs_review" | "dismissed";
export type CommitmentStatus = "pending" | "fulfilled" | "cancelled" | "escalated";

export interface Organization {
  id: number;
  name: string;
  automation_level: AutomationLevel;
  reminder_interval_days: number | null;
  practice_description: string | null;
  jurisdiction: string | null;
  // The signed-in person's own name, distinct from `name` (the firm).
  contact_name: string | null;
  // Canonical form is always exactly 10 raw digits (e.g. "9057490504"),
  // never pre-formatted - see lib/phone.ts for formatting/parsing this
  // for display and input.
  phone: string | null;
  practice_type: string | null;
  // User-authored, deterministically appended to outbound emails by the
  // backend - never AI-written. Null/empty means the backend falls back
  // to a generated "Best,\n{contact_name or name}".
  email_signature: string | null;
  onboarding_completed_at: string | null;
}

export interface Client {
  id: number;
  organization_id: number;
  name: string;
  email: string;
  phone: string | null;
  company_name: string | null;
  status: ClientStatus;
  last_reminder_sent_at: string | null;
  created_at: string;
  archived_at: string | null;
}

export interface ChecklistItem {
  id: number;
  client_id: number;
  doc_type_needed: string;
  status: ChecklistItemStatus;
  expected_date_range_start: string | null;
  expected_date_range_end: string | null;
  description: string | null;
  wrong_attempt_count: number;
  last_wrong_doc_type: string | null;
  package_id: number | null;
  package_name: string | null;
  package_document_id: number | null;
}

export interface ChecklistSummary {
  total: number;
  missing: number;
  received: number;
  wrong: number;
  items: ChecklistItem[];
}

export interface ClientWorkflowStatus {
  workflow_id: number;
  workflow_name: string;
  workflow_archived: boolean;
  // null = assigned but never run yet (checklist not complete)
  status: WorkflowRunStatus | null;
}

export interface ClientPackage {
  package_id: number;
  package_name: string;
}

export interface ClientWithChecklistSummary extends Client {
  checklist_summary: ChecklistSummary;
  workflow_statuses: ClientWorkflowStatus[];
  assigned_packages: ClientPackage[];
}

export interface ClientDetail extends Client {
  checklist_items: ChecklistItem[];
  assigned_package_ids: number[];
  workflow_statuses: ClientWorkflowStatus[];
}

export interface DocumentOut {
  id: number;
  client_id: number;
  checklist_item_id: number | null;
  email_log_id: number | null;
  s3_path: string;
  classified_type: string | null;
  year: number | null;
  extracted_metadata: unknown;
  received_at: string;
  download_url: string | null;
}

export interface DocumentUploadResult {
  document: DocumentOut;
  checklist_item_id: number | null;
  checklist_item_status: ChecklistItemStatus | null;
  draft_email_created: boolean;
}

export interface ClientUploadLink {
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface ClientUploadLinkCreated extends ClientUploadLink {
  // Only present on the response right after create/regenerate - the
  // backend never returns the raw token again after this.
  upload_url: string;
}

export interface EmailReplyResult {
  has_attachment: boolean;
  has_question: boolean;
  document_results: DocumentUploadResult[];
  reply_email_log_id: number | null;
  needs_human_attention: boolean;
  needs_clarification: boolean;
}

export interface ToolTrajectoryStep {
  round: number;
  tool: string;
  arguments: Record<string, unknown>;
  result: string;
}

export interface EmailLogEntry {
  id: number;
  client_id: number;
  direction: EmailDirection;
  thread_id: string | null;
  status: EmailStatus;
  subject: string | null;
  content: string;
  from_email: string | null;
  to_email: string | null;
  escalation_reason: string | null;
  resolved_at: string | null;
  is_clarifying_question: boolean;
  autosend_confidence: number | null;
  autosend_threshold: number | null;
  automation_level_at_decision: AutomationLevel | null;
  autosent: boolean;
  autosend_error: string | null;
  delivery_state?: "pending" | "sending" | "uncertain" | "failed" | "sent";
  safety_checks?: { passed: boolean; category: string; reason?: string | null } | null;
  tool_trajectory: ToolTrajectoryStep[] | null;
  created_at: string;
  archived_at: string | null;
  documents: DocumentOut[];
}

export interface EmailThread {
  thread_key: string;
  messages: EmailLogEntry[];
}

export interface ClientMemoryNote {
  id: number;
  client_id: number;
  note: string;
  source_email_log_id: number | null;
  superseded_at: string | null;
  created_at: string;
}

export interface ClientCommitment {
  id: number;
  client_id: number;
  checklist_item_id: number | null;
  description: string;
  expected_by: string | null;
  status: CommitmentStatus;
  source_email_log_id: number | null;
  fulfilled_at: string | null;
  followup_email_log_id: number | null;
  last_followup_sent_at: string | null;
  created_at: string;
}

export interface UnmatchedInboundEmail {
  id: number;
  organization_id: number;
  inbox_connection_id: number;
  from_email: string;
  subject: string | null;
  body_text: string;
  category: InboundEmailCategory;
  ai_reason: string;
  ai_confidence: number;
  review_status: InboundEmailReviewStatus;
  created_at: string;
}

export interface InboxConnection {
  provider: "gmail" | "outlook";
  id: number;
  organization_id: number;
  email_address: string;
  status: InboxConnectionStatus;
}

// unpriced_call_count on every usage aggregate below: how many calls in
// that bucket have no cost figure (a model the backend's pricing table
// doesn't know yet - see openai_pricing.py). Nonzero means cost_usd
// understates real spend for that row.

export interface OrganizationUsageOut {
  id: number;
  name: string;
  created_at: string;
  client_count: number;
  call_count: number;
  unpriced_call_count: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface FeatureUsageOut {
  feature: string;
  call_count: number;
  unpriced_call_count: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface ModelUsageOut {
  model: string;
  call_count: number;
  unpriced_call_count: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export type UsageBucket = "day" | "week" | "month" | "year";

export interface PeriodUsageOut {
  period: string;
  call_count: number;
  unpriced_call_count: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface ClientUsageOut {
  client_id: number | null;
  client_name: string | null;
  call_count: number;
  unpriced_call_count: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface OrganizationUsageBreakdownOut {
  organization_id: number;
  organization_name: string;
  by_feature: FeatureUsageOut[];
  by_model: ModelUsageOut[];
  by_period: PeriodUsageOut[];
  by_client: ClientUsageOut[];
}

// ---------- Organizations ----------
//
// One Clerk user = one org. The backend derives "your" org from the
// session token, auto-provisioning it on first authenticated call — there
// is no org list/picker/id anymore.

export const getMyOrganization = () => request<Organization>("/organizations/me");

export const updateMyOrganization = (input: {
  name?: string;
  automation_level?: AutomationLevel;
  reminder_interval_days?: number | null;
  practice_description?: string;
  jurisdiction?: string;
  contact_name?: string;
  phone?: string;
  practice_type?: string;
  email_signature?: string;
  onboarding_completed?: boolean;
}) => request<Organization>("/organizations/me", json("PATCH", input));

export const deleteMyOrganization = () =>
  request<void>("/organizations/me", { method: "DELETE" });

// ---------- Clients ----------

export const listClients = () =>
  request<ClientWithChecklistSummary[]>("/clients");

export const getClient = (clientId: number) =>
  request<ClientDetail>(`/clients/${clientId}`);

export const createClient = (input: {
  name: string;
  email: string;
  phone?: string;
  company_name?: string;
  status?: ClientStatus;
}) => request<Client>("/clients", json("POST", input));

// ---------- Batch client import ----------

export interface ImportedClientRow {
  name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  missing_fields: string[];
  is_duplicate: boolean;
  duplicate_reason: string | null;
  source: string | null;
  validation_errors: string[];
}

export interface ClientImportParseResult {
  rows: ImportedClientRow[];
  status: "completed" | "processing" | "failed";
  job_id: string | null;
  completed_batches: number;
  total_batches: number;
  failed_batches: number;
  warnings: string[];
  existing_emails: string[];
}

export interface ClientImportRowIn {
  name: string;
  email: string;
  phone?: string | null;
  company_name?: string | null;
}

export interface SkippedClientImportRow {
  name: string | null;
  email: string | null;
  reason: string;
}

export interface ClientImportExecuteResult {
  created: Client[];
  skipped: SkippedClientImportRow[];
}

// Read-only/side-effect-free: extracts a structured client list from an
// uploaded file for the "Import clients" modal's confirmation table -
// nothing is created until executeClientImport is called once a human
// reviews and confirms.
export const parseClientImportFile = (file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return request<ClientImportParseResult>("/clients/import/parse", {
    method: "POST",
    body: formData,
  });
};

export const getClientImport = (jobId: string) =>
  request<ClientImportParseResult>(`/clients/import/jobs/${jobId}`);

export const retryClientImport = (jobId: string) =>
  request<ClientImportParseResult>(`/clients/import/jobs/${jobId}/retry`, { method: "POST" });

export const executeClientImport = (clients: ClientImportRowIn[], idempotencyKey: string) =>
  request<ClientImportExecuteResult>(
    "/clients/import/execute",
    { ...json("POST", { clients }), headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey } }
  );

export const updateClient = (
  clientId: number,
  input: {
    name?: string;
    email?: string;
    phone?: string | null;
    company_name?: string | null;
    status?: ClientStatus;
  }
) => request<Client>(`/clients/${clientId}`, json("PATCH", input));

export const deleteClient = (clientId: number) =>
  request<void>(`/clients/${clientId}`, { method: "DELETE" });

export const bulkDeleteClients = (clientIds: number[]) =>
  request<void>("/clients", json("DELETE", { client_ids: clientIds }));

// "Delete" above never actually removes anything - it archives. These
// power the clients page's Archive popup (list + per-row undo).
export const listArchivedClients = () => request<Client[]>("/clients/archived");

export const restoreClients = (clientIds: number[]) =>
  request<Client[]>("/clients/restore", json("POST", { client_ids: clientIds }));

// ---------- Checklist items ----------

export const listChecklistItems = (clientId: number) =>
  request<ChecklistSummary>(`/clients/${clientId}/checklist-items`);

export const createChecklistItem = (
  clientId: number,
  input: {
    doc_type_needed: string;
    status?: ChecklistItemStatus;
    expected_date_range_start?: string;
    expected_date_range_end?: string;
    description?: string;
  }
) =>
  request<ChecklistItem>(
    `/clients/${clientId}/checklist-items`,
    json("POST", input)
  );

export const updateChecklistItem = (
  clientId: number,
  itemId: number,
  input: { status: ChecklistItemStatus }
) =>
  request<ChecklistItem>(
    `/clients/${clientId}/checklist-items/${itemId}`,
    json("PATCH", input)
  );

export const waiveChecklistItem = (clientId: number, itemId: number) =>
  request<void>(`/clients/${clientId}/checklist-items/${itemId}`, {
    method: "DELETE",
  });

export const sendChecklistItemReminder = (clientId: number, itemId: number) =>
  request<EmailLogEntry>(
    `/clients/${clientId}/checklist-items/${itemId}/remind`,
    { method: "POST" }
  );

export interface ExtractedChecklistItem {
  doc_type_needed: string;
  description: string | null;
  expected_date_range_start: string | null;
  expected_date_range_end: string | null;
}

export interface ChecklistExtractionResult {
  items: ExtractedChecklistItem[];
  suggested_send_reminder: boolean;
}

// Read-only/side-effect-free: turns a freeform instruction into structured
// items for an editable preview - nothing is created until the caller
// separately calls createChecklistItem (and optionally
// sendChecklistReminder) once a human confirms.
export const extractChecklistItems = (clientId: number, instruction: string) =>
  request<ChecklistExtractionResult>(
    `/clients/${clientId}/checklist-items/extract`,
    json("POST", { instruction })
  );

// ---------- Documents ----------

export const uploadDocument = (clientId: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return request<DocumentUploadResult>(`/clients/${clientId}/documents`, {
    method: "POST",
    body: formData,
  });
};

export const listClientDocuments = (clientId: number) =>
  request<DocumentOut[]>(`/clients/${clientId}/documents`);

// Bypasses request<T>() (which always calls res.json()) since this returns
// a binary .zip, not JSON - fetches it as a blob with the same auth header
// and triggers the browser's normal download prompt, reading the filename
// the backend already picked (client name + today's date) off the
// Content-Disposition header rather than re-deriving it here.
export const downloadClientDocumentsZip = async (clientId: number) => {
  const token = await getAuthToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE_URL}/clients/${clientId}/documents/zip`, { headers });
  if (!res.ok) {
    throw await responseError(res);
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="(.+)"/);
  const filename = match?.[1] ?? `documents-${clientId}.zip`;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// ---------- Client upload link ----------

export const getClientUploadLink = (clientId: number) =>
  request<ClientUploadLink | null>(`/clients/${clientId}/upload-link`);

export const regenerateClientUploadLink = (clientId: number) =>
  request<ClientUploadLinkCreated>(`/clients/${clientId}/upload-link/regenerate`, {
    method: "POST",
  });

export const revokeClientUploadLink = (clientId: number) =>
  request<ClientUploadLink>(`/clients/${clientId}/upload-link/revoke`, {
    method: "POST",
  });

// ---------- Email replies ----------

export const submitEmailReply = (
  clientId: number,
  emailText: string,
  files: File[]
) => {
  const formData = new FormData();
  formData.append("email_text", emailText);
  for (const file of files) {
    formData.append("files", file);
  }
  return request<EmailReplyResult>(`/clients/${clientId}/email-replies`, {
    method: "POST",
    body: formData,
  });
};

// ---------- Checklist reminders ----------

export const sendChecklistReminder = (clientId: number) =>
  request<EmailLogEntry>(`/clients/${clientId}/checklist-reminder`, {
    method: "POST",
  });

// ---------- Email log ----------

export const listEmailLog = (status?: EmailStatus, resolved?: boolean) => {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (resolved !== undefined) params.set("resolved", String(resolved));
  const qs = params.toString();
  return request<EmailLogEntry[]>(`/email-log${qs ? `?${qs}` : ""}`);
};

export const bulkDeleteEmailLogEntries = (emailLogIds: number[]) =>
  request<void>("/email-log", json("DELETE", { email_log_ids: emailLogIds }));

// "Delete" above never actually removes anything - it archives. These
// power the Email Log page's Archive popup (list + per-thread undo).
export const listArchivedEmailLog = () => request<EmailLogEntry[]>("/email-log/archived");

export const restoreEmailLogEntries = (emailLogIds: number[]) =>
  request<EmailLogEntry[]>("/email-log/restore", json("POST", { email_log_ids: emailLogIds }));

export const sendEmailLogEntry = (clientId: number, emailLogId: number) =>
  request<EmailLogEntry>(
    `/clients/${clientId}/email-log/${emailLogId}/send`,
    { method: "POST" }
  );

export const resolveEmailLogEntry = (clientId: number, emailLogId: number) =>
  request<EmailLogEntry>(
    `/clients/${clientId}/email-log/${emailLogId}/resolve`,
    { method: "POST" }
  );

export const updateEmailLogEntry = (
  clientId: number,
  emailLogId: number,
  update: { content: string; subject?: string | null }
) =>
  request<EmailLogEntry>(
    `/clients/${clientId}/email-log/${emailLogId}`,
    json("PATCH", update)
  );

export const listEmailThreads = (clientId: number) =>
  request<EmailThread[]>(`/clients/${clientId}/email-threads`);

// ---------- Live pipeline streaming ----------
//
// While the backend is processing an inbound email (real or the manual
// test tool), it broadcasts checkpoints - pipeline_started, stage_started/
// completed, tool_call_started/result, text_delta, pipeline_finished - over
// one long-lived SSE connection per org. Used by /email-log to show a
// thread "processing" live instead of only after a refetch.

export interface EmailLogStreamEvent {
  type: string;
  client_id?: number;
  thread_id?: string | null;
  [key: string]: unknown;
}

export interface ActiveRun {
  client_id: number;
  thread_id: string | null;
}

export const listActiveRuns = () => request<ActiveRun[]>("/email-log/active-runs");

// Not EventSource: it can't send the Authorization header this backend
// requires on every request, so this parses the SSE wire format (blocks
// separated by "\n\n", each with a "data: <json>" line) directly off a
// fetch() ReadableStream instead. Returns an unsubscribe function.
export function subscribeToEmailLogStream(
  onEvent: (event: EmailLogStreamEvent) => void,
  onError?: (err: unknown) => void,
  onConnect?: () => void,
): () => void {
  return subscribeSSE(`${API_BASE_URL}/email-log/stream`, getAuthToken,
    event => onEvent(event as EmailLogStreamEvent), onError, onConnect);
}

// ---------- Client memory notes ----------

export const listClientMemoryNotes = (clientId: number) =>
  request<ClientMemoryNote[]>(`/clients/${clientId}/memory-notes`);

export const deleteClientMemoryNote = (clientId: number, noteId: number) =>
  request<void>(`/clients/${clientId}/memory-notes/${noteId}`, {
    method: "DELETE",
  });

// ---------- Client commitments ----------

export const listClientCommitments = (clientId: number) =>
  request<ClientCommitment[]>(`/clients/${clientId}/commitments`);

export const resolveClientCommitment = (
  clientId: number,
  commitmentId: number,
  status: "fulfilled" | "cancelled"
) =>
  request<ClientCommitment>(
    `/clients/${clientId}/commitments/${commitmentId}/resolve`,
    json("POST", { status })
  );

// ---------- Unmatched inbound emails ----------

export const listUnmatchedInboundEmails = (filters?: {
  review_status?: InboundEmailReviewStatus;
  category?: InboundEmailCategory;
}) => {
  const params = new URLSearchParams();
  if (filters?.review_status) params.set("review_status", filters.review_status);
  if (filters?.category) params.set("category", filters.category);
  const qs = params.toString();
  return request<UnmatchedInboundEmail[]>(
    `/unmatched-inbound-emails${qs ? `?${qs}` : ""}`
  );
};

export const dismissUnmatchedInboundEmail = (id: number) =>
  request<UnmatchedInboundEmail>(`/unmatched-inbound-emails/${id}/dismiss`, {
    method: "POST",
  });

export const linkUnmatchedInboundEmail = (id: number, clientId: number) =>
  request<UnmatchedInboundEmail>(
    `/unmatched-inbound-emails/${id}/link`,
    json("POST", { client_id: clientId })
  );

export const createClientFromUnmatchedInboundEmail = (
  id: number,
  input: { name: string; status?: ClientStatus; email?: string }
) =>
  request<Client>(
    `/unmatched-inbound-emails/${id}/create-client`,
    json("POST", input)
  );

// ---------- Gmail / inbox connections ----------

export const getGmailConnectUrl = () =>
  request<{ authorization_url: string }>("/organizations/me/gmail/connect");

export const getOutlookConnectUrl = () =>
  request<{ authorization_url: string }>("/organizations/me/outlook/connect", { credentials: "include" });

export const listInboxConnections = () =>
  request<InboxConnection[]>("/inbox-connections");

export const deleteInboxConnection = (connectionId: number) =>
  request<void>(`/inbox-connections/${connectionId}`, { method: "DELETE" });

export const watchInboxConnection = (connectionId: number) =>
  request<void>(`/inbox-connections/${connectionId}/watch`, { method: "POST" });

// ---------- Admin (internal usage/cost dashboard) ----------
//
// Restricted server-side to a whitelisted set of internal staff emails
// (see accounting-saas/app/auth.py's get_internal_admin) - a non-admin
// caller gets a 403 from these, regardless of what the sidebar shows.

export const listOrganizationsUsage = (filters?: { start?: string; end?: string }) => {
  const params = new URLSearchParams();
  if (filters?.start) params.set("start", filters.start);
  if (filters?.end) params.set("end", filters.end);
  const qs = params.toString();
  return request<OrganizationUsageOut[]>(`/admin/organizations${qs ? `?${qs}` : ""}`);
};

export const getUsageOverview = (filters?: { start?: string; end?: string; bucket?: UsageBucket }) => {
  const params = new URLSearchParams();
  if (filters?.start) params.set("start", filters.start);
  if (filters?.end) params.set("end", filters.end);
  if (filters?.bucket) params.set("bucket", filters.bucket);
  const qs = params.toString();
  return request<PeriodUsageOut[]>(`/admin/usage${qs ? `?${qs}` : ""}`);
};

export const getOrganizationUsageBreakdown = (
  organizationId: number,
  filters?: { start?: string; end?: string; bucket?: UsageBucket }
) => {
  const params = new URLSearchParams();
  if (filters?.start) params.set("start", filters.start);
  if (filters?.end) params.set("end", filters.end);
  if (filters?.bucket) params.set("bucket", filters.bucket);
  const qs = params.toString();
  return request<OrganizationUsageBreakdownOut>(
    `/admin/organizations/${organizationId}/usage${qs ? `?${qs}` : ""}`
  );
};

// ---------- Workflows ----------
//
// A firm-defined unit of post-collection work (e.g. "compile all receipts
// into a transaction CSV") that runs once a client's document checklist is
// fully complete - see the backend's app/services/workflow_agent.py for
// the execution model this drives.

export type WorkflowExecutionMode = "auto" | "manual";
export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "needs_review";

export interface WorkflowWorkSample {
  id: number;
  filename: string;
  size_bytes: number;
  sha256: string;
  created_at: string;
}

export const uploadWorkflowWorkSample = (file: File) => {
  const body = new FormData();
  body.append("file", file);
  return request<WorkflowWorkSample>("/workflows/work-samples", { method: "POST", body });
};

export interface Workflow {
  work_samples?: WorkflowWorkSample[];
  id: number;
  organization_id: number;
  name: string;
  instructions: string;
  execution_mode: WorkflowExecutionMode;
  archived_at: string | null;
  created_at: string;
}

export interface WorkflowAssignmentWithClient {
  id: number;
  workflow_id: number;
  client_id: number;
  client_name: string;
  latest_run_status: WorkflowRunStatus | null;
  created_at: string;
}

export interface ClientWorkflowAssignment {
  id: number;
  workflow_id: number;
  client_id: number;
  workflow_name: string;
  execution_mode: WorkflowExecutionMode;
  workflow_archived: boolean;
  checklist_total: number;
  checklist_remaining: number;
  ready: boolean;
  created_at: string;
}

export const listClientWorkflowAssignments = (clientId: number) =>
  request<ClientWorkflowAssignment[]>(`/clients/${clientId}/workflow-assignments`);

export const startAssignedWorkflow = (clientId: number, assignmentId: number) =>
  request<WorkflowRun>(`/clients/${clientId}/workflow-assignments/${assignmentId}/run`, { method: "POST" });

export interface WorkflowRunOutput {
  id: number;
  filename: string;
  download_url: string | null;
}

export interface WorkflowRun {
  details_loaded?: boolean;
  execution_plan: { objective: string; steps: string[]; criteria: { id: string; requirement: string }[] } | null;
  step_results: Record<string, string>;
  verification: { passed: boolean; checks: { criterion_id: string; passed: boolean; evidence: string }[]; issues: string[]; warnings?: string[]; method: string } | null;
  can_resume: boolean;
  tool_trajectory: { round?: number; tool: string; arguments?: Record<string, unknown>; result?: string; started_at?: string; completed_at?: string }[] | null;
  id: number;
  workflow_id: number;
  workflow_name: string;
  workflow_archived: boolean;
  client_id: number;
  workflow_assignment_id: number | null;
  status: WorkflowRunStatus;
  trigger: string;
  summary: string | null;
  review_reason: string | null;
  outputs: WorkflowRunOutput[];
  draft_outputs?: WorkflowRunOutput[];
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface WorkflowBuilderResult {
  warnings: string[];
  suggested_name: string;
  instructions: string;
}

// Side-effect-free: turns a freeform description into a suggested
// name/instructions for an editable preview - nothing is created until
// the caller separately calls createWorkflow once a human accepts/edits it.
export const buildWorkflowInstructions = (description: string, workSampleIds: number[] = []) =>
  request<WorkflowBuilderResult>("/workflows/builder", json("POST", { description, work_sample_ids: workSampleIds }));

export const listWorkflows = () => request<Workflow[]>("/workflows");

export const getWorkflow = (workflowId: number) =>
  request<Workflow>(`/workflows/${workflowId}`);

export const createWorkflow = (input: {
  name: string;
  instructions: string;
  execution_mode?: WorkflowExecutionMode;
  work_sample_ids?: number[];
}) => request<Workflow>("/workflows", json("POST", input));

export const updateWorkflow = (
  workflowId: number,
  input: { name?: string; instructions?: string; execution_mode?: WorkflowExecutionMode; work_sample_ids?: number[] }
) => request<Workflow>(`/workflows/${workflowId}`, json("PATCH", input));

export const archiveWorkflow = (workflowId: number) =>
  request<void>(`/workflows/${workflowId}`, { method: "DELETE" });

export const listWorkflowAssignments = (workflowId: number) =>
  request<WorkflowAssignmentWithClient[]>(`/workflows/${workflowId}/assignments`);

export const assignWorkflowToClients = (workflowId: number, clientIds: number[]) =>
  request<WorkflowAssignmentWithClient[]>(
    `/workflows/${workflowId}/assignments`,
    json("POST", { client_ids: clientIds })
  );

export const unassignWorkflowFromClient = (workflowId: number, clientId: number) =>
  request<void>(`/workflows/${workflowId}/assignments/${clientId}`, { method: "DELETE" });

export const listClientWorkflowRuns = (clientId: number) =>
  request<WorkflowRun[]>(`/clients/${clientId}/workflow-runs?include_history_details=false`);

export const getClientWorkflowRun = (clientId: number, runId: number) =>
  request<WorkflowRun>(`/clients/${clientId}/workflow-runs/${runId}`);

export const runQueuedWorkflowRun = (clientId: number, runId: number) =>
  request<WorkflowRun>(`/clients/${clientId}/workflow-runs/${runId}/run`, { method: "POST" });

// Re-runs from scratch (a fresh run row) - for a run that already finished
// (completed/needs_review/failed), e.g. after editing the workflow's
// instructions and wanting to try again against the same client.
export const rerunWorkflowRun = (clientId: number, runId: number) =>
  request<WorkflowRun>(`/clients/${clientId}/workflow-runs/${runId}/rerun`, { method: "POST" });

export const resumeWorkflowRun = (clientId: number, runId: number, context: string) =>
  request<WorkflowRun>(
    `/clients/${clientId}/workflow-runs/${runId}/resume`,
    json("POST", { context })
  );

// ---------- Packages ----------

export interface PackageDocument {
  id: number;
  doc_type_needed: string;
  description: string | null;
  is_required: boolean;
  position: number;
}

export interface PackageDocumentInput {
  doc_type_needed: string;
  description?: string | null;
  is_required?: boolean;
}

export interface Package {
  id: number;
  organization_id: number;
  name: string;
  archived_at: string | null;
  created_at: string;
  documents: PackageDocument[];
}

export interface PackageWithAssignmentCount extends Package {
  assigned_client_count: number;
}

export interface PackageAssignmentWithClient {
  id: number;
  package_id: number;
  client_id: number;
  client_name: string;
  created_at: string;
}

export const listPackages = () => request<PackageWithAssignmentCount[]>("/packages");

export const getPackage = (packageId: number) => request<Package>(`/packages/${packageId}`);

export const createPackage = (input: { name: string; documents: PackageDocumentInput[] }) =>
  request<Package>("/packages", json("POST", input));

export const updatePackage = (
  packageId: number,
  input: { name?: string; documents?: PackageDocumentInput[] }
) => request<Package>(`/packages/${packageId}`, json("PATCH", input));

export const archivePackage = (packageId: number) =>
  request<void>(`/packages/${packageId}`, { method: "DELETE" });

export const listPackageAssignments = (packageId: number) =>
  request<PackageAssignmentWithClient[]>(`/packages/${packageId}/assignments`);

// documentIds: which of the package's documents to actually create as
// checklist items - the assign dialog defaults this to the required ones
// and lets the CPA toggle optional ones on (or required ones off) first.
export const assignPackageToClients = (
  packageId: number,
  clientIds: number[],
  documentIds: number[]
) =>
  request<PackageAssignmentWithClient[]>(
    `/packages/${packageId}/assignments`,
    json("POST", { client_ids: clientIds, document_ids: documentIds })
  );

export const unassignPackageFromClient = (packageId: number, clientId: number) =>
  request<void>(`/packages/${packageId}/assignments/${clientId}`, { method: "DELETE" });

// Reconciles one client's already-existing assignment to exactly this
// document selection (adds what's newly checked, removes what got
// unchecked) - for editing, as opposed to assignPackageToClients which
// always adds fresh regardless of what's already there.
export const updatePackageAssignmentDocuments = (
  packageId: number,
  clientId: number,
  documentIds: number[]
) =>
  request<PackageAssignmentWithClient>(
    `/packages/${packageId}/assignments/${clientId}`,
    json("PATCH", { document_ids: documentIds })
  );
