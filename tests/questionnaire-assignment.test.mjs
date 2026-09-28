import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const { assignableTemplates, summarizeAssignment, hasNewerVersion } = await import(new URL("../lib/questionnaire-assignment.ts", import.meta.url).href);
const { isGuardedNavigation } = await import(new URL("../lib/navigation-guard.ts", import.meta.url).href);
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const template = (id, name, extra = {}) => ({ id, name, archived_at: null, latest_published_version: 1, ...extra });

test("only active, published questionnaires are assignable", () => {
  const list = assignableTemplates([
    template(1, "Zeta"), template(2, "Draft", { latest_published_version: null }),
    template(3, "Old", { archived_at: "2026-01-01" }), template(4, "Alpha", { latest_published_version: 4 }),
  ]);
  assert.deepEqual(list.map((t) => t.id), [4, 1]);
});

test("assignment summary counts assigned, skipped by reason, and failed", () => {
  const summary = summarizeAssignment({
    template_id: 1, questionnaire_name: "Intake",
    assigned: [1, 2, 3],
    skipped: [{ client_id: 4, reason: "already_assigned" }, { client_id: 5, reason: "already_assigned" }, { client_id: 6, reason: "already_submitted" }],
    failed: [{ client_id: 7, detail: "Could not assign" }],
  });
  assert.equal(summary.headline, "Assigned to 3 clients.");
  assert.deepEqual(summary.details, [
    "Skipped: 2 already have this questionnaire.",
    "Skipped: 1 already completed it.",
    "Couldn't assign 1 client. Retrying won't duplicate anything already assigned.",
  ]);
  assert.equal(summarizeAssignment({ template_id: 1, questionnaire_name: "x", assigned: [], skipped: [{ client_id: 1, reason: "already_assigned" }], failed: [] }).headline,
    "No new assignments were needed.");
  assert.equal(summarizeAssignment({ template_id: 1, questionnaire_name: "x", assigned: [1], skipped: [], failed: [] }).headline, "Assigned to 1 client.");
});

test("an assignment offers an update only when a newer version is published", () => {
  const templates = [{ id: 9, latest_published_version: 3 }];
  assert.equal(hasNewerVersion({ template_id: 9, version_number: 2 }, templates), true);
  assert.equal(hasNewerVersion({ template_id: 9, version_number: 3 }, templates), false);
  assert.equal(hasNewerVersion({ template_id: 8, version_number: 1 }, templates), false);
  assert.equal(hasNewerVersion({ template_id: 9, version_number: 1 }, undefined), false);
});

test("the leave guard only intercepts plain in-app navigations away from the page", () => {
  const here = { href: "http://app.test/questionnaires/5", origin: "http://app.test", pathname: "/questionnaires/5", search: "" };
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
  const a = (href, attrs = {}) => ({ href: new URL(href, here.href).href, target: attrs.target ?? "", hasAttribute: (n) => n in attrs });
  assert.equal(isGuardedNavigation(a("/questionnaires"), click, here), true);
  assert.equal(isGuardedNavigation(a("/clients?tab=all"), click, here), true);
  assert.equal(isGuardedNavigation(a("/questionnaires/5#section"), click, here), false);
  assert.equal(isGuardedNavigation(a("https://example.com/"), click, here), false);
  assert.equal(isGuardedNavigation(a("/questionnaires", { target: "_blank" }), click, here), false);
  assert.equal(isGuardedNavigation(a("/file.pdf", { download: "" }), click, here), false);
  assert.equal(isGuardedNavigation(a("/questionnaires"), { ...click, metaKey: true }, here), false);
  assert.equal(isGuardedNavigation(a("/questionnaires"), { ...click, button: 1 }, here), false);
});

test("assignment dialogs never offer a version choice", () => {
  for (const path of ["components/assign-questionnaire-dialog.tsx", "app/questionnaires/page.tsx", "components/client-questionnaires-card.tsx"]) {
    const text = source(path);
    assert.doesNotMatch(text, /<option[^>]*>\s*Version|Published version<\/Label>|<Label>Version<\/Label>/, path);
  }
  const dialog = source("components/assign-questionnaire-dialog.tsx");
  assert.doesNotMatch(dialog, /listQuestionnaireVersions|version_id/);
  // Established context is never asked again.
  assert.match(dialog, /\{!template && <label/);
  assert.match(dialog, /\{!snapshot && <ClientPicker/);
});

test("Assign questionnaire sits directly beside Assign workflow in the Clients bulk toolbar", () => {
  const page = source("app/clients/page.tsx");
  const workflow = page.indexOf("<WorkflowIcon />");
  const questionnaire = page.indexOf("<QuestionnaireIcon />");
  const del = page.indexOf("<BulkDeleteClientsButton");
  assert.ok(workflow > 0 && workflow < questionnaire && questionnaire < del);
  // It reuses the table's selection, snapshotted when clicked, and passes it as fixed clients.
  assert.match(page, /onClick=\{\(\) => setQuestionnaireTargets\(Array\.from\(selectedIds\)\)\}/);
  assert.match(page, /clients=\{questionnaireTargets && \{ ids: questionnaireTargets \}\}/);
  assert.match(page, /disabled=\{selectedIds\.size === 0\}/);
});
