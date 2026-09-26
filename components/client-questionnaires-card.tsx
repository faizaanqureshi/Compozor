"use client";

import { useEffect, useState, type ReactNode } from "react";
import useSWR from "swr";
import { Eye, FileQuestion, Plus, RefreshCw, StopCircle } from "lucide-react";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  ApiError, assignQuestionnaire, cancelQuestionnaireAssignment, getQuestionnaireSubmissions,
  listClientQuestionnaireAssignments, listQuestionnaireReviewProposals, listQuestionnaireTemplates,
  listQuestionnaireVersions, resolveQuestionnaireReviewProposal, supersedeQuestionnaireAssignment,
  type QuestionnaireAssignment, type QuestionnaireAssignmentDetail, type QuestionnaireReviewProposal,
  type QuestionnaireTemplate, type QuestionnaireVersion,
} from "@/lib/api";
import { clientQuestionnaireReviewsKey, clientQuestionnairesKey, questionnairesKey } from "@/lib/swr-keys";
import type { QuestionDefinition, QuestionnaireDefinition } from "@/lib/questionnaire-logic";

export function ClientQuestionnairesCard({ clientId }: { clientId: number }) {
  const assignments = useSWR(clientQuestionnairesKey(clientId), () => listClientQuestionnaireAssignments(clientId));
  const reviews = useSWR(clientQuestionnaireReviewsKey(clientId), () => listQuestionnaireReviewProposals(clientId));
  const templates = useSWR(questionnairesKey(false), () => listQuestionnaireTemplates(false));
  const [assignOpen, setAssignOpen] = useState(false); const [superseding, setSuperseding] = useState<QuestionnaireAssignment | null>(null);
  const [viewing, setViewing] = useState<QuestionnaireAssignment | null>(null);
  const refresh = () => { void assignments.mutate(); void reviews.mutate(); };
  return <>
    <Panel title="Questionnaires" meta={assignments.data ? `${assignments.data.length}` : undefined} loadError={assignments.error ? String(assignments.error) : null} action={<Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}><Plus /> Assign</Button>}>
      {!assignments.data ? <p className="text-sm text-muted-foreground">Loading questionnaires…</p> : assignments.data.length === 0 ? <p className="text-sm text-muted-foreground">No questionnaires assigned. Assignments are always explicit and optional by default.</p> : <ul className="divide-y divide-border/50">{assignments.data.map((a) => <li key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 text-sm font-medium"><FileQuestion className="size-4" /> {a.questionnaire_name} <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-normal">v{a.version_number}</span></p><p className="mt-1 text-xs text-muted-foreground">{a.is_required ? "Required" : "Optional"} · {a.respondent_identifier} · {a.reporting_period_label || a.reporting_period_key} · {a.status.replaceAll("_", " ")}</p></div><div className="flex flex-wrap gap-1"><Button size="sm" variant="ghost" onClick={() => setViewing(a)}><Eye /> {a.status === "submitted" ? "View answers" : "Details"}</Button>{!['cancelled','superseded'].includes(a.status) && <><Button size="sm" variant="ghost" onClick={() => setSuperseding(a)}><RefreshCw /> Supersede</Button><Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { await cancelQuestionnaireAssignment(clientId, a.id); refresh(); }}><StopCircle /> Cancel</Button></>}</div></li>)}</ul>}
    </Panel>
    {(reviews.data?.length ?? 0) > 0 && <Panel title="Questionnaire reviews" meta={`${reviews.data!.length} pending`}><div className="flex flex-col gap-3">{reviews.data!.map((review) => <ReviewRow key={review.id} review={review} clientId={clientId} onResolved={refresh} />)}</div></Panel>}
    <AssignmentDialog clientId={clientId} templates={templates.data ?? []} open={assignOpen || !!superseding} onOpenChange={(open) => { if (!open) { setAssignOpen(false); setSuperseding(null); } }} superseding={superseding} onSaved={() => { setAssignOpen(false); setSuperseding(null); refresh(); }} />
    {viewing && <SubmissionDialog clientId={clientId} assignment={viewing} open onOpenChange={(open) => !open && setViewing(null)} />}
  </>;
}

