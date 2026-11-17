// Ask: staff chat over the firm's data. The backend streams each answer as
// server-sent events from POST /ask/messages (see app/routers/ask.py).
import { API_BASE_URL, ApiError, getAuthToken, json, request, responseError } from "./api";
import { readEventStream } from "./event-stream";

export type AskCitationKind = "client" | "document" | "email" | "run" | "questionnaire" | "knowledge";

export interface AskCitation {
  key: string;
  kind: AskCitationKind;
  label: string;
  client_id: number;
  client_name: string;
  href: string;
  detail: string | null;
}

export interface AskScope {
  kind: "client" | "workflow" | "run" | "email";
  id: number;
  label: string;
  /** For starter questions ("What has Priya sent?"). */
  clientName?: string;
}

export interface AskActionTarget {
  client_id: number;
  client_name: string;
  detail?: string | null;
  last_reminder?: string | null;
}

export interface AskActionResult {
  client_id: number | null;
  client_name: string | null;
  ok: boolean;
  detail: string;
  email_id?: number;
  run_id?: number;
  item_id?: number;
  package_id?: number;
  workflow_id?: number;
}

export interface AskEmailPreview {
  to: string;
  subject: string;
  body: string;
  in_reply_to?: string | null;
  note?: string | null;
}

export interface AskPackagePreview {
  name: string;
  documents: { doc_type_needed: string; description: string | null; is_required: boolean; allows_multiple: boolean }[];
  workflow: { name: string; instructions: string } | null;
}

export type AskActionKind =
  | "send_reminder" | "send_draft" | "compose_email" | "reply_email" | "run_workflow" | "retry_run"
  | "mark_received" | "waive_item" | "request_document" | "create_package" | "assign_package";

export interface AskAction {
  id: string;
  kind: AskActionKind;
  title: string;
  description: string | null;
  admin_only: boolean;
  confirm_label: string;
  targets: AskActionTarget[];
  preview: (AskEmailPreview | AskPackagePreview | { documents: string[] } | Record<string, unknown>) | null;
  editable: ("subject" | "body")[];
  state?: "running" | "done" | "partial" | "failed" | "dismissed";
  results?: AskActionResult[];
  edited?: boolean;
}

export interface AskMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  status: "complete" | "capped" | "error";
  citations: AskCitation[];
  actions: AskAction[];
  created_at: string | null;
}

export interface AskConversationSummary {
  id: number;
  title: string;
  client_id: number | null;
  client_name: string | null;
  updated_at: string | null;
}

export interface AskConversation extends AskConversationSummary {
  messages: AskMessage[];
}

export type AskStreamEvent =
  | { type: "conversation"; conversation_id: number; title: string; user_message_id: number }
  | { type: "status"; label: string; tool: string }
  | { type: "reset" }
  | { type: "delta"; text: string }
  | { type: "citation"; citation: AskCitation }
  | { type: "action"; action: AskAction }
  | { type: "done"; message: AskMessage }
  | { type: "error"; error: string; message?: AskMessage };

export const listAskConversations = (clientId?: number) =>
  request<AskConversationSummary[]>(`/ask/conversations${clientId ? `?client_id=${clientId}` : ""}`);

export const getAskConversation = (conversationId: number) =>
  request<AskConversation>(`/ask/conversations/${conversationId}`);

export const deleteAskConversation = (conversationId: number) =>
  request<void>(`/ask/conversations/${conversationId}`, { method: "DELETE" });

export const executeAskAction = (
  conversationId: number,
  messageId: number,
  actionId: string,
  edits: { subject?: string; body?: string; mode?: "send" | "draft" } = {},
) =>
  request<AskMessage>(
    `/ask/conversations/${conversationId}/messages/${messageId}/actions/${actionId}/execute`,
    json("POST", edits),
  );

export const dismissAskAction = (conversationId: number, messageId: number, actionId: string) =>
  request<AskMessage>(
    `/ask/conversations/${conversationId}/messages/${messageId}/actions/${actionId}`,
    json("POST", { status: "dismissed" }),
  );

export async function streamAskQuestion(
  body: {
    question: string;
    conversation_id?: number | null;
    client_id?: number | null;
    scope?: { kind: AskScope["kind"]; id: number } | null;
  },
  onEvent: (event: AskStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const token = await getAuthToken();
  if (!token) throw new ApiError(401, "Not authenticated");
  const response = await fetch(`${API_BASE_URL}/ask/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok || !response.body) throw await responseError(response);
  await readEventStream<AskStreamEvent>(response.body, onEvent);
}
