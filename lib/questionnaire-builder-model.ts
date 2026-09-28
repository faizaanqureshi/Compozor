// Pure editing operations for the staff questionnaire builder.
//
// The builder edits exactly the backend schema: a QuestionnaireDefinition and
// one array of DocumentGenerationRule objects. Question-level "document
// requests" are a view over that same rules array (rules whose trigger is a
// simple comparison on one question), so the per-question editor and the
// Document rules tab can never drift apart. Nothing here invents schema; rules
// that don't fit the simple shape are left untouched and shown as advanced.

import type {
  Condition,
  QuestionDefinition,
  QuestionType,
  QuestionnaireDefinition,
  QuestionnaireSection,
} from "./questionnaire-logic";

export type ValueSource = {
  kind: "assignment_reporting_period" | "assignment_respondent" | "question" | "fixed" | "repeat_entry_id";
  question_id?: string | null;
  value?: string | null;
};
export type RuleOutput = {
  output_key: string;
  requirement_key: string;
  doc_type_needed: string;
  description?: string | null;
  reporting_period?: ValueSource | null;
  respondent?: ValueSource | null;
  subject?: ValueSource | null;
  instance_key?: ValueSource | null;
};
export type Rule = { id: string; for_each?: string | null; condition: Condition; outputs: RuleOutput[] };

export const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "short_text", label: "Short answer" },
  { value: "long_text", label: "Paragraph" },
  { value: "yes_no", label: "Yes / No" },
  { value: "single_choice", label: "Single choice" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
  { value: "currency", label: "Amount" },
  { value: "contact", label: "Contact details" },
  { value: "address", label: "Address" },
  { value: "repeating_group", label: "Repeating list" },
  { value: "information", label: "Information text" },
  { value: "confirmation", label: "Confirmation checkbox" },
];

export function typeLabel(type: QuestionType): string {
  return QUESTION_TYPES.find((t) => t.value === type)?.label ?? type;
}

