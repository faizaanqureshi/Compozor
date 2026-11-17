import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deepLinkElementId, readClientDeepLink } from '../lib/deep-link.ts';

test('reads one target and ignores junk', () => {
  assert.deepEqual(readClientDeepLink('?doc=12'), { doc: 12 });
  assert.deepEqual(readClientDeepLink('?email=abc&run=-3'), {});
  assert.equal(deepLinkElementId(readClientDeepLink('?email=9')), 'email-9');
  assert.equal(deepLinkElementId({}), null);
});
