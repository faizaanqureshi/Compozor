import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Match the extensionless imports resolved by Next when loading TS in Node.
const apiUrl = new URL('../lib/api.ts', import.meta.url).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes('/lib/') && specifier.startsWith('./') && !specifier.endsWith('.ts')) {
      return nextResolve(specifier + '.ts', context);
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

test('Outlook connect includes browser credentials for its OAuth state cookie', async () => {
  const originalFetch = globalThis.fetch;
  const { getOutlookConnectUrl } = await import(apiUrl);
  globalThis.fetch = async (url, init) => {
    assert.equal(new URL(url).pathname, '/organizations/me/outlook/connect');
    assert.equal(init.credentials, 'include');
    return Response.json({authorization_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize'});
  };
  try {
    assert.match((await getOutlookConnectUrl()).authorization_url, /login.microsoftonline.com/);
  } finally { globalThis.fetch = originalFetch; }
});

for (const status of [409, 503]) {
  test(`ZIP download surfaces the server explanation for HTTP ${status}`, async () => {
    const originalFetch = globalThis.fetch;
    const { downloadClientDocumentsZip, ApiError } = await import(apiUrl);
    const detail = 'Cannot download all documents: "report.pdf" is missing from storage. No partial ZIP was downloaded.';
    globalThis.fetch = async () => Response.json({ detail }, { status });
    try {
      await assert.rejects(downloadClientDocumentsZip(1), (error) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.status, status);
        assert.equal(error.message, detail);
        return true;
      });
    } finally { globalThis.fetch = originalFetch; }
  });
}

test('ZIP download handles non-JSON proxy errors', async () => {
  const originalFetch = globalThis.fetch;
  const { downloadClientDocumentsZip } = await import(apiUrl);
  globalThis.fetch = async () => new Response('<html>Unavailable</html>', { status: 502, statusText: 'Bad Gateway' });
  try {
    await assert.rejects(downloadClientDocumentsZip(1), { message: '502 Bad Gateway' });
  } finally { globalThis.fetch = originalFetch; }
});

test('API string errors render without extra JSON quotes', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ detail: 'Reconnect this mailbox in Settings.' }, { status: 409 });
  try {
    await assert.rejects(resumeWorkflowRun(1, 2, 'test'), { message: 'Reconnect this mailbox in Settings.' });
  } finally { globalThis.fetch = originalFetch; }
});

async function withBrowser(clerk, path, run) {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const redirects = [];
  const url = new URL(path, 'https://www.compozor.com');
  globalThis.window = { Clerk: clerk, location: { pathname: url.pathname, search: url.search, replace: (url) => redirects.push(url) } };
  try { await run(redirects); }
  finally { globalThis.fetch = originalFetch; if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; }
}

for (const path of ['/sign-in?redirect_url=%2Fsign-in', '/sign-up/verify']) {
  test(`signed-out calls on ${path} neither fetch nor navigate`, () => withBrowser({ loaded: true }, path, async (redirects) => {
    let fetched = false;
    globalThis.fetch = async () => { fetched = true; return new Response('', { status: 401 }); };
    await assert.rejects(resumeWorkflowRun(1, 2, 'test'), { status: 401 });
    assert.equal(fetched, false);
    assert.deepEqual(redirects, []);
  }));
}

test('signed-out protected requests preserve the original destination without calling the API', () => withBrowser({ loaded: true }, '/clients/27?tab=files', async (redirects) => {
  globalThis.fetch = async () => assert.fail('must not send an anonymous private request');
  await assert.rejects(resumeWorkflowRun(1, 2, 'test'), { status: 401 });
  assert.deepEqual(redirects, ['/sign-in?redirect_url=%2Fclients%2F27%3Ftab%3Dfiles']);
}));

test('requests wait for Clerk initialization before obtaining a token', () => {
  const clerk = { loaded: false, async load() { await new Promise(r => setTimeout(r, 10)); this.loaded = true; this.session = { getToken: async () => 'ready-token' }; } };
  return withBrowser(clerk, '/onboarding', async (redirects) => {
    globalThis.fetch = async (_url, init) => { assert.equal(init.headers.get('Authorization'), 'Bearer ready-token'); return Response.json({ ok: true }); };
    assert.deepEqual(await resumeWorkflowRun(1, 2, 'test'), { ok: true });
    assert.deepEqual(redirects, []);
  });
});

