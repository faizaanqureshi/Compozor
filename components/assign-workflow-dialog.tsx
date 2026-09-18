"use client";

import { cloneElement, isValidElement, useState, type ReactElement } from "react";
import { Workflow as WorkflowIcon } from "lucide-react";
import { ApiError, Workflow, assignWorkflowToClients, listWorkflows } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// The inverse of picking clients for one workflow: here the clients are
// already fixed (selected via checkboxes on the Clients page), and this
// picks which workflow to assign to all of them in one action.
export function AssignWorkflowDialog({
  clientIds,
  trigger,
  onAssigned,
}: {
  clientIds: number[];
  trigger: ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = async () => {
    setOpen(true);
    setError(null);
    setSelectedWorkflowId(null);
    try {
      setWorkflows(await listWorkflows());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  const onAssign = async () => {
    if (selectedWorkflowId == null) return;
    setSaving(true);
    setError(null);
    try {
      await assignWorkflowToClients(selectedWorkflowId, clientIds);
      setOpen(false);
      onAssigned();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {isValidElement(trigger) ? cloneElement(trigger, { onClick: openDialog }) : trigger}
      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign workflow</DialogTitle>
          <DialogDescription>
            Choose a workflow to run for {clientIds.length} selected client
            {clientIds.length === 1 ? "" : "s"} once their checklist is complete.
          </DialogDescription>
        </DialogHeader>

        {workflows === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : workflows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No workflows yet - create one first from the Workflows page.
          </p>
        ) : (
          <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {workflows.map((workflow) => (
              <label
                key={workflow.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-sm hover:bg-muted",
                  selectedWorkflowId === workflow.id && "bg-muted/60"
                )}
              >
                <input
                  type="radio"
                  name="assign-workflow"
                  className="mt-1 size-4 accent-primary"
                  checked={selectedWorkflowId === workflow.id}
                  onChange={() => setSelectedWorkflowId(workflow.id)}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="flex items-center gap-1.5">
                    <WorkflowIcon className="size-3.5 text-muted-foreground" />
                    {workflow.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {workflow.instructions}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button onClick={onAssign} disabled={saving || selectedWorkflowId == null}>
            {saving ? "Assigning…" : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  );
}
