"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, Plus, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Panel } from "@/components/panel";
import { QuestionList } from "@/components/questionnaire-fields";
import {
  ApiError,
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
  type QuestionType,
} from "@/lib/questionnaire-logic";

const TYPES: { value: QuestionType; label: string }[] = [
  ["short_text", "Short text"], ["long_text", "Long text"], ["yes_no", "Yes / no"],
  ["single_choice", "Single choice"], ["multiple_choice", "Multiple choice"], ["date", "Date"],
  ["number", "Number"], ["currency", "Currency"], ["contact", "Contact"], ["address", "Address"],
  ["repeating_group", "Repeating group"], ["information", "Information"], ["confirmation", "Confirmation"],
].map(([value, label]) => ({ value: value as QuestionType, label }));

const OPERATORS = ["equals", "not_equals", "in", "not_in", "exists", "not_exists", "greater_than", "greater_than_or_equal", "less_than", "less_than_or_equal", "contains"];

function stableId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function newQuestion(type: QuestionType = "short_text"): QuestionDefinition {
  const base: QuestionDefinition = { id: stableId("q"), type, label: "Untitled question", required: false, sensitivity: "standard" };
  if (type === "single_choice" || type === "multiple_choice") base.options = [{ value: "option_1", label: "Option 1" }];
  if (type === "date") base.date_precision = "day";
  if (type === "currency") base.currency_code = "CAD";
  if (type === "repeating_group") {
    base.entry_id_key = "_id";
    base.fields = [newQuestion("short_text")];
  }
  return base;
}

export function emptyQuestionnaire(): QuestionnaireDefinition {
  return { format_version: "1", sections: [{ id: stableId("section"), title: "New section", questions: [newQuestion()] }] };
}

function allQuestions(definition: QuestionnaireDefinition): QuestionDefinition[] {
  const out: QuestionDefinition[] = [];
  const visit = (items: QuestionDefinition[]) => items.forEach((q) => { out.push(q); visit(q.fields ?? []); });
  definition.sections.forEach((s) => visit(s.questions));
  return out;
}

function references(condition: Condition | null | undefined, id: string): boolean {
  if (!condition) return false;
  return condition.question_id === id || condition.group_question_id === id ||
    (condition.conditions ?? []).some((c) => references(c, id)) || references(condition.condition, id);
}

function dependencyLabels(definition: QuestionnaireDefinition, rules: DocumentGenerationRule[], id: string) {
  const labels: string[] = [];
  for (const section of definition.sections) {
    if (references(section.visible_when, id)) labels.push(`section “${section.title}”`);
    for (const q of allQuestions({ sections: [section] })) {
      if (q.id !== id && (references(q.visible_when, id) || references(q.required_when, id))) labels.push(`question “${q.label}”`);
    }
  }
  for (const rule of rules) if (rule.for_each === id || references(rule.condition, id) || rule.outputs.some((o) =>
    [o.reporting_period, o.respondent, o.subject, o.instance_key].some((s) => s?.question_id === id))) labels.push(`rule “${rule.id}”`);
  return [...new Set(labels)];
}

function duplicateQuestion(source: QuestionDefinition): QuestionDefinition {
  const clone = structuredClone(source);
  const ids = new Map<string, string>();
  const assignIds = (question: QuestionDefinition) => {
    ids.set(question.id, stableId("q"));
    (question.fields ?? []).forEach(assignIds);
  };
  const remapCondition = (condition?: Condition | null): Condition | null | undefined => condition ? {
    ...condition,
    question_id: condition.question_id ? ids.get(condition.question_id) ?? condition.question_id : condition.question_id,
    group_question_id: condition.group_question_id ? ids.get(condition.group_question_id) ?? condition.group_question_id : condition.group_question_id,
    conditions: condition.conditions?.map((child) => remapCondition(child)!),
    condition: remapCondition(condition.condition),
  } : condition;
  const applyIds = (question: QuestionDefinition) => {
    question.id = ids.get(question.id)!;
    question.visible_when = remapCondition(question.visible_when);
    question.required_when = remapCondition(question.required_when);
    (question.fields ?? []).forEach(applyIds);
  };
  assignIds(clone);
  applyIds(clone);
  clone.label += " copy";
  return clone;
}

