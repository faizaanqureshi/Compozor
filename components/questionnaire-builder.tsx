"use client";

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode, type Ref } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, FileText, History, Plus, Save, Send, Settings2, SlidersHorizontal, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Panel } from "@/components/panel";
import { LeaveEditorDialog, useLeaveGuard } from "@/components/questionnaire-leave-guard";
import { QuestionList } from "@/components/questionnaire-fields";
import {
  ApiError,
  createQuestionnaireTemplate,
  type DocumentGenerationRule,
  type DocumentRequirementOutput,
  type QuestionnaireTemplate,
  type QuestionnaireVersion,
  previewQuestionnaire,
  publishQuestionnaireVersion,
  updateQuestionnaireTemplate,
} from "@/lib/api";
import {
  QuestionnaireContext,
  answerIssues,
  conditionValueFromInput,
  conditionValueToInput,
  type Answers,
  type Condition,
  type QuestionDefinition,
  type QuestionnaireDefinition,
  type QuestionnaireSection,
  type QuestionType,
  type FormatKind,
} from "@/lib/questionnaire-logic";
import {
  OPERATOR_OPTIONS,
  QUESTION_TYPES,
  allQuestions,
  changeQuestionType,
  compareVersions,
  countQuestions,
  deleteQuestionIn,
  deleteSectionIn,
  describeCondition,
  describeValidation,
  draftFromVersion,
  duplicateQuestionIn,
  duplicateSectionIn,
  emptyQuestionnaire,
  move,
  newDocumentRequest,
  newQuestion,
  newSection,
  previewable,
  questionDependents,
  replaceRule,
  requestsForQuestion,
  retargetQuestionRequests,
  retargetRequest,
  sectionDependents,
  simpleRequest,
  stableId,
  typeLabel,
  updateSimpleRequest,
  type SimpleRequest,
} from "@/lib/questionnaire-builder-model";

export { emptyQuestionnaire };

type Rules = DocumentGenerationRule[];
const errorText = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

// ---- Conditions (advanced settings only) -------------------------------------

// Values are stored as the JSON type the backend compares against: booleans for
// yes/no and confirmation questions, option values for choices, numbers for numbers.
function ConditionValueInput({ question, operator, value, onChange }: { question?: QuestionDefinition; operator: string; value: unknown; onChange: (value: unknown) => void }) {
  const list = operator === "in" || operator === "not_in";
  if (!list && question && (question.type === "yes_no" || question.type === "confirmation")) {
    return <NativeSelect aria-label="Answer" value={value === true ? "true" : value === false ? "false" : ""} onChange={(e) => onChange(e.target.value === "" ? "" : e.target.value === "true")}><option value="">Select…</option><option value="true">Yes</option><option value="false">No</option></NativeSelect>;
  }
  if (!list && question?.options?.length) {
    return <NativeSelect aria-label="Answer" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}><option value="">Select…</option>{question.options.map((o) => <option key={o.value} value={o.value}>{o.label || "Untitled choice"}</option>)}</NativeSelect>;
  }
  return <Input aria-label="Answer" value={conditionValueToInput(value)} placeholder={list ? "Answers, separated by commas" : "Answer"} onChange={(e) => onChange(conditionValueFromInput(question, operator, e.target.value))} />;
}

const blankComparison = (questions: QuestionDefinition[]): Condition => ({ kind: "comparison", question_id: questions[0]?.id ?? "", operator: "exists" });

function ConditionEditor({ value, onChange, definition, label, empty, required }: { value?: Condition | null; onChange: (value: Condition | null) => void; definition: QuestionnaireDefinition; label: string; empty?: string; required?: boolean }) {
  const questions = allQuestions(definition);
  const groups = questions.filter((q) => q.type === "repeating_group");
  const compared = questions.find((q) => q.id === value?.question_id);
  if (!value) {
    return <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5">
      <span className="text-xs text-muted-foreground">{empty ?? "No condition"}</span>
      <Button size="sm" variant="outline" onClick={() => onChange(blankComparison(questions))} disabled={!questions.length}><Plus /> Add condition</Button>
    </div>;
  }
  const changeKind = (kind: Condition["kind"]) => {
    const child = blankComparison(questions);
    if (kind === "comparison") onChange(child);
    else if (kind === "all" || kind === "any") onChange({ kind, conditions: [child] });
    else if (kind === "not") onChange({ kind, condition: child });
    else onChange({ kind, group_question_id: groups[0]?.id ?? "", quantifier: "any", condition: child });
  };
  const noValue = ["exists", "not_exists"].includes(value.operator ?? "");
  return <div className="flex flex-col gap-3 rounded-lg bg-muted/30 p-3">
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-40 flex-1 flex-col gap-1 text-xs text-muted-foreground">{label}
        <NativeSelect value={value.kind} onChange={(e) => changeKind(e.target.value as Condition["kind"])}>
          <option value="comparison">One answer</option><option value="all">All of these</option><option value="any">Any of these</option><option value="not">None of this</option><option value="repeat" disabled={!groups.length}>Entries in a repeating list</option>
        </NativeSelect>
      </label>
      {!required && <Button size="sm" variant="ghost" onClick={() => onChange(null)}><Trash2 /> Remove</Button>}
    </div>
    {value.kind === "comparison" && <div className="grid gap-2 sm:grid-cols-3">
      <NativeSelect aria-label="Question" value={value.question_id ?? ""} onChange={(e) => { const next = questions.find((q) => q.id === e.target.value); const op = value.operator ?? "exists"; onChange({ ...value, question_id: e.target.value, value: ["exists", "not_exists"].includes(op) ? undefined : conditionValueFromInput(next, op, conditionValueToInput(value.value)) }); }}>
        {questions.map((q) => <option key={q.id} value={q.id}>{q.label || "Untitled question"}</option>)}
      </NativeSelect>
      <NativeSelect aria-label="Comparison" value={value.operator ?? "exists"} onChange={(e) => { const op = e.target.value; onChange({ ...value, operator: op, value: ["exists", "not_exists"].includes(op) ? undefined : conditionValueFromInput(compared, op, conditionValueToInput(value.value)) }); }}>
        {OPERATOR_OPTIONS.map((op) => <option key={op.value} value={op.value}>{op.label}</option>)}
      </NativeSelect>
      {!noValue && <ConditionValueInput question={compared} operator={value.operator ?? "equals"} value={value.value} onChange={(next) => onChange({ ...value, value: next })} />}
    </div>}
    {(value.kind === "all" || value.kind === "any") && <div className="flex flex-col gap-2">
      {(value.conditions ?? []).map((child, i) => <ConditionEditor key={i} value={child} label={`Condition ${i + 1}`} definition={definition} onChange={(next) => { const children = [...(value.conditions ?? [])]; if (next) children[i] = next; else children.splice(i, 1); onChange(children.length ? { ...value, conditions: children } : null); }} />)}
      <Button size="sm" variant="outline" className="self-start" onClick={() => onChange({ ...value, conditions: [...(value.conditions ?? []), blankComparison(questions)] })}><Plus /> Add condition</Button>
    </div>}
    {value.kind === "not" && <ConditionEditor required value={value.condition} label="This must not be true" definition={definition} onChange={(condition) => condition && onChange({ ...value, condition })} />}
    {value.kind === "repeat" && <>
      <div className="grid gap-2 sm:grid-cols-2">
        <NativeSelect aria-label="Repeating list" value={value.group_question_id ?? ""} onChange={(e) => onChange({ ...value, group_question_id: e.target.value })}>{groups.map((q) => <option key={q.id} value={q.id}>{q.label || "Untitled list"}</option>)}</NativeSelect>
        <NativeSelect aria-label="Entries" value={value.quantifier ?? "any"} onChange={(e) => onChange({ ...value, quantifier: e.target.value as "any" | "all" })}><option value="any">Any entry matches</option><option value="all">Every entry matches</option></NativeSelect>
      </div>
      <ConditionEditor required value={value.condition} label="Entry condition" definition={definition} onChange={(condition) => condition && onChange({ ...value, condition })} />
    </>}
  </div>;
}

