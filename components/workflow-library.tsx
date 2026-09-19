"use client";

import { useState } from "react";
import { Archive, ArrowRight, MoreHorizontal } from "lucide-react";
import { ApiError, type Workflow, archiveWorkflow } from "@/lib/api";
import { WorkflowFormDialog } from "@/components/workflow-form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function WorkflowLibrary({ workflows, error, onRefresh }: {
  workflows: Workflow[] | null; error: string | null; onRefresh: () => void;
}) {
  return <div className="flex w-full min-w-0 flex-col gap-6 sm:gap-8">
    <header className="flex flex-col gap-3 border-b border-border/80 pb-6 sm:pb-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-5xl font-thin tracking-tight [font-family:var(--font-denton)]">Workflows</h1>
        <WorkflowFormDialog onSaved={onRefresh} />
      </div>
      <p className="max-w-lg text-pretty text-[0.8125rem] leading-relaxed text-muted-foreground">
        Define the work once. Run it with confidence for every client.
      </p>
    </header>
    {error && <p role="alert" className="text-[0.8125rem] text-destructive">{error}</p>}
    <section aria-label="Workflow library" className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your workflows</h2>
        {workflows && <span className="text-xs tabular-nums text-muted-foreground">{workflows.length} workflow{workflows.length === 1 ? "" : "s"}</span>}
      </div>
      {workflows === null ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading workflows">
        {[0, 1, 2].map(i => <Skeleton key={i} className="h-56 w-full rounded-xl" />)}
      </div> : workflows.length === 0 ? <Card><CardContent className="flex flex-col gap-2 py-8 text-center">
        <p className="text-sm font-medium">Create your first workflow</p>
        <p className="mx-auto max-w-sm text-pretty text-[0.8125rem] leading-relaxed text-muted-foreground">Set the instructions for a recurring task, then assign it to clients from the Clients page.</p>
      </CardContent></Card> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {workflows.map(workflow => <WorkflowLibraryCard key={workflow.id} workflow={workflow} onChange={onRefresh} />)}
      </div>}
    </section>
  </div>;
}

function WorkflowLibraryCard({ workflow, onChange }: { workflow: Workflow; onChange: () => void }) {
  const [archiving, setArchiving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onArchive = async () => {
    setArchiving(true);
    setError(null);
    try {
      await archiveWorkflow(workflow.id);
      setConfirming(false);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally { setArchiving(false); }
  };
  return <Card className="min-w-0">
    <CardHeader className="gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{workflow.execution_mode === "auto" ? "Automatic" : "On demand"}</span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Options for ${workflow.name}`} className="-mr-1 text-muted-foreground" />}><MoreHorizontal /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem variant="destructive" onClick={() => { setError(null); setConfirming(true); }}><Archive />Archive workflow</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <h3 className="max-w-sm break-words text-sm font-medium leading-relaxed text-foreground">{workflow.name}</h3>
    </CardHeader>
    <CardContent className="flex flex-1 flex-col gap-5">
      <p className="line-clamp-3 break-words text-[0.8125rem] leading-relaxed text-muted-foreground">{workflow.instructions}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
        <WorkflowFormDialog workflow={workflow} onSaved={onChange} trigger={<Button variant="ghost" size="sm" className="-ml-2.5 gap-2">Edit workflow<ArrowRight className="size-3.5" /></Button>} />
        <span className="text-xs text-muted-foreground/80" title={new Date(workflow.created_at).toLocaleString()}>Created {new Date(workflow.created_at).toLocaleDateString(undefined, {month:"short",day:"numeric",year:"numeric"})}</span>
      </div>
    </CardContent>
    <Dialog open={confirming} onOpenChange={open => !archiving && setConfirming(open)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Archive {workflow.name}?</DialogTitle><DialogDescription>It won&apos;t run for any client going forward and disappears from this list, but past runs stay in each client&apos;s history.</DialogDescription></DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter><Button variant="outline" onClick={() => setConfirming(false)} disabled={archiving}>Cancel</Button><Button variant="destructive" onClick={onArchive} disabled={archiving}>{archiving ? "Archiving…" : "Archive"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </Card>;
}
