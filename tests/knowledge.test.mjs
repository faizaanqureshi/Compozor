import test from "node:test";
import assert from "node:assert/strict";
import { KNOWLEDGE_EXAMPLES, audienceLabel, canSaveAsKnowledge, updatedLabel } from "../lib/knowledge.ts";

const reply = (extra = {}) => ({
  direction: "outbound",
  status: "sent",
  thread_id: "t1",
  content: "It's $400 for a couple.",
  safety_checks: { category: "routine_answer" },
  ...extra,
});

test("only sent replies a person could reuse offer Save answer", () => {
  assert.equal(canSaveAsKnowledge(reply()), true);
  assert.equal(canSaveAsKnowledge(reply({ safety_checks: { category: "unknown" } })), true);
  assert.equal(canSaveAsKnowledge(reply({ safety_checks: null })), true);
  assert.equal(canSaveAsKnowledge(reply({ direction: "inbound" })), false);
  assert.equal(canSaveAsKnowledge(reply({ status: "draft" })), false);
  assert.equal(canSaveAsKnowledge(reply({ thread_id: null })), false);
  assert.equal(canSaveAsKnowledge(reply({ content: "  " })), false);
  for (const category of ["reminder", "receipt", "portal_invitation", "checklist_update"]) {
    assert.equal(canSaveAsKnowledge(reply({ safety_checks: { category } })), false, category);
  }
});

test("empty state offers fees, hours and holiday closures", () => {
  assert.deepEqual(KNOWLEDGE_EXAMPLES.map((e) => e.title), ["Fees", "Office hours", "Holiday closures"]);
  assert.equal(audienceLabel("clients"), "Clients");
  assert.equal(audienceLabel("internal"), "Internal");
});

test("updated label is relative for recent edits", () => {
  const now = new Date("2026-11-17T15:00:00");
  assert.equal(updatedLabel("2026-11-17T09:00:00", now), "Today");
  assert.equal(updatedLabel("2026-11-16T09:00:00", now), "Yesterday");
  assert.equal(updatedLabel("2026-11-13T09:00:00", now), "4 days ago");
  assert.match(updatedLabel("2025-03-02T09:00:00", now), /2025/);
});
