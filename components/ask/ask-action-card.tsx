"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BadgeCheck,
  BookOpen,
  Check,
  FilePlus2,
  ListChecks,
  Loader2,
  Mail,
  Package,
  Play,
  RotateCcw,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api";
import {
  executeAskAction,
  type AskAction,
  type AskActionKind,
  type AskActionResult,
  type AskEmailPreview,
  type AskKnowledgePreview,
  type AskMessage,
  type AskPackagePreview,
} from "@/lib/ask";
import { cn } from "@/lib/utils";

const EMAIL_KINDS: AskActionKind[] = ["compose_email", "reply_email", "send_draft"];
const VISIBLE_TARGETS = 4;

const ICONS: Record<AskActionKind, LucideIcon> = {
  send_reminder: Mail,
  send_draft: Mail,
  compose_email: Mail,
  reply_email: Mail,
  run_workflow: Play,
  retry_run: RotateCcw,
  approve_run: BadgeCheck,
  mark_received: ListChecks,
  waive_item: ListChecks,
  request_document: FilePlus2,
  create_package: Package,
  assign_package: Package,
  add_knowledge: BookOpen,
};

// What confirming does, in one sentence, shown in the confirmation dialog.
function effect(action: AskAction): string {
  const preview = (action.preview ?? {}) as Record<string, unknown>;
  switch (action.kind) {
    case "send_reminder":
      return "Each client gets one email listing what's still outstanding, from your connected mailbox.";
    case "run_workflow":
      return "Each run starts now with the client's current documents. Follow progress on the client's page.";
    case "retry_run":
      return "The run continues from its saved work. Nothing is sent to the client.";
    case "approve_run":
      return "Marks this result approved, the same as Approve on the client's page.";
    case "mark_received":
      return "These items are marked received, and the client won't be reminded about them.";
    case "waive_item":
      return "These items come off the checklist. Files already matched to them are kept.";
    case "request_document":
      return preview.send_reminder
        ? "Adds it to the checklist and emails the client about it."
        : "Adds it to the checklist. The client isn't emailed.";
    case "create_package":
      return preview.workflow
        ? "Creates the package and the workflow (set to run manually). Nothing is assigned to clients yet."
        : "Creates the package. Nothing is assigned to clients yet.";
    case "assign_package":
      return "Adds the package's documents to each client's checklist.";
    case "add_knowledge":
      return "Saves these to Knowledge as internal-only, with their sources. You can share them with clients from Knowledge.";
    default:
      return "";
  }
}

function resultHref(result: AskActionResult): string | null {
  if (result.package_id) return "/packages";
  if (result.workflow_id) return `/workflows/${result.workflow_id}`;
  if (result.knowledge_entry_id) return "/knowledge";
  if (!result.client_id) return null;
  if (result.email_id) return `/clients/${result.client_id}?email=${result.email_id}#conversation`;
  if (result.run_id) return `/clients/${result.client_id}?run=${result.run_id}#workflows`;
  return `/clients/${result.client_id}`;
}

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : "Couldn't do that. Nothing further was changed.";
}

