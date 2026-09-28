"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";
import { Eye, FileQuestion, Plus, RefreshCw, StopCircle } from "lucide-react";
import { Panel } from "@/components/panel";
import { AssignQuestionnaireDialog } from "@/components/assign-questionnaire-dialog";
import { hasNewerVersion } from "@/lib/questionnaire-assignment";
import { QuestionnairePdfAccess } from "@/components/questionnaire-pdf-access";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  ApiError, cancelQuestionnaireAssignment, getQuestionnaireSubmissions,
  listClientQuestionnaireAssignments, listQuestionnaireReviewProposals, listQuestionnaireTemplates,
  listQuestionnaireVersions, resolveQuestionnaireReviewProposal, supersedeQuestionnaireAssignment,
  type QuestionnaireAssignment, type QuestionnaireAssignmentDetail, type QuestionnaireReviewProposal,
  type QuestionnaireVersion,
} from "@/lib/api";
import { clientQuestionnaireReviewsKey, clientQuestionnairesKey, questionnairesKey } from "@/lib/swr-keys";
import { QuestionnaireContext, formatAnswer, type QuestionDefinition, type QuestionnaireDefinition, type Scope } from "@/lib/questionnaire-logic";

export function ClientQuestionnairesCard({ clientId, clientName }: { clientId: number; clientName?: string }) {
  const assignments = useSWR(clientQuestionnairesKey(clientId), () => listClientQuestionnaireAssignments(clientId));
  const reviews = useSWR(clientQuestionnaireReviewsKey(clientId), () => listQuestionnaireReviewProposals(clientId));
  const templates = useSWR(questionnairesKey(false), () => listQuestionnaireTemplates(false));
  const [assignOpen, setAssignOpen] = useState(false); const [superseding, setSuperseding] = useState<QuestionnaireAssignment | null>(null);
  const [viewing, setViewing] = useState<QuestionnaireAssignment | null>(null);
  const [cancelling, setCancelling] = useState<QuestionnaireAssignment | null>(null);
  const refresh = () => { void assignments.mutate(); void reviews.mutate(); };
  return <>
    <Panel title="Questionnaires" meta={assignments.data ? `${assignments.data.length}` : undefined} loadError={assignments.error ? String(assignments.error) : null} action={<Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}><Plus /> Assign</Button>}>
      {!assignments.data ? <p className="text-sm text-muted-foreground">Loading questionnaires…</p> : assignments.data.length === 0 ? <p className="text-sm text-muted-foreground">No questionnaires assigned. Assignments are always explicit and optional by default.</p> : <ul className="divide-y divide-border/50">{assignments.data.map((a) => <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 text-sm font-medium"><FileQuestion className="size-4" /> {a.questionnaire_name}</p><p className="mt-1 text-xs text-muted-foreground">{assignmentDetails(a)}</p></div><div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" onClick={() => setViewing(a)}><Eye /> {a.status === "submitted" ? "View answers" : "Details"}</Button>{!['cancelled','superseded'].includes(a.status) && <>{hasNewerVersion(a, templates.data) && <Button size="sm" variant="ghost" onClick={() => setSuperseding(a)}><RefreshCw /> Update to latest</Button>}<Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelling(a)}><StopCircle /> Cancel</Button></>}</div></li>)}</ul>}
    </Panel>
    {cancelling && <CancelAssignmentDialog clientId={clientId} assignment={cancelling} onClose={() => setCancelling(null)} onCancelled={refresh} />}
    {(reviews.data?.length ?? 0) > 0 && <Panel title="Questionnaire reviews" meta={`${reviews.data!.length} pending`}><div className="flex flex-col gap-3">{reviews.data!.map((review) => <ReviewRow key={review.id} review={review} clientId={clientId} onResolved={refresh} />)}</div></Panel>}
    <AssignQuestionnaireDialog open={assignOpen} onOpenChange={setAssignOpen} clients={{ ids: [clientId], label: clientName ? `For ${clientName}` : "For this client" }} onAssigned={refresh} />
    {superseding && <UpdateToLatestDialog clientId={clientId} assignment={superseding} onClose={() => setSuperseding(null)} onUpdated={refresh} />}
    {viewing && <SubmissionDialog clientId={clientId} assignment={viewing} open onOpenChange={(open) => !open && setViewing(null)} />}
  </>;
}

