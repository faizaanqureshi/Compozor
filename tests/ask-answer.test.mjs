import { test } from 'node:test';
import assert from 'node:assert/strict';
import { citationOrder, parseAnswer } from '../lib/ask-answer.ts';

test('splits paragraphs and list items and keeps citations inline', () => {
  const blocks = parseAnswer('Two clients owe a **T4** [[client:1]].\n\n- Priya, reminded Nov 3 [[email:9]]\n- Marcus [[client:2]]');
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks[0].segments, [
    { type: 'text', text: 'Two clients owe a ' },
    { type: 'text', text: 'T4', bold: true },
    { type: 'text', text: ' ' },
    { type: 'cite', key: 'client:1' },
    { type: 'text', text: '.' },
  ]);
  assert.equal(blocks[1].type, 'li');
  assert.deepEqual(blocks[1].segments.at(-1), { type: 'cite', key: 'email:9' });
});

test('half-streamed markers and bold stay as plain text', () => {
  const [block] = parseAnswer('Interest was $1,284 [[doc:4:p');
  assert.deepEqual(block.segments, [{ type: 'text', text: 'Interest was $1,284 [[doc:4:p' }]);
  assert.equal(parseAnswer('so **far')[0].segments[0].text, 'so **far');
});

test('numbers citations in first-use order', () => {
  assert.deepEqual(citationOrder('a [[doc:1:p2]] b [[email:3]] c [[doc:1:p2]]'), ['doc:1:p2', 'email:3']);
});

test('headings are flattened and numbered lists are ordered', () => {
  const blocks = parseAnswer('## Summary\n1. First\n2) Second');
  assert.equal(blocks[0].segments[0].text, 'Summary');
  assert.equal(blocks[1].ordered, true);
  assert.equal(blocks[2].segments[0].text, 'Second');
});
