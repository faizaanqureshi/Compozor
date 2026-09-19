import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSnapshotRefresh } from '../lib/snapshot-refresh.ts';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

test('event bursts and polling share one read, with one trailing read during a slow request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = [], values = [];
  const controller = createSnapshotRefresh({
    read: () => { const request = deferred(); requests.push(request); return request.promise; },
    onValue: value => values.push(value),
    onError: assert.fail,
  });
  t.after(() => controller.stop());
  for (let i = 0; i < 50; i++) controller.refresh();
  t.mock.timers.tick(200);
  assert.equal(requests.length, 1);
  for (let i = 0; i < 50; i++) controller.refresh();
  t.mock.timers.tick(5000);
  assert.equal(requests.length, 1, 'no overlapping reads');
  requests[0].resolve([{ status: 'running' }]);
  await flush();
  t.mock.timers.tick(200);
  assert.equal(requests.length, 2);
  requests[1].resolve([{ status: 'completed' }]);
  await flush();
  t.mock.timers.tick(5000);
  assert.equal(requests.length, 2, 'burst produces only one follow-up');
  assert.deepEqual(values, [[{ status: 'running' }], [{ status: 'completed' }]]);
});

test('unchanged snapshots do not update React state, while progress changes do', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let step = 1;
  const values = [];
  const controller = createSnapshotRefresh({
    read: async () => [{ id: 1, step }],
    onValue: value => values.push(value), onError: assert.fail,
  });
  t.after(() => controller.stop());
  for (let i = 0; i < 3; i++) {
    controller.refresh(); t.mock.timers.tick(200); await flush();
  }
  assert.equal(values.length, 1);
  step = 2;
  controller.refresh(); t.mock.timers.tick(200); await flush();
  assert.deepEqual(values, [[{ id: 1, step: 1 }], [{ id: 1, step: 2 }]]);
});

test('unmount/client change cancels queued reads and discards late responses', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const request = deferred();
  let reads = 0;
  const controller = createSnapshotRefresh({
    read: () => { reads++; return request.promise; },
    onValue: () => assert.fail('stale response applied'), onError: assert.fail,
  });
  controller.refresh(); t.mock.timers.tick(200);
  controller.refresh(); controller.stop();
  request.resolve(['old client']); await flush();
  controller.refresh(); t.mock.timers.tick(10000);
  assert.equal(reads, 1);

  const queued = createSnapshotRefresh({ read: async () => assert.fail('cancelled read started'), onValue: assert.fail, onError: assert.fail });
  queued.refresh(); queued.stop(); t.mock.timers.tick(200);
});

test('a failed request does not wedge subsequent progress refreshes', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = [], errors = [], values = [];
  const controller = createSnapshotRefresh({
    read: () => { const request = deferred(); requests.push(request); return request.promise; },
    onValue: value => values.push(value), onError: error => errors.push(error.message),
  });
  t.after(() => controller.stop());
  controller.refresh(); t.mock.timers.tick(200);
  controller.refresh(); requests[0].reject(new Error('offline')); await flush();
  t.mock.timers.tick(200);
  requests[1].resolve(['reconnected']); await flush();
  assert.deepEqual(errors, ['offline']);
  assert.deepEqual(values, [['reconnected']]);
});

test('initial fetch starts immediately while subsequent invalidations remain batched', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = [];
  const controller = createSnapshotRefresh({
    read: () => { const request = deferred(); requests.push(request); return request.promise; },
    onValue: () => {}, onError: assert.fail,
  });
  t.after(() => controller.stop());
  controller.refresh({ immediate: true });
  assert.equal(requests.length, 1, 'first load has no timer delay');
  requests[0].resolve([]); await flush();
  controller.refresh(); controller.refresh();
  assert.equal(requests.length, 1);
  t.mock.timers.tick(200);
  assert.equal(requests.length, 2);
  controller.refresh({ immediate: true });
  assert.equal(requests.length, 2, 'immediate refresh cannot overlap an active read');
  requests[1].resolve([]); await flush();
  t.mock.timers.tick(200);
  assert.equal(requests.length, 3);
});
