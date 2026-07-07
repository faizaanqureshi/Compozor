"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  Client,
  ClientStatus,
  createClient,
  listClients,
} from "@/lib/api";

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<ClientStatus>("pending");
  const [submitting, setSubmitting] = useState(false);

  const refresh = () => {
    listClients()
      .then(setClients)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(refresh, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createClient({
        name,
        email,
        status,
      });
      setName("");
      setEmail("");
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-8 max-w-3xl">
      <h1 className="text-xl font-semibold">Clients</h1>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left border-b border-zinc-300">
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Email</th>
            <th className="py-2 pr-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {clients?.map((c) => (
            <tr key={c.id} className="border-b border-zinc-100">
              <td className="py-2 pr-4">
                <Link href={`/clients/${c.id}`} className="underline">
                  {c.name}
                </Link>
              </td>
              <td className="py-2 pr-4">{c.email}</td>
              <td className="py-2 pr-4">{c.status}</td>
            </tr>
          ))}
          {clients?.length === 0 && (
            <tr>
              <td colSpan={3} className="py-4 text-zinc-500">
                No clients yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <form onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-zinc-200 pt-6">
        <h2 className="font-medium">Add client</h2>
        <div className="flex gap-3">
          <input
            required
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border border-zinc-300 rounded px-2 py-1"
          />
          <input
            required
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-zinc-300 rounded px-2 py-1"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ClientStatus)}
            className="border border-zinc-300 rounded px-2 py-1"
          >
            <option value="pending">pending</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded bg-black text-white px-4 py-1.5 disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add client"}
        </button>
      </form>
    </div>
  );
}
