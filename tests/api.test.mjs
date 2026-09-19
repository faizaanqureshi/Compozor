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
const { resumeWorkflowRun } = await import(apiUrl);
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
