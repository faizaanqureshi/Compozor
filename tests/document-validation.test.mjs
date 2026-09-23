import test from "node:test";
import assert from "node:assert/strict";
import { documentValidation } from "../lib/document-validation.ts";

test("each document keeps its own result regardless of newer uploads", () => {
  assert.equal(documentValidation({ validation_status: "accepted" }).label, "Correct · Collected");
  assert.equal(documentValidation({ validation_status: "mismatch" }).label, "Incorrect · Replacement needed");
  assert.equal(documentValidation({ validation_status: "supplementary" }).label, "Other document");
});
test("unfinished validation is explicit and carries its reason", () => {
  const result = documentValidation({ validation_status: "needs_review", validation_reasons: ["Wrong year", null, 5] });
  assert.equal(result.label, "Unable to validate");
  assert.deepEqual(result.reasons, ["Wrong year"]);
  assert.equal(documentValidation({ validation_status: "processing" }).label, "Validating");
  assert.equal(documentValidation(null).label, "Not validated");
});
