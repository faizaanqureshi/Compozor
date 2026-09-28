"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, Eye, FileText, Loader2, PencilLine, RotateCcw, Sparkles, Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Panel } from "@/components/panel";
import {
  QuestionnaireBuilder, QuestionnairePreview, type BuilderDraft, type BuilderHandle, type ReviewLayer,
} from "@/components/questionnaire-builder";
import {
  ApiError,
  actOnImportTransformation,
  createQuestionnaireFromImport,
  discardQuestionnaireImport,
  getQuestionnaireImport,
  updateQuestionnaireImport,
  type DocumentGenerationRule,
  type ImportReviewItem,
  type ImportReviewStatus,
  type ImportTransformation,
  type QuestionnaireImport,
} from "@/lib/api";
import type { QuestionnaireDefinition } from "@/lib/questionnaire-logic";
import {
  annotations,
  appliedImprovements,
  creationBlockers,
  documentSuggestions,
  editorialSuggestions,
  initialEdits,
  isBlocking,
  isDecision,
  isLimitation,
  isNote,
  isOpen,
  isRequirednessDecision,
  itemsForQuestion,
  itemTargets,
  requestableQuestions,
  reviewCounts,
  ruleForProposal,
  topLevelQuestionId,
  triggerChoices,
  type ProposalEdits,
} from "@/lib/questionnaire-import-model";

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
    <Button className="self-start" variant="ghost" size="sm" nativeButton={false} render={<Link href="/questionnaires" />}><ArrowLeft /> Questionnaires</Button>
    {children}
  </div>;
}

export function QuestionnaireImportPage({ id }: { id: number }) {
  const { data, error, mutate } = useSWR(Number.isFinite(id) ? ["questionnaire-import", id] : null, () => getQuestionnaireImport(id), { revalidateOnFocus: false });
  const processing = data?.status === "processing";
  useEffect(() => {
    if (!processing) return;
    const timer = setInterval(() => void mutate(), 2000);
    return () => clearInterval(timer);
  }, [processing, mutate]);
  if (error) return <Shell><p className="text-sm text-destructive">{errorText(error)}</p></Shell>;
  if (!data) return <Shell><p className="text-sm text-muted-foreground">Loading import…</p></Shell>;
  if (data.status === "processing") return <Shell><Progress job={data} /></Shell>;
  if (data.status === "failed" || data.status === "rejected_completed") {
    return <Shell><Panel title={data.status === "failed" ? "The import didn’t finish" : "This looks like a completed questionnaire"}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{data.error_message} No questionnaire was created.</p>
        <Button className="self-start" nativeButton={false} render={<Link href="/questionnaires/import" />}>Try another file</Button>
      </div>
    </Panel></Shell>;
  }
  if (data.status === "created") {
    return <Shell><Panel title="Questionnaire created">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">This import already created an editable draft. It hasn’t been published or assigned.</p>
        {data.created_template_id && <Button className="self-start" nativeButton={false} render={<Link href={`/questionnaires/${data.created_template_id}`} />}>Open the draft</Button>}
      </div>
    </Panel></Shell>;
  }
  return <Shell><ImportWorkspace key={data.id} initialJob={data} onChanged={() => void mutate()} /></Shell>;
}

const STAGES = [
  { key: "interpreting", label: "Reading the questionnaire" },
  { key: "verifying", label: "Checking the result against the original" },
  { key: "optimizing", label: "Improving it for digital completion" },
] as const;

function Progress({ job }: { job: QuestionnaireImport }) {
  const current = STAGES.findIndex((s) => s.key === job.stage);
  return <Panel title="Importing your questionnaire" meta={job.source_name}>
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        <li className="flex items-center gap-3 text-sm"><Check className="size-4 text-accent" aria-hidden />File checked and text extracted</li>
        {STAGES.map((stage, i) => {
          const done = current > i, active = current === i || (current < 0 && i === 0);
          return <li key={stage.key} className="flex items-center gap-3 text-sm">
            {done ? <Check className="size-4 text-accent" aria-hidden /> : active ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden /> : <span className="size-4 rounded-full ring-1 ring-border" aria-hidden />}
            <span className={done || active ? "" : "text-muted-foreground"}>{stage.label}</span>
            <span className="sr-only">{done ? "done" : active ? "in progress" : "waiting"}</span>
          </li>;
        })}
      </ol>
      <p className="text-xs text-muted-foreground">This usually takes two to four minutes. You can leave this page and come back from the Questionnaires library.</p>
    </div>
  </Panel>;
}

