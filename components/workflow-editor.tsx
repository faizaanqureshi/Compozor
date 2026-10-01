"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { ArrowLeft, Check, Circle, Loader2, Sparkles, Undo2 } from "lucide-react";

import {
  ApiError,
  buildWorkflowInstructions,
  createWorkflow,
  getMyOrganization,
  updateWorkflow,
  type Workflow,
  type WorkflowExecutionMode,
  type WorkflowWorkSample,
} from "@/lib/api";
import { organizationKey, workflowsKey } from "@/lib/swr-keys";
import { cn } from "@/lib/utils";
import { countWords, instructionTips, sampleFormat, startersFor } from "@/lib/workflow-editor";
import { WorkflowWorkSamples } from "@/components/workflow-work-samples";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const RUN_MODES: { value: WorkflowExecutionMode; title: string; body: string }[] = [
  { value: "manual", title: "On demand", body: "Your team starts each run from the client's page, when the work is due." },
  { value: "auto", title: "Automatically", body: "Starts as soon as a client's document checklist is complete." },
];

function Step({ number, title, description, optional, action, children }: {
  number: number;
  title: string;
  description: string;
  optional?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`step-${number}`} className="flex min-w-0 flex-col gap-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-[0.6875rem] tracking-widest text-muted-foreground uppercase tabular-nums">
            {String(number).padStart(2, "0")}{optional && " · Optional"}
          </p>
          <h2 id={`step-${number}`} className="text-base font-medium tracking-tight">{title}</h2>
          <p className="max-w-xl text-sm text-pretty text-muted-foreground">{description}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Readiness({ done, label, note }: { done: boolean; label: string; note?: string }) {
  return (
    <li className="flex items-start gap-2.5">
      {done ? <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />}
      <span className="flex flex-col gap-0.5">
        <span className={cn("text-sm", !done && "text-muted-foreground")}>{label}</span>
        {note && <span className="text-xs leading-relaxed text-muted-foreground">{note}</span>}
      </span>
    </li>
  );
}

// Full-page create/edit for a workflow, in the order the work is set up:
// the outcome, examples of finished work, the instructions (drafted from
// both), and when it runs. A summary rail tracks what's ready.
export function WorkflowEditor({ workflow, returnTo = "/workflows" }: { workflow?: Workflow; returnTo?: string }) {
  const isEdit = workflow !== undefined;
  const fieldId = useId();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { data: org } = useSWR(organizationKey(), getMyOrganization);

  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState(workflow?.instructions ?? "");
  const [previousInstructions, setPreviousInstructions] = useState<string | null>(null);
  const [executionMode, setExecutionMode] = useState<WorkflowExecutionMode>(workflow?.execution_mode ?? "manual");
  const [samples, setSamples] = useState<WorkflowWorkSample[]>(workflow?.work_samples ?? []);
  const [draftWarnings, setDraftWarnings] = useState<string[]>([]);
  const [building, setBuilding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = building || uploading || submitting;

  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty || submitting) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, submitting]);

  const starters = startersFor(org?.practice_type);
  const tips = useMemo(() => instructionTips(instructions), [instructions]);
  const words = countWords(instructions);
  const templates = samples.filter((s) => s.template_status);
  const pendingTemplates = templates.filter((s) => s.template_status !== "approved").length;
  const formats = [...new Set(samples.map((s) => sampleFormat(s.filename).label))];
  const ready = !!name.trim() && !!instructions.trim();

  // Template status updates arrive through the same list; only adding or
  // removing a sample is an unsaved change.
  const onSamplesChange = (next: WorkflowWorkSample[]) => {
    const ids = (list: WorkflowWorkSample[]) => list.map((s) => s.id).join(",");
    if (ids(next) !== ids(samples)) setDirty(true);
    setSamples(next);
  };

  const onDraft = async () => {
    if (!description.trim() && !name.trim()) return;
    setBuilding(true);
    setDraftWarnings([]);
    setError(null);
    try {
      const outcome = description.trim() || name.trim();
      const result = await buildWorkflowInstructions(outcome, samples.map((s) => s.id));
      setPreviousInstructions(instructions.trim() ? instructions : null);
      setInstructions(result.instructions);
      if (!name.trim()) setName(result.suggested_name);
      setDraftWarnings(result.warnings ?? []);
      setDirty(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBuilding(false);
    }
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !ready) return;
    setSubmitting(true);
    setError(null);
    const input = { name: name.trim(), instructions, execution_mode: executionMode, work_sample_ids: samples.map((s) => s.id) };
    try {
      if (isEdit) await updateWorkflow(workflow.id, input);
      else await createWorkflow(input);
      await mutate(workflowsKey());
      setDirty(false);
      router.push(returnTo);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setSubmitting(false);
    }
  };

  const saveLabel = submitting ? "Saving…" : isEdit ? "Save changes" : "Create workflow";

  return (
    <div className="mx-auto flex w-full max-w-[96rem] min-w-0 flex-col gap-8 pb-24 lg:pb-0">
      <header className="flex flex-col gap-3">
        <Link href={returnTo} className="inline-flex w-fit items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          {returnTo === "/workflows" ? "Workflows" : "Back"}
        </Link>
        <h1 className="text-4xl leading-tight font-light tracking-tight text-balance [font-family:var(--font-display)] md:text-5xl">
          {isEdit ? workflow.name : "New workflow"}
        </h1>
        <p className="max-w-2xl text-sm text-pretty text-muted-foreground">
          Describe the work once. Compozor runs it for every client it&apos;s assigned to, using their documents for the facts and your examples for the format.
        </p>
      </header>

      <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <Step number={1} title="Outcome" description="Name the work and say, in a sentence or two, what it should produce.">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-name`}>Name</Label>
              <Input
                id={`${fieldId}-name`}
                required
                placeholder={`e.g. ${starters[0].name}`}
                value={name}
                onChange={(e) => touch(setName)(e.target.value)}
                disabled={busy}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${fieldId}-outcome`}>
                What should it produce? <span className="font-normal text-muted-foreground">Used to draft the instructions</span>
              </Label>
              <Textarea
                id={`${fieldId}-outcome`}
                rows={3}
                placeholder={starters[0].description}
                value={description}
                onChange={(e) => touch(setDescription)(e.target.value)}
                disabled={busy}
                className="resize-y leading-relaxed"
              />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">Start from an example</p>
              <div className="flex flex-wrap gap-2">
                {starters.map((starter) => (
                  <button
                    key={starter.name}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setDescription(starter.description);
                      if (!name.trim()) setName(starter.name);
                      setDirty(true);
                    }}
                    className="rounded-4xl border border-border px-3 py-1.5 text-xs text-foreground/85 transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {starter.name}
                  </button>
                ))}
              </div>
            </div>
          </Step>

          <Step
            number={2}
            optional
            title="Work samples"
            description="Examples of finished work. The agent copies their layout and style; your clients' documents supply the facts. Add them before drafting instructions."
          >
            <WorkflowWorkSamples value={samples} onChange={onSamplesChange} disabled={submitting || building} onBusyChange={setUploading} />
          </Step>

          <Step
            number={3}
            title="Instructions"
            description="What the agent follows on every run: what to produce, from which documents, and how to handle exceptions."
            action={
              <Button type="button" variant="outline" size="sm" onClick={onDraft} disabled={busy || (!description.trim() && !name.trim())}>
                {building ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {building ? (samples.length ? "Reading samples…" : "Drafting…") : instructions.trim() ? "Redraft with AI" : "Draft with AI"}
              </Button>
            }
          >
            {!description.trim() && !name.trim() && !instructions.trim() && (
              <p className="text-xs text-muted-foreground">Describe the outcome in step 1 to draft these with AI, or write them yourself.</p>
            )}
            <Textarea
              id={`${fieldId}-instructions`}
              aria-label="Instructions"
              required
              rows={14}
              placeholder="Write the instructions here, or draft them with AI."
              value={instructions}
              onChange={(e) => touch(setInstructions)(e.target.value)}
              disabled={busy}
              className="min-h-64 resize-y px-4 py-3.5 leading-relaxed"
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="tabular-nums">{words} word{words === 1 ? "" : "s"}</span>
              {previousInstructions !== null && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 hover:text-foreground"
                  onClick={() => {
                    setInstructions(previousInstructions);
                    setPreviousInstructions(null);
                  }}
                >
                  <Undo2 className="size-3.5" />
                  Restore previous instructions
                </button>
              )}
            </div>
            {draftWarnings.length > 0 && (
              <div role="status" className="flex flex-col gap-1.5 text-xs leading-relaxed text-warning-foreground">
                {draftWarnings.map((warning) => <p key={warning}>{warning}</p>)}
              </div>
            )}
            <div className="grid gap-x-6 gap-y-3 border-t border-border/60 pt-4 sm:grid-cols-2">
              {tips.map((tip) => (
                <div key={tip.id} className="flex items-start gap-2.5">
                  {tip.met ? <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> : <Circle className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />}
                  <span className="flex flex-col gap-0.5">
                    <span className={cn("text-xs", !tip.met && "text-muted-foreground")}>{tip.label}</span>
                    {!tip.met && <span className="text-xs leading-relaxed text-muted-foreground">{tip.hint}</span>}
                  </span>
                </div>
              ))}
            </div>
          </Step>

          <Step number={4} title="When it runs" description="You can change this later. Either way, runs only use documents already on file.">
            <div role="radiogroup" aria-label="When it runs" className="grid gap-3 sm:grid-cols-2">
              {RUN_MODES.map((mode) => {
                const selected = executionMode === mode.value;
                return (
                  <label
                    key={mode.value}
                    className={cn(
                      "flex cursor-pointer flex-col gap-1.5 rounded-xl p-4 ring-1 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                      selected ? "bg-muted/50 ring-foreground/40" : "ring-foreground/10 hover:bg-muted/30"
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type="radio"
                        name={`${fieldId}-mode`}
                        value={mode.value}
                        checked={selected}
                        onChange={() => touch(setExecutionMode)(mode.value)}
                        disabled={busy}
                        className="size-3.5 accent-foreground"
                      />
                      <span className="text-sm font-medium">{mode.title}</span>
                    </span>
                    <span className="pl-6 text-xs leading-relaxed text-muted-foreground">{mode.body}</span>
                  </label>
                );
              })}
            </div>
          </Step>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>

        <aside className="hidden flex-col gap-5 rounded-xl bg-card p-6 ring-1 ring-foreground/10 lg:sticky lg:top-6 lg:flex">
          <div className="flex flex-col gap-1">
            <p className="text-[0.6875rem] tracking-widest text-muted-foreground uppercase">Summary</p>
            <p className="text-sm font-medium break-words">{name.trim() || "Untitled workflow"}</p>
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Runs</dt>
            <dd>{executionMode === "auto" ? "Automatically" : "On demand"}</dd>
            <dt className="text-muted-foreground">Samples</dt>
            <dd>{samples.length ? `${samples.length} · ${formats.join(", ")}` : "None"}</dd>
            <dt className="text-muted-foreground">Templates</dt>
            <dd>{templates.length ? `${templates.length - pendingTemplates} of ${templates.length} approved` : "None"}</dd>
          </dl>
          <ul className="flex flex-col gap-3 border-t border-border/60 pt-4">
            <Readiness done={!!name.trim()} label="Named" />
            <Readiness done={!!instructions.trim()} label="Instructions written" note={instructions.trim() ? `${tips.filter((t) => t.met).length} of ${tips.length} tips covered` : undefined} />
            <Readiness done={samples.length > 0} label="Work samples" note={samples.length ? undefined : "Optional, but they make output match your firm's format."} />
            {pendingTemplates > 0 && (
              <Readiness done={false} label="Templates to review" note="Runs use those samples as plain examples until their templates are approved." />
            )}
          </ul>
          <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
            <Button type="submit" disabled={busy || !ready}>
              {submitting && <Loader2 className="animate-spin" />}
              {saveLabel}
            </Button>
            <Button type="button" variant="ghost" disabled={submitting} onClick={() => router.push(returnTo)}>
              Cancel
            </Button>
          </div>
        </aside>

        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center justify-between gap-3 border-t border-border bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur lg:hidden">
          <p className="min-w-0 truncate text-xs text-muted-foreground">
            {ready ? (pendingTemplates ? `${pendingTemplates} template${pendingTemplates === 1 ? "" : "s"} to review` : "Ready to save") : "Add a name and instructions"}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="ghost" size="sm" disabled={submitting} onClick={() => router.push(returnTo)}>Cancel</Button>
            <Button type="submit" size="sm" disabled={busy || !ready}>
              {submitting && <Loader2 className="animate-spin" />}
              {saveLabel}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
