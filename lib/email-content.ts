import type { JSONContent } from "@tiptap/core";

// Mirrors app/services/email_formatting.py on the backend exactly, so a
// draft round-trips through the WYSIWYG editor without silently changing
// how it renders once sent: blank-line-separated paragraphs, "- " prefixed
// list items, and markdown-style `[label](url)` or bare-URL links are the
// only structure the backend understands (see plain_text_to_html there) -
// anything the editor can't express (bold, headings, etc.) is deliberately
// not offered, rather than offered and then dropped on save.
const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"]+)/g;
const TRAILING_PUNCT_RE = /[.,;:!?)\]]+$/;

function parseInline(line: string): JSONContent[] {
  const nodes: JSONContent[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;
  while ((match = LINK_RE.exec(line))) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", text: line.slice(lastIndex, match.index) });
    }
    if (match[1] !== undefined) {
      nodes.push({
        type: "text",
        text: match[1],
        marks: [{ type: "link", attrs: { href: match[2] } }],
      });
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
    nodes.push({ type: "text", text: line.slice(lastIndex) });
  }
  return nodes.length ? nodes : [{ type: "text", text: line.length ? line : " " }];
}

// Plain text (as stored on EmailLogEntry.content) -> Tiptap document, for
// loading a draft into the editor.
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
      content.push({
        type: "bulletList",
        content: lines.map((l) => ({
          type: "listItem",
          content: [{ type: "paragraph", content: parseInline(l.slice(2)) }],
        })),
      });
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

function inlineToText(nodes: JSONContent[] | undefined): string {
  if (!nodes) return "";
  let out = "";
  for (const node of nodes) {
    if (node.type === "text") {
      const link = node.marks?.find((m) => m.type === "link");
      const text = node.text ?? "";
      if (link?.attrs?.href) {
        out += text === link.attrs.href ? text : `[${text}](${link.attrs.href})`;
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
    } else if (node.type === "bulletList") {
      const items = (node.content ?? [])
        .map((item) => inlineToText(item.content?.[0]?.content).replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .map((t) => `- ${t}`);
      if (items.length) parts.push(items.join("\n"));
    }
  }

  return parts.join("\n\n").trim();
}
