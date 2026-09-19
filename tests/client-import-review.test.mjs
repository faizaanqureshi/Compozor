import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialImportReviewOrder, reviewImportRows } from '../lib/client-import-review.ts';

const row = (index, overrides = {}) => ({name: `Client ${index}`, email: `client${index}@example.com`, phone: '', company_name: '', is_duplicate: false, duplicate_reason: null, included: true, source: `Sheet, row ${index}`, email_error: false, ...overrides});

test('brings errors from the end of a 1500-row file to the first page, then ready rows and duplicates', () => {
  const rows = Array.from({length: 1500}, (_, i) => row(i));
  rows[1497].name = '';
  rows[1498].email_error = true;
  rows[1499].email = rows[0].email;
  const order = initialImportReviewOrder(rows, [rows[1].email]);
  assert.deepEqual(order.slice(0, 4), [1497, 1498, 0, 2]);
  assert.deepEqual(order.slice(-2), [1, 1499]);
  assert.equal(new Set(order).size, 1500);
  assert.equal(rows[0].name, 'Client 0');
});

test('correcting the first displayed row preserves its source identity and duplicate ownership', () => {
  const rows = [row(0), row(1), row(2, {name: ''})];
  const order = initialImportReviewOrder(rows, []);
  rows[order[0]] = {...rows[order[0]], name: 'Corrected', email: rows[0].email};
  const reviewed = reviewImportRows(rows, []);
  assert.deepEqual(order, [2, 0, 1]);
  assert.equal(reviewed[order[0]].name, 'Corrected');
  assert.equal(reviewed[0].is_duplicate, false);
  assert.equal(reviewed[2].is_duplicate, true);
  rows[0].included = false;
  assert.equal(reviewImportRows(rows, [])[2].is_duplicate, false);
});
