"use client";

import { Fragment, useEffect, useState } from "react";
import { useOrg } from "@/lib/org-context";
import {
  ApiError,
  EmailLogEntry,
  EmailStatus,
  listEmailLog,
  sendEmailLogEntry,
} from "@/lib/api";

const statusOptions: { value: EmailStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "needs_human_attention", label: "Needs attention" },
  { value: "sent", label: "Sent" },
];

function parseContent(content: string): { subject: string; body: string } {
  const match = content.match(/^Subject:\s*(.*)\n+([\s\S]*)$/);
  if (match) return { subject: match[1].trim(), body: match[2].trim() };
  return { subject: "(no subject)", body: content };
}

export default function EmailLogPage() {
  const org = useOrg();
  const [status, setStatus] = useState<EmailStatus | "all">("all");
  const [entries, setEntries] = useState<EmailLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<Record<number, string>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const refresh = () => {
    listEmailLog(org.id, status === "all" ? undefined : status)
      .then(setEntries)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(refresh, [org.id, status]);

  const onSend = async (entry: EmailLogEntry) => {
    setSendingId(entry.id);
    setRowError((prev) => ({ ...prev, [entry.id]: "" }));
    try {
      await sendEmailLogEntry(entry.client_id, entry.id);
      refresh();
    } catch (e) {
      setRowError((prev) => ({
        ...prev,
        [entry.id]: e instanceof ApiError ? e.message : String(e),
      }));
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <h1 className="text-xl font-semibold">Email Log</h1>

      <div className="flex gap-2">
        {statusOptions.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatus(opt.value)}
            className={
              "rounded px-3 py-1 text-sm border " +
              (status === opt.value
                ? "bg-black text-white border-black"
                : "border-zinc-300 text-zinc-700")
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-zinc-300">
            <th className="py-2 pr-4">Subject</th>
            <th className="py-2 pr-4">Direction</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Client</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {entries?.map((entry) => {
            const { subject, body } = parseContent(entry.content);
            return (
              <Fragment key={entry.id}>
                <tr className="border-b border-zinc-100 align-top">
                  <td className="py-2 pr-4">
                    <button
                      onClick={() =>
                        setExpandedId(expandedId === entry.id ? null : entry.id)
                      }
                      className="underline text-left"
                    >
                      {subject}
                    </button>
                  </td>
                  <td className="py-2 pr-4">{entry.direction}</td>
                  <td className="py-2 pr-4">{entry.status}</td>
                  <td className="py-2 pr-4">
                    <a
                      href={`/clients/${entry.client_id}`}
                      className="underline"
                    >
                      #{entry.client_id}
                    </a>
                  </td>
                  <td className="py-2 pr-4">
                    {entry.status === "draft" && (
                      <button
                        onClick={() => onSend(entry)}
                        disabled={sendingId === entry.id}
                        className="rounded bg-black text-white px-3 py-1 disabled:opacity-50"
                      >
                        {sendingId === entry.id ? "Sending…" : "Send"}
                      </button>
                    )}
                    {rowError[entry.id] && (
                      <p className="text-red-600 text-xs mt-1">
                        {rowError[entry.id]}
                      </p>
                    )}
                  </td>
                </tr>
                {expandedId === entry.id && (
                  <tr className="border-b border-zinc-100">
                    <td colSpan={5} className="py-3 pr-4 bg-zinc-50">
                      <p className="whitespace-pre-wrap text-zinc-700">
                        {body || "(no body)"}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {entries?.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-zinc-500">
                No entries.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
