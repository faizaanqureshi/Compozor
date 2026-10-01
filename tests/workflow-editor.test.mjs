import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countWords, instructionTips, sampleFormat, startersFor } from '../lib/workflow-editor.ts';

test('starters follow the practice type and fall back to general ideas', () => {
  assert.equal(startersFor('Accounting')[0].name, 'Monthly bookkeeping close');
  assert.equal(startersFor('Immigration Consultant')[0].name, 'Case file summary');
  assert.equal(startersFor('Law Firm')[0].name, 'Closing summary');
  assert.equal(startersFor('Mortgage Broker')[0].name, 'Income verification');
  assert.equal(startersFor(null)[0].name, 'Document review report');
  assert.equal(startersFor('Dental clinic')[0].name, 'Document review report');
});

test('instruction tips notice outputs, sources, rules and length', () => {
  const empty = instructionTips('');
  assert.ok(empty.every((tip) => !tip.met));
  const text = 'Prepare an Excel workbook from the bank statements. Flag any transaction over $5,000. ' + 'word '.repeat(60);
  const met = Object.fromEntries(instructionTips(text).map((tip) => [tip.id, tip.met]));
  assert.deepEqual(met, { output: true, sources: true, rules: true, detail: true });
  assert.equal(countWords('  two   words '), 2);
  assert.equal(countWords(''), 0);
});

test('sample formats explain how each file is used', () => {
  assert.equal(sampleFormat('Report.DOCX').kind, 'word');
  assert.equal(sampleFormat('deck.pptx').kind, 'slides');
  assert.equal(sampleFormat('book.xlsx').kind, 'sheet');
  assert.equal(sampleFormat('scan.pdf').kind, 'rebuilt');
  assert.equal(sampleFormat('photo.jpeg').label, 'Image');
  assert.equal(sampleFormat('rows.csv').kind, 'data');
});

test('return paths stay inside the app', async () => {
  const { safeReturnPath } = await import('../lib/safe-return.ts');
  assert.equal(safeReturnPath('/clients', '/workflows'), '/clients');
  assert.equal(safeReturnPath(['/clients', '/x'], '/workflows'), '/clients');
  for (const bad of [undefined, '', 'https://evil.test', '//evil.test', '/\\evil.test', 'clients']) {
    assert.equal(safeReturnPath(bad, '/workflows'), '/workflows');
  }
});
