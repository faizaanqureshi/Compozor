"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  Plus,
  UploadCloud,
  X,
} from "lucide-react";
import {
  ApiError,
  ChecklistItemStatus,
  ChecklistSummary,
  ClientDetail,
  ClientMemoryNote,
  DocumentOut,
  DocumentUploadResult,
  EmailThread,
  createChecklistItem,
  getClient,
  listChecklistItems,
  listClientDocuments,
  listClientMemoryNotes,
  listEmailThreads,
  sendChecklistReminder,
  uploadDocument,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-border/60 p-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h2>
        {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {children}
    </section>
  );
}

const statusPillClasses: Record<ChecklistItemStatus, string> = {
  received: "bg-accent/15 text-accent",
  missing: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  wrong: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
};

const statusLabels: Record<ChecklistItemStatus, string> = {
  received: "Received",
  missing: "Missing",
  wrong: "Wrong",
};

function StatusPill({ status }: { status: ChecklistItemStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        statusPillClasses[status]
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const clientId = Number(id);

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [checklist, setChecklist] = useState<ChecklistSummary | null>(null);
  const [threads, setThreads] = useState<EmailThread[] | null>(null);
  const [documents, setDocuments] = useState<DocumentOut[] | null>(null);
  const [memoryNotes, setMemoryNotes] = useState<ClientMemoryNote[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    getClient(clientId)
      .then(setClient)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    listChecklistItems(clientId)
      .then(setChecklist)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    listEmailThreads(clientId)
      .then(setThreads)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    listClientDocuments(clientId)
      .then(setDocuments)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    listClientMemoryNotes(clientId)
      .then(setMemoryNotes)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(refresh, [clientId]);

  if (error && !client) return <p className="text-sm text-destructive">{error}</p>;
  if (!client) return <p className="text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="flex w-full flex-col gap-8">
      <div>
        <Link
          href="/clients"
          className="-ml-3 mt-2 mb-4 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Clients
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="text-6xl font-thin tracking-tight [font-family:var(--font-denton)]">
            {client.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            {client.email} · {client.status}
          </p>
          <p className="text-xs text-muted-foreground/70">
            Last reminder sent:{" "}
            {client.last_reminder_sent_at
              ? new Date(client.last_reminder_sent_at).toLocaleString()
              : "never"}
          </p>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ChecklistCard
        clientId={clientId}
        checklist={checklist}
        documents={documents}
        onChange={refresh}
      />

      <CommunicationCard
        client={client}
        threads={threads}
        onChange={refresh}
      />

      <DocumentVaultCard
        clientId={clientId}
        documents={documents}
        onChange={refresh}
      />

      <MemoryNotesCard notes={memoryNotes} />
    </div>
  );
}

function ChecklistCard({
  clientId,
  checklist,
  documents,
  onChange,
}: {
  clientId: number;
  checklist: ChecklistSummary | null;
  documents: DocumentOut[] | null;
  onChange: () => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [docTypeNeeded, setDocTypeNeeded] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const actionRequired = checklist ? checklist.missing + checklist.wrong : 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createChecklistItem(clientId, {
        doc_type_needed: docTypeNeeded,
        description: description || undefined,
      });
      setDocTypeNeeded("");
      setDescription("");
      setShowAddForm(false);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionCard
      title="Checklist requirements"
      subtitle={
        checklist && (
          <div className="flex items-center gap-2">
            <span>{checklist.total} total</span>
            {actionRequired > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                {actionRequired} action required
              </span>
            )}
          </div>
        )
      }
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left">
            <th className="py-2 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Doc type
            </th>
            <th className="py-2 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Status
            </th>
            <th className="py-2 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Wrong attempts
            </th>
            <th className="py-2 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Last wrong type
            </th>
            <th className="py-2 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Document
            </th>
          </tr>
        </thead>
        <tbody>
          {checklist?.items.map((item) => {
            const matched = documents
              ?.filter((d) => d.checklist_item_id === item.id)
              .sort((a, b) => b.received_at.localeCompare(a.received_at))[0];
            return (
              <tr key={item.id} className="border-b border-border/40">
                <td className="py-3 pr-4 font-medium">{item.doc_type_needed}</td>
                <td className="py-3 pr-4">
                  <StatusPill status={item.status} />
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {item.wrong_attempt_count}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {item.last_wrong_doc_type ?? "—"}
                </td>
                <td className="py-3 pr-4">
                  {matched ? (
                    matched.download_url ? (
                      <a
                        href={matched.download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-4"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-muted-foreground">uploaded</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            );
          })}
          {checklist?.items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-muted-foreground">
                No checklist items yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {showAddForm ? (
        <form
          onSubmit={onSubmit}
          className="flex items-start gap-2 border-t border-border/60 pt-4"
        >
          <Input
            required
            autoFocus
            placeholder="Doc type (e.g. T4, T4A, T5, NOA, bank_statement, qbo_export, receipt)"
            value={docTypeNeeded}
            onChange={(e) => setDocTypeNeeded(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={submitting} size="sm">
            {submitting ? "Adding…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowAddForm(false)}
          >
            <X />
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 self-start border-t border-transparent pt-1 text-sm font-medium text-accent underline-offset-4 transition-colors hover:text-accent/70 hover:underline"
        >
          <Plus className="size-3.5" />
          Add requirement
        </button>
      )}
    </SectionCard>
  );
}

function CommunicationCard({
  client,
  threads,
  onChange,
}: {
  client: ClientDetail;
  threads: EmailThread[] | null;
  onChange: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pendingReminder = threads
    ?.flatMap((t) => t.messages)
    .filter((m) => m.direction === "outbound" && m.status === "draft")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const onSendReminder = async () => {
    setSending(true);
    setMessage(null);
    try {
      await sendChecklistReminder(client.id);
      setMessage("Reminder sent — check the Email Log.");
      onChange();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <SectionCard title="Communication hub">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button onClick={onSendReminder} disabled={sending}>
            {sending ? "Sending…" : "Send reminder email"}
          </Button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </div>
        <p className="text-xs text-muted-foreground">
          Last sent:{" "}
          {client.last_reminder_sent_at
            ? new Date(client.last_reminder_sent_at).toLocaleString()
            : "never"}
          {pendingReminder && (
            <>
              {" "}
              · A reminder drafted{" "}
              {new Date(pendingReminder.created_at).toLocaleString()} is
              awaiting send
            </>
          )}
        </p>
      </div>

      <Separator className="bg-border/60" />

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Email threads
        </h3>
        <ThreadsList threads={threads} />
      </div>
    </SectionCard>
  );
}

function ThreadsList({ threads }: { threads: EmailThread[] | null }) {
  const [expandedThread, setExpandedThread] = useState<string | null>(null);

  return (
    <div className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/60">
      {threads?.map((thread) => {
        const latest = thread.messages[thread.messages.length - 1];
        const isOpen = expandedThread === thread.thread_key;
        return (
          <div key={thread.thread_key}>
            <button
              type="button"
              onClick={() =>
                setExpandedThread(isOpen ? null : thread.thread_key)
              }
              className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left"
            >
              <span className="truncate text-sm font-medium">
                {latest?.subject || "(no subject)"}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {thread.messages.length} message
                {thread.messages.length === 1 ? "" : "s"}
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    isOpen && "rotate-180"
                  )}
                />
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-col divide-y divide-border/40 border-t border-border/60 bg-muted/30">
                {thread.messages.map((m) => (
                  <div key={m.id} className="px-3.5 py-2.5 text-sm">
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        {m.direction} · {m.status}
                        {m.is_clarifying_question && (
                          <span
                            title="Clarifying question — awaiting a resolving reply"
                            className="inline-flex size-4 items-center justify-center rounded-full bg-accent/15 text-[10px] font-semibold text-accent"
                          >
                            ?
                          </span>
                        )}
                      </span>
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-foreground/80">
                      {m.content}
                    </p>
                    {m.escalation_reason && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                        {m.escalation_reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {threads?.length === 0 && (
        <p className="px-3.5 py-3 text-sm text-muted-foreground">
          No email threads yet.
        </p>
      )}
    </div>
  );
}

function DocumentVaultCard({
  clientId,
  documents,
  onChange,
}: {
  clientId: number;
  documents: DocumentOut[] | null;
  onChange: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DocumentUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onUpload = async (f: File) => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await uploadDocument(clientId, f);
      setResult(res);
      setFile(null);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionCard title="Document vault">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) setFile(dropped);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragOver
            ? "border-accent bg-accent/5"
            : "border-border/70 hover:border-border hover:bg-muted/30"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <UploadCloud className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {file ? (
            <span className="font-medium text-foreground">{file.name}</span>
          ) : (
            <>
              <span className="font-medium text-foreground">Click to upload</span>{" "}
              or drag and drop a document
            </>
          )}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          disabled={submitting || !file}
          onClick={() => file && onUpload(file)}
        >
          {submitting ? "Uploading…" : "Upload"}
        </Button>
        {file && (
          <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
            Clear
          </Button>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
          <p>Classified as: {result.document.classified_type ?? "unknown"}</p>
          <p>Year: {result.document.year ?? "unknown"}</p>
          <p>Checklist status: {result.checklist_item_status ?? "unmatched"}</p>
          <p>Draft email created: {result.draft_email_created ? "yes" : "no"}</p>
          {result.document.download_url && (
            <p>
              <a
                href={result.document.download_url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                View uploaded document
              </a>
            </p>
          )}
        </div>
      )}

      <Separator className="bg-border/60" />

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left">
            <th className="py-2 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Type
            </th>
            <th className="py-2 pr-4 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Year
            </th>
            <th className="py-2 pr-4 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Received
            </th>
            <th className="py-2 pr-4" />
          </tr>
        </thead>
        <tbody>
          {documents?.map((doc) => (
            <tr key={doc.id} className="border-b border-border/40">
              <td className="py-3 pr-4 font-medium">
                {doc.classified_type ?? "unknown"}
              </td>
              <td className="py-3 pr-4 text-right text-muted-foreground">
                {doc.year ?? "—"}
              </td>
              <td className="py-3 pr-4 text-right text-muted-foreground">
                {new Date(doc.received_at).toLocaleString()}
              </td>
              <td className="py-3 pr-4">
                {doc.download_url ? (
                  <a
                    href={doc.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-4"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-muted-foreground">unavailable</span>
                )}
              </td>
            </tr>
          ))}
          {documents?.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-muted-foreground">
                No documents uploaded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </SectionCard>
  );
}

function MemoryNotesCard({ notes }: { notes: ClientMemoryNote[] | null }) {
  return (
    <SectionCard
      title="What we know about this client"
      subtitle="Durable facts the AI has extracted from this client's emails, used to inform future Q&A answers."
    >
      <div className="flex flex-col gap-2">
        {notes?.map((note) => (
          <div
            key={note.id}
            className="rounded-lg border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm"
          >
            <p className="text-foreground/80">{note.note}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {new Date(note.created_at).toLocaleString()}
            </p>
          </div>
        ))}
        {notes?.length === 0 && (
          <p className="text-sm text-muted-foreground">No memory notes yet.</p>
        )}
      </div>
    </SectionCard>
  );
}
