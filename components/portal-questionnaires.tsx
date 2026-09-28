"use client";

// Questionnaire area of the Secure Client Portal. Everything it shows comes
// from the verified /state endpoint; without a valid portal session it only
// offers email verification. Upload permission is never decided here: the
// server-calculated state is passed up so the page can re-render.

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalVerification } from "@/components/portal-verification";
import { QuestionnaireForm, periodLabel } from "@/components/questionnaire-form";
import { cn } from "@/lib/utils";
import {
  PortalApiError,
  getPortalState,
  isLinkError,
  logoutPortal,
  type PortalQuestionnaireSummary,
  type PortalState,
  type QuestionnaireState,
} from "@/lib/client-portal-api";

type Phase = "checking" | "locked" | "verifying" | "ready" | "form" | "error";

export function PortalQuestionnaires({
  token,
  questionnaireState,
  organizationName,
  onState,
  onLinkInvalid,
  onFocusChange,
  onNoQuestionnaires,
}: {
  token: string;
  questionnaireState: QuestionnaireState;
  organizationName?: string;
  onState: (state: PortalState) => void;
  onLinkInvalid: (message: string) => void;
  // True while a questionnaire is open full-width.
  onFocusChange: (focused: boolean) => void;
  // The server says there is nothing to verify; refresh the page state.
  onNoQuestionnaires: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [state, setState] = useState<PortalState | null>(null);
  const [open, setOpen] = useState<PortalQuestionnaireSummary | null>(null);
  const [confirmation, setConfirmation] = useState<{ title: string; uploadsAllowed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const required = questionnaireState === "required_outstanding";
  const requiredDone = questionnaireState === "required_complete";
  const firm = organizationName ?? "Your firm";

  const refresh = useCallback(
    () =>
      getPortalState(token).then(
        (next) => {
          setState(next);
          onState(next);
          setPhase((current) => (current === "form" ? current : "ready"));
        },
        (e: unknown) => {
          if (isLinkError(e)) onLinkInvalid((e as PortalApiError).message);
          else if (e instanceof PortalApiError && e.status === 401) setPhase("locked");
          else {
            setError(e instanceof PortalApiError ? e.message : "Your questionnaires couldn't be loaded.");
            setPhase("error");
          }
        }
      ),
    [token, onState, onLinkInvalid]
  );

  // A still-valid session (same browser, same link) skips re-verification.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    onFocusChange(phase === "form");
  }, [phase, onFocusChange]);

  const openQuestionnaire = (q: PortalQuestionnaireSummary) => {
    setConfirmation(null);
    setOpen(q);
    setPhase("form");
  };

  const closeQuestionnaire = () => {
    setOpen(null);
    setPhase("ready");
    void refresh();
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await logoutPortal(token);
    } catch {
      // The session expires on its own; the cookie is cleared server-side when reachable.
    } finally {
      setSigningOut(false);
      setState(null);
      setPhase("locked");
    }
  };

  if (phase === "form" && open) {
    return (
      <section aria-label={open.title} className="flex min-w-0 flex-col rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-8">
        <QuestionnaireForm
        token={token}
        summary={open}
        organizationName={organizationName}
        onExit={closeQuestionnaire}
        onLinkInvalid={onLinkInvalid}
        onSubmitted={(result) => {
          setState(result.state);
          onState(result.state);
          setConfirmation({ title: open.title, uploadsAllowed: result.state.readiness.uploads_allowed });
          setOpen(null);
          setPhase("ready");
        }}
        />
      </section>
    );
  }

  const title = questionnaireState === "optional" ? "Optional questionnaire" : "Your questionnaire";
  const verified = phase === "ready" && state !== null;

  return (
    <Panel
      title={title}
      className="gap-5 sm:p-6"
      meta={required && phase !== "ready" ? "Required before uploading" : undefined}
      action={
        verified ? (
          <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut}>
            {signingOut && <Loader2 className="animate-spin" />}
            Sign out
          </Button>
        ) : undefined
      }
    >
      {confirmation && (
        <div role="status" className="flex animate-fade-in flex-col items-start gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-success/10 text-success">
            <Check className="size-4" />
          </span>
          <h3 className="text-xl font-light tracking-tight">Thank you. Your answers were sent to {firm}.</h3>
          <p className="text-sm text-pretty text-muted-foreground">
            {confirmation.uploadsAllowed
              ? "Your document checklist has been updated. You can upload your documents below."
              : "Please complete the remaining required questionnaire before uploading documents."}
          </p>
        </div>
      )}

      {phase === "checking" && (
        <div className="flex flex-col gap-2" aria-busy>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-9 w-40" />
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="self-start" onClick={() => { setPhase("checking"); void refresh(); }}>
            Try again
          </Button>
        </div>
      )}

      {phase === "locked" && (
        <div className="flex flex-col gap-4">
          <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
            {required
              ? "To keep your answers private, we'll first confirm your email address with a one-time code."
              : requiredDone
                ? "Your questionnaire has been submitted. Verify your email address to see its status."
                : `${firm} has shared a questionnaire you can complete when convenient. You can upload documents at any time.`}
          </p>
          {required ? (
            <PortalVerification token={token} organizationName={organizationName} onVerified={refresh}
              onLinkInvalid={onLinkInvalid} onNotRequired={onNoQuestionnaires} intro={<></>} />
          ) : (
            <Button variant="outline" className="self-start" onClick={() => setPhase("verifying")}>
              {requiredDone ? "View questionnaire" : "Open questionnaire"}
            </Button>
          )}
        </div>
      )}

      {phase === "verifying" && (
        <PortalVerification token={token} organizationName={organizationName} onVerified={refresh}
          onCancel={() => setPhase("locked")} onLinkInvalid={onLinkInvalid} onNotRequired={onNoQuestionnaires} />
      )}

      {verified && state.questionnaires.length === 0 && (
        <p className="text-sm text-muted-foreground">There are no questionnaires for you to complete right now.</p>
      )}

      {verified && state.questionnaires.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/60">
          {state.questionnaires.map((q) => (
            <QuestionnaireRow key={q.assignment_id} q={q} firm={firm} onOpen={() => openQuestionnaire(q)} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

// Mirrors the requested-documents checklist: a quiet ring while open, a
// success check once submitted.
function QuestionnaireRow({ q, firm, onOpen }: { q: PortalQuestionnaireSummary; firm: string; onOpen: () => void }) {
  const period = periodLabel(q);
  const submitted = q.status === "submitted";
  const started = q.status === "in_progress" || q.has_draft;
  const submittedOn = q.completed_at
    ? new Date(q.completed_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  const progress = submitted ? (submittedOn ? "Submitted " + submittedOn : "Submitted") : started ? "In progress, saved" : "Not started";
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="flex min-w-0 items-start gap-3">
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
            submitted ? "bg-success/10 text-success" : q.is_required ? "ring-1 ring-warning" : "ring-1 ring-foreground/25"
          )}
        >
          {submitted && <Check className="size-3" />}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm">{q.title}</span>
          {q.description && !submitted && <span className="text-xs text-pretty text-muted-foreground">{q.description}</span>}
          <span className="text-xs text-muted-foreground">
            {[progress, q.is_required ? "Required" : "Optional", period].filter(Boolean).join(" · ")}
          </span>
          {submitted && <span className="text-xs text-muted-foreground">Contact {firm} if an answer needs to change.</span>}
        </div>
      </div>
      {!submitted && (
        <Button className="shrink-0 self-start sm:self-auto" variant={q.is_required ? "default" : "outline"} onClick={onOpen}>
          {started ? "Resume" : "Start"}
        </Button>
      )}
    </li>
  );
}