function ReviewRow({ review, clientId, onResolved }: { review: QuestionnaireReviewProposal; clientId: number; onResolved: () => void }) {
  const [error, setError] = useState<string | null>(null); const details = review.details as { expected?: { doc_type_needed?: string }; desired?: { doc_type_needed?: string }; candidate_item_ids?: number[] };
  const resolve = async (action: "keep" | "withdraw" | "reactivate" | "map_existing", target?: number) => { try { await resolveQuestionnaireReviewProposal(clientId, review.id, action, target); onResolved(); } catch (e) { setError(e instanceof ApiError ? e.message : String(e)); } };
  return <div className="rounded-lg border p-3"><p className="text-sm font-medium">{review.kind.replaceAll("_", " ")}: {details.expected?.doc_type_needed ?? "document requirement"}</p>{details.desired?.doc_type_needed && <p className="text-xs text-muted-foreground">Proposed: {details.desired.doc_type_needed}</p>}<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void resolve("keep")}>Keep current</Button>{review.kind === "withdraw" && <Button size="sm" onClick={() => void resolve("withdraw")}>Withdraw</Button>}{review.kind === "reactivate" && <Button size="sm" onClick={() => void resolve("reactivate")}>Reactivate</Button>}{review.kind === "legacy_overlap" && details.candidate_item_ids?.map((id) => <Button key={id} size="sm" onClick={() => void resolve("map_existing", id)}>Map to item #{id}</Button>)}</div>{error && <p className="mt-2 text-xs text-destructive">{error}</p>}</div>;
}

// Defaults ("client", "unspecified") are internal and not worth showing.
function assignmentDetails(a: QuestionnaireAssignment): string {
  const period = a.reporting_period_label || (a.reporting_period_key !== "unspecified" ? a.reporting_period_key : null);
  const status = a.status === "assigned" ? "Not started" : a.status.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
  return [status, a.is_required ? "Required" : "Optional", a.respondent_identifier !== "client" ? a.respondent_identifier : null, period].filter(Boolean).join(" · ");
}

// Moves an open assignment onto the questionnaire's latest published version. The
// old assignment and its submissions stay in history; respondent, period and
// requiredness carry over. There is no version choice: it is always the latest.
function UpdateToLatestDialog({ clientId, assignment, onClose, onUpdated }: { clientId: number; assignment: QuestionnaireAssignment; onClose: () => void; onUpdated: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const latest = (await listQuestionnaireVersions(assignment.template_id)).reduce<QuestionnaireVersion | null>((max, v) => (!max || v.version_number > max.version_number ? v : max), null);
      if (!latest || latest.id === assignment.version_id) { setError("This assignment already uses the latest published questionnaire."); return; }
      await supersedeQuestionnaireAssignment(clientId, assignment.id, {
        version_id: latest.id, is_required: assignment.is_required, respondent_identifier: assignment.respondent_identifier,
        reporting_period_key: assignment.reporting_period_key, reporting_period_label: assignment.reporting_period_label,
      });
      onUpdated(); onClose();
    } catch (e) { setError(e instanceof ApiError ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}><DialogContent><DialogHeader><DialogTitle>Update to the latest questionnaire?</DialogTitle><DialogDescription>{assignment.questionnaire_name} has been updated since it was assigned. The client will answer the latest published questionnaire; the current assignment and any submitted answers stay in history.</DialogDescription></DialogHeader>{error && <p className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Keep current</Button><Button onClick={confirm} disabled={busy}>{busy ? "Updating…" : "Update"}</Button></DialogFooter></DialogContent></Dialog>;
}

function SubmissionDialog({ clientId, assignment, open, onOpenChange }: { clientId: number; assignment: QuestionnaireAssignment; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [detail, setDetail] = useState<QuestionnaireAssignmentDetail | null>(null); const [error, setError] = useState<string | null>(null); const [submissionIndex, setSubmissionIndex] = useState(0);
  const refresh = useCallback(() => { void getQuestionnaireSubmissions(clientId, assignment.id).then(setDetail).catch((e) => setError(e instanceof ApiError ? e.message : String(e))); }, [clientId, assignment.id]);
  useEffect(() => { refresh(); }, [refresh]);
  const hasPendingPdf = detail?.pdf_snapshots.some((snapshot) => snapshot.status === "pending") ?? false;
  useEffect(() => { if (!hasPendingPdf) return; const timer = window.setInterval(refresh, 5000); return () => window.clearInterval(timer); }, [refresh, hasPendingPdf]);
  const submission = detail?.submissions[submissionIndex];
  const snapshot = submission ? detail?.pdf_snapshots.find((item) => item.submission_id === submission.id) ?? null : null;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{detail?.questionnaire_name ?? assignment.questionnaire_name}</DialogTitle><DialogDescription>Published version {detail?.version_number ?? assignment.version_number} · {assignment.respondent_identifier} · {assignment.reporting_period_label || assignment.reporting_period_key}. Submitted answers are read-only.</DialogDescription></DialogHeader>{error ? <p className="text-sm text-destructive">{error}</p> : !detail ? <p className="text-sm text-muted-foreground">Decrypting submission…</p> : !submission ? <p className="text-sm text-muted-foreground">No submitted answers yet. Draft answers remain available only through the verified client portal.</p> : <div className="flex flex-col gap-5"><label className="flex max-w-xs flex-col gap-1"><Label>Submission history</Label><NativeSelect value={submissionIndex} onChange={(e) => setSubmissionIndex(Number(e.target.value))}>{detail.submissions.map((s, i) => <option key={s.id} value={i}>Submission {s.submission_number} · {new Date(s.submitted_at).toLocaleString()}</option>)}</NativeSelect></label><QuestionnairePdfAccess clientId={clientId} assignmentId={assignment.id} submissionId={submission.id} snapshot={snapshot} onChanged={refresh} /><AnswerSections definition={detail.definition} answers={submission.answers} /></div>}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter></DialogContent></Dialog>;
}

// Mirrors what the client saw: the shared evaluator hides questions and
// sections whose conditions were not met, and formatAnswer renders option
// labels, dates and structured values exactly as the portal review does.
function AnswerSections({ definition, answers }: { definition: QuestionnaireDefinition; answers: Record<string, unknown> }) {
  const ctx = new QuestionnaireContext(definition, answers);
  return <div className="flex flex-col gap-5">{definition.sections.filter((section) => ctx.sectionVisible(section)).map((section) => <section key={section.id} className="rounded-xl border p-4"><h3 className="font-medium">{section.title}</h3><AnswerList ctx={ctx} questions={section.questions} container={answers} scope={{}} className="mt-3" /></section>)}</div>;
}

function AnswerList({ ctx, questions, container, scope, className }: { ctx: QuestionnaireContext; questions: QuestionDefinition[]; container: Record<string, unknown>; scope: Scope; className?: string }) {
  return <dl className={`flex flex-col divide-y divide-border/50 ${className ?? ""}`}>{questions.filter((q) => q.type !== "information" && ctx.isVisible(q, scope)).map((q) => <AnswerRow key={q.id} ctx={ctx} question={q} value={container[q.id]} scope={scope} />)}</dl>;
}

function AnswerRow({ ctx, question, value, scope }: { ctx: QuestionnaireContext; question: QuestionDefinition; value: unknown; scope: Scope }) {
  const content = question.type === "repeating_group" && Array.isArray(value) && value.length
    ? <div className="flex flex-col gap-2">{value.map((row, i) => <div key={i} className="rounded-lg bg-muted/40 p-3"><p className="mb-1 text-xs font-medium text-foreground">Entry {i + 1}</p><AnswerList ctx={ctx} questions={question.fields ?? []} container={row as Record<string, unknown>} scope={{ ...scope, [question.id]: row as Record<string, unknown> }} /></div>)}</div>
    : formatAnswer(question, value) || "Not answered";
  const concealed = question.sensitivity === "restricted" || question.sensitivity === "confidential";
  return <div className="grid gap-1 py-3 sm:grid-cols-[minmax(10rem,0.8fr)_1.2fr]"><dt className="text-sm font-medium">{question.label}<span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-normal text-muted-foreground">{question.sensitivity ?? "standard"}</span></dt><dd className="text-sm text-muted-foreground">{concealed ? <SensitiveAnswer>{content}</SensitiveAnswer> : content}</dd></div>;
}

// Cancelling cannot be undone, so it is confirmed and any failure is shown.
function CancelAssignmentDialog({ clientId, assignment, onClose, onCancelled }: { clientId: number; assignment: QuestionnaireAssignment; onClose: () => void; onCancelled: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true); setError(null);
    try { await cancelQuestionnaireAssignment(clientId, assignment.id); onCancelled(); onClose(); }
    catch (e) { setError(e instanceof ApiError ? e.message : String(e)); onCancelled(); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => !open && !busy && onClose()}><DialogContent><DialogHeader><DialogTitle>Cancel this questionnaire?</DialogTitle><DialogDescription>{assignment.questionnaire_name} will no longer be requested from this client{assignment.is_required ? " or block their uploads" : ""}. Submitted answers and generated checklist requirements are kept. This cannot be undone.</DialogDescription></DialogHeader>{error && <p className="text-sm text-destructive">{error}</p>}<DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Keep assignment</Button><Button variant="destructive" onClick={confirm} disabled={busy}>{busy ? "Cancelling…" : "Cancel questionnaire"}</Button></DialogFooter></DialogContent></Dialog>;
}

function SensitiveAnswer({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return revealed ? <div className="flex flex-col items-start gap-1">{children}<button className="text-xs underline" onClick={() => setRevealed(false)}>Hide sensitive answer</button></div> : <Button size="sm" variant="outline" onClick={() => setRevealed(true)}>Reveal sensitive answer</Button>;
}
