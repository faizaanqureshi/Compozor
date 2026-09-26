"use client";

import { DocumentValidationResult } from "@/components/document-validation-result";
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { groupClientWorkflows, assignmentReadiness } from "@/lib/client-workflows";
import { createSnapshotRefresh } from "@/lib/snapshot-refresh";
import Link from "next/link";
import useSWR from "swr";
import {
  clientChecklistKey,
  clientCommitmentsKey,
  clientDocumentsKey,
  clientKey,
  clientMeetingsKey,
  clientFactsKey,
  clientThreadsKey,
  clientWorkflowSnapshotKey,
} from "@/lib/swr-keys";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  FileText,
  UploadCloud,
} from "lucide-react";
import {
  ApiError,
  ChecklistItem,
  ChecklistItemStatus,
  ChecklistSummary,
  ClientCommitment,
  ClientDetail,
  ClientFact,
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
  deleteClientFact,
  deleteDocument,
  downloadClientDocumentsZip,
  getClient,
  getClientUploadLink,
  listChecklistItems,
  listClientCommitments,
  listClientDocuments,
  listClientMeetings,
  listClientFacts,
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
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function SectionCard({
  title,
  meta,
  action,
  loadError,
  className,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  action?: React.ReactNode;
  // One failed request shows a quiet note in its own section instead of
  // breaking the whole page.
  loadError?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4 rounded-xl bg-card p-5 ring-1 ring-foreground/10", className)}>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 className="text-[0.9375rem] font-medium tracking-tight">{title}</h2>
          {meta && <div className="text-sm text-muted-foreground">{meta}</div>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
      </div>
      {loadError ? (
        <p className="text-sm text-muted-foreground" title={loadError}>
          Couldn&apos;t load this section right now.
        </p>
      ) : (
        children
      )}
    </section>
  );
}

// Shared quiet table header cell.
const th = "py-1.5 pr-4 pb-2.5 text-[0.6875rem] font-normal tracking-wider text-muted-foreground uppercase";

function errorMessage(e: unknown): string {
  return e instanceof ApiError ? e.message : String(e);
}

function formatShortDate(iso: string, withYear = false): string {
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

function relativeDays(iso: string, today: Date): string {
  const days = Math.round((startOfDay(new Date(iso)).getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

const statusPillClasses: Record<ChecklistItemStatus, string> = {
  received: "bg-accent/15 text-accent",
  missing: "bg-warning/20 text-warning-foreground",
  wrong: "bg-destructive/10 text-destructive",
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

  // Every section is cached by SWR, so reopening a client shows the last known
  // state immediately and refreshes it in the background.
  const clientQuery = useSWR(clientKey(clientId), () => getClient(clientId));
  const checklistQuery = useSWR(clientChecklistKey(clientId), () => listChecklistItems(clientId));
  const threadsQuery = useSWR(clientThreadsKey(clientId), () => listEmailThreads(clientId));
  const documentsQuery = useSWR(clientDocumentsKey(clientId), () => listClientDocuments(clientId));
  const clientFactsQuery = useSWR(clientFactsKey(clientId), () => listClientFacts(clientId));
  const commitmentsQuery = useSWR(clientCommitmentsKey(clientId), () => listClientCommitments(clientId));
  const meetingsQuery = useSWR(clientMeetingsKey(clientId), () => listClientMeetings(clientId));
  // Workflows keep their live refresher (SSE + polling, serialized); it writes
  // each snapshot into this cache entry instead of component state.
  const { data: workflowSnapshot, mutate: setWorkflowSnapshot } = useSWR<
    [WorkflowRun[], ClientWorkflowAssignment[]]
  >(clientWorkflowSnapshotKey(clientId), null);

  const client = clientQuery.data ?? null;
  const checklist = checklistQuery.data ?? null;
  const threads = threadsQuery.data ?? null;
  const documents = documentsQuery.data ?? null;
  const clientFacts = clientFactsQuery.data ?? null;
  const commitments = commitmentsQuery.data ?? null;
  const meetings = meetingsQuery.data ?? null;
  const workflowRuns = workflowSnapshot?.[0] ?? null;
  const workflowAssignments = workflowSnapshot?.[1] ?? null;
  const error = clientQuery.error ? errorMessage(clientQuery.error) : null;
  // A section only shows its error when there's nothing cached to show.
  const sectionError = (query: { data?: unknown; error?: unknown }) =>
    query.data === undefined && query.error ? errorMessage(query.error) : null;
  const loadErrors = {
    checklist: sectionError(checklistQuery),
    threads: sectionError(threadsQuery),
    documents: sectionError(documentsQuery),
    clientFacts: sectionError(clientFactsQuery),
    commitments: sectionError(commitmentsQuery),
    meetings: sectionError(meetingsQuery),
  };

  const [workflowError, setWorkflowError] = useState<string | null>(null);
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
      onValue: (snapshot) => {
        void setWorkflowSnapshot(snapshot, { revalidate: false });
        setWorkflowError(null);
      },
      onError: (e) => setWorkflowError(errorMessage(e)),
    });
    workflowRefreshRef.current = controller;
    controller.refresh({ immediate: true });
    return () => {
      controller.stop();
      workflowRefreshRef.current = null;
    };
  }, [clientId, setWorkflowSnapshot]);

  const refreshWorkflowRuns = useCallback(() => {
    workflowRefreshRef.current?.refresh();
  }, []);

  const refreshClient = () => {
    void clientQuery.mutate();
    void checklistQuery.mutate();
    void threadsQuery.mutate();
    void documentsQuery.mutate();
    void clientFactsQuery.mutate();
    void commitmentsQuery.mutate();
    void meetingsQuery.mutate();
  };

  const refresh = () => {
    refreshClient();
    refreshWorkflowRuns();
  };

  if (error && !client) return <p className="text-sm text-destructive">{error}</p>;

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <ClientHeader
        clientId={clientId}
        client={client}
        onChange={refresh}
        onAssignPackage={() => setAssignPackageOpen(true)}
        onDeleted={() => router.push("/clients")}
      />

      <ClientSummary
        client={client}
        checklist={checklist}
        threads={threads}
        runs={workflowRuns}
        assignments={workflowAssignments}
      />

      {client !== null && (
        <AssignPackagePopup
          open={assignPackageOpen}
          onOpenChange={setAssignPackageOpen}
          clientId={clientId}
          assignedPackageIds={client.assigned_package_ids}
          checklist={checklist}
          onAssigned={refresh}
        />
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <ChecklistCard
            clientId={clientId}
            checklist={checklist}
            documents={documents}
            loadError={loadErrors.checklist}
            onChange={refresh}
            onEditPackage={() => setAssignPackageOpen(true)}
          />

          <WorkflowRunsCard
            clientId={clientId}
            runs={workflowRuns}
            assignments={workflowAssignments}
            loadError={workflowError}
            onChange={refreshWorkflowRuns}
          />

          <DocumentVaultCard
            clientId={clientId}
            documents={documents}
            checklist={checklist}
            loadError={loadErrors.documents}
            onChange={refresh}
          />

          <CommunicationCard threads={threads} loadError={loadErrors.threads} />
        </div>

        {/* Grid on tablets (cards top-aligned), a full-width column beside the main content on xl. */}
        <aside className="grid min-w-0 items-start gap-6 md:grid-cols-2 xl:flex xl:flex-col xl:items-stretch">
          <ClientDetailsCard
            client={client}
            checklist={checklist}
            onManagePackages={() => setAssignPackageOpen(true)}
          />

          <WaitingOnCard
            clientId={clientId}
            commitments={commitments}
            loadError={loadErrors.commitments}
            onChange={refresh}
          />

          <MeetingCard meetings={meetings} loadError={loadErrors.meetings} />

          <UploadLinkCard clientId={clientId} />

          <ClientFactsCard
            clientId={clientId}
            notes={clientFacts}
            loadError={loadErrors.clientFacts}
            onChange={refresh}
          />
        </aside>
      </div>
    </div>
  );
}

function ClientHeader({
  clientId,
  client,
  onChange,
  onAssignPackage,
  onDeleted,
}: {
  clientId: number;
  client: ClientDetail | null;
  onChange: () => void;
  onAssignPackage: () => void;
  onDeleted: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const onSendReminder = async () => {
    setSending(true);
    setMessage(null);
    try {
      await sendChecklistReminder(clientId);
      setMessage("Reminder sent. It's in the Email Log.");
      onChange();
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <header className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link
          href="/clients"
          className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Clients
        </Link>
      </nav>
      {client === null ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-11 w-72" />
          <Skeleton className="h-4 w-20" />
        </div>
      ) : (
        <div className="flex flex-col gap-4 animate-fade-in lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="text-4xl leading-tight font-thin tracking-tight text-balance [font-family:var(--font-denton)] md:text-5xl">
              {client.name}
            </h1>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    client.status === "active" ? "bg-success" : "bg-muted-foreground/40"
                  )}
                />
                {client.status.charAt(0).toUpperCase() + client.status.slice(1)}
              </span>
            </p>
          </div>
          <div className="flex flex-col items-start gap-2 lg:items-end">
            <div className="flex flex-wrap items-center gap-1.5">
              <EditClientButton client={client} onUpdated={onChange} />
              <DeleteClientButton clientId={clientId} clientName={client.name} onDeleted={onDeleted} />
              <span aria-hidden className="mx-1 h-5 w-px bg-border" />
              <PackageFormDialog onSaved={onChange} variant="ghost" />
              <Button variant="outline" onClick={onAssignPackage}>
                <Plus />
                Assign package
              </Button>
              <Button onClick={onSendReminder} disabled={sending}>
                {sending ? <Loader2 className="animate-spin" /> : <Mail />}
                {sending ? "Sending…" : "Send reminder"}
              </Button>
            </div>
            {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
          </div>
        </div>
      )}
    </header>
  );
}

// One row of figures that answers "where does this client stand?" before
// any detail: collection progress, what needs action, the next deadline,
// the last contact, and workflow state.
function ClientSummary({
  client,
  checklist,
  threads,
  runs,
  assignments,
}: {
  client: ClientDetail | null;
  checklist: ChecklistSummary | null;
  threads: EmailThread[] | null;
  runs: WorkflowRun[] | null;
  assignments: ClientWorkflowAssignment[] | null;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const loading = client === null || checklist === null;

  const nextDeadline = checklist?.items
    .filter((i) => (i.status === "missing" || i.status === "wrong") && i.expected_date_range_end)
    .sort((a, b) => a.expected_date_range_end!.localeCompare(b.expected_date_range_end!))[0];
  const deadlineTier = nextDeadline ? TIER_META[computeTier(nextDeadline, today).tier] : null;

  const pendingDraft = threads
    ?.flatMap((t) => t.messages)
    .some((m) => m.direction === "outbound" && m.status === "draft");
  const lastInbound = threads
    ?.flatMap((t) => t.messages)
    .filter((m) => m.direction === "inbound")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  const latestByWorkflow = new Map<number, WorkflowRun>();
  for (const run of runs ?? []) {
    const current = latestByWorkflow.get(run.workflow_id);
    if (!current || run.created_at > current.created_at) latestByWorkflow.set(run.workflow_id, run);
  }
  const latestRuns = [...latestByWorkflow.values()];
  const workflowCount = new Set([
    ...(assignments ?? []).map((a) => a.workflow_id),
    ...latestRuns.map((r) => r.workflow_id),
  ]).size;
  const needsReview = latestRuns.filter((r) => r.status === "needs_review" || r.status === "failed").length;
  const running = latestRuns.filter((r) => r.status === "running").length;
  const completed = latestRuns.filter((r) => r.status === "completed").length;

  const outstanding = checklist ? checklist.missing + checklist.wrong : 0;
  const tiles: { label: string; value: React.ReactNode; detail: React.ReactNode; tone?: string }[] = checklist && client
    ? [
        {
          label: "Documents",
          value: (
            <>
              {checklist.received}
              <span className="text-muted-foreground/70">/{checklist.total}</span>
            </>
          ),
          detail: (
            <span className="flex items-center gap-2">
              <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-success"
                  style={{ width: `${checklist.total ? (checklist.received / checklist.total) * 100 : 0}%` }}
                />
              </span>
              received
            </span>
          ),
        },
        {
          label: "Needs action",
          value: outstanding,
          tone: checklist.wrong > 0 ? "text-destructive" : outstanding > 0 ? "text-warning-foreground" : undefined,
          detail:
            outstanding === 0
              ? "Nothing outstanding"
              : [checklist.missing > 0 && `${checklist.missing} missing`, checklist.wrong > 0 && `${checklist.wrong} wrong`]
                  .filter(Boolean)
                  .join(" · "),
        },
        {
          label: "Next deadline",
          value: nextDeadline ? formatShortDate(nextDeadline.expected_date_range_end!) : "—",
          tone: deadlineTier && deadlineTier !== TIER_META.on_track ? deadlineTier.text : undefined,
          detail: nextDeadline
            ? `${nextDeadline.doc_type_needed} · ${relativeDays(nextDeadline.expected_date_range_end!, today)}`
            : "No open deadlines",
        },
        {
          label: "Last reminder",
          value: client.last_reminder_sent_at ? formatShortDate(client.last_reminder_sent_at) : "Never",
          detail: pendingDraft ? (
            <span className="text-warning-foreground">A drafted reminder is awaiting send</span>
          ) : lastInbound ? (
            `Client replied ${relativeDays(lastInbound.created_at, today)}`
          ) : (
            "No replies yet"
          ),
        },
        {
          label: "Workflows",
          value: workflowCount,
          tone: needsReview > 0 ? "text-destructive" : undefined,
          detail:
            workflowCount === 0
              ? "None assigned"
              : [
                  needsReview > 0 && `${needsReview} need${needsReview === 1 ? "s" : ""} review`,
                  running > 0 && `${running} running`,
                  completed > 0 && `${completed} completed`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Waiting on documents",
        },
      ]
    : [];

  return (
    <section
      aria-label="Client summary"
      className="grid grid-cols-2 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 md:grid-cols-3 xl:grid-cols-5"
    >
      {loading
        ? Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-3 border-border p-5 [&:not(:first-child)]:border-l">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3 w-28" />
            </div>
          ))
        : tiles.map((tile, i) => (
            <div
              key={tile.label}
              className={cn(
                "flex min-w-0 flex-col gap-1.5 border-border p-5",
                i > 0 && "border-l",
                i === 2 && "max-md:border-l-0 max-md:border-t",
                i >= 2 && "max-md:border-t",
                i === 3 && "md:max-xl:border-l-0 md:max-xl:border-t",
                i === 4 && "max-md:border-l-0 md:max-xl:border-t"
              )}
            >
              <span className="text-[0.6875rem] tracking-wider text-muted-foreground uppercase">{tile.label}</span>
              <span className={cn("text-2xl font-light tracking-tight tabular-nums", tile.tone)}>{tile.value}</span>
              <span className="truncate text-xs text-muted-foreground">{tile.detail}</span>
            </div>
          ))}
    </section>
  );
}

function ClientDetailsCard({
  client,
  checklist,
  onManagePackages,
}: {
  client: ClientDetail | null;
  checklist: ChecklistSummary | null;
  onManagePackages: () => void;
}) {
  const packageNames = Array.from(
    new Set((checklist?.items ?? []).map((i) => i.package_name).filter((n): n is string => Boolean(n)))
  );
  const rows: [string, React.ReactNode][] = client
    ? [
        ["Email", <a key="e" href={`mailto:${client.email}`} className="break-all hover:underline">{client.email}</a>],
        ["Phone", client.phone ? formatPhoneNumber(client.phone) : <span className="text-muted-foreground">—</span>],
        ["Company", client.company_name ?? <span className="text-muted-foreground">—</span>],
        [
          "Packages",
          packageNames.length > 0 ? (
            <span className="flex flex-col gap-0.5">
              {packageNames.map((n) => (
                <span key={n}>{n}</span>
              ))}
            </span>
          ) : (
            <span className="text-muted-foreground">None assigned</span>
          ),
        ],
        ["Client since", formatShortDate(client.created_at, true)],
        [
          "Last reminder",
          client.last_reminder_sent_at ? (
            new Date(client.last_reminder_sent_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })
          ) : (
            <span className="text-muted-foreground">Never</span>
          ),
        ],
      ]
    : [];

  return (
    <SectionCard
      title="Details"
      action={
        <Button variant="ghost" size="sm" onClick={onManagePackages}>
          Manage packages
        </Button>
      }
    >
      {client === null ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      ) : (
        <dl className="flex flex-col divide-y divide-border/60 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 py-2.5 first:pt-0 last:pb-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </SectionCard>
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
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit client"
              className="text-muted-foreground hover:text-foreground"
              onClick={openDialog}
            />
          }
        >
          <Pencil />
        </TooltipTrigger>
        <TooltipContent>Edit client</TooltipContent>
      </Tooltip>

      <Dialog open={editing} onOpenChange={(open) => !submitting && setEditing(open)}>
        <DialogContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>Edit client</DialogTitle>
              <DialogDescription>
                Update {client.name}&apos;s information.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-5">
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
                <NativeSelect
                  id="edit-client-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ClientStatus)}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </NativeSelect>
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
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete client"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setConfirming(true)}
            />
          }
        >
          <Trash2 />
        </TooltipTrigger>
        <TooltipContent>Delete client</TooltipContent>
      </Tooltip>

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
  loadError,
  onChange,
  onEditPackage,
}: {
  clientId: number;
  checklist: ChecklistSummary | null;
  documents: DocumentOut[] | null;
  loadError?: string | null;
  onChange: () => void;
  onEditPackage: () => void;
}) {
  // Computed once, not a bare `new Date()` call in the render body - same
  // reasoning as the urgency dashboard's own lazy-initializer pattern.
  const today = useMemo(() => startOfDay(new Date()), []);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const onDeselectPackage = async (packageId: number) => {
    setDeselecting(true);
    setError(null);
    try {
      await unassignPackageFromClient(packageId, clientId);
      setDeselectOpen(false);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setDeselecting(false);
    }
  };

  return (
    <SectionCard
      title="Documents requested"
      loadError={loadError}
      meta={
        checklist &&
        checklist.total > 0 && (
          <span className="flex items-center gap-2">
            {checklist.received} of {checklist.total} received
            {actionRequired > 0 && (
              <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium text-warning-foreground">
                {actionRequired} need{actionRequired === 1 ? "s" : ""} action
              </span>
            )}
          </span>
        )
      }
      action={
        <>
          <Button variant="ghost" size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus />
            Add requirement
          </Button>
          {packageNames.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" size="icon-sm" aria-label="Package options" className="text-muted-foreground" />}
              >
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEditPackage}>
                  <Pencil /> Edit packages
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={() => setDeselectOpen(true)}>
                  <Trash2 /> Deselect package
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      }
    >
      {checklist === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : checklist.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing requested yet. Assign a package or add a requirement.
        </p>
      ) : (
      <div className="overflow-x-auto">
      <table
        className="w-full min-w-[560px] border-collapse text-sm animate-fade-in"
      >
        <thead>
          <tr className="border-b border-border text-left">
            <th className={th}>
              Document
            </th>
            <th className={th}>
              Status
            </th>
            <th className={th}>
              Deadline
            </th>
            <th className={th}>
              File
            </th>
            <th className={cn(th, "pr-0")}>
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
              <tr key={item.id} className="border-b border-border/50 last:border-0">
                <td className="py-3 pr-4 align-top">
                  <div className="font-medium">{item.doc_type_needed}</div>
                  {(item.description || item.package_name) && (
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[item.package_name, item.description].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="py-3 pr-4 align-top">
                  <StatusPill status={item.status} />
                  {item.wrong_attempt_count > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.wrong_attempt_count} wrong attempt{item.wrong_attempt_count === 1 ? "" : "s"}
                      {item.last_wrong_doc_type && <> · last sent {item.last_wrong_doc_type}</>}
                    </div>
                  )}
                </td>
                <td className="py-3 pr-4 align-top">
                  <DeadlineCell item={item} today={today} />
                </td>
                <td className="max-w-56 py-3 pr-4 align-top">
                  {matched ? (
                    matched.download_url ? (
                      <a
                        href={matched.download_url}
                        target="_blank"
                        rel="noreferrer"
                        title={matched.resolved_display_name}
                        className="inline-flex max-w-full items-center gap-1.5 text-foreground/85 hover:text-foreground hover:underline"
                      >
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{matched.resolved_display_name}</span>
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Uploaded</span>
                    )
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="py-2 pr-0 text-right align-top">
                  <ChecklistItemActions
                    clientId={clientId}
                    item={item}
                    onChange={onChange}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

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
            onAssigned={() => {
              onOpenChange(false);
              onAssigned();
            }}
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
  pending: "bg-warning/20 text-warning-foreground",
  fulfilled: "bg-accent/15 text-accent",
  cancelled: "bg-muted text-muted-foreground",
  escalated: "bg-destructive/10 text-destructive",
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
  proposed: "bg-warning/20 text-warning-foreground",
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

function MeetingCard({
  meetings,
  loadError,
}: {
  meetings: MeetingRequest[] | null;
  loadError?: string | null;
}) {
  return (
    <SectionCard title="Meetings" loadError={loadError}>
      {meetings === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
        </div>
      ) : meetings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No meetings proposed yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 animate-fade-in">
          {meetings.map((m) => (
            <li key={m.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <span className="text-sm font-medium">{m.purpose ?? "Meeting"}</span>
                <MeetingStatusPill meeting={m} />
              </div>
              <span className="text-xs text-muted-foreground">
                {m.status === "confirmed" && m.confirmed_start && m.confirmed_end
                  ? formatMeetingTime(m.confirmed_start, m.confirmed_end)
                  : m.proposed_slots && m.proposed_slots.length > 0
                  ? `${m.proposed_slots.length} time${m.proposed_slots.length === 1 ? "" : "s"} proposed, awaiting reply`
                  : "No time set"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function WaitingOnCard({
  clientId,
  commitments,
  loadError,
  onChange,
}: {
  clientId: number;
  commitments: ClientCommitment[] | null;
  loadError?: string | null;
  onChange: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const open = commitments?.filter((c) => c.status === "pending" || c.status === "escalated") ?? [];
  const closed = commitments?.filter((c) => c.status !== "pending" && c.status !== "escalated") ?? [];
  return (
    <SectionCard
      title="Waiting on"
      meta={open.length > 0 ? `${open.length} open` : undefined}
      loadError={loadError}
    >
      {commitments === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : commitments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing promised. Commitments from the client&apos;s emails appear here.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 animate-fade-in">
          {[...open, ...closed].map((c) => {
            const overdue = c.status === "pending" && c.expected_by !== null && c.expected_by < today;
            return (
              <li key={c.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm">{c.description}</span>
                  <CommitmentPill status={c.status} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                    {c.expected_by ? `Expected ${formatShortDate(c.expected_by)}` : "No date given"}
                  </span>
                  {(c.status === "pending" || c.status === "escalated") && (
                    <CommitmentResolveActions clientId={clientId} commitment={c} onChange={onChange} />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
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
    <div className="-mr-2 flex items-center justify-end gap-0.5">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button
        variant="ghost"
        size="xs"
        disabled={pending}
        onClick={() => setConfirming("fulfilled")}
      >
        Mark resolved
      </Button>
      <Button
        variant="ghost"
        size="xs"
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
  threads,
  loadError,
}: {
  threads: EmailThread[] | null;
  loadError?: string | null;
}) {
  return (
    <SectionCard
      title="Conversation"
      meta={threads && threads.length > 0 ? `${threads.length} thread${threads.length === 1 ? "" : "s"}` : undefined}
      loadError={loadError}
      action={
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/email-log" />}>
          Email log
        </Button>
      }
    >
      <ThreadsList threads={threads} />
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

  if (threads.length === 0) {
    return <p className="text-sm text-muted-foreground">No emails with this client yet.</p>;
  }

  return (
    <div
      className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/60 animate-fade-in"
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
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">
                  {latest?.subject || "(no subject)"}
                </span>
                {latest && (
                  <span className="truncate text-xs text-muted-foreground">
                    {latest.direction === "inbound" ? "Client replied" : latest.status === "draft" ? "Draft awaiting send" : "Sent"}
                    {" · "}
                    {formatShortDate(latest.created_at)}
                  </span>
                )}
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
                      <p className="mt-1 text-xs text-warning-foreground">
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
    </div>
  );
}

function DocumentVaultCard({
  clientId,
  documents,
  checklist,
  loadError,
  onChange,
}: {
  clientId: number;
  documents: DocumentOut[] | null;
  checklist: ChecklistSummary | null;
  loadError?: string | null;
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
    // The whole card accepts dropped files; the Upload button covers click.
    <div
      className="relative"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const dropped = e.dataTransfer.files?.[0];
        if (dropped) onUpload(dropped);
      }}
    >
    {dragOver && (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-accent bg-accent/5 text-sm font-medium text-accent">
        Drop to upload
      </div>
    )}
    <SectionCard
      title="Files"
      meta={documents && documents.length > 0 ? `${documents.length} received` : undefined}
      loadError={loadError}
      action={
        <>
          {documents && documents.length > 0 && (
            <Button variant="ghost" size="sm" disabled={downloading} onClick={onDownloadZip}>
              {downloading ? <Loader2 className="animate-spin" /> : <Download />}
              {downloading ? "Zipping…" : "Download all"}
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={submitting} onClick={() => fileInputRef.current?.click()}>
            {submitting ? <Loader2 className="animate-spin" /> : <UploadCloud />}
            {submitting ? "Uploading…" : "Upload"}
          </Button>
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
        </>
      }
    >
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

      {documents === null ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files yet. Upload one, or drop it anywhere on this card.</p>
      ) : (
      <div className="overflow-x-auto">
      <table
        className="w-full md:min-w-[600px] border-collapse text-sm animate-fade-in"
      >
        <thead>
          <tr className="border-b border-border text-left">
            <th className={th}>
              Document
            </th>
            <th className={cn(th, "hidden md:table-cell")}>
              Source
            </th>
            <th className={cn(th, "hidden md:table-cell")}>
              Status
            </th>
            <th className={cn(th, "hidden text-right md:table-cell")}>
              Year
            </th>
            <th className={cn(th, "hidden text-right md:table-cell")}>
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
              <tr key={doc.id} className="border-b border-border/50 last:border-0">
                <td className="py-3 pr-4 font-medium [overflow-wrap:anywhere]">
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
                  <span title={new Date(doc.received_at).toLocaleString()}>{formatShortDate(doc.received_at, true)}</span>
                </td>
                <td className="py-2 pr-0 text-right">
                  <DocumentActions clientId={clientId} doc={doc} checklistItem={item} onChange={onChange} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      )}
    </SectionCard>
    </div>
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
      title="Upload link"
      action={
        <Button variant="ghost" size="sm" disabled={busy} onClick={onRegenerate}>
          {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          {link ? "Regenerate" : "Create link"}
        </Button>
      }
    >
      {!loaded ? (
        <Skeleton className="h-9 w-full" />
      ) : (
        <div className="flex flex-col gap-3">
          {link?.upload_url ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 rounded-lg bg-muted/60 py-1 pr-1 pl-3">
                <code className="min-w-0 flex-1 truncate text-xs text-foreground/80">{link.upload_url}</code>
                <Button variant="outline" size="sm" className="bg-card" onClick={onCopy}>
                  {copied ? <CheckCircle2 className="text-accent" /> : <Copy />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Expires {formatShortDate(link.expires_at, true)}
                {" · "}
                {link.last_used_at ? `Last used ${formatShortDate(link.last_used_at)}` : "Not used yet"}
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



          {events && events.length > 0 && (
            <details className="group border-t border-border/60 pt-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-xs text-muted-foreground hover:text-foreground">
                Link activity ({events.length})
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">
                {events.map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-2">
                    <span>{UPLOAD_LINK_EVENT_LABELS[e.event] ?? e.event}</span>
                    <span className="shrink-0">{formatShortDate(e.created_at)}</span>
                  </li>
                ))}
              </ul>
            </details>
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
      action={
        <AssignWorkflowDialog
          clientIds={[clientId]}
          onAssigned={onChange}
          trigger={
            <Button variant="ghost" size="sm">
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

function ClientFactsCard({
  clientId,
  notes,
  loadError,
  onChange,
}: {
  clientId: number;
  notes: ClientFact[] | null;
  loadError?: string | null;
  onChange: () => void;
}) {
  return (
    <SectionCard title="What we know" loadError={loadError}>
      {notes === null ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : (
      <div
        className="flex flex-col divide-y divide-border/60 animate-fade-in"
      >
        {notes.map((note) => (
          <div
            key={note.id}
            className={cn(
              "-mr-2 flex items-start justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0",
              note.status === "replaced" && "opacity-50"
            )}
          >
            <div>
              <p className="text-foreground/80">
                {note.statement}
                {note.status === "replaced" && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    superseded
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {note.status === "conflict" ? "Conflicting information · " : note.verified ? "Verified · " : "Learned "}
                {formatShortDate(note.created_at, true)}
              </p>
            </div>
            <DeleteClientFactButton
              clientId={clientId}
              note={note}
              onChange={onChange}
            />
          </div>
        ))}
        {notes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nothing yet. Facts learned from this client&apos;s emails appear here.
          </p>
        )}
      </div>
      )}
    </SectionCard>
  );
}

function DeleteClientFactButton({
  clientId,
  note,
  onChange,
}: {
  clientId: number;
  note: ClientFact;
  onChange: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDelete = async () => {
    setPending(true);
    setError(null);
    try {
      await deleteClientFact(clientId, note.id);
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
        <span className="sr-only">Delete fact</span>
      </Button>

      <Dialog open={confirming} onOpenChange={(open) => !pending && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this client fact?</DialogTitle>
            <DialogDescription>
              This removes “{note.statement}” from what the AI knows about this
              client.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={pending}>
              {pending ? "Deleting…" : "Delete fact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
