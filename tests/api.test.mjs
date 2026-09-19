import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Match the extensionless imports resolved by Next when loading TS in Node.
const apiUrl = new URL('../lib/api.ts', import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === apiUrl && specifier === './sse') {
      return nextResolve('./sse.ts', context);
    }
    return nextResolve(specifier, context);
  },
});
const { resumeWorkflowRun, parseClientImportFile, getClientImport } = await import(apiUrl);
hooks.deregister();

test('resume sends context as application/json through the API request helper', async () => {
  const originalFetch = globalThis.fetch;
  const context = 'Resume with "corrected" extraction.\nKeep saved checkpoints.';
  const resumed = { id: 27, client_id: 1, status: 'queued' };
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    const request = new Request(url, init);
    assert.equal(new URL(request.url).pathname, '/clients/1/workflow-runs/27/resume');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('Content-Type'), 'application/json');
    assert.deepEqual(await request.json(), { context });
    return Response.json(resumed);
  };
  try {
    assert.deepEqual(await resumeWorkflowRun(1, 27, context), resumed);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test('client import uploads without manual mapping and polls the returned job', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, init) => {
    calls++;
    const request = new Request(url, init);
    if (calls === 1) {
      assert.equal(new URL(request.url).pathname, '/clients/import/parse');
      const form = await request.formData();
      assert.equal(form.get('file').name, 'clients.xlsx');
      assert.equal(form.has('column_mappings'), false);
      return Response.json({ status: 'processing', job_id: 'job123', total_batches: 3 });
    }
    assert.equal(new URL(request.url).pathname, '/clients/import/jobs/job123');
    return Response.json({ status: 'completed', rows: [{ name: 'Jane', email: 'jane@example.com' }] });
  };
  try {
    const job = await parseClientImportFile(new File(['fixture'], 'clients.xlsx'));
    assert.equal(job.status, 'processing');
    const result = await getClientImport(job.job_id);
    assert.equal(result.rows.length, 1);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
