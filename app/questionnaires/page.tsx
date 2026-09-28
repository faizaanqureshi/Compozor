"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Archive, Copy, FileUp, MoreHorizontal, Pencil, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AssignQuestionnaireDialog } from "@/components/assign-questionnaire-dialog";
import {
  ApiError, archiveQuestionnaireTemplate, duplicateQuestionnaireTemplate, listQuestionnaireImports,
  listQuestionnaireTemplates, type QuestionnaireTemplate,
} from "@/lib/api";
import { questionnairesKey } from "@/lib/swr-keys";

export default function QuestionnairesPage() {
  const [includeArchived, setIncludeArchived] = useState(false);
  const { data, error, mutate } = useSWR(questionnairesKey(includeArchived), () => listQuestionnaireTemplates(includeArchived));
  const { data: imports } = useSWR(["questionnaire-imports"], listQuestionnaireImports);
  const [search, setSearch] = useState("");
  // null: closed; "any": the general Assign action; a template: that questionnaire's Assign.
  const [assigning, setAssigning] = useState<QuestionnaireTemplate | "any" | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<QuestionnaireTemplate | null>(null);
  const templates = useMemo(() => (data ?? []).filter((t) => `${t.name} ${t.description ?? ""}`.toLowerCase().includes(search.toLowerCase())), [data, search]);

  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl leading-tight font-light tracking-tight [font-family:var(--font-display)] md:text-5xl">Questionnaires</h1>
        <p className="max-w-xl text-sm text-pretty text-muted-foreground">Reusable intake forms your clients complete in their secure portal.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setAssigning("any")}><Users /> Assign</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/questionnaires/import" />}><FileUp /> Import</Button>
        <Button nativeButton={false} render={<Link href="/questionnaires/new" />}><Plus /> Create</Button>
      </div>
    </header>

    {!!imports?.length && <section className="flex flex-col gap-2">
      <h2 className="text-sm font-medium">Imports in progress</h2>
      <ul className="divide-y divide-border/50">{imports.map((job) => <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
        <span className="min-w-0"><span className="block truncate text-sm">{job.name || job.source_name}</span><span className="text-xs text-muted-foreground">{job.status === "processing" ? "Processing…" : "Ready for review"} · kept until {new Date(job.expires_at).toLocaleDateString()}</span></span>
        <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/questionnaires/import/${job.id}`} />}>{job.status === "processing" ? "View progress" : "Continue review"}</Button>
      </li>)}</ul>
    </section>}

    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm"><Search className="absolute top-3 left-3 size-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search questionnaires" aria-label="Search questionnaires" /></div>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={includeArchived} onCheckedChange={setIncludeArchived} /> Show archived</label>
      </div>
      {error && <p className="text-sm text-destructive">{error instanceof ApiError ? error.message : String(error)}</p>}
      {!data ? <p className="py-6 text-sm text-muted-foreground">Loading questionnaires…</p>
        : templates.length === 0 ? <div className="py-8"><p className="font-medium">{search ? "No questionnaires match" : "No questionnaires yet"}</p><p className="text-sm text-muted-foreground">Create one, or import an existing form.</p></div>
        : <ul className="divide-y divide-border/60 border-t border-border/60">{templates.map((template) => <TemplateRow key={template.id} template={template}
          onAssign={() => setAssigning(template)} onArchive={() => setConfirmArchive(template)}
          onDuplicate={async () => { await duplicateQuestionnaireTemplate(template.id); void mutate(); }} />)}</ul>}
    </section>

    <AssignQuestionnaireDialog open={assigning !== null} onOpenChange={(open) => !open && setAssigning(null)} template={assigning === "any" ? null : assigning} />
    <Dialog open={!!confirmArchive} onOpenChange={(open) => !open && setConfirmArchive(null)}><DialogContent><DialogHeader><DialogTitle>Archive questionnaire?</DialogTitle><DialogDescription>Existing assignments, published versions, and submissions stay available. This questionnaire can&apos;t be assigned again.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setConfirmArchive(null)}>Cancel</Button><Button variant="destructive" onClick={async () => { if (confirmArchive) await archiveQuestionnaireTemplate(confirmArchive.id); setConfirmArchive(null); void mutate(); }}>Archive</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}

function TemplateRow({ template, onAssign, onDuplicate, onArchive }: { template: QuestionnaireTemplate; onAssign: () => void; onDuplicate: () => void; onArchive: () => void }) {
  const archived = !!template.archived_at;
  const published = !!template.latest_published_version;
  const status = archived ? "Archived" : published ? "Published" : "Draft — not yet published";
  return <li className="flex items-center gap-3 py-3.5">
    <div className="min-w-0 flex-1">
      {archived ? <span className="block truncate text-sm font-medium">{template.name}</span>
        : <Link className="block truncate text-sm font-medium underline-offset-4 hover:underline" href={`/questionnaires/${template.id}`}>{template.name}</Link>}
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{[status, template.description, `Updated ${new Date(template.updated_at).toLocaleDateString()}`].filter(Boolean).join(" · ")}</p>
    </div>
    {published && !archived && <Button size="sm" variant="ghost" onClick={onAssign}><Users /> Assign</Button>}
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`${template.name} options`} className="text-muted-foreground" />}><MoreHorizontal /></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!archived && <DropdownMenuItem render={<Link href={`/questionnaires/${template.id}`} />}><Pencil /> {published ? "Edit" : "Edit draft"}</DropdownMenuItem>}
        <DropdownMenuItem onClick={onDuplicate}><Copy /> Duplicate</DropdownMenuItem>
        {!archived && <DropdownMenuItem variant="destructive" onClick={onArchive}><Archive /> Archive</DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>
  </li>;
}