function ReviewRow({ review, clientId, onResolved }: { review: QuestionnaireReviewProposal; clientId: number; onResolved: () => void }) {
  const [error, setError] = useState<string | null>(null); const details = review.details as { expected?: { doc_type_needed?: string }; desired?: { doc_type_needed?: string }; candidate_item_ids?: number[] };
  const resolve = async (action: "keep" | "withdraw" | "reactivate" | "map_existing", target?: number) => { try { await resolveQuestionnaireReviewProposal(clientId, review.id, action, target); onResolved(); } catch (e) { setError(e instanceof ApiError ? e.message : String(e)); } };
  return <div className="rounded-lg border p-3"><p className="text-sm font-medium">{review.kind.replaceAll("_", " ")}: {details.expected?.doc_type_needed ?? "document requirement"}</p>{details.desired?.doc_type_needed && <p className="text-xs text-muted-foreground">Proposed: {details.desired.doc_type_needed}</p>}<div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void resolve("keep")}>Keep current</Button>{review.kind === "withdraw" && <Button size="sm" onClick={() => void resolve("withdraw")}>Withdraw</Button>}{review.kind === "reactivate" && <Button size="sm" onClick={() => void resolve("reactivate")}>Reactivate</Button>}{review.kind === "legacy_overlap" && details.candidate_item_ids?.map((id) => <Button key={id} size="sm" onClick={() => void resolve("map_existing", id)}>Map to item #{id}</Button>)}</div>{error && <p className="mt-2 text-xs text-destructive">{error}</p>}</div>;
}

function AssignmentDialog({ clientId, templates, open, onOpenChange, superseding, onSaved }: { clientId: number; templates: QuestionnaireTemplate[]; open: boolean; onOpenChange: (open: boolean) => void; superseding: QuestionnaireAssignment | null; onSaved: () => void }) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? 0); const [versions, setVersions] = useState<QuestionnaireVersion[]>([]); const [versionId, setVersionId] = useState(0);
  const [required, setRequired] = useState(superseding?.is_required ?? false); const [respondent, setRespondent] = useState(superseding?.respondent_identifier ?? "client"); const [period, setPeriod] = useState(superseding?.reporting_period_key ?? "unspecified"); const [periodLabel, setPeriodLabel] = useState(superseding?.reporting_period_label ?? ""); const [error, setError] = useState<string | null>(null);
  const effectiveTemplateId = templateId || templates[0]?.id || 0;
  useEffect(() => { if (!effectiveTemplateId) return; void listQuestionnaireVersions(effectiveTemplateId).then((items) => { setVersions(items); setVersionId(items.at(-1)?.id ?? 0); }); }, [effectiveTemplateId]);
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>{superseding ? "Supersede assignment" : "Assign questionnaire"}</DialogTitle><DialogDescription>{superseding ? "The current assignment and its submissions remain in history. Generated checklist requirements are preserved until a later submitted amendment reconciles them." : "Choose a published version. No message is sent automatically; use the existing portal link and reminder controls after assigning."}</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-1"><Label>Questionnaire</Label><NativeSelect value={effectiveTemplateId} onChange={(e) => setTemplateId(Number(e.target.value))}><option value={0}>Select…</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</NativeSelect></label><label className="flex flex-col gap-1"><Label>Version</Label><NativeSelect value={versionId} onChange={(e) => setVersionId(Number(e.target.value))}><option value={0}>Select…</option>{versions.map((v) => <option key={v.id} value={v.id}>Version {v.version_number}</option>)}</NativeSelect></label><label className="flex flex-col gap-1"><Label>Respondent</Label><Input value={respondent} onChange={(e) => setRespondent(e.target.value)} /></label><label className="flex flex-col gap-1"><Label>Reporting period key</Label><Input value={period} onChange={(e) => setPeriod(e.target.value)} /></label><label className="flex flex-col gap-1 sm:col-span-2"><Label>Reporting period label</Label><Input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} /></label><label className="flex items-center gap-2 text-sm sm:col-span-2"><Switch checked={required} onCheckedChange={setRequired} /> Required before uploads</label>{error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}</div><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!versionId} onClick={async () => { const input = { version_id: versionId, is_required: required, respondent_identifier: respondent, reporting_period_key: period, reporting_period_label: periodLabel || null }; try { if (superseding) await supersedeQuestionnaireAssignment(clientId, superseding.id, input); else await assignQuestionnaire(clientId, input); onSaved(); } catch (e) { setError(e instanceof ApiError ? e.message : String(e)); } }}>{superseding ? "Supersede" : "Assign"}</Button></DialogFooter></DialogContent></Dialog>;
}

