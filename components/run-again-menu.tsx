"use client";

import { useState } from "react";
import { ChevronDown, Loader2, RotateCcw } from "lucide-react";
import { ApiError, rerunWorkflowRun, resumeWorkflowRun, type WorkflowRun } from "@/lib/api";
import { runReason } from "@/lib/run-reason";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function Choice({ title, body }: { title: string; body: string }) {
  return (
    <span className="flex flex-col gap-0.5 py-0.5">
      <span className="text-sm">{title}</span>
      <span className="text-xs leading-relaxed text-muted-foreground">{body}</span>
    </span>
  );
}

/**
 * Every way to run a finished workflow again, in one menu: continue from saved
 * work (after an outage), continue with a note (when it needed information),
 * or start over with the current instructions.
 */
export function RunAgainMenu({ run, onStarted }: { run: WorkflowRun; onStarted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  const start = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onStarted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const continueWithNote = async () => {
    setBusy(true);
    setNoteError(null);
    try {
      await resumeWorkflowRun(run.client_id, run.id, note.trim());
      setNoteOpen(false);
      setNote("");
      onStarted();
    } catch (e) {
      setNoteError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {error && <span role="alert" className="max-w-56 text-xs text-destructive">{error}</span>}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" disabled={busy} />}>
          {busy ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          Run again
          <ChevronDown className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {run.can_resume && run.can_retry && (
            <DropdownMenuItem onClick={() => void start(() => resumeWorkflowRun(run.client_id, run.id, "", true))}>
              <Choice title="Continue from saved work" body="Picks up where it stopped. Work already done isn't repeated." />
            </DropdownMenuItem>
          )}
          {run.can_resume && (
            <DropdownMenuItem onClick={() => setNoteOpen(true)}>
              <Choice title="Continue with a note" body="Tell it how to resolve what it stopped on, then it carries on." />
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => void start(() => rerunWorkflowRun(run.client_id, run.id))}>
            <Choice title="Start over" body="A fresh run using the workflow's current instructions." />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={noteOpen} onOpenChange={(value) => { if (!busy) setNoteOpen(value); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Continue with a note</DialogTitle>
            <DialogDescription>
              It carries on from saved work with its original instructions. To use edited instructions, choose Start over.
            </DialogDescription>
          </DialogHeader>
          {run.review_reason && <p className="text-sm text-muted-foreground">{runReason(run.review_reason).text}</p>}
          <Label htmlFor={`resume-context-${run.id}`}>What should it do?</Label>
          <Textarea id={`resume-context-${run.id}`} value={note} maxLength={10000}
            onChange={(event) => setNote(event.target.value)} disabled={busy}
            placeholder="Explain how to resolve the issue, or name the documents you added." />
          {noteError && <p className="text-sm text-destructive">{noteError}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setNoteOpen(false)}>Cancel</Button>
            <Button disabled={busy || !note.trim()} onClick={continueWithNote}>{busy ? "Starting…" : "Continue"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