// ---- Small building blocks ---------------------------------------------------------------------

function Stat({ label, value, tone, onClick }: { label: string; value: number; tone?: "attention"; onClick?: () => void }) {
  const body = <><span className={`text-2xl font-light tabular-nums ${tone === "attention" && value ? "text-destructive" : ""}`}>{value}</span><span className="text-xs text-muted-foreground">{label}</span></>;
  return onClick ? <button type="button" onClick={onClick} className="flex flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/50">{body}</button>
    : <div className="flex flex-col items-start gap-0.5 px-3 py-2">{body}</div>;
}

function Group({ id, title, hint, children }: { id?: string; title: string; hint?: string; children: React.ReactNode }) {
  return <section id={id} className="flex scroll-mt-6 flex-col gap-2">
    <div><h3 className="text-sm font-medium">{title}</h3>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
    <div className="flex flex-col divide-y divide-border/60 rounded-xl bg-card ring-1 ring-foreground/10">{children}</div>
  </section>;
}

function SourceLink({ item, onSource }: { item: ImportReviewItem; onSource: (unitId: string) => void }) {
  if (!item.source?.label && !item.source?.quote) return null;
  return <p className="text-xs text-muted-foreground">
    {item.source.label ?? "Original"}{item.source.quote && <> — <q className="italic">{item.source.quote}</q></>}
    {item.source.unit_ids[0] && <> · <button className="underline underline-offset-2" onClick={() => onSource(item.source!.unit_ids[0])}>View original</button></>}
  </p>;
}

function ChangeList({ lines }: { lines: string[] }) {
  return <ul className="flex flex-col gap-1 rounded-lg bg-muted/30 px-3 py-2 text-xs">{lines.map((line, i) => <li key={i} className="flex gap-2"><ChevronRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden />{line}</li>)}</ul>;
}

// ---- Blocking issues ------------------------------------------------------------------------------

