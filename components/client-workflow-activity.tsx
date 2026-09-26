"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, Download, FileText, Loader2 } from "lucide-react";
import { getClientWorkflowRun, type WorkflowRun } from "@/lib/api";
import { formatDuration } from "@/lib/agent-activity";
import { cn } from "@/lib/utils";
import { runTimeline, useNow, WorkflowRunTimeline } from "@/components/workflow-run-timeline";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

const labels: Record<WorkflowRun["status"], string> = {
  queued: "Ready to run", running: "Running", completed: "Completed",
  needs_review: "Needs review", failed: "Failed",
};

// Quiet uppercase label, matching the dashboard's stat strip and table heads.
const eyebrow = "text-[0.6875rem] font-normal tracking-wider text-muted-foreground uppercase";

// A quieter focus treatment than the accordion default, for triggers that sit inside a panel.
const quietTrigger = "rounded-md font-normal hover:no-underline focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-ring/30";

function RunStatus({ status, starting }: { status: WorkflowRun["status"]; starting?: boolean }) {
  if (starting) return <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground/75">
    <Loader2 className="size-3 animate-spin" />Starting
  </span>;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-medium",
      status === "failed" || status === "needs_review" ? "text-destructive" : status === "running" ? "text-foreground" : "text-foreground/75")}>
      {status === "running" ? <Loader2 className="size-3 animate-spin" />
        : status === "completed" ? <Check className="size-3" />
        : <span className={cn("size-1.5 rounded-full", status === "queued" ? "bg-muted-foreground/50" : "bg-destructive")} />}
      {labels[status]}
    </span>
  );
}

