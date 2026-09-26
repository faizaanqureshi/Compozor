"use client";

import { useMemo, useState } from "react";
import { Archive, FileText, MoreHorizontal } from "lucide-react";
import {
  ApiError,
  type ClientWithChecklistSummary,
  type Workflow,
  type WorkflowRunStatus,
  archiveWorkflow,
} from "@/lib/api";
import { cn, formatShortDate } from "@/lib/utils";
import { WorkflowFormDialog } from "@/components/workflow-form-dialog";
import { Panel } from "@/components/panel";
import { StatStrip, type StatStripItem } from "@/components/stat-strip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Where each assigned client stands on a workflow's latest run. "Waiting"
// means assigned but not run yet (usually still collecting documents).
type RunBucket = "attention" | "active" | "completed" | "waiting";

const BUCKETS: { key: RunBucket; label: string; dot: string }[] = [
  { key: "attention", label: "need review", dot: "bg-destructive" },
  { key: "active", label: "running", dot: "bg-warning" },
  { key: "completed", label: "completed", dot: "bg-success" },
  { key: "waiting", label: "waiting", dot: "bg-muted-foreground/30" },
];

function bucketFor(status: WorkflowRunStatus | null): RunBucket {
  switch (status) {
    case "needs_review":
    case "failed":
      return "attention";
    case "running":
    case "queued":
      return "active";
    case "completed":
      return "completed";
    default:
      return "waiting";
  }
}

type RunMix = Record<RunBucket, number> & { assigned: number };

const emptyMix = (): RunMix => ({ assigned: 0, attention: 0, active: 0, completed: 0, waiting: 0 });

