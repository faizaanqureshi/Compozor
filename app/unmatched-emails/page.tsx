"use client";

import { Fragment, useMemo, useState } from "react";
import useSWR from "swr";
import { clientsKey, unmatchedEmailsKey } from "@/lib/swr-keys";
import {
  Ban,
  Bot,
  Check,
  ChevronDown,
  HelpCircle,
  Inbox,
  Search,
  UserPlus,
} from "lucide-react";
import {
  ApiError,
  Client,
  ClientStatus,
  InboundEmailCategory,
  InboundEmailReviewStatus,
  UnmatchedInboundEmail,
  createClientFromUnmatchedInboundEmail,
  dismissUnmatchedInboundEmail,
  linkUnmatchedInboundEmail,
  listClients,
  listUnmatchedInboundEmails,
} from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Linkify } from "@/components/linkify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const reviewStatusOptions: { value: InboundEmailReviewStatus | "all"; label: string }[] = [
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

const categoryMeta: Record<
  InboundEmailCategory,
  { label: string; Icon: typeof UserPlus; classes: string }
> = {
  potential_new_client: {
    label: "Prospective client",
    Icon: UserPlus,
    classes: "bg-accent/15 text-accent",
  },
  spam: {
    label: "Spam",
    Icon: Ban,
    classes: "bg-destructive/10 text-destructive",
  },
  automated: {
    label: "Automated",
    Icon: Bot,
    classes: "bg-muted text-muted-foreground",
  },
  other: {
    label: "Unclear",
    Icon: HelpCircle,
    classes: "bg-warning/20 text-warning-foreground",
  },
};

function CategoryBadge({ email }: { email: UnmatchedInboundEmail }) {
  const meta = categoryMeta[email.category];
  const Icon = meta.Icon;
  return (
    <div className="flex flex-col gap-1">
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
          meta.classes
        )}
      >
        <Icon className="size-3.5" />
        {meta.label}
      </span>
      <span className="text-xs text-muted-foreground">
        {Math.round(email.ai_confidence * 100)}% confident
      </span>
    </div>
  );
}

function CategoryDropdown({
  value,
  onChange,
}: {
  value: InboundEmailCategory | "all";
  onChange: (v: InboundEmailCategory | "all") => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = categoryOptions.find((o) => o.value === value)!;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 text-[0.8rem] font-medium text-foreground/80 transition-colors hover:bg-muted/50"
      >
        {selected.label}
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1.5 w-48 overflow-hidden rounded-lg border border-border/60 bg-popover py-1 shadow-md">
            {categoryOptions.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-muted/60",
                  value === opt.value && "font-medium text-foreground"
                )}
              >
                {opt.label}
                {value === opt.value && <Check className="size-3.5" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground/70">
        <Inbox className="size-5" />
      </span>
      <div className="flex flex-col items-center gap-1 text-center">
        <p className="font-medium">Inbox completely clear</p>
        <p className="text-sm text-muted-foreground">
          All incoming client communications have been successfully triaged.
        </p>
      </div>
    </div>
  );
}

function ClientPicker({
  clients,
  onLink,
  linking,
}: {
  clients: Client[];
  onLink: (clientId: number) => void;
  linking: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients
      .filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .slice(0, 8);
  }, [clients, query]);

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex h-8 w-full items-center gap-1.5 rounded-lg border border-border/60 bg-background px-2.5 text-left text-sm text-foreground/80 hover:bg-muted/40"
        >
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate">
            {selected ? selected.name : "Search clients…"}
          </span>
          <ChevronDown className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-border/60 bg-popover shadow-md">
              <div className="border-b border-border/50 p-1.5">
                <Input
                  autoFocus
                  placeholder="Type a name or email…"
                  aria-label="Search clients"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-7"
                />
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                {filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setSelected(c);
                      setOpen(false);
                    }}
                    className="flex w-full flex-col px-3 py-1.5 text-left hover:bg-muted/60"
                  >
                    <span className="text-sm font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.email}</span>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">No matches.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
      <Button
        size="sm"
        disabled={!selected || linking}
        onClick={() => selected && onLink(selected.id)}
      >
        {linking ? "Linking…" : "Link account"}
      </Button>
    </div>
  );
}

