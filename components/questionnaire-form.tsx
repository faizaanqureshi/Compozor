"use client";

// One assigned questionnaire: sectioned navigation, autosaved drafts with
// revision control, review, and an idempotent final submission. Answers live
// only in React state and in the backend's encrypted draft; they are never
// written to browser storage, URLs or logs.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { PortalVerification } from "@/components/portal-verification";
import { ProgressRule } from "@/components/stat-strip";
import { QuestionList, type FieldContext } from "@/components/questionnaire-fields";
import { cn } from "@/lib/utils";
import {
  PortalApiError,
  getPortalDraft,
  getPortalQuestionnaire,
  isLinkError,
  savePortalDraft,
  submitPortalQuestionnaire,
  type PortalQuestionnaireDetail,
  type PortalQuestionnaireSummary,
  type PortalSubmissionResult,
} from "@/lib/client-portal-api";
import { DraftSaver, SubmissionKeys, type SaverSnapshot } from "@/lib/portal-draft";
import {
  QuestionnaireContext,
  answerIssues,
  completion,
  describeAnswerError,
  entryIdKey,
  formatAnswer,
  type Answers,
  type QuestionDefinition,
  type QuestionnaireSection,
  type Row,
  type Scope,
} from "@/lib/questionnaire-logic";

const AUTOSAVE_DELAY_MS = 2000;

export function periodLabel(q: PortalQuestionnaireSummary): string | null {
  if (q.reporting_period_label) return q.reporting_period_label;
  return q.reporting_period_key && q.reporting_period_key !== "unspecified" ? q.reporting_period_key : null;
}

