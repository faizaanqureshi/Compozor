// Secure Client Portal API (see Compozor-API/docs/client-portal.md).
//
// Separate from public-upload-api.ts: these routes need the HttpOnly portal
// session cookie (credentials: "include") and the X-Compozor-Portal header the
// backend requires on every portal request as CSRF protection. Nothing here
// logs, caches or persists answers; responses are no-store on the server and
// requests opt out of the HTTP cache too.

import type { QuestionnaireDefinition, Answers } from "./questionnaire-logic";
import type { PublicChecklist } from "./public-upload-api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export const PORTAL_HEADER = "X-Compozor-Portal";

export type QuestionnaireState = "none" | "optional" | "required_outstanding" | "required_complete";

export interface PortalReadiness {
  uploads_allowed: boolean;
  blocking_reason: string | null;
  questionnaire_state: QuestionnaireState;
}

export interface PortalBootstrap extends PortalReadiness {
  verification_required_for_questionnaires: boolean;
}

export interface PortalQuestionnaireSummary {
  assignment_id: number;
  title: string;
  description: string | null;
  is_required: boolean;
  reporting_period_key: string;
  reporting_period_label: string | null;
  reporting_period_start: string | null;
  reporting_period_end: string | null;
  status: "not_started" | "in_progress" | "submitted";
  draft_revision: number;
  has_draft: boolean;
  completed_at: string | null;
  submission_count: number;
}

export interface PortalState {
  client_name: string;
  organization_name: string;
  readiness: PortalReadiness;
  questionnaires: PortalQuestionnaireSummary[];
  checklist: PublicChecklist;
  session_expires_at: string;
}

export interface PortalQuestionnaireDetail {
  questionnaire: PortalQuestionnaireSummary;
  version_number: number;
  definition: QuestionnaireDefinition;
}

export interface PortalDraft {
  assignment_id: number;
  draft_revision: number;
  answers: Answers | null;
}

export interface PortalDraftSaved {
  assignment_id: number;
  draft_revision: number;
  saved: boolean;
  state: PortalState;
}

export interface PortalSubmissionResult {
  submission: {
    assignment_id: number;
    submission_number: number;
    submitted_at: string;
    assignment_status: string;
    draft_revision: number;
  };
  state: PortalState;
}

export interface VerificationIssued {
  destination: string;
  expires_at: string;
  resend_available_at: string;
}

export interface VerificationConfirmed {
  verified: boolean;
  session_expires_at: string;
}

export class PortalApiError extends Error {
  status: number;
  code: string;
  detail: Record<string, unknown>;
  constructor(status: number, code: string, message: string, detail: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

const NETWORK_MESSAGE = "We couldn't reach the server. Check your connection and try again.";

const FALLBACK_MESSAGES: Record<number, string> = {
  401: "Please verify your email address to continue.",
  404: "This link is invalid or has been revoked. Please contact your firm for a new link.",
  422: "Some answers need attention before they can be saved.",
  429: "Too many requests. Please wait a moment and try again.",
};

async function toError(res: Response): Promise<PortalApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON error body; fall back to a status-based message.
  }
  const detail = (body as { detail?: unknown } | null)?.detail;
  const fallback = FALLBACK_MESSAGES[res.status] ?? "Something went wrong. Please try again.";
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const record = detail as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code : `http_${res.status}`;
    const message = typeof record.message === "string" ? record.message : fallback;
    return new PortalApiError(res.status, code, message, record);
  }
  return new PortalApiError(res.status, `http_${res.status}`, typeof detail === "string" ? detail : fallback);
}

async function portalRequest<T>(
  token: string,
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
  const headers: Record<string, string> = { [PORTAL_HEADER]: "1", ...init.headers };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/public/portal/${encodeURIComponent(token)}${path}`, {
      method: init.method ?? "GET",
      credentials: "include",
      cache: "no-store",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new PortalApiError(0, "network_error", NETWORK_MESSAGE);
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const requestVerification = (token: string) =>
  portalRequest<VerificationIssued>(token, "/verification/request", { method: "POST" });

export const confirmVerification = (token: string, code: string) =>
  portalRequest<VerificationConfirmed>(token, "/verification/confirm", { method: "POST", body: { code } });

export const logoutPortal = (token: string) =>
  portalRequest<void>(token, "/session/logout", { method: "POST" });

export const getPortalState = (token: string) => portalRequest<PortalState>(token, "/state");

export const getPortalQuestionnaire = (token: string, assignmentId: number) =>
  portalRequest<PortalQuestionnaireDetail>(token, `/questionnaires/${assignmentId}`);

export const getPortalDraft = (token: string, assignmentId: number) =>
  portalRequest<PortalDraft>(token, `/questionnaires/${assignmentId}/draft`);

export const savePortalDraft = (token: string, assignmentId: number, answers: Answers, expectedRevision: number) =>
  portalRequest<PortalDraftSaved>(token, `/questionnaires/${assignmentId}/draft`, {
    method: "PUT",
    body: { answers, expected_revision: expectedRevision },
  });

export const submitPortalQuestionnaire = (
  token: string,
  assignmentId: number,
  answers: Answers,
  expectedRevision: number,
  idempotencyKey: string
) =>
  portalRequest<PortalSubmissionResult>(token, `/questionnaires/${assignmentId}/submissions`, {
    method: "POST",
    body: { answers, expected_revision: expectedRevision },
    headers: { "Idempotency-Key": idempotencyKey },
  });

// The firm has to act; retrying cannot help.
export const VERIFICATION_UNAVAILABLE_CODES = new Set(["mailbox_unavailable", "no_email_on_file"]);

export function isLinkError(error: unknown): boolean {
  return error instanceof PortalApiError && (error.code === "link_invalid" || error.code === "link_expired");
}