function TriageActions({
  email,
  clients,
  onResolved,
}: {
  email: UnmatchedInboundEmail;
  clients: Client[];
  onResolved: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onLink = async (clientId: number) => {
    setBusy(true);
    setError(null);
    try {
      await linkUnmatchedInboundEmail(email.id, clientId);
      onResolved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createClientFromUnmatchedInboundEmail(email.id, {
        name: newName,
        email: email.from_email,
        status: "active" as ClientStatus,
      });
      onResolved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDismiss = async () => {
    setBusy(true);
    setError(null);
    try {
      await dismissUnmatchedInboundEmail(email.id);
      onResolved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 xl:w-72 xl:shrink-0">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Triage actions
      </h3>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs text-muted-foreground">Assign to client</span>
        <ClientPicker clients={clients} onLink={onLink} linking={busy} />
      </div>

      {creating ? (
        <form onSubmit={onCreateClient} className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">New client name</span>
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              required
              placeholder="Jane Doe"
              aria-label="New client name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8"
            />
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-start"
          onClick={() => setCreating(true)}
        >
          <UserPlus />
          Create new client profile
        </Button>
      )}

      {email.review_status === "needs_review" && (
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="self-start text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
        >
          Dismiss message
        </button>
      )}
    </div>
  );
}

export default function UnmatchedEmailsPage() {
  const [reviewStatus, setReviewStatus] = useState<InboundEmailReviewStatus | "all">(
    "needs_review"
  );
  const [category, setCategory] = useState<InboundEmailCategory | "all">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const filters = {
    review_status: reviewStatus === "all" ? undefined : reviewStatus,
    category: category === "all" ? undefined : category,
  };
  const {
    data: emails,
    error: emailsError,
    isLoading: emailsLoading,
    mutate: mutateEmails,
  } = useSWR(unmatchedEmailsKey(filters), () => listUnmatchedInboundEmails(filters));
  const { data: clientsData } = useSWR(clientsKey(), listClients);
  const clients = clientsData ?? [];
  const emailsList = emails ?? [];
  const error = emailsError
    ? emailsError instanceof ApiError
      ? emailsError.message
      : String(emailsError)
    : null;

  const onResolved = () => {
    setExpandedId(null);
    mutateEmails();
  };

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-thin tracking-tight [font-family:var(--font-denton)] sm:text-5xl md:text-6xl">
          Unmatched emails
        </h1>
        <p className="text-sm text-muted-foreground">
          Inbound mail whose sender didn&apos;t match any client profile.
          Unmatched emails are automatically removed after 14 days.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {reviewStatusOptions.map((opt) => (
            <Button
              key={opt.value}
              size="sm"
              variant={reviewStatus === opt.value ? "default" : "ghost"}
              onClick={() => setReviewStatus(opt.value)}
              className="rounded-lg"
            >
              {opt.label}
            </Button>
          ))}
        </div>
        <CategoryDropdown value={category} onChange={setCategory} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="animate-fade-in rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
        {emailsLoading ? (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pt-1 pb-2.5 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Sender
                </th>
                <th className="pt-1 pb-2.5 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Subject
                </th>
                <th className="pt-1 pb-2.5 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  AI category
                </th>
                <th className="pt-1 pb-2.5 pr-4 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Received
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/40">
                  <td colSpan={4} className="py-3 pr-4">
                    <Skeleton className="h-4 w-full" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ) : emailsList.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="pt-1 pb-2.5 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Sender
                </th>
                <th className="pt-1 pb-2.5 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Subject
                </th>
                <th className="pt-1 pb-2.5 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  AI category
                </th>
                <th className="pt-1 pb-2.5 pr-4 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Received
                </th>
              </tr>
            </thead>
            <tbody>
              {emailsList.map((email) => {
                const isOpen = expandedId === email.id;
                return (
                  <Fragment key={email.id}>
                    <tr
                      className="group/row animate-fade-in border-b border-border/40"
                    >
                      <td className="py-3 pr-4 align-top">
                        <button
                          type="button"
                          onClick={() => setExpandedId(isOpen ? null : email.id)}
                          className="flex items-start gap-1.5 text-left font-medium text-foreground/90 hover:underline hover:underline-offset-4"
                        >
                          <ChevronDown
                            className={cn(
                              "mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform",
                              isOpen && "rotate-180"
                            )}
                          />
                          <span className="line-clamp-1">{email.from_email}</span>
                        </button>
                      </td>
                      <td className="py-3 pr-4 align-top text-foreground/70">
                        <span className="line-clamp-1">
                          {email.subject || "(no subject)"}
                        </span>
                      </td>
                      <td className="py-3 pr-4 align-top">
                        <CategoryBadge email={email} />
                      </td>
                      <td className="py-3 pr-4 align-top text-right text-muted-foreground">
                        {formatRelativeTime(email.created_at)}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border/40">
                        <td colSpan={4} className="bg-muted/30 py-4 pr-4 pl-4">
                          <div className="flex flex-col items-start gap-4 xl:flex-row">
                            <p className="flex-1 whitespace-pre-wrap text-foreground/80">
                              <Linkify text={email.body_text} />
                            </p>
                            <TriageActions
                              email={email}
                              clients={clients}
                              onResolved={onResolved}
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
