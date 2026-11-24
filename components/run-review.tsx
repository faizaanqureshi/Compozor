"use client";

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import {
  addWorkflowRunNote, ApiError, approveWorkflowRun,
  type AppliedRule, type LearningResult, type RunDelivery, type WorkflowRule, type WorkflowRun,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { RuleSuggestion } from "@/components/rule-suggestion";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const eyebrow = "text-[0.6875rem] font-normal tracking-wider text-muted-foreground uppercase";

/** "Followed 2 of your rules": which confirmed rules this run was checked against. */
export function RulesFollowed({ rules }: { rules: AppliedRule[] }) {
  const [open, setOpen] = useState(false);
  if (!rules.length) return null;
  const checked = rules.filter(rule => rule.followed !== null);
  const followed = checked.filter(rule => rule.followed).length;
  const label = !checked.length
    ? `Checking ${rules.length === 1 ? "your rule" : `your ${rules.length} rules`}`
    : followed === rules.length
      ? `Followed ${rules.length === 1 ? "your rule" : `all ${rules.length} of your rules`}`
      : `Followed ${followed} of your ${rules.length} rules`;
  return (
    <div className="flex max-w-3xl flex-col gap-2">
      <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)}
        className="flex w-fit items-center gap-1.5 rounded-md text-xs text-foreground/80 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30">
        <Check className="size-3.5 text-success" aria-hidden />
        {label}
        <span className="text-muted-foreground">· {open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <ul className="flex flex-col gap-1.5 pl-5 text-xs leading-relaxed text-muted-foreground">
          {rules.map(rule => (
            <li key={rule.id} className={cn("grid grid-cols-[1rem_minmax(0,1fr)] gap-x-1", rule.followed === false && "text-destructive")}>
              <span className="pt-0.5">{rule.followed === false ? <X className="size-3" /> : rule.followed ? <Check className="size-3" /> : "·"}</span>
              {rule.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Suggested rules from a correction or note, with what wasn't learned. */
export function RuleSuggestions({ proposals, clientName, oneOffs, source, onSettled }: {
  proposals: WorkflowRule[]; clientName: string; oneOffs: number; source: "edit" | "note" | null;
  onSettled: () => void;
}) {
  const [settled, setSettled] = useState<Record<number, WorkflowRule>>({});
  const pending = proposals.filter(p => !settled[p.id]);
  const applied = Object.values(settled).filter(r => r.status === "active");
  if (!pending.length && !applied.length && !oneOffs) return null;
  return (
    <section aria-label="Suggested rules" className="flex max-w-2xl flex-col gap-3">
      {pending.length > 0 && <div className="flex flex-col gap-1">
        <span className={eyebrow}>{source === "note" ? "From your note" : source === "edit" ? "From your edits" : "Suggested rules"}</span>
        <p className="text-xs text-muted-foreground">Apply a rule and every future run follows it; the reviewer checks it too.</p>
      </div>}
      {pending.length > 0 && <ul className="flex flex-col gap-2.5">
        {pending.map(rule => (
          <RuleSuggestion key={rule.id} rule={rule} clientName={clientName} onDone={done => {
            setSettled(prev => ({ ...prev, [rule.id]: done }));
            onSettled();
          }} />
        ))}
      </ul>}
      {applied.length > 0 && (
        <p role="status" className="flex items-center gap-1.5 text-xs text-foreground/80">
          <Check className="size-3.5 text-success" aria-hidden />
          {applied.length === 1 ? "Rule saved. Future runs will follow it." : `${applied.length} rules saved. Future runs will follow them.`}
        </p>
      )}
      {oneOffs > 0 && (
        <p className="text-xs text-muted-foreground">
          {source === "note"
            ? "Part of your note reads as a fix for this run only, so it wasn't kept as a rule."
            : `${oneOffs === 1 ? "One change looked" : `${oneOffs} changes looked`} like a fix for this client only, so nothing was learned from ${oneOffs === 1 ? "it" : "them"}.`}
        </p>
      )}
    </section>
  );
}

const DELIVERY_WORDS: Record<string, string> = {
  sent: "sent to client",
  viewed: "client opened it",
  approved: "client says it looks good",
  question: "client asked a question",
};

/** Where approved work stands with the client, after "Approved". */
function DeliveryStatus({ delivery }: { delivery?: RunDelivery }) {
  if (!delivery || delivery.status === "not_sent") return null;
  return (
    <span className="text-muted-foreground">
      · <span className={delivery.status === "question" ? "font-medium text-foreground" : undefined}>{DELIVERY_WORDS[delivery.status]}</span>
    </span>
  );
}

/** Approve, or teach the workflow with a note. Corrected files are uploaded from each output row. */
export function RunReview({ run, clientName, result, onResult, onChange }: {
  run: WorkflowRun; clientName: string;
  // The latest correction or note, shown until the run is reloaded.
  result: { value: LearningResult; source: "edit" | "note" } | null;
  onResult: (result: { value: LearningResult; source: "edit" | "note" }) => void;
  onChange: () => void;
}) {
  const [approving, setApproving] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approved = Boolean(run.approved_at);
  const completed = run.status === "completed";
  // A run that stopped for review with a draft can be accepted as the final result.
  const acceptable = run.status === "needs_review" && (run.draft_outputs?.length ?? 0) > 0;

  const toggleApproval = async () => {
    setApproving(true);
    setError(null);
    try {
      await approveWorkflowRun(run.client_id, run.id, !approved);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  };

  const sendNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    setSending(true);
    setError(null);
    try {
      onResult({ value: await addWorkflowRunNote(run.client_id, run.id, note.trim()), source: "note" });
      setNote("");
      setNoteOpen(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  // Proposals made in this session first; otherwise those still waiting on the run.
  const proposals = result ? result.value.proposals : (run.rule_proposals ?? []);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {completed && (approved ? (
          <span className="inline-flex flex-wrap items-center gap-1.5 text-[0.8125rem] text-foreground/85">
            <Check className="size-3.5 text-success" aria-hidden />Approved
            <DeliveryStatus delivery={run.delivery} />
            <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={toggleApproval} disabled={approving}>Undo</Button>
          </span>
        ) : (
          <Button variant="outline" size="sm" onClick={toggleApproval} disabled={approving}
            title="Marks this as final. If Settings has 'Send approved work to the client' on, it goes to their portal with an email.">
            {approving ? <Loader2 className="animate-spin" /> : <Check />}Approve
          </Button>
        ))}
        {acceptable && (
          <Button variant="outline" size="sm" onClick={toggleApproval} disabled={approving}
            title="Use this draft as the final result. Read the notes above first.">
            {approving ? <Loader2 className="animate-spin" /> : <Check />}Accept draft
          </Button>
        )}
        {!noteOpen && (
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setNoteOpen(true)}>
            Teach a rule
          </Button>
        )}
      </div>
      {approved && run.delivery?.status === "question" && run.delivery.question && (
        <p className="max-w-2xl text-sm text-pretty text-foreground/85">
          <span className="text-muted-foreground">The client asked: </span>&ldquo;{run.delivery.question}&rdquo;{" "}
          <span className="text-muted-foreground">It&apos;s in their messages to reply to.</span>
        </p>
      )}
      {noteOpen && (
        <form onSubmit={sendNote} className="flex max-w-2xl flex-col gap-2">
          <Textarea autoFocus rows={2} maxLength={2000} value={note} onChange={e => setNote(e.target.value)}
            aria-label="Note for future runs" placeholder="e.g. Always round amounts to whole dollars"
            className="min-h-0 resize-y text-sm leading-relaxed"
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void sendNote(e); }} />
          <div className="flex items-center justify-end gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setNoteOpen(false); setNote(""); }} disabled={sending}>Cancel</Button>
            <Button type="submit" size="sm" disabled={sending || !note.trim()}>
              {sending && <Loader2 className="animate-spin" />}{sending ? "Reading…" : "Suggest rule"}
            </Button>
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
      <RuleSuggestions key={result ? `${result.source}-${result.value.proposals.map(p => p.id).join(",")}` : "saved"}
        proposals={proposals} clientName={clientName}
        oneOffs={result?.value.one_off_count ?? 0} source={result?.source ?? null} onSettled={() => undefined} />
      {result?.source === "edit" && result.value.changes_found === 0 && (
        <p className="text-xs text-muted-foreground">Saved. That file matches the agent&apos;s version, so there was nothing to learn.</p>
      )}
    </div>
  );
}