test('expired tokens are refreshed once and the request body is retained', () => {
  let tokenCalls = 0;
  return withBrowser({ loaded: true, session: { async getToken(options) { tokenCalls++; if (tokenCalls === 2) assert.deepEqual(options, { skipCache: true }); return tokenCalls === 1 ? 'old' : 'fresh'; } } }, '/clients', async (redirects) => {
    let requests = 0;
    globalThis.fetch = async (_url, init) => {
      requests++;
      assert.deepEqual(JSON.parse(init.body), { context: 'resume' });
      assert.equal(init.headers.get('Authorization'), requests === 1 ? 'Bearer old' : 'Bearer fresh');
      return requests === 1 ? new Response('', { status: 401 }) : Response.json({ ok: true });
    };
    assert.deepEqual(await resumeWorkflowRun(1, 2, 'resume'), { ok: true });
    assert.equal(requests, 2);
    assert.deepEqual(redirects, []);
  });
});

test('persistent backend 401 with an active Clerk session is an error, not a navigation loop', () => withBrowser({ loaded: true, session: { getToken: async () => 'token' } }, '/clients', async (redirects) => {
  let requests = 0;
  globalThis.fetch = async () => { requests++; return Response.json({ detail: 'Not signed in' }, { status: 401 }); };
  await assert.rejects(resumeWorkflowRun(1, 2, 'test'), { status: 401, message: 'Not signed in' });
  assert.equal(requests, 2);
  assert.deepEqual(redirects, []);
}));

test('an expired Clerk session redirects once after the rejected request', () => {
  const clerk = { loaded: true, session: { getToken: async () => 'old' } };
  return withBrowser(clerk, '/clients', async (redirects) => {
    globalThis.fetch = async () => { clerk.session = undefined; return new Response('', { status: 401 }); };
    await assert.rejects(resumeWorkflowRun(1, 2, 'test'), { status: 401 });
    assert.deepEqual(redirects, ['/sign-in?redirect_url=%2Fclients']);
  });
});

test('an unavailable Clerk bootstrap never sends anonymous requests or redirects', () => withBrowser({ loaded: false }, '/onboarding', async (redirects) => {
  globalThis.fetch = async () => assert.fail('must wait for authentication');
  await assert.rejects(resumeWorkflowRun(1, 2, 'test'), { status: 503 });
  assert.deepEqual(redirects, []);
}));

test('a session temporarily returning no token does not trigger a sign-in loop', () => withBrowser({ loaded: true, session: { getToken: async () => null } }, '/clients', async (redirects) => {
  globalThis.fetch = async () => assert.fail('must not send a tokenless request');
  await assert.rejects(resumeWorkflowRun(1, 2, 'test'), { status: 401 });
  assert.deepEqual(redirects, []);
}));

test('a rejected mutation is never replayed under a newly selected account', () => {
  const clerk = { loaded: true, session: { getToken: async () => 'user-a-token' } };
  return withBrowser(clerk, '/clients', async (redirects) => {
    let requests = 0;
    globalThis.fetch = async () => {
      requests++;
      clerk.session = { getToken: async () => 'user-b-token' };
      return new Response('', { status: 401 });
    };
    await assert.rejects(resumeWorkflowRun(1, 2, 'test'), { status: 401 });
    assert.equal(requests, 1);
    assert.deepEqual(redirects, []);
  });
});

test("resend confirmation is structured and never enabled on a normal Send", async () => {
  const api = await import("../lib/api.ts");
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const requests = [];
  globalThis.window = { Clerk: { loaded: true, session: { getToken: async () => "test-token" } } };
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    if (requests.length === 1) return Response.json({ detail: { code: "confirm_resend", message: "Confirm sending again" } }, { status: 409 });
    return Response.json({ id: 2, status: "sent" });
  };
  try {
    await assert.rejects(api.sendEmailLogEntry(1, 2), error => error.status === 409 && error.code === "confirm_resend" && error.message === "Confirm sending again");
    assert.ok(requests[0].url.endsWith("/clients/1/email-log/2/send"));
    await api.sendEmailLogEntry(1, 2, true);
    assert.ok(requests[1].url.endsWith("/send?confirm_resend=true"));
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test('client facts use the replacement backend endpoints and retain conflict metadata', async () => {
  const api = await import('../lib/api.ts');
  const originalFetch = globalThis.fetch;
  const facts = [{ id: 12, statement: 'Address needs confirmation', status: 'conflict', verified: false }];
  const requests = [];
  globalThis.fetch = async (url, init) => {
    const request = new Request(url, init);
    requests.push([new URL(request.url).pathname, request.method]);
    return request.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json(facts);
  };
  try {
    assert.deepEqual(await api.listClientFacts(7), facts);
    await api.deleteClientFact(7, 12);
    assert.deepEqual(requests, [['/clients/7/facts', 'GET'], ['/clients/7/facts/12', 'DELETE']]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