// ---- Question-level document requests --------------------------------------------

/** The answer control for a simple request, chosen from the question type. */
function TriggerInput({ question, request, onChange }: { question: QuestionDefinition; request: SimpleRequest; onChange: (patch: { value: unknown; operator: "equals" | "contains" | "exists" }) => void }) {
  if (question.type === "yes_no" || question.type === "confirmation") {
    return <NativeSelect aria-label="Answer" value={request.value === false ? "false" : "true"} onChange={(e) => onChange({ operator: "equals", value: e.target.value === "true" })}>
      <option value="true">{question.type === "confirmation" ? "Confirmed" : "Yes"}</option><option value="false">{question.type === "confirmation" ? "Not confirmed" : "No"}</option>
    </NativeSelect>;
  }
  if (question.type === "single_choice" || question.type === "multiple_choice") {
    const operator = question.type === "multiple_choice" ? "contains" : "equals";
    const any = request.operator === "exists";
    return <NativeSelect aria-label="Answer" value={any ? "__any__" : typeof request.value === "string" ? request.value : ""} onChange={(e) => onChange(e.target.value === "__any__" ? { operator: "exists", value: undefined } : { operator, value: e.target.value })}>
      {!any && !(question.options ?? []).some((o) => o.value === request.value) && <option value="">Select a choice…</option>}
      {(question.options ?? []).map((o, i) => <option key={o.value} value={o.value}>{o.label || `Choice ${i + 1}`}</option>)}
      <option value="__any__">Any answer</option>
    </NativeSelect>;
  }
  return <span className="flex h-8 items-center rounded-lg bg-muted/40 px-2.5 text-sm text-muted-foreground">Any answer is given</span>;
}

function RequestFields({ question, request, rules, setRules, compact }: { question: QuestionDefinition; request: SimpleRequest; rules: Rules; setRules: (rules: Rules) => void; compact?: boolean }) {
  const patch = (p: Parameters<typeof updateSimpleRequest>[1]) => setRules(replaceRule(rules, updateSimpleRequest(request.rule, p) as DocumentGenerationRule));
  return <div className={compact ? "grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]" : "grid gap-3"}>
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">When the answer is<TriggerInput question={question} request={request} onChange={patch} /></label>
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">Request this document<Input autoFocus={!request.title} value={request.title} placeholder="e.g. T4 slip from each employer" onChange={(e) => patch({ title: e.target.value })} /></label>
    <label className={`flex flex-col gap-1 text-xs text-muted-foreground ${compact ? "sm:col-span-2" : ""}`}>Instructions for the client (optional)<Textarea rows={2} value={request.instructions} placeholder="Anything the client should know about this document" onChange={(e) => patch({ instructions: e.target.value })} /></label>
  </div>;
}

function QuestionDocumentRequests({ question, definition, rules, setRules, onOpenRules }: { question: QuestionDefinition; definition: QuestionnaireDefinition; rules: Rules; setRules: (rules: Rules) => void; onOpenRules: () => void }) {
  const { simple, advanced } = requestsForQuestion(rules, definition, question.id);
  return <div className="flex flex-col gap-3 border-t border-border/60 pt-4">
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-sm font-medium"><FileText className="size-4 text-muted-foreground" /> Document requests</p>
      <Button size="sm" variant="outline" onClick={() => setRules([...rules, newDocumentRequest(question) as DocumentGenerationRule])}><Plus /> Add document request</Button>
    </div>
    {simple.map((request) => <div key={request.rule.id} className="flex flex-col gap-2 rounded-lg bg-muted/30 p-3">
      <RequestFields question={question} request={request} rules={rules} setRules={setRules} compact />
      <Button size="sm" variant="ghost" className="self-end text-destructive" onClick={() => setRules(rules.filter((r) => r.id !== request.rule.id))}><Trash2 /> Remove request</Button>
    </div>)}
    {!simple.length && !advanced && <p className="text-xs text-muted-foreground">Ask the client for a document based on their answer to this question.</p>}
    {advanced > 0 && <p className="text-xs text-muted-foreground">This question is also used by {advanced} advanced document rule{advanced === 1 ? "" : "s"}. <button className="underline underline-offset-2" onClick={onOpenRules}>Review in Document requests</button></p>}
  </div>;
}

// ---- Questions ----------------------------------------------------------------------

const SENSITIVITY = [
  { value: "standard", label: "Standard", hint: "Everyday information" },
  { value: "personal", label: "Personal", hint: "Identifies the client, such as a birth date" },
  { value: "confidential", label: "Confidential", hint: "Financial or tax details" },
  { value: "restricted", label: "Restricted", hint: "Highly sensitive, such as a SIN or health information" },
];

function ChoicesEditor({ question, rules, definition, onChange }: { question: QuestionDefinition; rules: Rules; definition: QuestionnaireDefinition; onChange: (q: QuestionDefinition) => void }) {
  const options = question.options ?? [];
  const used = new Set(rules.map((r) => simpleRequest(r, definition)).filter((r) => r?.questionId === question.id).map((r) => r!.value));
  return <div className="flex flex-col gap-2">
    <Label>Choices</Label>
    {options.map((option, i) => <div key={option.value} className="flex items-center gap-2">
      <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{i + 1}.</span>
      <Input aria-label={`Choice ${i + 1}`} value={option.label} placeholder={`Choice ${i + 1}`} onChange={(e) => { const next = [...options]; next[i] = { ...option, label: e.target.value }; onChange({ ...question, options: next }); }} />
      <Button size="icon" variant="ghost" aria-label="Remove choice" onClick={() => onChange({ ...question, options: options.filter((_, x) => x !== i) })} disabled={options.length <= 1 || used.has(option.value)} title={used.has(option.value) ? "A document request uses this choice" : undefined}><Trash2 /></Button>
    </div>)}
    <Button size="sm" variant="ghost" className="self-start" onClick={() => onChange({ ...question, options: [...options, { value: stableId("option"), label: "" }] })}><Plus /> Add choice</Button>
  </div>;
}

// ---- Import review layer (optional) ----------------------------------------------
// An AI import reuses this builder unchanged; the review page supplies these
// hooks to mark items that need a decision and to filter to them.

export type ReviewSeverity = "critical" | "warning";
export interface ReviewLayer {
  severity: Record<string, ReviewSeverity>;
  render: (targetId: string) => ReactNode;
  visibleQuestionIds: Set<string> | null;
}

function ReviewFlag({ severity }: { severity: ReviewSeverity }) {
  return <span className={`inline-flex items-center gap-1 text-xs font-medium ${severity === "critical" ? "text-destructive" : "text-warning-foreground"}`}>
    <AlertTriangle className="size-3.5" aria-hidden />{severity === "critical" ? "Must review" : "Needs review"}
  </span>;
}

