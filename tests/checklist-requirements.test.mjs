import test from "node:test";
import assert from "node:assert/strict";
import { requirementChanged } from "../lib/checklist-requirements.ts";

test("name and description changes require fresh validation, deadline alone does not", () => {
  const item = { doc_type_needed: "Bank statement", description: "March 2026", expected_date_range_end: "2026-05-01" };
  assert.equal(requirementChanged(item, { ...item, description: "April 2026" }), true);
  assert.equal(requirementChanged(item, { ...item, doc_type_needed: "Tax return" }), true);
  assert.equal(requirementChanged(item, { ...item, expected_date_range_end: "2027-01-01" }), false);
  assert.equal(requirementChanged(item, { ...item, description: " March 2026 " }), false);
});