function formatDate(timestamp: string) {
  const date = new Date(timestamp);
  return <>
    {date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
    <span className="mx-1.5 text-muted-foreground/50">·</span>
    {date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
  </>;
}

function RunDate({ run, className }: { run: WorkflowRun; className?: string }) {
  const timestamp = run.started_at ?? run.created_at;
  return <time dateTime={timestamp} title={new Date(timestamp).toLocaleString()} className={cn("tabular-nums", className)}>
    {formatDate(timestamp)}
  </time>;
}

function runDuration(run: WorkflowRun, now: number) {
  if (!run.started_at) return null;
  const end = run.status === "running" ? now : run.completed_at ? Date.parse(run.completed_at) : null;
  return end === null ? null : formatDuration(end - Date.parse(run.started_at));
}

function fileCount(run: WorkflowRun) {
  const count = run.status === "completed" ? run.outputs.length : (run.draft_outputs?.length ?? 0);
  if (!count) return null;
  return `${count} ${run.status === "completed" ? "" : "draft "}file${count === 1 ? "" : "s"}`;
}

// The latest run's headline facts, answering "where does this stand?" at a glance.
function RunFacts({ run, starting, now }: { run: WorkflowRun; starting?: boolean; now: number }) {
  const duration = runDuration(run, now);
  const files = fileCount(run);
  const facts: { label: string; value: React.ReactNode }[] = [
    { label: "Status", value: <RunStatus status={run.status} starting={starting} /> },
    { label: run.started_at ? "Started" : "Created", value: <RunDate run={run} /> },
    { label: run.status === "running" ? "Elapsed" : "Duration", value: duration ?? <span className="text-muted-foreground">—</span> },
    { label: "Output", value: files ?? <span className="text-muted-foreground">{run.status === "running" ? "In progress" : "None"}</span> },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
      {facts.map(fact => <div key={fact.label} className="flex min-w-0 flex-col gap-1.5">
        <dt className={eyebrow}>{fact.label}</dt>
        <dd className="text-[0.8125rem] text-foreground tabular-nums">{fact.value}</dd>
      </div>)}
    </dl>
  );
}

function OutputFiles({ run, draftOutputs }: { run: WorkflowRun; draftOutputs: WorkflowRun["outputs"] }) {
  const outputs = (run.status === "completed" ? run.outputs : draftOutputs).filter(output => output.download_url);
  const isDraft = run.status !== "completed";
  if (outputs.length === 0) return null;
  return (
    <div className="flex max-w-2xl flex-col gap-2">
      {isDraft && <p className="text-xs leading-relaxed text-muted-foreground"><span className="font-medium text-foreground/80">Draft available.</span> Checks are incomplete or need attention. Review the notes before using this file.</p>}
      <ul className="flex flex-col overflow-hidden rounded-lg ring-1 ring-foreground/10">
        {outputs.map(output => <li key={output.id} className="not-first:border-t not-first:border-border/70">
          <a href={output.download_url!} target="_blank" rel="noreferrer" title={output.filename} aria-label={`Download ${isDraft ? "draft " : ""}${output.filename}`}
            className="group flex min-w-0 items-center gap-3 px-3.5 py-3 text-[0.8125rem] !no-underline transition-colors outline-none hover:bg-muted/40 focus-visible:bg-muted/40">
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 break-all leading-snug text-foreground/90">{output.filename}</span>
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
              <Download className="size-3.5" /><span className="hidden sm:inline">Download</span>
            </span>
          </a>
        </li>)}
      </ul>
    </div>
  );
}

function PlanAndChecks({ run }: { run: WorkflowRun }) {
  const plan = run.execution_plan!;
  return (
    <div className="flex max-w-3xl flex-col gap-5 text-xs leading-relaxed text-muted-foreground">
      <p className="text-[0.8125rem] text-foreground/85">{plan.objective}</p>
      <ol className="flex flex-col gap-3">
        {plan.steps.map((step, i) => <li key={i} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-2">
          <span className="tabular-nums text-muted-foreground/70">{i + 1}.</span>
          <div className="flex flex-col gap-1">
            <span className="text-foreground/85">{step}</span>
            {run.step_results?.[String(i + 1)] && <span>{run.step_results[String(i + 1)]}</span>}
          </div>
        </li>)}
      </ol>
      {run.verification && <div className="flex flex-col gap-2 border-t border-border/70 pt-4">
        <p className={cn("font-medium", run.verification.passed ? "text-foreground/85" : "text-destructive")}>
          {run.verification.passed ? "Completion checks passed" : "Completion checks need attention"}
        </p>
        <ul className="flex flex-col gap-1.5">
          {run.verification.checks.map(check => <li key={check.criterion_id} className={cn("grid grid-cols-[1rem_minmax(0,1fr)] gap-x-1.5", !check.passed && "text-destructive")}>
            <span className="pt-0.5">{check.passed ? <Check className="size-3" /> : "✗"}</span>{check.evidence}
          </li>)}
          {run.verification.issues.map((issue, i) => <li key={i} className="text-destructive">{issue}</li>)}
        </ul>
      </div>}
    </div>
  );
}

function checksSummary(run: WorkflowRun) {
  const checks = run.verification?.checks ?? [];
  if (!checks.length) return `${run.execution_plan?.steps.length ?? 0} steps`;
  return `${checks.filter(c => c.passed).length} of ${checks.length} checks passed`;
}

function RunContents({ run, loadDetails = false, starting }: { run: WorkflowRun; loadDetails?: boolean; starting?: boolean }) {
  const { data, error, isLoading, mutate } = useSWR(
    loadDetails && run.details_loaded === false
      ? ["workflow-run", run.client_id, run.id, run.started_at, run.completed_at, run.status] : null,
    () => getClientWorkflowRun(run.client_id, run.id),
    { revalidateOnFocus: false },
  );
  const detail = run.details_loaded === false ? data : run;
  const running = run.status === "running";
  const timeline = detail ? runTimeline(detail, running) : null;
  const current = timeline?.entries.flatMap(entry => [entry, ...(entry.children ?? [])]).findLast(entry => entry.state === "running");
  const hasTrace = Boolean(timeline && (timeline.entries.length || timeline.earlier.length));
  const [open, setOpen] = useState<string[]>(running ? ["timeline"] : []);
  // Show progress as soon as a queued run starts, without another click.
  const [seenRunning, setSeenRunning] = useState(running);
  if (running && !seenRunning) {
    setSeenRunning(true);
    setOpen(prev => prev.includes("timeline") ? prev : [...prev, "timeline"]);
  }
  const now = useNow(running);
  const currentFor = current?.start !== undefined ? formatDuration(now - current.start) : null;

  if (run.status === "queued" && !hasTrace) {
    return <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">
      {starting ? "Waiting for a worker to pick this run up. Progress appears here as soon as it starts." : "This run hasn't started yet."}
    </p>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {running && current && (
        <p role="status" className="flex min-w-0 items-baseline gap-2 text-[0.8125rem] leading-snug">
          <span className={cn(eyebrow, "shrink-0")}>Now</span>
          <span className="min-w-0 flex-1 text-foreground">{current.title}…</span>
          {currentFor && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{currentFor}</span>}
        </p>
      )}
      {run.summary && <p className="max-w-3xl text-pretty text-[0.8125rem] leading-relaxed text-foreground/80">{run.summary}</p>}
      {run.review_reason && <p className="max-w-3xl border-l border-destructive/40 pl-3 text-[0.8125rem] leading-relaxed text-destructive">{run.review_reason}</p>}
      <OutputFiles run={run} draftOutputs={detail?.draft_outputs ?? run.draft_outputs ?? []} />
      {run.status === "completed" && Boolean(detail?.verification?.warnings?.length) && (
        <div className="max-w-3xl space-y-1.5 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground/80">Completion notes</p>
          <ul className="list-disc space-y-1 pl-4">{detail?.verification?.warnings?.map((note, i) => <li key={i}>{note}</li>)}</ul>
        </div>
      )}
      {isLoading && <span role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Loading run details…</span>}
      {error && <div className="flex items-center gap-2 text-xs text-destructive">Could not load run details.<Button variant="ghost" size="sm" onClick={() => void mutate()}>Retry</Button></div>}
      {detail && (hasTrace || detail.execution_plan) && (
        <Accordion multiple value={open} onValueChange={value => setOpen(value as string[])} className="border-t border-border/70">
          {hasTrace && timeline && <AccordionItem value="timeline" className="border-border/70">
            <AccordionTrigger className={cn(quietTrigger, "items-center py-3")}>
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[0.8125rem] text-foreground">Timeline</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {timeline.entries.filter(e => e.kind === "step").length} steps
                  {runDuration(run, now) && <> · {runDuration(run, now)}</>}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-1 pb-4 [&_p]:!mb-0">
              <WorkflowRunTimeline entries={timeline.entries} earlier={timeline.earlier}
                startedAt={detail.started_at} completedAt={detail.completed_at} running={running} />
            </AccordionContent>
          </AccordionItem>}
          {detail.execution_plan && <AccordionItem value="plan" className="border-border/70">
            <AccordionTrigger className={cn(quietTrigger, "items-center py-3")}>
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[0.8125rem] text-foreground">Plan &amp; checks</span>
                <span className={cn("text-xs tabular-nums", detail.verification && !detail.verification.passed ? "text-destructive" : "text-muted-foreground")}>
                  {checksSummary(detail)}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pt-1 pb-5 [&_p]:!mb-0">
              <PlanAndChecks run={detail} />
            </AccordionContent>
          </AccordionItem>}
        </Accordion>
      )}
    </div>
  );
}

const HISTORY_PREVIEW = 5;

function RunHistory({ runs }: { runs: WorkflowRun[] }) {
  const [openRuns, setOpenRuns] = useState<number[]>([]);
  const [showAll, setShowAll] = useState(false);
  const now = useNow(false);
  const shown = showAll ? runs : runs.slice(0, HISTORY_PREVIEW);
  return (
    <div className="flex flex-col gap-1 border-t border-border/70 pt-5">
      <div className="flex items-baseline gap-2 pb-1">
        <span className={eyebrow}>Earlier runs</span>
        <span className="text-[0.6875rem] text-muted-foreground/60 tabular-nums">{runs.length}</span>
      </div>
      <Accordion multiple value={openRuns} onValueChange={value => setOpenRuns(value as number[])}>
        {shown.map(run => <AccordionItem key={run.id} value={run.id} className="border-border/50">
          <AccordionTrigger className={cn(quietTrigger, "items-center gap-3 py-3")}>
            <span className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 sm:grid-cols-[8rem_minmax(0,1fr)_5rem_5rem]">
              <RunStatus status={run.status} />
              <RunDate run={run} className="text-right text-xs text-muted-foreground sm:text-left" />
              <span className="hidden text-right text-xs text-muted-foreground tabular-nums sm:block">{runDuration(run, now) ?? ""}</span>
              <span className="hidden text-right text-xs text-muted-foreground sm:block">{fileCount(run) ?? ""}</span>
            </span>
          </AccordionTrigger>
          <AccordionContent className="pt-1 pb-5 [&_p]:!mb-0">
            {openRuns.includes(run.id) && <RunContents run={run} loadDetails />}
          </AccordionContent>
        </AccordionItem>)}
      </Accordion>
      {runs.length > HISTORY_PREVIEW && (
        <Button variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={() => setShowAll(v => !v)}>
          {showAll ? "Show fewer" : `Show all ${runs.length} runs`}
        </Button>
      )}
    </div>
  );
}

/** A single workflow, with its latest result first and its audit history below. */
export function ClientWorkflowActivity({ workflowId, name, archived, runs, actions, assigned, awaitingFirstRun, executionMode, readiness, starting }: {
  workflowId: number; name: string; archived: boolean; runs: WorkflowRun[]; actions: React.ReactNode;
  assigned?: boolean; awaitingFirstRun?: boolean; executionMode?: "manual" | "auto"; readiness?: string;
  // A run was just requested here and hasn't been picked up yet.
  starting?: boolean;
}) {
  const latest = runs[0];
  const now = useNow(latest?.status === "running");
  const hasLatest = latest && !awaitingFirstRun;
  return <AccordionItem value={workflowId} className="min-w-0 border-border/70">
    <div className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-3 [&>h3]:min-w-0 [&>h3]:flex-1">
      <AccordionTrigger className={cn(quietTrigger, "min-w-0 items-center gap-4 py-0")}>
        <span className="flex min-w-0 flex-col gap-1.5">
          <span className="break-words text-sm font-medium leading-snug text-foreground">{name}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal text-muted-foreground">
            {hasLatest && <RunStatus status={latest.status} starting={starting && latest.status === "queued"} />}
            {hasLatest && latest.status === "running" && runDuration(latest, now) && <span className="tabular-nums">{runDuration(latest, now)}</span>}
            {!hasLatest && !archived && readiness && <span>{readiness.split(" · ")[0].replace(/\.$/, "")}</span>}
            {archived ? <span>Workflow deleted</span> : !(assigned ?? latest?.workflow_assignment_id != null) && <span>Not assigned</span>}
            {executionMode && <><span aria-hidden className="text-muted-foreground/40">·</span><span>{executionMode === "manual" ? "Manual" : "Automatic"}</span></>}
            <span aria-hidden className="text-muted-foreground/40">·</span>
            <span className="tabular-nums">{runs.length} run{runs.length === 1 ? "" : "s"}</span>
          </span>
        </span>
      </AccordionTrigger>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">{actions}</div>
    </div>
    <AccordionContent className="pb-0 [&_p]:!mb-0">
      {!hasLatest && readiness && <p className="pb-6 text-[0.8125rem] text-muted-foreground">{readiness}</p>}
      {hasLatest && <section aria-label="Latest run" className="flex min-w-0 flex-col gap-5 pt-1 pb-6">
        <span className={eyebrow}>Latest run</span>
        <RunFacts run={latest} starting={starting && latest.status === "queued"} now={now} />
        <RunContents run={latest} starting={starting} />
      </section>}
      {runs.length > 1 && <div className="pb-4"><RunHistory runs={runs.slice(1)} /></div>}
    </AccordionContent>
  </AccordionItem>;
}