interface QuestionCardProps {
  question: QuestionDefinition;
  index: number;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  definition: QuestionnaireDefinition;
  rules: Rules;
  setRules: (rules: Rules) => void;
  onChange: (q: QuestionDefinition) => void;
  onChangeType: (type: QuestionType) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
  onOpenRules: () => void;
  nested?: boolean;
  review?: ReviewLayer;
}

function QuestionCard(props: QuestionCardProps) {
  const { question, index, total, expanded, onToggle, definition, rules, setRules, onChange, nested } = props;
  const [more, setMore] = useState(false);
  const [openField, setOpenField] = useState<string | null>(null);
  const blockers = questionDependents(definition, rules, question);
  const requestCount = nested ? 0 : requestsForQuestion(rules, definition, question.id).simple.length;
  const choice = question.type === "single_choice" || question.type === "multiple_choice";
  const hasAdvanced = !!(question.description || question.visible_when || question.required_when || (question.sensitivity && question.sensitivity !== "standard"));
  const flag = nested ? undefined : props.review?.severity[question.id];
  const flagRing = flag === "critical" ? "ring-2 ring-destructive/60" : flag === "warning" ? "ring-2 ring-warning" : "";

  if (!expanded) {
    return <button type="button" data-question-id={question.id} onClick={onToggle} className={`group flex w-full items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-muted/40 ${flagRing}`}>
      <span className="w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${question.label ? "" : "text-muted-foreground italic"}`}>{question.label || "Untitled question"}</span>
        <span className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
          <span>{typeLabel(question.type)}</span>
          {question.required && <span>· Required</span>}
          {(question.visible_when || question.required_when) && <span>· Conditional</span>}
          {requestCount > 0 && <span>· {requestCount} document request{requestCount === 1 ? "" : "s"}</span>}
          {flag && <ReviewFlag severity={flag} />}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>;
  }

  const fields = question.fields ?? [];
  const setFields = (next: QuestionDefinition[]) => onChange({ ...question, fields: next });
  return <div data-question-id={question.id} className={`my-2 flex flex-col gap-4 rounded-xl bg-card p-4 animate-blur-in-sm ${flagRing || "ring-1 ring-foreground/15"}`}>
    {!nested && props.review?.render(question.id)}
    <div className="flex items-start gap-2">
      <Textarea aria-label="Question" rows={1} autoFocus={!question.label} className="min-h-10 flex-1 resize-none text-base" value={question.label} placeholder={question.type === "information" ? "Information to show the client" : "Type your question"} onChange={(e) => onChange({ ...question, label: e.target.value })} />
      <Button size="icon" variant="ghost" aria-label="Collapse question" onClick={onToggle}><ChevronDown /></Button>
    </div>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <NativeSelect aria-label="Question type" className="w-full sm:w-56" value={question.type} onChange={(e) => props.onChangeType(e.target.value as QuestionType)}>
        {QUESTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      </NativeSelect>
      {question.type !== "information" && <label className="flex items-center gap-2 text-sm"><Switch checked={!!question.required} onCheckedChange={(required) => onChange({ ...question, required })} /> Required</label>}
      {question.type === "date" && <label className="flex items-center gap-2 text-sm text-muted-foreground">Ask for
        <NativeSelect className="w-52" value={question.date_precision ?? "day"} onChange={(e) => onChange({ ...question, date_precision: e.target.value as QuestionDefinition["date_precision"] })}><option value="day">A full date</option><option value="month">Month and year</option><option value="year">Year only</option><option value="partial">As much as they know</option></NativeSelect>
      </label>}
      {question.type === "short_text" && <label className="flex items-center gap-2 text-sm text-muted-foreground">Answer format
        <NativeSelect aria-label="Answer format" className="w-44" value={question.input_format?.kind ?? ""} onChange={(e) => {
          const kind = e.target.value as FormatKind | "";
          onChange(kind ? { ...question, input_format: { kind, region: kind === "email" ? null : question.input_format?.region ?? null },
            ...(kind === "national_id" ? { sensitivity: "restricted" } : {}) } : { ...question, input_format: null });
        }}>
          <option value="">Any text</option><option value="phone">Phone number</option><option value="email">Email address</option>
          <option value="postal_code">Postal or ZIP code</option><option value="national_id">ID number (e.g. SIN, SSN)</option>
        </NativeSelect>
      </label>}
      {question.type === "short_text" && question.input_format && question.input_format.kind !== "email" && <label className="flex items-center gap-2 text-sm text-muted-foreground">Country
        <NativeSelect aria-label="Format country" className="w-40" value={question.input_format.region ?? ""} onChange={(e) => onChange({ ...question, input_format: { ...question.input_format!, region: (e.target.value || null) as "CA" | "US" | null } })}>
          <option value="">Any country</option><option value="CA">Canada</option><option value="US">United States</option>
        </NativeSelect>
      </label>}
      {question.type === "currency" && <label className="flex items-center gap-2 text-sm text-muted-foreground">Currency
        <Input className="w-20 uppercase" maxLength={3} value={question.currency_code ?? ""} placeholder="CAD" onChange={(e) => onChange({ ...question, currency_code: e.target.value.toUpperCase() })} />
      </label>}
    </div>
    {choice && <ChoicesEditor question={question} rules={rules} definition={definition} onChange={(q) => { onChange(q); }} />}
    {question.type === "repeating_group" && <div className="flex flex-col gap-3 rounded-lg bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>Clients can add</span>
        <Input aria-label="Minimum entries" className="w-20" type="number" min={0} value={question.min_items ?? ""} placeholder="0" onChange={(e) => onChange({ ...question, min_items: e.target.value ? Number(e.target.value) : null })} />
        <span>to</span>
        <Input aria-label="Maximum entries" className="w-20" type="number" min={1} value={question.max_items ?? ""} placeholder="Any" onChange={(e) => onChange({ ...question, max_items: e.target.value ? Number(e.target.value) : null })} />
        <span>entries</span>
      </div>
      <Label>Questions in each entry</Label>
      {fields.map((field, i) => <QuestionCard key={field.id} nested question={field} index={i} total={fields.length} expanded={openField === field.id} onToggle={() => setOpenField(openField === field.id ? null : field.id)}
        definition={definition} rules={rules} setRules={setRules} onOpenRules={props.onOpenRules}
        onChange={(next) => { const copy = [...fields]; copy[i] = next; setFields(copy); }}
        onChangeType={(type) => { const copy = [...fields]; copy[i] = changeQuestionType(field, type); setFields(copy); }}
        onDuplicate={() => { const copy = [...fields]; const clone = { ...structuredClone(field), id: stableId("q") }; copy.splice(i + 1, 0, clone); setFields(copy); setOpenField(clone.id); }}
        onDelete={() => { if (fields.length > 1 && !questionDependents(definition, rules, field).length) setFields(fields.filter((_, x) => x !== i)); }}
        onMove={(delta) => setFields(move(fields, i, delta))} />)}
      <Button size="sm" variant="ghost" className="self-start" onClick={() => { const q = newQuestion(); setFields([...fields, q]); setOpenField(q.id); }}><Plus /> Add question to entry</Button>
    </div>}

    {more && <div className="flex flex-col gap-4 border-l-2 border-border/60 pl-3">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">Help text shown under the question<Textarea rows={2} value={question.description ?? ""} placeholder="Optional guidance for the client" onChange={(e) => onChange({ ...question, description: e.target.value || null })} /></label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">How sensitive is this answer?
        <NativeSelect value={question.sensitivity ?? "standard"} onChange={(e) => onChange({ ...question, sensitivity: e.target.value })}>{SENSITIVITY.map((s) => <option key={s.value} value={s.value}>{s.label} — {s.hint}</option>)}</NativeSelect>
      </label>
      <ConditionEditor label="Show this question only when" empty="Always shown" value={question.visible_when} definition={definition} onChange={(visible_when) => onChange({ ...question, visible_when })} />
      {question.type !== "information" && <ConditionEditor label="Make it required only when" empty="Required setting applies always" value={question.required_when} definition={definition} onChange={(required_when) => onChange({ ...question, required_when })} />}
    </div>}

    {!nested && question.type !== "information" && <QuestionDocumentRequests question={question} definition={definition} rules={rules} setRules={setRules} onOpenRules={props.onOpenRules} />}

    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
      <Button size="sm" variant="ghost" onClick={() => setMore(!more)}><SlidersHorizontal /> {more ? "Hide options" : "More options"}{!more && hasAdvanced && <span className="size-1.5 rounded-full bg-primary" aria-label="has settings" />}</Button>
      <div className="flex flex-wrap items-center gap-1">
        <Button size="icon" variant="ghost" aria-label="Move up" onClick={() => props.onMove(-1)} disabled={index === 0}><ArrowUp /></Button>
        <Button size="icon" variant="ghost" aria-label="Move down" onClick={() => props.onMove(1)} disabled={index === total - 1}><ArrowDown /></Button>
        <Button size="icon" variant="ghost" aria-label="Duplicate question" onClick={props.onDuplicate}><Copy /></Button>
        <Button size="icon" variant="ghost" aria-label="Delete question" className="text-destructive" onClick={props.onDelete} disabled={blockers.length > 0 || (nested && total <= 1)} title={blockers.length ? `Used by ${blockers.join(", ")}` : undefined}><Trash2 /></Button>
      </div>
    </div>
    {blockers.length > 0 && <p className="-mt-2 text-xs text-muted-foreground">To delete this question, first remove what depends on it: {blockers.join(", ")}.</p>}
  </div>;
}

// ---- Sections --------------------------------------------------------------------

interface SectionCardProps {
  section: QuestionnaireSection;
  index: number;
  total: number;
  collapsed: boolean;
  onCollapse: (collapsed: boolean) => void;
  expandedQuestion: string | null;
  setExpandedQuestion: (id: string | null) => void;
  definition: QuestionnaireDefinition;
  rules: Rules;
  setDraft: (definition: QuestionnaireDefinition, rules?: Rules) => void;
  onOpenRules: () => void;
  review?: ReviewLayer;
}

function SectionCard(props: SectionCardProps) {
  const { section, index, total, collapsed, definition, rules, setDraft } = props;
  const [settings, setSettings] = useState(false);
  const blockers = sectionDependents(definition, rules, section);
  const count = section.questions.filter((q) => q.type !== "information").length;
  const updateSection = (next: QuestionnaireSection) => setDraft({ ...definition, sections: definition.sections.map((s) => (s.id === section.id ? next : s)) });
  const setQuestions = (questions: QuestionDefinition[]) => updateSection({ ...section, questions });
  const setQuestion = (qi: number, next: QuestionDefinition) => { const qs = [...section.questions]; qs[qi] = next; setQuestions(qs); };

  return <section className="flex flex-col rounded-2xl bg-card ring-1 ring-foreground/10">
    <header className="flex flex-wrap items-start gap-2 p-4 sm:flex-nowrap sm:p-5">
      <Button size="icon" variant="ghost" className="mt-0.5" aria-label={collapsed ? "Expand section" : "Collapse section"} aria-expanded={!collapsed} onClick={() => props.onCollapse(!collapsed)}>{collapsed ? <ChevronRight /> : <ChevronDown />}</Button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <input aria-label="Section title" className="w-full min-w-0 bg-transparent text-xl font-light tracking-tight outline-none placeholder:text-muted-foreground/70 focus-visible:underline focus-visible:decoration-border focus-visible:underline-offset-8" value={section.title} placeholder={`Section ${index + 1} title`} onChange={(e) => updateSection({ ...section, title: e.target.value })} />
        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">{count} question{count === 1 ? "" : "s"}{section.visible_when ? " · Shown conditionally" : ""}{props.review?.severity[section.id] && <ReviewFlag severity={props.review.severity[section.id]} />}</span>
      </div>
      <div className="order-last flex w-full shrink-0 justify-end gap-0.5 sm:order-none sm:w-auto">
        <Button size="icon" variant="ghost" aria-label="Section settings" aria-pressed={settings} onClick={() => { setSettings(!settings); props.onCollapse(false); }}><Settings2 /></Button>
        <Button size="icon" variant="ghost" aria-label="Move section up" onClick={() => setDraft({ ...definition, sections: move(definition.sections, index, -1) })} disabled={index === 0}><ArrowUp /></Button>
        <Button size="icon" variant="ghost" aria-label="Move section down" onClick={() => setDraft({ ...definition, sections: move(definition.sections, index, 1) })} disabled={index === total - 1}><ArrowDown /></Button>
        <Button size="icon" variant="ghost" aria-label="Duplicate section" onClick={() => { const next = duplicateSectionIn(definition, rules, section.id); setDraft(next.definition, next.rules as Rules); }}><Copy /></Button>
        <Button size="icon" variant="ghost" aria-label="Delete section" className="text-destructive" disabled={total <= 1 || blockers.length > 0} title={blockers.length ? `Used by ${blockers.join(", ")}` : total <= 1 ? "A questionnaire needs at least one section" : undefined}
          onClick={() => { const next = deleteSectionIn(definition, rules, section.id); if (next) setDraft(next.definition, next.rules as Rules); }}><Trash2 /></Button>
      </div>
    </header>
    {!collapsed && <div className="flex flex-col gap-3 px-4 pb-5 sm:px-5 sm:pl-14">
      <Textarea aria-label="Section description" rows={1} className="min-h-9 resize-none border-transparent bg-transparent px-0 text-sm shadow-none focus-visible:border-input focus-visible:px-2.5" value={section.description ?? ""} placeholder="Add a description (optional)" onChange={(e) => updateSection({ ...section, description: e.target.value || null })} />
      {settings && <div className="flex flex-col gap-2 border-l-2 border-border/60 pl-3">
        <p className="text-sm font-medium">Section settings</p>
        <ConditionEditor label="Show this section only when" empty="Always shown" value={section.visible_when} definition={definition} onChange={(visible_when) => updateSection({ ...section, visible_when })} />
      </div>}
      {props.review?.render(section.id)}
      {blockers.length > 0 && <p className="text-xs text-muted-foreground">This section can’t be deleted while {blockers.join(", ")} depend{blockers.length === 1 ? "s" : ""} on its questions.</p>}
      <div className="flex flex-col divide-y divide-border/50">{section.questions.map((q, qi) => props.review?.visibleQuestionIds && !props.review.visibleQuestionIds.has(q.id) ? null : <QuestionCard key={q.id} review={props.review} question={q} index={qi} total={section.questions.length}
        expanded={props.expandedQuestion === q.id} onToggle={() => props.setExpandedQuestion(props.expandedQuestion === q.id ? null : q.id)}
        definition={definition} rules={rules} setRules={(next) => setDraft(definition, next)} onOpenRules={props.onOpenRules}
        onChange={(next) => setQuestion(qi, next)}
        onChangeType={(type) => { const next = changeQuestionType(q, type); const qs = [...section.questions]; qs[qi] = next; const nextDefinition = { ...definition, sections: definition.sections.map((s) => (s.id === section.id ? { ...section, questions: qs } : s)) }; setDraft(nextDefinition, retargetQuestionRequests(rules, nextDefinition, next) as Rules); }}
        onDuplicate={() => { const next = duplicateQuestionIn(definition, rules, section.id, q.id); setDraft(next.definition, next.rules as Rules); props.setExpandedQuestion(next.newId); }}
        onDelete={() => { const next = deleteQuestionIn(definition, rules, section.id, q.id); if (next) setDraft(next.definition, next.rules as Rules); }}
        onMove={(delta) => setQuestions(move(section.questions, qi, delta))} />)}</div>
      {!section.questions.length && <p className="py-3 text-sm text-muted-foreground">No questions in this section yet.</p>}
      <Button variant="outline" className="self-start" onClick={() => { const q = newQuestion(); setQuestions([...section.questions, q]); props.setExpandedQuestion(q.id); }}><Plus /> Add question</Button>
    </div>}
  </section>;
}

// ---- Document requests tab ------------------------------------------------------------

function SourceEditor({ label, value, questions, repeating, onChange }: { label: string; value?: DocumentRequirementOutput["reporting_period"]; questions: QuestionDefinition[]; repeating: boolean; onChange: (v: DocumentRequirementOutput["reporting_period"]) => void }) {
  const kind = value?.kind ?? "";
  return <label className="flex flex-col gap-1 text-xs text-muted-foreground">{label}
    <NativeSelect value={kind} onChange={(e) => { const k = e.target.value as NonNullable<typeof value>["kind"] | ""; onChange(!k ? null : k === "question" ? { kind: k, question_id: questions[0]?.id ?? "" } : k === "fixed" ? { kind: k, value: "" } : { kind: k }); }}>
      <option value="">Not set</option><option value="assignment_reporting_period">The assignment’s reporting period</option><option value="assignment_respondent">The assignment’s respondent</option><option value="question">The answer to a question</option><option value="fixed">A fixed value</option>{(repeating || kind === "repeat_entry_id") && <option value="repeat_entry_id">Each repeating entry</option>}
    </NativeSelect>
    {kind === "question" && <NativeSelect aria-label={`${label} question`} value={value?.question_id ?? ""} onChange={(e) => onChange({ kind: "question", question_id: e.target.value })}>{questions.map((q) => <option key={q.id} value={q.id}>{q.label || "Untitled question"}</option>)}</NativeSelect>}
    {kind === "fixed" && <Input aria-label={`${label} value`} value={value?.value ?? ""} onChange={(e) => onChange({ kind: "fixed", value: e.target.value })} />}
  </label>;
}

function AdvancedRuleEditor({ rule, definition, onChange }: { rule: DocumentGenerationRule; definition: QuestionnaireDefinition; onChange: (rule: DocumentGenerationRule) => void }) {
  const questions = allQuestions(definition);
  const groups = questions.filter((q) => q.type === "repeating_group");
  const setOutput = (i: number, output: DocumentRequirementOutput) => { const outputs = [...rule.outputs]; outputs[i] = output; onChange({ ...rule, outputs }); };
  return <div className="flex flex-col gap-4 rounded-lg border border-border/60 p-3">
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">Repeat for
      <NativeSelect value={rule.for_each ?? ""} onChange={(e) => onChange({ ...rule, for_each: e.target.value || null })}><option value="">The questionnaire as a whole</option>{groups.map((g) => <option key={g.id} value={g.id}>Each entry in “{g.label || "Untitled list"}”</option>)}</NativeSelect>
    </label>
    <ConditionEditor required label="Request when" value={rule.condition} definition={definition} onChange={(condition) => condition && onChange({ ...rule, condition })} />
    {rule.outputs.map((output, i) => <div key={output.requirement_key || i} className="grid gap-3 rounded-lg bg-muted/30 p-3 md:grid-cols-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">Document title<Input value={output.doc_type_needed} placeholder="e.g. Rental income statement" onChange={(e) => setOutput(i, { ...output, doc_type_needed: e.target.value })} /></label>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground md:col-span-2">Instructions for the client<Textarea rows={2} value={output.description ?? ""} onChange={(e) => setOutput(i, { ...output, description: e.target.value || null })} /></label>
      <SourceEditor label="Reporting period comes from" value={output.reporting_period} questions={questions} repeating={!!rule.for_each} onChange={(reporting_period) => setOutput(i, { ...output, reporting_period })} />
      <SourceEditor label="Respondent comes from" value={output.respondent} questions={questions} repeating={!!rule.for_each} onChange={(respondent) => setOutput(i, { ...output, respondent })} />
      <SourceEditor label="Subject comes from" value={output.subject} questions={questions} repeating={!!rule.for_each} onChange={(subject) => setOutput(i, { ...output, subject })} />
      <SourceEditor label="Separate request for each" value={output.instance_key} questions={questions} repeating={!!rule.for_each} onChange={(instance_key) => setOutput(i, { ...output, instance_key })} />
      {rule.outputs.length > 1 && <Button size="sm" variant="ghost" className="justify-self-end text-destructive md:col-span-2" onClick={() => onChange({ ...rule, outputs: rule.outputs.filter((_, x) => x !== i) })}><Trash2 /> Remove document</Button>}
    </div>)}
    <Button size="sm" variant="ghost" className="self-start" onClick={() => onChange({ ...rule, outputs: [...rule.outputs, { output_key: stableId("document"), requirement_key: stableId("requirement"), doc_type_needed: "", reporting_period: { kind: "assignment_reporting_period" }, respondent: { kind: "assignment_respondent" } }] })}><Plus /> Request another document</Button>
  </div>;
}

function Clause({ word, children }: { word: string; children: ReactNode }) {
  return <div className="grid gap-1.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start"><span className="pt-1.5 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{word}</span><div className="min-w-0">{children}</div></div>;
}

function RulesTab({ definition, rules, setRules }: { definition: QuestionnaireDefinition; rules: Rules; setRules: (rules: Rules) => void }) {
  const [advancedOpen, setAdvancedOpen] = useState<Set<string>>(new Set());
  const topLevel = definition.sections.flatMap((s) => s.questions).filter((q) => q.type !== "information" && q.type !== "repeating_group");
  const questions = allQuestions(definition);
  const toggle = (id: string) => setAdvancedOpen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <div className="flex flex-col gap-4">
    <p className="max-w-2xl text-sm text-muted-foreground">Document requests are created from answers when a client submits. Requests you add to a question appear here too — they are the same requests.</p>
    {rules.map((rule) => {
      const request = simpleRequest(rule, definition);
      const question = request ? questions.find((q) => q.id === request.questionId) : undefined;
      const isAdvanced = !request || !question || advancedOpen.has(rule.id);
      return <div key={rule.id} className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5">
        {request && question && !advancedOpen.has(rule.id) ? <div className="flex flex-col gap-3">
          <Clause word="When">
            <NativeSelect aria-label="Question" value={question.id} onChange={(e) => { const target = topLevel.find((q) => q.id === e.target.value); if (target) setRules(replaceRule(rules, retargetRequest(rule, target) as DocumentGenerationRule)); }}>
              {topLevel.map((q) => <option key={q.id} value={q.id}>{q.label || "Untitled question"}</option>)}
            </NativeSelect>
          </Clause>
          <Clause word="Answer"><TriggerInput question={question} request={request} onChange={(p) => setRules(replaceRule(rules, updateSimpleRequest(rule, p) as DocumentGenerationRule))} /></Clause>
          <Clause word="Then request"><Input value={request.title} placeholder="Document title" onChange={(e) => setRules(replaceRule(rules, updateSimpleRequest(rule, { title: e.target.value }) as DocumentGenerationRule))} /></Clause>
          <Clause word="Instructions"><Textarea rows={2} value={request.instructions} placeholder="Optional instructions for the client" onChange={(e) => setRules(replaceRule(rules, updateSimpleRequest(rule, { instructions: e.target.value }) as DocumentGenerationRule))} /></Clause>
        </div> : <div className="flex flex-col gap-1">
          <p className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">{request ? "Document request" : "Advanced rule"}</p>
          <p className="text-sm">Request <span className="font-medium">{rule.outputs.map((o) => o.doc_type_needed || "an untitled document").join(", ")}</span>{rule.for_each ? ` for each entry in “${questions.find((q) => q.id === rule.for_each)?.label || "a repeating list"}”` : ""} when {describeCondition(rule.condition, definition)}.</p>
        </div>}
        {isAdvanced && <AdvancedRuleEditor rule={rule} definition={definition} onChange={(next) => setRules(replaceRule(rules, next))} />}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {request && question ? <Button size="sm" variant="ghost" onClick={() => toggle(rule.id)}><SlidersHorizontal /> {advancedOpen.has(rule.id) ? "Hide advanced options" : "Advanced options"}</Button> : <span className="text-xs text-muted-foreground">Uses settings beyond a single answer, so all of its options are shown.</span>}
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setRules(rules.filter((r) => r.id !== rule.id))}><Trash2 /> Delete</Button>
        </div>
      </div>;
    })}
    {!rules.length && <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No document requests yet. Add one here or from any question.</p>}
    <Button variant="outline" className="self-start" disabled={!topLevel.length} onClick={() => setRules([...rules, newDocumentRequest(topLevel[0]) as DocumentGenerationRule])}><Plus /> Add document request</Button>
  </div>;
}

