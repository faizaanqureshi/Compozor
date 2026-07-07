"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  AutomationLevel,
  InboxConnection,
  Organization,
  deleteInboxConnection,
  getGmailConnectUrl,
  getMyOrganization,
  listInboxConnections,
  updateMyOrganization,
} from "@/lib/api";

const automationOptions: { value: AutomationLevel; label: string; description: string }[] = [
  {
    value: "no_automation",
    label: "No automation",
    description: "Every AI-drafted email always needs a human to click send.",
  },
  {
    value: "medium_automation",
    label: "Medium automation",
    description: "Autosends only when the model is quite confident (high bar).",
  },
  {
    value: "high_automation",
    label: "High automation",
    description: "Autosends unless the model's confidence is low (sends most of the time).",
  },
];

function AutomationAndReminderSection() {
  const [current, setCurrent] = useState<Organization | null>(null);
  const [intervalInput, setIntervalInput] = useState("");
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [savingInterval, setSavingInterval] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyOrganization()
      .then((o) => {
        setCurrent(o);
        setIntervalInput(
          o.reminder_interval_days === null
            ? ""
            : String(o.reminder_interval_days)
        );
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, []);

  const onChangeAutomation = async (level: AutomationLevel) => {
    setSavingAutomation(true);
    setError(null);
    try {
      const updated = await updateMyOrganization({
        automation_level: level,
      });
      setCurrent(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSavingAutomation(false);
    }
  };

  const onSaveInterval = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingInterval(true);
    setError(null);
    try {
      const days = intervalInput.trim() === "" ? null : Number(intervalInput);
      const updated = await updateMyOrganization({
        reminder_interval_days: days,
      });
      setCurrent(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSavingInterval(false);
    }
  };

  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Automation level</h2>
        <p className="text-sm text-zinc-600">
          Controls whether AI-drafted emails (checklist reminders,
          document-received acknowledgments, wrong-document follow-ups,
          answered/clarifying client questions) send themselves
          automatically.
        </p>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <div className="flex flex-col gap-2">
          {automationOptions.map((opt) => (
            <label
              key={opt.value}
              className={
                "flex items-start gap-3 rounded border px-3 py-2 cursor-pointer " +
                (current?.automation_level === opt.value
                  ? "border-black bg-zinc-50"
                  : "border-zinc-300")
              }
            >
              <input
                type="radio"
                name="automation_level"
                className="mt-1"
                checked={current?.automation_level === opt.value}
                disabled={savingAutomation || !current}
                onChange={() => onChangeAutomation(opt.value)}
              />
              <span>
                <span className="block font-medium text-sm">{opt.label}</span>
                <span className="block text-xs text-zinc-600">
                  {opt.description}
                </span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Proactive reminders</h2>
        <p className="text-sm text-zinc-600">
          When set, clients with outstanding checklist items who haven&apos;t
          been reminded in this many days get an automatic re-reminder. The
          first reminder to any client is always manual — this only
          re-nudges clients who&apos;ve already been contacted at least once.
          Leave blank to disable.
        </p>
        <form onSubmit={onSaveInterval} className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            placeholder="disabled"
            value={intervalInput}
            onChange={(e) => setIntervalInput(e.target.value)}
            className="border border-zinc-300 rounded px-2 py-1 w-32"
          />
          <span className="text-sm text-zinc-600">days</span>
          <button
            type="submit"
            disabled={savingInterval || !current}
            className="rounded bg-black text-white px-4 py-1.5 disabled:opacity-50"
          >
            {savingInterval ? "Saving…" : "Save"}
          </button>
          {current && (
            <span className="text-xs text-zinc-500">
              Currently:{" "}
              {current.reminder_interval_days === null
                ? "disabled"
                : `every ${current.reminder_interval_days} day(s)`}
            </span>
          )}
        </form>
      </section>
    </>
  );
}

export default function SettingsPage() {
  const [connections, setConnections] = useState<InboxConnection[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const refresh = () => {
    listInboxConnections()
      .then(setConnections)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(refresh, []);

  const onConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const { authorization_url } = await getGmailConnectUrl();
      window.location.href = authorization_url;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setConnecting(false);
    }
  };

  const onDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteInboxConnection(id);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-10 max-w-2xl">
      <h1 className="text-xl font-semibold">Settings</h1>

      <AutomationAndReminderSection />

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Gmail connection</h2>
        {error && <p className="text-red-600 text-sm">{error}</p>}

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-zinc-300">
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {connections?.map((conn) => (
              <tr key={conn.id} className="border-b border-zinc-100">
                <td className="py-2 pr-4">{conn.email_address}</td>
                <td className="py-2 pr-4">
                  {conn.status === "needs_reauth" ? (
                    <span className="text-amber-600">needs reauth</span>
                  ) : (
                    conn.status
                  )}
                </td>
                <td className="py-2 pr-4">
                  <button
                    onClick={() => onDelete(conn.id)}
                    disabled={deletingId === conn.id}
                    className="rounded border border-zinc-300 px-3 py-1 disabled:opacity-50"
                  >
                    {deletingId === conn.id ? "Removing…" : "Disconnect"}
                  </button>
                </td>
              </tr>
            ))}
            {connections?.length === 0 && (
              <tr>
                <td colSpan={3} className="py-4 text-zinc-500">
                  No mailbox connected.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <button
          onClick={onConnect}
          disabled={connecting}
          className="self-start rounded bg-black text-white px-4 py-1.5 disabled:opacity-50"
        >
          {connecting ? "Redirecting…" : "Connect Gmail"}
        </button>
      </section>
    </div>
  );
}
