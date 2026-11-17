import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readEventStream } from '../lib/event-stream.ts';

test('reads split frames, skips keep-alives and malformed data', async () => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"delta","text":"Hel'));
      controller.enqueue(encoder.encode('lo"}\n\n: keep-alive\n\ndata: nope\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"done","message":{"id":1}}\r\n\r\n'));
      controller.close();
    },
  });
  const events = [];
  await readEventStream(body, (e) => events.push(e));
  assert.deepEqual(events.map((e) => e.type), ['delta', 'done']);
  assert.equal(events[0].text, 'Hello');
});
