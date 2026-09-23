"use client";

import { DocumentValidationResult } from "@/components/document-validation-result";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { groupClientWorkflows, assignmentReadiness } from "@/lib/client-workflows";
import { createSnapshotRefresh } from "@/lib/snapshot-refresh";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  UploadCloud,
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
  ClientUploadLink,
  CommitmentStatus,
  DocumentOut,
  DocumentUploadResult,
  EmailThread,
  MeetingRequest,
  MeetingRequestStatus,
  Package,
  UploadLinkEvent,
  WorkflowRun,
  ClientWorkflowAssignment,
  listClientWorkflowAssignments,
  startAssignedWorkflow,
  deleteClient,
  deleteClientMemoryNote,
  deleteDocument,
  downloadClientDocumentsZip,
  getClient,
  getClientUploadLink,
  listChecklistItems,
  listClientCommitments,
  listClientDocuments,
  listClientMeetings,
  listClientMemoryNotes,
  listClientUploadLinkEvents,
  listClientWorkflowRuns,
  listEmailThreads,
  listPackages,
  regenerateClientUploadLink,
  renameDocument,
  revalidateDocument,
  resolveClientCommitment,
  rerunWorkflowRun,
  runQueuedWorkflowRun,
  sendChecklistItemReminder,
  sendChecklistReminder,
  subscribeToEmailLogStream,
  unassignPackageFromClient,
  unassignWorkflowFromClient,
  updateChecklistItem,
  updateClient,
  uploadDocument,
  waiveChecklistItem,
} from "@/lib/api";
import { cn, formatPhoneNumber } from "@/lib/utils";
import { computeTier, startOfDay, TIER_META } from "@/lib/checklist-urgency";
import { ResumeWorkflowDialog } from "@/components/resume-workflow-dialog";
import { AgentActivityDisclosure } from "@/components/agent-activity-disclosure";
import { ClientWorkflowActivity } from "@/components/client-workflow-activity";
import { AssignWorkflowDialog } from "@/components/assign-workflow-dialog";
import { PackageDocumentPicker } from "@/components/package-document-picker";
import { PackageFormDialog } from "@/components/package-form-dialog";
import { ChecklistItemFormDialog } from "@/components/checklist-item-form-dialog";
import { Linkify } from "@/components/linkify";
import {
  Accordion,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <div className="flex min-w-0 flex-1 flex-col gap-2">
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

// Same red/overdue, yellow/due-soon, neutral/on-track coloring as the
// urgency dashboard (see lib/checklist-urgency.ts) - only for items still
// outstanding, since a received item's original deadline is historical, not
// something to flag.
function DeadlineCell({ item, today }: { item: ChecklistItem; today: Date }) {
  if (!item.expected_date_range_end) {
    return <span className="text-muted-foreground">—</span>;
  }
  const dateText = new Date(`${item.expected_date_range_end}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (item.status !== "missing" && item.status !== "wrong") {
    return <span className="text-muted-foreground">{dateText}</span>;
  }
  const { tier } = computeTier(item, today);
  const meta = TIER_META[tier];
  return (
    <span className={cn("flex items-center gap-1.5", meta.text)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", meta.dot)} />
      {dateText}
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
  const [meetings, setMeetings] = useState<MeetingRequest[] | null>(null);
  const [workflowAssignments, setWorkflowAssignments] = useState<ClientWorkflowAssignment[] | null>(null);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignPackageOpen, setAssignPackageOpen] = useState(false);
  const router = useRouter();
  const workflowRefreshRef = useRef<ReturnType<typeof createSnapshotRefresh<[WorkflowRun[], ClientWorkflowAssignment[]]>> | null>(null);

  useEffect(() => {
    const controller = createSnapshotRefresh({
      read: async (): Promise<[WorkflowRun[], ClientWorkflowAssignment[]]> => {
        const snapshot: [WorkflowRun[], ClientWorkflowAssignment[]] = await Promise.all([
          listClientWorkflowRuns(clientId), listClientWorkflowAssignments(clientId),
        ]);
        setWorkflowError(null);
        return snapshot;
      },
      onValue: ([runs, assignments]) => {
        setWorkflowRuns(runs);
        setWorkflowAssignments(assignments);
        setWorkflowError(null);
      },
      onError: (e) => setWorkflowError(e instanceof ApiError ? e.message : String(e)),
    });
    workflowRefreshRef.current = controller;
    controller.refresh({ immediate: true });
    return () => {
      controller.stop();
      workflowRefreshRef.current = null;
    };
  }, [clientId]);

  const refreshWorkflowRuns = useCallback(() => {
    workflowRefreshRef.current?.refresh();
  }, []);

  const refreshClient = useCallback(() => {
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
    listClientMeetings(clientId)
      .then(setMeetings)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  }, [clientId]);

  const refresh = () => {
    refreshClient();
    refreshWorkflowRuns();
  };
  useEffect(refreshClient, [refreshClient]);

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
        <>
          <div className="flex items-center justify-end gap-1.5">
            <Button variant="outline" onClick={() => setAssignPackageOpen(true)}>
              <Plus />
              Assign package
            </Button>
            <PackageFormDialog onSaved={refresh} variant="outline" />
          </div>

          <AssignPackagePopup
            open={assignPackageOpen}
            onOpenChange={setAssignPackageOpen}
            clientId={clientId}
            assignedPackageIds={client.assigned_package_ids}
            checklist={checklist}
            onAssigned={refresh}
          />
        </>
      )}

      <ChecklistCard
        clientId={clientId}
        checklist={checklist}
        documents={documents}
        onChange={refresh}
        onEditPackage={() => setAssignPackageOpen(true)}
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

      <MeetingCard meetings={meetings} />

      <DocumentVaultCard
        clientId={clientId}
        documents={documents}
        checklist={checklist}
        onChange={refresh}
      />

      <UploadLinkCard clientId={clientId} />

      <WorkflowRunsCard
        clientId={clientId}
        runs={workflowRuns}
        assignments={workflowAssignments}
        loadError={workflowError}
        onChange={refreshWorkflowRuns}
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
              This client will be archived for 7 days, then deleted permanently.
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
  onEditPackage,
}: {
  clientId: number;
  checklist: ChecklistSummary | null;
  documents: DocumentOut[] | null;
  onChange: () => void;
  onEditPackage: () => void;
}) {
  // Computed once, not a bare `new Date()` call in the render body - same
  // reasoning as the urgency dashboard's own lazy-initializer pattern.
  const today = useMemo(() => startOfDay(new Date()), []);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [deselecting, setDeselecting] = useState(false);
  const [deselectOpen, setDeselectOpen] = useState(false);

  const actionRequired = checklist ? checklist.missing + checklist.wrong : 0;

  // Which package(s) this client's items trace back to, plus how many were
  // added outside any package (manually, via "Add requirement" below) -
  // lets the checklist itself say "Standard T1 and 2 other requirements"
  // instead of a flat undifferentiated list.
  const assignedPackages = checklist
    ? Array.from(
        new Map(
          checklist.items
            .filter((i): i is typeof i & { package_id: number; package_name: string } =>
              i.package_id !== null && i.package_name !== null
            )
            .map((i) => [i.package_id, { id: i.package_id, name: i.package_name }])
        ).values()
      )
    : [];
  const packageNames = assignedPackages.map((p) => p.name);
  const otherCount = checklist ? checklist.items.filter((i) => !i.package_name).length : 0;
  // Comma-separated (not "and") so it reads cleanly with several packages,
  // capped at 2 shown + a "+N more" tail so the line stays roughly bounded
  // no matter how many packages a client ends up with.
  const MAX_PACKAGE_NAMES_SHOWN = 2;
  const packageLabels = packageNames.map((name) => `${name} Package`);
  const shownPackageLabels = packageLabels.slice(0, MAX_PACKAGE_NAMES_SHOWN);
  const hiddenPackageCount = packageLabels.length - shownPackageLabels.length;
  const packageNamesPart =
    hiddenPackageCount > 0
      ? `${shownPackageLabels.join(", ")} +${hiddenPackageCount} more package${hiddenPackageCount === 1 ? "" : "s"}`
      : shownPackageLabels.join(", ");
  const packageSummary =
    packageNames.length > 0
      ? `${packageNamesPart}${
          otherCount > 0 ? ` and ${otherCount} other requirement${otherCount === 1 ? "" : "s"}` : ""
        }`
      : null;

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

  const onDeselectPackage = async (packageId: number) => {
    setDeselecting(true);
    setError(null);
    try {
      await unassignPackageFromClient(packageId, clientId);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setDeselecting(false);
    }
  };

  return (
    <SectionCard
      title="Checklist requirements"
      subtitle={
        checklist && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span>{checklist.total} total</span>
              {actionRequired > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-500/15 dark:text-amber-300">
                  {actionRequired} action required
                </span>
              )}
            </div>
            {packageSummary && (
              <span className="block truncate" title={packageSummary}>
                {packageSummary}
              </span>
            )}
          </div>
        )
      }
      action={
        packageNames.length > 0 || (documents && documents.length > 0) ? (
          <div className="flex items-center gap-1.5">
            {packageNames.length > 0 && (
              <Button variant="ghost" size="sm" onClick={onEditPackage}>
                Edit package
              </Button>
            )}
            {packageNames.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => setDeselectOpen(true)}
              >
                Deselect package
              </Button>
            )}
            {documents && documents.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={downloading}
                onClick={onDownloadZip}
              >
                {downloading ? <Loader2 className="animate-spin" /> : <Download />}
                {downloading ? "Zipping…" : "Download all"}
              </Button>
            )}
          </div>
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
              Deadline
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
                <td className="py-2 pr-4 font-medium">
                  {item.doc_type_needed}
                  {item.description && (
                    <div className="text-xs font-normal text-muted-foreground">{item.description}</div>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <StatusPill status={item.status} />
                </td>
                <td className="py-2 pr-4">
                  <DeadlineCell item={item} today={today} />
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
              <td colSpan={7} className="py-4 text-muted-foreground">
                No checklist items yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <button
        type="button"
        onClick={() => setShowAddDialog(true)}
        className="flex items-center gap-1.5 self-start border-t border-transparent pt-1 text-sm font-medium text-accent underline-offset-4 transition-colors hover:text-accent/70 hover:underline"
      >
        <Plus className="size-3.5" />
        Add requirement
      </button>

      <ChecklistItemFormDialog
        clientId={clientId}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onSaved={onChange}
      />

      <Dialog open={deselectOpen} onOpenChange={setDeselectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deselect package</DialogTitle>
            <DialogDescription>
              Removes that package&apos;s documents from this client&apos;s
              checklist (any already-received document is kept, just
              detached). Manually-added requirements aren&apos;t affected.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            {assignedPackages.map((pkg) => (
              <div
                key={pkg.id}
                className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-sm"
              >
                <span>{pkg.name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  disabled={deselecting}
                  onClick={() => onDeselectPackage(pkg.id)}
                >
                  Remove
                </Button>
              </div>
            ))}
            {assignedPackages.length === 0 && (
              <p className="text-sm text-muted-foreground">No packages assigned.</p>
            )}
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

// Replaces the old always-visible "3 boxes in a row" package section so the
// checklist is the first thing a client's page shows - assigning, editing,
// and changing a client's package(s) all happen through this one dialog
// instead, opened from the "Assign package" button above the checklist or
// "Edit package" on the checklist card itself once one's assigned.
//
// Picking a package used to open a *second*, nested dialog on top of this
// one for the document-selection step - two overlays stacked read as
// cluttered rather than as one flow. This dialog now just swaps its own
// content between the package grid and PackageDocumentPicker instead, so
// there's never more than one dialog open at a time.
function AssignPackagePopup({
  open,
  onOpenChange,
  clientId,
  assignedPackageIds,
  checklist,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: number;
  assignedPackageIds: number[];
  checklist: ChecklistSummary | null;
  onAssigned: () => void;
}) {
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshPackages = () => {
    listPackages()
      .then(setPackages)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(() => {
    if (!open) return;
    let active = true;
    listPackages().then((loaded) => {
      if (!active) return;
      setSelectedPackage(null);
      setPackages(loaded);
    }).catch((e) => {
      if (active) setError(e instanceof ApiError ? e.message : String(e));
    });
    return () => { active = false; };
  }, [open]);

  // Which of this package's specific document lines are already checked
  // for this client - lets picking an already-assigned package open
  // pre-populated with the real current state instead of just "required".
  const currentDocIdsByPackage: Record<number, number[]> = {};
  for (const item of checklist?.items ?? []) {
    if (item.package_id !== null && item.package_document_id !== null) {
      (currentDocIdsByPackage[item.package_id] ??= []).push(item.package_document_id);
    }
  }

  // Assigned packages float to the front so it's obvious at a glance what's
  // already selected when reopening this to edit.
  const sorted = packages
    ? [...packages].sort(
        (a, b) => Number(assignedPackageIds.includes(b.id)) - Number(assignedPackageIds.includes(a.id))
      )
    : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-8">
            {selectedPackage ? selectedPackage.name : "Assign a package"}
          </DialogTitle>
          <DialogDescription>
            {selectedPackage
              ? "Choose which documents to add to this client's checklist."
              : "Click a package to add its documents to this client, or change what's selected."}
          </DialogDescription>
        </DialogHeader>

        {selectedPackage ? (
          <PackageDocumentPicker
            pkg={selectedPackage}
            clientIds={[clientId]}
            currentDocumentIds={currentDocIdsByPackage[selectedPackage.id]}
            onAssigned={onAssigned}
            onBack={() => setSelectedPackage(null)}
            onSavingChange={setSaving}
          />
        ) : (
          <>
            <div className="flex justify-end">
              <PackageFormDialog onSaved={refreshPackages} variant="outline" />
            </div>
            {packages === null ? (
              <div className="grid max-h-[65vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-xl" />
                ))}
              </div>
            ) : packages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No packages yet - use &quot;Create New Package&quot; above to create one.
              </p>
            ) : (
              <div className="grid max-h-[65vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
                {sorted!.map((pkg) => {
                  const isSelected = assignedPackageIds.includes(pkg.id);
                  return (
                    <button
                      key={pkg.id}
                      type="button"
                      onClick={() => setSelectedPackage(pkg)}
                      className={cn(
                        "flex h-full flex-col gap-2 rounded-xl border p-3.5 text-left transition-colors",
                        isSelected
                          ? "border-accent/50 bg-accent/[0.06] ring-1 ring-accent/30"
                          : "border-border/60 bg-background hover:border-accent/40 hover:bg-muted/60"
                      )}
                    >
                      <span className="text-sm font-medium">{pkg.name}</span>
                      <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                        {pkg.documents.slice(0, 4).map((doc) => (
                          <li key={doc.id} className="truncate">
                            {doc.doc_type_needed}
                            {!doc.is_required && " (optional)"}
                          </li>
                        ))}
                        {pkg.documents.length > 4 && <li>+{pkg.documents.length - 4} more</li>}
                      </ul>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </DialogContent>
    </Dialog>
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
  const [editing, setEditing] = useState(false);

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
          <DropdownMenuItem onClick={() => setEditing(true)}>
            Edit requirement
          </DropdownMenuItem>
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

      <ChecklistItemFormDialog
        clientId={clientId}
        item={item}
        open={editing}
        onOpenChange={setEditing}
        onSaved={onChange}
      />
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

const meetingPillClasses: Record<MeetingRequestStatus, string> = {
  proposed: "bg-amber-500/20 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300",
  confirmed: "bg-accent/15 text-accent",
  expired: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

const meetingLabels: Record<MeetingRequestStatus, string> = {
  proposed: "Proposed",
  confirmed: "Confirmed",
  expired: "Expired",
  cancelled: "Cancelled",
};

function MeetingStatusPill({ meeting }: { meeting: MeetingRequest }) {
  // live_calendar_status is a fresh events.get() read (see
  // get_client_meetings on the backend) - a staff member cancelling the
  // event directly in Google Calendar shows up here on next load even
  // though meeting.status itself still says "confirmed" (nothing syncs
  // that column back; see MeetingRequest's design notes).
  const cancelledInCalendar = meeting.live_calendar_status === "cancelled" && meeting.status !== "cancelled";
  const status = cancelledInCalendar ? "cancelled" : meeting.status;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        meetingPillClasses[status]
      )}
    >
      {cancelledInCalendar ? "Cancelled in Calendar" : meetingLabels[status]}
    </span>
  );
}

function formatMeetingTime(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateLabel = start.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const timeLabel = `${start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}–${end.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  return `${dateLabel}, ${timeLabel}`;
}

function MeetingCard({ meetings }: { meetings: MeetingRequest[] | null }) {
  return (
    <SectionCard
      title="Meetings"
      subtitle="Meeting times proposed or confirmed with this client over email."
    >
      {meetings === null ? (
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
                  Purpose
                </th>
                <th className="py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Time
                </th>
                <th className="py-1.5 pr-0 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {meetings.map((m) => (
                <tr key={m.id} className="border-b border-border/40">
                  <td className="py-2 pr-4 font-medium">{m.purpose ?? "Meeting"}</td>
                  <td className="py-2 pr-4 text-muted-foreground">
                    {m.status === "confirmed" && m.confirmed_start && m.confirmed_end
                      ? formatMeetingTime(m.confirmed_start, m.confirmed_end)
                      : m.proposed_slots && m.proposed_slots.length > 0
                      ? `${m.proposed_slots.length} time${m.proposed_slots.length === 1 ? "" : "s"} proposed, awaiting reply`
                      : "—"}
                  </td>
                  <td className="py-2 pr-0">
                    <MeetingStatusPill meeting={m} />
                  </td>
                </tr>
              ))}
              {meetings.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-4 text-muted-foreground">
                    No meetings proposed with this client yet.
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
          accept=".pdf,.csv,.tsv,.xls,.xlsx,.xlsm,.ods,.rtf,.docx,.odt,.pptx,.md,.txt,.json,.xml,.html,.htm,.png,.jpg,.jpeg,.gif,.webp,.tif,.tiff,.bmp"
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
          <DocumentValidationResult metadata={result.document.extracted_metadata} />
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
        className="w-full md:min-w-[600px] border-collapse text-sm animate-blur-in-sm"
        style={{ animationDelay: "180ms" }}
      >
        <thead>
          <tr className="border-b border-border text-left">
            <th className="py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Document
            </th>
            <th className="hidden md:table-cell py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Source
            </th>
            <th className="hidden md:table-cell py-1.5 pr-4 pb-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Status
            </th>
            <th className="hidden md:table-cell py-1.5 pr-4 pb-2.5 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Year
            </th>
            <th className="hidden md:table-cell py-1.5 pr-4 pb-2.5 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Received
            </th>
            <th className="py-1.5 pr-0" />
          </tr>
        </thead>
        <tbody>
          {documents?.map((doc) => {
            const item =
              doc.checklist_item_id !== null
                ? itemsById[doc.checklist_item_id]
                : undefined;
            return (
              <tr key={doc.id} className="border-b border-border/40">
                <td className="py-2 pr-4 font-medium [overflow-wrap:anywhere]">
                  {doc.resolved_display_name}
                  {doc.classified_type && doc.classified_type !== doc.resolved_display_name && (
                    <div className="text-xs font-normal text-muted-foreground">{doc.classified_type}</div>
                  )}
                  <div className="mt-2 md:hidden">
                    <DocumentValidationResult metadata={doc.extracted_metadata} collected={item?.status === "received"} />
                  </div>
                </td>
                <td className="hidden py-2 pr-4 text-muted-foreground md:table-cell">
                  {sourceChannelLabel(doc.source_channel)}
                </td>
                <td className="hidden py-2 pr-4 md:table-cell">
                  <DocumentValidationResult metadata={doc.extracted_metadata} collected={item?.status === "received"} />
                </td>
                <td className="hidden py-2 pr-4 text-right text-muted-foreground md:table-cell">
                  {doc.year ?? "—"}
                </td>
                <td className="hidden py-2 pr-4 text-right text-muted-foreground md:table-cell">
                  {new Date(doc.received_at).toLocaleString()}
                </td>
                <td className="py-2 pr-0 text-right">
                  <DocumentActions clientId={clientId} doc={doc} checklistItem={item} onChange={onChange} />
                </td>
              </tr>
            );
          })}
          {documents?.length === 0 && (
            <tr>
              <td colSpan={6} className="py-4 text-muted-foreground">
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

const SOURCE_CHANNEL_LABELS: Record<string, string> = {
  manual_upload: "Manual upload",
  email: "Email",
  upload_link: "Upload link",
};

function sourceChannelLabel(source: string | null): string {
  if (!source) return "—";
  return (
    SOURCE_CHANNEL_LABELS[source] ??
    // Unknown/future channel value - humanize rather than breaking
    // ("api_import" -> "Api import") instead of showing a raw enum-ish string.
    source.charAt(0).toUpperCase() + source.slice(1).replace(/_/g, " ")
  );
}

function DocumentActions({
  clientId,
  doc,
  checklistItem,
  onChange,
}: {
  clientId: number;
  doc: DocumentOut;
  checklistItem?: ChecklistItem;
  onChange: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(doc.resolved_display_name);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Whether this specific document is plausibly what's currently keeping
  // the linked checklist item Received - drives the stronger delete
  // warning. A document can be linked to an item (checklist_item_id set)
  // without being the one that satisfied it (e.g. a wrong-attempt is
  // linked too) - only an "accepted" one is.
  const validationStatus =
    doc.extracted_metadata && typeof doc.extracted_metadata === "object"
      ? (doc.extracted_metadata as { validation_status?: string }).validation_status
      : undefined;
  const satisfiesReceivedItem =
    !!checklistItem && checklistItem.status === "received" && validationStatus === "accepted";

  const onStartRename = () => {
    setNewName(doc.resolved_display_name);
    setError(null);
    setRenaming(true);
  };

  const onSaveRename = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    try {
      await renameDocument(clientId, doc.id, trimmed);
      setRenaming(false);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const onValidate = async () => {
    setPending(true);
    setError(null);
    try {
      await revalidateDocument(clientId, doc.id);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const onDelete = async () => {
    setPending(true);
    setError(null);
    try {
      await deleteDocument(clientId, doc.id);
      setConfirmingDelete(false);
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
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" disabled={pending} />}>
          <MoreHorizontal />
          <span className="sr-only">Document actions</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!satisfiesReceivedItem && (
            <DropdownMenuItem onClick={onValidate}>Retry validation</DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onStartRename}>Rename document</DropdownMenuItem>
          <DropdownMenuItem
            disabled={!doc.download_url}
            onClick={() => doc.download_url && window.open(doc.download_url, "_blank", "noreferrer")}
          >
            View / Download
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmingDelete(true)}>
            Delete document
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={(open) => !pending && setRenaming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename document</DialogTitle>
            <DialogDescription>
              Only changes what you and your client see here - the AI&apos;s own classification and
              matching are untouched.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="document-display-name">Name</Label>
            <Input
              id="document-display-name"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={onSaveRename} disabled={pending || !newName.trim()}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmingDelete} onOpenChange={(open) => !pending && setConfirmingDelete(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Are you sure?</DialogTitle>
            <DialogDescription render={<div className="flex flex-col gap-2" />}>
                {satisfiesReceivedItem && checklistItem && (
                  <p>
                    This document currently satisfies{" "}
                    <span className="font-medium text-foreground">
                      &ldquo;{checklistItem.doc_type_needed}&rdquo;
                    </span>
                    . Deleting it may return that requirement to Missing.
                  </p>
                )}
                <p>
                  The document will be permanently deleted from Compozor.{" "}
                  <span className="font-semibold text-foreground">This cannot be undone.</span> The
                  file will no longer be available to view or download.
                </p>
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingDelete(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


const UPLOAD_LINK_EVENT_LABELS: Record<string, string> = {
  created: "Link created",
  auto_created: "Link created automatically (document request)",
  regenerated: "Link regenerated",
  revoked: "Link revoked",
  expiry_extended: "Expiry extended (document request)",
};

function UploadLinkCard({ clientId }: { clientId: number }) {
  const [link, setLink] = useState<ClientUploadLink | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [events, setEvents] = useState<UploadLinkEvent[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    getClientUploadLink(clientId)
      .then((res) => {
        setLink(res);
        setLoaded(true);
      })
      .catch((e) => {
        setError(e instanceof ApiError ? e.message : String(e));
        setLoaded(true);
      });
    listClientUploadLinkEvents(clientId).then(setEvents).catch(() => {});
  }, [clientId]);

  useEffect(refresh, [refresh]);

  const onRegenerate = async () => {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await regenerateClientUploadLink(clientId);
      setLink(res);
      listClientUploadLinkEvents(clientId).then(setEvents).catch(() => {});
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!link?.upload_url) return;
    try {
      await navigator.clipboard.writeText(link.upload_url);
      setCopied(true);
    } catch {
      setError("Couldn't copy to clipboard.");
    }
  };

  return (
    <SectionCard
      title="Client upload link"
      subtitle="A secure link this client can use to upload documents — no Compozor account needed. Reused automatically when Compozor sends a document request, and stays valid until its expiry below."
    >
      {!loaded ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <div className="flex flex-col gap-3">
          {link?.upload_url ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate text-sm">{link.upload_url}</code>
                <Button variant="outline" size="sm" onClick={onCopy}>
                  {copied ? <CheckCircle2 className="text-accent" /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Expires{" "}
                {new Date(link.expires_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
                {" · "}Last used: {link.last_used_at ? new Date(link.last_used_at).toLocaleString() : "never"}
              </p>
            </div>
          ) : link ? (
            <p className="text-sm text-destructive">
              {link.is_active ? "Upload link has expired." : "Upload link has been revoked."}{" "}
              Regenerate it to give the client a new one.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No upload link has been created yet.</p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button
            variant={link ? "outline" : "default"}
            size="sm"
            disabled={busy}
            onClick={onRegenerate}
            className="self-start"
          >
            {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
            {link ? "Regenerate link" : "Create link"}
          </Button>

          {events && events.length > 0 && (
            <div className="flex flex-col gap-1.5 border-t border-border/60 pt-3">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Link activity
              </h3>
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {events.map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span>{UPLOAD_LINK_EVENT_LABELS[e.event] ?? e.event}</span>
                    <span className="shrink-0">{new Date(e.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}


function WorkflowRunsCard({
  clientId,
  runs,
  assignments,
  loadError,
  onChange,
}: {
  clientId: number;
  runs: WorkflowRun[] | null;
  assignments: ClientWorkflowAssignment[] | null;
  loadError: string | null;
  onChange: () => void;
}) {
  const [runningId, setRunningId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openWorkflowIds, setOpenWorkflowIds] = useState<number[]>([]);
  // Refs, not state, for values the live-event handler only needs to read
  // at event time - putting them in the effect's dependency array would
  // tear down and reopen the SSE connection on every refetch/rerender.
  const runsRef = useRef(runs);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    runsRef.current = runs;
    onChangeRef.current = onChange;
  });

  const groups = useMemo(() => groupClientWorkflows(runs ?? [], assignments ?? []), [runs, assignments]);

  // Open an already-running workflow on first load. Its persisted trace
  // supplies the progress even if this tab missed the original SSE events.
  const [autoOpenedRunning, setAutoOpenedRunning] = useState(false);
  if (runs && !autoOpenedRunning) {
    setAutoOpenedRunning(true);
    const runningIds = groups.filter((g) => g.runs[0]?.status === "running").map((g) => g.workflowId);
    if (runningIds.length > 0) {
      setOpenWorkflowIds((prev) => Array.from(new Set([...prev, ...runningIds])));
    }
  }

  // Persisted per-run traces are authoritative. SSE invalidates snapshots;
  // reconnects and polling repair missed events, including another worker's.
  useEffect(() => {
    // All triggers share the parent's serialized workflow-only refresh.
    const refresh = () => onChangeRef.current();
    const unsubscribe = subscribeToEmailLogStream(event => {
      if (event.client_id !== clientId || typeof event.workflow_run_id !== "number") return;
      if (event.type === "workflow_run_started" && typeof event.workflow_id === "number") {
        const id = event.workflow_id;
        setOpenWorkflowIds(prev => prev.includes(id) ? prev : [...prev, id]);
      }
      refresh();
    }, () => {}, refresh);
    let ticks = 0;
    const poll = setInterval(() => {
      ticks += 1;
      if (document.visibilityState !== "visible") return;
      if (ticks % 6 === 0 || runsRef.current?.some(run => run.status === "running" || run.status === "queued")) refresh();
    }, 5000);
    window.addEventListener("focus", refresh);
    return () => { unsubscribe(); clearInterval(poll); window.removeEventListener("focus", refresh); };
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

  const [startingId, setStartingId] = useState<number | null>(null);
  const onStart = async (assignmentId: number) => {
    setStartingId(assignmentId);
    setError(null);
    try {
      await startAssignedWorkflow(clientId, assignmentId);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setStartingId(null);
    }
  };
  const displayGroups = groups;

  return (
    <SectionCard
      title="Workflows"
      subtitle={<span className="text-[0.8125rem]">From collected documents to finished work.</span>}
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
      {loadError ? (
        <p role="alert" className="text-sm text-destructive">Could not load workflows. {loadError} <Button variant="ghost" size="sm" onClick={onChange}>Retry</Button></p>
      ) : runs === null || assignments === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : displayGroups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No workflows assigned. Assign a workflow to define what happens after document collection.
        </p>
      ) : (
        <Accordion
          value={openWorkflowIds}
          onValueChange={(v) => setOpenWorkflowIds(v as number[])}
          multiple
          className="border-t border-border/70"
        >
          {displayGroups.map((group) => {
            const latest = group.runs[0];
            const isLive = latest?.status === "running";
            const awaitingFirstRun = Boolean(group.assignment && !group.runs.some(run => run.workflow_assignment_id === group.assignment!.id));
            return (
              <ClientWorkflowActivity
                key={group.workflowId}
                workflowId={group.workflowId}
                name={group.workflowName}
                archived={group.workflowArchived}
                runs={group.runs}
                assigned={Boolean(group.assignment)}
                awaitingFirstRun={awaitingFirstRun}
                executionMode={group.assignment?.execution_mode}
                readiness={group.assignment ? assignmentReadiness(group.assignment) : undefined}
                actions={<>
                    {awaitingFirstRun && group.assignment && !group.workflowArchived && (
                      <Button variant="outline" size="sm"
                        disabled={!group.assignment.ready || startingId === group.assignment.id}
                        onClick={() => onStart(group.assignment!.id)}>
                        {startingId === group.assignment.id ? <Loader2 className="animate-spin" /> : <Play />}
                        Run now
                      </Button>
                    )}
                    {!awaitingFirstRun && !isLive && !group.workflowArchived && latest?.status === "queued" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRunNow(latest.id)}
                        disabled={runningId === latest.id}
                      >
                        {runningId === latest.id ? <Loader2 className="animate-spin" /> : <Play />}
                        Run now
                      </Button>
                    )}
                    {!awaitingFirstRun && !isLive && latest?.can_resume && <ResumeWorkflowDialog run={latest} onResumed={onChange} />}
                    {!awaitingFirstRun && !isLive &&
                      !group.workflowArchived &&
                      latest &&
                      (latest.status === "completed" ||
                        latest.status === "needs_review" ||
                        latest.status === "failed") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRerun(latest.id)}
                        disabled={runningId === latest.id}
                      >
                        {runningId === latest.id ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                        Rerun
                      </Button>
                    )}
                    {!isLive && group.assignment && (
                      <RemoveWorkflowButton
                        clientId={clientId}
                        workflowId={group.workflowId}
                        workflowName={group.workflowName}
                        onRemoved={onChange}
                      />
                    )}
                </>}
              />
            );
          })}
        </Accordion>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </SectionCard>
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
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Options for ${workflowName}`} className="text-muted-foreground" />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
            <Trash2 /> Remove workflow
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
