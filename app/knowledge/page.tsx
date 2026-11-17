"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { Archive, ArchiveRestore, FileText, MoreHorizontal, Pencil, Plus, Upload } from "lucide-react";
import {
  ApiError,
  KnowledgeEntrySummary,
  listKnowledge,
  updateKnowledgeEntry,
  uploadKnowledgeDocument,
} from "@/lib/api";
import { knowledgeKey } from "@/lib/swr-keys";
import { KNOWLEDGE_EXAMPLES, KNOWLEDGE_UPLOAD_ACCEPT, audienceLabel, updatedLabel } from "@/lib/knowledge";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Panel } from "@/components/panel";
import { KnowledgeEntryDialog, type KnowledgeDraft } from "@/components/knowledge-entry-dialog";

type DialogState =
  | { mode: "add"; initial?: Partial<KnowledgeDraft> }
  | { mode: "edit"; entryId: number; heading?: string; description?: string }
  | null;

export default function KnowledgePage() {
  const [showArchived, setShowArchived] = useState(false);
  const { data, error: loadError, mutate } = useSWR(knowledgeKey(showArchived), () => listKnowledge(showArchived), {
    // A fresh entry is indexed for meaning a moment after saving.
    refreshInterval: (latest) => (latest?.some((e) => !e.searchable) ? 4000 : 0),
  });
  const [dialog, setDialog] = useState<DialogState>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const entries = data ?? null;
  const active = entries?.filter((e) => !e.archived) ?? [];
  const archived = entries?.filter((e) => e.archived) ?? [];
  const isEmpty = entries !== null && entries.length === 0 && !showArchived;

  const onUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const entry = await uploadKnowledgeDocument(file, "clients");
      await mutate();
      setDialog({
        mode: "edit",
        entryId: entry.id,
        heading: "Check what we read",
        description: `From ${entry.original_filename ?? file.name}. Tidy the text and choose who it's for.`,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const setArchived = async (entry: KnowledgeEntrySummary, value: boolean) => {
    setError(null);
    try {
      await updateKnowledgeEntry(entry.id, { archived: value });
      await mutate();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl leading-tight font-light tracking-tight [font-family:var(--font-display)] md:text-5xl">
            Knowledge
          </h1>
          <p className="max-w-xl text-sm text-pretty text-muted-foreground">
            What Compozor knows about your firm when it answers clients and runs workflows. Internal entries guide it
            but are never shared.
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <input
            ref={fileInput}
            type="file"
            accept={KNOWLEDGE_UPLOAD_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onUpload(file);
            }}
          />
          <Button variant="outline" className="bg-card" disabled={uploading} onClick={() => fileInput.current?.click()}>
            <Upload />
            {uploading ? "Reading…" : "Upload"}
          </Button>
          <Button onClick={() => setDialog({ mode: "add" })}>
            <Plus />
            Add knowledge
          </Button>
        </div>
      </header>

      {(error || loadError) && (
        <p role="alert" className="text-sm text-destructive">
          {error ?? (loadError instanceof ApiError ? loadError.message : String(loadError))}
        </p>
      )}

      {isEmpty ? (
        <EmptyState onPick={(initial) => setDialog({ mode: "add", initial })} />
      ) : (
        <Panel
          title={showArchived ? "Archived" : "Entries"}
          meta={entries ? `${showArchived ? archived.length : active.length}` : undefined}
          action={
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setShowArchived(!showArchived)}>
              {showArchived ? "Back to entries" : "Archived"}
            </Button>
          }
        >
          {entries === null ? (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (showArchived ? archived : active).length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              {showArchived ? "Nothing archived." : "No entries yet."}
            </p>
          ) : (
            <div className="flex flex-col">
              <div
                aria-hidden
                className="hidden border-b border-border/70 pb-2.5 text-[0.6875rem] tracking-wider text-muted-foreground uppercase md:grid md:grid-cols-[minmax(0,1fr)_7rem_8rem_2.5rem] md:gap-4"
              >
                <span>Entry</span>
                <span>For</span>
                <span>Updated</span>
                <span />
              </div>
              <ul className="flex flex-col divide-y divide-border/50">
                {(showArchived ? archived : active).map((entry) => (
                  <KnowledgeRow
                    key={entry.id}
                    entry={entry}
                    onEdit={() => setDialog({ mode: "edit", entryId: entry.id })}
                    onArchive={(value) => void setArchived(entry, value)}
                  />
                ))}
              </ul>
            </div>
          )}
        </Panel>
      )}

      <KnowledgeEntryDialog
        open={dialog !== null}
        onOpenChange={(open) => !open && setDialog(null)}
        entryId={dialog?.mode === "edit" ? dialog.entryId : undefined}
        initial={dialog?.mode === "add" ? dialog.initial : undefined}
        heading={dialog?.mode === "edit" ? dialog.heading : undefined}
        description={dialog?.mode === "edit" ? dialog.description : undefined}
        onSaved={() => void mutate()}
      />
    </div>
  );
}

function KnowledgeRow({
  entry,
  onEdit,
  onArchive,
}: {
  entry: KnowledgeEntrySummary;
  onEdit: () => void;
  onArchive: (archived: boolean) => void;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 py-4 md:grid-cols-[minmax(0,1fr)_7rem_8rem_2.5rem] md:items-center">
      <button
        type="button"
        onClick={onEdit}
        disabled={entry.archived}
        className="flex min-w-0 flex-col gap-1 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-default"
      >
        <span className="flex min-w-0 items-center gap-2">
          {entry.source === "upload" && <FileText className="size-3.5 shrink-0 text-muted-foreground" aria-label="Uploaded document" />}
          <span className="truncate text-sm font-medium">{entry.title}</span>
        </span>
        <span className="line-clamp-1 text-[0.8125rem] text-foreground/60">{entry.excerpt}</span>
      </button>

      <div className="col-start-2 row-start-1 md:hidden">
        <RowActions entry={entry} onEdit={onEdit} onArchive={onArchive} />
      </div>

      <div className="flex items-center gap-3 max-md:col-span-2 md:contents">
        <span>
          <Badge variant={entry.audience === "clients" ? "secondary" : "outline"}>{audienceLabel(entry.audience)}</Badge>
        </span>
        <span className="text-xs text-muted-foreground md:text-sm" title={new Date(entry.updated_at).toLocaleString()}>
          {updatedLabel(entry.updated_at)}
        </span>
      </div>

      <div className="hidden justify-end md:flex">
        <RowActions entry={entry} onEdit={onEdit} onArchive={onArchive} />
      </div>
    </li>
  );
}

function RowActions({
  entry,
  onEdit,
  onArchive,
}: {
  entry: KnowledgeEntrySummary;
  onEdit: () => void;
  onArchive: (archived: boolean) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Options for ${entry.title}`} className="text-muted-foreground" />}
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {entry.archived ? (
          <DropdownMenuItem onClick={() => onArchive(false)}>
            <ArchiveRestore />
            Restore
          </DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onClick={onEdit}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onArchive(true)}>
              <Archive />
              Archive
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EmptyState({ onPick }: { onPick: (initial: Partial<KnowledgeDraft>) => void }) {
  return (
    <section className="flex flex-col gap-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
      <div className="flex max-w-lg flex-col gap-1.5">
        <h2 className="text-[0.9375rem] font-medium tracking-tight">Start with what clients ask most</h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Add a few facts about your firm and Compozor can answer these questions itself, in your words.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {KNOWLEDGE_EXAMPLES.map((example) => (
          <button
            key={example.title}
            type="button"
            onClick={() => onPick({ title: example.title, body: example.body, audience: "clients" })}
            className={cn(
              "group/example flex flex-col gap-1.5 rounded-xl p-4 text-left ring-1 ring-foreground/10 transition-colors",
              "hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            )}
          >
            <span className="flex items-center justify-between gap-2 text-sm font-medium">
              {example.title}
              <Plus className="size-3.5 text-muted-foreground transition-colors group-hover/example:text-foreground" />
            </span>
            <span className="text-xs text-muted-foreground">{example.prompt}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