// ---- Preview ---------------------------------------------------------------------------

function useGeneratedDocuments(definition: QuestionnaireDefinition, rules: Rules, answers: Answers) {
  const [result, setResult] = useState<{ requirements: Record<string, unknown>[]; error: string | null }>({ requirements: [], error: null });
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const draft = previewable(definition, rules);
      previewQuestionnaire(draft.definition, { format_version: "1", rules: draft.rules as Rules }, answers)
        .then((r) => { if (!cancelled) setResult({ requirements: r.requirements, error: null }); })
        .catch(() => { if (!cancelled) setResult({ requirements: [], error: "Some settings are incomplete. Publishing will list what needs fixing." }); });
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [definition, rules, answers]);
  return result;
}

export function QuestionnairePreview({ definition, rules, title }: { definition: QuestionnaireDefinition; rules: Rules; title: string }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [sectionIndex, setSectionIndex] = useState(0);
  const context = useMemo(() => new QuestionnaireContext(definition, answers), [definition, answers]);
  const visible = context.visibleSections();
  const section = visible[Math.min(sectionIndex, Math.max(visible.length - 1, 0))];
  const errors = useMemo(() => new Map(answerIssues(context).map((issue) => [issue.key, issue.message])), [context]);
  const generated = useGeneratedDocuments(definition, rules, answers);
  return <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <Panel title={title} meta="Answers here are never saved">
      <div className="flex flex-col gap-5">
        {visible.length > 1 && <div className="flex flex-wrap gap-2">{visible.map((s, i) => <Button key={s.id} size="sm" variant={s.id === section?.id ? "default" : "outline"} onClick={() => setSectionIndex(i)}>{i + 1}. {s.title || "Untitled section"}</Button>)}</div>}
        {section ? <>
          <div><h3 className="text-2xl font-light">{section.title || "Untitled section"}</h3>{section.description && <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>}</div>
          <QuestionList questions={section.questions} chain={[]} scope={{}} container={answers} field={{ ctx: context, answers, onChange: setAnswers, errors }} />
        </> : <p className="text-sm text-muted-foreground">No section is shown for these answers.</p>}
        {Object.keys(answers).length > 0 && <Button size="sm" variant="ghost" className="self-start" onClick={() => setAnswers({})}>Clear sample answers</Button>}
      </div>
    </Panel>
    <Panel title="Documents that would be requested" meta={generated.requirements.length ? String(generated.requirements.length) : undefined}>
      {generated.error ? <p className="text-sm text-muted-foreground">Documents can’t be previewed yet. {generated.error}</p>
        : generated.requirements.length ? <ul className="flex flex-col gap-2">{generated.requirements.map((r, i) => <li key={i} className="rounded-lg bg-muted/30 p-3"><p className="text-sm font-medium">{String(r.doc_type_needed || "Untitled document")}</p>{!!r.description && <p className="mt-0.5 text-xs text-muted-foreground">{String(r.description)}</p>}</li>)}</ul>
          : <p className="text-sm text-muted-foreground">Answer the questions to see which documents the client would be asked for.</p>}
    </Panel>
  </div>;
}