// A suggestion from Ask, never something it did. The server runs it only
// after this confirmation, from the stored proposal, through the app's own
// endpoints, and records the outcome on the conversation.
export function AskActionCard({
  action: initial,
  conversationId,
  messageId,
  onNavigate,
}: {
  action: AskAction;
  conversationId: number | null;
  messageId?: number;
  onNavigate?: () => void;
}) {
  const [action, setAction] = useState(initial);
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState<"send" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isEmail = EMAIL_KINDS.includes(action.kind);
  const email = isEmail ? (action.preview as AskEmailPreview | null) : null;
  const [subject, setSubject] = useState(email?.subject ?? "");
  const [body, setBody] = useState(email?.body ?? "");
  const Icon = ICONS[action.kind] ?? Mail;
  const ready = conversationId !== null && messageId !== undefined;
  const editable = action.editable.length > 0;

  const run = async (mode: "send" | "draft") => {
    if (!ready) return;
    setRunning(mode);
    setError(null);
    try {
      const edits = editable
        ? { mode, ...(subject !== email?.subject ? { subject } : {}), ...(body !== email?.body ? { body } : {}) }
        : {};
      const message: AskMessage = await executeAskAction(conversationId!, messageId!, action.id, edits);
      const updated = message.actions.find((a) => a.id === action.id);
      if (updated) setAction(updated);
      setConfirming(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRunning(null);
    }
  };

  const results = action.results ?? [];
  const failures = results.filter((r) => !r.ok);
  const handled = Boolean(action.state && action.state !== "running");

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-sm font-medium text-pretty">{action.title}</p>
          {action.description && <p className="text-sm text-pretty text-muted-foreground">{action.description}</p>}
        </div>
        {action.admin_only && (
          <span className="mt-1 shrink-0 text-[0.6875rem] tracking-wider text-muted-foreground uppercase">Admin</span>
        )}
      </div>

      <ActionPreview action={action} results={results} onNavigate={onNavigate} />

      {action.state === "dismissed" ? (
        <p className="text-sm text-muted-foreground">Dismissed.</p>
      ) : handled ? (
        <p className={cn("flex items-center gap-1.5 text-sm", failures.length ? "text-destructive" : "text-success")}>
          {failures.length ? <TriangleAlert className="size-3.5" /> : <Check className="size-3.5" />}
          {failures.length === 0
            ? results.length === 1 ? results[0].detail : `Done for all ${results.length}.`
            : failures.length === results.length
              ? failures[0].detail
              : `${results.length - failures.length} done, ${failures.length} didn't go through.`}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Button size="sm" onClick={() => setConfirming(true)} disabled={!ready || action.state === "running"}>
            {action.state === "running" ? <Loader2 className="animate-spin" /> : null}
            {isEmail ? "Review" : "Review and confirm"}
          </Button>
          <span className="text-xs text-muted-foreground">Nothing happens until you confirm.</span>
        </div>
      )}

      <Dialog open={confirming} onOpenChange={(open) => !running && setConfirming(open)}>
        <DialogContent className={cn(isEmail || action.kind === "create_package" || action.kind === "add_knowledge" ? "sm:max-w-lg" : "sm:max-w-md")}>
          <DialogHeader>
            <DialogTitle className="pr-8">{action.title}</DialogTitle>
            <DialogDescription>
              {isEmail
                ? editable
                  ? `To ${email?.to}. Edit anything, then send it or keep it as a draft in the Email Log.`
                  : `To ${email?.to}, exactly as written, from your connected mailbox.`
                : effect(action)}
            </DialogDescription>
          </DialogHeader>

          {isEmail && email ? (
            editable ? (
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`ask-subject-${action.id}`}>Subject</Label>
                  <Input id={`ask-subject-${action.id}`} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`ask-body-${action.id}`}>Message</Label>
                  <Textarea id={`ask-body-${action.id}`} value={body} onChange={(e) => setBody(e.target.value)} rows={9} maxLength={8000} />
                  {email.note && <p className="text-xs text-muted-foreground">{email.note}</p>}
                </div>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto rounded-lg bg-muted/50 px-3 py-2.5 text-sm whitespace-pre-wrap">
                <p className="mb-1.5 font-medium">{email.subject}</p>
                {email.body}
              </div>
            )
          ) : action.kind === "create_package" ? (
            <PackagePreview preview={action.preview as AskPackagePreview} full />
          ) : action.kind === "add_knowledge" ? (
            <KnowledgePreview preview={action.preview as AskKnowledgePreview} full />
          ) : (
            <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto text-sm">
              {action.targets.map((t, i) => (
                <li key={`${t.client_id}-${i}`}>
                  <span className="font-medium">{t.client_name}</span>
                  {t.detail && <span className="text-muted-foreground"> · {t.detail}</span>}
                </li>
              ))}
            </ul>
          )}

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={running !== null}>
              Cancel
            </Button>
            {editable && (
              <Button variant="outline" onClick={() => void run("draft")} disabled={running !== null || !subject.trim() || !body.trim()}>
                {running === "draft" && <Loader2 className="animate-spin" />}
                Save as draft
              </Button>
            )}
            <Button onClick={() => void run("send")} disabled={running !== null || (editable && (!subject.trim() || !body.trim()))}>
              {running === "send" && <Loader2 className="animate-spin" />}
              {action.confirm_label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ActionPreview({
  action,
  results,
  onNavigate,
}: {
  action: AskAction;
  results: AskActionResult[];
  onNavigate?: () => void;
}) {
  if (EMAIL_KINDS.includes(action.kind) && action.preview) {
    const email = action.preview as AskEmailPreview;
    const result = results[0];
    const href = result ? resultHref(result) : null;
    return (
      <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
        <p className="text-xs text-muted-foreground">To {email.to}</p>
        <p className="mt-1 font-medium">{email.subject}</p>
        <p className="mt-1 line-clamp-3 whitespace-pre-line text-muted-foreground">{email.body}</p>
        {href && (
          <Link href={href} onClick={onNavigate} className="mt-2 inline-block text-xs text-accent underline-offset-4 hover:underline">
            Open in conversation
          </Link>
        )}
      </div>
    );
  }
  if (action.kind === "create_package" && action.preview) {
    return <PackagePreview preview={action.preview as AskPackagePreview} />;
  }
  if (action.kind === "add_knowledge" && action.preview) {
    return <KnowledgePreview preview={action.preview as AskKnowledgePreview} />;
  }
  const shown = action.targets.slice(0, VISIBLE_TARGETS);
  const hidden = action.targets.length - shown.length;
  const extra =
    action.kind === "assign_package" ? ((action.preview as { documents?: string[] } | null)?.documents ?? []) : [];
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60 text-sm">
        {shown.map((target, i) => {
          const result = results.find((r) => r.client_id === target.client_id) ?? (results.length === action.targets.length ? results[i] : undefined);
          const href = result?.ok ? resultHref(result) : null;
          return (
            <li key={`${target.client_id}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">
                <span className="font-medium">{target.client_name}</span>
                {target.detail && <span className="text-muted-foreground"> · {target.detail}</span>}
              </span>
              {result ? (
                result.ok ? (
                  href ? (
                    <Link href={href} onClick={onNavigate} aria-label={result.detail} className="shrink-0 text-success">
                      <Check className="size-3.5" />
                    </Link>
                  ) : (
                    <Check className="size-3.5 shrink-0 text-success" aria-label={result.detail} />
                  )
                ) : (
                  <span className="shrink-0 truncate text-xs text-destructive" title={result.detail}>
                    {result.detail}
                  </span>
                )
              ) : (
                target.last_reminder && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    reminded {new Date(`${target.last_reminder}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                )
              )}
            </li>
          );
        })}
        {hidden > 0 && <li className="px-3 py-2 text-muted-foreground">and {hidden} more</li>}
      </ul>
      {extra.length > 0 && <p className="text-xs text-muted-foreground">Adds: {extra.join(", ")}</p>}
    </div>
  );
}

