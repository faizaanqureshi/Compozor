import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isToolFailure, summarizeToolStep, splitAttempts } from '../lib/agent-activity.ts';

test('failed or truncated completion results are not displayed as completed', () => {
  for (const result of ['{"error":"Wrong filename"}', '{"verification_failed":{"passed":false,"checks":[']) {
    const step = { tool: 'finish_workflow', round: 1, result };
    assert.equal(isToolFailure(step), true);
    assert.doesNotMatch(summarizeToolStep(step), /Completed|passed/);
  }
  assert.equal(summarizeToolStep({ tool: 'finish_workflow', round: 1, result: '{"status":"completed"}' }), 'Output checks passed');
});

test('JSON document listings and reads get accurate readable summaries', () => {
  assert.equal(summarizeToolStep({ tool: 'list_client_documents', round: 1, result: '[{"id":1,"filename":"source.pdf"}]' }), 'Found 1 document on file');
  assert.equal(summarizeToolStep({ tool: 'read_document', round: 2, result: '{"document_id":1,"units":[{"text":"truncated' }), 'Read a section of document 1');
});

test('automatic repair redirection does not claim staff review is needed', () => {
  const summary = summarizeToolStep({ tool: 'flag_for_review', round: 1, result: '{"status":"continue","reason":"' });
  assert.match(summary, /Continuing automatic repairs/);
  assert.match(summary, /no staff action needed/);
});

test('current attempt is separated from earlier resumed attempts', () => {
  const previous = { tool: 'plan_workflow', round: 0, started_at: '2026-09-19T05:17:00Z' };
  const current = { tool: 'plan_workflow', round: 0, started_at: '2026-09-19T05:52:00Z' };
  const live = { tool: 'execute_workflow', round: 1 };
  assert.deepEqual(splitAttempts([previous, current, live], '2026-09-19T05:51:59Z'), { previous: [previous], current: [current, live] });
  assert.equal(splitAttempts([previous, current]).current.length, 2);
});
