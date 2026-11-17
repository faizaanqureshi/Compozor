// Pure logic for the template editor's workbook view: which cells and rows
// each field covers, and turning a staff pick into a new field. Mirrors the
// backend's xlsx compile rules so what is highlighted is what gets saved.

import type { FieldSlot } from "@/lib/template-document";

// Same identity as template-document's slotKey; kept local so this module
// has no runtime imports (the node test runner loads it directly).
function slotKey(slot: FieldSlot, index: number): string {
  return slot.id ?? `new-${index}`;
}

export type SheetCell = { col: string; t: string; f?: boolean; n?: boolean; b?: boolean; i?: boolean; align?: "center" | "right" };
export type SheetRow = { row: number; cells: SheetCell[] };
export type SheetView = {
  sheet: string;
  hidden: boolean;
  rows: SheetRow[];
  columns: string[];
  widths: Record<string, number>;
  merged: string[];
  truncated: boolean;
};
export type WorkbookView = { format: ".xlsx"; sheets: SheetView[] };

export function isWorkbookView(view: unknown): view is WorkbookView {
  return !!view && typeof view === "object" && Array.isArray((view as WorkbookView).sheets);
}

export function isFieldError(value: FieldSlot | { error: string }): value is { error: string } {
  return typeof (value as { error?: unknown }).error === "string";
}

export function columnIndex(column: string): number {
  return [...column.toUpperCase()].reduce((total, ch) => total * 26 + ch.charCodeAt(0) - 64, 0);
}

export function parseAddress(address: string): { col: string; row: number } | null {
  const match = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(address);
  return match ? { col: match[1].toUpperCase(), row: Number(match[2]) } : null;
}

// The table field whose example rows include this row.
export function tableSlotAt(sheet: string, row: number, slots: FieldSlot[]): string | undefined {
  const index = slots.findIndex((s) => s.kind === "table_rows" && s.sheet === sheet && typeof s.row === "number"
    && row >= s.row && row < s.row + (s.count ?? 1));
  return index < 0 ? undefined : slotKey(slots[index], index);
}

export function cellSlotAt(sheet: string, col: string, row: number, slots: FieldSlot[]): string | undefined {
  const address = `${col}${row}`;
  const index = slots.findIndex((s) => s.kind === "cell" && s.sheet === sheet
    && typeof s.cell === "string" && s.cell.toUpperCase().replace(/\$/g, "") === address);
  return index < 0 ? undefined : slotKey(slots[index], index);
}

// How many text cells a phrase appears in across the workbook (a text field replaces all).
export function workbookOccurrences(view: WorkbookView, find: string): number {
  if (!find) return 0;
  let count = 0;
  for (const sheet of view.sheets) {
    for (const row of sheet.rows) {
      for (const cell of row.cells) {
        if (cell.f) continue;
        for (let at = cell.t.indexOf(find); at >= 0; at = cell.t.indexOf(find, at + find.length)) count++;
      }
    }
  }
  return count;
}

// Rows to draw: every row up to the last populated one, so blank spacer rows
// keep the sheet's shape. Long gaps are folded to keep the view short.
export function displayRows(sheet: SheetView, maxGap = 3): (SheetRow | { gap: number; from: number })[] {
  const out: (SheetRow | { gap: number; from: number })[] = [];
  let previous = 0;
  for (const row of sheet.rows) {
    const missing = row.row - previous - 1;
    if (missing > maxGap) {
      out.push({ gap: missing, from: previous + 1 });
    } else {
      for (let r = previous + 1; r < row.row; r++) out.push({ row: r, cells: [] });
    }
    out.push(row);
    previous = row.row;
  }
  return out;
}

// Horizontal merges (a title across columns) become column spans; the cells
// they cover are skipped. Vertical merges show their text in the first row.
export function mergeSpans(sheet: SheetView): { spans: Map<string, number>; covered: Set<string> } {
  const spans = new Map<string, number>();
  const covered = new Set<string>();
  for (const ref of sheet.merged) {
    const [a, b] = ref.split(":").map(parseAddress);
    if (!a || !b) continue;
    const width = columnIndex(b.col) - columnIndex(a.col) + 1;
    if (a.row !== b.row || width < 2) continue;
    spans.set(`${a.col}${a.row}`, width);
    for (let c = columnIndex(a.col) + 1; c <= columnIndex(b.col); c++) covered.add(`${columnLetter(c)}${a.row}`);
  }
  return { spans, covered };
}

export function columnLetter(index: number): string {
  let out = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
}

// Picked rows become a repeating table: they must hold data, sit below a
// header, and not overlap another table.
export function tableField(sheet: SheetView, from: number, to: number, slots: FieldSlot[]): FieldSlot | { error: string } {
  const [first, last] = [Math.min(from, to), Math.max(from, to)];
  if (first < 2) return { error: "Pick the data rows below the table's header." };
  const populated = sheet.rows.filter((r) => r.row >= first && r.row <= last && r.cells.length > 0);
  if (populated.length === 0) return { error: "Those rows are empty." };
  if (slots.some((s) => s.kind === "table_rows" && s.sheet === sheet.sheet && typeof s.row === "number"
    && s.row <= last && first <= s.row + (s.count ?? 1) - 1)) {
    return { error: "Those rows overlap another table field." };
  }
  if (slots.some((s) => s.kind === "cell" && s.sheet === sheet.sheet && typeof s.cell === "string"
    && (parseAddress(s.cell)?.row ?? 0) >= first && (parseAddress(s.cell)?.row ?? 0) <= last)) {
    return { error: "A cell field sits in those rows. Remove it first." };
  }
  const count = last - first + 1;
  return { kind: "table_rows", label: count === 1 ? "Table row" : "Table rows", sheet: sheet.sheet, row: first, count };
}

// A whole cell becomes a field when it holds a single input value.
export function cellField(sheet: SheetView, row: number, cell: SheetCell, slots: FieldSlot[]): FieldSlot | { error: string } {
  if (cell.f) return { error: "Formulas stay as they are; they recalculate from the fields." };
  if (tableSlotAt(sheet.sheet, row, slots)) return { error: "This row is already part of a table field." };
  if (cellSlotAt(sheet.sheet, cell.col, row, slots)) return { error: "This cell is already a field." };
  if (slots.some((s) => s.kind === "text" && s.find && cell.t.includes(s.find))) {
    return { error: "Part of this cell is already a field." };
  }
  return { kind: "cell", label: cell.t.slice(0, 40) || `${cell.col}${row}`, sheet: sheet.sheet, cell: `${cell.col}${row}` };
}