function move<T>(items: T[], index: number, delta: number) {
  const next = [...items]; const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// Values are stored as the JSON type the backend compares against: booleans for
// yes/no and confirmation questions, option values for choices, numbers for numbers.
function ConditionValueInput({ question, operator, value, onChange }: { question?: QuestionDefinition; operator: string; value: unknown; onChange: (value: unknown) => void }) {
  const list = operator === "in" || operator === "not_in";
  if (!list && question && (question.type === "yes_no" || question.type === "confirmation")) {
    return <NativeSelect aria-label="Value" value={value === true ? "true" : value === false ? "false" : ""} onChange={(e) => onChange(e.target.value === "" ? "" : e.target.value === "true")}><option value="">Select…</option><option value="true">Yes</option><option value="false">No</option></NativeSelect>;
  }
  if (!list && question?.options?.length) {
    return <NativeSelect aria-label="Value" value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)}><option value="">Select…</option>{question.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</NativeSelect>;
  }
  return <Input aria-label="Value" value={conditionValueToInput(value)} placeholder={list ? "Values, comma separated" : "Value"} onChange={(e) => onChange(conditionValueFromInput(question, operator, e.target.value))} />;
}

function ConditionEditor({ value, onChange, definition, label }: { value?: Condition | null; onChange: (value: Condition | null) => void; definition: QuestionnaireDefinition; label: string }) {
  const questions = allQuestions(definition);
  const groups = questions.filter((q) => q.type === "repeating_group");
  const compared = questions.find((q) => q.id === value?.question_id);
  if (!value) return <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3"><span className="text-xs text-muted-foreground">No {label.toLowerCase()} condition</span><Button size="sm" variant="outline" onClick={() => onChange({ kind: "comparison", question_id: questions[0]?.id ?? "", operator: "exists" })} disabled={!questions.length}>Add condition</Button></div>;
  const changeKind = (kind: Condition["kind"]) => {
    if (kind === "comparison") onChange({ kind, question_id: questions[0]?.id ?? "", operator: "exists" });
    else if (kind === "all" || kind === "any") onChange({ kind, conditions: [{ kind: "comparison", question_id: questions[0]?.id ?? "", operator: "exists" }] });
    else if (kind === "not") onChange({ kind, condition: { kind: "comparison", question_id: questions[0]?.id ?? "", operator: "exists" } });
    else onChange({ kind, group_question_id: groups[0]?.id ?? "", quantifier: "any", condition: { kind: "comparison", question_id: questions[0]?.id ?? "", operator: "exists" } });
  };
  return <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex min-w-36 flex-1 flex-col gap-1 text-xs text-muted-foreground">{label}<NativeSelect value={value.kind} onChange={(e) => changeKind(e.target.value as Condition["kind"])}><option value="comparison">Comparison</option><option value="all">All conditions</option><option value="any">Any condition</option><option value="not">Not</option><option value="repeat">Repeating group</option></NativeSelect></label>
      <Button size="sm" variant="ghost" onClick={() => onChange(null)}><Trash2 /> Remove</Button>
    </div>
    {value.kind === "comparison" && <div className="grid gap-2 sm:grid-cols-3">
      <NativeSelect value={value.question_id ?? ""} onChange={(e) => { const next = questions.find((q) => q.id === e.target.value); const op = value.operator ?? "exists"; onChange({ ...value, question_id: e.target.value, value: ["exists", "not_exists"].includes(op) ? undefined : conditionValueFromInput(next, op, conditionValueToInput(value.value)) }); }}>{questions.map((q) => <option key={q.id} value={q.id}>{q.label} · {q.id}</option>)}</NativeSelect>
      <NativeSelect value={value.operator ?? "exists"} onChange={(e) => { const op = e.target.value; onChange({ ...value, operator: op, value: ["exists", "not_exists"].includes(op) ? undefined : conditionValueFromInput(compared, op, conditionValueToInput(value.value)) }); }}>{OPERATORS.map((op) => <option key={op} value={op}>{op.replaceAll("_", " ")}</option>)}</NativeSelect>
      {!['exists','not_exists'].includes(value.operator ?? "") && <ConditionValueInput question={compared} operator={value.operator ?? "equals"} value={value.value} onChange={(next) => onChange({ ...value, value: next })} />}
    </div>}
    {(value.kind === "all" || value.kind === "any") && <div className="flex flex-col gap-2">{(value.conditions ?? []).map((child, i) => <ConditionEditor key={i} value={child} label={`Condition ${i + 1}`} definition={definition} onChange={(next) => { const children = [...(value.conditions ?? [])]; if (next) children[i] = next; else children.splice(i, 1); onChange(children.length ? { ...value, conditions: children } : null); }} />)}<Button size="sm" variant="outline" onClick={() => onChange({ ...value, conditions: [...(value.conditions ?? []), { kind: "comparison", question_id: questions[0]?.id ?? "", operator: "exists" }] })}><Plus /> Add condition</Button></div>}
    {value.kind === "not" && <ConditionEditor value={value.condition} label="Negated condition" definition={definition} onChange={(condition) => condition && onChange({ ...value, condition })} />}
    {value.kind === "repeat" && <><div className="grid gap-2 sm:grid-cols-2"><NativeSelect value={value.group_question_id ?? ""} onChange={(e) => onChange({ ...value, group_question_id: e.target.value })}>{groups.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}</NativeSelect><NativeSelect value={value.quantifier ?? "any"} onChange={(e) => onChange({ ...value, quantifier: e.target.value as "any" | "all" })}><option value="any">Any row matches</option><option value="all">All rows match</option></NativeSelect></div><ConditionEditor value={value.condition} label="Row condition" definition={definition} onChange={(condition) => condition && onChange({ ...value, condition })} /></>}
  </div>;
}

