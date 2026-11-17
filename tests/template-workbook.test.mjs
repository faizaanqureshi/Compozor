import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cellField, cellSlotAt, displayRows, isWorkbookView, mergeSpans, tableField, tableSlotAt, workbookOccurrences,
} from '../lib/template-workbook.ts';

const sheet = {
  sheet: 'August 2026', hidden: false, columns: ['A', 'B', 'C', 'D'], widths: {}, merged: ['A1:D1', 'A20:A21'], truncated: false,
  rows: [
    { row: 1, cells: [{ col: 'A', t: 'Monthly expense report', b: true }] },
    { row: 2, cells: [{ col: 'A', t: 'Client: Oakridge Dental' }] },
    { row: 4, cells: [{ col: 'A', t: 'Date' }, { col: 'D', t: 'Amount' }] },
    { row: 5, cells: [{ col: 'A', t: '2026-08-02' }, { col: 'D', t: '1840.5', n: true }] },
    { row: 6, cells: [{ col: 'A', t: '2026-08-05' }, { col: 'D', t: '312.18', n: true }] },
    { row: 7, cells: [{ col: 'D', t: '=SUM(D5:D6)', f: true }] },
    { row: 20, cells: [{ col: 'A', t: 'Oakridge Dental' }] },
  ],
};
const view = { format: '.xlsx', sheets: [sheet] };
const slots = [
  { id: 'lines', label: 'Lines', kind: 'table_rows', sheet: 'August 2026', row: 5, count: 2 },
  { id: 'title', label: 'Title', kind: 'cell', sheet: 'August 2026', cell: 'A1' },
  { id: 'client', label: 'Client', kind: 'text', find: 'Oakridge Dental' },
];

test('workbook views are told apart from documents', () => {
  assert.equal(isWorkbookView(view), true);
  assert.equal(isWorkbookView({ format: '.docx', parts: [] }), false);
});

test('table and cell fields cover their rows and cell', () => {
  assert.equal(tableSlotAt('August 2026', 6, slots), 'lines');
  assert.equal(tableSlotAt('August 2026', 7, slots), undefined);
  assert.equal(tableSlotAt('Other', 5, slots), undefined);
  assert.equal(cellSlotAt('August 2026', 'A', 1, slots), 'title');
});

test('text fields count every cell they appear in', () => {
  assert.equal(workbookOccurrences(view, 'Oakridge Dental'), 2);
});

test('blank rows are kept, long gaps folded, title merges span columns', () => {
  const rows = displayRows(sheet);
  assert.deepEqual(rows.slice(2, 4).map((r) => r.row), [3, 4]);
  assert.deepEqual(rows.find((r) => 'gap' in r), { gap: 12, from: 8 });
  const { spans, covered } = mergeSpans(sheet);
  assert.equal(spans.get('A1'), 4);
  assert.equal(covered.has('C1'), true);
  assert.equal(spans.has('A20'), false);
});

test('picked rows and cells become fields, with the backend rules', () => {
  assert.deepEqual(tableField(sheet, 6, 5, []), { kind: 'table_rows', label: 'Table rows', sheet: 'August 2026', row: 5, count: 2 });
  assert.match(tableField(sheet, 6, 7, slots).error, /overlap/);
  assert.match(tableField(sheet, 1, 1, []).error, /below the table's header/);
  assert.match(tableField(sheet, 9, 12, []).error, /empty/);
  assert.match(cellField(sheet, 7, sheet.rows[5].cells[0], []).error, /Formulas/);
  assert.match(cellField(sheet, 20, sheet.rows[6].cells[0], slots).error, /Part of this cell/);
  assert.deepEqual(cellField(sheet, 4, sheet.rows[2].cells[1], []), { kind: 'cell', label: 'Amount', sheet: 'August 2026', cell: 'D4' });
});
