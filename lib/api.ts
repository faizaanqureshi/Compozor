const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init);
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
export type EmailStatus = "draft" | "sent" | "needs_human_attention";
export type InboxConnectionStatus = "active" | "needs_reauth";

export interface Organization {
  id: number;
  name: string;
}

export interface Client {
  id: number;
  organization_id: number;
  name: string;
  email: string;
  tax_year: number;
  status: ClientStatus;
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

export interface ClientDetail extends Client {
  checklist_items: ChecklistItem[];
}

export interface DocumentUploadResult {
  document: {
    id: number;
    client_id: number;
    checklist_item_id: number | null;
    s3_path: string;
    classified_type: string;
    extracted_metadata: unknown;
    received_at: string;
  };
  checklist_item_id: number | null;
  checklist_item_status: ChecklistItemStatus | null;
  draft_email_created: boolean;
}

export interface EmailReplyResult {
  has_attachment: boolean;
  has_question: boolean;
  document_results: DocumentUploadResult[];
  escalation_email_log_id: number | null;
}

export interface EmailLogEntry {
  id: number;
  client_id: number;
  direction: EmailDirection;
  status: EmailStatus;
  content: string;
  thread_id: string | null;
  created_at: string;
}

export interface InboxConnection {
  id: number;
  organization_id: number;
  email_address: string;
  status: InboxConnectionStatus;
}

// ---------- Organizations ----------

export const listOrganizations = () => request<Organization[]>("/organizations");

export const createOrganization = (name: string) =>
  request<Organization>("/organizations", json("POST", { name }));

// ---------- Clients ----------

export const listClients = (organizationId: number) =>
  request<Client[]>(`/clients?organization_id=${organizationId}`);

export const getClient = (clientId: number) =>
  request<ClientDetail>(`/clients/${clientId}`);

export const createClient = (input: {
  organization_id: number;
  name: string;
  email: string;
  tax_year: number;
  status?: ClientStatus;
}) => request<Client>("/clients", json("POST", input));

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

// ---------- Documents ----------

export const uploadDocument = (clientId: number, file: File) => {
  const formData = new FormData();
  formData.append("file", file);
  return request<DocumentUploadResult>(`/clients/${clientId}/documents`, {
    method: "POST",
    body: formData,
  });
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

export const listEmailLog = (
  organizationId: number,
  status?: EmailStatus
) => {
  const params = new URLSearchParams({
    organization_id: String(organizationId),
  });
  if (status) params.set("status", status);
  return request<EmailLogEntry[]>(`/email-log?${params.toString()}`);
};

export const sendEmailLogEntry = (clientId: number, emailLogId: number) =>
  request<EmailLogEntry>(
    `/clients/${clientId}/email-log/${emailLogId}/send`,
    { method: "POST" }
  );

// ---------- Gmail / inbox connections ----------

export const getGmailConnectUrl = (organizationId: number) =>
  request<{ authorization_url: string }>(
    `/organizations/${organizationId}/gmail/connect`
  );

export const listInboxConnections = (organizationId: number) =>
  request<InboxConnection[]>(
    `/inbox-connections?organization_id=${organizationId}`
  );

export const deleteInboxConnection = (connectionId: number) =>
  request<void>(`/inbox-connections/${connectionId}`, { method: "DELETE" });