function SubmissionDialog({ clientId, assignment, open, onOpenChange }: { clientId: number; assignment: QuestionnaireAssignment; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [detail, setDetail] = useState<QuestionnaireAssignmentDetail | null>(null); const [error, setError] = useState<string | null>(null); const [submissionIndex, setSubmissionIndex] = useState(0);
  useEffect(() => { void getQuestionnaireSubmissions(clientId, assignment.id).then(setDetail).catch((e) => setError(e instanceof ApiError ? e.message : String(e))); }, [clientId, assignment.id]);
  const submission = detail?.submissions[submissionIndex];
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>{detail?.questionnaire_name ?? assignment.questionnaire_name}</DialogTitle><DialogDescription>Published version {detail?.version_number ?? assignment.version_number} · {assignment.respondent_identifier} · {assignment.reporting_period_label || assignment.reporting_period_key}. Submitted answers are read-only.</DialogDescription></DialogHeader>{error ? <p className="text-sm text-destructive">{error}</p> : !detail ? <p className="text-sm text-muted-foreground">Decrypting submission…</p> : !submission ? <p className="text-sm text-muted-foreground">No submitted answers yet. Draft answers remain available only through the verified client portal.</p> : <div className="flex flex-col gap-5"><label className="flex max-w-xs flex-col gap-1"><Label>Submission history</Label><NativeSelect value={submissionIndex} onChange={(e) => setSubmissionIndex(Number(e.target.value))}>{detail.submissions.map((s, i) => <option key={s.id} value={i}>Submission {s.submission_number} · {new Date(s.submitted_at).toLocaleString()}</option>)}</NativeSelect></label><AnswerSections definition={detail.definition} answers={submission.answers} /></div>}<DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button></DialogFooter></DialogContent></Dialog>;
}

function AnswerSections({ definition, answers }: { definition: QuestionnaireDefinition; answers: Record<string, unknown> }) {
  return <div className="flex flex-col gap-5">{definition.sections.map((section) => <section key={section.id} className="rounded-xl border p-4"><h3 className="font-medium">{section.title}</h3><dl className="mt-3 flex flex-col divide-y divide-border/50">{section.questions.map((q) => <AnswerRow key={q.id} question={q} value={answers[q.id]} />)}</dl></section>)}</div>;
}

function AnswerRow({ question, value }: { question: QuestionDefinition; value: unknown }) {
  if (question.type === "information") return null;
  const display = value === undefined || value === null || value === "" ? "Not answered" : Array.isArray(value) ? (question.type === "repeating_group" ? null : value.join(", ")) : typeof value === "object" ? Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join(" · ") : typeof value === "boolean" ? (value ? "Yes" : "No") : String(value);
  const content = question.type === "repeating_group" && Array.isArray(value) ? <div className="flex flex-col gap-2">{value.map((row, i) => <div key={i} className="rounded-lg bg-muted/40 p-3"><p className="mb-1 text-xs font-medium">Entry {i + 1}</p>{(question.fields ?? []).map((field) => <AnswerRow key={field.id} question={field} value={(row as Record<string, unknown>)[field.id]} />)}</div>)}</div> : display;
  const concealed = question.sensitivity === "restricted" || question.sensitivity === "confidential";
  return <div className="grid gap-1 py-3 sm:grid-cols-[minmax(10rem,0.8fr)_1.2fr]"><dt className="text-sm font-medium">{question.label}<span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-normal text-muted-foreground">{question.sensitivity ?? "standard"}</span></dt><dd className="text-sm text-muted-foreground">{concealed ? <SensitiveAnswer>{content}</SensitiveAnswer> : content}</dd></div>;
}

function SensitiveAnswer({ children }: { children: ReactNode }) {
  const [revealed, setRevealed] = useState(false);
  return revealed ? <div className="flex flex-col items-start gap-1">{children}<button className="text-xs underline" onClick={() => setRevealed(false)}>Hide sensitive answer</button></div> : <Button size="sm" variant="outline" onClick={() => setRevealed(true)}>Reveal sensitive answer</Button>;
}