function AttentionRow({ item, definition, actions }: { item: ImportReviewItem; definition: QuestionnaireDefinition; actions: WorkspaceActions }) {
  const [edits, setEdits] = useState<ProposalEdits | null>(() => (item.proposal ? initialEdits(item.proposal, definition) : null));
  const questions = requestableQuestions(definition);
  const choices = triggerChoices(questions.find((q) => q.id === edits?.questionId));
  const hasQuestion = itemTargets(item).some((t) => t.question_id);
  return <div className="flex flex-col gap-2 p-4">
    <div className="flex items-start gap-2">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-medium">{item.proposal ? `When should the client be asked for “${item.title}”?` : item.title}</p>
        <p className="text-sm text-muted-foreground">{item.reason}</p>
        <SourceLink item={item} onSource={actions.showSource} />
      </div>
    </div>
    {edits ? <div className="flex flex-col gap-2 pl-6">
      <div className="grid gap-2 sm:grid-cols-2">
        <NativeSelect aria-label="Question" value={edits.questionId ?? ""} onChange={(e) => setEdits({ ...edits, questionId: e.target.value || null, trigger: triggerChoices(questions.find((q) => q.id === e.target.value)).length ? 0 : -1 })}>
          <option value="">Choose the question…</option>
          {questions.map((q) => <option key={q.id} value={q.id}>{q.label || "Untitled question"}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Answer" value={String(edits.trigger)} disabled={!choices.length} onChange={(e) => setEdits({ ...edits, trigger: Number(e.target.value) })}>
          {!choices.length && <option value="-1">…then the answer</option>}
          {choices.map((c, i) => <option key={i} value={i}>{c.label}</option>)}
        </NativeSelect>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" disabled={!edits.questionId || edits.trigger < 0} onClick={() => actions.acceptProposal(item, edits)}><Check /> Request it then</Button>
        <Button size="sm" variant="ghost" onClick={() => actions.decide(item, "rejected")}>Don’t request it</Button>
      </div>
    </div> : <div className="flex flex-wrap gap-1.5 pl-6">
      {hasQuestion && <Button size="sm" variant="outline" onClick={() => actions.openQuestion(item)}><PencilLine /> Fix in the questionnaire</Button>}
      <Button size="sm" variant="ghost" onClick={() => actions.decide(item, "resolved")}><Check /> {item.kind === "completeness" ? "I’ve checked this" : "It’s correct as imported"}</Button>
    </div>}
  </div>;
}

// ---- Improvements and suggestions ----------------------------------------------------------------

function ImprovementRow({ t, actions }: { t: ImportTransformation; actions: WorkspaceActions }) {
  const [open, setOpen] = useState(false);
  const undone = t.status === "undone";
  return <div className="flex flex-col gap-2 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-2">
        <Wand2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0"><p className={`text-sm font-medium ${undone ? "text-muted-foreground line-through" : ""}`}>{t.title}</p><p className="text-xs text-muted-foreground">{t.benefit}</p></div>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <ChevronDown /> : <ChevronRight />} View changes</Button>
        {undone ? <Button size="sm" variant="outline" onClick={() => actions.act(t, "apply")}>Re-apply</Button>
          : <Button size="sm" variant="outline" onClick={() => actions.act(t, "undo")}><RotateCcw /> Undo</Button>}
      </div>
    </div>
    {open && <div className="flex flex-col gap-2 pl-6">
      {t.reason && <p className="text-xs text-muted-foreground">Why: {t.reason}{t.evidence && <> — <q className="italic">{t.evidence}</q></>}</p>}
      {t.changes?.length ? <ChangeList lines={t.changes} /> : null}
    </div>}
  </div>;
}

function SuggestionRow({ t, actions }: { t: ImportTransformation; actions: WorkspaceActions }) {
  const [open, setOpen] = useState(false);
  const decided = t.status !== "pending";
  return <div className="flex flex-col gap-2 p-4">
    <div className="flex items-start gap-2">
      <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-medium">{t.title}{decided && <span className="ml-2 text-xs font-normal text-muted-foreground">{t.status === "applied" ? "Applied" : t.status === "skipped" ? "Skipped" : "Undone"}</span>}</p>
        <p className="text-sm text-muted-foreground">{t.benefit}</p>
        <button className="self-start text-xs underline underline-offset-2" onClick={() => setOpen(!open)}>{open ? "Hide preview" : "Preview the change"}</button>
        {open && t.changes?.length ? <ChangeList lines={t.changes} /> : null}
      </div>
    </div>
    <div className="flex flex-wrap gap-1.5 pl-6">
      {t.status === "pending" && <>
        <Button size="sm" onClick={() => actions.act(t, "apply")}><Check /> Apply</Button>
        <Button size="sm" variant="outline" onClick={() => actions.act(t, "apply", { openAfter: true })}><PencilLine /> Apply and edit</Button>
        <Button size="sm" variant="ghost" onClick={() => actions.act(t, "skip")}>Skip</Button>
      </>}
      {t.status === "applied" && <Button size="sm" variant="ghost" onClick={() => actions.act(t, "undo")}><RotateCcw /> Undo</Button>}
      {(t.status === "skipped" || t.status === "undone") && <Button size="sm" variant="ghost" onClick={() => actions.act(t, t.status === "skipped" ? "restore" : "apply")}>{t.status === "skipped" ? "Reconsider" : "Re-apply"}</Button>}
    </div>
  </div>;
}

function DocumentSuggestionRow({ t, actions }: { t: ImportTransformation; actions: WorkspaceActions }) {
  const document = t.operations[0]?.document;
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(document?.title ?? t.title);
  const [instructions, setInstructions] = useState(document?.instructions ?? "");
  const trigger = t.changes?.[0]?.replace(/^Request “[^”]*” when /, "") ?? "";
  return <div className="flex flex-col gap-2 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-2">
        <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}{t.status !== "pending" && <span className="ml-2 text-xs font-normal text-muted-foreground">{t.status === "applied" ? "Added" : "Not requested"}</span>}</p>
          <p className="text-xs text-muted-foreground">{trigger && <>Requested when {trigger}. </>}{t.benefit}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-1">
        {t.status === "pending" && <>
          <Button size="sm" onClick={() => actions.act(t, "apply", editing ? { edits: { title, instructions: instructions || null } } : {})}><Check /> Add</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(!editing)}><PencilLine /> Edit</Button>
          <Button size="sm" variant="ghost" onClick={() => actions.act(t, "skip")}>Skip</Button>
        </>}
        {t.status === "applied" && <Button size="sm" variant="ghost" onClick={() => actions.act(t, "undo")}><RotateCcw /> Undo</Button>}
        {(t.status === "skipped" || t.status === "undone") && <Button size="sm" variant="ghost" onClick={() => actions.act(t, t.status === "skipped" ? "restore" : "apply")}>Reconsider</Button>}
      </div>
    </div>
    {editing && t.status === "pending" && <div className="grid gap-2 pl-6 sm:grid-cols-2">
      <Input aria-label="Document title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Input aria-label="Instructions for the client" value={instructions} placeholder="Instructions for the client (optional)" onChange={(e) => setInstructions(e.target.value)} />
    </div>}
  </div>;
}

