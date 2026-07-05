"use client";

import { useEffect, useState } from "react";
import { useOrg } from "@/lib/org-context";
import {
  ApiError,
  InboxConnection,
  deleteInboxConnection,
  getGmailConnectUrl,
  listInboxConnections,
} from "@/lib/api";

export default function SettingsPage() {
  const org = useOrg();
  const [connections, setConnections] = useState<InboxConnection[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const refresh = () => {
    listInboxConnections(org.id)
      .then(setConnections)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(refresh, [org.id]);

  const onConnect = async () => {
    setConnecting(true);
    setError(null);
    try {
      const { authorization_url } = await getGmailConnectUrl(org.id);
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
    <div className="flex flex-col gap-6 max-w-2xl">
      <h1 className="text-xl font-semibold">Settings</h1>

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
