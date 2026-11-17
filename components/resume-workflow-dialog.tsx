"use client";

import { useState } from "react";
import { ApiError, resumeWorkflowRun, WorkflowRun } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ResumeWorkflowDialog({ run, onResumed }: { run: WorkflowRun; onResumed: () => void }) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  // An outage stopped this run, not missing information: continue from saved work.
  const retry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      await resumeWorkflowRun(run.client_id, run.id, "", true);
      onResumed();
    } catch (e) {
      setRetryError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setRetrying(false);
    }
  };
  const resume = async () => {
    setPending(true);
    setError(null);
    try {
      await resumeWorkflowRun(run.client_id, run.id, context.trim());
      setOpen(false);
      setContext("");
      onResumed();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };
  return <>
    {run.can_retry && (
      <Button variant="secondary" size="sm" onClick={retry} disabled={retrying} title={retryError ?? "Continue from saved work"}>
        {retrying ? "Retrying…" : "Retry"}
      </Button>
    )}
    {retryError && <span role="alert" className="text-xs text-destructive">{retryError}</span>}
    <Button variant={run.can_retry ? "outline" : "secondary"} size="sm" onClick={() => setOpen(true)}>Resume</Button>
    <Dialog open={open} onOpenChange={(value) => { if (!pending) setOpen(value); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resume workflow</DialogTitle>
          <DialogDescription>
            Add the information needed to continue. This run keeps its original instructions and reuses saved data.
            To use edited workflow instructions, start a new run with Rerun.
          </DialogDescription>
        </DialogHeader>
        {run.review_reason && <p className="text-sm text-muted-foreground">{run.review_reason}</p>}
        <Label htmlFor={`resume-context-${run.id}`}>Clarification or decision</Label>
        <Textarea id={`resume-context-${run.id}`} value={context} maxLength={10000}
          onChange={(event) => setContext(event.target.value)} disabled={pending}
          placeholder="Explain how to resolve the issue, or identify the documents you added." />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={pending || !context.trim()} onClick={resume}>{pending ? "Resuming…" : "Resume workflow"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
