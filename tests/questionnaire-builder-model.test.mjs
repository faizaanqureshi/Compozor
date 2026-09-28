import { test } from "node:test";
import assert from "node:assert/strict";

const m = await import(new URL("../lib/questionnaire-builder-model.ts", import.meta.url).href);

const yesNo = { id: "rental", type: "yes_no", label: "Do you own a rental property?", required: false, sensitivity: "standard" };
const choice = {
  id: "status", type: "single_choice", label: "Marital status", sensitivity: "standard",
  options: [{ value: "single", label: "Single" }, { value: "married", label: "Married" }],
};
const multi = { id: "income", type: "multiple_choice", label: "Income types", options: [{ value: "t4", label: "Employment" }, { value: "t5", label: "Investments" }] };
const text = { id: "employer", type: "short_text", label: "Employer" };
const group = { id: "kids", type: "repeating_group", label: "Children", entry_id_key: "_id", fields: [{ id: "kid_name", type: "short_text", label: "Name" }] };

function fixture() {
  return {
    format_version: "1",
    sections: [
      { id: "s1", title: "About you", questions: [structuredClone(yesNo), structuredClone(choice), structuredClone(multi)] },
      { id: "s2", title: "Work", questions: [structuredClone(text), structuredClone(group)] },
    ],
  };
}

const advancedRule = {
  id: "legacy_rule",
  for_each: "kids",
  condition: { kind: "repeat", group_question_id: "kids", quantifier: "any", condition: { kind: "comparison", question_id: "kid_name", operator: "exists" } },
  outputs: [{
    output_key: "doc", requirement_key: "legacy_key", doc_type_needed: "Birth certificate", description: "Per child",
    reporting_period: { kind: "fixed", value: "2025" }, respondent: { kind: "assignment_respondent" },
    subject: { kind: "question", question_id: "kid_name" }, instance_key: { kind: "repeat_entry_id" },
  }],
};

test("new questionnaires and questions start blank so placeholders show instead of fallback text", () => {
  const q = m.emptyQuestionnaire();
  assert.equal(q.sections.length, 1);
  assert.equal(q.sections[0].title, "");
  const question = m.newQuestion("single_choice");
  assert.equal(question.label, "");
  assert.ok(question.options.every((o) => o.label === "" && o.value));
  assert.equal(m.newQuestion("repeating_group").fields.length, 1);
  assert.equal(m.newQuestion("date").date_precision, "day");
  // Every one of the 13 types stays available.
  assert.equal(m.QUESTION_TYPES.length, 13);
  for (const { value } of m.QUESTION_TYPES) assert.equal(m.newQuestion(value).type, value);
});

test("changing a question type keeps its identity, wording and advanced settings", () => {
  const source = { ...structuredClone(yesNo), description: "Help", sensitivity: "confidential", visible_when: { kind: "comparison", question_id: "employer", operator: "exists" } };
  const next = m.changeQuestionType(source, "single_choice");
  assert.equal(next.id, "rental");
  assert.equal(next.label, source.label);
  assert.equal(next.description, "Help");
  assert.equal(next.sensitivity, "confidential");
  assert.deepEqual(next.visible_when, source.visible_when);
  assert.equal(next.options.length, 2);
  assert.equal(m.changeQuestionType(next, "information").required, false);
});

test("a document request stores booleans for yes/no and option values for choices", () => {
  const yes = m.newDocumentRequest(yesNo, "Rental statement");
  assert.deepEqual(yes.condition, { kind: "comparison", question_id: "rental", operator: "equals", value: true });
  assert.equal(typeof yes.condition.value, "boolean");
  assert.notEqual(yes.id, "");
  assert.ok(yes.outputs[0].requirement_key);
  assert.equal(m.updateSimpleRequest(yes, { value: false, operator: "equals" }).condition.value, false);

  const married = m.updateSimpleRequest(m.newDocumentRequest(choice), { value: "married", operator: "equals" });
  assert.equal(married.condition.value, "married");
  assert.equal(m.newDocumentRequest(multi).condition.operator, "contains");
  const any = m.newDocumentRequest(text);
  assert.equal(any.condition.operator, "exists");
  assert.equal("value" in any.condition, false);
});

