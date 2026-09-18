"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Download,
  File,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
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
  ClientStatus,
  CommitmentStatus,
  DocumentOut,
  DocumentUploadResult,
  EmailThread,
  ExtractedChecklistItem,
  WorkflowRun,
  createChecklistItem,
  deleteClient,
  deleteClientMemoryNote,
  downloadClientDocumentsZip,
  extractChecklistItems,
  getClient,
  listChecklistItems,
  listClientCommitments,
  listClientDocuments,
  listClientMemoryNotes,
  listClientWorkflowRuns,
  listEmailThreads,
  resolveClientCommitment,
  rerunWorkflowRun,
  runQueuedWorkflowRun,
  sendChecklistItemReminder,
  sendChecklistReminder,
  subscribeToEmailLogStream,
  unassignWorkflowFromClient,
  updateChecklistItem,
  updateClient,
  uploadDocument,
  waiveChecklistItem,
} from "@/lib/api";
import { cn, formatPhoneNumber } from "@/lib/utils";
import { AgentActivityDisclosure, TraceStep } from "@/components/agent-activity-disclosure";
import { AssignWorkflowDialog } from "@/components/assign-workflow-dialog";
import { Linkify } from "@/components/linkify";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[] | null>(null);
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
    listClientWorkflowRuns(clientId)
      .then(setWorkflowRuns)
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
            <div className="flex items-center gap-1">
              <EditClientButton client={client} onUpdated={refresh} />
              <DeleteClientButton
                clientId={clientId}
                clientName={client.name}
                onDeleted={() => router.push("/clients")}
              />
            </div>
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
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
              {[
                client.email,
                client.phone ? formatPhoneNumber(client.phone) : null,
                client.company_name,
              ]
                .filter((part): part is string => Boolean(part))
                .map((part, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5">
                    {part}
                    <span aria-hidden>·</span>
                  </span>
                ))}
              <span className="inline-flex items-center gap-1.5">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    client.status === "active" ? "bg-accent" : "bg-muted-foreground/40"
                  )}
                />
                {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
              </span>
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

      {client !== null && (
        <QuickAddPanel clientId={clientId} onChange={refresh} />
      )}

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

      <WorkflowRunsCard
        clientId={clientId}
        runs={workflowRuns}
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

function EditClientButton({
  client,
  onUpdated,
}: {
  client: ClientDetail;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(client.name);
  const [email, setEmail] = useState(client.email);
  const [phone, setPhone] = useState(client.phone ?? "");
  const [companyName, setCompanyName] = useState(client.company_name ?? "");
  const [status, setStatus] = useState<ClientStatus>(client.status);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = () => {
    setName(client.name);
    setEmail(client.email);
    setPhone(client.phone ?? "");
    setCompanyName(client.company_name ?? "");
    setStatus(client.status);
    setError(null);
    setEditing(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await updateClient(client.id, {
        name,
        email,
        phone: phone.trim() || null,
        company_name: companyName.trim() || null,
        status,
      });
      setEditing(false);
      onUpdated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2 mb-4 text-muted-foreground hover:text-foreground"
        onClick={openDialog}
      >
        <Pencil className="size-4" />
        Edit
      </Button>

      <Dialog open={editing} onOpenChange={(open) => !submitting && setEditing(open)}>
        <DialogContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Edit client</DialogTitle>
              <DialogDescription>
                Update {client.name}&apos;s information.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-client-name">Name</Label>
                <Input
                  id="edit-client-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-client-email">Email</Label>
                <Input
                  id="edit-client-email"
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-client-phone">Phone number</Label>
                <Input
                  id="edit-client-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-client-company">Company name</Label>
                <Input
                  id="edit-client-company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="edit-client-status">Status</Label>
                <select
                  id="edit-client-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ClientStatus)}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
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

function QuickAddPanel({
  clientId,
  onChange,
}: {
  clientId: number;
  onChange: () => void;
}) {
  const [instruction, setInstruction] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [items, setItems] = useState<ExtractedChecklistItem[] | null>(null);
  const [sendReminder, setSendReminder] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  const reset = () => {
    setInstruction("");
    setItems(null);
    setSendReminder(false);
    setError(null);
  };

  const onExtract = async () => {
    if (!instruction.trim()) return;
    setExtracting(true);
    setError(null);
    setJustAdded(false);
    try {
      const result = await extractChecklistItems(clientId, instruction);
      setItems(result.items);
      setSendReminder(result.suggested_send_reminder);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setExtracting(false);
    }
  };

  const updateItem = (i: number, patch: Partial<ExtractedChecklistItem>) => {
    setItems((prev) => prev?.map((item, idx) => (idx === i ? { ...item, ...patch } : item)) ?? null);
  };

  const removeItem = (i: number) => {
    setItems((prev) => prev?.filter((_, idx) => idx !== i) ?? null);
  };

  const onConfirm = async () => {
    if (!items || items.length === 0) return;
    setConfirming(true);
    setError(null);
    try {
      for (const item of items) {
        await createChecklistItem(clientId, {
          doc_type_needed: item.doc_type_needed,
          description: item.description || undefined,
          expected_date_range_start: item.expected_date_range_start || undefined,
          expected_date_range_end: item.expected_date_range_end || undefined,
        });
      }
      if (sendReminder) {
        await sendChecklistReminder(clientId);
      }
      onChange();
      reset();
      setJustAdded(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <SectionCard
      title="Quick add"
      subtitle="Describe what this client needs in plain language."
    >
      {!items ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Textarea
            placeholder={`e.g. "get his T4s for 2024 and ask for last year's NOA"`}
            value={instruction}
            onChange={(e) => {
              setInstruction(e.target.value);
              setJustAdded(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onExtract();
            }}
            rows={2}
            className="flex-1"
          />
          <Button onClick={onExtract} disabled={extracting || !instruction.trim()}>
            {extracting ? "Reading…" : "Add"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nothing extracted - go back and try rephrasing.
            </p>
          )}
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-2 rounded-lg border border-border/60 bg-background p-2.5"
            >
              <div className="flex flex-1 flex-col gap-1.5">
                <Input
                  value={item.doc_type_needed}
                  onChange={(e) => updateItem(i, { doc_type_needed: e.target.value })}
                  placeholder="Doc type"
                />
                <Input
                  value={item.description ?? ""}
                  onChange={(e) => updateItem(i, { description: e.target.value || null })}
                  placeholder="Description (optional)"
                />
                {(item.expected_date_range_start !== null || item.expected_date_range_end !== null) && (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="date"
                      value={item.expected_date_range_start ?? ""}
                      onChange={(e) =>
                        updateItem(i, { expected_date_range_start: e.target.value || null })
                      }
                      className="h-8 text-xs"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="date"
                      value={item.expected_date_range_end ?? ""}
                      onChange={(e) =>
                        updateItem(i, { expected_date_range_end: e.target.value || null })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                )}
              </div>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeItem(i)}>
                <X />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={sendReminder}
                onChange={(e) => setSendReminder(e.target.checked)}
                className="size-3.5 accent-foreground"
              />
              Also send a reminder email now
            </label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setItems(null)} disabled={confirming}>
                Back
              </Button>
              <Button size="sm" onClick={onConfirm} disabled={confirming || items.length === 0}>
                {confirming
                  ? "Adding…"
                  : `Add ${items.length} requirement${items.length === 1 ? "" : "s"}${sendReminder ? " & send" : ""}`}
              </Button>
            </div>
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {justAdded && <p className="text-sm text-muted-foreground">Done — checklist updated below.</p>}
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

// Icon shape carries the file-type signal (no added color - restrained
// per the design system, §2/§6) so a PDF, spreadsheet, and image are
// visually distinct at a glance instead of every output looking identical.
function fileTypeIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "pdf":
    case "txt":
    case "md":
      return FileText;
    case "csv":
    case "xlsx":
    case "xls":
      return FileSpreadsheet;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
      return FileImage;
    case "json":
      return FileJson;
    default:
      return File;
  }
}

const workflowRunStatusVariant: Record<WorkflowRun["status"], "success" | "secondary" | "destructive"> = {
  completed: "success",
  running: "secondary",
  queued: "secondary",
  needs_review: "destructive",
  failed: "destructive",
};

const workflowRunStatusLabels: Record<WorkflowRun["status"], string> = {
  completed: "Completed",
  running: "Running",
  queued: "Queued",
  needs_review: "Needs review",
  failed: "Failed",
};

interface WorkflowGroup {
  workflowId: number;
  workflowName: string;
  workflowArchived: boolean;
  runs: WorkflowRun[];
}

function groupRunsByWorkflow(runs: WorkflowRun[]): WorkflowGroup[] {
  const order: number[] = [];
  const byId: Record<number, WorkflowGroup> = {};
  for (const run of runs) {
    if (!byId[run.workflow_id]) {
      byId[run.workflow_id] = {
        workflowId: run.workflow_id,
        workflowName: run.workflow_name,
        workflowArchived: run.workflow_archived,
        runs: [],
      };
      order.push(run.workflow_id);
    }
    byId[run.workflow_id].runs.push(run);
  }
  // runs already arrive newest-first (API orders by created_at desc)
  return order.map((id) => byId[id]);
}

function WorkflowRunsCard({
  clientId,
  runs,
  onChange,
}: {
  clientId: number;
  runs: WorkflowRun[] | null;
  onChange: () => void;
}) {
  const [runningId, setRunningId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openWorkflowIds, setOpenWorkflowIds] = useState<number[]>([]);
  const [liveWorkflowId, setLiveWorkflowId] = useState<number | null>(null);
  const [liveWorkflowName, setLiveWorkflowName] = useState<string | null>(null);
  const [liveTrace, setLiveTrace] = useState<TraceStep[] | null>(null);
  // Refs, not state, for values the live-event handler only needs to read
  // at event time - putting them in the effect's dependency array would
  // tear down and reopen the SSE connection on every refetch/rerender.
  const runsRef = useRef(runs);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    runsRef.current = runs;
    onChangeRef.current = onChange;
  });

  const groups = useMemo(() => (runs ? groupRunsByWorkflow(runs) : []), [runs]);

  // A run already in progress when this page loads (e.g. it was kicked
  // off before this tab was open) has no SSE history to reconstruct - its
  // liveWorkflowId never gets set, since that only happens on a
  // workflow_run_started event this tab actually witnessed. Auto-opening
  // its group the first time we see it means it's never silently invisible
  // just because of when the tab happened to load (the "Running" badge
  // itself falls back to the persisted status too - see isLive below),
  // even though the live step-by-step trace genuinely can't be
  // reconstructed after the fact. Adjusting state during render (not in
  // an effect) is the documented pattern for a one-time sync like this -
  // see https://react.dev/learn/you-might-not-need-an-effect.
  const [autoOpenedRunning, setAutoOpenedRunning] = useState(false);
  if (runs && !autoOpenedRunning) {
    setAutoOpenedRunning(true);
    const runningIds = groups.filter((g) => g.runs[0]?.status === "running").map((g) => g.workflowId);
    if (runningIds.length > 0) {
      setOpenWorkflowIds((prev) => Array.from(new Set([...prev, ...runningIds])));
    }
  }

  // Live progress for this client's workflow runs, over the same per-org
  // SSE bus the email pipeline already streams its own live activity on
  // (see event_broadcast.py) - workflow_agent.py's on_event calls are
  // tagged with this client's id, same as handle_incoming_email's.
  useEffect(() => {
    const unsubscribe = subscribeToEmailLogStream(
      (event) => {
        if (event.client_id !== clientId) return;
        switch (event.type) {
          case "workflow_run_started": {
            const workflowId = event.workflow_id as number;
            const name =
              runsRef.current?.find((r) => r.workflow_id === workflowId)?.workflow_name ?? "Workflow";
            setLiveWorkflowId(workflowId);
            setLiveWorkflowName(name);
            setLiveTrace([]);
            setOpenWorkflowIds((prev) => (prev.includes(workflowId) ? prev : [...prev, workflowId]));
            break;
          }
          case "tool_call_started":
            setLiveTrace((prev) => [
              ...(prev ?? []),
              { round: event.round as number, tool: event.tool as string, arguments: event.arguments as Record<string, unknown> },
            ]);
            break;
          case "tool_call_result":
            setLiveTrace((prev) => {
              if (!prev) return prev;
              const idx = prev.findIndex(
                (s) => s.round === event.round && s.tool === event.tool && s.result == null
              );
              if (idx === -1) return prev;
              return prev.map((s, i) => (i === idx ? { ...s, result: event.result as string } : s));
            });
            break;
          case "output_produced":
            setLiveTrace((prev) => [
              ...(prev ?? []),
              { round: event.round as number, tool: "code_interpreter", result: `Produced ${event.filename}` },
            ]);
            break;
          case "workflow_run_finished":
            setLiveWorkflowId(null);
            setLiveWorkflowName(null);
            setLiveTrace(null);
            onChangeRef.current();
            break;
          default:
            break;
        }
      },
      (err) => {
        console.error("workflow run stream error", err);
      }
    );
    return unsubscribe;
  }, [clientId]);

  const onRunNow = async (runId: number) => {
    setRunningId(runId);
    setError(null);
    try {
      await runQueuedWorkflowRun(clientId, runId);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setRunningId(null);
    }
  };

  const onRerun = async (runId: number) => {
    setRunningId(runId);
    setError(null);
    try {
      await rerunWorkflowRun(clientId, runId);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setRunningId(null);
    }
  };

  // A brand-new workflow's very first run has no persisted history yet to
  // group under - give it a synthetic group so its live activity still has
  // somewhere to render instead of being dropped until the run finishes.
  const displayGroups: WorkflowGroup[] =
    liveWorkflowId !== null && !groups.some((g) => g.workflowId === liveWorkflowId)
      ? [{ workflowId: liveWorkflowId, workflowName: liveWorkflowName ?? "Workflow", workflowArchived: false, runs: [] }, ...groups]
      : groups;

  return (
    <SectionCard
      title="Workflows"
      subtitle="Work assigned to this client that runs once their checklist is complete."
      action={
        <AssignWorkflowDialog
          clientIds={[clientId]}
          onAssigned={onChange}
          trigger={
            <Button variant="outline" size="sm">
              <Plus />
              Assign workflow
            </Button>
          }
        />
      }
    >
      {runs === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : displayGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No workflow activity yet - a run appears here once an assigned
          workflow fires (or is ready to run) for this client.
        </p>
      ) : (
        <Accordion
          value={openWorkflowIds}
          onValueChange={(v) => setOpenWorkflowIds(v as number[])}
          multiple
          className="animate-blur-in-sm gap-3"
          style={{ animationDelay: "280ms" }}
        >
          {displayGroups.map((group) => {
            const latest = group.runs[0];
            const isLive = group.workflowId === liveWorkflowId || latest?.status === "running";
            const isOpen = openWorkflowIds.includes(group.workflowId);
            return (
              <AccordionItem
                key={group.workflowId}
                value={group.workflowId}
                className="rounded-xl bg-card ring-1 ring-foreground/10 not-last:border-b-0 overflow-hidden"
              >
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <AccordionTrigger className="min-w-0 flex-1 gap-3 py-0 hover:no-underline">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium text-foreground/90">{group.workflowName}</span>
                      {isLive && (
                        <Badge variant="secondary">
                          <Loader2 className="animate-spin" />
                          Running
                        </Badge>
                      )}
                      {group.workflowArchived && <Badge variant="outline">Workflow deleted</Badge>}
                      {!isLive && latest?.workflow_assignment_id == null && (
                        <Badge variant="outline">Not assigned</Badge>
                      )}
                      {group.runs.length > 0 && (
                        <span className="text-xs font-normal text-muted-foreground">
                          {group.runs.length} run{group.runs.length === 1 ? "" : "s"} · latest{" "}
                          {new Date(group.runs[0].created_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </AccordionTrigger>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {!isLive && !group.workflowArchived && latest?.status === "queued" && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onRunNow(latest.id)}
                        disabled={runningId === latest.id}
                      >
                        {runningId === latest.id ? <Loader2 className="animate-spin" /> : <Play />}
                        Run now
                      </Button>
                    )}
                    {!isLive &&
                      !group.workflowArchived &&
                      latest &&
                      (latest.status === "completed" ||
                        latest.status === "needs_review" ||
                        latest.status === "failed") && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onRerun(latest.id)}
                        disabled={runningId === latest.id}
                      >
                        {runningId === latest.id ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                        Rerun
                      </Button>
                    )}
                    {!isLive && latest?.workflow_assignment_id != null && (
                      <RemoveWorkflowButton
                        clientId={clientId}
                        workflowId={group.workflowId}
                        workflowName={group.workflowName}
                        onRemoved={onChange}
                      />
                    )}
                  </div>
                </div>
                <AccordionContent className="px-4 pb-0">
                  <div
                    className={cn(
                      "flex flex-col gap-2 pb-3.5",
                      isOpen && "border-t border-border/60 pt-3"
                    )}
                  >
                    {isLive && liveTrace !== null && (
                      <div className="rounded-lg bg-muted/40 px-3 py-2">
                        <AgentActivityDisclosure trajectory={liveTrace} defaultOpen />
                      </div>
                    )}
                    {group.runs.map((run) => (
                      <WorkflowRunRow key={run.id} run={run} />
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </SectionCard>
  );
}

function WorkflowRunRow({ run }: { run: WorkflowRun }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted/40 px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={workflowRunStatusVariant[run.status]}>
          {workflowRunStatusLabels[run.status]}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {new Date(run.created_at).toLocaleString()}
        </span>
      </div>

      {run.summary && <p className="text-xs text-muted-foreground">{run.summary}</p>}

      {run.status === "completed" && run.outputs.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {run.outputs.map((output) => {
            if (!output.download_url) return null;
            const FileIcon = fileTypeIcon(output.filename);
            return (
              <Button
                key={output.id}
                variant="ghost"
                size="sm"
                nativeButton={false}
                render={<a href={output.download_url} target="_blank" rel="noreferrer" />}
              >
                <FileIcon />
                {output.filename}
              </Button>
            );
          })}
        </div>
      )}

      {run.review_reason && (
        <Accordion>
          <AccordionItem value="review-reason" className="border-none">
            <AccordionTrigger className="py-0 text-xs font-medium text-destructive hover:no-underline [&_svg]:text-destructive">
              Why this needs review
            </AccordionTrigger>
            <AccordionContent className="pt-1.5 pb-0">
              <p className="text-xs text-destructive/90">{run.review_reason}</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}

function RemoveWorkflowButton({
  clientId,
  workflowId,
  workflowName,
  onRemoved,
}: {
  clientId: number;
  workflowId: number;
  workflowName: string;
  onRemoved: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onRemove = async () => {
    setRemoving(true);
    setError(null);
    try {
      await unassignWorkflowFromClient(workflowId, clientId);
      setConfirming(false);
      onRemoved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        className="text-muted-foreground hover:text-destructive"
      >
        <Trash2 />
        Remove
      </Button>
      <Dialog open={confirming} onOpenChange={(open) => !removing && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {workflowName}?</DialogTitle>
            <DialogDescription>
              It stops running for this client going forward. Past runs and
              their outputs stay in this client&apos;s history.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onRemove} disabled={removing}>
              {removing ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
