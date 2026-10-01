// Pure logic for the template editor's document view: where each field
// (slot) sits on the page, and turning a staff selection into a new field.
// Mirrors the backend's compile rules so highlights match what gets saved.

export type DocRun = { t?: string; b?: boolean; i?: boolean; u?: boolean; size?: number; color?: string; image?: boolean };
export type DocParagraph = {
  type: "p";
  index: number;
  runs: DocRun[];
  style?: { heading?: number; list?: boolean; align?: "center" | "right" | "justify" };
};
export type DocTable = { type: "table"; table: number; rows: { row: number; cells: DocParagraph[][] }[] };
export type DocBlock = DocParagraph | DocTable;
export type DocPart = { part: string; kind: "header" | "body" | "footer" | "slide"; label: string; blocks: DocBlock[] };
export type DocumentView = { format: string; parts: DocPart[] };

export type FieldSlot = {
  id?: string;
  label: string;
  kind: "text" | "list" | "table_rows";
  find?: string;
  part?: string;
  paragraph?: number;
  table?: number;
  row?: number;
  count?: number;
  [key: string]: unknown;
};

export type Range = { start: number; end: number; key: string };
export type Segment = { run: DocRun; text: string; key?: string };

// A stable identity for a slot, including new ones that have no id yet.
export function slotKey(slot: FieldSlot, index: number): string {
  return slot.id ?? `new-${index}`;
}

export function paragraphText(paragraph: DocParagraph): string {
  return paragraph.runs.map((run) => run.t ?? "").join("");
}

// Every occurrence of each text field, earlier fields winning overlaps,
// matching how the server replaces them in order.
export function textRanges(text: string, slots: FieldSlot[]): Range[] {
  const ranges: Range[] = [];
  slots.forEach((slot, index) => {
    if (slot.kind !== "text" || !slot.find) return;
    let from = 0;
    while (from <= text.length) {
      const at = text.indexOf(slot.find, from);
      if (at < 0) break;
      const end = at + slot.find.length;
      if (!ranges.some((r) => at < r.end && end > r.start)) ranges.push({ start: at, end, key: slotKey(slot, index) });
      from = end;
    }
  });
  return ranges.sort((a, b) => a.start - b.start);
}

// Split styled runs so each highlighted range becomes its own segment.
export function segments(runs: DocRun[], ranges: Range[]): Segment[] {
  const out: Segment[] = [];
  let offset = 0;
  for (const run of runs) {
    const text = run.t ?? "";
    if (!text) {
      if (run.image) out.push({ run, text: "" });
      continue;
    }
    const cuts = new Set<number>([0, text.length]);
    for (const r of ranges) {
      if (r.start > offset && r.start < offset + text.length) cuts.add(r.start - offset);
      if (r.end > offset && r.end < offset + text.length) cuts.add(r.end - offset);
    }
    const points = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < points.length - 1; i++) {
      const at = offset + points[i];
      const range = ranges.find((r) => at >= r.start && at < r.end);
      out.push({ run, text: text.slice(points[i], points[i + 1]), key: range?.key });
    }
    offset += text.length;
  }
  return out;
}

export function listSlotAt(part: string, paragraph: number, slots: FieldSlot[]): string | undefined {
  const index = slots.findIndex((s) => s.kind === "list" && s.part === part && s.paragraph !== undefined
    && paragraph >= s.paragraph && paragraph < s.paragraph + (s.count ?? 1));
  return index < 0 ? undefined : slotKey(slots[index], index);
}

export function rowSlotAt(part: string, table: number, row: number, slots: FieldSlot[]): string | undefined {
  const index = slots.findIndex((s) => s.kind === "table_rows" && s.part === part && s.table === table
    && s.row !== undefined && row >= s.row && row < s.row + (s.count ?? 1));
  return index < 0 ? undefined : slotKey(slots[index], index);
}

// How many times a phrase appears across the document (a text field replaces all).
export function occurrences(view: DocumentView, find: string): number {
  if (!find) return 0;
  let count = 0;
  const visit = (p: DocParagraph) => {
    const text = paragraphText(p);
    for (let at = text.indexOf(find); at >= 0; at = text.indexOf(find, at + find.length)) count++;
  };
  for (const part of view.parts) {
    for (const block of part.blocks) {
      if (block.type === "p") visit(block);
      else block.rows.forEach((row) => row.cells.forEach((cell) => cell.forEach(visit)));
    }
  }
  return count;
}

// A text selection becomes a field only when it sits in one paragraph and
// isn't already part of a field.
export function selectionField(selected: string, paragraphText: string, taken: Range[]): { find: string } | { error: string } {
  const find = selected.replace(/\s+$/, "").replace(/^\s+/, "");
  if (!find) return { error: "Select the text that changes for each client." };
  if (/[\r\n]/.test(find)) return { error: "Select text within one paragraph." };
  const at = paragraphText.indexOf(find);
  if (at < 0) return { error: "Select text within one paragraph." };
  if (taken.some((r) => at < r.end && at + find.length > r.start)) return { error: "That text is already part of a field." };
  return { find };
}

// Four clearly different hues from the chart palette. The brand near-black
// (chart-1) is left out: next to the dark teal it reads as the same color.
export const FIELD_COLORS = [
  { mark: "bg-chart-2/15 decoration-chart-2", block: "border-chart-2 bg-chart-2/10", dot: "bg-chart-2" },
  { mark: "bg-chart-4/20 decoration-chart-4", block: "border-chart-4 bg-chart-4/10", dot: "bg-chart-4" },
  { mark: "bg-chart-3/20 decoration-chart-3", block: "border-chart-3 bg-chart-3/10", dot: "bg-chart-3" },
  { mark: "bg-chart-5/40 decoration-chart-4", block: "border-chart-5 bg-chart-5/25", dot: "bg-chart-5" },
] as const;

export function fieldColor(slots: FieldSlot[], key: string) {
  const index = slots.findIndex((s, i) => slotKey(s, i) === key);
  return FIELD_COLORS[(index < 0 ? 0 : index) % FIELD_COLORS.length];
}