test("question requests and the rules tab read and write the same rules array", () => {
  const def = fixture();
  let rules = [m.newDocumentRequest(yesNo, "Rental statement"), structuredClone(advancedRule)];
  const { simple, advanced } = m.requestsForQuestion(rules, def, "rental");
  assert.equal(simple.length, 1);
  assert.equal(advanced, 0);
  // An edit made from either place is an edit to the rule itself.
  rules = m.replaceRule(rules, m.updateSimpleRequest(simple[0].rule, { title: "T776", instructions: "Include expenses" }));
  const again = m.requestsForQuestion(rules, def, "rental").simple[0];
  assert.equal(again.title, "T776");
  assert.equal(again.instructions, "Include expenses");
  assert.equal(rules[0].id, simple[0].rule.id);
  assert.equal(rules[0].outputs[0].requirement_key, simple[0].rule.outputs[0].requirement_key);
});

test("advanced rules are never classified as simple and survive edits byte for byte", () => {
  const def = fixture();
  assert.equal(m.simpleRequest(advancedRule, def), null);
  const withSubject = { ...m.newDocumentRequest(yesNo, "x") };
  withSubject.outputs = [{ ...withSubject.outputs[0], subject: { kind: "fixed", value: "a" } }];
  assert.equal(m.simpleRequest(withSubject, def), null);
  const twoOutputs = { ...m.newDocumentRequest(yesNo, "x") };
  twoOutputs.outputs = [twoOutputs.outputs[0], { ...twoOutputs.outputs[0], requirement_key: "b" }];
  assert.equal(m.simpleRequest(twoOutputs, def), null);
  const notEquals = m.newDocumentRequest(yesNo, "x");
  notEquals.condition.operator = "not_equals";
  assert.equal(m.simpleRequest(notEquals, def), null);

  const before = JSON.stringify(advancedRule);
  let rules = [structuredClone(advancedRule), m.newDocumentRequest(yesNo, "Rental")];
  rules = m.replaceRule(rules, m.updateSimpleRequest(rules[1], { title: "Changed" }));
  rules = m.retargetQuestionRequests(rules, def, m.changeQuestionType(def.sections[0].questions[0], "short_text"));
  assert.equal(JSON.stringify(rules[0]), before);
  const roundTrip = JSON.parse(JSON.stringify({ format_version: "1", rules }));
  assert.deepEqual(roundTrip.rules[0], advancedRule);
});

test("an advanced rule counts against its question rather than disappearing", () => {
  const def = fixture();
  const rule = { ...m.newDocumentRequest(yesNo, "x"), condition: { kind: "all", conditions: [{ kind: "comparison", question_id: "rental", operator: "equals", value: true }, { kind: "comparison", question_id: "status", operator: "equals", value: "married" }] } };
  assert.deepEqual(m.requestsForQuestion([rule], def, "rental"), { simple: [], advanced: 1 });
  assert.deepEqual(m.requestsForQuestion([rule], def, "status"), { simple: [], advanced: 1 });
});

test("type changes re-point only invalid simple triggers", () => {
  const def = fixture();
  const rule = m.newDocumentRequest(yesNo, "x");
  const asText = m.changeQuestionType(yesNo, "short_text");
  const [next] = m.retargetQuestionRequests([rule], def, asText);
  assert.equal(next.condition.operator, "exists");
  assert.equal(next.outputs[0].doc_type_needed, "x");
  assert.equal(next.id, rule.id);
  const keep = m.updateSimpleRequest(m.newDocumentRequest(choice), { value: "married" });
  assert.equal(m.retargetQuestionRequests([keep], def, choice)[0], keep);
});