export function QuestionnaireForm({
  token,
  summary,
  organizationName,
  onExit,
  onSubmitted,
  onLinkInvalid,
}: {
  token: string;
  summary: PortalQuestionnaireSummary;
  organizationName?: string;
  onExit: () => void;
  onSubmitted: (result: PortalSubmissionResult) => void;
  onLinkInvalid: (message: string) => void;
}) {
  const assignmentId = summary.assignment_id;
  const [detail, setDetail] = useState<PortalQuestionnaireDetail | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [resumed, setResumed] = useState(false);
  const [save, setSave] = useState<SaverSnapshot | null>(null);
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState<Set<string>>(() => new Set());
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [staleSubmission, setStaleSubmission] = useState(false);
  const [exitBlocked, setExitBlocked] = useState(false);
  // A stable object whose snapshots drive `save`; kept in state so render can read it.
  const [saver, setSaver] = useState<DraftSaver | null>(null);
  const saverHolder = useRef<DraftSaver | null>(null);
  const keysRef = useRef(new SubmissionKeys());
  const submittingRef = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);

  // ---- Load the pinned definition and the saved draft --------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [questionnaire, draft] = await Promise.all([
          getPortalQuestionnaire(token, assignmentId),
          getPortalDraft(token, assignmentId),
        ]);
        if (cancelled) return;
        const restored = draft.answers ?? {};
        const existing = saverHolder.current;
        if (existing) {
          existing.reset(draft.draft_revision, restored);
        } else {
          const created = new DraftSaver(
            { revision: draft.draft_revision, answers: restored },
            (a, revision) => savePortalDraft(token, assignmentId, a, revision),
            setSave
          );
          saverHolder.current = created;
          setSaver(created);
          setSave(created.state);
        }
        setDetail(questionnaire);
        setAnswers(restored);
        setResumed(draft.answers !== null);
        setNeedsVerification(false);
        setLoadError(null);
      } catch (e) {
        if (cancelled) return;
        if (isLinkError(e)) onLinkInvalid((e as PortalApiError).message);
        else if (e instanceof PortalApiError && e.status === 401) setNeedsVerification(true);
        else setLoadError(e instanceof PortalApiError ? e.message : "This questionnaire couldn't be loaded.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, assignmentId, loadAttempt, onLinkInvalid]);

  const definition = detail?.definition ?? null;
  const ctx = useMemo(() => (definition ? new QuestionnaireContext(definition, answers) : null), [definition, answers]);
  const sections = useMemo(() => ctx?.visibleSections() ?? [], [ctx]);
  const issues = useMemo(() => (ctx ? answerIssues(ctx) : []), [ctx]);
  const currentIndex = Math.min(step, Math.max(sections.length - 1, 0));
  const section: QuestionnaireSection | undefined = sections[currentIndex];

  // ---- Autosave -----------------------------------------------------------
  useEffect(() => {
    if (!saver || !detail) return;
    saver.touch(answers);
    if (!saver.isDirty(answers) || saver.blocked || submittingRef.current) return;
    const timer = setTimeout(() => {
      if (!submittingRef.current) void saver.save(answers);
    }, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [answers, detail, saver]);

  const dirty = !!saver && saver.isDirty(answers);
  const unsaved = dirty || save?.status === "saving";
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const saveNow = useCallback(() => (saver ? saver.save(answers) : Promise.resolve(false)), [saver, answers]);

  const goTo = (index: number, review = false) => {
    if (section) setVisited((prev) => new Set(prev).add(section.id));
    if (review) sections.forEach((s) => setVisited((prev) => new Set(prev).add(s.id)));
    setReviewing(review);
    setStep(index);
    void saveNow();
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const saveAndExit = async () => {
    setExitBlocked(false);
    if (await saveNow()) onExit();
    else setExitBlocked(true);
  };

  // ---- Conflicts and session expiry ----------------------------------------
  const reloadSaved = () => {
    setStaleSubmission(false);
    setSubmitError(null);
    setLoadAttempt((n) => n + 1);
  };

  const onReverified = async () => {
    if (needsVerification || !saver) {
      setLoadAttempt((n) => n + 1);
      return;
    }
    await saver.resume();
  };

  // ---- Submission -----------------------------------------------------------
  const submit = async () => {
    if (!saver || submittingRef.current) return;
    if (issues.length) {
      setVisited(new Set(sections.map((s) => s.id)));
      setSubmitError("Please complete the highlighted questions before submitting.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    setStaleSubmission(false);
    try {
      await saver.settle();
      if (saver.blocked) {
        setSubmitError("Resolve the notice above before submitting.");
        return;
      }
      const revision = saver.currentRevision;
      // Same answers and revision reuse the key, so a retry after an
      // uncertain network result cannot create a second submission.
      const key = keysRef.current.keyFor(answers, revision);
      const result = await submitPortalQuestionnaire(token, assignmentId, answers, revision, key);
      keysRef.current.reset();
      saver.submitted(result.submission.draft_revision, answers);
      onSubmitted(result);
    } catch (e) {
      if (isLinkError(e)) {
        onLinkInvalid((e as PortalApiError).message);
      } else if (e instanceof PortalApiError && e.status === 401) {
        setSubmitError("Your secure session ended. Verify your email again, then submit.");
        setReverifyForSubmit(true);
      } else if (e instanceof PortalApiError && e.status === 422 && definition) {
        setSubmitError(describeAnswerError(e.message, definition));
      } else if (e instanceof PortalApiError && e.status === 409) {
        setStaleSubmission(true);
        setSubmitError("These answers were changed in another window or device. Reload the latest saved answers before submitting.");
      } else if (e instanceof PortalApiError && e.status === 0) {
        setSubmitError("We couldn't confirm your submission. Check your connection and press Submit again. You won't be submitted twice.");
      } else {
        setSubmitError(e instanceof PortalApiError ? e.message : "Submission failed. Please try again.");
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const [reverifyForSubmit, setReverifyForSubmit] = useState(false);

  // ---- Render -------------------------------------------------------------
  if (needsVerification && !detail) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton onClick={onExit} />
        <h2 className="text-xl font-light tracking-tight">Verify your email to continue</h2>
        <PortalVerification token={token} organizationName={organizationName} onVerified={onReverified}
          onCancel={onExit} onLinkInvalid={onLinkInvalid} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton onClick={onExit} />
        <p className="text-sm text-destructive">{loadError}</p>
        <Button variant="outline" className="self-start" onClick={() => setLoadAttempt((n) => n + 1)}>Try again</Button>
      </div>
    );
  }

  if (!detail || !ctx || !save) {
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-2 w-full" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const errors = new Map(issues.filter((i) => visited.has(i.sectionId)).map((i) => [i.key, i.message]));
  const field: FieldContext = { ctx, answers, onChange: setAnswers, errors, disabled: submitting };
  const percent = Math.round(completion(ctx) * 100);
  const sectionIssues = (s: QuestionnaireSection) => issues.filter((i) => i.sectionId === s.id).length;
  const period = periodLabel(summary);
  const reverifyOpen = save.status === "unauthorized" || reverifyForSubmit;

  return (
    <div ref={topRef} className="flex scroll-mt-6 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <BackButton onClick={saveAndExit} label="Save and exit" disabled={submitting} />
        <SaveIndicator save={save} dirty={dirty} onRetry={() => void saveNow()} />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-2xl leading-tight font-light tracking-tight text-balance sm:text-3xl">{detail.questionnaire.title}</h2>
        <p className="text-sm text-muted-foreground">
          {[summary.is_required ? "Required" : "Optional", period, resumed ? "Your saved answers have been restored" : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {detail.questionnaire.description && (
          <p className="text-sm text-pretty text-muted-foreground">{detail.questionnaire.description}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{reviewing ? "Review and submit" : `Section ${currentIndex + 1} of ${sections.length}`}</span>
          <span className="tabular-nums">{percent}% answered</span>
        </div>
        <ProgressRule value={percent} total={100} className="w-full" />
      </div>

      {exitBlocked && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm">
          <p className="text-destructive">Your latest answers haven&apos;t been saved yet. {save.message}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={saveAndExit}>Try saving again</Button>
            <Button size="sm" variant="ghost" onClick={onExit}>Leave without saving</Button>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
        <nav aria-label="Questionnaire sections" className="hidden self-start md:sticky md:top-6 md:block">
          <ol className="flex flex-col gap-0.5">
            {sections.map((s, index) => {
              const done = sectionIssues(s) === 0;
              const active = !reviewing && index === currentIndex;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                      active ? "bg-muted font-medium text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-label="Complete" />
                    ) : (
                      <Circle className="mt-0.5 size-4 shrink-0" aria-hidden />
                    )}
                    <span className="min-w-0">{s.title}</span>
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => goTo(currentIndex, true)}
                aria-current={reviewing ? "step" : undefined}
                className={cn(
                  "mt-1 flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted",
                  reviewing ? "bg-muted font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                Review and submit
              </button>
            </li>
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <NativeSelect
            aria-label="Go to section"
            className="md:hidden"
            value={reviewing ? "review" : String(currentIndex)}
            onChange={(e) => (e.target.value === "review" ? goTo(currentIndex, true) : goTo(Number(e.target.value)))}
          >
            {sections.map((s, index) => (
              <option key={s.id} value={index}>
                {index + 1}. {s.title}
                {sectionIssues(s) === 0 ? " ✓" : ""}
              </option>
            ))}
            <option value="review">Review and submit</option>
          </NativeSelect>

          {reviewing ? (
            <ReviewStep
              ctx={ctx}
              sections={sections}
              answers={answers}
              issues={issues}
              onEdit={(index) => goTo(index)}
            />
          ) : section ? (
            <section className="flex flex-col gap-6" aria-labelledby={`section-${section.id}`}>
              <div className="flex flex-col gap-1.5">
                <h3 id={`section-${section.id}`} className="text-lg font-medium tracking-tight">{section.title}</h3>
                {section.description && (
                  <p className="text-sm text-pretty whitespace-pre-line text-muted-foreground">{section.description}</p>
                )}
                {currentIndex === 0 && (
                  <p className="text-xs text-muted-foreground">All questions are required unless marked Optional.</p>
                )}
              </div>
              <QuestionList questions={section.questions} chain={[]} scope={{}} container={answers} field={field} />
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">This questionnaire has no questions to answer.</p>
          )}

          {submitError && (
            <div role="alert" className="flex flex-col gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
              <p>{submitError}</p>
              {staleSubmission && (
                <Button size="sm" variant="outline" className="self-start" onClick={reloadSaved}>Reload saved answers</Button>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="outline"
              disabled={submitting || (!reviewing && currentIndex === 0)}
              onClick={() => (reviewing ? goTo(sections.length - 1) : goTo(currentIndex - 1))}
            >
              Previous
            </Button>
            {reviewing ? (
              <Button onClick={submit} disabled={submitting || issues.length > 0 || save.status === "conflict" || save.status === "unauthorized"}>
                {submitting && <Loader2 className="animate-spin" />}
                {submitting ? "Submitting…" : "Submit questionnaire"}
              </Button>
            ) : currentIndex < sections.length - 1 ? (
              <Button onClick={() => goTo(currentIndex + 1)}>Next section</Button>
            ) : (
              <Button onClick={() => goTo(currentIndex, true)}>Review answers</Button>
            )}
          </div>
        </div>
      </div>

      <Dialog open={save.status === "conflict"}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Your answers were updated elsewhere</DialogTitle>
            <DialogDescription>
              This questionnaire was saved from another window or device. Load the latest saved answers, or keep the answers on
              this screen and replace the saved version.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={reloadSaved}>Load saved answers</Button>
            <Button onClick={() => void saver?.overwriteAfterConflict()}>Keep my answers</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reverifyOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Verify your email again</DialogTitle>
            <DialogDescription>
              Your secure session ended. Your answers are still on this screen; verify to keep saving them.
            </DialogDescription>
          </DialogHeader>
          <PortalVerification
            token={token}
            organizationName={organizationName}
            intro={<></>}
            onVerified={async () => {
              setReverifyForSubmit(false);
              await onReverified();
            }}
            onLinkInvalid={onLinkInvalid}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackButton({ onClick, label = "Back to questionnaires", disabled }: { onClick: () => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-fit cursor-pointer items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-60"
    >
      <ArrowLeft className="size-3.5" />
      {label}
    </button>
  );
}

function SaveIndicator({ save, dirty, onRetry }: { save: SaverSnapshot; dirty: boolean; onRetry: () => void }) {
  let content: React.ReactNode = null;
  if (save.status === "saving") {
    content = (
      <>
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </>
    );
  } else if (save.status === "error") {
    content = (
      <>
        <span className="text-destructive">Not saved. {save.message}</span>
        <Button size="xs" variant="outline" onClick={onRetry}>Retry</Button>
      </>
    );
  } else if (save.status === "invalid") {
    content = <span className="text-destructive">Some answers can&apos;t be saved yet. {save.message}</span>;
  } else if (save.status === "conflict" || save.status === "unauthorized") {
    content = <span className="text-warning-foreground">Not saved</span>;
  } else if (dirty || save.status === "dirty") {
    content = "Unsaved changes";
  } else if (save.savedAt) {
    content = `Saved at ${save.savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  } else if (save.revision > 0) {
    content = "All changes saved";
  }
  return (
    <p role="status" aria-live="polite" className="flex min-h-6 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      {content}
    </p>
  );
}

function ReviewStep({
  ctx,
  sections,
  answers,
  issues,
  onEdit,
}: {
  ctx: QuestionnaireContext;
  sections: QuestionnaireSection[];
  answers: Answers;
  issues: ReturnType<typeof answerIssues>;
  onEdit: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-lg font-medium tracking-tight">Review your answers</h3>
        <p className="text-sm text-pretty text-muted-foreground">
          Check your answers before submitting. You can go back to any section to make changes.
        </p>
      </div>
      {issues.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-lg bg-warning/20 px-4 py-3 text-sm">
          <p className="font-medium text-warning-foreground">
            {issues.length === 1 ? "1 question needs an answer" : `${issues.length} questions need answers`} before you can submit
          </p>
          <ul className="flex flex-col gap-1">
            {issues.slice(0, 12).map((issue) => (
              <li key={issue.key} className="flex flex-wrap items-baseline gap-x-2">
                <button
                  type="button"
                  className="cursor-pointer text-left text-foreground underline underline-offset-2"
                  onClick={() => onEdit(sections.findIndex((s) => s.id === issue.sectionId))}
                >
                  {[...issue.path, issue.label].join(" › ")}
                </button>
                <span className="text-muted-foreground">{issue.message}</span>
              </li>
            ))}
            {issues.length > 12 && <li className="text-muted-foreground">and {issues.length - 12} more</li>}
          </ul>
        </div>
      )}
      {sections.map((s, index) => (
        <div key={s.id} className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-[0.9375rem] font-medium tracking-tight">{s.title}</h4>
            <Button size="sm" variant="ghost" onClick={() => onEdit(index)}>Edit</Button>
          </div>
          <AnswerSummary ctx={ctx} questions={s.questions} scope={{}} container={answers} />
        </div>
      ))}
    </div>
  );
}

function AnswerSummary({
  ctx,
  questions,
  scope,
  container,
}: {
  ctx: QuestionnaireContext;
  questions: QuestionDefinition[];
  scope: Scope;
  container: Row;
}) {
  const visible = questions.filter((q) => q.type !== "information" && ctx.isVisible(q, scope));
  if (visible.length === 0) return <p className="text-sm text-muted-foreground">No questions in this section apply to you.</p>;
  return (
    <dl className="flex flex-col divide-y divide-border">
      {visible.map((q) => {
        const value = container[q.id];
        if (q.type === "repeating_group") {
          const rows = Array.isArray(value) ? (value as Row[]) : [];
          return (
            <div key={q.id} className="flex flex-col gap-2 py-2.5 first:pt-0 last:pb-0">
              <dt className="text-sm text-muted-foreground">{q.label}</dt>
              <dd className="flex flex-col gap-2">
                {rows.length === 0 && <span className="text-sm text-muted-foreground/70">No entries</span>}
                {rows.map((row, index) => (
                  <div key={String(row[entryIdKey(q)])} className="flex flex-col gap-1 rounded-lg bg-muted/40 px-3 py-2">
                    <span className="text-xs font-medium text-foreground">
                      {q.label} {index + 1}
                    </span>
                    <AnswerSummary ctx={ctx} questions={q.fields ?? []} scope={{ ...scope, [q.id]: row }} container={row} />
                  </div>
                ))}
              </dd>
            </div>
          );
        }
        const text = formatAnswer(q, value);
        return (
          <div key={q.id} className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
            <dt className="text-sm text-muted-foreground">{q.label}</dt>
            <dd className={cn("text-sm break-words", text ? "text-foreground" : "text-muted-foreground/70")}>{text || "Not answered"}</dd>
          </div>
        );
      })}
    </dl>
  );
}