// ---- Requiredness decision ------------------------------------------------------------------------

function RequirednessRow({ item, definition, onSetRequired, onDone }: {
  item: ImportReviewItem; definition: QuestionnaireDefinition;
  onSetRequired: (ids: string[], required: boolean) => void; onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const byId = new Map(definition.sections.flatMap((s) => s.questions.flatMap((q) => [q, ...(q.fields ?? [])])).map((q) => [q.id, q]));
  const listed = itemTargets(item).map((t) => byId.get(t.question_id ?? "")).filter((q): q is NonNullable<typeof q> => !!q);
  const requiredCount = listed.filter((q) => q.required).length;
  return <div className="flex flex-col gap-2 p-4">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm">{item.title}</p>
        <p className="text-xs text-muted-foreground">{item.reason}</p>
        <p className="text-xs text-muted-foreground">Currently {requiredCount} required, {listed.length - requiredCount} optional.</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <ChevronDown /> : <ChevronRight />} Review</Button>
        {isOpen(item) ? <Button size="sm" variant="ghost" onClick={onDone}><Check /> Done</Button> : <span className="self-center text-xs text-muted-foreground">Decided</span>}
      </div>
    </div>
    {open && <div className="flex flex-col gap-2 pl-1">
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" onClick={() => onSetRequired(listed.map((q) => q.id), true)}>Make all required</Button>
        <Button size="sm" variant="outline" onClick={() => onSetRequired(listed.map((q) => q.id), false)}>Make all optional</Button>
      </div>
      <ul className="flex flex-col divide-y divide-border/50 rounded-lg ring-1 ring-foreground/10">
        {listed.map((q) => <li key={q.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span className="min-w-0 truncate">{q.label}</span>
          <label className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground"><Switch checked={!!q.required} onCheckedChange={(v) => onSetRequired([q.id], v)} /> Required</label>
        </li>)}
      </ul>
    </div>}
  </div>;
}

// ---- Workspace ---------------------------------------------------------------------------------------

interface WorkspaceActions {
  act: (t: ImportTransformation, action: "apply" | "undo" | "skip" | "restore", options?: { edits?: Record<string, string | null>; openAfter?: boolean }) => void;
  decide: (item: ImportReviewItem, status: ImportReviewStatus) => void;
  acceptProposal: (item: ImportReviewItem, edits: ProposalEdits) => void;
  openQuestion: (item: ImportReviewItem) => void;
  showSource: (unitId: string) => void;
}

function ImportWorkspace({ initialJob, onChanged }: { initialJob: QuestionnaireImport; onChanged: () => void }) {
  const router = useRouter();
  const builder = useRef<BuilderHandle>(null);
  const [job, setJob] = useState(initialJob);
  const [generation, setGeneration] = useState(0);  // remounts the builder after a server-side change
  const [items, setItems] = useState<ImportReviewItem[]>(initialJob.review_items ?? []);
  const [draft, setDraft] = useState<BuilderDraft>({ name: initialJob.name ?? "", description: initialJob.description ?? "", definition: initialJob.draft_definition!, rules: initialJob.draft_document_rules ?? [] });
  const [view, setView] = useState<"review" | "edit">("review");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sourceUnit, setSourceUnit] = useState<string | null>(null);
  const [showBefore, setShowBefore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [conflict, setConflict] = useState<{ t: ImportTransformation; reasons: string[]; message: string } | null>(null);
  const transformations = job.transformations ?? [];

  const persistItems = useCallback(async (updates: { id: string; status: ImportReviewStatus; rule_id?: string | null }[]) => {
    const previous = items;
    setItems((current) => current.map((item) => {
      const update = updates.find((u) => u.id === item.id);
      return update ? { ...item, status: update.status, ...(isDecision(item) ? { rule_id: update.rule_id ?? null } : {}) } : item;
    }));
    try {
      setError(null);
      await updateQuestionnaireImport(job.id, { review_items: updates });
    } catch (e) {
      setItems(previous);
      setError(errorText(e));
    }
  }, [items, job.id]);

  const openInBuilder = useCallback((questionId?: string | null) => {
    setView("edit");
    if (questionId) requestAnimationFrame(() => builder.current?.focusQuestion(questionId));
  }, []);

  const firstQuestionOf = useCallback((t: ImportTransformation, definition: QuestionnaireDefinition) => {
    const labels = (t.changes ?? []).map((c) => c.match(/“([^”]+)”/)?.[1]).filter(Boolean);
    return definition.sections.flatMap((s) => s.questions).find((q) => labels.includes(q.label))?.id ?? null;
  }, []);

  const act = useCallback(async (t: ImportTransformation, action: "apply" | "undo" | "skip" | "restore", options: { edits?: Record<string, string | null>; openAfter?: boolean; force?: boolean } = {}) => {
    setBusy(true);
    setError(null);
    try {
      await builder.current?.flush();
      const next = await actOnImportTransformation(job.id, t.id, action, { force: options.force, edits: options.edits });
      setJob(next);
      setDraft((d) => ({ ...d, definition: next.draft_definition!, rules: next.draft_document_rules ?? [] }));
      setGeneration((g) => g + 1);
      setConflict(null);
      if (options.openAfter) {
        const applied = next.transformations?.find((x) => x.id === t.id);
        openInBuilder(applied ? firstQuestionOf(applied, next.draft_definition!) : null);
      }
    } catch (e) {
      if (e instanceof ApiError && e.code === "conflict") setConflict({ t, reasons: e.reasons, message: e.message });
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }, [job.id, openInBuilder, firstQuestionOf]);

  const acceptProposal = useCallback((item: ImportReviewItem, edits: ProposalEdits) => {
    const rule = ruleForProposal({ ...edits, title: edits.title || item.title }, draft.definition);
    if (!rule) { setError("Choose a question and an answer first."); return; }
    builder.current?.updateRules((rules) => [...rules, rule as DocumentGenerationRule]);
    void persistItems([{ id: item.id, status: "accepted", rule_id: rule.id }]);
  }, [draft.definition, persistItems]);

  const actions: WorkspaceActions = useMemo(() => ({
    act: (t, action, options) => void act(t, action, options),
    decide: (item, status) => void persistItems([{ id: item.id, status, ...(isDecision(item) ? { rule_id: null } : {}) }]),
    acceptProposal,
    openQuestion: (item) => {
      const target = itemTargets(item).find((t) => t.question_id);
      openInBuilder(target?.question_id ? topLevelQuestionId(draft.definition, target.question_id) : null);
    },
    showSource: setSourceUnit,
  }), [act, persistItems, acceptProposal, openInBuilder, draft.definition]);

  const counts = reviewCounts(items, transformations, draft.definition);
  const blocking = items.filter(isBlocking);
  const limitations = items.filter(isLimitation);
  const requiredness = items.filter(isRequirednessDecision);
  const setRequired = (ids: string[], required: boolean) => {
    const set = new Set(ids);
    const apply = (qs: QuestionnaireDefinition["sections"][number]["questions"]): typeof qs =>
      qs.map((q) => ({ ...(set.has(q.id) ? { ...q, required } : q), ...(q.fields ? { fields: apply(q.fields) } : {}) }));
    builder.current?.updateDefinition((d) => ({ ...d, sections: d.sections.map((s) => ({ ...s, questions: apply(s.questions) })) }));
  };
  const improvements = appliedImprovements(transformations);
  const suggestions = editorialSuggestions(transformations);
  const documentIdeas = documentSuggestions(transformations);
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });

  // Blocking issues and question notes also appear on the affected questions in the builder.
  const review: ReviewLayer = useMemo(() => ({
    severity: annotations(items, draft.definition),
    visibleQuestionIds: null,
    render: (targetId: string) => {
      const shown = itemsForQuestion(items, draft.definition, targetId).filter((i) => isOpen(i) && !isDecision(i) && (isBlocking(i) || isNote(i)));
      if (!shown.length) return null;
      return <div className="flex flex-col gap-2">{shown.map((i) => <div key={i.id} className={`flex flex-col gap-1.5 rounded-lg p-3 text-sm ${isBlocking(i) ? "bg-destructive/5 ring-1 ring-destructive/40" : "bg-muted/40"}`}>
        <p className={isBlocking(i) ? "font-medium text-destructive" : "text-muted-foreground"}>{isBlocking(i) ? "Needs your attention" : "Note from the import"}</p>
        <p>{i.reason}</p>
        <div className="flex gap-1.5"><Button size="sm" variant="outline" onClick={() => void persistItems([{ id: i.id, status: "resolved" }])}><Check /> {isBlocking(i) ? "Resolved" : "Dismiss"}</Button></div>
      </div>)}</div>;
    },
  }), [items, draft.definition, persistItems]);

  const importMode = useMemo(() => ({
    key: `import-${job.id}`,
    initial: { name: job.name ?? "", description: job.description ?? "", definition: job.draft_definition!, rules: job.draft_document_rules ?? [] },
    save: async (d: BuilderDraft) => { await updateQuestionnaireImport(job.id, { name: d.name, description: d.description || null, draft_definition: d.definition, draft_document_rules: { format_version: "1", rules: d.rules } }); },
    onDraftChange: setDraft,
  }), [job]);

  const headerActions = <>
    <Button variant="ghost" onClick={() => setDiscarding(true)}>Discard import</Button>
    <Button onClick={() => setCreating(true)} disabled={busy}>Review and create</Button>
  </>;

  const ready = counts.attention === 0;
  const nothingToReview = !blocking.length && !documentIdeas.length && !suggestions.length && !improvements.length && !limitations.length && !requiredness.length;
  return <>
    <div className={view === "review" ? "flex flex-col gap-6" : "hidden"}>
      <header className="flex flex-col gap-2">
        <p className="text-xs text-muted-foreground">Imported from {job.source_name}</p>
        <h1 className="text-3xl leading-tight font-light tracking-tight [font-family:var(--font-display)] sm:text-4xl md:text-5xl">{draft.name || "Untitled questionnaire"}</h1>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-light">{ready ? "Your questionnaire is ready" : `Almost ready — ${counts.attention} item${counts.attention === 1 ? " needs" : "s need"} your attention`}</h2>
            <p className="text-sm text-muted-foreground">{ready ? "Check anything below you want to, then create your editable draft." : "Resolve the items below. Everything else can be changed later in the builder."}</p>
          </div>
          <div className="flex flex-wrap gap-2">{headerActions}</div>
        </div>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
          <Stat label="Questions" value={counts.questions} onClick={() => openInBuilder()} />
          <Stat label="Need attention" value={counts.attention} tone="attention" onClick={counts.attention ? () => jump("review-attention") : undefined} />
          <Stat label="Improvements applied" value={counts.improvements} onClick={improvements.length ? () => jump("review-improvements") : undefined} />
          <Stat label="Suggestions" value={counts.suggestions} onClick={counts.suggestions ? () => jump(documentIdeas.length ? "review-documents" : "review-suggestions") : undefined} />
        </div>
        <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
          <Button size="sm" variant="outline" onClick={() => openInBuilder()}><PencilLine /> Open questionnaire</Button>
          <Button size="sm" variant="ghost" onClick={() => { setView("edit"); requestAnimationFrame(() => builder.current?.showTab("preview")); }}><Eye /> Preview as client</Button>
          <Button size="sm" variant="ghost" onClick={() => setSourceUnit(job.source_units?.[0]?.id ?? "")} disabled={!job.source_units?.length}><FileText /> View original</Button>
          {improvements.length > 0 && <Button size="sm" variant="ghost" onClick={() => setShowBefore(true)}>Before improvements</Button>}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </section>

      {blocking.length > 0 && <Group id="review-attention" title="Needs your attention" hint="Compozor couldn’t settle these from the document on its own.">
        {blocking.map((item) => <AttentionRow key={item.id} item={item} definition={draft.definition} actions={actions} />)}
      </Group>}

      {documentIdeas.length > 0 && <Group id="review-documents" title="Suggested document requests" hint="Not in the original questionnaire. Each needs your decision; they are ideas, not professional or regulatory requirements.">
        {documentIdeas.map((t) => <DocumentSuggestionRow key={t.id} t={t} actions={actions} />)}
      </Group>}

      {suggestions.length > 0 && <Group id="review-suggestions" title="Suggestions" hint="Optional improvements that need your judgement.">
        {suggestions.map((t) => <SuggestionRow key={t.id} t={t} actions={actions} />)}
      </Group>}

      {improvements.length > 0 && <Group id="review-improvements" title="Improvements applied" hint="Made automatically because the document supports them. Undo any you don’t want.">
        {improvements.map((t) => <ImprovementRow key={t.id} t={t} actions={actions} />)}
      </Group>}

      {(limitations.length > 0 || requiredness.length > 0) && <Group title="Extraction notes" hint="Things to be aware of. Check them against the original before creating.">
        {requiredness.map((item) => <RequirednessRow key={item.id} item={item} definition={draft.definition} onSetRequired={setRequired}
          onDone={() => void persistItems([{ id: item.id, status: "resolved" }])} />)}
        {limitations.map((item) => <div key={item.id} className="flex flex-wrap items-start justify-between gap-2 p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-sm">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.reason}</p>
            <SourceLink item={item} onSource={setSourceUnit} />
          </div>
          {isOpen(item) ? <Button size="sm" variant="ghost" onClick={() => void persistItems([{ id: item.id, status: "resolved" }])}><Check /> Checked</Button>
            : <span className="text-xs text-muted-foreground">{item.target.pending_condition ? "Handled by an improvement" : "Checked"}</span>}
        </div>)}
      </Group>}

      {nothingToReview && <p className="text-sm text-muted-foreground">Nothing to review: the questionnaire was imported as written. Open it to check, or create your draft.</p>}
    </div>

    <div className={view === "edit" ? "flex flex-col gap-4" : "hidden"}>
      <Button className="self-start" size="sm" variant="outline" onClick={() => setView("review")}><ArrowLeft /> Back to import summary</Button>
      <QuestionnaireBuilder key={generation} handle={builder} template={null} versions={[]} onSaved={() => {}}
        importMode={{ ...importMode, actions: headerActions, banner: null, review }} />
    </div>

    <SourceSheet job={job} unitId={sourceUnit} onClose={() => setSourceUnit(null)} />
    <Sheet open={showBefore} onOpenChange={setShowBefore}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>Before improvements</SheetTitle><SheetDescription>The questionnaire exactly as extracted from the document, before any automatic improvements.</SheetDescription></SheetHeader>
        <div className="px-4 pb-6">{job.faithful_definition && <QuestionnairePreview definition={job.faithful_definition} rules={job.draft_document_rules ?? []} title="Original extraction" />}</div>
      </SheetContent>
    </Sheet>
    <Dialog open={!!conflict} onOpenChange={(open) => { if (!open) setConflict(null); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Undo “{conflict?.t.title}”?</DialogTitle><DialogDescription>{conflict?.message}</DialogDescription></DialogHeader>
        <ul className="list-disc pl-5 text-sm">{conflict?.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        <p className="text-sm text-muted-foreground">Undoing now would replace your edits to these with the original imported version. You can also keep your edits and adjust the questionnaire by hand.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => { const t = conflict?.t; setConflict(null); if (t) openInBuilder(firstQuestionOf(t, draft.definition)); }}>Keep my edits</Button>
          <Button variant="destructive" onClick={() => { if (conflict) void act(conflict.t, "undo", { force: true }); }}>Undo and replace my edits</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <CreateDialog open={creating} onOpenChange={setCreating} job={job} items={items} draft={draft} transformations={transformations}
      flush={() => builder.current?.flush() ?? Promise.resolve(true)} onCreated={(templateId) => router.push(`/questionnaires/${templateId}`)} />
    <Dialog open={discarding} onOpenChange={setDiscarding}>
      <DialogContent>
        <DialogHeader><DialogTitle>Discard this import?</DialogTitle><DialogDescription>The imported draft and your review progress will be deleted. No questionnaire has been created from it.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setDiscarding(false)}>Keep reviewing</Button><Button variant="destructive" onClick={async () => { await discardQuestionnaireImport(job.id); onChanged(); router.push("/questionnaires"); }}>Discard import</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}

