const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Clerk's browser SDK attaches itself to `window.Clerk`; this is the
// documented way to grab a session token outside of a React hook, which
// we need since these functions are called directly from useEffect rather
// than through a component. On a hard refresh `window.Clerk` may exist but
// still be re-validating the session, so we must await `load()` before
// reading `session` — otherwise a signed-in user briefly looks signed-out.
async function getAuthToken(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const clerk = (
    window as unknown as {
      Clerk?: {
        loaded?: boolean;
        load?: () => Promise<void>;
        session?: { getToken: () => Promise<string | null> };
      };
    }
  ).Clerk;
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
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      message = body.detail ? JSON.stringify(body.detail) : JSON.stringify(body);
    } catch {
      // ignore, use status text
    }
    throw new ApiError(res.status, message);
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

export type ClientStatus = "active" | "inactive" | "pending";
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
}

export interface ChecklistSummary {
  total: number;
  missing: number;
  received: number;
  wrong: number;
  items: ChecklistItem[];
}

export interface ClientWithChecklistSummary extends Client {
  checklist_summary: ChecklistSummary;
}

export interface ClientDetail extends Client {
  checklist_items: ChecklistItem[];
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
  tool_trajectory: ToolTrajectoryStep[] | null;
  created_at: string;
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
}

export interface ClientImportParseResult {
  rows: ImportedClientRow[];
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

export const executeClientImport = (clients: ClientImportRowIn[]) =>
  request<ClientImportExecuteResult>(
    "/clients/import/execute",
    json("POST", { clients })
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
    throw new ApiError(res.status, `${res.status} ${res.statusText}`);
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
  onError?: (err: unknown) => void
): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      const token = await getAuthToken();
      const headers = new Headers();
      if (token) headers.set("Authorization", `Bearer ${token}`);
      const res = await fetch(`${API_BASE_URL}/email-log/stream`, {
        headers,
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new ApiError(res.status, `Failed to open email-log stream (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let separatorIndex: number;
        while ((separatorIndex = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          const dataLine = rawEvent
            .split("\n")
            .find((line) => line.startsWith("data:"));
          if (!dataLine) continue;
          try {
            onEvent(JSON.parse(dataLine.slice("data:".length).trim()) as EmailLogStreamEvent);
          } catch {
            // Malformed frame - skip it rather than killing the whole stream.
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return; // expected on unsubscribe
      onError?.(err);
    }
  })();

  return () => controller.abort();
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
