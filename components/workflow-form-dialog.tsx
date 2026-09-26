"use client";

import { useId, useState } from "react";
import { Loader2, Plus, Sparkles } from "lucide-react";
import {
  ApiError,
  Workflow,
  WorkflowExecutionMode,
  WorkflowWorkSample,
  buildWorkflowInstructions,
  createWorkflow,
  updateWorkflow,
} from "@/lib/api";
import { Button, buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { WorkflowWorkSamples } from "@/components/workflow-work-samples";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
  trigger,
}: {
  workflow?: Workflow;
  trigger?: React.ReactElement<{ children?: React.ReactNode }>;
  onSaved: (workflow: Workflow) => void;
  /** Trigger button style for create mode, so callers can keep this from
   * competing with a page's own primary CTA (e.g. "outline" next to
   * "Add client"). Ignored in edit mode, which always renders as "ghost"
   * to match its card's other actions. */
  variant?: VariantProps<typeof buttonVariants>["variant"];
}) {
  const isEdit = workflow !== undefined;
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState(workflow?.name ?? "");
  const [instructions, setInstructions] = useState(workflow?.instructions ?? "");
  const [executionMode, setExecutionMode] = useState<WorkflowExecutionMode>(
    workflow?.execution_mode ?? "manual"
  );
  const [samples, setSamples] = useState<WorkflowWorkSample[]>(workflow?.work_samples ?? []);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);

  const openDialog = () => {
    setDescription("");
    setDraftWarnings([]);
    setSamples(workflow?.work_samples ?? []);
    setName(workflow?.name ?? "");
    setInstructions(workflow?.instructions ?? "");
    setExecutionMode(workflow?.execution_mode ?? "manual");
    setError(null);
    setOpen(true);
  };

  const onGenerate = async () => {
    if (!description.trim()) return;
    setBuilding(true);
    setDraftWarnings([]);
    setError(null);
    try {
      const result = await buildWorkflowInstructions(description, samples.map((sample) => sample.id));
      setName(result.suggested_name);
      setInstructions(result.instructions);
      setDraftWarnings(result.warnings ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return;
    setSubmitting(true);
    setError(null);
    try {
      const saved = isEdit
        ? await updateWorkflow(workflow.id, { name, instructions, execution_mode: executionMode, work_sample_ids: samples.map((sample) => sample.id) })
        : await createWorkflow({ name, instructions, execution_mode: executionMode, work_sample_ids: samples.map((sample) => sample.id) });
      setOpen(false);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && !building && !uploading && (o ? openDialog() : setOpen(false))}>
      <DialogTrigger
        render={trigger ?? (isEdit ? <Button variant="ghost" size="sm" /> : <Button variant={variant} />)}
      >
        {trigger ? trigger.props.children : isEdit ? (
          "Edit"
        ) : (
          <>
            <Plus />
            New workflow
          </>
        )}
      </DialogTrigger>
      <DialogContent className="flex w-[calc(100vw_-_2rem)] max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:w-full sm:max-w-2xl [&>[data-slot=dialog-close]]:right-4 [&>[data-slot=dialog-close]]:top-4">
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="shrink-0 gap-2 px-5 pt-6 pb-5 pr-14 sm:px-7 sm:pr-14">
            <DialogTitle>{isEdit ? "Edit workflow" : "New workflow"}</DialogTitle>
            <DialogDescription className="text-pretty text-[0.8125rem] leading-relaxed">
              {isEdit ? "Refine the instructions and choose when this workflow runs." : "Set the instructions for work your firm can repeat across clients."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-5 pb-6 sm:px-7">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${fieldId}-name`} className="text-xs font-medium">Workflow name</Label>
              <Input
                id={`${fieldId}-name`}
                required
                placeholder="e.g. Client document review"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={building || submitting || uploading}
                className="h-10 px-3 md:text-[0.8125rem]"
              />
            </div>

            <Accordion defaultValue={isEdit ? [] : ["draft"]}>
              <AccordionItem value="draft" className="rounded-lg border border-border/70 px-3.5">
                <AccordionTrigger className="items-center gap-3 py-3 text-xs font-normal text-muted-foreground hover:text-foreground hover:no-underline">
                  <span className="flex items-center gap-2"><Sparkles className="size-3.5" />Draft instructions with AI</span>
                </AccordionTrigger>
                <AccordionContent className="pb-3.5">
                  <div className="flex flex-col gap-3">
                    <Label htmlFor={`${fieldId}-description`} className="text-xs font-normal text-muted-foreground">Describe the outcome you want.</Label>
                    <Textarea
                      id={`${fieldId}-description`}
                      rows={3}
                      placeholder="e.g. Review the submitted documents and prepare a report of key findings and missing information."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      disabled={building || submitting || uploading}
                      className="resize-none px-3 leading-relaxed md:text-[0.8125rem]"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="!mb-0 text-xs text-muted-foreground">{samples.length ? "Uses attached samples to guide the draft." : "Attach work samples below to guide the draft."}</p>
                      <Button type="button" variant="outline" size="sm" onClick={onGenerate} disabled={building || submitting || uploading || !description.trim()}>
                        {building && <Loader2 className="animate-spin" />}
                        {building ? (samples.length ? "Reading samples & drafting…" : "Drafting…") : "Generate draft"}
                      </Button>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`${fieldId}-instructions`} className="text-xs font-medium">Instructions</Label>
              <p id={`${fieldId}-instructions-hint`} className="text-xs leading-relaxed text-muted-foreground">Describe the work, the sources to use, and the expected output.</p>
              <Textarea
                id={`${fieldId}-instructions`}
                aria-describedby={`${fieldId}-instructions-hint`}
                required
                rows={10}
                placeholder="Write your instructions here, or use AI to prepare a first draft."
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                disabled={building || submitting || uploading}
                className="min-h-48 resize-y px-3.5 py-3 leading-relaxed md:text-[0.8125rem]"
              />
            </div>

            <WorkflowWorkSamples value={samples} onChange={setSamples} disabled={submitting || building} onBusyChange={setUploading} />

            <div className="flex flex-col gap-3 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${fieldId}-mode`} className="text-xs font-medium">Execution</Label>
                <p id={`${fieldId}-mode-hint`} className="text-xs leading-relaxed text-muted-foreground">
                  {executionMode === "auto" ? "Starts when the client’s checklist is complete." : "Your team chooses when to start the run."}
                </p>
              </div>
              <NativeSelect
                id={`${fieldId}-mode`}
                aria-describedby={`${fieldId}-mode-hint`}
                value={executionMode}
                onChange={(e) => setExecutionMode(e.target.value as WorkflowExecutionMode)}
                disabled={building || submitting || uploading}
                className="shrink-0 sm:w-40"
              >
                <option value="manual">Manual</option>
                <option value="auto">Automatic</option>
              </NativeSelect>
            </div>
            {draftWarnings.length > 0 && <div role="status" className="space-y-2 text-xs leading-relaxed text-muted-foreground">
              {draftWarnings.map((warning, index) => <p key={index}>{warning}</p>)}
            </div>}
            {error && <p role="alert" className="text-[0.8125rem] text-destructive">{error}</p>}
          </div>

          <DialogFooter className="m-0 shrink-0 flex-row justify-end gap-2 bg-transparent px-5 py-4 sm:px-7">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={submitting || building || uploading}>Cancel</Button>
            <Button type="submit" size="sm" disabled={submitting || building || uploading}>
              {submitting && <Loader2 className="animate-spin" />}
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Create workflow"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
