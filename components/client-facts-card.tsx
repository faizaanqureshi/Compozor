"use client";

import { useState } from "react";
import { BadgeCheck, FileText, Mail, Pencil, Plus, Trash2, Workflow } from "lucide-react";
import {
  ApiError,
  type ClientFact,
  type ClientFactSource,
  type DocumentOut,
  addClientFact,
  deleteClientFact,
  updateClientFact,
} from "@/lib/api";
import { cn, formatShortDate } from "@/lib/utils";
import { Panel } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SOURCE_ICONS: Record<ClientFactSource, typeof Mail> = {
  email: Mail,
  document: FileText,
  run: Workflow,
  staff: BadgeCheck,
};

// Where a fact came from, phrased for staff. Links go to the source when it still exists.
const SOURCE_PREFIX: Record<ClientFactSource, string> = {
  email: "Email",
  document: "Document",
  run: "Workflow",
  staff: "",
};

const eyebrow = "text-[0.6875rem] font-normal tracking-wider text-muted-foreground uppercase";

function errorText(e: unknown) {
  return e instanceof ApiError ? e.message : String(e);
}

function sourceHref(fact: ClientFact, documents: DocumentOut[] | null): string | null {
  if (fact.source_id === null) return null;
  if (fact.source_type === "document") {
    return documents?.find((d) => d.id === fact.source_id)?.download_url ?? "#documents";
  }
  if (fact.source_type === "run") return "#workflows";
  if (fact.source_type === "email") return "#communication";
  return null;
}