export function WorkflowLibrary({
  workflows,
  clients,
  error,
  onRefresh,
}: {
  workflows: Workflow[] | null;
  clients: ClientWithChecklistSummary[] | undefined;
  error: string | null;
  onRefresh: () => void;
}) {
  // Per-workflow assignment and run state, from the client list the app
  // already caches (each client carries its workflows' latest run status).
  const { byWorkflow, totals, clientsWithWorkflows } = useMemo(() => {
    const byWorkflow = new Map<number, RunMix>();
    const totals = emptyMix();
    const withWorkflows = new Set<number>();
    for (const client of clients ?? []) {
      for (const w of client.workflow_statuses) {
        if (w.workflow_archived) continue;
        const mix = byWorkflow.get(w.workflow_id) ?? emptyMix();
        const bucket = bucketFor(w.status);
        mix.assigned++;
        mix[bucket]++;
        totals.assigned++;
        totals[bucket]++;
        byWorkflow.set(w.workflow_id, mix);
        withWorkflows.add(client.id);
      }
    }
    return { byWorkflow, totals, clientsWithWorkflows: withWorkflows.size };
  }, [clients]);

  const automatic = (workflows ?? []).filter((w) => w.execution_mode === "auto").length;
  const summary: StatStripItem[] = [
    {
      label: "Workflows",
      value: workflows?.length ?? 0,
      detail: workflows?.length ? `${automatic} automatic · ${workflows.length - automatic} on demand` : "None yet",
    },
    {
      label: "Clients assigned",
      value: clientsWithWorkflows,
      detail: totals.assigned ? `${totals.assigned} assignment${totals.assigned === 1 ? "" : "s"}` : "No assignments yet",
    },
    {
      label: "Needs review",
      value: totals.attention,
      tone: totals.attention > 0 ? "text-destructive" : undefined,
      detail: totals.attention > 0 ? "Review on the client's page" : "Nothing waiting on you",
    },
    {
      label: "In progress",
      value: totals.active,
      detail: `${totals.waiting} waiting on documents`,
    },
    {
      label: "Completed",
      value: totals.completed,
      detail: totals.assigned ? `${Math.round((totals.completed / totals.assigned) * 100)}% of assignments` : "—",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[96rem] min-w-0 flex-col gap-6">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl leading-tight font-thin tracking-tight [font-family:var(--font-denton)] md:text-5xl">
            Workflows
          </h1>
          <p className="max-w-xl text-sm text-pretty text-muted-foreground">
            Define the work once, then run it for every client it applies to. Assign workflows from the Clients page.
          </p>
        </div>
        <div className="self-start sm:self-auto">
          <WorkflowFormDialog onSaved={onRefresh} />
        </div>
      </header>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      <StatStrip
        label="Workflow summary"
        items={summary}
        loading={workflows === null || clients === undefined}
        columns="grid-cols-2 lg:grid-cols-5 [&>*:last-child]:max-lg:col-span-2"
      />

      <Panel title="Library" meta={workflows ? `${workflows.length}` : undefined}>
        {workflows === null ? (
          <div className="flex flex-col gap-3" role="status" aria-label="Loading workflows">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-start gap-1.5 py-2">
            <p className="text-sm font-medium">Create your first workflow</p>
            <p className="max-w-md text-sm text-pretty text-muted-foreground">
              Write the instructions for a recurring task, such as preparing a T1 return, then assign it to clients.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            <div
              aria-hidden
              className="hidden border-b border-border/70 pb-2.5 text-[0.6875rem] tracking-wider text-muted-foreground uppercase md:grid md:grid-cols-[minmax(0,1fr)_7rem_minmax(12rem,16rem)_6rem_2rem] md:gap-4"
            >
              <span>Workflow</span>
              <span>Runs</span>
              <span>Clients</span>
              <span>Created</span>
              <span />
            </div>
            <ul className="flex flex-col divide-y divide-border/50">
              {workflows.map((workflow) => (
                <WorkflowRow
                  key={workflow.id}
                  workflow={workflow}
                  mix={byWorkflow.get(workflow.id) ?? emptyMix()}
                  onChange={onRefresh}
                />
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
}

function WorkflowRow({ workflow, mix, onChange }: { workflow: Workflow; mix: RunMix; onChange: () => void }) {
  const [archiving, setArchiving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const samples = workflow.work_samples?.length ?? 0;

  const onArchive = async () => {
    setArchiving(true);
    setError(null);
    try {
      await archiveWorkflow(workflow.id);
      setConfirming(false);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setArchiving(false);
    }
  };

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 py-4 md:grid-cols-[minmax(0,1fr)_7rem_minmax(12rem,16rem)_6rem_2rem] md:items-start">
      <div className="flex min-w-0 flex-col gap-1">
        <WorkflowFormDialog
          workflow={workflow}
          onSaved={onChange}
          trigger={
            <button
              type="button"
              className="w-fit max-w-full truncate text-left text-sm font-medium underline-offset-4 hover:underline"
            >
              {workflow.name}
            </button>
          }
        />
        <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-pretty text-muted-foreground">
          {workflow.instructions}
        </p>
        {samples > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="size-3" />
            {samples} work sample{samples === 1 ? "" : "s"}
          </span>
        )}
      </div>

      <div className="col-start-2 row-start-1 md:hidden">
        <RowMenu name={workflow.name} onArchive={() => setConfirming(true)} />
      </div>

      <span className="text-sm text-muted-foreground max-md:col-span-2">
        <span className="text-xs md:hidden">Runs </span>
        <span className="text-foreground/80">{workflow.execution_mode === "auto" ? "Automatically" : "On demand"}</span>
      </span>

      <div className="max-md:col-span-2">
        <RunMixSummary mix={mix} />
      </div>

      <span
        className="hidden text-sm whitespace-nowrap text-muted-foreground md:block"
        title={new Date(workflow.created_at).toLocaleString()}
      >
        {formatShortDate(workflow.created_at, true)}
      </span>

      <div className="hidden justify-end md:flex">
        <RowMenu name={workflow.name} onArchive={() => setConfirming(true)} />
      </div>

      <Dialog open={confirming} onOpenChange={(open) => !archiving && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {workflow.name}?</DialogTitle>
            <DialogDescription>
              It won&apos;t run for any client going forward and leaves this list. Past runs stay in each client&apos;s
              history.
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={archiving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onArchive} disabled={archiving}>
              {archiving ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function RowMenu({ name, onArchive }: { name: string; onArchive: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={`Options for ${name}`} className="-mr-1 text-muted-foreground" />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onClick={onArchive}>
          <Archive />
          Archive workflow
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Assigned clients split by where their latest run stands: a thin segmented
// rule, then the counts in words.
function RunMixSummary({ mix }: { mix: RunMix }) {
  if (mix.assigned === 0) return <span className="text-sm text-muted-foreground">Not assigned</span>;
  const parts = BUCKETS.filter((b) => mix[b.key] > 0);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm text-foreground/80">
        {mix.assigned} client{mix.assigned === 1 ? "" : "s"}
      </span>
      <div className="flex h-1 w-full max-w-40 gap-px overflow-hidden rounded-full bg-muted" aria-hidden>
        {parts.map((b) => (
          <span key={b.key} className={cn("h-full", b.dot)} style={{ flexGrow: mix[b.key] }} />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {parts.map((b) => `${mix[b.key]} ${b.label}`).join(" · ")}
      </span>
    </div>
  );
}
