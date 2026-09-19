import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscribeSSE } from '../lib/sse.ts';

test('parses split CRLF frames, reconnects after EOF and refreshes auth', async () => {
  const original = globalThis.fetch;
  let requests = 0;
  let tokens = 0;
  const events = [];
  const encoder = new TextEncoder();
  globalThis.fetch = (async (_url, options) => {
    requests++;
    assert.equal((options?.headers).Authorization, `Bearer token${requests}`);
    return new Response(new ReadableStream({
      start(controller) {
        if (requests === 1) {
          controller.enqueue(encoder.encode('data: {"type":"one"}\r'));
          controller.enqueue(encoder.encode('\n\r\ndata: malformed\n\ndata: {"type":"two"}\n\n'));
          controller.close();
        } else {
          controller.enqueue(encoder.encode('data: {"type":"three"}\n\n'));
        }
      },
    }));
  });
  let unsubscribe = () => {};
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('reconnect timed out')), 4000);
      unsubscribe = subscribeSSE('https://test.local', async () => `token${++tokens}`, event => {
        events.push(event);
        if (events.length === 3) { clearTimeout(timeout); unsubscribe(); resolve(); }
      });
    });
    assert.deepEqual(events.map(e => e.type), ['one','two','three']);
    assert.equal(requests, 2);
  } finally {
    unsubscribe();
    globalThis.fetch = original;
  }
});

test('unsubscribe aborts failed-connect retry', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error('offline'); });
  let stop = () => {};
  try {
    await new Promise(resolve => {
      stop = subscribeSSE('https://test.local', async () => null, () => {}, () => { stop(); resolve(); });
    });
    await new Promise(resolve => setTimeout(resolve, 1300));
    assert.equal(calls, 1);
  } finally { stop(); globalThis.fetch = original; }
});
