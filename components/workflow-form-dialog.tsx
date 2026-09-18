"use client";

import { useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import {
  ApiError,
  Workflow,
  WorkflowExecutionMode,
  buildWorkflowInstructions,
  createWorkflow,
  updateWorkflow,
} from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Shared between the Workflows library page (create/edit) and the Clients
// page (create, so a new workflow can be defined right where you're about
// to assign it to a batch of clients) - one dialog, two entry points.
export function WorkflowFormDialog({
  workflow,
  onSaved,
  variant = "default",
}: {
  workflow?: Workflow;
  onSaved: (workflow: Workflow) => void;
  /** Trigger button style for create mode, so callers can keep this from
   * competing with a page's own primary CTA (e.g. "outline" next to
   * "Add client"). Ignored in edit mode, which always renders as "ghost"
   * to match its card's other actions. */
  variant?: VariantProps<typeof buttonVariants>["variant"];
}) {
  const isEdit = workflow !== undefined;
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState(workflow?.name ?? "");
  const [instructions, setInstructions] = useState(workflow?.instructions ?? "");
  const [executionMode, setExecutionMode] = useState<WorkflowExecutionMode>(
    workflow?.execution_mode ?? "manual"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = () => {
    setDescription("");
    setName(workflow?.name ?? "");
    setInstructions(workflow?.instructions ?? "");
    setExecutionMode(workflow?.execution_mode ?? "manual");
    setError(null);
    setOpen(true);
  };

  const onGenerate = async () => {
    if (!description.trim()) return;
    setBuilding(true);
    setError(null);
    try {
      const result = await buildWorkflowInstructions(description);
      setName(result.suggested_name);
      setInstructions(result.instructions);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const saved = isEdit
        ? await updateWorkflow(workflow.id, { name, instructions, execution_mode: executionMode })
        : await createWorkflow({ name, instructions, execution_mode: executionMode });
      setOpen(false);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && (o ? openDialog() : setOpen(false))}>
      <DialogTrigger
        render={isEdit ? <Button variant="ghost" size="sm" /> : <Button variant={variant} />}
      >
        {isEdit ? (
          "Edit"
        ) : (
          <>
            <Plus />
            New workflow
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? `Edit ${workflow.name}` : "New workflow"}</DialogTitle>
            <DialogDescription>
              Describe the work in plain language - what to look at, and what
              it should produce. An assistant turns it into instructions you
              can refine below.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="workflow-description">Describe what this workflow should do</Label>
              <div className="flex gap-2">
                <Textarea
                  id="workflow-description"
                  rows={2}
                  placeholder="e.g. Compile every transaction from their bank and credit card statements into a CSV, one row per transaction."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={onGenerate}
                disabled={building || !description.trim()}
              >
                {building ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {building ? "Generating…" : "Generate instructions"}
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="workflow-name">Name</Label>
              <Input
                id="workflow-name"
                required
                placeholder="Transaction CSV export"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="workflow-instructions">Instructions for the agent</Label>
              <Textarea
                id="workflow-instructions"
                required
                rows={8}
                placeholder="Generated instructions will appear here - edit freely before saving."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="workflow-mode">When should it run?</Label>
              <select
                id="workflow-mode"
                value={executionMode}
                onChange={(e) => setExecutionMode(e.target.value as WorkflowExecutionMode)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="manual">Manual - a bookkeeper clicks &quot;run&quot;</option>
                <option value="auto">Automatic - runs the moment a client&apos;s checklist is complete</option>
              </select>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Create workflow"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
