"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { clientsKey, unmatchedEmailsKey } from "@/lib/swr-keys";
import { ArrowLeft, Check, ChevronDown, Inbox, Search, UserPlus } from "lucide-react";
import {
  ApiError,
  Client,
  ClientStatus,
  InboundEmailCategory,
  InboundEmailReviewStatus,
  UnmatchedInboundEmail,
  createClientFromUnmatchedInboundEmail,
  dismissUnmatchedInboundEmail,
  getUnmatchedEmailHtml,
  linkUnmatchedInboundEmail,
  listClients,
  listUnmatchedInboundEmails,
} from "@/lib/api";
import { snippet } from "@/lib/email-content";
import { cn, formatRelativeTime } from "@/lib/utils";
import { EmailBody } from "@/components/email-body";
import { EmailHtmlFrame } from "@/components/email-html-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";

type View = InboundEmailReviewStatus | "all";

const viewOptions: { value: View; label: string }[] = [
  { value: "needs_review", label: "Needs review" },
  { value: "dismissed", label: "Dismissed" },
  { value: "all", label: "All" },
];

const categoryOptions: { value: InboundEmailCategory | "all"; label: string }[] = [
  { value: "all", label: "All categories" },
  { value: "potential_new_client", label: "Prospective client" },
  { value: "spam", label: "Spam" },
  { value: "automated", label: "Automated" },
  { value: "other", label: "Unclear" },
];

