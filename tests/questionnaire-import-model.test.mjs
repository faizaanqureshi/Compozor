import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Match the extensionless imports Next resolves when loading TS in Node.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/lib/") && specifier.startsWith("./") && !specifier.endsWith(".ts")) {
      return nextResolve(specifier + ".ts", context);
    }
    return nextResolve(specifier, context);
  },
});
const m = await import(new URL("../lib/questionnaire-import-model.ts", import.meta.url).href);
const builder = await import(new URL("../lib/questionnaire-builder-model.ts", import.meta.url).href);
hooks.deregister();

const definition = {
  format_version: "1",
  sections: [
    { id: "s1", title: "About you", questions: [
      { id: "employed", type: "yes_no", label: "Employed?" },
      { id: "status", type: "single_choice", label: "Status", options: [{ value: "opt_single", label: "Single" }, { value: "opt_married", label: "Married" }] },
      { id: "income", type: "multiple_choice", label: "Income", options: [{ value: "opt_t4", label: "Employment" }] },
      { id: "kids", type: "repeating_group", label: "Children", entry_id_key: "_id", fields: [{ id: "kid_name", type: "short_text", label: "Name" }] },
      { id: "employer", type: "short_text", label: "Employer" },
      { id: "note", type: "information", label: "Read this" },
    ] },
    { id: "s2", title: "Other", questions: [{ id: "other", type: "long_text", label: "Anything else?" }] },
  ],
};

const item = (overrides) => ({
  id: "review_" + Math.random().toString(16).slice(2), kind: "question", severity: "warning", title: "T", reason: "R",
  target: {}, source: null, origin: "extracted", status: "open", ...overrides,
});

test("only genuine blocking problems mark questions; notes never look like errors", () => {
  const items = [
    item({ target: { question_id: "employed" } }),
    item({ target: { question_id: "employed" }, severity: "critical" }),
    item({ target: { question_id: "kid_name" }, severity: "critical" }),
    item({ target: { section_id: "s2" }, severity: "critical" }),
    item({ target: { question_id: "employer" }, severity: "critical", status: "resolved" }),
    item({ targets: [{ question_id: "status" }, { question_id: "other" }], target: { question_id: "status" }, severity: "critical" }),
    item({ target: { question_id: "income" } }),
  ];
  assert.deepEqual(m.annotations(items, definition), { employed: "critical", kids: "critical", s2: "critical", status: "critical", other: "critical" });
  assert.equal(m.itemsForQuestion(items, definition, "kids").length, 1);
  assert.equal(items.filter(m.isNote).length, 2);
  assert.equal(items.filter(m.isBlocking).length, 4);
});

test("accepted proposals become rules through the builder and store typed trigger values", () => {
  const yes = m.ruleForProposal({ questionId: "employed", title: "T4 slips", instructions: "All of them", trigger: 0 }, definition);
  assert.deepEqual(yes.condition, { kind: "comparison", question_id: "employed", operator: "equals", value: true });
  assert.equal(yes.outputs[0].doc_type_needed, "T4 slips");
  assert.equal(yes.outputs[0].description, "All of them");
  const no = m.ruleForProposal({ questionId: "employed", title: "Letter", instructions: "", trigger: 1 }, definition);
  assert.equal(no.condition.value, false);
  const married = m.ruleForProposal({ questionId: "status", title: "Marriage certificate", instructions: "", trigger: 1 }, definition);
  assert.equal(married.condition.value, "opt_married");
  const multi = m.ruleForProposal({ questionId: "income", title: "T4", instructions: "", trigger: 0 }, definition);
  assert.equal(multi.condition.operator, "contains");
  const anyChoice = m.ruleForProposal({ questionId: "income", title: "Slips", instructions: "", trigger: 1 }, definition);
  assert.equal(anyChoice.condition.operator, "exists");
  assert.ok(builder.simpleRequest(anyChoice, definition));
  assert.equal(m.initialEdits({ title: "Slips", instructions: null, question_id: "income", operator: "exists", value: null }, definition).trigger, 1);
  const any = m.ruleForProposal({ questionId: "employer", title: "Employment letter", instructions: "", trigger: 0 }, definition);
  assert.equal(any.condition.operator, "exists");
  assert.equal("value" in any.condition, false);
  // Same shape as a request added by hand, so it shows on the question card and in the rules tab.
  for (const rule of [yes, no, married, multi, any]) assert.ok(builder.simpleRequest(rule, definition));
  assert.equal(m.ruleForProposal({ questionId: "employed", title: "  ", instructions: "", trigger: 0 }, definition), null);
  assert.equal(m.ruleForProposal({ questionId: null, title: "x", instructions: "", trigger: 0 }, definition), null);
});

