"use client";

import { useMemo, useRef, useState } from "react";
import { GripVertical, Image as ImageIcon, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  fieldColor,
  listSlotAt,
  paragraphText,
  rowSlotAt,
  segments,
  selectionField,
  slotKey,
  textRanges,
  type DocParagraph,
  type DocPart,
  type DocTable,
  type DocumentView,
  type FieldSlot,
} from "@/lib/template-document";
import { Button } from "@/components/ui/button";

type BlockPick = { kind: "list"; part: string; from: number; to: number } | { kind: "rows"; part: string; table: number; from: number; to: number };
type TextPick = { top: number; left: number } & ({ find: string } | { error: string });

const HEADING = ["", "text-[1.5rem] leading-tight font-semibold", "text-[1.2rem] leading-snug font-semibold"];

function runStyle(run: { size?: number; color?: string }): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (run.size) style.fontSize = `${Math.min(40, Math.max(7, run.size))}pt`;
  if (run.color && run.color.toLowerCase() !== "#ffffff") style.color = run.color;
  return style;
}

// The template's source document drawn as a page, with every field tinted.
// Staff select text to make it a field, or pick table rows or paragraphs to
// make them repeat for each record.
export function TemplateDocumentViewer({ view, slots, active, onActivate, onCreate }: {
  view: DocumentView;
  slots: FieldSlot[];
  active: string | null;
  onActivate: (key: string) => void;
  onCreate: (slot: FieldSlot) => void;
}) {
  const page = useRef<HTMLDivElement>(null);
  const [textPick, setTextPick] = useState<TextPick | null>(null);
  const [blockPick, setBlockPick] = useState<BlockPick | null>(null);
  const paragraphs = useMemo(() => {
    const map = new Map<string, string>();
    const visit = (part: string, p: DocParagraph) => map.set(`${part}:${p.index}`, paragraphText(p));
    for (const part of view.parts) {
      for (const block of part.blocks) {
        if (block.type === "p") visit(part.part, block);
        else block.rows.forEach((r) => r.cells.forEach((c) => c.forEach((p) => visit(part.part, p))));
      }
    }
    return map;
  }, [view]);

  const onMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !page.current) return;
    const container = (node: Node | null) => (node instanceof Element ? node : node?.parentElement)?.closest<HTMLElement>("[data-paragraph]");
    const start = container(selection.anchorNode);
    const end = container(selection.focusNode);
    const box = selection.getRangeAt(0).getBoundingClientRect();
    const origin = page.current.getBoundingClientRect();
    const position = { top: box.bottom - origin.top + page.current.scrollTop + 6, left: Math.max(8, box.left - origin.left) };
    if (!start || start !== end) {
      setTextPick({ ...position, error: "Select text within one paragraph." });
      return;
    }
    const text = paragraphs.get(start.dataset.paragraph!) ?? "";
    setTextPick({ ...position, ...selectionField(selection.toString(), text, textRanges(text, slots)) });
    setBlockPick(null);
  };

  const pickBlock = (pick: BlockPick, extend: boolean) => {
    setTextPick(null);
    setBlockPick((current) => {
      const same = current && current.kind === pick.kind && current.part === pick.part
        && (pick.kind === "list" || (current.kind === "rows" && current.table === pick.table));
      if (extend && same && current) {
        return { ...current, from: Math.min(current.from, pick.from), to: Math.max(current.to, pick.to) } as BlockPick;
      }
      return pick;
    });
  };

  const createFromBlock = () => {
    if (!blockPick) return;
    const count = blockPick.to - blockPick.from + 1;
    onCreate(blockPick.kind === "rows"
      ? { kind: "table_rows", label: count === 1 ? "Table row" : "Table rows", part: blockPick.part, table: blockPick.table, row: blockPick.from, count }
      : { kind: "list", label: "Repeated paragraphs", part: blockPick.part, paragraph: blockPick.from, count });
    setBlockPick(null);
  };

  const chip = (key: string, text: string) => {
    const index = slots.findIndex((s, i) => slotKey(s, i) === key);
    const slot = slots[index];
    return (
      <button
        type="button"
        onClick={() => onActivate(key)}
        className="mb-1.5 inline-flex max-w-full items-center gap-1.5 rounded-4xl bg-card px-2 py-0.5 text-[0.6875rem] text-foreground/80 ring-1 ring-foreground/15 hover:ring-foreground/40"
      >
        <span className={cn("size-1.5 shrink-0 rounded-full", fieldColor(slots, key).dot)} aria-hidden />
        <span className="truncate">{slot?.label || "Field"} · {text}</span>
      </button>
    );
  };

  const renderParagraph = (part: string, p: DocParagraph, handle: boolean) => {
    const text = paragraphText(p);
    const list = p.style?.list;
    const picked = blockPick?.kind === "list" && blockPick.part === part && p.index >= blockPick.from && p.index <= blockPick.to;
    const inList = listSlotAt(part, p.index, slots);
    return (
      <div key={`p-${p.index}`} className={cn("group/p relative", picked && "rounded-sm bg-foreground/5 ring-1 ring-foreground/30")}>
        {handle && !inList && (
          <button
            type="button"
            aria-label="Select paragraph to repeat"
            title="Select paragraphs to repeat (shift-click to extend)"
            onClick={(e) => pickBlock({ kind: "list", part, from: p.index, to: p.index }, e.shiftKey)}
            className="absolute top-0.5 -left-7 flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/p:opacity-100 hover:bg-muted focus-visible:opacity-100"
          >
            <GripVertical className="size-3.5" />
          </button>
        )}
        <p
          data-paragraph={`${part}:${p.index}`}
          className={cn("min-h-[1.1em] whitespace-pre-wrap", HEADING[p.style?.heading ?? 0], list && "relative pl-5",
            p.style?.align === "center" && "text-center", p.style?.align === "right" && "text-right", p.style?.align === "justify" && "text-justify")}
        >
          {list && <span aria-hidden className="absolute left-1 select-none">•</span>}
          {segments(p.runs, textRanges(text, slots)).map((segment, i) => {
            if (segment.run.image) return <ImageIcon key={i} aria-label="Image" className="mx-0.5 inline size-4 text-muted-foreground" />;
            const className = cn(segment.run.b && "font-semibold", segment.run.i && "italic", segment.run.u && "underline");
            if (!segment.key) return <span key={i} className={className} style={runStyle(segment.run)}>{segment.text}</span>;
            const key = segment.key;
            return (
              <mark
                key={i}
                data-field={key}
                onClick={() => onActivate(key)}
                className={cn(className, "cursor-pointer rounded-[3px] px-0.5 text-inherit underline decoration-2 underline-offset-4",
                  fieldColor(slots, key).mark, active === key && "ring-2 ring-foreground/50")}
                style={runStyle(segment.run)}
              >
                {segment.text}
              </mark>
            );
          })}
        </p>
      </div>
    );
  };

  const renderTable = (part: string, t: DocTable) => {
    const keys = [...new Set(t.rows.map((r) => rowSlotAt(part, t.table, r.row, slots)).filter(Boolean))] as string[];
    return (
      <div key={`t-${t.table}`} className="flex flex-col">
        {keys.map((key) => {
          const rows = t.rows.filter((r) => rowSlotAt(part, t.table, r.row, slots) === key).length;
          return <div key={key}>{chip(key, `${rows} example row${rows === 1 ? "" : "s"}, repeats per record`)}</div>;
        })}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[0.8125rem]">
            <tbody>
              {t.rows.map((row) => {
                const key = rowSlotAt(part, t.table, row.row, slots);
                const picked = blockPick?.kind === "rows" && blockPick.part === part && blockPick.table === t.table && row.row >= blockPick.from && row.row <= blockPick.to;
                return (
                  <tr
                    key={row.row}
                    data-field={key}
                    onClick={key ? () => onActivate(key) : undefined}
                    className={cn("group/row", key && cn("cursor-pointer", fieldColor(slots, key).block), key && active === key && "outline-2 outline-foreground/50", picked && "bg-foreground/5 outline-1 outline-foreground/30")}
                  >
                    {row.cells.map((cell, c) => (
                      <td key={c} className="relative border border-border px-2.5 py-1.5 align-top">
                        {c === 0 && !key && (
                          <button
                            type="button"
                            aria-label="Select row to repeat"
                            title="Select rows to repeat (shift-click to extend)"
                            onClick={(e) => pickBlock({ kind: "rows", part, table: t.table, from: row.row, to: row.row }, e.shiftKey)}
                            className="absolute top-1.5 -left-7 flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 group-hover/row:opacity-100 hover:bg-muted focus-visible:opacity-100"
                          >
                            <GripVertical className="size-3.5" />
                          </button>
                        )}
                        {cell.map((p) => renderParagraph(part, p, false))}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderBlocks = (part: DocPart) => {
    const out: React.ReactNode[] = [];
    let group: { key: string; items: DocParagraph[] } | null = null;
    const flush = () => {
      if (!group) return;
      const { key, items } = group;
      out.push(
        <div key={`g-${key}-${items[0].index}`} data-field={key} className={cn("-mx-3 rounded-md border-l-2 px-3 py-2", fieldColor(slots, key).block, active === key && "ring-2 ring-foreground/40")}>
          {chip(key, `${items.length} example item${items.length === 1 ? "" : "s"}, repeats per item`)}
          <div className="flex flex-col gap-2">{items.map((p) => renderParagraph(part.part, p, false))}</div>
        </div>
      );
      group = null;
    };
    for (const block of part.blocks) {
      const key = block.type === "p" ? listSlotAt(part.part, block.index, slots) : undefined;
      if (block.type === "p" && key) {
        if (group && group.key !== key) flush();
        group = group ?? { key, items: [] };
        group.items.push(block);
        continue;
      }
      flush();
      out.push(block.type === "p" ? renderParagraph(part.part, block, part.kind !== "header" && part.kind !== "footer") : renderTable(part.part, block));
    }
    flush();
    return out;
  };

  return (
    <div ref={page} onMouseUp={onMouseUp} className="relative flex flex-col items-center gap-6 px-4 py-6 sm:px-10 sm:py-10">
      {view.parts.map((part) =>
        part.kind === "slide" ? (
          <section key={part.part} aria-label={part.label} className="w-full max-w-[52rem]">
            <p className="mb-2 text-[0.6875rem] tracking-widest text-muted-foreground uppercase">{part.label}</p>
            <div className="flex aspect-video flex-col gap-3 overflow-auto rounded-lg bg-card p-8 text-sm leading-relaxed text-card-foreground shadow-sm ring-1 ring-foreground/10 sm:p-12">
              {renderBlocks(part)}
            </div>
          </section>
        ) : part.kind === "body" ? (
          <section key={part.part} aria-label="Document" className="flex w-full max-w-[52rem] flex-col gap-3 rounded-sm bg-card px-8 py-10 text-[0.875rem] leading-relaxed text-card-foreground shadow-sm ring-1 ring-foreground/10 sm:px-16 sm:py-14">
            {renderBlocks(part)}
          </section>
        ) : (
          <section key={part.part} aria-label={part.label} className="w-full max-w-[52rem] rounded-sm border border-dashed border-border px-8 py-3 text-xs text-muted-foreground sm:px-16">
            <p className="mb-1 text-[0.625rem] tracking-widest uppercase">{part.label}</p>
            <div className="flex flex-col gap-1 text-foreground/80">{renderBlocks(part)}</div>
          </section>
        )
      )}

      {textPick && (
        <div className="absolute z-10 flex items-center gap-2 rounded-lg bg-popover p-1.5 text-xs shadow-md ring-1 ring-foreground/10" style={{ top: textPick.top, left: textPick.left }}>
          {"find" in textPick ? (
            <Button type="button" size="sm" onMouseDown={(e) => e.preventDefault()} onClick={() => { onCreate({ kind: "text", find: textPick.find, label: textPick.find.slice(0, 40) }); setTextPick(null); window.getSelection()?.removeAllRanges(); }}>
              <Plus />
              Make a field
            </Button>
          ) : (
            <span className="px-2 text-muted-foreground">{textPick.error}</span>
          )}
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={() => setTextPick(null)}><X className="size-3.5" /></Button>
        </div>
      )}

      {blockPick && (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl bg-popover px-4 py-2.5 text-sm shadow-md ring-1 ring-foreground/10">
          <span className="text-muted-foreground">
            {blockPick.to - blockPick.from + 1} {blockPick.kind === "rows" ? "row" : "paragraph"}{blockPick.to > blockPick.from ? "s" : ""} selected · shift-click to extend
          </span>
          <Button type="button" size="sm" onClick={createFromBlock}>
            {blockPick.kind === "rows" ? "Repeat for each record" : "Repeat for each item"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setBlockPick(null)}>Clear</Button>
        </div>
      )}
    </div>
  );
}
