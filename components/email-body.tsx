import type { JSONContent } from "@tiptap/core";
import { plainTextToDoc } from "@/lib/email-content";
import { cn } from "@/lib/utils";

// Renders a stored email body (EmailLogEntry.content) with the same structure
// the backend sends: paragraphs, line breaks, bullet and numbered lists,
// links, bold and italic.
// Parsing goes through plainTextToDoc, the editor's own loader, so what staff
// read here matches both the editor and the email the client receives.
function Inline({ nodes }: { nodes?: JSONContent[] }) {
  return (
    <>
      {(nodes ?? []).map((node, i) => {
        if (node.type === "hardBreak") return <br key={i} />;
        const marks = node.marks ?? [];
        let text: React.ReactNode = node.text;
        if (marks.some((m) => m.type === "italic")) text = <em>{text}</em>;
        if (marks.some((m) => m.type === "bold")) text = <strong className="font-semibold">{text}</strong>;
        const href = marks.find((m) => m.type === "link")?.attrs?.href as string | undefined;
        if (href) {
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
            >
              {text}
            </a>
          );
        }
        return <span key={i}>{text}</span>;
      })}
    </>
  );
}

export function EmailBody({ content, className }: { content: string | null; className?: string }) {
  if (!content?.trim()) {
    return <p className={cn("text-sm text-muted-foreground italic", className)}>No message body.</p>;
  }
  const doc = plainTextToDoc(content);
  return (
    <div className={cn("flex flex-col gap-3 text-sm leading-relaxed text-foreground/90", className)}>
      {(doc.content ?? []).map((block, i) => {
        if (block.type === "bulletList" || block.type === "orderedList") {
          const List = block.type === "orderedList" ? "ol" : "ul";
          return (
            <List
              key={i}
              className={cn(
                "flex flex-col gap-1 pl-5 marker:text-muted-foreground",
                block.type === "orderedList" ? "list-decimal" : "list-disc"
              )}
            >
              {(block.content ?? []).map((item, j) => (
                <li key={j}>
                  <Inline nodes={item.content?.[0]?.content} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={i} className="text-pretty">
            <Inline nodes={block.content} />
          </p>
        );
      })}
    </div>
  );
}