// The AI's read on each email, as a dot and a word. A prospective client is
// the signal worth noticing; "unclear" asks a person to look; spam and
// automated mail stay quiet.
const categoryMeta: Record<InboundEmailCategory, { label: string; dot: string; text: string }> = {
  potential_new_client: { label: "Prospective client", dot: "bg-accent", text: "text-accent" },
  other: { label: "Unclear", dot: "bg-warning", text: "text-warning-foreground" },
  automated: { label: "Automated", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
  spam: { label: "Spam", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function CategoryLabel({ email, className }: { email: UnmatchedInboundEmail; className?: string }) {
  const meta = categoryMeta[email.category];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-medium", meta.text, className)}>
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export default function UnmatchedEmailsPage() {
  const [view, setView] = useState<View>("needs_review");
  const [category, setCategory] = useState<InboundEmailCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  // One request for everything (unmatched mail is removed after 14 days, so
  // the set stays small); filtering here gives every tab a live count.
  const {
    data: emails,
    error: emailsError,
    isLoading: loading,
    mutate: mutateEmails,
  } = useSWR(unmatchedEmailsKey(), () => listUnmatchedInboundEmails());
  const { data: clientsData } = useSWR(clientsKey(), listClients);
  const clients = clientsData ?? [];
  const error = emailsError ? (emailsError instanceof ApiError ? emailsError.message : String(emailsError)) : null;

  // Category and search narrow every tab; the tab picks the review status.
  const matching = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...(emails ?? [])]
      .filter((e) => category === "all" || e.category === category)
      .filter(
        (e) =>
          !q ||
          e.from_email.toLowerCase().includes(q) ||
          (e.subject ?? "").toLowerCase().includes(q) ||
          e.body_text.toLowerCase().includes(q)
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [emails, category, query]);

  const viewCounts = useMemo(() => {
    const counts: Record<View, number> = { needs_review: 0, dismissed: 0, all: matching.length };
    for (const e of matching) counts[e.review_status]++;
    return counts;
  }, [matching]);

  const visible = useMemo(
    () => (view === "all" ? matching : matching.filter((e) => e.review_status === view)),
    [matching, view]
  );

  // Keep a message open: the chosen one while it's listed, otherwise the
  // newest, so linking or dismissing moves straight on to the next email.
  const selected = visible.find((e) => e.id === selectedId) ?? visible[0] ?? null;

  const onResolved = async () => {
    setMobileDetailOpen(false);
    await mutateEmails();
  };

  return (
    <div className="flex h-[calc(100vh-6.5rem)] w-full flex-col gap-6 md:h-[calc(100vh-3rem)] xl:h-[calc(100vh-5rem)]">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-4xl leading-tight font-thin tracking-tight [font-family:var(--font-denton)] md:text-5xl">
          Unmatched emails
        </h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Mail from senders who aren&apos;t clients yet. Link each one to a client, create a profile, or dismiss it.
          Unmatched emails are removed after 14 days.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter emails" className="flex flex-wrap items-center gap-1">
          {viewOptions.map((opt) => {
            const count = viewCounts[opt.value];
            const active = view === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setView(opt.value)}
                className={cn(
                  "inline-flex h-8 items-center gap-2 rounded-lg px-3 text-[0.8125rem] transition-colors",
                  active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {opt.value === "needs_review" && count > 0 && !active && (
                  <span className="size-1.5 rounded-full bg-warning" />
                )}
                {opt.label}
                {!loading && (
                  <span className={cn("tabular-nums", active ? "text-background/70" : "text-muted-foreground/70")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <NativeSelect
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value as InboundEmailCategory | "all")}
            className="sm:w-48 [&_select]:h-9"
          >
            {categoryOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </NativeSelect>
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search senders, subjects, messages"
              aria-label="Search unmatched emails"
              className="h-9 pl-9"
            />
          </div>
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex min-h-0 flex-1 flex-col gap-6 xl:flex-row">
        <div
          className={cn(
            "w-full flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:flex md:max-h-80 md:shrink-0 xl:max-h-none xl:w-[24rem]",
            mobileDetailOpen ? "hidden md:flex" : "flex"
          )}
        >
          <div className="flex min-h-12 items-center border-b border-border px-4">
            <span className="text-[0.8125rem] text-muted-foreground">
              {loading ? "Loading…" : `${visible.length} email${visible.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading &&
              Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2 border-b border-border/60 px-4 py-3.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-5/6" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            {!loading &&
              visible.map((email) => (
                <EmailRow
                  key={email.id}
                  email={email}
                  selected={email.id === selected?.id}
                  onSelect={() => {
                    setSelectedId(email.id);
                    setMobileDetailOpen(true);
                  }}
                />
              ))}
            {!loading && visible.length === 0 && (
              <div className="flex animate-fade-in flex-col items-center gap-2 px-4 py-10 text-center">
                {query || category !== "all" ? (
                  <p className="text-sm text-muted-foreground">No emails match these filters.</p>
                ) : view === "needs_review" ? (
                  <>
                    <Check className="size-4 text-success" />
                    <p className="text-sm text-muted-foreground">Nothing to triage. Every sender has been handled.</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Nothing here right now.</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto rounded-xl bg-card ring-1 ring-foreground/10 md:block",
            mobileDetailOpen ? "block" : "hidden"
          )}
        >
          {loading ? (
            <div className="flex flex-col gap-5 p-6 sm:p-8">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-72" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : selected ? (
            <EmailView
              key={selected.id}
              email={selected}
              clients={clients}
              onBack={() => setMobileDetailOpen(false)}
              onResolved={onResolved}
            />
          ) : (
            <div className="flex h-full animate-fade-in flex-col items-center justify-center gap-2 p-10 text-center">
              <Inbox className="size-5 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">Select an email to read it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EmailRow({
  email,
  selected,
  onSelect,
}: {
  email: UnmatchedInboundEmail;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected || undefined}
      onClick={onSelect}
      className={cn(
        "relative flex w-full flex-col gap-1 border-b border-border/60 px-4 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        selected && "bg-muted/50 before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-foreground hover:bg-muted/50"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{email.from_email}</span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatRelativeTime(email.created_at)}</span>
      </div>
      <span className="truncate text-[0.8125rem] text-foreground/85">{email.subject || "(no subject)"}</span>
      <span className="line-clamp-1 text-xs text-muted-foreground">{snippet(email.body_text) || "No message body."}</span>
      <div className="mt-1 flex items-center gap-3">
        <CategoryLabel email={email} />
        {email.review_status === "dismissed" && <span className="text-xs text-muted-foreground">Dismissed</span>}
      </div>
    </button>
  );
}

function EmailView({
  email,
  clients,
  onBack,
  onResolved,
}: {
  email: UnmatchedInboundEmail;
  clients: Client[];
  onBack: () => void;
  onResolved: () => Promise<void>;
}) {
  return (
    <div className="flex animate-fade-in flex-col">
      <header className="z-10 flex flex-col gap-3 border-b border-border/70 bg-card px-4 py-4 sm:sticky sm:top-0 sm:px-6 sm:py-5 lg:px-8">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden"
        >
          <ArrowLeft className="size-3.5" />
          All emails
        </button>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-xl leading-snug font-light tracking-tight text-balance">{email.subject || "(no subject)"}</h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="break-all text-foreground">{email.from_email}</span>
            <span aria-hidden className="text-muted-foreground/50">·</span>
            <time dateTime={email.created_at} title={new Date(email.created_at).toLocaleString()}>
              {formatDateTime(email.created_at)}
            </time>
            {email.review_status === "dismissed" && (
              <>
                <span aria-hidden className="text-muted-foreground/50">·</span>
                Dismissed
              </>
            )}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-5 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        {/* Why the AI filed it the way it did. */}
        <div className="flex flex-col gap-1.5 rounded-lg bg-muted/50 px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CategoryLabel email={email} />
            <span className="text-xs text-muted-foreground tabular-nums">
              {Math.round(email.ai_confidence * 100)}% confident
            </span>
          </div>
          {email.ai_reason && (
            <p className="text-pretty text-muted-foreground">
              {email.ai_reason}
            </p>
          )}
        </div>

        <article className="flex min-w-0 flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/15 sm:p-5">
          {email.has_html ? (
            <EmailHtmlFrame
              cacheKey={["unmatched-email-html", email.id]}
              load={() => getUnmatchedEmailHtml(email.id)}
              fallback={<EmailBody content={email.body_text} className="max-w-prose" />}
            />
          ) : (
            <EmailBody content={email.body_text} className="max-w-prose" />
          )}
        </article>

        <TriagePanel email={email} clients={clients} onResolved={onResolved} />
      </div>
    </div>
  );
}

// Everything staff can do with an unmatched email, in the order it usually
// happens: attach it to an existing client, make the sender a client, or
// set it aside.
function TriagePanel({
  email,
  clients,
  onResolved,
}: {
  email: UnmatchedInboundEmail;
  clients: Client[];
  onResolved: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState<"link" | "create" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "link" | "create" | "dismiss", action: () => Promise<unknown>) => {
    setBusy(kind);
    setError(null);
    try {
      await action();
      await onResolved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <section
      aria-label="Triage"
      className="flex flex-col gap-5 rounded-xl bg-card p-4 ring-1 ring-foreground/15 sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-[0.9375rem] font-medium tracking-tight">Who is this from?</h3>
        <p className="text-sm text-muted-foreground">
          Link it to an existing client, or make the sender a new one.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Existing client</Label>
        <ClientPicker
          clients={clients}
          linking={busy === "link"}
          disabled={busy !== null}
          onLink={(clientId) => run("link", () => linkUnmatchedInboundEmail(email.id, clientId))}
        />
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      {creating ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run("create", () =>
              createClientFromUnmatchedInboundEmail(email.id, {
                name: newName,
                email: email.from_email,
                status: "active" as ClientStatus,
              })
            );
          }}
          className="flex flex-col gap-1.5"
        >
          <Label htmlFor={`new-client-${email.id}`}>New client name</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id={`new-client-${email.id}`}
              autoFocus
              required
              placeholder="Jane Doe"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={busy !== null} onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy !== null || !newName.trim()}>
                {busy === "create" ? "Creating…" : "Create client"}
              </Button>
            </div>
          </div>
          <span className="text-xs text-muted-foreground">Their email will be {email.from_email}.</span>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={busy !== null}
          onClick={() => setCreating(true)}
        >
          <UserPlus />
          Create a client from this sender
        </Button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {email.review_status === "needs_review" && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <span className="text-xs text-muted-foreground">Not a client matter?</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy !== null}
            onClick={() => run("dismiss", () => dismissUnmatchedInboundEmail(email.id))}
          >
            {busy === "dismiss" ? "Dismissing…" : "Dismiss"}
          </Button>
        </div>
      )}
    </section>
  );
}

function ClientPicker({
  clients,
  onLink,
  linking,
  disabled,
}: {
  clients: Client[];
  onLink: (clientId: number) => void;
  linking: boolean;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? clients.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      : clients;
    return list.slice(0, 8);
  }, [clients, query]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-expanded={open}
          className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm transition-colors hover:border-foreground/20 disabled:opacity-60"
        >
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn("flex-1 truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.name : "Search clients…"}
          </span>
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 z-20 mt-1.5 w-full overflow-hidden rounded-xl bg-popover shadow-md ring-1 ring-foreground/10">
              <div className="border-b border-border/60 p-2">
                <Input
                  autoFocus
                  placeholder="Type a name or email…"
                  aria-label="Search clients"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelected(c);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{c.email}</span>
                    </span>
                    {selected?.id === c.id && <Check className="size-3.5 shrink-0" />}
                  </button>
                ))}
                {filtered.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No matches.</p>}
              </div>
            </div>
          </>
        )}
      </div>
      <Button disabled={!selected || disabled} onClick={() => selected && onLink(selected.id)}>
        {linking ? "Linking…" : "Link to client"}
      </Button>
    </div>
  );
}
