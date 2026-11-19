"use client";

import { Fragment } from "react";
import Link from "next/link";
import { BookOpen, ClipboardList, FileText, Globe, Mail, User, Workflow } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AskCitation } from "@/lib/ask";
import { parseAnswer, type AnswerSegment } from "@/lib/ask-answer";
import { cn } from "@/lib/utils";

const KIND_ICON = {
  client: User,
  document: FileText,
  email: Mail,
  run: Workflow,
  questionnaire: ClipboardList,
  knowledge: BookOpen,
  web: Globe,
} as const;

const CHIP =
  "mr-px inline-flex h-5 max-w-[13rem] translate-y-[-1px] items-center gap-1 rounded-md bg-muted px-1.5 align-middle text-[0.6875rem] leading-none font-medium text-muted-foreground transition-colors hover:bg-accent/12 hover:text-accent focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none";

// A source the answer relied on, inline right after the fact it supports.
// Links to the exact place on the client's page (document, email, run), or
// for a web page, opens it in a new tab (the chip shows the page title, the
// tooltip the site it's on).
export function AskCitationChip({ citation, onNavigate }: { citation: AskCitation; onNavigate?: () => void }) {
  const Icon = KIND_ICON[citation.kind] ?? FileText;
  const showClient = citation.kind !== "client";
  const external = citation.kind === "web" && /^https?:\/\//.test(citation.href);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          external ? (
            <a href={citation.href} target="_blank" rel="noopener noreferrer" className={CHIP} />
          ) : (
            <Link href={citation.href} onClick={onNavigate} className={CHIP} />
          )
        }
      >
        <Icon className="size-3 shrink-0" strokeWidth={1.75} />
        <span className="truncate">{citation.label}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64">
        <span className="block font-medium">{citation.label}</span>
        <span className="block opacity-75">
          {showClient ? citation.client_name : "Open client"}
          {citation.detail ? ` · ${citation.detail}` : ""}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

// A client citation right after the client's name links the name itself
// rather than repeating it in a chip.
function linkClientNames(segments: AnswerSegment[], citations: Record<string, AskCitation>) {
  type Out = AnswerSegment | { type: "client"; citation: AskCitation; text: string; bold?: boolean };
  const out: Out[] = [];
  for (const segment of segments) {
    const citation = segment.type === "cite" ? citations[segment.key] : undefined;
    const prev = out.at(-1);
    if (citation?.kind === "client" && prev?.type === "text") {
      const trimmed = prev.text.replace(/\s+$/, "");
      const name = [citation.client_name, citation.client_name.split(/\s+/)[0]].find((n) => trimmed.endsWith(n));
      if (name) {
        out.pop();
        const before = trimmed.slice(0, trimmed.length - name.length);
        if (before) out.push({ ...prev, text: before });
        out.push({ type: "client", citation, text: name, bold: prev.bold });
        continue;
      }
      if (out.length > 1 && /^\s+$/.test(prev.text)) {
        const named = out.at(-2);
        if (named?.type === "text" && named.text.endsWith(citation.client_name)) {
          out.pop();
          out.pop();
          const before = named.text.slice(0, named.text.length - citation.client_name.length);
          if (before) out.push({ ...named, text: before });
          out.push({ type: "client", citation, text: citation.client_name, bold: named.bold });
          continue;
        }
      }
    }
    out.push(segment);
  }
  return out;
}

function Segments({
  segments,
  citations,
  onNavigate,
}: {
  segments: AnswerSegment[];
  citations: Record<string, AskCitation>;
  onNavigate?: () => void;
}) {
  return (
    <>
      {linkClientNames(segments, citations).map((segment, i) =>
        segment.type === "client" ? (
          <Link
            key={i}
            href={segment.citation.href}
            onClick={onNavigate}
            className={cn(
              "text-foreground underline decoration-foreground/25 underline-offset-[5px] transition-colors hover:decoration-accent hover:text-accent",
              segment.bold && "font-medium"
            )}
          >
            {segment.text}
          </Link>
        ) : segment.type === "cite" ? (
          citations[segment.key] ? (
            <AskCitationChip key={i} citation={citations[segment.key]} onNavigate={onNavigate} />
          ) : null
        ) : segment.bold ? (
          <strong key={i} className="font-medium text-foreground">
            {segment.text}
          </strong>
        ) : (
          <Fragment key={i}>{segment.text}</Fragment>
        )
      )}
    </>
  );
}

export function AskAnswer({
  text,
  citations,
  streaming,
  onNavigate,
}: {
  text: string;
  citations: Record<string, AskCitation>;
  streaming?: boolean;
  onNavigate?: () => void;
}) {
  const blocks = parseAnswer(text);
  const groups: (typeof blocks)[] = [];
  for (const block of blocks) {
    const last = groups.at(-1);
    if (block.type === "li" && last?.[0].type === "li" && last[0].ordered === block.ordered) last.push(block);
    else groups.push([block]);
  }
  return (
    <div className={cn("flex flex-col gap-3 text-[0.9375rem] leading-7 text-foreground/90", streaming && "ask-streaming")}>
      {groups.map((group, i) => {
        if (group[0].type === "p") {
          return (
            <p key={i} className="text-pretty">
              <Segments segments={group[0].segments} citations={citations} onNavigate={onNavigate} />
            </p>
          );
        }
        const List = group[0].ordered ? "ol" : "ul";
        return (
          <List
            key={i}
            className={cn("flex flex-col gap-1.5 pl-5", group[0].ordered ? "list-decimal" : "list-disc marker:text-muted-foreground/60")}
          >
            {group.map((item, j) => (
              <li key={j} className="pl-1 text-pretty">
                <Segments segments={item.segments} citations={citations} onNavigate={onNavigate} />
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
