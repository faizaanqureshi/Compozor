"use client";

import { use, useEffect, useState } from "react";
import {
  ApiError,
  ChecklistSummary,
  ClientDetail,
  ClientMemoryNote,
  DocumentOut,
  DocumentUploadResult,
  EmailReplyResult,
  EmailThread,
  createChecklistItem,
  getClient,
  listChecklistItems,
  listClientDocuments,
  listClientMemoryNotes,
  listEmailThreads,
  sendChecklistReminder,
  submitEmailReply,
  uploadDocument,
} from "@/lib/api";

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

  if (error && !client) return <p className="text-red-600 text-sm">{error}</p>;
  if (!client) return <p className="text-zinc-500">Loading…</p>;

  return (
    <div className="flex flex-col gap-10 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">{client.name}</h1>
        <p className="text-zinc-600 text-sm">
          {client.email} · {client.status}
        </p>
        <p className="text-zinc-500 text-xs mt-1">
          Last reminder sent:{" "}
          {client.last_reminder_sent_at
            ? new Date(client.last_reminder_sent_at).toLocaleString()
            : "never"}
        </p>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <ChecklistSection
        clientId={clientId}
        checklist={checklist}
        documents={documents}
        onChange={refresh}
      />

      <ReminderSection clientId={clientId} onSent={refresh} />

      <DocumentUploadSection clientId={clientId} onUploaded={refresh} />

      <DocumentsSection documents={documents} />

      <EmailReplySection clientId={clientId} onSubmitted={refresh} />

      <ThreadsSection threads={threads} />

      <MemoryNotesSection notes={memoryNotes} />
    </div>
  );
}