test("deleting a question removes its own requests but is blocked by other dependencies", () => {
  const def = fixture();
  const own = m.newDocumentRequest(yesNo, "Rental");
  const result = m.deleteQuestionIn(def, [own], "s1", "rental");
  assert.ok(result);
  assert.equal(result.rules.length, 0);
  assert.equal(result.definition.sections[0].questions.some((q) => q.id === "rental"), false);

  const dependent = fixture();
  dependent.sections[1].questions[0].visible_when = { kind: "comparison", question_id: "rental", operator: "equals", value: true };
  assert.equal(m.deleteQuestionIn(dependent, [own], "s1", "rental"), null);
  assert.match(m.questionDependents(dependent, [own], dependent.sections[0].questions[0]).join(), /Employer/);

  // An advanced rule blocks deletion instead of being silently removed.
  assert.equal(m.deleteQuestionIn(def, [advancedRule], "s2", "kids"), null);
});

test("deleting a section is blocked by outside references and removes owned requests", () => {
  const def = fixture();
  assert.equal(m.deleteSectionIn(def, [advancedRule], "s2"), null);
  const result = m.deleteSectionIn(def, [m.newDocumentRequest(yesNo, "Rental")], "s1");
  assert.equal(result.definition.sections.length, 1);
  assert.equal(result.rules.length, 0);
  assert.equal(m.deleteSectionIn({ sections: [def.sections[0]] }, [], "s1"), null);
});

test("duplicating a question gives new IDs and copies its own requests pointing at the copy", () => {
  const def = fixture();
  const own = m.newDocumentRequest(yesNo, "Rental");
  const { definition, rules, newId } = m.duplicateQuestionIn(def, [own, advancedRule], "s1", "rental");
  const questions = definition.sections[0].questions;
  assert.equal(questions.length, 4);
  assert.equal(questions[1].id, newId);
  assert.notEqual(newId, "rental");
  assert.equal(questions[1].label, yesNo.label);
  assert.equal(rules.length, 3);
  const copy = rules[2];
  assert.equal(copy.condition.question_id, newId);
  assert.notEqual(copy.id, own.id);
  assert.notEqual(copy.outputs[0].requirement_key, own.outputs[0].requirement_key);
  assert.equal(rules[0].condition.question_id, "rental");
});

test("duplicating a section remaps nested fields, conditions and rules", () => {
  const def = fixture();
  def.sections[1].questions[0].visible_when = { kind: "repeat", group_question_id: "kids", quantifier: "any", condition: { kind: "comparison", question_id: "kid_name", operator: "exists" } };
  const { definition, rules } = m.duplicateSectionIn(def, [advancedRule], "s2");
  assert.equal(definition.sections.length, 3);
  const copy = definition.sections[2];
  assert.notEqual(copy.id, "s2");
  const [employer, kids] = copy.questions;
  assert.notEqual(kids.id, "kids");
  assert.notEqual(kids.fields[0].id, "kid_name");
  assert.equal(employer.visible_when.group_question_id, kids.id);
  assert.equal(employer.visible_when.condition.question_id, kids.fields[0].id);
  assert.equal(rules.length, 2);
  assert.equal(rules[1].for_each, kids.id);
  assert.equal(rules[1].outputs[0].subject.question_id, kids.fields[0].id);
  assert.deepEqual(rules[0], advancedRule);
});

test("sections move and keep their contents", () => {
  const def = fixture();
  const moved = m.move(def.sections, 0, 1);
  assert.deepEqual(moved.map((s) => s.id), ["s2", "s1"]);
  assert.deepEqual(m.move(def.sections, 0, -1).map((s) => s.id), ["s1", "s2"]);
});

test("conditions read as plain sentences without IDs", () => {
  const def = fixture();
  assert.equal(m.describeCondition({ kind: "comparison", question_id: "rental", operator: "equals", value: true }, def), "“Do you own a rental property?” is Yes");
  assert.equal(m.describeCondition({ kind: "comparison", question_id: "status", operator: "equals", value: "married" }, def), "“Marital status” is Married");
  assert.doesNotMatch(m.describeCondition(advancedRule.condition, def), /kid_name|kids/);
});