export function stableId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${random.replaceAll("-", "").slice(0, 12)}`;
}

// ---- Construction -------------------------------------------------------------

/** Editable fields start empty; the UI shows placeholders, never fallback values. */
export function newQuestion(type: QuestionType = "short_text"): QuestionDefinition {
  const base: QuestionDefinition = { id: stableId("q"), type, label: "", required: false, sensitivity: "standard" };
  if (type === "single_choice" || type === "multiple_choice") {
    base.options = [{ value: stableId("option"), label: "" }, { value: stableId("option"), label: "" }];
  }
  if (type === "date") base.date_precision = "day";
  if (type === "currency") base.currency_code = "CAD";
  if (type === "repeating_group") {
    base.entry_id_key = "_id";
    base.fields = [newQuestion("short_text")];
  }
  if (type === "information") base.required = false;
  return base;
}

export function newSection(): QuestionnaireSection {
  return { id: stableId("section"), title: "", questions: [] };
}

export function emptyQuestionnaire(): QuestionnaireDefinition {
  return { format_version: "1", sections: [newSection()] };
}

/** Change a question's type, keeping its identity, wording and advanced settings. */
export function changeQuestionType(question: QuestionDefinition, type: QuestionType): QuestionDefinition {
  if (question.type === type) return question;
  const fresh = newQuestion(type);
  const keepOptions = (type === "single_choice" || type === "multiple_choice") && question.options?.length;
  return {
    ...fresh,
    id: question.id,
    label: question.label,
    description: question.description,
    visible_when: question.visible_when,
    required_when: type === "information" ? null : question.required_when,
    sensitivity: question.sensitivity,
    required: type === "information" ? false : question.required,
    options: keepOptions ? question.options : fresh.options,
  };
}

// ---- Traversal and dependencies ----------------------------------------------------

export function allQuestions(definition: QuestionnaireDefinition): QuestionDefinition[] {
  const out: QuestionDefinition[] = [];
  const visit = (items: QuestionDefinition[]) => items.forEach((q) => { out.push(q); visit(q.fields ?? []); });
  definition.sections.forEach((s) => visit(s.questions));
  return out;
}

/** Top-level questions only; nested repeating fields are excluded. */
export function topLevelQuestionIds(definition: QuestionnaireDefinition): Set<string> {
  return new Set(definition.sections.flatMap((s) => s.questions.map((q) => q.id)));
}

export function references(condition: Condition | null | undefined, id: string): boolean {
  if (!condition) return false;
  return condition.question_id === id || condition.group_question_id === id ||
    (condition.conditions ?? []).some((c) => references(c, id)) || references(condition.condition, id);
}

function ruleReferences(rule: Rule, id: string): boolean {
  return rule.for_each === id || references(rule.condition, id) || rule.outputs.some((o) =>
    [o.reporting_period, o.respondent, o.subject, o.instance_key].some((s) => s?.question_id === id));
}

/**
 * Plain-language descriptions of everything that depends on these question IDs,
 * ignoring references that come from inside `exclude` (the thing being deleted).
 */
export function dependents(
  definition: QuestionnaireDefinition,
  rules: Rule[],
  ids: Set<string>,
  exclude: Set<string> = ids
): string[] {
  const found: string[] = [];
  const refs = (c: Condition | null | undefined) => [...ids].some((id) => references(c, id));
  for (const section of definition.sections) {
    if (refs(section.visible_when)) found.push(`section “${section.title || "Untitled section"}”`);
    for (const q of allQuestions({ sections: [section] })) {
      if (!exclude.has(q.id) && (refs(q.visible_when) || refs(q.required_when))) found.push(`question “${q.label || "Untitled question"}”`);
    }
  }
  for (const rule of rules) {
    // A question's own simple requests are removed with it, so they never block.
    const owned = simpleRequest(rule, definition);
    if (owned && exclude.has(owned.questionId)) continue;
    if ([...ids].some((id) => ruleReferences(rule, id))) {
      found.push(`document request “${rule.outputs.map((o) => o.doc_type_needed).filter(Boolean).join(", ") || "untitled"}”`);
    }
  }
  return [...new Set(found)];
}

function idsWithin(questions: QuestionDefinition[]): Set<string> {
  return new Set(allQuestions({ sections: [{ id: "_", title: "", questions }] }).map((q) => q.id));
}

export function questionDependents(definition: QuestionnaireDefinition, rules: Rule[], question: QuestionDefinition): string[] {
  return dependents(definition, rules, idsWithin([question]));
}

export function sectionDependents(definition: QuestionnaireDefinition, rules: Rule[], section: QuestionnaireSection): string[] {
  const ids = idsWithin(section.questions);
  // References from the section's own questions don't block deleting the whole section.
  const others = { ...definition, sections: definition.sections.filter((s) => s.id !== section.id) };
  const unowned = rules.filter((rule) => { const r = simpleRequest(rule, definition); return !(r && ids.has(r.questionId)); });
  return dependents(others, unowned, ids, ids);
}

function withoutOwnedRequests(rules: Rule[], definition: QuestionnaireDefinition, ids: Set<string>): Rule[] {
  return rules.filter((rule) => { const r = simpleRequest(rule, definition); return !(r && ids.has(r.questionId)); });
}

/** Deletes a question and its own simple document requests. Returns null when something else depends on it. */
export function deleteQuestionIn(
  definition: QuestionnaireDefinition, rules: Rule[], sectionId: string, questionId: string
): { definition: QuestionnaireDefinition; rules: Rule[] } | null {
  const section = definition.sections.find((s) => s.id === sectionId);
  const question = section?.questions.find((q) => q.id === questionId);
  if (!section || !question || questionDependents(definition, rules, question).length) return null;
  const next = { ...definition, sections: definition.sections.map((s) => (s.id === sectionId ? { ...s, questions: s.questions.filter((q) => q.id !== questionId) } : s)) };
  return { definition: next, rules: withoutOwnedRequests(rules, definition, idsWithin([question])) };
}

/** Deletes a section and the simple requests of its questions. Returns null when blocked. */
export function deleteSectionIn(
  definition: QuestionnaireDefinition, rules: Rule[], sectionId: string
): { definition: QuestionnaireDefinition; rules: Rule[] } | null {
  const section = definition.sections.find((s) => s.id === sectionId);
  if (!section || definition.sections.length <= 1 || sectionDependents(definition, rules, section).length) return null;
  return {
    definition: { ...definition, sections: definition.sections.filter((s) => s.id !== sectionId) },
    rules: withoutOwnedRequests(rules, definition, idsWithin(section.questions)),
  };
}

// ---- Duplication with fresh identities -------------------------------------------

function remapCondition(condition: Condition | null | undefined, ids: Map<string, string>): Condition | null | undefined {
  if (!condition) return condition;
  return {
    ...condition,
    question_id: condition.question_id ? ids.get(condition.question_id) ?? condition.question_id : condition.question_id,
    group_question_id: condition.group_question_id ? ids.get(condition.group_question_id) ?? condition.group_question_id : condition.group_question_id,
    conditions: condition.conditions?.map((child) => remapCondition(child, ids)!),
    condition: remapCondition(condition.condition, ids),
  };
}

function cloneQuestions(questions: QuestionDefinition[], ids: Map<string, string>): QuestionDefinition[] {
  const clones = structuredClone(questions);
  const assign = (q: QuestionDefinition) => { ids.set(q.id, stableId("q")); (q.fields ?? []).forEach(assign); };
  clones.forEach(assign);
  const apply = (q: QuestionDefinition) => {
    q.id = ids.get(q.id)!;
    q.visible_when = remapCondition(q.visible_when, ids);
    q.required_when = remapCondition(q.required_when, ids);
    (q.fields ?? []).forEach(apply);
  };
  clones.forEach(apply);
  return clones;
}

/** Copies document requests that only reference duplicated questions, with new identities. */
function cloneRules(rules: Rule[], ids: Map<string, string>): Rule[] {
  const remapSource = (s: ValueSource | null | undefined) =>
    s && s.question_id ? { ...s, question_id: ids.get(s.question_id) ?? s.question_id } : s;
  const only = rules.filter((rule) => [...ids.keys()].some((id) => ruleReferences(rule, id)) &&
    collectRefs(rule).every((id) => ids.has(id)));
  return only.map((rule) => ({
    ...structuredClone(rule),
    id: stableId("rule"),
    for_each: rule.for_each ? ids.get(rule.for_each) ?? rule.for_each : rule.for_each,
    condition: remapCondition(rule.condition, ids)!,
    outputs: rule.outputs.map((o) => ({
      ...structuredClone(o),
      requirement_key: stableId("requirement"),
      reporting_period: remapSource(o.reporting_period),
      respondent: remapSource(o.respondent),
      subject: remapSource(o.subject),
      instance_key: remapSource(o.instance_key),
    })),
  }));
}

function collectRefs(rule: Rule): string[] {
  const out: string[] = [];
  const walk = (c: Condition | null | undefined) => {
    if (!c) return;
    if (c.question_id) out.push(c.question_id);
    if (c.group_question_id) out.push(c.group_question_id);
    (c.conditions ?? []).forEach(walk);
    walk(c.condition);
  };
  walk(rule.condition);
  if (rule.for_each) out.push(rule.for_each);
  rule.outputs.forEach((o) => [o.reporting_period, o.respondent, o.subject, o.instance_key].forEach((s) => s?.question_id && out.push(s.question_id)));
  return out;
}

export function duplicateQuestionIn(
  definition: QuestionnaireDefinition, rules: Rule[], sectionId: string, questionId: string
): { definition: QuestionnaireDefinition; rules: Rule[]; newId: string | null } {
  let newId: string | null = null;
  let newRules: Rule[] = [];
  const sections = definition.sections.map((section) => {
    if (section.id !== sectionId) return section;
    const index = section.questions.findIndex((q) => q.id === questionId);
    if (index < 0) return section;
    const ids = new Map<string, string>();
    const [copy] = cloneQuestions([section.questions[index]], ids);
    newId = copy.id;
    newRules = cloneRules(rules, ids);
    const questions = [...section.questions];
    questions.splice(index + 1, 0, copy);
    return { ...section, questions };
  });
  return { definition: { ...definition, sections }, rules: [...rules, ...newRules], newId };
}

export function duplicateSectionIn(
  definition: QuestionnaireDefinition, rules: Rule[], sectionId: string
): { definition: QuestionnaireDefinition; rules: Rule[] } {
  const index = definition.sections.findIndex((s) => s.id === sectionId);
  if (index < 0) return { definition, rules };
  const source = definition.sections[index];
  const ids = new Map<string, string>();
  const copy: QuestionnaireSection = {
    ...structuredClone(source),
    id: stableId("section"),
    title: source.title ? `${source.title} (copy)` : "",
    questions: cloneQuestions(source.questions, ids),
  };
  copy.visible_when = remapCondition(source.visible_when, ids);
  const sections = [...definition.sections];
  sections.splice(index + 1, 0, copy);
  return { definition: { ...definition, sections }, rules: [...rules, ...cloneRules(rules, ids)] };
}

export function move<T>(items: T[], index: number, delta: number): T[] {
  const next = [...items];
  const target = index + delta;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// ---- Question-level document requests (a view over the shared rules) -------------

const DEFAULT_SOURCES = new Set(["assignment_reporting_period", "assignment_respondent"]);

export interface SimpleRequest {
  rule: Rule;
  questionId: string;
  operator: "equals" | "contains" | "exists";
  value: unknown;
  title: string;
  instructions: string;
}

/**
 * A rule is "simple" when the plain editor can show and edit everything it
 * contains: one comparison on a top-level question, one requested document and
 * default period/respondent mappings. Anything else stays an advanced rule.
 */
export function simpleRequest(rule: Rule, definition: QuestionnaireDefinition): SimpleRequest | null {
  const c = rule.condition;
  if (rule.for_each || rule.outputs.length !== 1 || !c || c.kind !== "comparison") return null;
  if (!c.question_id || !topLevelQuestionIds(definition).has(c.question_id)) return null;
  if (c.operator !== "equals" && c.operator !== "contains" && c.operator !== "exists") return null;
  const output = rule.outputs[0];
  const defaultSource = (s: ValueSource | null | undefined, kind: string) => !s || (s.kind === kind && DEFAULT_SOURCES.has(s.kind));
  if (!defaultSource(output.reporting_period, "assignment_reporting_period") || !defaultSource(output.respondent, "assignment_respondent")) return null;
  if (output.subject || output.instance_key) return null;
  return {
    rule, questionId: c.question_id, operator: c.operator, value: c.value,
    title: output.doc_type_needed, instructions: output.description ?? "",
  };
}

export function requestsForQuestion(rules: Rule[], definition: QuestionnaireDefinition, questionId: string) {
  const simple: SimpleRequest[] = [];
  let advanced = 0;
  for (const rule of rules) {
    if (!ruleReferences(rule, questionId)) continue;
    const request = simpleRequest(rule, definition);
    if (request && request.questionId === questionId) simple.push(request);
    else advanced += 1;
  }
  return { simple, advanced };
}

/** The trigger a new request starts with, chosen from the question type. */
export function defaultTrigger(question: QuestionDefinition): { operator: "equals" | "contains" | "exists"; value: unknown } {
  if (question.type === "yes_no" || question.type === "confirmation") return { operator: "equals", value: true };
  if (question.type === "single_choice") return { operator: "equals", value: question.options?.[0]?.value ?? "" };
  if (question.type === "multiple_choice") return { operator: "contains", value: question.options?.[0]?.value ?? "" };
  return { operator: "exists", value: undefined };
}

export function newDocumentRequest(question: QuestionDefinition, title = ""): Rule {
  const trigger = defaultTrigger(question);
  const condition: Condition = { kind: "comparison", question_id: question.id, operator: trigger.operator };
  if (trigger.operator !== "exists") condition.value = trigger.value;
  return {
    id: stableId("rule"),
    condition,
    outputs: [{
      output_key: "document",
      requirement_key: stableId("requirement"),
      doc_type_needed: title,
      reporting_period: { kind: "assignment_reporting_period" },
      respondent: { kind: "assignment_respondent" },
    }],
  };
}

/** Edits only the fields the simple editor owns; every other property is preserved. */
export function updateSimpleRequest(
  rule: Rule,
  patch: { value?: unknown; operator?: "equals" | "contains" | "exists"; title?: string; instructions?: string; questionId?: string }
): Rule {
  const condition: Condition = { ...rule.condition };
  if (patch.questionId !== undefined) condition.question_id = patch.questionId;
  if (patch.operator !== undefined) condition.operator = patch.operator;
  if ("value" in patch) condition.value = patch.value;
  if (condition.operator === "exists") delete condition.value;
  const [output, ...rest] = rule.outputs;
  const nextOutput: RuleOutput = { ...output };
  if (patch.title !== undefined) nextOutput.doc_type_needed = patch.title;
  if (patch.instructions !== undefined) nextOutput.description = patch.instructions || null;
  return { ...rule, condition, outputs: [nextOutput, ...rest] };
}

export function replaceRule(rules: Rule[], next: Rule): Rule[] {
  return rules.map((rule) => (rule.id === next.id ? next : rule));
}

/** Re-points a request at another question with that question's default trigger. */
export function retargetRequest(rule: Rule, question: QuestionDefinition): Rule {
  const trigger = defaultTrigger(question);
  return updateSimpleRequest(rule, { questionId: question.id, operator: trigger.operator, value: trigger.value });
}

/** Human-readable answer text for a simple trigger value. */
export function describeAnswer(question: QuestionDefinition | undefined, operator: string, value: unknown): string {
  if (operator === "exists") return "Any answer";
  if (!question) return String(value ?? "");
  if (question.type === "yes_no" || question.type === "confirmation") return value === true ? "Yes" : value === false ? "No" : "Not set";
  if (question.options?.length) {
    const label = question.options.find((o) => o.value === value)?.label;
    return label || (value ? String(value) : "Not set");
  }
  return String(value ?? "");
}

// ---- Versions ------------------------------------------------------------------------

/** An editable copy of a published version; identities are kept so history stays traceable. */
export function draftFromVersion(version: { definition: QuestionnaireDefinition; document_rules: Rule[] }) {
  return { definition: structuredClone(version.definition), rules: structuredClone(version.document_rules) };
}

export function countQuestions(definition: QuestionnaireDefinition): number {
  return allQuestions(definition).filter((q) => q.type !== "information").length;
}

const OPERATOR_WORDS: Record<string, string> = {
  equals: "is", not_equals: "is not", in: "is one of", not_in: "is not one of", exists: "has an answer",
  not_exists: "has no answer", greater_than: "is more than", greater_than_or_equal: "is at least",
  less_than: "is less than", less_than_or_equal: "is at most", contains: "includes",
};
export const OPERATOR_OPTIONS = Object.entries(OPERATOR_WORDS).map(([value, label]) => ({ value, label }));

/** A plain-language sentence for any condition, used to summarise advanced rules. */
export function describeCondition(condition: Condition | null | undefined, definition: QuestionnaireDefinition): string {
  if (!condition) return "always";
  const questions = allQuestions(definition);
  const find = (id?: string | null) => questions.find((q) => q.id === id);
  const name = (id?: string | null) => `“${find(id)?.label || "Untitled question"}”`;
  switch (condition.kind) {
    case "comparison": {
      const op = condition.operator ?? "exists";
      if (op === "exists" || op === "not_exists") return `${name(condition.question_id)} ${OPERATOR_WORDS[op]}`;
      const values = Array.isArray(condition.value) ? condition.value : [condition.value];
      const text = values.map((v) => describeAnswer(find(condition.question_id), "equals", v)).join(", ");
      return `${name(condition.question_id)} ${OPERATOR_WORDS[op] ?? op} ${text}`;
    }
    case "all": return (condition.conditions ?? []).map((c) => describeCondition(c, definition)).join(" and ") || "always";
    case "any": return (condition.conditions ?? []).map((c) => describeCondition(c, definition)).join(" or ") || "never";
    case "not": return `not (${describeCondition(condition.condition, definition)})`;
    case "repeat": return `${condition.quantifier === "all" ? "every" : "any"} entry in ${name(condition.group_question_id)} where ${describeCondition(condition.condition, definition)}`;
  }
}

/** JSON with sorted keys and without null/undefined values, so backend-filled defaults don't count as edits. */
export function normalizedJson(value: unknown): string {
  const clean = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(clean);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, clean(x)]));
    }
    return v;
  };
  return JSON.stringify(clean(value));
}

export interface VersionChange { kind: "added" | "removed" | "changed"; text: string }

/** Human-readable differences between two definitions and rule sets, keyed by stable IDs. */
export function compareVersions(
  before: { definition: QuestionnaireDefinition; rules: Rule[] },
  after: { definition: QuestionnaireDefinition; rules: Rule[] }
): VersionChange[] {
  const changes: VersionChange[] = [];
  const beforeSections = new Map(before.definition.sections.map((s) => [s.id, s]));
  const afterSections = new Map(after.definition.sections.map((s) => [s.id, s]));
  for (const s of after.definition.sections) {
    const prev = beforeSections.get(s.id);
    if (!prev) changes.push({ kind: "added", text: `Section “${s.title || "Untitled section"}”` });
    else if (prev.title !== s.title) changes.push({ kind: "changed", text: `Section renamed from “${prev.title}” to “${s.title}”` });
  }
  for (const s of before.definition.sections) {
    if (!afterSections.has(s.id)) changes.push({ kind: "removed", text: `Section “${s.title || "Untitled section"}”` });
  }
  const beforeQuestions = new Map(allQuestions(before.definition).map((q) => [q.id, q]));
  const afterQuestions = new Map(allQuestions(after.definition).map((q) => [q.id, q]));
  for (const [id, q] of afterQuestions) {
    const prev = beforeQuestions.get(id);
    if (!prev) changes.push({ kind: "added", text: `Question “${q.label || "Untitled question"}”` });
    else if (normalizedJson(prev) !== normalizedJson(q)) changes.push({ kind: "changed", text: `Question “${q.label || prev.label || "Untitled question"}”` });
  }
  for (const [id, q] of beforeQuestions) {
    if (!afterQuestions.has(id)) changes.push({ kind: "removed", text: `Question “${q.label || "Untitled question"}”` });
  }
  const title = (r: Rule) => r.outputs.map((o) => o.doc_type_needed).filter(Boolean).join(", ") || "untitled";
  const beforeRules = new Map(before.rules.map((r) => [r.id, r]));
  const afterRules = new Map(after.rules.map((r) => [r.id, r]));
  for (const [id, r] of afterRules) {
    const prev = beforeRules.get(id);
    if (!prev) changes.push({ kind: "added", text: `Document request “${title(r)}”` });
    else if (normalizedJson(prev) !== normalizedJson(r)) changes.push({ kind: "changed", text: `Document request “${title(r)}”` });
  }
  for (const [id, r] of beforeRules) {
    if (!afterRules.has(id)) changes.push({ kind: "removed", text: `Document request “${title(r)}”` });
  }
  return changes;
}

/** Keeps a question's simple requests valid after its type or choices change. */
export function retargetQuestionRequests(rules: Rule[], definition: QuestionnaireDefinition, question: QuestionDefinition): Rule[] {
  return rules.map((rule) => {
    const request = simpleRequest(rule, definition);
    if (!request || request.questionId !== question.id) return rule;
    const valid = question.type === "yes_no" || question.type === "confirmation"
      ? request.operator === "equals" && typeof request.value === "boolean"
      : question.type === "single_choice" || question.type === "multiple_choice"
        ? request.operator === defaultTrigger(question).operator && (question.options ?? []).some((o) => o.value === request.value)
        : request.operator === "exists";
    return valid ? rule : retargetRequest(rule, question);
  });
}

/**
 * A copy of an unfinished draft that the preview endpoint will accept: blank
 * titles get display placeholders. Only used for previews; never saved.
 */
export function previewable(definition: QuestionnaireDefinition, rules: Rule[]): { definition: QuestionnaireDefinition; rules: Rule[] } {
  const fill = (q: QuestionDefinition): QuestionDefinition => ({
    ...q,
    label: q.label || "Untitled question",
    options: q.options?.map((o, i) => ({ ...o, label: o.label || `Choice ${i + 1}` })),
    fields: q.fields?.map(fill),
  });
  return {
    definition: { ...definition, sections: definition.sections.map((s) => ({ ...s, title: s.title || "Untitled section", questions: s.questions.map(fill) })) },
    rules: rules.map((r) => ({ ...r, outputs: r.outputs.map((o) => ({ ...o, doc_type_needed: o.doc_type_needed || "Untitled document" })) })),
  };
}

/** Rewrites backend validation paths (e.g. `sections.0.title`) into plain language. */
export function describeValidation(message: string, definition: QuestionnaireDefinition): string {
  const blank = / String should have at least 1 character/;
  return message.replace(/(?:rules\.)?(\d+)\.outputs\.(\d+)\.doc_type_needed:[^;]*|sections\.(\d+)(?:\.questions\.(\d+))?(?:\.options\.(\d+))?\.(title|label)?:([^;]*)/g,
    (match, rule, _output, s, q, o, field, detail: string | undefined) => {
      if (rule !== undefined) return `Document request ${Number(rule) + 1} needs a document title`;
      const section = definition.sections[Number(s)];
      const where = q === undefined ? `Section ${Number(s) + 1}` : `Question ${Number(q) + 1} in “${section?.title || `section ${Number(s) + 1}`}”`;
      if (o !== undefined && field === "label") return `${where}: choice ${Number(o) + 1} needs text`;
      if (field && detail && blank.test(` ${detail.trim()}`)) return `${where} needs ${field === "title" ? "a title" : "question text"}`;
      return match.replace(/^[\w.]+:/, `${where}:`);
    })
    .replace(/^Draft definition or document rules are invalid: /, "Can’t publish yet: ");
}