// ---- Versions ------------------------------------------------------------------------------

function VersionsTab({ versions, definition, rules, onRestore }: { versions: QuestionnaireVersion[]; definition: QuestionnaireDefinition; rules: Rules; onRestore: (version: QuestionnaireVersion) => void }) {
  const ordered = useMemo(() => [...versions].sort((a, b) => b.version_number - a.version_number), [versions]);
  const [selectedId, setSelectedId] = useState<number | null>(ordered[0]?.id ?? null);
  const [view, setView] = useState<"preview" | "rules" | "changes">("preview");
  const [confirm, setConfirm] = useState(false);
  const selected = ordered.find((v) => v.id === selectedId) ?? ordered[0];
  if (!selected) return <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">No published versions yet. Publish the draft to make it assignable to clients.</p>;
  const changes = compareVersions({ definition: selected.definition, rules: selected.document_rules }, { definition, rules });
  const sameAsDraft = changes.length === 0;
  return <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
    <ul className="flex flex-col gap-1">{ordered.map((v) => <li key={v.id}><button onClick={() => setSelectedId(v.id)} className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${v.id === selected.id ? "bg-muted" : "hover:bg-muted/50"}`}>
      <span className="block text-sm font-medium">Version {v.version_number}{v.id === ordered[0].id && <span className="ml-2 text-xs font-normal text-muted-foreground">Latest</span>}</span>
      <span className="block text-xs text-muted-foreground">{new Date(v.published_at).toLocaleString()} · {countQuestions(v.definition)} questions · {v.document_rules.length} requests</span>
    </button></li>)}</ul>
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-lg font-light">Version {selected.version_number}</p><p className="text-xs text-muted-foreground">Published versions are read-only. Clients assigned to it keep this exact version.</p></div>
        <Button variant="outline" onClick={() => (sameAsDraft ? onRestore(selected) : setConfirm(true))} disabled={sameAsDraft} title={sameAsDraft ? "The draft already matches this version" : undefined}><History /> Create draft from this version</Button>
      </div>
      <div className="flex flex-wrap gap-1">{(["preview", "rules", "changes"] as const).map((v) => <Button key={v} size="sm" variant={view === v ? "secondary" : "ghost"} onClick={() => setView(v)}>{v === "preview" ? "Preview" : v === "rules" ? `Document requests (${selected.document_rules.length})` : `Compared with draft (${changes.length})`}</Button>)}</div>
      {view === "preview" && <QuestionnairePreview key={selected.id} definition={selected.definition} rules={selected.document_rules} title={`Version ${selected.version_number}`} />}
      {view === "rules" && (selected.document_rules.length ? <ul className="flex flex-col gap-2">{selected.document_rules.map((r) => <li key={r.id} className="rounded-lg bg-card p-3 text-sm ring-1 ring-foreground/10">Request <span className="font-medium">{r.outputs.map((o) => o.doc_type_needed || "an untitled document").join(", ")}</span> when {describeCondition(r.condition, selected.definition)}.{r.outputs.some((o) => o.description) && <span className="mt-1 block text-xs text-muted-foreground">{r.outputs.map((o) => o.description).filter(Boolean).join(" ")}</span>}</li>)}</ul> : <p className="text-sm text-muted-foreground">This version requests no documents.</p>)}
      {view === "changes" && (sameAsDraft ? <p className="text-sm text-muted-foreground">The current draft matches this version.</p> : <ul className="flex flex-col gap-1.5">{changes.map((c, i) => <li key={i} className="flex gap-3 text-sm"><span className="w-20 shrink-0 text-xs text-muted-foreground capitalize">{c.kind === "added" ? "In draft only" : c.kind === "removed" ? "Removed" : "Edited"}</span><span>{c.text}</span></li>)}</ul>)}
    </div>
    <Dialog open={confirm} onOpenChange={setConfirm}>
      <DialogContent>
        <DialogHeader><DialogTitle>Replace the current draft?</DialogTitle><DialogDescription>The draft has {changes.length} change{changes.length === 1 ? "" : "s"} compared with version {selected.version_number}. Replacing it discards those unpublished changes. Published versions and existing client assignments are not affected.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setConfirm(false)}>Keep current draft</Button><Button variant="destructive" onClick={() => { setConfirm(false); onRestore(selected); }}>Replace draft</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </div>;
}

// ---- Builder -----------------------------------------------------------------------------

// When a new questionnaire is first saved, the editor moves from /questionnaires/new
// to /questionnaires/{id}. The live editor state is handed across so nothing typed
// while the save was in flight is lost and the page resumes where the user was.
interface EditorState { name: string; description: string; definition: QuestionnaireDefinition; rules: Rules; tab: string; expandedQuestion: string | null }
const handoffs = new Map<number, EditorState & { template: QuestionnaireTemplate; baseline: string }>();
export function pendingHandoff(id: number): QuestionnaireTemplate | null {
  return handoffs.get(id)?.template ?? null;
}

const COLLAPSE_KEY = (id: number | string | null) => `compozor.builder.collapsed.${id ?? "new"}`;

function readCollapsed(id: number | string | null): Set<string> {
  try { return new Set(JSON.parse(window.localStorage.getItem(COLLAPSE_KEY(id)) ?? "[]") as string[]); } catch { return new Set(); }
}

export interface BuilderDraft { name: string; description: string; definition: QuestionnaireDefinition; rules: Rules }
export interface BuilderHandle {
  focusQuestion: (questionId: string) => void;
  showTab: (tab: "questions" | "rules" | "preview") => void;
  updateRules: (update: (rules: Rules) => Rules) => void;
  updateDefinition: (update: (definition: QuestionnaireDefinition) => QuestionnaireDefinition) => void;
  flush: () => Promise<boolean>;
}
/** Reuses the builder to review an AI import: persistence and header actions come from the import. */
export interface BuilderImportMode {
  key: string;
  initial: BuilderDraft;
  save: (draft: BuilderDraft) => Promise<void>;
  actions: ReactNode;
  banner: ReactNode;
  review: ReviewLayer;
  onDraftChange: (draft: BuilderDraft) => void;
}

export function QuestionnaireBuilder({ template, versions, onSaved, importMode, handle }: {
  template: QuestionnaireTemplate | null;
  versions: QuestionnaireVersion[];
  onSaved: (template: QuestionnaireTemplate, version?: QuestionnaireVersion) => void;
  importMode?: BuilderImportMode;
  handle?: Ref<BuilderHandle>;
}) {
  const router = useRouter();
  const [resume] = useState(() => (template ? handoffs.get(template.id) ?? null : null));
  useEffect(() => { if (template) handoffs.delete(template.id); }, [template]);
  const seed = importMode?.initial;
  const [name, setName] = useState(seed?.name ?? resume?.name ?? template?.name ?? "");
  const [description, setDescription] = useState(seed?.description ?? resume?.description ?? template?.description ?? "");
  const [definition, setDefinition] = useState<QuestionnaireDefinition>(() => seed?.definition ?? resume?.definition ?? template?.draft_definition ?? emptyQuestionnaire());
  const [rules, setRules] = useState<Rules>(seed?.rules ?? resume?.rules ?? template?.draft_document_rules ?? []);
  const serialized = JSON.stringify({ name, description, definition, rules });
  const [baseline, setBaseline] = useState(() => resume?.baseline ?? (template || seed ? serialized : JSON.stringify({ name: "", description: "", definition, rules: [] })));
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(resume?.tab ?? "questions");
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(resume?.expandedQuestion ?? null);
  const latest = useRef<EditorState | null>(null);
  useEffect(() => { latest.current = { name, description, definition, rules, tab, expandedQuestion }; });
  const templateId = useRef<number | null>(template?.id ?? null);
  const [savedId, setSavedId] = useState<number | null>(template?.id ?? (importMode ? 0 : null));
  const saving = useRef<Promise<QuestionnaireTemplate | null> | null>(null);
  const [saveInFlight, setSaveInFlight] = useState(false);
  const lastSaved = useRef<QuestionnaireTemplate | null>(template);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const collapseKey = useRef<number | string | null>(importMode ? importMode.key : template?.id ?? null);
  useEffect(() => { setCollapsed(readCollapsed(collapseKey.current)); }, []);
  const setSectionCollapsed = (id: string, value: boolean) => setCollapsed((prev) => {
    const next = new Set(prev); if (value) next.add(id); else next.delete(id);
    try { window.localStorage.setItem(COLLAPSE_KEY(collapseKey.current), JSON.stringify([...next])); } catch { /* preference only */ }
    return next;
  });
  const onDraftChange = importMode?.onDraftChange;
  useEffect(() => { onDraftChange?.({ name, description, definition, rules }); }, [onDraftChange, name, description, definition, rules]);

  const dirty = baseline !== serialized;
  const guard = useLeaveGuard({ blocked: !importMode && (dirty || saveInFlight), historyGuard: !importMode && !!template });
  useEffect(() => {
    if (!importMode || !dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, importMode]);

  const setDraft = useCallback((nextDefinition: QuestionnaireDefinition, nextRules?: Rules) => {
    setDefinition(nextDefinition);
    if (nextRules) setRules(nextRules);
  }, []);

  // Saves the current editor state. A new questionnaire is created on its first save.
  const save = useCallback(async ({ navigate = true }: { navigate?: boolean } = {}): Promise<QuestionnaireTemplate | null> => {
    if (saving.current) await saving.current;
    const snapshot = JSON.stringify({ name, description, definition, rules });
    const payload = { description: description || null, draft_definition: definition, draft_document_rules: { format_version: "1" as const, rules } };
    const run = (async () => {
      try {
        if (importMode) {
          await importMode.save({ name, description, definition, rules });
          setBaseline(snapshot);
          setStatus({ text: "Review progress saved" });
          return null;
        }
        let saved: QuestionnaireTemplate;
        if (templateId.current === null) {
          if (!name.trim()) { setStatus({ text: "Name the questionnaire to save it" }); return null; }
          saved = await createQuestionnaireTemplate({ name: name.trim(), ...payload });
          try { const prior = window.localStorage.getItem(COLLAPSE_KEY(null)); if (prior) window.localStorage.setItem(COLLAPSE_KEY(saved.id), prior); window.localStorage.removeItem(COLLAPSE_KEY(null)); } catch { /* preference only */ }
          templateId.current = saved.id;
          collapseKey.current = saved.id;
          setSavedId(saved.id);
          if (navigate) {
            handoffs.set(saved.id, { ...latest.current!, template: saved, baseline: snapshot });
            router.replace(`/questionnaires/${saved.id}`);
          }
        } else {
          saved = await updateQuestionnaireTemplate(templateId.current, name.trim() ? { name: name.trim(), ...payload } : payload);
        }
        lastSaved.current = saved;
        setBaseline(snapshot);
        setStatus({ text: "Draft saved" });
        onSaved(saved);
        return saved;
      } catch (e) {
        setStatus({ text: errorText(e), error: true });
        return null;
      }
    })();
    saving.current = run;
    setSaveInFlight(true);
    try { return await run; } finally { if (saving.current === run) { saving.current = null; setSaveInFlight(false); } }
  }, [name, description, definition, rules, onSaved, router, importMode]);

  // Autosave: drafts may be incomplete; a new questionnaire is persisted once it has a name.
  useEffect(() => {
    if (!dirty || busy || guard.target || (!importMode && templateId.current === null && !name.trim())) return;
    const timer = setTimeout(() => { void save(); }, 1200);
    return () => clearTimeout(timer);
  }, [dirty, busy, name, save, importMode, guard.target]);

  const publish = async () => {
    if (!name.trim()) { setStatus({ text: "Name the questionnaire before publishing", error: true }); return; }
    setBusy(true); setStatus(null);
    try {
      const creating = templateId.current === null;
      const saved = dirty || creating ? await save({ navigate: false }) : null;
      if ((dirty || creating) && !saved) return;
      const version = await publishQuestionnaireVersion(templateId.current!, { format_version: "1", rules });
      if (creating) {
        handoffs.set(saved!.id, { ...latest.current!, template: saved!, baseline: JSON.stringify({ name, description, definition, rules }) });
        router.replace(`/questionnaires/${saved!.id}`);
        return;
      }
      setStatus({ text: `Published version ${version.version_number}` });
      onSaved(saved ?? lastSaved.current!, version);
    } catch (e) {
      setStatus({ text: describeValidation(errorText(e), definition), error: true });
    } finally { setBusy(false); }
  };

  const restore = (version: QuestionnaireVersion) => {
    const draft = draftFromVersion({ definition: version.definition, document_rules: version.document_rules });
    setDefinition(draft.definition);
    setRules(draft.rules as Rules);
    setExpandedQuestion(null);
    setTab("questions");
    setStatus({ text: `Draft replaced with version ${version.version_number}` });
  };

  useImperativeHandle(handle, () => ({
    focusQuestion: (questionId: string) => {
      const section = definition.sections.find((s) => s.questions.some((q) => q.id === questionId));
      if (!section) return;
      setTab("questions");
      if (collapsed.has(section.id)) setSectionCollapsed(section.id, false);
      setExpandedQuestion(questionId);
      requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(`[data-question-id="${questionId}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })));
    },
    showTab: (next) => setTab(next),
    updateRules: (update) => setRules((prev) => update(prev)),
    updateDefinition: (update) => setDefinition((prev) => update(prev)),
    flush: async () => { if (baseline === serialized) return true; await save(); return true; },
  }));

  const latestVersion = versions.reduce<number | null>((max, v) => Math.max(max ?? 0, v.version_number), null);
  const statusText = importMode ? (status?.error ? status.text : dirty ? "Unsaved changes" : "Review progress saved")
    : status?.error ? status.text
    : savedId === null ? (name.trim() ? "Saving…" : "Not saved yet — name the questionnaire to save it")
    : dirty ? "Unsaved changes" : status?.text ?? "All changes saved";

  return <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-4">
      <input aria-label="Questionnaire name" autoFocus={!template} className="w-full min-w-0 bg-transparent text-3xl leading-tight font-light sm:text-4xl tracking-tight outline-none [font-family:var(--font-display)] placeholder:text-muted-foreground/60 md:text-5xl" value={name} placeholder="Untitled questionnaire" onChange={(e) => setName(e.target.value)} />
      <Textarea aria-label="Questionnaire description" rows={1} className="min-h-9 max-w-3xl resize-none border-transparent bg-transparent px-0 text-sm text-muted-foreground shadow-none focus-visible:border-input focus-visible:px-2.5" value={description} placeholder="Add a description for your team (optional)" onChange={(e) => setDescription(e.target.value)} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span role="status" className={`text-xs ${status?.error ? "text-destructive" : "text-muted-foreground"}`}>{statusText}{importMode ? "" : latestVersion ? ` · Latest published: version ${latestVersion}` : " · Not published"}</span>
        {importMode ? <div className="flex flex-wrap gap-2">{importMode.actions}</div> : <div className="flex gap-2">
          <Button variant="outline" onClick={() => void save()} disabled={busy || (!dirty && savedId !== null)}><Save /> Save draft</Button>
          <Button onClick={() => void publish()} disabled={busy}><Send /> Publish version</Button>
        </div>}
      </div>
    </div>
    {importMode?.banner}
    <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
      <TabsList className="max-w-full justify-start overflow-x-auto"><TabsTrigger value="questions">Questions</TabsTrigger><TabsTrigger value="rules"><span className="sm:hidden">Requests</span><span className="hidden sm:inline">Document requests</span>{rules.length ? ` (${rules.length})` : ""}</TabsTrigger><TabsTrigger value="preview">Preview</TabsTrigger>{!importMode && <TabsTrigger value="versions">History</TabsTrigger>}</TabsList>
      <TabsContent value="questions" className="flex flex-col gap-5 pt-2">
        {definition.sections.map((section, si) => importMode?.review.visibleQuestionIds && !section.questions.some((q) => importMode.review.visibleQuestionIds!.has(q.id)) && !importMode.review.severity[section.id] ? null : <SectionCard key={section.id} review={importMode?.review} section={section} index={si} total={definition.sections.length}
          collapsed={collapsed.has(section.id)} onCollapse={(value) => setSectionCollapsed(section.id, value)}
          expandedQuestion={expandedQuestion} setExpandedQuestion={setExpandedQuestion}
          definition={definition} rules={rules} setDraft={setDraft} onOpenRules={() => setTab("rules")} />)}
        <Button variant="outline" className="self-start" onClick={() => setDefinition({ ...definition, sections: [...definition.sections, newSection()] })}><Plus /> Add section</Button>
      </TabsContent>
      <TabsContent value="rules" className="pt-2"><RulesTab definition={definition} rules={rules} setRules={setRules} /></TabsContent>
      <TabsContent value="preview" className="pt-2"><QuestionnairePreview definition={definition} rules={rules} title="Client preview" /></TabsContent>
      {!importMode && <TabsContent value="versions" className="pt-2"><VersionsTab versions={versions} definition={definition} rules={rules} onRestore={restore} /></TabsContent>}
    </Tabs>
    {!importMode && <LeaveEditorDialog target={guard.target} dirty={dirty} saving={saveInFlight} isNew={savedId === null} canSave={savedId !== null || !!name.trim()}
      onSave={async () => (await save({ navigate: false })) !== null} onLeave={guard.leave} onCancel={guard.cancel} />}
  </div>;
}