function ThreadsSection({ threads }: { threads: EmailThread[] | null }) {
  const [expandedThread, setExpandedThread] = useState<string | null>(null);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Email threads</h2>
      <div className="flex flex-col gap-2">
        {threads?.map((thread) => {
          const latest = thread.messages[thread.messages.length - 1];
          const isOpen = expandedThread === thread.thread_key;
          return (
            <div
              key={thread.thread_key}
              className="border border-zinc-200 rounded"
            >
              <button
                onClick={() =>
                  setExpandedThread(isOpen ? null : thread.thread_key)
                }
                className="w-full text-left px-3 py-2 flex items-center justify-between"
              >
                <span className="text-sm font-medium">
                  {latest?.subject || "(no subject)"}
                </span>
                <span className="text-xs text-zinc-500">
                  {thread.messages.length} message
                  {thread.messages.length === 1 ? "" : "s"}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-zinc-200 flex flex-col divide-y divide-zinc-100">
                  {thread.messages.map((m) => (
                    <div key={m.id} className="px-3 py-2 text-sm">
                      <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                        <span className="flex items-center gap-1.5">
                          {m.direction} · {m.status}
                          {m.is_clarifying_question && (
                            <span
                              title="Clarifying question — awaiting a resolving reply"
                              className="rounded-full bg-blue-100 text-blue-700 w-4 h-4 inline-flex items-center justify-center text-[10px] font-semibold"
                            >
                              ?
                            </span>
                          )}
                        </span>
                        <span>{new Date(m.created_at).toLocaleString()}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-zinc-700">
                        {m.content}
                      </p>
                      {m.escalation_reason && (
                        <p className="text-amber-600 text-xs mt-1">
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
          <p className="text-zinc-500 text-sm">No email threads yet.</p>
        )}
      </div>
    </section>
  );
}

function ChecklistSection({
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
  const [docTypeNeeded, setDocTypeNeeded] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Checklist items</h2>
      {checklist && (
        <p className="text-sm text-zinc-600">
          {checklist.total} total · {checklist.missing} missing ·{" "}
          {checklist.received} received · {checklist.wrong} wrong
        </p>
      )}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-zinc-300">
            <th className="py-2 pr-4">Doc type</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Wrong attempts</th>
            <th className="py-2 pr-4">Last wrong type</th>
            <th className="py-2 pr-4">Document</th>
          </tr>
        </thead>
        <tbody>
          {checklist?.items.map((item) => {
            const matched = documents
              ?.filter((d) => d.checklist_item_id === item.id)
              .sort((a, b) => b.received_at.localeCompare(a.received_at))[0];
            return (
              <tr key={item.id} className="border-b border-zinc-100">
                <td className="py-2 pr-4">{item.doc_type_needed}</td>
                <td className="py-2 pr-4">{item.status}</td>
                <td className="py-2 pr-4">{item.wrong_attempt_count}</td>
                <td className="py-2 pr-4">{item.last_wrong_doc_type ?? "—"}</td>
                <td className="py-2 pr-4">
                  {matched ? (
                    matched.download_url ? (
                      <a
                        href={matched.download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-zinc-400">uploaded</span>
                    )
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
          {checklist?.items.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-zinc-500">
                No checklist items yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <form onSubmit={onSubmit} className="flex gap-3 items-start">
        <input
          required
          placeholder="Doc type (e.g. T4, T4A, T5, NOA, bank_statement, qbo_export, receipt)"
          value={docTypeNeeded}
          onChange={(e) => setDocTypeNeeded(e.target.value)}
          className="border border-zinc-300 rounded px-2 py-1 flex-1"
        />
        <input
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="border border-zinc-300 rounded px-2 py-1 flex-1"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-black text-white px-4 py-1.5 disabled:opacity-50"
        >
          Add
        </button>
      </form>
    </section>
  );
}

function ReminderSection({
  clientId,
  onSent,
}: {
  clientId: number;
  onSent: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onClick = async () => {
    setSubmitting(true);
    setMessage(null);
    try {
      await sendChecklistReminder(clientId);
      setMessage("Reminder drafted — check the Email Log.");
      onSent();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-medium">Checklist reminder</h2>
      <button
        onClick={onClick}
        disabled={submitting}
        className="self-start rounded bg-black text-white px-4 py-1.5 disabled:opacity-50"
      >
        {submitting ? "Sending…" : "Draft reminder email"}
      </button>
      {message && <p className="text-sm text-zinc-600">{message}</p>}
    </section>
  );
}

function DocumentUploadSection({
  clientId,
  onUploaded,
}: {
  clientId: number;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DocumentUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await uploadDocument(clientId, file);
      setResult(res);
      setFile(null);
      onUploaded();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Upload document</h2>
      <form onSubmit={onSubmit} className="flex gap-3 items-center">
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="submit"
          disabled={submitting || !file}
          className="rounded bg-black text-white px-4 py-1.5 disabled:opacity-50"
        >
          {submitting ? "Uploading…" : "Upload"}
        </button>
      </form>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {result && (
        <div className="text-sm bg-zinc-50 border border-zinc-200 rounded p-3">
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
                className="underline"
              >
                View uploaded document
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function EmailReplySection({
  clientId,
  onSubmitted,
}: {
  clientId: number;
  onSubmitted: () => void;
}) {
  const [emailText, setEmailText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<EmailReplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await submitEmailReply(clientId, emailText, files);
      setResult(res);
      setEmailText("");
      setFiles([]);
      onSubmitted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Simulate inbound email reply</h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <textarea
          placeholder="Email text"
          value={emailText}
          onChange={(e) => setEmailText(e.target.value)}
          className="border border-zinc-300 rounded px-2 py-1"
          rows={3}
        />
        <input
          type="file"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
        <button
          type="submit"
          disabled={submitting || !emailText}
          className="self-start rounded bg-black text-white px-4 py-1.5 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "Submit reply"}
        </button>
      </form>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      {result && (
        <div className="text-sm bg-zinc-50 border border-zinc-200 rounded p-3">
          <p>Has attachment: {result.has_attachment ? "yes" : "no"}</p>
          <p>Has question: {result.has_question ? "yes" : "no"}</p>
          <p>Reply email log id: {result.reply_email_log_id ?? "none"}</p>
          <p>
            Needs human attention:{" "}
            {result.needs_human_attention ? "yes" : "no"}
          </p>
          <p>
            Needs clarification: {result.needs_clarification ? "yes" : "no"}
          </p>
          {result.document_results.length > 0 && (
            <p>
              Document results:{" "}
              {result.document_results
                .map((d) => d.document.classified_type)
                .join(", ")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function DocumentsSection({ documents }: { documents: DocumentOut[] | null }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">Documents</h2>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-zinc-300">
            <th className="py-2 pr-4">Type</th>
            <th className="py-2 pr-4">Year</th>
            <th className="py-2 pr-4">Received</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {documents?.map((doc) => (
            <tr key={doc.id} className="border-b border-zinc-100">
              <td className="py-2 pr-4">{doc.classified_type ?? "unknown"}</td>
              <td className="py-2 pr-4">{doc.year ?? "—"}</td>
              <td className="py-2 pr-4">
                {new Date(doc.received_at).toLocaleString()}
              </td>
              <td className="py-2 pr-4">
                {doc.download_url ? (
                  <a
                    href={doc.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    View
                  </a>
                ) : (
                  <span className="text-zinc-400">unavailable</span>
                )}
              </td>
            </tr>
          ))}
          {documents?.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-zinc-500">
                No documents uploaded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}

function MemoryNotesSection({ notes }: { notes: ClientMemoryNote[] | null }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium">What we know about this client</h2>
      <p className="text-sm text-zinc-600">
        Durable facts the AI has extracted from this client&apos;s emails,
        used to inform future Q&amp;A answers.
      </p>
      <div className="flex flex-col gap-2">
        {notes?.map((note) => (
          <div
            key={note.id}
            className="border border-zinc-200 rounded px-3 py-2 text-sm"
          >
            <p className="text-zinc-700">{note.note}</p>
            <p className="text-xs text-zinc-500 mt-1">
              {new Date(note.created_at).toLocaleString()}
            </p>
          </div>
        ))}
        {notes?.length === 0 && (
          <p className="text-zinc-500 text-sm">No memory notes yet.</p>
        )}
      </div>
    </section>
  );
}
