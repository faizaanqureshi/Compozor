"use client";

import { use, useEffect, useState } from "react";
import {
  ApiError,
  ChecklistSummary,
  ClientDetail,
  DocumentUploadResult,
  EmailReplyResult,
  createChecklistItem,
  getClient,
  listChecklistItems,
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
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    getClient(clientId)
      .then(setClient)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    listChecklistItems(clientId)
      .then(setChecklist)
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
          {client.email} · tax year {client.tax_year} · {client.status}
        </p>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <ChecklistSection
        clientId={clientId}
        checklist={checklist}
        onChange={refresh}
      />

      <ReminderSection clientId={clientId} onSent={refresh} />

      <DocumentUploadSection clientId={clientId} onUploaded={refresh} />

      <EmailReplySection clientId={clientId} onSubmitted={refresh} />
    </div>
  );
}

function ChecklistSection({
  clientId,
  checklist,
  onChange,
}: {
  clientId: number;
  checklist: ChecklistSummary | null;
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
          </tr>
        </thead>
        <tbody>
          {checklist?.items.map((item) => (
            <tr key={item.id} className="border-b border-zinc-100">
              <td className="py-2 pr-4">{item.doc_type_needed}</td>
              <td className="py-2 pr-4">{item.status}</td>
              <td className="py-2 pr-4">{item.wrong_attempt_count}</td>
              <td className="py-2 pr-4">{item.last_wrong_doc_type ?? "—"}</td>
            </tr>
          ))}
          {checklist?.items.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-zinc-500">
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
          accept="application/pdf"
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
          <p>Classified as: {result.document.classified_type}</p>
          <p>Checklist status: {result.checklist_item_status ?? "unmatched"}</p>
          <p>Draft email created: {result.draft_email_created ? "yes" : "no"}</p>
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
          <p>
            Escalation email log id: {result.escalation_email_log_id ?? "none"}
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