function QuestionEditor({ question, definition, rules, onChange, onDelete }: { question: QuestionDefinition; definition: QuestionnaireDefinition; rules: DocumentGenerationRule[]; onChange: (q: QuestionDefinition) => void; onDelete: () => void }) {
  const dependencies = dependencyLabels(definition, rules, question.id);
  const setType = (type: QuestionType) => { const next = newQuestion(type); onChange({ ...next, id: question.id, label: question.label, description: question.description, visible_when: question.visible_when, required_when: question.required_when, sensitivity: question.sensitivity }); };
  return <div className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
    <div className="grid gap-3 md:grid-cols-[1fr_13rem]">
      <label className="flex flex-col gap-1.5"><Label>Question label</Label><Input value={question.label} onChange={(e) => onChange({ ...question, label: e.target.value })} /></label>
      <label className="flex flex-col gap-1.5"><Label>Type</Label><NativeSelect value={question.type} onChange={(e) => setType(e.target.value as QuestionType)}>{TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</NativeSelect></label>
    </div>
    <label className="flex flex-col gap-1.5"><Label>Description or instructions</Label><Textarea value={question.description ?? ""} onChange={(e) => onChange({ ...question, description: e.target.value || null })} /></label>
    <div className="grid gap-3 sm:grid-cols-3"><label className="flex items-center gap-2 text-sm"><Switch checked={!!question.required} onCheckedChange={(required) => onChange({ ...question, required })} disabled={question.type === "information"} /> Required</label><label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">Sensitivity</span><NativeSelect value={question.sensitivity ?? "standard"} onChange={(e) => onChange({ ...question, sensitivity: e.target.value })}><option value="standard">Standard</option><option value="personal">Personal</option><option value="confidential">Confidential</option><option value="restricted">Restricted</option></NativeSelect></label>{question.type === "date" && <label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">Precision</span><NativeSelect value={question.date_precision ?? "day"} onChange={(e) => onChange({ ...question, date_precision: e.target.value as QuestionDefinition["date_precision"] })}><option value="day">Day</option><option value="month">Month</option><option value="year">Year</option><option value="partial">Partial</option></NativeSelect></label>}{question.type === "currency" && <label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">Currency</span><Input maxLength={3} value={question.currency_code ?? "CAD"} onChange={(e) => onChange({ ...question, currency_code: e.target.value.toUpperCase() })} /></label>}</div>
    {(question.type === "single_choice" || question.type === "multiple_choice") && <div className="flex flex-col gap-2"><Label>Choices</Label>{(question.options ?? []).map((option, i) => <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2"><Input aria-label="Choice label" value={option.label} onChange={(e) => { const options = [...(question.options ?? [])]; options[i] = { ...option, label: e.target.value }; onChange({ ...question, options }); }} /><Input aria-label="Stable choice value" value={option.value} onChange={(e) => { const options = [...(question.options ?? [])]; options[i] = { ...option, value: e.target.value.replace(/[^A-Za-z0-9_.-]/g, "_") }; onChange({ ...question, options }); }} /><Button size="icon" variant="ghost" onClick={() => onChange({ ...question, options: question.options!.filter((_, x) => x !== i) })} disabled={(question.options?.length ?? 0) <= 1}><Trash2 /></Button></div>)}<Button size="sm" variant="outline" onClick={() => onChange({ ...question, options: [...(question.options ?? []), { value: `option_${(question.options?.length ?? 0) + 1}`, label: `Option ${(question.options?.length ?? 0) + 1}` }] })}><Plus /> Add choice</Button></div>}
    {question.type === "repeating_group" && <div className="flex flex-col gap-3 rounded-lg border p-3"><div className="grid gap-2 sm:grid-cols-2"><label className="text-xs text-muted-foreground">Minimum rows<Input type="number" min={0} value={question.min_items ?? ""} onChange={(e) => onChange({ ...question, min_items: e.target.value ? Number(e.target.value) : null })} /></label><label className="text-xs text-muted-foreground">Maximum rows<Input type="number" min={1} value={question.max_items ?? ""} onChange={(e) => onChange({ ...question, max_items: e.target.value ? Number(e.target.value) : null })} /></label></div><Label>Fields in each row</Label>{(question.fields ?? []).map((field, i) => <QuestionEditor key={field.id} question={field} definition={definition} rules={rules} onChange={(next) => { const fields = [...(question.fields ?? [])]; fields[i] = next; onChange({ ...question, fields }); }} onDelete={() => { if ((question.fields?.length ?? 0) > 1) onChange({ ...question, fields: question.fields!.filter((_, x) => x !== i) }); }} />)}<Button size="sm" variant="outline" onClick={() => onChange({ ...question, fields: [...(question.fields ?? []), newQuestion()] })}><Plus /> Add row field</Button></div>}
    <ConditionEditor label="Visibility" value={question.visible_when} definition={definition} onChange={(visible_when) => onChange({ ...question, visible_when })} />
    <ConditionEditor label="Conditional requiredness" value={question.required_when} definition={definition} onChange={(required_when) => onChange({ ...question, required_when })} />
    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono text-[11px] text-muted-foreground">{question.id}</span><Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete} disabled={dependencies.length > 0} title={dependencies.length ? `Used by ${dependencies.join(", ")}` : undefined}><Trash2 /> {dependencies.length ? `Used by ${dependencies.length} item${dependencies.length === 1 ? "" : "s"}` : "Delete question"}</Button></div>
  </div>;
}

function RuleBuilder({ definition, rules, onChange }: { definition: QuestionnaireDefinition; rules: DocumentGenerationRule[]; onChange: (rules: DocumentGenerationRule[]) => void }) {
  const questions = allQuestions(definition); const groups = questions.filter((q) => q.type === "repeating_group");
  const addRule = () => onChange([...rules, { id: stableId("rule"), condition: { kind: "comparison", question_id: questions[0]?.id ?? "", operator: "exists" }, outputs: [{ output_key: "document", requirement_key: stableId("requirement"), doc_type_needed: "Requested document", reporting_period: { kind: "assignment_reporting_period" }, respondent: { kind: "assignment_respondent" } }] }]);
  const update = (i: number, rule: DocumentGenerationRule) => { const next = [...rules]; next[i] = rule; onChange(next); };
  return <div className="flex flex-col gap-4">{rules.map((rule, i) => <div key={rule.id} className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10"><div className="flex flex-wrap items-end gap-3"><label className="flex min-w-48 flex-1 flex-col gap-1"><Label>Stable rule ID</Label><Input value={rule.id} onChange={(e) => update(i, { ...rule, id: e.target.value.replace(/[^A-Za-z0-9_.-]/g, "_") })} /></label><label className="flex min-w-48 flex-1 flex-col gap-1"><Label>For each repeating row</Label><NativeSelect value={rule.for_each ?? ""} onChange={(e) => update(i, { ...rule, for_each: e.target.value || null })}><option value="">Run once</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.label}</option>)}</NativeSelect></label><Button size="sm" variant="ghost" className="text-destructive" onClick={() => onChange(rules.filter((_, x) => x !== i))}><Trash2 /> Delete</Button></div><ConditionEditor label="Trigger" value={rule.condition} definition={definition} onChange={(condition) => condition && update(i, { ...rule, condition })} /><Label>Generated requirements</Label>{rule.outputs.map((output, x) => <OutputEditor key={x} output={output} questions={questions} repeating={!!rule.for_each} onChange={(next) => { const outputs = [...rule.outputs]; outputs[x] = next; update(i, { ...rule, outputs }); }} onDelete={() => rule.outputs.length > 1 && update(i, { ...rule, outputs: rule.outputs.filter((_, y) => y !== x) })} />)}<Button size="sm" variant="outline" onClick={() => update(i, { ...rule, outputs: [...rule.outputs, { output_key: `document_${rule.outputs.length + 1}`, requirement_key: stableId("requirement"), doc_type_needed: "Requested document" }] })}><Plus /> Add requirement</Button></div>)}<Button variant="outline" onClick={addRule} disabled={!questions.length}><Plus /> Add document rule</Button>{rules.length === 0 && <p className="text-sm text-muted-foreground">No answers currently generate document requirements.</p>}</div>;
}

function OutputEditor({ output, questions, repeating, onChange, onDelete }: { output: DocumentRequirementOutput; questions: QuestionDefinition[]; repeating: boolean; onChange: (o: DocumentRequirementOutput) => void; onDelete: () => void }) {
  return <div className="grid gap-3 rounded-lg border p-3 md:grid-cols-2"><label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">Document title</span><Input value={output.doc_type_needed} onChange={(e) => onChange({ ...output, doc_type_needed: e.target.value })} /></label><label className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">Stable requirement key</span><Input value={output.requirement_key} onChange={(e) => onChange({ ...output, requirement_key: e.target.value.replace(/[^A-Za-z0-9_.-]/g, "_") })} /></label><label className="flex flex-col gap-1 md:col-span-2"><span className="text-xs text-muted-foreground">Instructions</span><Textarea value={output.description ?? ""} onChange={(e) => onChange({ ...output, description: e.target.value || null })} /></label><SourceEditor label="Reporting period" value={output.reporting_period} questions={questions} repeating={repeating} onChange={(reporting_period) => onChange({ ...output, reporting_period })} /><SourceEditor label="Respondent" value={output.respondent} questions={questions} repeating={repeating} onChange={(respondent) => onChange({ ...output, respondent })} /><SourceEditor label="Subject" value={output.subject} questions={questions} repeating={repeating} onChange={(subject) => onChange({ ...output, subject })} /><SourceEditor label="Instance identity" value={output.instance_key} questions={questions} repeating={repeating} onChange={(instance_key) => onChange({ ...output, instance_key })} /><div className="md:col-span-2 flex justify-end"><Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}><Trash2 /> Remove output</Button></div></div>;
}

function SourceEditor({ label, value, questions, repeating, onChange }: { label: string; value?: DocumentRequirementOutput["reporting_period"]; questions: QuestionDefinition[]; repeating: boolean; onChange: (v: DocumentRequirementOutput["reporting_period"]) => void }) {
  const kind = value?.kind ?? "assignment_reporting_period";
  return <div className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">{label}</span><NativeSelect value={kind} onChange={(e) => { const k = e.target.value as NonNullable<typeof value>["kind"]; onChange(k === "question" ? { kind: k, question_id: questions[0]?.id ?? "" } : k === "fixed" ? { kind: k, value: "" } : { kind: k }); }}><option value="assignment_reporting_period">Assignment period</option><option value="assignment_respondent">Assignment respondent</option><option value="question">Answer to question</option><option value="fixed">Fixed value</option>{repeating && <option value="repeat_entry_id">Repeating row identity</option>}</NativeSelect>{kind === "question" && <NativeSelect value={value?.question_id ?? ""} onChange={(e) => onChange({ kind: "question", question_id: e.target.value })}>{questions.map((q) => <option key={q.id} value={q.id}>{q.label}</option>)}</NativeSelect>}{kind === "fixed" && <Input value={value?.value ?? ""} onChange={(e) => onChange({ kind: "fixed", value: e.target.value })} />}</div>;
}

export function QuestionnaireBuilder({ template, versions, onSaved }: { template: QuestionnaireTemplate; versions: QuestionnaireVersion[]; onSaved: (template: QuestionnaireTemplate, version?: QuestionnaireVersion) => void }) {
  const [name, setName] = useState(template.name); const [description, setDescription] = useState(template.description ?? "");
  const [definition, setDefinition] = useState<QuestionnaireDefinition>(template.draft_definition);
  const [rules, setRules] = useState<DocumentGenerationRule[]>(template.draft_document_rules ?? []);
  const [baseline, setBaseline] = useState(() => JSON.stringify({ name: template.name, description: template.description ?? "", definition: template.draft_definition, rules: template.draft_document_rules ?? [] })); const [status, setStatus] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Answers>({}); const [sectionIndex, setSectionIndex] = useState(0); const [requirements, setRequirements] = useState<Record<string, unknown>[]>([]);
  const serialized = JSON.stringify({ name, description, definition, rules });
  const dirty = !!baseline && baseline !== serialized;
  useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => e.preventDefault(); window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  const save = async () => { setBusy(true); setStatus(null); try { const saved = await updateQuestionnaireTemplate(template.id, { name, description: description || null, draft_definition: definition, draft_document_rules: { format_version: "1", rules } }); setBaseline(serialized); setStatus("Draft saved"); onSaved(saved); return saved; } catch (e) { setStatus(e instanceof ApiError ? e.message : String(e)); return null; } finally { setBusy(false); } };
  const publish = async () => { setBusy(true); setStatus(null); try { if (dirty && !(await save())) return; const version = await publishQuestionnaireVersion(template.id, { format_version: "1", rules }); setStatus(`Published version ${version.version_number}`); onSaved({ ...template, name, description: description || null, draft_definition: definition, draft_document_rules: rules }, version); } catch (e) { setStatus(e instanceof ApiError ? e.message : String(e)); } finally { setBusy(false); } };
  const testRules = async () => { try { const result = await previewQuestionnaire(definition, { format_version: "1", rules }, answers); setRequirements(result.requirements); setStatus("Preview evaluated without changing client data"); } catch (e) { setRequirements([]); setStatus(e instanceof ApiError ? e.message : String(e)); } };
  const context = useMemo(() => new QuestionnaireContext(definition, answers), [definition, answers]); const visible = context.visibleSections(); const previewSection = visible[Math.min(sectionIndex, Math.max(visible.length - 1, 0))];
  const previewErrors = useMemo(() => new Map(answerIssues(context).map((issue) => [issue.key, issue.message])), [context]);
  return <div className="flex flex-col gap-6">
    <div className="flex flex-col gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10"><div className="grid gap-3 md:grid-cols-[1fr_1.5fr]"><label className="flex flex-col gap-1.5"><Label>Questionnaire title</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></label><label className="flex flex-col gap-1.5"><Label>Description</Label><Input value={description} onChange={(e) => setDescription(e.target.value)} /></label></div><div className="flex flex-wrap items-center justify-between gap-2"><span role="status" className="text-xs text-muted-foreground">{status ?? (dirty ? "Unsaved changes" : "Draft saved")}{versions.length ? ` · Latest published v${versions.at(-1)!.version_number}` : " · Not published"}</span><div className="flex gap-2"><Button variant="outline" onClick={save} disabled={busy || !dirty}><Save /> Save draft</Button><Button onClick={publish} disabled={busy}><Send /> Publish version</Button></div></div></div>
    <Tabs defaultValue="questions"><TabsList><TabsTrigger value="questions">Questions</TabsTrigger><TabsTrigger value="rules">Document rules</TabsTrigger><TabsTrigger value="preview">Live preview</TabsTrigger><TabsTrigger value="versions">Versions</TabsTrigger></TabsList>
      <TabsContent value="questions" className="flex flex-col gap-5">{definition.sections.map((section, si) => <Panel key={section.id} title={section.title} meta={<span className="font-mono text-[11px]">{section.id}</span>} action={<><Button size="icon" variant="ghost" onClick={() => setDefinition({ ...definition, sections: move(definition.sections, si, -1) })} disabled={!si}><ArrowUp /></Button><Button size="icon" variant="ghost" onClick={() => setDefinition({ ...definition, sections: move(definition.sections, si, 1) })} disabled={si === definition.sections.length - 1}><ArrowDown /></Button><Button size="icon" variant="ghost" onClick={() => definition.sections.length > 1 && setDefinition({ ...definition, sections: definition.sections.filter((_, i) => i !== si) })} disabled={definition.sections.length <= 1}><Trash2 /></Button></>}><div className="flex flex-col gap-4"><div className="grid gap-3 md:grid-cols-2"><Input aria-label="Section title" value={section.title} onChange={(e) => { const sections = [...definition.sections]; sections[si] = { ...section, title: e.target.value }; setDefinition({ ...definition, sections }); }} /><Input aria-label="Section description" value={section.description ?? ""} placeholder="Section description" onChange={(e) => { const sections = [...definition.sections]; sections[si] = { ...section, description: e.target.value || null }; setDefinition({ ...definition, sections }); }} /></div><ConditionEditor label="Section visibility" value={section.visible_when} definition={definition} onChange={(visible_when) => { const sections = [...definition.sections]; sections[si] = { ...section, visible_when }; setDefinition({ ...definition, sections }); }} />{section.questions.map((q, qi) => <div key={q.id} className="flex flex-col gap-2"><div className="flex justify-end gap-1"><Button size="icon" variant="ghost" onClick={() => { const sections = [...definition.sections]; sections[si] = { ...section, questions: move(section.questions, qi, -1) }; setDefinition({ ...definition, sections }); }} disabled={!qi}><ArrowUp /></Button><Button size="icon" variant="ghost" onClick={() => { const sections = [...definition.sections]; sections[si] = { ...section, questions: move(section.questions, qi, 1) }; setDefinition({ ...definition, sections }); }} disabled={qi === section.questions.length - 1}><ArrowDown /></Button><Button size="sm" variant="ghost" onClick={() => { const copy = duplicateQuestion(q); const questions = [...section.questions]; questions.splice(qi + 1, 0, copy); const sections = [...definition.sections]; sections[si] = { ...section, questions }; setDefinition({ ...definition, sections }); }}><Copy /> Duplicate</Button></div><QuestionEditor question={q} definition={definition} rules={rules} onChange={(next) => { const questions = [...section.questions]; questions[qi] = next; const sections = [...definition.sections]; sections[si] = { ...section, questions }; setDefinition({ ...definition, sections }); }} onDelete={() => { if (section.questions.length <= 1 || dependencyLabels(definition, rules, q.id).length) return; const sections = [...definition.sections]; sections[si] = { ...section, questions: section.questions.filter((_, i) => i !== qi) }; setDefinition({ ...definition, sections }); }} /></div>)}<Button variant="outline" onClick={() => { const sections = [...definition.sections]; sections[si] = { ...section, questions: [...section.questions, newQuestion()] }; setDefinition({ ...definition, sections }); }}><Plus /> Add question</Button></div></Panel>)}<Button variant="outline" onClick={() => setDefinition({ ...definition, sections: [...definition.sections, { id: stableId("section"), title: "New section", questions: [newQuestion()] }] })}><Plus /> Add section</Button></TabsContent>
      <TabsContent value="rules"><RuleBuilder definition={definition} rules={rules} onChange={setRules} /></TabsContent>
      <TabsContent value="preview" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"><Panel title="Client preview" meta="No data is saved"><div className="flex flex-col gap-5"><div className="flex flex-wrap gap-2">{visible.map((s, i) => <Button key={s.id} size="sm" variant={i === sectionIndex ? "default" : "outline"} onClick={() => setSectionIndex(i)}>{i + 1}. {s.title}</Button>)}</div>{previewSection ? <><div><h3 className="text-2xl font-light">{previewSection.title}</h3>{previewSection.description && <p className="mt-1 text-sm text-muted-foreground">{previewSection.description}</p>}</div><QuestionList questions={previewSection.questions} chain={[]} scope={{}} container={answers} field={{ ctx: context, answers, onChange: setAnswers, errors: previewErrors }} /></> : <p className="text-sm text-muted-foreground">No section is visible for these sample answers.</p>}</div></Panel><Panel title="Generated documents" action={<Button size="sm" onClick={testRules}><Eye /> Evaluate</Button>}>{requirements.length ? <ul className="flex flex-col gap-2">{requirements.map((r, i) => <li key={i} className="rounded-lg border p-3"><p className="text-sm font-medium">{String(r.doc_type_needed)}</p><p className="text-xs text-muted-foreground">{String(r.description ?? "No instructions")}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">Enter sample answers, then evaluate the deterministic rules.</p>}</Panel></TabsContent>
      <TabsContent value="versions"><VersionHistory versions={versions} /></TabsContent>
    </Tabs>
  </div>;
}

function VersionHistory({ versions }: { versions: QuestionnaireVersion[] }) {
  if (!versions.length) return <p className="text-sm text-muted-foreground">No published versions yet.</p>;
  return <div className="flex flex-col gap-3">{versions.map((version, index) => {
    const previous = versions[index - 1];
    const questions = allQuestions(version.definition).length;
    const priorQuestions = previous ? allQuestions(previous.definition).length : 0;
    const questionDelta = questions - priorQuestions;
    const ruleDelta = version.document_rules.length - (previous?.document_rules.length ?? 0);
    return <div key={version.id} className="rounded-lg border bg-card p-4"><p className="font-medium">Version {version.version_number}</p><p className="text-xs text-muted-foreground">Published {new Date(version.published_at).toLocaleString()} · {questions} question{questions === 1 ? "" : "s"} · {version.document_rules.length} rule{version.document_rules.length === 1 ? "" : "s"}</p>{previous && <p className="mt-2 text-xs text-muted-foreground">Compared with v{previous.version_number}: {questionDelta >= 0 ? "+" : ""}{questionDelta} questions · {ruleDelta >= 0 ? "+" : ""}{ruleDelta} rules. Published snapshots remain immutable.</p>}</div>;
  })}</div>;
}
