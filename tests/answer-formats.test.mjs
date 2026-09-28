import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const logic = await import(new URL("../lib/questionnaire-logic.ts", import.meta.url).href);
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/lib/") && specifier.startsWith("./") && !specifier.endsWith(".ts")) return nextResolve(specifier + ".ts", context);
    return nextResolve(specifier, context);
  },
});
const model = await import(new URL("../lib/questionnaire-import-model.ts", import.meta.url).href);
hooks.deregister();

// The same cases as tests/test_answer_formats.py in the API, so both sides agree.
const cases = [
  ["phone", "CA", "416-555-0199", true], ["phone", "CA", "(416) 555 0199", true], ["phone", "US", "+1 212 555 0100", true],
  ["phone", "US", "555-0100", false], ["phone", "CA", "116-555-0199", false], ["phone", null, "+44 20 7946 0958", true],
  ["phone", null, "12", false], ["phone", null, "call me", false], ["phone", "CA", "416-555-0199 ext 12", true],
  ["email", null, "a@b.co", true], ["email", null, "not-an-email", false],
  ["postal_code", "CA", "K1A 0B1", true], ["postal_code", "CA", "k1a0b1", true], ["postal_code", "CA", "12345", false],
  ["postal_code", "US", "12345-6789", true], ["postal_code", "US", "K1A 0B1", false], ["postal_code", null, "SW1A 1AA", true],
  ["national_id", "CA", "046 454 286", true], ["national_id", "CA", "046-454-287", false], ["national_id", "CA", "12345678", false],
  ["national_id", "US", "123-45-6789", true], ["national_id", "US", "000-12-3456", false], ["national_id", "US", "912-34-5678", false],
  ["national_id", null, "AB123456", true], ["national_id", null, "!", false],
];

test("answer formats match the server's rules", () => {
  for (const [kind, region, value, ok] of cases) {
    assert.equal(logic.formatIssue({ kind, region }, value) === null, ok, `${kind} ${region} ${value}`);
  }
  assert.equal(logic.formatIssue({ kind: "phone", region: "CA" }, "  "), null);
});

test("valid answers are tidied into their conventional form; invalid ones are left for the error", () => {
  assert.equal(logic.normalizeFormatted({ kind: "phone", region: "CA" }, "(416) 555 0199"), "416-555-0199");
  assert.equal(logic.normalizeFormatted({ kind: "national_id", region: "CA" }, "046 454 286"), "046-454-286");
  assert.equal(logic.normalizeFormatted({ kind: "national_id", region: "US" }, "123456789"), "123-45-6789");
  assert.equal(logic.normalizeFormatted({ kind: "postal_code", region: "CA" }, "k1a0b1"), "K1A 0B1");
  assert.equal(logic.normalizeFormatted({ kind: "phone", region: null }, "+44 20 7946 0958"), "+44 20 7946 0958");
  assert.equal(logic.normalizeFormatted({ kind: "national_id", region: "CA" }, "123"), "123");
});

test("hints never validate by themselves and identifiers avoid autofill", () => {
  assert.deepEqual(logic.formatHint({ kind: "national_id", region: "CA" }), { example: "123-456-789", inputMode: "numeric", autoComplete: "off" });
  assert.equal(logic.formatHint({ kind: "phone", region: "US" }).inputMode, "tel");
  assert.equal(logic.formatHint({ kind: "phone", region: "US" }).example, "212-555-0100");
  assert.equal(logic.formatHint({ kind: "phone", region: null }).example, "");  // no jurisdiction, no invented convention
  assert.equal(logic.formatHint({ kind: "national_id", region: null }).example, "");
});

test("formatted answers are checked in the client's answer issues", () => {
  const definition = { sections: [{ id: "s", title: "S", questions: [
    { id: "sin", type: "short_text", label: "SIN", required: false, input_format: { kind: "national_id", region: "CA" } },
    { id: "plain", type: "short_text", label: "Notes" }] }] };
  const issues = logic.answerIssues(new logic.QuestionnaireContext(definition, { sin: "123 456 789", plain: "anything" }));
  assert.deepEqual(issues.map((i) => [i.questionId, i.message]), [["sin", "Enter a valid 9-digit Social Insurance Number."]]);
  assert.deepEqual(logic.answerIssues(new logic.QuestionnaireContext(definition, {})), []);
});

test("a requiredness decision is neither a note nor a blocking issue", () => {
  const decision = { id: "r", kind: "requiredness", severity: "warning", title: "", reason: "", target: {}, targets: [], source: null, origin: "inferred", status: "open" };
  assert.equal(model.isNote(decision), false);
  assert.equal(model.isBlocking(decision), false);
  assert.equal(model.isLimitation(decision), false);
  assert.equal(model.isRequirednessDecision(decision), true);
  assert.deepEqual(model.creationBlockers([decision], [], "Name", false), []);
});
