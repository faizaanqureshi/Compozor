"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Loader2,
  MoreHorizontal,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import {
  ApiError,
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistSummary,
  ClientCommitment,
  ClientDetail,
  ClientMemoryNote,
  CommitmentStatus,
  DocumentOut,
  DocumentUploadResult,
  EmailThread,
  createChecklistItem,
  deleteClient,
  deleteClientMemoryNote,
  downloadClientDocumentsZip,
  getClient,
  listChecklistItems,
  listClientCommitments,
  listClientDocuments,
  listClientMemoryNotes,
  listEmailThreads,
  resolveClientCommitment,
  sendChecklistItemReminder,
  sendChecklistReminder,
  updateChecklistItem,
  uploadDocument,
  waiveChecklistItem,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { AgentActivityDisclosure } from "@/components/agent-activity-disclosure";
import { Linkify } from "@/components/linkify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </h2>
          {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

const statusPillClasses: Record<ChecklistItemStatus, string> = {
  received: "bg-accent/15 text-accent",
  missing: "bg-amber-500/20 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  wrong: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
};

const statusLabels: Record<ChecklistItemStatus, string> = {
  received: "Received",
  missing: "Missing",
  wrong: "Wrong",
};

function StatusPill({ status }: { status: ChecklistItemStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        statusPillClasses[status]
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const clientId = Number(id);

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [checklist, setChecklist] = useState<ChecklistSummary | null>(null);
  const [threads, setThreads] = useState<EmailThread[] | null>(null);
  const [documents, setDocuments] = useState<DocumentOut[] | null>(null);
  const [memoryNotes, setMemoryNotes] = useState<ClientMemoryNote[] | null>(
    null
  );
  const [commitments, setCommitments] = useState<ClientCommitment[] | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const refresh = () => {
    getClient(clientId)
      .then(setClient)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    listChecklistItems(clientId)
      .then(setChecklist)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    listEmailThreads(clientId)
      .then(setThreads)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    listClientDocuments(clientId)
      .then(setDocuments)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    listClientMemoryNotes(clientId)
      .then(setMemoryNotes)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
    listClientCommitments(clientId)
      .then(setCommitments)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(refresh, [clientId]);

  if (error && !client) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="flex w-full flex-col gap-8">
      <div>
        <div className="flex items-center justify-between">
          <Link
            href="/clients"
            className="-ml-3 mt-2 mb-4 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Clients
          </Link>
          {client !== null && (
            <DeleteClientButton
              clientId={clientId}
              clientName={client.name}
              onDeleted={() => router.push("/clients")}
            />
          )}
        </div>
        {client === null ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-14 w-72" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-40" />
          </div>
        ) : (
          <div className="flex flex-col gap-2 animate-blur-in-sm">
            <h1 className="text-4xl font-thin tracking-tight [font-family:var(--font-denton)] sm:text-5xl md:text-6xl">
              {client.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              {client.email} · {client.status}
            </p>
            <p className="text-xs text-muted-foreground/70">
              Last reminder sent:{" "}
              {client.last_reminder_sent_at
                ? new Date(client.last_reminder_sent_at).toLocaleString()
                : "never"}
            </p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <ChecklistCard
        clientId={clientId}
        checklist={checklist}
        documents={documents}
        onChange={refresh}
      />

      <WaitingOnCard
        clientId={clientId}
        commitments={commitments}
        onChange={refresh}
      />

      <CommunicationCard
        clientId={clientId}
        client={client}
        threads={threads}
        onChange={refresh}
      />

      <DocumentVaultCard
        clientId={clientId}
        documents={documents}
        checklist={checklist}
        onChange={refresh}
      />

      <MemoryNotesCard
        clientId={clientId}
        notes={memoryNotes}
        onChange={refresh}
      />
    </div>
  );
}

function DeleteClientButton({
  clientId,
  clientName,
  onDeleted,
}: {
  clientId: number;
  clientName: string;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteClient(clientId);
      onDeleted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setDeleting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 mb-4 text-muted-foreground hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-4" />
        Delete client
      </Button>

      <Dialog open={confirming} onOpenChange={(open) => !deleting && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {clientName}?</DialogTitle>
            <DialogDescription>
              This permanently deletes this client along with all of their
              checklist items, uploaded documents, email logs, and memory
              notes. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChecklistCard({
  clientId,
  checklist,
  documents,
  onChange,
}: {
  clientId: number;
  checklist: ChecklistSummary | null;
  documents: DocumentOut[] | null;
  onChange: () => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [docTypeNeeded, setDocTypeNeeded] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const actionRequired = checklist ? checklist.missing + checklist.wrong : 0;

  const onDownloadZip = async () => {
    setDownloading(true);
    try {
      await downloadClientDocumentsZip(clientId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  };

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
      setShowAddForm(false);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SectionCard
      title="Checklist requirements"
      subtitle={
        checklist && (
          <div className="flex items-center gap-2">
            <span>{checklist.total} total</span>
            {actionRequired > 0 && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
                {actionRequired} action required
              </span>
            )}
          </div>
        )
      }
      action={
        documents && documents.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={downloading}
            onClick={onDownloadZip}
          >
            {downloading ? <Loader2 className="animate-spin" /> : <Download />}
            {downloading ? "Zipping…" : "Download all"}
          </Button>
        ) : undefined
      }
    >
      {checklist === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto">
      <table
        className="w-full min-w-[640px] border-collapse text-sm animate-blur-in-sm"
        style={{ animationDelay: "60ms" }}
      >
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Doc type
            </th>
            <th className="py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Status
            </th>
            <th className="py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Wrong attempts
            </th>
            <th className="py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Last wrong type
            </th>
            <th className="py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Document
            </th>
            <th className="py-1.5 pr-0 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {checklist?.items.map((item) => {
            const matched = documents
              ?.filter((d) => d.checklist_item_id === item.id)
              .sort((a, b) => b.received_at.localeCompare(a.received_at))[0];
            return (
              <tr key={item.id} className="border-b border-border/40">
                <td className="py-2 pr-4 font-medium">{item.doc_type_needed}</td>
                <td className="py-2 pr-4">
                  <StatusPill status={item.status} />
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {item.wrong_attempt_count}
                </td>
                <td className="py-2 pr-4 text-muted-foreground">
                  {item.last_wrong_doc_type ?? "—"}
                </td>
                <td className="py-2 pr-4">
                  {matched ? (
                    matched.download_url ? (
                      <a
                        href={matched.download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-4"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-muted-foreground">uploaded</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 pr-0 text-right">
                  <ChecklistItemActions
                    clientId={clientId}
                    item={item}
                    onChange={onChange}
                  />
                </td>
              </tr>
            );
          })}
          {checklist?.items.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-muted-foreground">
                No checklist items yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {showAddForm ? (
        <form
          onSubmit={onSubmit}
          className="flex items-start gap-2 border-t border-border/60 pt-4"
        >
          <Input
            required
            autoFocus
            placeholder="Doc type (e.g. T4, T4A, T5, NOA, bank_statement, qbo_export, receipt)"
            value={docTypeNeeded}
            onChange={(e) => setDocTypeNeeded(e.target.value)}
            className="flex-1"
          />
          <Input
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1"
          />
          <Button type="submit" disabled={submitting} size="sm">
            {submitting ? "Adding…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowAddForm(false)}
          >
            <X />
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 self-start border-t border-transparent pt-1 text-sm font-medium text-accent underline-offset-4 transition-colors hover:text-accent/70 hover:underline"
        >
          <Plus className="size-3.5" />
          Add requirement
        </button>
      )}
    </SectionCard>
  );
}

function ChecklistItemActions({
  clientId,
  item,
  onChange,
}: {
  clientId: number;
  item: ChecklistItem;
  onChange: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingWaive, setConfirmingWaive] = useState(false);

  const isOutstanding = item.status === "missing" || item.status === "wrong";

  const onAccept = async () => {
    setPending(true);
    setError(null);
    try {
      await updateChecklistItem(clientId, item.id, { status: "received" });
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const onRequestReupload = async () => {
    setPending(true);
    setError(null);
    try {
      await sendChecklistItemReminder(clientId, item.id);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const onWaive = async () => {
    setPending(true);
    setError(null);
    try {
      await waiveChecklistItem(clientId, item.id);
      setConfirmingWaive(false);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" disabled={pending} />
          }
        >
          <MoreHorizontal />
          <span className="sr-only">Row actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem disabled={item.status === "received"} onClick={onAccept}>
            Accept anyway
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!isOutstanding} onClick={onRequestReupload}>
            Request re-upload
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmingWaive(true)}
          >
            Waive requirement
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmingWaive} onOpenChange={setConfirmingWaive}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waive requirement</DialogTitle>
            <DialogDescription>
              This removes “{item.doc_type_needed}” from this client’s
              checklist. Any document already matched to it stays on file,
              but the requirement itself can’t be recovered.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingWaive(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onWaive} disabled={pending}>
              {pending ? "Waiving…" : "Waive requirement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const commitmentPillClasses: Record<CommitmentStatus, string> = {
  pending: "bg-amber-500/20 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  fulfilled: "bg-accent/15 text-accent",
  cancelled: "bg-muted text-muted-foreground",
  escalated: "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400",
};

const commitmentLabels: Record<CommitmentStatus, string> = {
  pending: "Pending",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  escalated: "Escalated",
};

function CommitmentPill({ status }: { status: CommitmentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        commitmentPillClasses[status]
      )}
    >
      {commitmentLabels[status]}
    </span>
  );
}

function WaitingOnCard({
  clientId,
  commitments,
  onChange,
}: {
  clientId: number;
  commitments: ClientCommitment[] | null;
  onChange: () => void;
}) {
  return (
    <SectionCard
      title="Waiting on"
      subtitle="Promises this client has made to send something, tracked automatically from their emails."
    >
      {commitments === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
      <div className="overflow-x-auto">
      <table
        className="w-full min-w-[560px] border-collapse text-sm animate-blur-in-sm"
        style={{ animationDelay: "90ms" }}
      >
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Promise
            </th>
            <th className="py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Expected by
            </th>
            <th className="py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Status
            </th>
            <th className="py-1.5 pr-0 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {commitments.map((c) => {
            const overdue =
              c.status === "pending" &&
              c.expected_by !== null &&
              c.expected_by < new Date().toISOString().slice(0, 10);
            return (
              <tr key={c.id} className="border-b border-border/40">
                <td className="py-2 pr-4 font-medium">{c.description}</td>
                <td
                  className={cn(
                    "py-2 pr-4",
                    overdue ? "font-medium text-red-600 dark:text-red-400" : "text-muted-foreground"
                  )}
                >
                  {c.expected_by ?? "no date given"}
                </td>
                <td className="py-2 pr-4">
                  <CommitmentPill status={c.status} />
                </td>
                <td className="py-2 pr-0 text-right">
                  {(c.status === "pending" || c.status === "escalated") && (
                    <CommitmentResolveActions
                      clientId={clientId}
                      commitment={c}
                      onChange={onChange}
                    />
                  )}
                </td>
              </tr>
            );
          })}
          {commitments.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-muted-foreground">
                No outstanding promises from this client.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      )}
    </SectionCard>
  );
}

function CommitmentResolveActions({
  clientId,
  commitment,
  onChange,
}: {
  clientId: number;
  commitment: ClientCommitment;
  onChange: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<"fulfilled" | "cancelled" | null>(null);

  const onResolve = async (status: "fulfilled" | "cancelled") => {
    setPending(true);
    setError(null);
    try {
      await resolveClientCommitment(clientId, commitment.id, status);
      setConfirming(null);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => setConfirming("fulfilled")}
      >
        Mark resolved
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="text-muted-foreground hover:text-destructive"
        disabled={pending}
        onClick={() => setConfirming("cancelled")}
      >
        Cancel
      </Button>

      <Dialog open={confirming !== null} onOpenChange={(open) => !pending && !open && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirming === "fulfilled" ? "Mark this promise resolved?" : "Cancel this promise?"}
            </DialogTitle>
            <DialogDescription>
              {confirming === "fulfilled"
                ? `This marks "${commitment.description}" as fulfilled - use this if the client delivered it some other way (in person, a different channel).`
                : `This marks "${commitment.description}" as cancelled - use this if it's no longer relevant.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)} disabled={pending}>
              Back
            </Button>
            <Button
              variant={confirming === "cancelled" ? "destructive" : "default"}
              onClick={() => confirming && onResolve(confirming)}
              disabled={pending}
            >
              {pending ? "Saving…" : confirming === "fulfilled" ? "Mark resolved" : "Cancel promise"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CommunicationCard({
  clientId,
  client,
  threads,
  onChange,
}: {
  clientId: number;
  client: ClientDetail | null;
  threads: EmailThread[] | null;
  onChange: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const pendingReminder = threads
    ?.flatMap((t) => t.messages)
    .filter((m) => m.direction === "outbound" && m.status === "draft")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const onSendReminder = async () => {
    setSending(true);
    setMessage(null);
    try {
      await sendChecklistReminder(clientId);
      setMessage("Reminder sent — check the Email Log.");
      onChange();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <SectionCard title="Communication hub">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button onClick={onSendReminder} disabled={sending}>
            {sending ? "Sending…" : "Send reminder email"}
          </Button>
          {message && <p className="text-sm text-muted-foreground">{message}</p>}
        </div>
        {client === null ? (
          <Skeleton className="h-3 w-40" />
        ) : (
        <p
          className="text-xs text-muted-foreground animate-blur-in-sm"
          style={{ animationDelay: "120ms" }}
        >
          Last sent:{" "}
          {client.last_reminder_sent_at
            ? new Date(client.last_reminder_sent_at).toLocaleString()
            : "never"}
          {pendingReminder && (
            <>
              {" "}
              · A reminder drafted{" "}
              {new Date(pendingReminder.created_at).toLocaleString()} is
              awaiting send
            </>
          )}
        </p>
        )}
      </div>

      <Separator className="bg-border/60" />

      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Email threads
        </h3>
        <ThreadsList threads={threads} />
      </div>
    </SectionCard>
  );
}

function ThreadsList({ threads }: { threads: EmailThread[] | null }) {
  const [expandedThread, setExpandedThread] = useState<string | null>(null);

  if (threads === null) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  return (
    <div
      className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/60 animate-blur-in-sm"
      style={{ animationDelay: "120ms" }}
    >
      {threads?.map((thread) => {
        const latest = thread.messages[thread.messages.length - 1];
        const isOpen = expandedThread === thread.thread_key;
        return (
          <div key={thread.thread_key}>
            <button
              type="button"
              onClick={() =>
                setExpandedThread(isOpen ? null : thread.thread_key)
              }
              className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <span className="truncate text-sm font-medium">
                {latest?.subject || "(no subject)"}
              </span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {thread.messages.length} message
                {thread.messages.length === 1 ? "" : "s"}
                <ChevronDown
                  className={cn(
                    "size-3.5 transition-transform",
                    isOpen && "rotate-180"
                  )}
                />
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-col divide-y divide-border/40 border-t border-border/60 bg-muted/30">
                {thread.messages.map((m) => (
                  <div key={m.id} className="px-3.5 py-2.5 text-sm">
                    <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        {m.direction} · {m.status}
                        {m.is_clarifying_question && (
                          <span
                            title="Clarifying question — awaiting a resolving reply"
                            className="inline-flex size-4 items-center justify-center rounded-full bg-accent/15 text-[10px] font-semibold text-accent"
                          >
                            ?
                          </span>
                        )}
                      </span>
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-foreground/80">
                      <Linkify text={m.content} />
                    </p>
                    {m.escalation_reason && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-500">
                        {m.escalation_reason}
                      </p>
                    )}
                    {m.tool_trajectory && m.tool_trajectory.length > 0 && (
                      <AgentActivityDisclosure trajectory={m.tool_trajectory} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {threads?.length === 0 && (
        <p className="px-3.5 py-3 text-sm text-muted-foreground">
          No email threads yet.
        </p>
      )}
    </div>
  );
}

function DocumentVaultCard({
  clientId,
  documents,
  checklist,
  onChange,
}: {
  clientId: number;
  documents: DocumentOut[] | null;
  checklist: ChecklistSummary | null;
  onChange: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<DocumentUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onDownloadZip = async () => {
    setDownloading(true);
    setError(null);
    try {
      await downloadClientDocumentsZip(clientId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setDownloading(false);
    }
  };

  const onUpload = async (f: File) => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const res = await uploadDocument(clientId, f);
      setResult(res);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const itemsById = useMemo(() => {
    const map: Record<number, ChecklistItem> = {};
    for (const item of checklist?.items ?? []) map[item.id] = item;
    return map;
  }, [checklist]);

  const latestDocIdByItem = useMemo(() => {
    const map: Record<number, { id: number; received_at: string }> = {};
    for (const doc of documents ?? []) {
      if (doc.checklist_item_id === null) continue;
      const existing = map[doc.checklist_item_id];
      if (!existing || doc.received_at > existing.received_at) {
        map[doc.checklist_item_id] = { id: doc.id, received_at: doc.received_at };
      }
    }
    return map;
  }, [documents]);

  return (
    <SectionCard
      title="Document vault"
      action={
        documents && documents.length > 0 ? (
          <Button
            variant="outline"
            size="sm"
            disabled={downloading}
            onClick={onDownloadZip}
          >
            {downloading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Download />
            )}
            {downloading ? "Zipping…" : "Download all"}
          </Button>
        ) : undefined
      }
    >
      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) onUpload(dropped);
        }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter") fileInputRef.current?.click();
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragOver
            ? "border-accent bg-accent/5"
            : "border-border/70 hover:border-border hover:bg-muted/30"
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={(e) => {
            const picked = e.target.files?.[0];
            if (picked) onUpload(picked);
            e.target.value = "";
          }}
        />
        <UploadCloud className="size-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {submitting ? (
            "Uploading…"
          ) : (
            <>
              <span className="font-medium text-foreground">Click to upload</span>{" "}
              or drag and drop a document
            </>
          )}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {result && (
        <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
          <p>Classified as: {result.document.classified_type ?? "unknown"}</p>
          <p>Year: {result.document.year ?? "unknown"}</p>
          <p>Checklist status: {result.checklist_item_status ?? "unmatched"}</p>
          <p>Draft email created: {result.draft_email_created ? "yes" : "no"}</p>
          {result.document.download_url && (
            <p>
              <a
                href={result.document.download_url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                View uploaded document
              </a>
            </p>
          )}
        </div>
      )}

      <Separator className="bg-border/60" />

      {documents === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
      <div className="overflow-x-auto">
      <table
        className="w-full min-w-[600px] border-collapse text-sm animate-blur-in-sm"
        style={{ animationDelay: "180ms" }}
      >
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Type
            </th>
            <th className="py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Status
            </th>
            <th className="py-1.5 pr-4 pb-2.5 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Year
            </th>
            <th className="py-1.5 pr-4 pb-2.5 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Received
            </th>
            <th className="py-1.5 pr-4" />
          </tr>
        </thead>
        <tbody>
          {documents?.map((doc) => {
            const item =
              doc.checklist_item_id !== null
                ? itemsById[doc.checklist_item_id]
                : undefined;
            const isLatestForItem =
              doc.checklist_item_id !== null &&
              latestDocIdByItem[doc.checklist_item_id]?.id === doc.id;
            const rejected =
              !!item && ((isLatestForItem && item.status === "wrong") || !isLatestForItem);
            return (
              <tr key={doc.id} className="border-b border-border/40">
                <td className="py-2 pr-4 font-medium">
                  {doc.classified_type ?? "unknown"}
                </td>
                <td className="py-2 pr-4">
                  {rejected ? (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-950/40 dark:text-red-400">
                      Rejected
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right text-muted-foreground">
                  {doc.year ?? "—"}
                </td>
                <td className="py-2 pr-4 text-right text-muted-foreground">
                  {new Date(doc.received_at).toLocaleString()}
                </td>
                <td className="py-2 pr-4">
                  {doc.download_url ? (
                    <a
                      href={doc.download_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4"
                    >
                      View
                    </a>
                  ) : (
                    <span className="text-muted-foreground">unavailable</span>
                  )}
                </td>
              </tr>
            );
          })}
          {documents?.length === 0 && (
            <tr>
              <td colSpan={5} className="py-4 text-muted-foreground">
                No documents uploaded yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      )}
    </SectionCard>
  );
}

function MemoryNotesCard({
  clientId,
  notes,
  onChange,
}: {
  clientId: number;
  notes: ClientMemoryNote[] | null;
  onChange: () => void;
}) {
  return (
    <SectionCard
      title="What we know about this client"
      subtitle="Durable facts the AI has extracted from this client's emails, used to inform future Q&A answers."
    >
      {notes === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
      <div
        className="flex flex-col gap-2 animate-blur-in-sm"
        style={{ animationDelay: "240ms" }}
      >
        {notes.map((note) => (
          <div
            key={note.id}
            className={cn(
              "flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/30 px-3.5 py-2.5 text-sm",
              note.superseded_at && "opacity-50"
            )}
          >
            <div>
              <p className="text-foreground/80">
                {note.note}
                {note.superseded_at && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    superseded
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(note.created_at).toLocaleString()}
              </p>
            </div>
            <DeleteMemoryNoteButton
              clientId={clientId}
              note={note}
              onChange={onChange}
            />
          </div>
        ))}
        {notes.length === 0 && (
          <p className="text-sm text-muted-foreground">No memory notes yet.</p>
        )}
      </div>
      )}
    </SectionCard>
  );
}

function DeleteMemoryNoteButton({
  clientId,
  note,
  onChange,
}: {
  clientId: number;
  note: ClientMemoryNote;
  onChange: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    setPending(true);
    setError(null);
    try {
      await deleteClientMemoryNote(clientId, note.id);
      setConfirming(false);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="size-3.5" />
        <span className="sr-only">Delete note</span>
      </Button>

      <Dialog open={confirming} onOpenChange={(open) => !pending && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this memory note?</DialogTitle>
            <DialogDescription>
              This removes “{note.note}” from what the AI knows about this
              client. Use this to correct something wrong - it won&apos;t be
              suggested again.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