function Provenance({ fact, documents }: { fact: ClientFact; documents: DocumentOut[] | null }) {
  const Icon = SOURCE_ICONS[fact.source_type];
  const prefix = SOURCE_PREFIX[fact.source_type];
  const href = sourceHref(fact, documents);
  const date = fact.as_of ?? fact.source_date;
  const label = (
    <>
      {prefix && <span className="text-muted-foreground/70">{prefix} · </span>}
      {fact.source_label}
    </>
  );
  return (
    <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
      <Icon aria-hidden className="size-3 shrink-0" />
      {href ? (
        <a
          href={href}
          {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
          className="min-w-0 truncate underline-offset-4 hover:text-foreground hover:underline"
          title={`Learned from ${prefix ? prefix.toLowerCase() + " " : ""}${fact.source_label}`}
        >
          {label}
        </a>
      ) : (
        <span className="min-w-0 truncate">{label}</span>
      )}
      {date && (
        <>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span className="shrink-0 tabular-nums">{formatShortDate(date, true)}</span>
        </>
      )}
    </p>
  );
}

function FactEditor({
  initial,
  saving,
  error,
  placeholder,
  onSave,
  onCancel,
}: {
  initial: string;
  saving: boolean;
  error: string | null;
  placeholder?: string;
  onSave: (statement: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const trimmed = value.trim();
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onSave(trimmed);
      }}
    >
      <Input
        autoFocus
        value={value}
        maxLength={300}
        placeholder={placeholder}
        aria-label="Fact"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving || !trimmed || trimmed === initial}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

function DeleteFactDialog({
  fact,
  open,
  onOpenChange,
  onDeleted,
  clientId,
}: {
  fact: ClientFact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
  clientId: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onDelete = async () => {
    setPending(true);
    setError(null);
    try {
      await deleteClientFact(clientId, fact.id);
      onOpenChange(false);
      onDeleted();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove this fact?</DialogTitle>
          <DialogDescription>
            “{fact.statement}” will no longer be used in replies or workflows, and won&apos;t be learned again.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDelete} disabled={pending}>
            {pending ? "Removing…" : "Remove fact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FactRow({
  clientId,
  fact,
  documents,
  onChange,
}: {
  clientId: number;
  fact: ClientFact;
  documents: DocumentOut[] | null;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async (statement: string) => {
    setSaving(true);
    setError(null);
    try {
      await updateClientFact(clientId, fact.id, { statement });
      setEditing(false);
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <li className="py-3 first:pt-0">
        <FactEditor initial={fact.statement} saving={saving} error={error} onSave={onSave}
          onCancel={() => { setEditing(false); setError(null); }} />
      </li>
    );
  }
  return (
    <li className="group py-3 first:pt-0 last:pb-0">
      <p className="text-pretty text-sm leading-snug text-foreground/85">{fact.statement}</p>
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1">
          <Provenance fact={fact} documents={documents} />
        </div>
        {/* Always visible on touch screens; on hover or keyboard focus elsewhere. */}
        <div className="-mr-1.5 -mb-1 flex shrink-0 items-center transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-foreground"
            onClick={() => setEditing(true)}>
            <Pencil />
            <span className="sr-only">Edit fact</span>
          </Button>
          <Button variant="ghost" size="icon-xs" className="text-muted-foreground hover:text-destructive"
            onClick={() => setDeleting(true)}>
            <Trash2 />
            <span className="sr-only">Remove fact</span>
          </Button>
        </div>
      </div>
      <DeleteFactDialog clientId={clientId} fact={fact} open={deleting} onOpenChange={setDeleting} onDeleted={onChange} />
    </li>
  );
}

function ConflictRow({
  clientId,
  fact,
  current,
  documents,
  onChange,
}: {
  clientId: number;
  fact: ClientFact;
  current: ClientFact | undefined;
  documents: DocumentOut[] | null;
  onChange: () => void;
}) {
  const [pending, setPending] = useState<"keep" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const act = async (kind: "keep" | "dismiss") => {
    setPending(kind);
    setError(null);
    try {
      if (kind === "keep") await updateClientFact(clientId, fact.id, { resolve: true });
      else await deleteClientFact(clientId, fact.id);
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(null);
    }
  };
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
        <div className="min-w-0 flex-1">
          <p className="text-pretty text-sm leading-snug text-foreground/85">{fact.statement}</p>
          {current && (
            <p className="mt-1 text-xs text-muted-foreground text-pretty">
              We have “{current.statement}”
            </p>
          )}
          <Provenance fact={fact} documents={documents} />
        </div>
      </div>
      {error && <p className="pl-4 text-xs text-destructive">{error}</p>}
      <div className="flex gap-1.5 pl-4">
        <Button variant="outline" size="xs" onClick={() => act("keep")} disabled={pending !== null}>
          {pending === "keep" ? "Saving…" : "Use this instead"}
        </Button>
        <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => act("dismiss")}
          disabled={pending !== null}>
          {pending === "dismiss" ? "Dismissing…" : "Dismiss"}
        </Button>
      </div>
    </li>
  );
}

/** What the assistant knows about this client, with where each fact came from. */
export function ClientFactsCard({
  clientId,
  facts,
  documents,
  loadError,
  onChange,
}: {
  clientId: number;
  facts: ClientFact[] | null;
  documents: DocumentOut[] | null;
  loadError?: string | null;
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = facts?.filter((f) => f.status === "active") ?? [];
  const conflicts = facts?.filter((f) => f.status === "conflict") ?? [];

  const onAdd = async (statement: string) => {
    setSaving(true);
    setError(null);
    try {
      await addClientFact(clientId, statement);
      setAdding(false);
      onChange();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      title="What we know"
      loadError={loadError}
      action={
        facts !== null && !adding && (
          <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
            <Plus />
            Add
          </Button>
        )
      }
    >
      {facts === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
        <div className="flex flex-col gap-5 animate-fade-in">
          {adding && (
            <FactEditor initial="" saving={saving} error={error} placeholder="e.g. Prefers a call before filing"
              onSave={onAdd} onCancel={() => { setAdding(false); setError(null); }} />
          )}
          {current.length > 0 && (
            <ul className="flex flex-col divide-y divide-border/60">
              {current.map((fact) => (
                <FactRow key={fact.id} clientId={clientId} fact={fact} documents={documents} onChange={onChange} />
              ))}
            </ul>
          )}
          {conflicts.length > 0 && (
            <section aria-label="Facts that disagree" className="flex flex-col gap-2 border-t border-border/70 pt-4">
              <span className={eyebrow}>Needs a look</span>
              <ul className="flex flex-col divide-y divide-border/60">
                {conflicts.map((fact) => (
                  <ConflictRow key={fact.id} clientId={clientId} fact={fact} documents={documents}
                    current={facts.find((f) => f.id === fact.conflicts_with_id && f.status === "active")}
                    onChange={onChange} />
                ))}
              </ul>
            </section>
          )}
          {facts.length === 0 && !adding && (
            <p className="text-pretty text-sm text-muted-foreground">
              Nothing yet. Facts from this client&apos;s emails, documents and finished work appear here.
            </p>
          )}
          {facts.length > 0 && (
            <p className={cn("text-pretty text-xs text-muted-foreground/80")}>
              Used in replies and workflows. Documents and your edits outrank what a client says by email.
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
