import test from 'node:test';
import assert from 'node:assert/strict';
import { groupClientWorkflows, assignmentReadiness } from '../lib/client-workflows.ts';

const assignment = { id: 7, workflow_id: 4, workflow_name: 'Report', workflow_archived: false,
  execution_mode: 'manual', ready: false, checklist_total: 2, checklist_remaining: 1 };

test('an assignment is visible without a first run', () => {
  const groups = groupClientWorkflows([], [assignment]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].assignment.id, 7);
  assert.deepEqual(groups[0].runs, []);
  assert.match(assignmentReadiness(assignment), /Waiting for 1 document requirement across/);
  assert.match(assignmentReadiness({...assignment, ready: true, checklist_remaining: 0}), /Ready to run/);
});

test('assignment metadata and historic runs merge without duplicate workflows', () => {
  const run = {id: 10, workflow_id: 4, workflow_name: 'Old name', workflow_archived: false, workflow_assignment_id: null};
  const historical = {id: 11, workflow_id: 9, workflow_name: 'Removed workflow', workflow_archived: true};
  const groups = groupClientWorkflows([run, historical], [assignment]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].workflowName, 'Report');
  assert.equal(groups[0].assignment.id, 7);
  assert.equal(groups[0].runs[0].id, 10);
  assert.equal(groups[1].assignment, undefined);
});

test('readiness distinguishes absent requirements, automation, and archive', () => {
  assert.match(assignmentReadiness({...assignment, checklist_total: 0}), /Add document requirements/);
  assert.match(assignmentReadiness({...assignment, ready: true, execution_mode: 'auto'}), /automatically/);
  assert.equal(assignmentReadiness({...assignment, workflow_archived: true}), 'Workflow deleted');
});
