// Pure review logic for an AI questionnaire import.
//
// Review items are import metadata owned by the server; the reviewer only
// changes their status. Accepted document requests become rules through the
// builder's own functions (newDocumentRequest / updateSimpleRequest), so an
// imported request is indistinguishable from one a person added by hand.

import type { ImportDocumentProposal, ImportReviewItem, ImportReviewTarget, ImportTransformation } from "./api";
import type { QuestionDefinition, QuestionnaireDefinition } from "./questionnaire-logic";
import { newDocumentRequest, updateSimpleRequest, type Rule } from "./questionnaire-builder-model";

export type Severity = "critical" | "warning";

export function itemTargets(item: ImportReviewItem): ImportReviewTarget[] {
  return item.targets?.length ? item.targets : [item.target];
}

export const isOpen = (item: ImportReviewItem) => item.status === "open";
/** Items that need an explicit accept/reject decision (never resolved in bulk). */
export const isDecision = (item: ImportReviewItem) => !!item.proposal;
export const isSuggestion = (item: ImportReviewItem) => item.kind === "suggested_document";
export const isExtractionWarning = (item: ImportReviewItem) => item.kind === "completeness";
/** Genuine problems that block creation until resolved. */
export const isBlocking = (item: ImportReviewItem) => isOpen(item) && item.severity === "critical";
/** Extraction limitations the firm acknowledges (never blocking on their own). */
export const isLimitation = (item: ImportReviewItem) => item.kind === "completeness" && item.severity === "warning";
/** Informational notes about individual questions; shown on the question, never counted. */
export const isNote = (item: ImportReviewItem) => item.kind !== "completeness" && item.kind !== "requiredness" && item.severity === "warning" && !item.proposal;
/** One grouped decision about questions whose requiredness the document doesn't settle. */
export const isRequirednessDecision = (item: ImportReviewItem) => item.kind === "requiredness";

export const appliedImprovements = (ts: ImportTransformation[]) => ts.filter((t) => t.mode === "automatic" && (t.status === "applied" || t.status === "undone"));
export const documentSuggestions = (ts: ImportTransformation[]) => ts.filter((t) => t.mode === "suggestion" && t.category === "documents");
export const editorialSuggestions = (ts: ImportTransformation[]) => ts.filter((t) => t.mode === "suggestion" && t.category !== "documents");

export interface ReviewCounts { questions: number; attention: number; improvements: number; suggestions: number; pendingDocuments: number; openLimitations: number }

export function reviewCounts(items: ImportReviewItem[], transformations: ImportTransformation[], definition: QuestionnaireDefinition): ReviewCounts {
  return {
    questions: definition.sections.flatMap((s) => s.questions).filter((q) => q.type !== "information").length,
    attention: items.filter(isBlocking).length,
    improvements: transformations.filter((t) => t.mode === "automatic" && t.status === "applied").length,
    suggestions: transformations.filter((t) => t.mode === "suggestion" && t.status === "pending").length,
    pendingDocuments: documentSuggestions(transformations).filter((t) => t.status === "pending").length,
    openLimitations: items.filter((i) => isOpen(i) && isLimitation(i)).length,
  };
}

/** The top-level question that contains a question or repeating-list field. */
export function topLevelQuestionId(definition: QuestionnaireDefinition, questionId: string): string | null {
  for (const section of definition.sections) {
    for (const question of section.questions) {
      if (question.id === questionId || (question.fields ?? []).some((f) => f.id === questionId)) return question.id;
    }
  }
  return null;
}

export function sectionOfQuestion(definition: QuestionnaireDefinition, questionId: string): string | null {
  const top = topLevelQuestionId(definition, questionId);
  return definition.sections.find((s) => s.questions.some((q) => q.id === top))?.id ?? null;
}

/** Open review items per top-level question id (and section id), worst severity first. */
export function annotations(items: ImportReviewItem[], definition: QuestionnaireDefinition): Record<string, Severity> {
  const result: Record<string, Severity> = {};
  for (const item of items) {
    if (!isBlocking(item)) continue;
    for (const target of itemTargets(item)) {
      const key = target.question_id ? topLevelQuestionId(definition, target.question_id) : target.section_id ?? null;
      if (!key) continue;
      if (result[key] !== "critical") result[key] = item.severity;
    }
  }
  return result;
}

/** Items shown inline on a question card. */
export function itemsForQuestion(items: ImportReviewItem[], definition: QuestionnaireDefinition, questionId: string): ImportReviewItem[] {
  return items.filter((item) => itemTargets(item).some((t) => t.question_id && topLevelQuestionId(definition, t.question_id) === questionId));
}

/** Top-level question ids to show when the "Needs review" filter is on. */
export function needsReviewQuestionIds(items: ImportReviewItem[], definition: QuestionnaireDefinition): Set<string> {
  return new Set(Object.keys(annotations(items, definition)).filter((id) => topLevelQuestionId(definition, id) === id));
}

export interface ReviewSummary {
  sections: number;
  questions: number;
  conditional: number;
  openCritical: number;
  openWarnings: number;
  pendingDecisions: number;
  suggestions: number;
  openExtractionWarnings: number;
  incomplete: boolean;
}