test("explicit rules created by the server are simple builder requests", () => {
  const serverRule = { id: "rule_0123456789ab", condition: { kind: "comparison", question_id: "employed", operator: "equals", value: true },
    outputs: [{ output_key: "document", requirement_key: "requirement_0123456789ab", doc_type_needed: "T4 slips", description: null,
      reporting_period: { kind: "assignment_reporting_period" }, respondent: { kind: "assignment_respondent" } }] };
  const request = builder.simpleRequest(serverRule, definition);
  assert.equal(request.questionId, "employed");
  assert.equal(builder.requestsForQuestion([serverRule], definition, "employed").simple.length, 1);
});

test("proposal edits start from the AI proposal and leave unlinked requests unset", () => {
  const edits = m.initialEdits({ title: "Marriage certificate", instructions: null, question_id: "status", operator: "equals", value: "opt_married" }, definition);
  assert.deepEqual(edits, { questionId: "status", title: "Marriage certificate", instructions: "", trigger: 1 });
  const unlinked = m.initialEdits({ title: "Void cheque", instructions: null, question_id: null, operator: null, value: null }, definition);
  assert.equal(unlinked.questionId, null);
  assert.equal(unlinked.trigger, -1);
  assert.deepEqual(m.requestableQuestions(definition).map((q) => q.id), ["employed", "status", "income", "employer", "other"]);
});

test("creation blockers mirror the server gate", () => {
  const suggestion = item({ kind: "explicit_document", proposal: { title: "T5" }, title: "T5", severity: "critical" });
  const critical = item({ severity: "critical" });
  const warning = item({ kind: "completeness" });
  const pendingDocument = { id: "c1", mode: "suggestion", category: "documents", status: "pending", title: "Lease", benefit: "", reason: "", evidence: null, assumptions: [], operations: [] };
  const pendingEditorial = { ...pendingDocument, id: "c2", category: "clarity" };
  let blockers = m.creationBlockers([suggestion, critical, warning], [], "", false, [pendingDocument, pendingEditorial]);
  assert.equal(blockers.length, 4);
  assert.match(blockers.join(" "), /2 issues/);
  assert.match(blockers.join(" "), /1 suggested document request still needs a decision/);
  const accepted = { ...suggestion, status: "accepted", rule_id: "rule_gone" };
  blockers = m.creationBlockers([accepted, { ...critical, status: "accepted" }, warning], [], "Tax", true);
  assert.equal(blockers.length, 1);
  assert.match(blockers[0], /removed/);
  assert.deepEqual(m.creationBlockers([{ ...accepted, rule_id: "r1" }], [{ id: "r1" }], "Tax", false), []);
  // Ordinary warnings on questions don't block creation.
  assert.deepEqual(m.creationBlockers([item({})], [], "Tax", false, [pendingEditorial]), []);
});

test("review counts reflect real results only", () => {
  const applied = { id: "a", mode: "automatic", category: "respondents", status: "applied", title: "", benefit: "", reason: "", evidence: null, assumptions: [], operations: [] };
  const undone = { ...applied, id: "b", status: "undone" };
  const suggestion = { ...applied, id: "c", mode: "suggestion", category: "clarity", status: "pending" };
  const skipped = { ...suggestion, id: "d", status: "skipped" };
  const counts = m.reviewCounts([item({}), item({ severity: "critical" }), item({ kind: "completeness" })], [applied, undone, suggestion, skipped], definition);
  assert.deepEqual(counts, { questions: 6, attention: 1, improvements: 1, suggestions: 1, pendingDocuments: 0, openLimitations: 1 });
  assert.deepEqual(m.appliedImprovements([applied, undone, suggestion]).map((t) => t.id), ["a", "b"]);
});

test("summary counts and next-item navigation prioritise critical items and decisions", () => {
  const a = item({ severity: "warning" });
  const b = item({ kind: "suggested_document", proposal: { title: "x" } });
  const c = item({ severity: "critical", kind: "completeness" });
  const summary = m.summarize([a, b, c], definition);
  assert.equal(summary.questions, 6);
  assert.equal(summary.openCritical, 1);
  assert.equal(summary.pendingDecisions, 1);
  assert.equal(summary.openExtractionWarnings, 1);
  assert.equal(summary.incomplete, true);
  assert.equal(m.nextOpenItem([a, b, c]).id, c.id);
  assert.equal(m.nextOpenItem([a, b, c], c.id).id, b.id);
  assert.equal(m.nextOpenItem([a, b, c], a.id).id, c.id);
  assert.equal(m.nextOpenItem([{ ...a, status: "resolved" }]), null);
});