function SourceSheet({ job, unitId, onClose }: { job: QuestionnaireImport; unitId: string | null; onClose: () => void }) {
  useEffect(() => {
    if (unitId) requestAnimationFrame(() => document.getElementById(`source-${unitId}`)?.scrollIntoView({ block: "start" }));
  }, [unitId]);
  return <Sheet open={unitId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
    <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
      <SheetHeader><SheetTitle>Original document</SheetTitle><SheetDescription>Text extracted from {job.source_name}.</SheetDescription></SheetHeader>
      <div className="flex flex-col gap-4 px-4 pb-6">
        {(job.source_units ?? []).map((unit) => <section key={unit.id} id={`source-${unit.id}`} className={`flex flex-col gap-1 rounded-lg p-3 ${unit.id === unitId ? "ring-2 ring-accent" : "ring-1 ring-foreground/10"}`}>
          <h3 className="text-xs font-medium text-muted-foreground">{unit.label}</h3>
          {unit.scanned ? <p className="text-sm text-muted-foreground">This page is a scanned image, so its text isn’t available here. Compare the imported questions with your original file.</p>
            : <pre className="text-xs leading-relaxed break-words whitespace-pre-wrap [font-family:inherit]">{unit.text}</pre>}
        </section>)}
      </div>
    </SheetContent>
  </Sheet>;
}

function CreateDialog({ open, onOpenChange, job, items, draft, transformations, flush, onCreated }: {
  open: boolean; onOpenChange: (open: boolean) => void; job: QuestionnaireImport; items: ImportReviewItem[]; draft: BuilderDraft;
  transformations: ImportTransformation[]; flush: () => Promise<boolean>; onCreated: (templateId: number) => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<{ message: string; reasons: string[] } | null>(null);
  const counts = reviewCounts(items, transformations, draft.definition);
  const blockers = creationBlockers(items, draft.rules, draft.name, acknowledged, transformations);
  const openNotes = items.filter((i) => isOpen(i) && isLimitation(i));
  const conditional = draft.definition.sections.flatMap((s) => s.questions).filter((q) => q.visible_when || q.required_when).length;
  const create = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await flush();
      const template = await createQuestionnaireFromImport(job.id, acknowledged);
      onCreated(template.id);
    } catch (e) {
      setProblem(e instanceof ApiError ? { message: e.message, reasons: e.reasons } : { message: String(e), reasons: [] });
      setBusy(false);
    }
  };
  return <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Create “{draft.name || "Untitled questionnaire"}”</DialogTitle>
        <DialogDescription>This creates an editable draft in your library. It won’t be published or sent to any client.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 text-sm">
        <dl className="grid grid-cols-2 gap-3">
          <div><dt className="text-xs text-muted-foreground">Sections</dt><dd>{draft.definition.sections.length}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Questions</dt><dd>{counts.questions}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Conditional questions</dt><dd>{conditional}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Document requests</dt><dd>{draft.rules.length}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-muted-foreground">Automatic improvements kept</dt><dd>{counts.improvements}</dd></div>
        </dl>
        {openNotes.length > 0 && <div className="flex flex-col gap-2 rounded-lg bg-warning/15 p-3 text-warning-foreground">
          <p className="font-medium">Extraction notes</p>
          <ul className="list-disc pl-5 text-xs">{openNotes.map((w) => <li key={w.id}>{w.title}</li>)}</ul>
          <label className="flex items-center gap-2 text-foreground"><Switch checked={acknowledged} onCheckedChange={setAcknowledged} /> I’ve checked these against the original</label>
        </div>}
        {blockers.length > 0 && <div role="alert" className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3">
          <p className="font-medium">Before you can create it</p>
          <ul className="list-disc pl-5 text-xs">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>}
        {problem && <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-destructive"><p>{problem.message}</p>{problem.reasons.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs">{problem.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}</div>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Keep reviewing</Button>
        <Button onClick={() => void create()} disabled={busy || blockers.length > 0}>{busy ? "Creating…" : "Create questionnaire draft"}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
