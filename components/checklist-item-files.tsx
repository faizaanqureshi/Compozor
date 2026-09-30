"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

import type { DocumentOut } from "@/lib/api";

function FileLink({ document }: { document: DocumentOut }) {
  if (!document.download_url) {
    return <span className="text-muted-foreground">Uploaded</span>;
  }
  return (
    <a
      href={document.download_url}
      target="_blank"
      rel="noreferrer"
      title={document.resolved_display_name}
      className="inline-flex max-w-full items-center gap-1.5 text-foreground/85 hover:text-foreground hover:underline"
    >
      <FileText className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{document.resolved_display_name}</span>
    </a>
  );
}

// Every file linked to one checklist requirement, newest first. A
// multi-file requirement (e.g. receipts) can hold dozens, so only the
// newest shows until expanded.
export function ChecklistItemFiles({ documents }: { documents: DocumentOut[] }) {
  const [expanded, setExpanded] = useState(false);
  if (documents.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const [newest, ...rest] = documents;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <FileLink document={newest} />
      {rest.length > 0 && (
        <>
          {expanded && (
            <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {rest.map((document) => (
                <li key={document.id} className="min-w-0">
                  <FileLink document={document} />
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setExpanded((open) => !open)}
            aria-expanded={expanded}
            className="self-start text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {expanded ? "Show fewer" : `+${rest.length} more ${rest.length === 1 ? "file" : "files"}`}
          </button>
        </>
      )}
    </div>
  );
}
