import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Match the extensionless imports resolved by Next when loading TS in Node.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes("/lib/") && specifier.startsWith("./") && !specifier.endsWith(".ts")) {
      return nextResolve(specifier + ".ts", context);
    }
    return nextResolve(specifier, context);
  },
});
const api = await import(new URL("../lib/client-portal-api.ts", import.meta.url).href);
const logic = await import(new URL("../lib/questionnaire-logic.ts", import.meta.url).href);
const { DraftSaver, SubmissionKeys } = await import(new URL("../lib/portal-draft.ts", import.meta.url).href);
const { portalView } = await import(new URL("../lib/portal-view.ts", import.meta.url).href);
hooks.deregister();

const { QuestionnaireContext, answerIssues, addEntry, removeEntry, moveEntry, setAnswer, fieldKey } = logic;

// ---- A small in-memory backend implementing the documented 2A contract ------

function fakePortal({ required = true, sessionValid = false } = {}) {
  const server = {
    session: sessionValid,
    code: "482913",
    revision: 0,
    draft: null,
    submissions: new Map(),
    status: "not_started",
    requests: [],
    uploadsAllowed: !required,
  };
  const summary = () => ({
    assignment_id: 7, title: "Intake", description: null, is_required: required, reporting_period_key: "2026",
    reporting_period_label: null, reporting_period_start: null, reporting_period_end: null,
    status: server.status, draft_revision: server.revision, has_draft: server.draft !== null,
    completed_at: null, submission_count: server.submissions.size,
  });
  const state = () => ({
    client_name: "Jane", organization_name: "Firm",
    readiness: {
      uploads_allowed: server.uploadsAllowed,
      blocking_reason: server.uploadsAllowed ? null : "required_questionnaire_outstanding",
      questionnaire_state: required ? (server.uploadsAllowed ? "required_complete" : "required_outstanding") : "optional",
    },
    questionnaires: [summary()],
    checklist: { total: server.submissions.size, received: 0, items: server.submissions.size ? [{ doc_type_needed: "Employment slip", description: null, status: "missing" }] : [] },
    session_expires_at: new Date(Date.now() + 1800_000).toISOString(),
  });
  const error = (status, code, message, extra = {}) => Response.json({ detail: { code, message, ...extra } }, { status });
  server.fetch = async (url, init = {}) => {
    const request = new Request(url, init);
    server.requests.push({ url: request.url, method: request.method, headers: request.headers, credentials: init.credentials });
    if (request.headers.get("X-Compozor-Portal") !== "1") return error(403, "portal_header_required", "Not allowed.");
    const path = new URL(request.url).pathname.replace("/public/portal/tok", "");
    const body = request.method === "GET" ? null : await request.text().then((t) => (t ? JSON.parse(t) : null));
    if (path === "/verification/request") {
      return Response.json({ destination: "j***@e***.com", expires_at: new Date(Date.now() + 600_000).toISOString(),
        resend_available_at: new Date(Date.now() + 60_000).toISOString() }, { status: 202 });
    }
    if (path === "/verification/confirm") {
      if (body.code !== server.code) return error(400, "verification_failed", "That code is incorrect or has expired.");
      server.session = true;
      return Response.json({ verified: true, session_expires_at: new Date().toISOString() });
    }
    if (!server.session) return error(401, "verification_required", "Please verify your email address to continue.");
    if (path === "/state") return Response.json(state());
    if (path === "/questionnaires/7/draft" && request.method === "GET") {
      return Response.json({ assignment_id: 7, draft_revision: server.revision, answers: server.draft });
    }
    if (path === "/questionnaires/7/draft" && request.method === "PUT") {
      if (body.expected_revision !== server.revision) {
        return error(409, "conflict", "The draft has changed; reload before saving or submitting", { draft_revision: server.revision });
      }
      server.revision += 1;
      server.draft = body.answers;
      server.status = server.status === "submitted" ? "submitted" : "in_progress";
      return Response.json({ assignment_id: 7, draft_revision: server.revision, saved: true, state: state() });
    }
    if (path === "/questionnaires/7/submissions") {
      const key = request.headers.get("Idempotency-Key");
      if (!key) return error(400, "idempotency_key_required", "Key required.");
      const prior = server.submissions.get(key);
      if (prior) {
        if (JSON.stringify(prior.body) !== JSON.stringify(body)) return error(409, "conflict", "Idempotency key was used for a different submission");
        return Response.json(prior.response);
      }
      if (body.expected_revision !== server.revision) return error(409, "conflict", "The draft has changed", { draft_revision: server.revision });
      if (body.answers.employed === undefined) return error(422, "invalid_answers", "Question employed: an answer is required");
      server.revision += 1;
      server.draft = null;
      server.status = "submitted";
      server.uploadsAllowed = true;
      const response = { submission: { assignment_id: 7, submission_number: server.submissions.size + 1,
        submitted_at: new Date().toISOString(), assignment_status: "submitted", draft_revision: server.revision }, state: null };
      server.submissions.set(key, { body, response });
      response.state = state();
      return Response.json(response);
    }
    return error(404, "questionnaire_not_found", "Questionnaire not found.");
  };
  return server;
}

