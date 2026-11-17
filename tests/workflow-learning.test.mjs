import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const apiUrl = new URL('../lib/api.ts', import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes('/lib/') && specifier.startsWith('./') && !specifier.endsWith('.ts')) {
      return nextResolve(specifier + '.ts', context);
    }
    return nextResolve(specifier, context);
  },
});
const { approveWorkflowRun, uploadCorrectedOutput, addWorkflowRunNote, updateWorkflowRule, deleteWorkflowRule } = await import(apiUrl);
hooks.deregister();

async function capture(action, reply = {}) {
  const originalFetch = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push(new Request(url, init));
    return reply === null ? new Response(null, { status: 204 }) : Response.json(reply);
  };
  try {
    await action();
  } finally {
    globalThis.fetch = originalFetch;
  }
  return seen;
}

test('a corrected file is uploaded as multipart to its output', async () => {
  const file = new File(['corrected'], 'report.xlsx');
  const [request] = await capture(() => uploadCorrectedOutput(3, 41, 9, file), { proposals: [] });
  assert.equal(new URL(request.url).pathname, '/clients/3/workflow-runs/41/outputs/9/correction');
  assert.equal(request.method, 'POST');
  const body = await request.formData();
  assert.equal(body.get('file').name, 'report.xlsx');
});

test('approve is one call, and undo deletes the approval', async () => {
  const [approve] = await capture(() => approveWorkflowRun(3, 41));
  const [undo] = await capture(() => approveWorkflowRun(3, 41, false));
  assert.deepEqual([approve.method, undo.method], ['POST', 'DELETE']);
  assert.equal(new URL(undo.url).pathname, '/clients/3/workflow-runs/41/approve');
});

test('notes and rule decisions send JSON to the learning endpoints', async () => {
  const [note] = await capture(() => addWorkflowRunNote(3, 41, 'Always round to whole dollars'), { proposals: [] });
  assert.equal(new URL(note.url).pathname, '/clients/3/workflow-runs/41/notes');
  assert.deepEqual(await note.json(), { text: 'Always round to whole dollars' });
  const [apply] = await capture(() => updateWorkflowRule(5, 12, { status: 'active', scope: 'client' }), { id: 12 });
  assert.equal(apply.method, 'PATCH');
  assert.equal(new URL(apply.url).pathname, '/workflows/5/rules/12');
  assert.deepEqual(await apply.json(), { status: 'active', scope: 'client' });
  const [remove] = await capture(() => deleteWorkflowRule(5, 12), null);
  assert.equal(remove.method, 'DELETE');
});