function PackagePreview({ preview, full }: { preview: AskPackagePreview; full?: boolean }) {
  const docs = full ? preview.documents : preview.documents.slice(0, 5);
  return (
    <div className={cn("flex flex-col gap-3 text-sm", full && "max-h-[22rem] overflow-y-auto pr-1")}>
      <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
        {docs.map((d) => (
          <li key={d.doc_type_needed} className="flex flex-col gap-0.5 px-3 py-2">
            <span className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{d.doc_type_needed}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {d.is_required ? "Required" : "Optional"}
                {d.allows_multiple ? " · several files" : ""}
              </span>
            </span>
            {d.description && <span className="text-muted-foreground">{d.description}</span>}
          </li>
        ))}
        {!full && preview.documents.length > docs.length && (
          <li className="px-3 py-2 text-muted-foreground">and {preview.documents.length - docs.length} more</li>
        )}
      </ul>
      {preview.workflow && (
        <div className="rounded-lg bg-muted/50 px-3 py-2.5">
          <p className="text-[0.6875rem] tracking-wider text-muted-foreground uppercase">Workflow</p>
          <p className="mt-1 font-medium">{preview.workflow.name}</p>
          <p className={cn("mt-1 whitespace-pre-line text-muted-foreground", !full && "line-clamp-3")}>
            {preview.workflow.instructions}
          </p>
        </div>
      )}
    </div>
  );
}

// What will be saved to Knowledge: each entry's title, text and the page it
// came from, so staff can check the source before confirming.
function KnowledgePreview({ preview, full }: { preview: AskKnowledgePreview; full?: boolean }) {
  return (
    <ul
      className={cn(
        "flex flex-col divide-y divide-border/60 rounded-lg border border-border/60 text-sm",
        full && "max-h-[22rem] overflow-y-auto",
      )}
    >
      {preview.entries.map((entry) => (
        <li key={entry.title} className="flex flex-col gap-1 px-3 py-2">
          <span className="font-medium">{entry.title}</span>
          <span className={cn("whitespace-pre-line text-muted-foreground", !full && "line-clamp-2")}>{entry.body}</span>
          {entry.source_url && (
            <a
              href={entry.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-xs text-accent underline-offset-4 hover:underline"
            >
              {entry.source_title || entry.source_url}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
