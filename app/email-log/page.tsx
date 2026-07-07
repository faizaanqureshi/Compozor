"use client";

import { Fragment, useEffect, useState } from "react";
import {
  ApiError,
  EmailLogEntry,
  EmailStatus,
  listEmailLog,
  sendEmailLogEntry,
} from "@/lib/api";

const statusOptions: { value: EmailStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "received", label: "Received" },
  { value: "draft", label: "Draft" },
  { value: "needs_human_attention", label: "Needs attention" },
  { value: "sent", label: "Sent" },
];

export default function EmailLogPage() {
  const [status, setStatus] = useState<EmailStatus | "all">("all");
  const [entries, setEntries] = useState<EmailLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<Record<number, string>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const refresh = () => {
    listEmailLog(status === "all" ? undefined : status)
      .then(setEntries)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(refresh, [status]);

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
    <div className="flex flex-col gap-6 max-w-5xl">
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
            <th className="py-2 pr-4">Autosend</th>
            <th className="py-2 pr-4">Client</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {entries?.map((entry) => (
            <Fragment key={entry.id}>
              <tr className="border-b border-zinc-100 align-top">
                <td className="py-2 pr-4">
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === entry.id ? null : entry.id)
                    }
                    className="underline text-left"
                  >
                    {entry.subject || "(no subject)"}
                  </button>
                </td>
                <td className="py-2 pr-4">{entry.direction}</td>
                <td className="py-2 pr-4">
                  {entry.status}
                  {entry.status === "needs_human_attention" &&
                    entry.escalation_reason && (
                      <p className="text-xs text-amber-600 mt-0.5 max-w-[16rem]">
                        {entry.escalation_reason}
                      </p>
                    )}
                </td>
                <td className="py-2 pr-4">
                  <AutosendCell entry={entry} />
                </td>
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
                  <td colSpan={6} className="py-3 pr-4 bg-zinc-50">
                    <p className="whitespace-pre-wrap text-zinc-700">
                      {entry.content || "(no body)"}
                    </p>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {entries?.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-zinc-500">
                No entries.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AutosendCell({ entry }: { entry: EmailLogEntry }) {
  if (entry.automation_level_at_decision === null) {
    return <span className="text-xs text-zinc-400">n/a (no automation)</span>;
  }
  return (
    <div className="text-xs flex flex-col gap-0.5">
      <span>
        {entry.autosent ? "autosent" : "not autosent"}
        {entry.autosend_confidence !== null &&
          ` · conf ${entry.autosend_confidence.toFixed(2)}`}
        {entry.autosend_threshold !== null &&
          ` / th ${entry.autosend_threshold.toFixed(2)}`}
      </span>
      {entry.autosend_error && (
        <span className="text-amber-600" title={entry.autosend_error}>
          ⚠ intended to autosend but failed
        </span>
      )}
    </div>
  );
}
