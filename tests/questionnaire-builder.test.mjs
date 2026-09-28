import { test } from "node:test";
import assert from "node:assert/strict";

const { QuestionnaireContext, conditionValueFromInput, conditionValueToInput } = await import(
  new URL("../lib/questionnaire-logic.ts", import.meta.url).href
);

const questions = {
  employed: { id: "employed", type: "yes_no", label: "Employed?" },
  accurate: { id: "accurate", type: "confirmation", label: "Accurate?" },
  dependents: { id: "dependents", type: "number", label: "Dependents" },
  income: { id: "income", type: "currency", label: "Income" },
  status: { id: "status", type: "single_choice", label: "Status", options: [{ value: "married", label: "Married" }] },
  name: { id: "name", type: "short_text", label: "Name" },
};

test("builder condition values use the JSON type the backend compares against", () => {
  assert.equal(conditionValueFromInput(questions.employed, "equals", "true"), true);
  assert.equal(conditionValueFromInput(questions.employed, "equals", "No"), false);
  assert.equal(conditionValueFromInput(questions.accurate, "not_equals", "yes"), true);
  assert.equal(conditionValueFromInput(questions.dependents, "greater_than", "2"), 2);
  assert.equal(conditionValueFromInput(questions.dependents, "greater_than", "2."), "2.");
  assert.equal(conditionValueFromInput(questions.income, "greater_than", "1000.50"), "1000.50");
  assert.equal(conditionValueFromInput(questions.status, "equals", "married"), "married");
  assert.equal(conditionValueFromInput(questions.name, "equals", "true"), "true");
  assert.deepEqual(conditionValueFromInput(questions.employed, "in", "true, false"), [true, false]);
  assert.deepEqual(conditionValueFromInput(questions.dependents, "not_in", "1, 3,"), [1, 3]);
  assert.equal(conditionValueToInput([true, 2]), "true, 2");
  assert.equal(conditionValueToInput(undefined), "");
});

test("a yes/no rule authored in the builder matches a Yes answer (regression)", () => {
  const definition = { sections: [{ id: "s", title: "S", questions: [
    questions.employed,
    { id: "employer", type: "short_text", label: "Employer", visible_when: {
      kind: "comparison", question_id: "employed", operator: "equals",
      value: conditionValueFromInput(questions.employed, "equals", "true") } },
  ] }] };
  const ctx = new QuestionnaireContext(definition, { employed: true });
  assert.equal(ctx.isVisible(ctx.questions.get("employer")), true);
  // The previous builder stored the string "true", which the evaluator (like
  // the backend) never treats as equal to the boolean answer.
  const stale = structuredClone(definition);
  stale.sections[0].questions[1].visible_when.value = "true";
  const staleCtx = new QuestionnaireContext(stale, { employed: true });
  assert.equal(staleCtx.isVisible(staleCtx.questions.get("employer")), false);
});
