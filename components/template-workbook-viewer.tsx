"use client";

import { useRef, useState } from "react";
import { Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { fieldColor, segments, selectionField, slotKey, textRanges, type FieldSlot } from "@/lib/template-document";
import {
  cellField,
  cellSlotAt,
  displayRows,
  isFieldError,
  mergeSpans,
  overflowSpans,
  tableField,
  tableSlotAt,
  type SheetCell,
  type SheetView,
  type WorkbookView,
} from "@/lib/template-workbook";
import { Button } from "@/components/ui/button";

type Pick = { top: number; left: number } & ({ slot: FieldSlot; action: string } | { error: string });

// Excel width units are roughly characters of the default font.
function columnWidth(sheet: SheetView, column: string) {
  const width = sheet.widths[column] ?? 8.43;
  return `${Math.round(Math.min(60, Math.max(3, width)) * 7 + 5)}px`;
}

// The template's source workbook drawn as a grid, with every field tinted.
// Staff select text in a cell or click a cell to make it a field, or pick row
// numbers to make those rows repeat for each record.
export function TemplateWorkbookViewer({ view, slots, active, onActivate, onCreate }: {
  view: WorkbookView;
  slots: FieldSlot[];
  active: string | null;
  onActivate: (key: string) => void;
  onCreate: (slot: FieldSlot) => void;
}) {
  const page = useRef<HTMLDivElement>(null);
  const visible = view.sheets.filter((s) => !s.hidden);
  const [sheetName, setSheetName] = useState(visible[0]?.sheet ?? view.sheets[0]?.sheet);
  const [pick, setPick] = useState<Pick | null>(null);
  const [rows, setRows] = useState<{ from: number; to: number } | null>(null);
  const sheet = view.sheets.find((s) => s.sheet === sheetName) ?? view.sheets[0];
  if (!sheet) return <p className="p-6 text-sm text-muted-foreground">This workbook has no sheets.</p>;
  const merged = mergeSpans(sheet);
  const overflow = overflowSpans(sheet, merged);

  const position = (box: DOMRect) => {
    const origin = page.current!.getBoundingClientRect();
    return { top: box.bottom - origin.top + page.current!.scrollTop + 6, left: Math.max(8, box.left - origin.left) };
  };

  const onCellUp = (event: React.MouseEvent, row: number, cell: SheetCell) => {
    const selection = window.getSelection();
    const element = event.currentTarget as HTMLElement;
    setRows(null);
    if (selection && !selection.isCollapsed) {
      const inside = (node: Node | null) => !!node && element.contains(node);
      const at = position(selection.getRangeAt(0).getBoundingClientRect());
      if (!inside(selection.anchorNode) || !inside(selection.focusNode)) {
        setPick({ ...at, error: "Select text within one cell." });
        return;
      }
      const field = cell.f ? { error: "Formulas stay as they are." } : selectionField(selection.toString(), cell.t, textRanges(cell.t, slots));
      setPick({ ...at, ...("find" in field
        ? { slot: { kind: "text", find: field.find, label: field.find.slice(0, 40) } as FieldSlot, action: "Make a field" }
        : field) });
      return;
    }
    const field = cellField(sheet, row, cell, slots);
    const at = position(element.getBoundingClientRect());
    setPick(isFieldError(field) ? { ...at, error: field.error } : { ...at, slot: field, action: "Make this cell a field" });
  };

  const pickRow = (row: number, extend: boolean) => {
    setPick(null);
    setRows((current) => (extend && current ? { from: Math.min(current.from, row), to: Math.max(current.to, row) } : { from: row, to: row }));
  };

  const tableKeys = [...new Set(sheet.rows.map((r) => tableSlotAt(sheet.sheet, r.row, slots)).filter(Boolean))] as string[];
  const picked = rows ? tableField(sheet, rows.from, rows.to, slots) : null;

  const renderCell = (row: number, column: string, cell: SheetCell | undefined, tableKey: string | undefined) => {
    const address = `${column}${row}`;
    if (merged.covered.has(address) || overflow.covered.has(address)) return null;
    const span = merged.spans.get(address) ?? overflow.spans.get(address);
    const cellKey = cell ? cellSlotAt(sheet.sheet, column, row, slots) : undefined;
    const ranges = cell && !cell.f ? textRanges(cell.t, slots) : [];
    return (
      <td
        key={column}
        colSpan={span}
        data-field={cellKey}
        onMouseUp={cell && !tableKey && !cellKey ? (e) => onCellUp(e, row, cell) : undefined}
        onClick={cellKey ? () => onActivate(cellKey) : undefined}
        className={cn("max-w-0 truncate border border-border/70 px-1.5 py-0.5 align-top",
          cell?.n && "text-right tabular-nums", cell?.align === "center" && "text-center", cell?.align === "right" && "text-right",
          cell?.b && "font-semibold", cell?.i && "italic", cell?.f && "text-muted-foreground",
          cellKey && cn("cursor-pointer", fieldColor(slots, cellKey).block, active === cellKey && "ring-2 ring-inset ring-foreground/40"),
          cell && !tableKey && !cellKey && "cursor-text")}
        title={cell?.t}
      >
        {cell && (ranges.length === 0 ? cell.t : segments([{ t: cell.t }], ranges).map((segment, i) => {
          if (!segment.key) return <span key={i}>{segment.text}</span>;
          const key = segment.key;
          return (
            <mark
              key={i}
              data-field={key}
              onClick={() => onActivate(key)}
              className={cn("cursor-pointer rounded-sm px-0.5 text-inherit underline decoration-2 underline-offset-4",
                fieldColor(slots, key).mark, active === key && "ring-2 ring-foreground/50")}
            >
              {segment.text}
            </mark>
          );
        }))}
      </td>
    );
  };

  return (
    <div ref={page} className="relative flex flex-col gap-4 px-4 py-6 sm:px-8">
      {view.sheets.length > 1 && (
        <div role="tablist" aria-label="Sheets" className="flex flex-wrap gap-1">
          {view.sheets.map((s) => (
            <Button key={s.sheet} type="button" role="tab" aria-selected={s.sheet === sheet.sheet} size="sm"
              variant={s.sheet === sheet.sheet ? "secondary" : "ghost"}
              onClick={() => { setSheetName(s.sheet); setPick(null); setRows(null); }}>
              {s.sheet}{s.hidden && <span className="text-muted-foreground"> · hidden</span>}
            </Button>
          ))}
        </div>
      )}

      {tableKeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tableKeys.map((key) => {
            const slot = slots[slots.findIndex((s, i) => slotKey(s, i) === key)];
            return (
              <button key={key} type="button" onClick={() => onActivate(key)}
                className="inline-flex max-w-full items-center gap-1.5 rounded-4xl bg-card px-2 py-0.5 text-[0.6875rem] text-foreground/80 ring-1 ring-foreground/15 hover:ring-foreground/40">
                <span className={cn("size-1.5 shrink-0 rounded-full", fieldColor(slots, key).dot)} aria-hidden />
                <span className="truncate">{slot?.label || "Table"} · rows {String(slot?.row)}–{Number(slot?.row) + Number(slot?.count ?? 1) - 1}, one row per record; totals and charts follow</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="overflow-x-auto rounded-sm bg-card shadow-sm ring-1 ring-foreground/10">
        <table className="w-max min-w-full table-fixed border-collapse text-[0.75rem] leading-snug text-card-foreground">
          <colgroup>
            <col style={{ width: "2.75rem" }} />
            {sheet.columns.map((c) => <col key={c} style={{ width: columnWidth(sheet, c) }} />)}
          </colgroup>
          <thead>
            <tr className="bg-muted/60 text-[0.6875rem] text-muted-foreground">
              <th className="border border-border/70" />
              {sheet.columns.map((c) => <th key={c} className="border border-border/70 font-normal">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {displayRows(sheet).map((entry) => {
              if ("gap" in entry) {
                return (
                  <tr key={`gap-${entry.from}`}>
                    <td colSpan={sheet.columns.length + 1} className="border border-border/70 px-2 py-0.5 text-center text-[0.6875rem] text-muted-foreground">
                      {entry.gap} empty rows
                    </td>
                  </tr>
                );
              }
              const tableKey = tableSlotAt(sheet.sheet, entry.row, slots);
              const inPick = rows && entry.row >= Math.min(rows.from, rows.to) && entry.row <= Math.max(rows.from, rows.to);
              const byColumn = new Map(entry.cells.map((c) => [c.col, c]));
              return (
                <tr key={entry.row} data-field={tableKey}
                  onClick={tableKey ? () => onActivate(tableKey) : undefined}
                  className={cn(tableKey && cn("cursor-pointer", fieldColor(slots, tableKey).block),
                    inPick && "bg-foreground/5")}>
                  <th scope="row" className={cn("border border-border/70 bg-muted/60 p-0 text-[0.6875rem] font-normal text-muted-foreground",
                    ((tableKey && active === tableKey) || inPick) && "bg-foreground/15 font-medium text-foreground")}>
                    {tableKey ? entry.row : (
                      <button type="button" className="h-full w-full px-1 py-0.5 hover:bg-muted hover:text-foreground"
                        title="Select rows to repeat for each record (shift-click to extend)"
                        aria-label={`Select row ${entry.row} to repeat`}
                        onClick={(e) => pickRow(entry.row, e.shiftKey)}>
                        {entry.row}
                      </button>
                    )}
                  </th>
                  {sheet.columns.map((column) => renderCell(entry.row, column, byColumn.get(column), tableKey))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {sheet.truncated && <p className="text-xs text-muted-foreground">Only the first 300 rows are shown. Download the template to see the rest.</p>}

      {pick && (
        <div className="absolute z-10 flex items-center gap-2 rounded-lg bg-popover p-1.5 text-xs shadow-md ring-1 ring-foreground/10" style={{ top: pick.top, left: pick.left }}>
          {"slot" in pick ? (
            <Button type="button" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => { onCreate(pick.slot); setPick(null); window.getSelection()?.removeAllRanges(); }}>
              <Plus />
              {pick.action}
            </Button>
          ) : (
            <span className="px-2 text-muted-foreground">{pick.error}</span>
          )}
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => setPick(null)}><X className="size-3.5" /></Button>
        </div>
      )}

      {rows && picked && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 self-center rounded-xl bg-popover px-4 py-2.5 text-sm shadow-md ring-1 ring-foreground/10">
          <span className="text-muted-foreground">
            {isFieldError(picked) ? picked.error : `Rows ${String(picked.row)}–${Number(picked.row) + Number(picked.count) - 1} selected · shift-click to extend`}
          </span>
          {!isFieldError(picked) && (
            <Button type="button" size="sm" onClick={() => { onCreate(picked); setRows(null); }}>Repeat for each record</Button>
          )}
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows(null)}>Clear</Button>
        </div>
      )}
    </div>
  );
}
