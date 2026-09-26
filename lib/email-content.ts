import type { JSONContent } from "@tiptap/core";

// Mirrors app/services/email_formatting.py on the backend exactly, so a
// draft round-trips through the WYSIWYG editor without silently changing
// how it renders once sent. The stored body is plain text with a small,
// markdown-style vocabulary the backend turns into HTML:
//   - blank-line-separated paragraphs (single line breaks kept)
//   - "- " bullet lists and "1. " numbered lists
//   - [label](url) and bare-URL links
//   - **bold** and *italic*
// Anything else (headings, colours, etc.) is deliberately not offered by the
// editor, rather than offered and then dropped on send.
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"]+)/g;
const TRAILING_PUNCT_RE = /[.,;:!?)\]]+$/;
// Markers must hug non-space text, matching the backend, so stray asterisks
// ("5 * 3") stay literal.
const BOLD_ITALIC_RE = /\*\*\*(?=[^\s*])(.+?)(?<=[^\s*])\*\*\*/g;
const BOLD_RE = /\*\*(?=[^\s*])(.+?)(?<=[^\s*])\*\*/g;
const ITALIC_RE = /(?<![*\w])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![*\w])/g;
const NUMBERED_RE = /^\d{1,3}[.)]\s+/;

type Mark = { type: string; attrs?: Record<string, unknown> };

function textNode(text: string, marks: Mark[]): JSONContent {
  return marks.length ? { type: "text", text, marks } : { type: "text", text };
}

// Split text into runs carrying bold/italic marks.
function parseEmphasis(text: string, marks: Mark[] = []): JSONContent[] {
  const nodes: JSONContent[] = [];
  const pattern = new RegExp(`${BOLD_ITALIC_RE.source}|${BOLD_RE.source}|${ITALIC_RE.source}`, "g");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(textNode(text.slice(last, match.index), marks));
    if (match[1] !== undefined) {
      nodes.push(...parseEmphasis(match[1], [...marks, { type: "bold" }, { type: "italic" }]));
    } else if (match[2] !== undefined) {
      nodes.push(...parseEmphasis(match[2], [...marks, { type: "bold" }]));
    } else {
      nodes.push(...parseEmphasis(match[3], [...marks, { type: "italic" }]));
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(textNode(text.slice(last), marks));
  return nodes;
}

function parseInline(line: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(line))) {
    if (match.index > lastIndex) {
      nodes.push(...parseEmphasis(line.slice(lastIndex, match.index)));
    }
    if (match[1] !== undefined) {
      nodes.push(...parseEmphasis(match[1], [{ type: "link", attrs: { href: match[2] } }]));
    } else {
      let url = match[3];
      const trailing = TRAILING_PUNCT_RE.exec(url);
      let punct = "";
      if (trailing) {
        punct = trailing[0];
        url = url.slice(0, -punct.length);
      }
      nodes.push({ type: "text", text: url, marks: [{ type: "link", attrs: { href: url } }] });
      if (punct) nodes.push({ type: "text", text: punct });
    }
    lastIndex = LINK_RE.lastIndex;
  }
  if (lastIndex < line.length) {
    nodes.push(...parseEmphasis(line.slice(lastIndex)));
  }
  return nodes.length ? nodes : [{ type: "text", text: line.length ? line : " " }];
}

function listNode(type: "bulletList" | "orderedList", items: string[]): JSONContent {
  return {
    type,
    content: items.map((text) => ({
      type: "listItem",
      content: [{ type: "paragraph", content: parseInline(text) }],
    })),
  };
}

// Plain text (as stored on EmailLogEntry.content) -> Tiptap document, for
// loading a draft into the editor (and for rendering a stored body).
export function plainTextToDoc(text: string): JSONContent {
  const trimmed = text.trim();
  if (!trimmed) return { type: "doc", content: [{ type: "paragraph" }] };

  const paragraphs = trimmed.split(/\n\s*\n/);
  const content: JSONContent[] = [];

  for (const para of paragraphs) {
    const lines = para
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;

    if (lines.every((l) => l.startsWith("- "))) {
      content.push(listNode("bulletList", lines.map((l) => l.slice(2))));
    } else if (lines.every((l) => NUMBERED_RE.test(l))) {
      content.push(listNode("orderedList", lines.map((l) => l.replace(NUMBERED_RE, ""))));
    } else {
      const inline: JSONContent[] = [];
      lines.forEach((line, i) => {
        if (i > 0) inline.push({ type: "hardBreak" });
        inline.push(...parseInline(line));
      });
      content.push({ type: "paragraph", content: inline });
    }
  }

  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

// Wrap text in emphasis markers, keeping surrounding spaces outside them
// (the backend only recognises markers that hug the text).
function wrap(text: string, marker: string): string {
  const match = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
  if (!match || !match[2]) return text;
  return `${match[1]}${marker}${match[2]}${marker}${match[3]}`;
}

function inlineToText(nodes: JSONContent[] | undefined): string {
  if (!nodes) return "";
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") {
      const marks = node.marks ?? [];
      const link = marks.find((m) => m.type === "link");
      let text = node.text ?? "";
      if (marks.some((m) => m.type === "italic")) text = wrap(text, "*");
      if (marks.some((m) => m.type === "bold")) text = wrap(text, "**");
      if (link?.attrs?.href) {
        out += node.text === link.attrs.href ? node.text : `[${text}](${link.attrs.href})`;
      } else {
        out += text;
      }
    } else if (node.type === "hardBreak") {
      out += "\n";
    }
  }
  return out;
}

// Tiptap document -> plain text, for saving a draft back to EmailLogEntry.content.
export function docToPlainText(doc: JSONContent): string {
  const parts: string[] = [];

  for (const node of doc.content ?? []) {
    if (node.type === "paragraph") {
      const text = inlineToText(node.content).trim();
      if (text) parts.push(text);
    } else if (node.type === "bulletList" || node.type === "orderedList") {
      const items = (node.content ?? [])
        .map((item) => inlineToText(item.content?.[0]?.content).replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .map((t, i) => (node.type === "orderedList" ? `${i + 1}. ${t}` : `- ${t}`));
      if (items.length) parts.push(items.join("\n"));
    }
  }

  return parts.join("\n\n").trim();
}

// One-line preview of a message body for inbox lists: markdown links reduced
// to their text, whitespace collapsed, and cut at `length` characters.
export function snippet(content: string | null, length = 140): string {
  const flat = (content ?? "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length).trimEnd()}…` : flat;
}
