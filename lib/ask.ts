// Ask: staff chat over the firm's data. The backend streams each answer as
// server-sent events from POST /ask/messages (see app/routers/ask.py).
import { API_BASE_URL, ApiError, getAuthToken, json, request, responseError } from "./api";
import { readEventStream } from "./event-stream";

export type AskCitationKind = "client" | "document" | "email" | "run" | "questionnaire";

export interface AskCitation {
  key: string;
  kind: AskCitationKind;
  label: string;
  client_id: number;
  client_name: string;
  href: string;
  detail: string | null;
}

export interface AskActionTarget {
  client_id: number;
  client_name: string;
  item_ids?: number[];
  items?: string[];
  last_reminder?: string | null;
  email_id?: number;
  subject?: string;
  preview?: string;
}

export interface AskActionResult {
  client_id: number;
  ok: boolean;
  detail: string;
}

export interface AskAction {
  id: string;
  kind: "send_reminder" | "send_draft";
  title: string;
  description: string | null;
  targets: AskActionTarget[];
  state?: "done" | "failed" | "dismissed";
  results?: AskActionResult[];
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

export const recordAskActionResult = (
  conversationId: number,
  messageId: number,
  actionId: string,
  status: "done" | "failed" | "dismissed",
  results: AskActionResult[],
) =>
  request<AskMessage>(
    `/ask/conversations/${conversationId}/messages/${messageId}/actions/${actionId}`,
    json("POST", { status, results }),
  );

export async function streamAskQuestion(
  body: { question: string; conversation_id?: number | null; client_id?: number | null },
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
