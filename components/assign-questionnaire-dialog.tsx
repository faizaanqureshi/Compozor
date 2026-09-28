"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  ApiError, bulkAssignQuestionnaire, listClients, listQuestionnaireTemplates,
  type QuestionnaireBulkAssignResult, type QuestionnaireTemplate,
} from "@/lib/api";
import { clientsKey, questionnairesKey } from "@/lib/swr-keys";
import { assignableTemplates, summarizeAssignment } from "@/lib/questionnaire-assignment";
import { cn } from "@/lib/utils";

/**
 * The one questionnaire assignment dialog. Whatever the opening page already
 * knows is fixed and never asked again:
 * - `template` known (a questionnaire's Assign action) → no questionnaire picker
 * - `clients` known (a client profile or the Clients bulk toolbar) → no client picker
 * The latest published version is always used; versions are never shown here.
 * `clients` is captured when the dialog opens, so later selection changes on
 * the page cannot alter who this assignment targets.
 */
export function AssignQuestionnaireDialog({ open, onOpenChange, template, clients, onAssigned }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: QuestionnaireTemplate | null;
  clients?: { ids: number[]; label?: string } | null;
  onAssigned?: (result: QuestionnaireBulkAssignResult) => void;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    {open && <AssignQuestionnaireBody template={template ?? null} fixedClients={clients ?? null} onClose={() => onOpenChange(false)} onAssigned={onAssigned} />}
  </Dialog>;
}

function AssignQuestionnaireBody({ template, fixedClients, onClose, onAssigned }: {
  template: QuestionnaireTemplate | null;
  fixedClients: { ids: number[]; label?: string } | null;
  onClose: () => void;
  onAssigned?: (result: QuestionnaireBulkAssignResult) => void;
}) {
  const [snapshot] = useState(() => fixedClients && { ids: [...fixedClients.ids], label: fixedClients.label });
  const templates = useSWR(template ? null : questionnairesKey(false), () => listQuestionnaireTemplates(false));
  const eligible = useMemo(() => assignableTemplates(templates.data ?? []), [templates.data]);
  const [templateId, setTemplateId] = useState<number>(template?.id ?? 0);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [required, setRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<QuestionnaireBulkAssignResult | null>(null);

  const targetIds = snapshot ? snapshot.ids : [...picked];
  const chosen = template ?? eligible.find((t) => t.id === templateId) ?? null;
  const unpublished = !!template && !template.latest_published_version;

  const submit = async (ids: number[]) => {
    if (!chosen || !ids.length) return;
    setBusy(true); setError(null);
    try {
      const res = await bulkAssignQuestionnaire(chosen.id, ids, required);
      onAssigned?.(res);
      // A single, fully successful assignment needs no summary: the refreshed list shows it.
      if (snapshot?.ids.length === 1 && res.assigned.length === 1) { onClose(); return; }
      setResult((prev) => prev ? { ...res, assigned: [...prev.assigned, ...res.assigned], skipped: [...prev.skipped, ...res.skipped] } : res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const title = template ? `Assign ${template.name}` : "Assign questionnaire";
  const scope = snapshot
    ? snapshot.label ?? `Assigning to ${snapshot.ids.length} selected client${snapshot.ids.length === 1 ? "" : "s"}`
    : null;

  if (result) {
    const summary = summarizeAssignment(result);
    return <DialogContent className="sm:max-w-md">
      <DialogHeader><DialogTitle>{result.questionnaire_name}</DialogTitle><DialogDescription>{summary.headline}</DialogDescription></DialogHeader>
      {summary.details.length > 0 && <ul className="flex flex-col gap-1 text-sm text-muted-foreground">{summary.details.map((line) => <li key={line}>{line}</li>)}</ul>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        {result.failed.length > 0 && <Button variant="outline" disabled={busy} onClick={() => void submit(result.failed.map((f) => f.client_id))}>{busy ? "Retrying…" : "Retry failed"}</Button>}
        <Button onClick={onClose} disabled={busy}>Done</Button>
      </DialogFooter>
    </DialogContent>;
  }

  return <DialogContent className="sm:max-w-md">
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{scope ?? "Clients see it in their secure portal. No email is sent."}</DialogDescription>
    </DialogHeader>
    <div className="flex min-w-0 flex-col gap-5">
      {!template && <label className="flex min-w-0 flex-col gap-1.5">
        <Label>Questionnaire</Label>
        {templates.data && !eligible.length
          ? <p className="text-sm text-muted-foreground">No published questionnaires yet. Publish one to assign it.</p>
          : <NativeSelect value={templateId} onChange={(e) => setTemplateId(Number(e.target.value))} disabled={!templates.data}>
            <option value={0}>{templates.data ? "Select a questionnaire" : "Loading…"}</option>
            {eligible.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </NativeSelect>}
      </label>}
      {!snapshot && <ClientPicker picked={picked} onChange={setPicked} />}
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        <span className="flex flex-col"><span>Required questionnaire</span><span className="text-xs text-muted-foreground">Clients complete it before uploading documents.</span></span>
      </label>
      {snapshot && <p className="text-xs text-muted-foreground">Clients see it in their secure portal. No email is sent.</p>}
      {unpublished && <p className="text-sm text-muted-foreground">Publish this questionnaire before assigning it.</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button disabled={busy || !chosen || unpublished || !targetIds.length} onClick={() => void submit(targetIds)}>
        {busy ? "Assigning…" : targetIds.length > 1 ? `Assign to ${targetIds.length} clients` : "Assign"}
      </Button>
    </DialogFooter>
  </DialogContent>;
}

// Searchable multi-select for the one context that doesn't already know its clients.
function ClientPicker({ picked, onChange }: { picked: Set<number>; onChange: (next: Set<number>) => void }) {
  const { data: clients } = useSWR(clientsKey(), listClients);
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (clients ?? []).filter((c) => !q || `${c.name} ${c.email} ${c.company_name ?? ""}`.toLowerCase().includes(q));
  }, [clients, query]);
  const allShown = shown.length > 0 && shown.every((c) => picked.has(c.id));
  const toggle = (id: number) => { const next = new Set(picked); if (next.has(id)) next.delete(id); else next.add(id); onChange(next); };
  const toggleShown = () => { const next = new Set(picked); for (const c of shown) { if (allShown) next.delete(c.id); else next.add(c.id); } onChange(next); };
  return <div className="flex min-w-0 flex-col gap-1.5">
    <div className="flex items-baseline justify-between"><Label>Clients</Label><span className="text-xs text-muted-foreground">{picked.size ? `${picked.size} selected` : "Select one or more"}</span></div>
    <div className="relative"><Search className="absolute top-3 left-3 size-4 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search clients" aria-label="Search clients" /></div>
    {!clients ? <p className="py-2 text-sm text-muted-foreground">Loading clients…</p> : !shown.length ? <p className="py-2 text-sm text-muted-foreground">No clients match.</p> : <>
      <button type="button" className="self-start py-1 text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={toggleShown}>{allShown ? "Clear shown" : `Select all ${shown.length} shown`}</button>
      <ul className="flex max-h-56 min-w-0 flex-col overflow-y-auto" aria-label="Clients">
        {shown.map((c) => <li key={c.id} className="min-w-0"><label className={cn("flex min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-sm hover:bg-muted", picked.has(c.id) && "bg-muted/60")}>
          <input type="checkbox" className="size-4 shrink-0 accent-primary" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
          <span className="min-w-0 truncate">{c.name}<span className="ml-2 text-xs text-muted-foreground">{c.company_name || c.email}</span></span>
        </label></li>)}
      </ul>
    </>}
  </div>;
}
