import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listSlotAt, occurrences, rowSlotAt, segments, selectionField, textRanges,
} from '../lib/template-document.ts';

const slots = [
  { id: 'client', label: 'Client', kind: 'text', find: 'Jane Doe' },
  { id: 'doe', label: 'Surname', kind: 'text', find: 'Doe' },
  { id: 'tasks', label: 'Tasks', kind: 'list', part: 'word/document.xml', paragraph: 5, count: 3 },
  { id: 'rows', label: 'Rows', kind: 'table_rows', part: 'word/document.xml', table: 0, row: 1, count: 2 },
];

test('text fields mark every occurrence and earlier fields win overlaps', () => {
  const ranges = textRanges('Jane Doe met John Doe', slots);
  assert.deepEqual(ranges, [
    { start: 0, end: 8, key: 'client' },
    { start: 18, end: 21, key: 'doe' },
  ]);
});

test('segments split styled runs at field boundaries', () => {
  const runs = [{ t: 'Summary for Ja', b: true }, { t: 'ne Doe today' }];
  const parts = segments(runs, textRanges('Summary for Jane Doe today', slots.slice(0, 1)));
  assert.deepEqual(parts.map((s) => [s.text, s.key ?? null, !!s.run.b]), [
    ['Summary for ', null, true], ['Ja', 'client', true], ['ne Doe', 'client', false], [' today', null, false],
  ]);
});

test('list and table fields cover their paragraph and row ranges', () => {
  assert.equal(listSlotAt('word/document.xml', 6, slots), 'tasks');
  assert.equal(listSlotAt('word/document.xml', 8, slots), undefined);
  assert.equal(listSlotAt('word/header1.xml', 6, slots), undefined);
  assert.equal(rowSlotAt('word/document.xml', 0, 2, slots), 'rows');
  assert.equal(rowSlotAt('word/document.xml', 0, 0, slots), undefined);
});

test('selections become fields only inside one paragraph and outside existing fields', () => {
  const text = 'Your refund is $4,250.00 for Jane Doe.';
  const taken = textRanges(text, slots);
  assert.deepEqual(selectionField(' $4,250.00 ', text, taken), { find: '$4,250.00' });
  assert.ok('error' in selectionField('Jane', text, taken));
  assert.ok('error' in selectionField('refund\nis', text, taken));
  assert.ok('error' in selectionField('', text, taken));
  assert.ok('error' in selectionField('not here', text, taken));
});

test('occurrences count a phrase across paragraphs and table cells', () => {
  const p = (index, t) => ({ type: 'p', index, runs: [{ t }] });
  const view = { format: '.docx', parts: [{ part: 'word/document.xml', kind: 'body', label: 'Document', blocks: [
    p(0, 'Jane Doe and Jane Doe'),
    { type: 'table', table: 0, rows: [{ row: 0, cells: [[p(1, 'Jane Doe')]] }] },
  ] }] };
  assert.equal(occurrences(view, 'Jane Doe'), 3);
  assert.equal(occurrences(view, ''), 0);
});
