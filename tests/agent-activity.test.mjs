import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupActivity, isToolFailure, summarizeToolStep, splitAttempts } from '../lib/agent-activity.ts';

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


test('nested output checks show one pending row and one failure per submission', () => {
  const finish = { tool: 'finish_workflow', round: 5 };
  const verify = { tool: 'verify_workflow', round: 5 };
  const error = '{"error":"Text outside page bounds"}';
  for (const trace of [[finish], [finish, verify], [finish, { ...verify, result: error }],
    [{ ...finish, result: error }, { ...verify, result: error }]]) {
    const rows = groupActivity(trace);
    assert.equal(rows.length, 1);
    assert.equal(isToolFailure(rows[0]), trace.some(s => s.result === error));
  }
  assert.equal(summarizeToolStep(groupActivity([finish, verify])[0]), 'Checking generated outputs…');
  const fixed = [{ ...finish, round: 6, result: '{"status":"completed"}' },
    { ...verify, round: 6, result: 'Checks passed.' }];
  const rows = groupActivity([{ ...finish, result: error }, { ...verify, result: error }, ...fixed]);
  assert.equal(rows.length, 2);
  assert.equal(isToolFailure(rows[0]), true);
  assert.equal(summarizeToolStep(rows[1]), 'Output checks passed');
});

test('separate submissions in the same round and standalone checks stay visible', () => {
  const finish = { tool: 'finish_workflow', round: 5, result: '{"error":"Repair"}' };
  const verify = { tool: 'verify_workflow', round: 5, result: '{"error":"Repair"}' };
  assert.equal(groupActivity([finish, verify, finish, verify]).length, 2);
  assert.deepEqual(groupActivity([verify]), [verify]);
  assert.equal(groupActivity([finish, { tool: 'record_progress', round: 5, result: 'Saved' }, verify]).length, 3);
  assert.equal(groupActivity([finish, { ...verify, round: 6 }]).length, 2);
});

test('groups 23 Python operations into three rounds without changing audit history', () => {
  const trace = [9, 10, 4].flatMap((count, index) => [
    { tool: 'execute_workflow', round: index + 4, result: 'Workflow execution step received.' },
    ...Array.from({ length: count }, () => ({ tool: 'code_interpreter', round: index + 4, result: 'Python code' })),
  ]);
  const original = structuredClone(trace);
  const rows = groupActivity(trace);
  assert.deepEqual(rows.map(s => s.operationCount), [9, 10, 4]);
  assert.match(summarizeToolStep(rows[0]), /9 operations/);
  assert.deepEqual(trace, original);
});

test('processing groups retain pending and failure states and attempt boundaries', () => {
  const code = { tool: 'code_interpreter', round: 1, result: 'code' };
  const pending = { ...code, result: undefined };
  assert.equal(groupActivity([code, pending])[0].result, undefined);
  const error = { ...code, result: '{"error":"Python failed"}' };
  assert.equal(groupActivity([code, error, code]).length, 3);
  assert.equal(isToolFailure(groupActivity([code, error, code])[1]), true);
  assert.equal(groupActivity([code, { tool: 'plan_workflow', round: 0, result: 'New attempt' }, code]).length, 3);
});

test('cache progress belongs to its extraction even with the legacy wrong tool label', () => {
  const extraction = { tool: 'extract_transactions', round: 1, result: '{"records":717}' };
  const progress = { type: 'stage_progress', tool: 'extract_records', round: 1, result: 'Reused validated document cache.' };
  const rows = groupActivity([extraction, progress]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tool, 'extract_transactions');
  assert.equal(rows[0].progressMessage, progress.result);
  assert.equal(rows[0].result, extraction.result);
  const live = groupActivity([{ ...extraction, result: undefined }, progress]);
  assert.equal(live[0].result, undefined);
  assert.equal(live[0].progressMessage, progress.result);
  assert.equal(groupActivity([extraction, { ...progress, round: 2 }]).length, 2);
  assert.equal(groupActivity([extraction, { ...progress, type: 'tool_call_started' }]).length, 2);
  assert.deepEqual(groupActivity([progress]), [progress]);
});

test('structured summaries survive truncated results and keep complete repair details', async () => {
  const { activityDetails, activityDuration } = await import('../lib/agent-activity.ts');
  const step = { tool:'finish_workflow',round:1,result:'{"verification_failed":',
    started_at:'2026-09-20T09:00:00Z',completed_at:'2026-09-20T09:01:48Z',
    activity:{summary:'Output needs correction',details:['Monthly headings do not match table totals.'],failed:true} };
  assert.equal(summarizeToolStep(step),'Output needs correction');
  assert.deepEqual(activityDetails(step),step.activity.details);
  assert.equal(activityDuration(step),'1m 48s');
  assert.equal(isToolFailure(step),true);
});

test('legacy truncated reports and extractions show counts instead of raw JSON', () => {
  assert.equal(summarizeToolStep({round:1,tool:'extract_transactions',result:'{"dataset":"a.json","records":717,"reconciliation":['}), 'Extracted 717 transactions');
  assert.equal(summarizeToolStep({round:1,tool:'render_report',result:'{"filename":"report.pdf","pages":23,"tables":['}), 'Built 23-page PDF');
});

test('Python task summary is merged into its operations, not a duplicate row', () => {
  const trace = [{round:2,tool:'code_interpreter',result:'code'}, {round:2,tool:'code_interpreter',result:'code2'},
    {round:2,tool:'code_interpreter',type:'stage_progress',result:'Working files checkpointed.',
      activity:{summary:'Group records by month; build charts',details:['Saved: monthly.csv, chart.png']}}];
  const rows=groupActivity(trace);
  assert.equal(rows.length,1);
  assert.equal(rows[0].operationCount,2);
  assert.equal(summarizeToolStep(rows[0]),'Group records by month; build charts');
});

test('targeted review progress stays with its submission and preserves its finding', () => {
  const rows=groupActivity([
    {round:4,tool:'finish_workflow',result:'{"verification_failed":'},
    {round:4,tool:'verify_workflow',result:'["Wrong totals"]',activity:{summary:'Output needs correction',details:['Wrong totals'],failed:true}},
    {round:4,tool:'verify_workflow',type:'stage_progress',result:'Rechecking 2 affected requirements; reusing 7 unchanged checks.'},
  ]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].activity.details[0],'Wrong totals');
  assert.match(rows[0].progressMessage,/reusing 7/);
  assert.equal(isToolFailure(rows[0]),true);
});
