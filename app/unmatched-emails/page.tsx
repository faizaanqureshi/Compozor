"use client";

import { useEffect, useState } from "react";
import {
  ApiError,
  InboundEmailCategory,
  InboundEmailReviewStatus,
  UnmatchedInboundEmail,
  dismissUnmatchedInboundEmail,
  listUnmatchedInboundEmails,
} from "@/lib/api";

const reviewStatusOptions: { value: InboundEmailReviewStatus | "all"; label: string }[] = [
  { value: "needs_review", label: "Needs review" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

const categoryOptions: { value: InboundEmailCategory | "all"; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "potential_new_client", label: "Potential new client" },
  { value: "spam", label: "Spam" },
  { value: "automated", label: "Automated" },
  { value: "other", label: "Other" },
];

export default function UnmatchedEmailsPage() {
  const [reviewStatus, setReviewStatus] = useState<
    InboundEmailReviewStatus | "all"
  >("needs_review");
  const [category, setCategory] = useState<InboundEmailCategory | "all">(
    "all"
  );
  const [emails, setEmails] = useState<UnmatchedInboundEmail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<number | null>(null);

  const refresh = () => {
    listUnmatchedInboundEmails({
      review_status: reviewStatus === "all" ? undefined : reviewStatus,
      category: category === "all" ? undefined : category,
    })
      .then(setEmails)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(refresh, [reviewStatus, category]);

  const onDismiss = async (id: number) => {
    setDismissingId(id);
    try {
      await dismissUnmatchedInboundEmail(id);
      refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setDismissingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold">Unmatched Emails</h1>
        <p className="text-sm text-zinc-600">
          Inbound mail whose sender didn&apos;t match any client. AI-triaged
          into a category with a confidence score — catch prospective clients
          or clients emailing from a new address here.
        </p>
      </div>

      <div className="flex gap-6">
        <div className="flex gap-2">
          {reviewStatusOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setReviewStatus(opt.value)}
              className={
                "rounded px-3 py-1 text-sm border " +
                (reviewStatus === opt.value
                  ? "bg-black text-white border-black"
                  : "border-zinc-300 text-zinc-700")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        <select
          value={category}
          onChange={(e) =>
            setCategory(e.target.value as InboundEmailCategory | "all")
          }
          className="border border-zinc-300 rounded px-2 py-1 text-sm"
        >
          {categoryOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      <div className="flex flex-col gap-3">
        {emails?.map((email) => (
          <div
            key={email.id}
            className="border border-zinc-200 rounded p-3 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">
                  {email.subject || "(no subject)"}
                </p>
                <p className="text-xs text-zinc-600">{email.from_email}</p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="rounded bg-zinc-100 px-2 py-0.5">
                  {email.category}
                </span>
                <span className="text-zinc-500">
                  {Math.round(email.ai_confidence * 100)}% confident
                </span>
              </div>
            </div>
            <p className="text-sm text-zinc-700 whitespace-pre-wrap">
              {email.content}
            </p>
            <p className="text-xs text-zinc-500">{email.ai_reason}</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                {email.review_status}
              </span>
              {email.review_status === "needs_review" && (
                <button
                  onClick={() => onDismiss(email.id)}
                  disabled={dismissingId === email.id}
                  className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50"
                >
                  {dismissingId === email.id ? "Dismissing…" : "Dismiss"}
                </button>
              )}
            </div>
          </div>
        ))}
        {emails?.length === 0 && (
          <p className="text-zinc-500 text-sm">No emails found.</p>
        )}
      </div>
    </div>
  );
}
