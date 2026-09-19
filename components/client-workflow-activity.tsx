"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check, Download, FileText, Loader2 } from "lucide-react";
import { getClientWorkflowRun, type WorkflowRun } from "@/lib/api";
import { cn } from "@/lib/utils";
import { AgentActivityDisclosure } from "@/components/agent-activity-disclosure";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";

const labels: Record<WorkflowRun["status"], string> = {
  queued: "Ready to run", running: "Running", completed: "Completed",
  needs_review: "Needs review", failed: "Failed",
};

function RunStatus({ status }: { status: WorkflowRun["status"] }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 text-xs font-medium",
      status === "failed" || status === "needs_review" ? "text-destructive" : "text-foreground/75")}>
      {status === "running" ? <Loader2 className="size-3 animate-spin" />
        : status === "completed" ? <Check className="size-3" />
        : <span className="size-1 rounded-full bg-current" />}
      {labels[status]}
    </span>
  );
}

function RunDate({ run }: { run: WorkflowRun }) {
  const timestamp = run.started_at ?? run.created_at;
  return <time dateTime={timestamp} title={new Date(timestamp).toLocaleString()} className="text-xs tabular-nums text-muted-foreground">
    {new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
    <span className="mx-1.5 text-muted-foreground/50">·</span>
    {new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
  </time>;
}

function RunContents({ run, loadDetails = false }: { run: WorkflowRun; loadDetails?: boolean }) {
  const { data, error, isLoading, mutate } = useSWR(
    loadDetails && run.details_loaded === false
      ? ["workflow-run", run.client_id, run.id, run.started_at, run.completed_at, run.status] : null,
    () => getClientWorkflowRun(run.client_id, run.id),
    { revalidateOnFocus: false },
  );
  const detail = run.details_loaded === false ? data : run;
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {run.summary && <p className="max-w-3xl text-pretty text-[0.8125rem] leading-relaxed text-muted-foreground">{run.summary}</p>}
      {run.review_reason && <p className="max-w-3xl border-l border-destructive/40 pl-3 text-[0.8125rem] leading-relaxed text-destructive">{run.review_reason}</p>}
      {run.status === "completed" && run.outputs.length > 0 && (
        <div className="flex max-w-2xl flex-col gap-2">
          {run.outputs.map(output => output.download_url && (
            <a key={output.id} href={output.download_url} target="_blank" rel="noreferrer" title={output.filename}
              className="group flex min-w-0 items-center gap-3 rounded-lg border border-border/70 px-3 py-3 text-[0.8125rem] !no-underline transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 break-all leading-snug text-foreground/90">{output.filename}</span>
              <Download className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
            </a>
          ))}
        </div>
      )}
      {isLoading && <span role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Loading run details…</span>}
      {error && <div className="flex items-center gap-2 text-xs text-destructive">Could not load run details.<Button variant="ghost" size="sm" onClick={() => void mutate()}>Retry</Button></div>}
      {(detail?.execution_plan || Boolean(detail?.tool_trajectory?.length)) && (
        <div className="flex flex-col gap-2 [&_p]:!mb-0">
          {detail?.execution_plan && <Accordion>
            <AccordionItem value="plan" className="border-none">
              <AccordionTrigger className="w-fit flex-none items-center gap-2 py-1 text-xs font-normal text-muted-foreground hover:text-foreground hover:no-underline">Plan &amp; checks</AccordionTrigger>
              <AccordionContent className="pt-3 pb-2">
                <div className="max-w-3xl space-y-3 border-l border-border pl-4 text-xs leading-relaxed text-muted-foreground">
                  <p>{detail.execution_plan.objective}</p>
                  <ol className="list-decimal space-y-2 pl-4">{detail.execution_plan.steps.map((step, i) => <li key={i}>{step}
                    {detail.step_results?.[String(i + 1)] && <p className="mt-1">{detail.step_results[String(i + 1)]}</p>}
                  </li>)}</ol>
                  {detail.verification && <div className="space-y-2">
                    <p className="font-medium text-foreground/80">{detail.verification.passed ? "Completion checks passed" : "Completion checks need attention"}</p>
                    {detail.verification.checks.map(check => <p key={check.criterion_id} className={check.passed ? undefined : "text-destructive"}>{check.evidence}</p>)}
                    {detail.verification.issues.map((issue, i) => <p key={i} className="text-destructive">{issue}</p>)}
                  </div>}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>}
          {detail?.tool_trajectory && detail.tool_trajectory.length > 0 && <div className="[&>div]:mt-0">
            <AgentActivityDisclosure trajectory={detail.tool_trajectory.map((step, i) => ({ ...step, round: step.round ?? i + 1 }))}
              defaultOpen={run.status === "running"} attemptStartedAt={run.started_at} running={run.status === "running"} />
          </div>}
        </div>
      )}
    </div>
  );
}

function RunHistory({ runs }: { runs: WorkflowRun[] }) {
  const [openRuns, setOpenRuns] = useState<number[]>([]);
  return <Accordion className="border-t border-border/60">
    <AccordionItem value="history" className="border-none">
      <AccordionTrigger className="items-center py-4 text-xs font-normal text-muted-foreground hover:text-foreground hover:no-underline">
        <span>Previous runs <span className="ml-2 tabular-nums text-muted-foreground/60">{runs.length}</span></span>
      </AccordionTrigger>
      <AccordionContent className="pb-1">
        <Accordion multiple value={openRuns} onValueChange={value => setOpenRuns(value as number[])}>
          {runs.map(run => <AccordionItem key={run.id} value={run.id} className="border-border/50">
            <AccordionTrigger className="items-center gap-3 py-3 font-normal hover:no-underline">
              <span className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-5">
                <span className="sm:w-28"><RunStatus status={run.status} /></span>
                <RunDate run={run} />
              </span>
              {run.outputs.length > 0 && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{run.outputs.length} file{run.outputs.length === 1 ? "" : "s"}</span>}
            </AccordionTrigger>
            <AccordionContent className="pt-1 pb-5 [&_p]:!mb-0">
              {openRuns.includes(run.id) && <RunContents run={run} loadDetails />}
            </AccordionContent>
          </AccordionItem>)}
        </Accordion>
      </AccordionContent>
    </AccordionItem>
  </Accordion>;
}

/** A single workflow, with its latest result first and its audit history folded away. */
export function ClientWorkflowActivity({ workflowId, name, archived, runs, actions, assigned, awaitingFirstRun, executionMode, readiness }: {
  workflowId: number; name: string; archived: boolean; runs: WorkflowRun[]; actions: React.ReactNode;
  assigned?: boolean; awaitingFirstRun?: boolean; executionMode?: "manual" | "auto"; readiness?: string;
}) {
  const latest = runs[0];
  return <AccordionItem value={workflowId} className="min-w-0 border-border/70">
    <div className="flex min-w-0 flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-3 [&>h3]:min-w-0 [&>h3]:flex-1">
      <AccordionTrigger className="min-w-0 items-center gap-4 py-0 hover:no-underline">
        <span className="flex min-w-0 flex-col gap-2">
          <span className="break-words text-sm font-medium leading-snug text-foreground">{name}</span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal text-muted-foreground">
            {latest && !awaitingFirstRun && <RunStatus status={latest.status} />}
            {archived ? <span>Workflow deleted</span> : !(assigned ?? latest?.workflow_assignment_id != null) && <span>Not assigned</span>}
            {executionMode && <span>{executionMode === "manual" ? "Manual" : "Automatic"}</span>}
            {(!latest || awaitingFirstRun) && !archived && readiness && <span>{readiness}</span>}
            <span>{runs.length} run{runs.length === 1 ? "" : "s"}</span>
          </span>
        </span>
      </AccordionTrigger>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">{actions}</div>
    </div>
    <AccordionContent className="pb-0 [&_p]:!mb-0">
      {(!latest || awaitingFirstRun) && readiness && <p className="pb-5 text-[0.8125rem] text-muted-foreground">{readiness}</p>}
      {latest && <div className="flex min-w-0 flex-col gap-4 pb-5 pt-2 sm:pb-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Latest run</span>
          <RunDate run={latest} />
        </div>
        <RunContents run={latest} />
      </div>}
      {runs.length > 1 && <RunHistory runs={runs.slice(1)} />}
    </AccordionContent>
  </AccordionItem>;
}