export function summarize(items: ImportReviewItem[], definition: QuestionnaireDefinition): ReviewSummary {
  const questions = definition.sections.flatMap((s) => s.questions);
  return {
    sections: definition.sections.length,
    questions: questions.filter((q) => q.type !== "information").length,
    conditional: questions.filter((q) => q.visible_when || q.required_when).length + definition.sections.filter((s) => s.visible_when).length,
    openCritical: items.filter((i) => isOpen(i) && i.severity === "critical").length,
    openWarnings: items.filter((i) => isOpen(i) && i.severity === "warning" && !isDecision(i) && !isExtractionWarning(i)).length,
    pendingDecisions: items.filter((i) => isOpen(i) && isDecision(i)).length,
    suggestions: items.filter(isSuggestion).length,
    openExtractionWarnings: items.filter((i) => isOpen(i) && isExtractionWarning(i)).length,
    incomplete: items.some((i) => isExtractionWarning(i) && i.severity === "critical"),
  };
}

/** Mirrors the server's creation gate so the button explains itself before the request. */
export function creationBlockers(items: ImportReviewItem[], rules: Rule[], name: string, acknowledgeWarnings: boolean, transformations: ImportTransformation[] = []): string[] {
  const blockers: string[] = [];
  const attention = items.filter(isBlocking).length;
  if (attention) blockers.push(`${attention} issue${attention === 1 ? " still needs" : "s still need"} your attention.`);
  const documents = documentSuggestions(transformations).filter((t) => t.status === "pending").length;
  if (documents) blockers.push(`${documents} suggested document request${documents === 1 ? " still needs" : "s still need"} a decision.`);
  if (items.some((i) => isOpen(i) && isLimitation(i)) && !acknowledgeWarnings) blockers.push("Confirm you have checked the extraction notes.");
  const ruleIds = new Set(rules.map((r) => r.id));
  for (const item of items) {
    if (isDecision(item) && item.status === "accepted" && (!item.rule_id || !ruleIds.has(item.rule_id))) {
      blockers.push(`The accepted document request “${item.title}” was removed from the document requests. Undo the acceptance or add it again.`);
    }
  }
  if (!name.trim()) blockers.push("Give the questionnaire a name.");
  return blockers;
}

/** Next open item after `currentId`, wrapping around; decisions and critical items first. */
export function nextOpenItem(items: ImportReviewItem[], currentId?: string | null): ImportReviewItem | null {
  const open = items.filter(isOpen);
  if (!open.length) return null;
  const rank = (i: ImportReviewItem) => (i.severity === "critical" ? 0 : isDecision(i) ? 1 : 2);
  const ordered = [...open].sort((a, b) => rank(a) - rank(b));
  const index = currentId ? ordered.findIndex((i) => i.id === currentId) : -1;
  return ordered[(index + 1) % ordered.length] ?? null;
}

// ---- Document request proposals -------------------------------------------------------------

export type TriggerChoice = { label: string; operator: "equals" | "contains" | "exists"; value: unknown };

/** The answers a proposed request can be triggered by, for this question type. */
export function triggerChoices(question: QuestionDefinition | undefined): TriggerChoice[] {
  if (!question) return [];
  if (question.type === "yes_no") return [{ label: "Yes", operator: "equals", value: true }, { label: "No", operator: "equals", value: false }];
  if (question.type === "confirmation") return [{ label: "Confirmed", operator: "equals", value: true }];
  if (question.type === "single_choice" || question.type === "multiple_choice") {
    const operator = question.type === "multiple_choice" ? "contains" : "equals";
    return [...(question.options ?? []).map((o, i) => ({ label: o.label || `Choice ${i + 1}`, operator, value: o.value } as TriggerChoice)),
      { label: "Any answer", operator: "exists", value: undefined }];
  }
  if (question.type === "information" || question.type === "repeating_group") return [];
  return [{ label: "Any answer", operator: "exists", value: undefined }];
}

export function triggerIndex(choices: TriggerChoice[], operator: string | null, value: unknown): number {
  return choices.findIndex((c) => c.operator === operator && (c.operator === "exists" || c.value === value));
}

/** Questions a document request can hang off (the builder's simple-request shape). */
export function requestableQuestions(definition: QuestionnaireDefinition): QuestionDefinition[] {
  return definition.sections.flatMap((s) => s.questions).filter((q) => triggerChoices(q).length > 0);
}

export interface ProposalEdits { questionId: string | null; title: string; instructions: string; trigger: number }

export function initialEdits(proposal: ImportDocumentProposal, definition: QuestionnaireDefinition): ProposalEdits {
  const question = requestableQuestions(definition).find((q) => q.id === proposal.question_id);
  const choices = triggerChoices(question);
  const index = triggerIndex(choices, proposal.operator, proposal.value);
  return { questionId: question?.id ?? null, title: proposal.title, instructions: proposal.instructions ?? "", trigger: index >= 0 ? index : choices.length ? 0 : -1 };
}

/** Builds the rule for an accepted proposal with the builder's own functions. */
export function ruleForProposal(edits: ProposalEdits, definition: QuestionnaireDefinition): Rule | null {
  const question = requestableQuestions(definition).find((q) => q.id === edits.questionId);
  const choice = triggerChoices(question)[edits.trigger];
  if (!question || !choice || !edits.title.trim()) return null;
  const rule = newDocumentRequest(question, edits.title.trim());
  return updateSimpleRequest(rule, { operator: choice.operator, value: choice.value, instructions: edits.instructions.trim() });
}
