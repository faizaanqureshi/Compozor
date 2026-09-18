"use client";

import { useEffect, useState } from "react";
import { Workflow as WorkflowIcon } from "lucide-react";
import { ApiError, Workflow, WorkflowExecutionMode, archiveWorkflow, listWorkflows } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { WorkflowFormDialog } from "@/components/workflow-form-dialog";

const executionModeLabels: Record<WorkflowExecutionMode, string> = {
  auto: "Runs automatically",
  manual: "Runs on demand",
};

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    listWorkflows()
      .then(setWorkflows)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(refresh, []);

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-thin tracking-tight [font-family:var(--font-denton)] sm:text-5xl md:text-6xl">
            Workflows
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Work you define once and run automatically once a client&apos;s
            documents are all in - a transaction CSV, a reconciliation
            check, anything you can describe. Assign a workflow to clients
            from the Clients page.
          </p>
        </div>
        <WorkflowFormDialog onSaved={refresh} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {workflows === null ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-card p-12 text-center ring-1 ring-foreground/10">
          <WorkflowIcon className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No workflows yet. Create one, then assign it to clients from the
            Clients page.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 animate-blur-in-sm md:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow) => (
            <WorkflowCard key={workflow.id} workflow={workflow} onChange={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkflowCard({
  workflow,
  onChange,
}: {
  workflow: Workflow;
  onChange: () => void;
}) {
  const [archiving, setArchiving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onArchive = async () => {
    setArchiving(true);
    setError(null);
    try {
      await archiveWorkflow(workflow.id);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setArchiving(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">{workflow.name}</h2>
        <Badge variant={workflow.execution_mode === "auto" ? "default" : "secondary"}>
          {executionModeLabels[workflow.execution_mode]}
        </Badge>
      </div>
      <p className="line-clamp-4 text-sm text-muted-foreground">{workflow.instructions}</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="mt-auto flex items-center gap-1.5 pt-2">
        <WorkflowFormDialog workflow={workflow} onSaved={onChange} />
        <Dialog open={confirming} onOpenChange={(open) => !archiving && setConfirming(open)}>
          <DialogTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" />}>
            Archive
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Archive {workflow.name}?</DialogTitle>
              <DialogDescription>
                It won&apos;t run for any client going forward and disappears
                from this list, but past runs stay in each client&apos;s
                history.
              </DialogDescription>
            </DialogHeader>
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
      </div>
    </section>
  );
}
