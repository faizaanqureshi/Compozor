// Parses an Ask answer (plain text with light markdown and [[source]]
// citation markers) into blocks the chat renders. Pure, so it works on a
// half-streamed answer: an unfinished **bold** or marker just stays text.

export type AnswerSegment =
  | { type: "text"; text: string; bold?: boolean }
  | { type: "cite"; key: string };

export type AnswerBlock = {
  type: "p" | "li";
  ordered?: boolean;
  segments: AnswerSegment[];
};

const MARKER = /\[\[([a-z]+:[0-9]+(?::p[0-9]+)?)\]\]/g;
const LIST_ITEM = /^\s*(?:([-*•])|(\d+)[.)])\s+(.*)$/;

function inline(text: string): AnswerSegment[] {
  const segments: AnswerSegment[] = [];
  const pushText = (value: string) => {
    const parts = value.split(/(\*\*[^*]+\*\*)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        segments.push({ type: "text", text: part.slice(2, -2), bold: true });
      } else {
        segments.push({ type: "text", text: part });
      }
    }
  };
  let last = 0;
  for (const match of text.matchAll(MARKER)) {
    const index = match.index ?? 0;
    // A citation hugs the word before it; drop the space the model left.
    pushText(text.slice(last, index).replace(/\s+$/, index > 0 ? " " : ""));
    segments.push({ type: "cite", key: match[1] });
    last = index + match[0].length;
  }
  pushText(text.slice(last));
  return segments;
}

export function parseAnswer(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "p", segments: inline(paragraph.join(" ")) });
    paragraph = [];
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.replace(/^#{1,6}\s+/, "");
    if (!line.trim()) {
      flush();
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      blocks.push({ type: "li", ordered: Boolean(item[2]), segments: inline(item[3]) });
    } else {
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

// Distinct citation keys in reading order - the chips' numbering.
export function citationOrder(text: string): string[] {
  const seen: string[] = [];
  for (const match of text.matchAll(MARKER)) if (!seen.includes(match[1])) seen.push(match[1]);
  return seen;
}