test("drafts can be created from a published version without touching it", () => {
  const version = { definition: fixture(), document_rules: [advancedRule] };
  const frozen = JSON.stringify(version);
  const draft = m.draftFromVersion(version);
  draft.definition.sections[0].title = "";
  draft.rules[0].outputs[0].doc_type_needed = "";
  assert.equal(JSON.stringify(version), frozen);
  assert.equal(draft.rules[0].id, "legacy_rule");
});

test("version comparison lists added, removed and edited items by label", () => {
  const before = { definition: fixture(), rules: [advancedRule] };
  const after = structuredClone(before);
  after.definition.sections[0].questions[0].label = "Rental property?";
  after.definition.sections[1].questions.shift();
  after.rules = [];
  const changes = m.compareVersions(before, after);
  assert.ok(changes.some((c) => c.kind === "changed" && c.text.includes("Rental property?")));
  assert.ok(changes.some((c) => c.kind === "removed" && c.text.includes("Employer")));
  assert.ok(changes.some((c) => c.kind === "removed" && c.text.includes("Birth certificate")));
  assert.deepEqual(m.compareVersions(before, structuredClone(before)), []);
});

test("empty fields stay empty in the serialized draft", () => {
  const def = fixture();
  def.sections[0].title = "";
  def.sections[0].questions[0].label = "";
  def.sections[0].questions[1].options[0].label = "";
  const rule = m.updateSimpleRequest(m.newDocumentRequest(yesNo, "Rental"), { title: "" });
  const saved = JSON.parse(JSON.stringify({ definition: def, rules: [rule] }));
  assert.equal(saved.definition.sections[0].title, "");
  assert.equal(saved.definition.sections[0].questions[0].label, "");
  assert.equal(saved.definition.sections[0].questions[1].options[0].label, "");
  assert.equal(saved.rules[0].outputs[0].doc_type_needed, "");
});

test("previews fill blank titles on a copy without changing the draft", () => {
  const def = fixture();
  def.sections[0].title = "";
  def.sections[0].questions[1].options[0].label = "";
  const rule = m.newDocumentRequest(yesNo, "");
  const copy = m.previewable(def, [rule]);
  assert.equal(copy.definition.sections[0].title, "Untitled section");
  assert.equal(copy.definition.sections[0].questions[1].options[0].label, "Choice 1");
  assert.equal(copy.rules[0].outputs[0].doc_type_needed, "Untitled document");
  assert.equal(def.sections[0].title, "");
  assert.equal(rule.outputs[0].doc_type_needed, "");
});

test("publication errors are described in plain language", () => {
  const def = fixture();
  assert.equal(m.describeValidation("Draft definition or document rules are invalid: sections.0.title: String should have at least 1 character", def), "Can’t publish yet: Section 1 needs a title");
  assert.equal(m.describeValidation("sections.1.questions.0.label: String should have at least 1 character", def), "Question 1 in “Work” needs question text");
  assert.equal(m.describeValidation("sections.0.questions.1.options.1.label: String should have at least 1 character", def), "Question 2 in “About you”: choice 2 needs text");
  assert.equal(m.describeValidation("Something else", def), "Something else");
});

test("backend-filled null defaults are not reported as version changes", () => {
  const draft = { definition: fixture(), rules: [m.newDocumentRequest(yesNo, "Rental")] };
  const published = structuredClone(draft);
  published.definition.sections[0].questions[0] = { visible_when: null, description: null, ...published.definition.sections[0].questions[0], required_when: null };
  published.rules[0] = { for_each: null, ...published.rules[0], outputs: [{ ...published.rules[0].outputs[0], subject: null, description: null }] };
  assert.deepEqual(m.compareVersions(published, draft), []);
});