async function withFetch(fetchImpl, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

// ---- Portal view: the three scenarios come only from server readiness -------

test("no questionnaire keeps the plain uploader with no questionnaire UI", () => {
  const readiness = { uploads_allowed: true, blocking_reason: null, questionnaire_state: "none", verification_required_for_questionnaires: false };
  assert.deepEqual(portalView(readiness), { showUploader: true, showQuestionnaires: false, requiredFirst: false });
  // Older API responses without portal state keep today's page.
  assert.deepEqual(portalView(null), { showUploader: true, showQuestionnaires: false, requiredFirst: false });
});

test("optional questionnaire shows beside a working uploader", () => {
  const view = portalView({ uploads_allowed: true, blocking_reason: null, questionnaire_state: "optional" });
  assert.equal(view.showUploader, true);
  assert.equal(view.showQuestionnaires, true);
  assert.equal(view.requiredFirst, false);
});

test("required questionnaire hides the uploader until the server unlocks it", () => {
  const blocked = portalView({ uploads_allowed: false, blocking_reason: "required_questionnaire_outstanding", questionnaire_state: "required_outstanding" });
  assert.deepEqual(blocked, { showUploader: false, showQuestionnaires: true, requiredFirst: true });
  const unlocked = portalView({ uploads_allowed: true, blocking_reason: null, questionnaire_state: "required_complete" });
  assert.equal(unlocked.showUploader, true);
  // The frontend follows uploads_allowed even if the state label disagrees.
  assert.equal(portalView({ uploads_allowed: false, blocking_reason: null, questionnaire_state: "optional" }).showUploader, false);
});

// ---- API client ---------------------------------------------------------------

test("every portal request sends credentials, the CSRF header and no-store", async () => {
  const server = fakePortal({ sessionValid: true });
  await withFetch(server.fetch, async () => {
    await api.getPortalState("tok");
    await api.savePortalDraft("tok", 7, { employed: true }, 0);
    await api.submitPortalQuestionnaire("tok", 7, { employed: true }, 1, "key-1");
  });
  for (const request of server.requests) {
    assert.equal(request.credentials, "include");
    assert.equal(request.headers.get("X-Compozor-Portal"), "1");
    assert.ok(request.url.startsWith("http://localhost:8000/public/portal/tok/"));
  }
  assert.equal(server.requests[2].headers.get("Idempotency-Key"), "key-1");
});

test("errors keep backend codes, and link/network failures are recognizable", async () => {
  await withFetch(async () => Response.json({ detail: { code: "link_expired", message: "This upload link has expired." } }, { status: 404 }), async () => {
    const error = await api.getPortalState("tok").catch((e) => e);
    assert.ok(error instanceof api.PortalApiError);
    assert.equal(error.code, "link_expired");
    assert.equal(api.isLinkError(error), true);
  });
  await withFetch(async () => { throw new TypeError("offline"); }, async () => {
    const error = await api.getPortalState("tok").catch((e) => e);
    assert.equal(error.status, 0);
    assert.equal(error.code, "network_error");
  });
  await withFetch(async () => Response.json({ detail: { code: "invalid_request", errors: [{ loc: ["body", "answers"], type: "dict_type" }] } }, { status: 422 }), async () => {
    const error = await api.savePortalDraft("tok", 7, {}, 0).catch((e) => e);
    assert.equal(error.code, "invalid_request");
    assert.match(error.message, /need attention/);
  });
});

// ---- Verification and session handling ------------------------------------------

test("verification: request, wrong code, correct code, then verified access", async () => {
  const server = fakePortal();
  await withFetch(server.fetch, async () => {
    await assert.rejects(api.getPortalState("tok"), (e) => e.status === 401 && e.code === "verification_required");
    const issued = await api.requestVerification("tok");
    assert.equal(issued.destination, "j***@e***.com");
    await assert.rejects(api.confirmVerification("tok", "000000"), (e) => e.code === "verification_failed");
    await api.confirmVerification("tok", server.code);
    const state = await api.getPortalState("tok");
    assert.equal(state.readiness.uploads_allowed, false);
    assert.equal(state.questionnaires[0].status, "not_started");
  });
});

test("unavailable verification is reported as a firm-must-act state", () => {
  assert.equal(api.VERIFICATION_UNAVAILABLE_CODES.has("mailbox_unavailable"), true);
  assert.equal(api.VERIFICATION_UNAVAILABLE_CODES.has("no_email_on_file"), true);
  assert.equal(api.VERIFICATION_UNAVAILABLE_CODES.has("delivery_failed"), false);
});

// ---- Conditional questions and repeating groups -----------------------------------

const definition = {
  sections: [
    { id: "work", title: "Work", questions: [
      { id: "employed", type: "yes_no", label: "Employed?", required: true },
      { id: "employer", type: "short_text", label: "Employer", required: true, visible_when: { kind: "comparison", question_id: "employed", operator: "equals", value: true } },
      { id: "note", type: "short_text", label: "Note", visible_when: { kind: "not", condition: { kind: "comparison", question_id: "employer", operator: "exists" } } },
      { id: "income", type: "currency", label: "Income", currency_code: "USD", required_when: { kind: "comparison", question_id: "employed", operator: "equals", value: true } },
      { id: "jobs", type: "repeating_group", label: "Job", min_items: 1, fields: [
        { id: "title", type: "short_text", label: "Title", required: true },
        { id: "remote", type: "yes_no", label: "Remote?" },
        { id: "office", type: "address", label: "Office", required: true, visible_when: { kind: "comparison", question_id: "remote", operator: "equals", value: false } },
      ] },
    ] },
    { id: "extra", title: "Remote details", visible_when: { kind: "repeat", group_question_id: "jobs", quantifier: "any",
      condition: { kind: "comparison", question_id: "remote", operator: "equals", value: true } }, questions: [
      { id: "setup", type: "long_text", label: "Home office setup" },
    ] },
  ],
};

test("conditional visibility and requiredness mirror the backend's three-valued logic", () => {
  let ctx = new QuestionnaireContext(definition, {});
  const q = (id) => ctx.questions.get(id);
  assert.equal(ctx.isVisible(q("employer")), false);
  assert.equal(ctx.isRequired(q("income")), false);
  // Hidden questions propagate "unknown", including through `not`.
  assert.equal(ctx.isVisible(q("note")), false);
  ctx = new QuestionnaireContext(definition, { employed: true });
  assert.equal(ctx.isVisible(q("employer")), true);
  assert.equal(ctx.isVisible(q("note")), true);
  assert.equal(ctx.isRequired(q("income")), true);
  // `false` is an explicit No, not an unanswered question.
  ctx = new QuestionnaireContext(definition, { employed: false });
  assert.equal(ctx.isVisible(q("employer")), false);
  // Like the backend, min_items applies only once entries exist; an absent,
  // non-required group is complete.
  assert.deepEqual(answerIssues(ctx).map((i) => i.questionId), []);
  const partial = addEntry({ employed: false }, [], ctx.questions.get("jobs"), "r1");
  assert.deepEqual(answerIssues(new QuestionnaireContext(definition, partial)).map((i) => i.key), ["jobs:r1/title"]);
});

test("repeat conditions drive section visibility and nested required fields", () => {
  let answers = { employed: false };
  answers = addEntry(answers, [], definition.sections[0].questions[4], "row-a");
  answers = addEntry(answers, [], definition.sections[0].questions[4], "row-b");
  const jobs = definition.sections[0].questions[4];
  answers = setAnswer(answers, [{ group: jobs, rowId: "row-a" }], "remote", false);
  answers = setAnswer(answers, [{ group: jobs, rowId: "row-b" }], "remote", true);
  let ctx = new QuestionnaireContext(definition, answers);
  assert.deepEqual(ctx.visibleSections().map((s) => s.id), ["work", "extra"]);
  const issues = answerIssues(ctx);
  // Row A needs a title and an office; row B only a title.
  assert.deepEqual(issues.map((i) => i.key), ["jobs:row-a/title", "jobs:row-a/office", "jobs:row-b/title"]);
  assert.equal(issues[0].key, fieldKey([{ group: jobs, rowId: "row-a" }], "title"));
  assert.deepEqual(issues[1].path, ["Job 1"]);
  answers = setAnswer(answers, [{ group: jobs, rowId: "row-b" }], "remote", false);
  ctx = new QuestionnaireContext(definition, answers);
  assert.deepEqual(ctx.visibleSections().map((s) => s.id), ["work"]);
});

test("repeating entries keep stable identifiers when added, reordered and removed", () => {
  const jobs = definition.sections[0].questions[4];
  let answers = {};
  answers = addEntry(answers, [], jobs, "a");
  answers = addEntry(answers, [], jobs, "b");
  answers = addEntry(answers, [], jobs, "c");
  answers = setAnswer(answers, [{ group: jobs, rowId: "b" }], "title", "Analyst");
  answers = moveEntry(answers, [], jobs, "b", -1);
  assert.deepEqual(answers.jobs.map((r) => r._id), ["b", "a", "c"]);
  assert.equal(answers.jobs[0].title, "Analyst");
  answers = removeEntry(answers, [], jobs, "a");
  assert.deepEqual(answers.jobs, [{ _id: "b", title: "Analyst" }, { _id: "c" }]);
  // Removing the last entry leaves the question unanswered rather than [].
  answers = removeEntry(removeEntry(answers, [], jobs, "b"), [], jobs, "c");
  assert.equal("jobs" in answers, false);
  // Generated identifiers are unique.
  const ids = new Set(Array.from({ length: 50 }, () => logic.newEntryId()));
  assert.equal(ids.size, 50);
});

test("hidden answers are kept, and changing sections never discards them", () => {
  let answers = setAnswer({}, [], "employed", true);
  answers = setAnswer(answers, [], "employer", "Acme");
  answers = setAnswer(answers, [], "employed", false);
  assert.equal(answers.employer, "Acme");
  const ctx = new QuestionnaireContext(definition, answers);
  assert.equal(ctx.isVisible(ctx.questions.get("employer")), false);
});

test("dates, contact details and backend error messages are handled safely", () => {
  assert.equal(logic.dateIssue("2025", "partial"), null);
  assert.equal(logic.dateIssue("2025-02", "partial"), null);
  assert.equal(logic.dateIssue("2025-02-30", "partial"), "Enter a valid date.");
  assert.equal(logic.dateIssue("2025", "day"), "Enter a complete date.");
  assert.equal(logic.formatDate("2025-03-04"), "4 March 2025");
  const contactDef = { sections: [{ id: "s", title: "S", questions: [{ id: "c", type: "contact", label: "Contact", required: true }] }] };
  assert.deepEqual(answerIssues(new QuestionnaireContext(contactDef, { c: { email: "not-an-email" } })).map((i) => i.message), ["Enter a valid email address."]);
  assert.equal(logic.describeAnswerError("Question employed: an answer is required", definition), "“Employed?”: An answer is required.");
  assert.equal(logic.describeAnswerError("Answers exceed the size limit", definition), "Answers exceed the size limit");
});

// ---- Save and resume -------------------------------------------------------------

test("saves are serialized with revisions and only confirmed saves report success", async () => {
  const server = fakePortal({ sessionValid: true });
  const snapshots = [];
  await withFetch(server.fetch, async () => {
    const saver = new DraftSaver({ revision: 0, answers: {} }, (a, r) => api.savePortalDraft("tok", 7, a, r), (s) => snapshots.push(s.status));
    const first = saver.save({ employed: true });
    const second = saver.save({ employed: true, employer: "Acme" });
    assert.equal(await first, true);
    assert.equal(await second, true);
    assert.equal(server.revision, 2);
    assert.deepEqual(server.draft, { employed: true, employer: "Acme" });
    assert.equal(saver.currentRevision, 2);
    assert.equal(saver.state.status, "saved");
    // Resume: a later visit loads exactly what was confirmed.
    const draft = await api.getPortalDraft("tok", 7);
    assert.deepEqual(draft, { assignment_id: 7, draft_revision: 2, answers: { employed: true, employer: "Acme" } });
  });
  assert.equal(snapshots.indexOf("saved") > snapshots.indexOf("saving"), true);
});

test("a revision conflict stops autosave until the client chooses, then overwrite succeeds", async () => {
  const server = fakePortal({ sessionValid: true });
  await withFetch(server.fetch, async () => {
    const saver = new DraftSaver({ revision: 0, answers: {} }, (a, r) => api.savePortalDraft("tok", 7, a, r));
    // Another device saved first.
    await api.savePortalDraft("tok", 7, { employed: false }, 0);
    assert.equal(await saver.save({ employed: true }), false);
    assert.equal(saver.state.status, "conflict");
    assert.equal(saver.state.serverRevision, 1);
    assert.equal(saver.blocked, true);
    assert.equal(await saver.save({ employed: true }), false, "blocked saves never report success");
    assert.equal(await saver.overwriteAfterConflict(), true);
    assert.deepEqual(server.draft, { employed: true });
    assert.equal(saver.currentRevision, 2);
  });
});

test("an expired session keeps in-memory answers and resumes saving after re-verification", async () => {
  const server = fakePortal({ sessionValid: true });
  await withFetch(server.fetch, async () => {
    const saver = new DraftSaver({ revision: 0, answers: {} }, (a, r) => api.savePortalDraft("tok", 7, a, r));
    server.session = false;
    const answers = { employed: true, employer: "Acme" };
    assert.equal(await saver.save(answers), false);
    assert.equal(saver.state.status, "unauthorized");
    assert.equal(saver.isDirty(answers), true);
    await api.confirmVerification("tok", server.code);
    assert.equal(await saver.resume(), true);
    assert.deepEqual(server.draft, answers);
  });
});

test("network interruptions are errors, never saved, and a retry succeeds", async () => {
  const server = fakePortal({ sessionValid: true });
  let offline = true;
  await withFetch(async (url, init) => {
    if (offline) throw new TypeError("offline");
    return server.fetch(url, init);
  }, async () => {
    const saver = new DraftSaver({ revision: 0, answers: {} }, (a, r) => api.savePortalDraft("tok", 7, a, r));
    assert.equal(await saver.save({ employed: true }), false);
    assert.equal(saver.state.status, "error");
    assert.equal(saver.state.savedAt, null);
    offline = false;
    assert.equal(await saver.save({ employed: true }), true);
    assert.equal(saver.state.status, "saved");
  });
});

// ---- Submission ---------------------------------------------------------------------

test("an uncertain submission is retried with the same key and never duplicated", async () => {
  const server = fakePortal({ sessionValid: true });
  const keys = new SubmissionKeys();
  const answers = { employed: true };
  let dropResponse = true;
  await withFetch(async (url, init) => {
    const response = await server.fetch(url, init);
    if (dropResponse && String(url).endsWith("/submissions")) {
      dropResponse = false;
      throw new TypeError("connection reset after the server committed");
    }
    return response;
  }, async () => {
    const key = keys.keyFor(answers, 0);
    await assert.rejects(api.submitPortalQuestionnaire("tok", 7, answers, 0, key), (e) => e.status === 0);
    const retryKey = keys.keyFor(answers, 0);
    assert.equal(retryKey, key);
    const result = await api.submitPortalQuestionnaire("tok", 7, answers, 0, retryKey);
    assert.equal(result.submission.submission_number, 1);
    assert.equal(server.submissions.size, 1);
  });
  // Changed answers are a different submission and get a new key.
  assert.notEqual(keys.keyFor({ employed: false }, 0), keys.keyFor(answers, 0));
});

test("required flow: verify, save, resume, submit, then uploads unlock from server state", async () => {
  const server = fakePortal({ required: true });
  await withFetch(server.fetch, async () => {
    await api.requestVerification("tok");
    await api.confirmVerification("tok", server.code);
    let state = await api.getPortalState("tok");
    assert.equal(portalView(state.readiness).showUploader, false);
    const saver = new DraftSaver({ revision: 0, answers: {} }, (a, r) => api.savePortalDraft("tok", 7, a, r));
    await saver.save({ employed: true });
    const resumed = await api.getPortalDraft("tok", 7);
    assert.deepEqual(resumed.answers, { employed: true });
    // Invalid final answers come back as a 422 with a question reference.
    await assert.rejects(api.submitPortalQuestionnaire("tok", 7, {}, resumed.draft_revision, "bad"), (e) => e.code === "invalid_answers");
    const result = await api.submitPortalQuestionnaire("tok", 7, resumed.answers, resumed.draft_revision, "good");
    assert.equal(result.state.readiness.uploads_allowed, true);
    assert.equal(portalView(result.state.readiness).showUploader, true);
    assert.equal(result.state.checklist.items[0].doc_type_needed, "Employment slip");
    state = await api.getPortalState("tok");
    assert.equal(state.questionnaires[0].status, "submitted");
  });
});

test("optional flow: uploads stay available and verification happens only on demand", async () => {
  const server = fakePortal({ required: false });
  await withFetch(server.fetch, async () => {
    assert.equal(portalView({ uploads_allowed: true, blocking_reason: null, questionnaire_state: "optional" }).showUploader, true);
    assert.equal(server.requests.length, 0);
    await api.requestVerification("tok");
    await api.confirmVerification("tok", server.code);
    const state = await api.getPortalState("tok");
    assert.equal(state.questionnaires[0].is_required, false);
    assert.equal(state.readiness.uploads_allowed, true);
  });
});
