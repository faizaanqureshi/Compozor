import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLOBAL_STARTERS, scopedStarters } from '../lib/ask-starters.ts';

test('starters follow the page the panel is on', () => {
  assert.deepEqual(scopedStarters(null), GLOBAL_STARTERS);
  assert.match(scopedStarters({ kind: 'client', id: 1, label: 'Priya Raman', clientName: 'Priya Raman' })[0], /Priya,/);
  assert.equal(scopedStarters({ kind: 'run', id: 4, label: 'T1 prep · Nov 3' })[0], 'Why did this run need review?');
  assert.match(scopedStarters({ kind: 'email', id: 9, label: 'Re: T4', clientName: 'Marcus Lee' })[2], /Marcus/);
  assert.equal(scopedStarters({ kind: 'workflow', id: 2, label: 'T1 prep' }).length, 4);
});
