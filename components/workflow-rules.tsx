"use client";

import { useState } from "react";
import useSWR from "swr";
import { Loader2, MoreHorizontal } from "lucide-react";
import {
  ApiError, deleteWorkflowRule, listWorkflowRules, updateWorkflowRule, type WorkflowRule,
} from "@/lib/api";
import { workflowRulesKey } from "@/lib/swr-keys";
import { cn } from "@/lib/utils";
import { RuleSuggestion } from "@/components/rule-suggestion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

const MAX_RULES = 12;

function formatDay(timestamp: string) {
  return new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function origin(rule: WorkflowRule) {
  const from = rule.source === "edit" && rule.filename ? `From your edit to ${rule.filename}` : rule.source === "note" ? "From a note" : "Added";
  return `${from} · ${formatDay(rule.confirmed_at ?? rule.created_at)}`;
}

function RuleRow({ rule, onChanged }: { rule: WorkflowRule; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(rule.text);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const on = rule.status === "active";

  const save = async (change: Parameters<typeof updateWorkflowRule>[2] | "delete") => {
    setBusy(true);
    setError(null);
    try {
      if (change === "delete") await deleteWorkflowRule(rule.workflow_id, rule.id);
      else await updateWorkflowRule(rule.workflow_id, rule.id, change);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-2 py-3.5 not-first:border-t not-first:border-border/60">
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {editing ? (
            <form className="flex flex-col gap-2" onSubmit={e => { e.preventDefault(); if (text.trim()) void save({ text: text.trim() }); }}>
              <Textarea autoFocus rows={2} maxLength={240} value={text} aria-label="Rule wording"
                onChange={e => setText(e.target.value)} className="min-h-0 resize-none text-sm leading-relaxed" />
              <div className="flex justify-end gap-1.5">
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => { setEditing(false); setText(rule.text); }}>Cancel</Button>
                <Button type="submit" size="sm" disabled={busy || !text.trim()}>{busy && <Loader2 className="animate-spin" />}Save</Button>
              </div>
            </form>
          ) : (
            <p className={cn("text-sm leading-relaxed text-pretty", !on && "text-muted-foreground")}>{rule.text}</p>
          )}
          {!editing && <p className="text-xs text-muted-foreground">
            {rule.client_name ? <span className="text-foreground/75">Only {rule.client_name}</span> : "All clients"}
            <span aria-hidden className="mx-1.5 text-muted-foreground/50">·</span>
            {on ? origin(rule) : "Off"}
          </p>}
          {!editing && rule.conflict && on && (
            <p className="text-xs leading-relaxed text-warning-foreground">Differs from your instructions: “{rule.conflict.replace(/[.\s]+$/, "")}”. This rule wins.</p>
          )}
        </div>
        {!editing && <div className="flex shrink-0 items-center gap-1 pt-0.5">
          <Switch checked={on} disabled={busy} aria-label={on ? "Turn rule off" : "Turn rule on"}
            onCheckedChange={checked => void save({ status: checked ? "active" : "paused" })} />
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Rule options" className="text-muted-foreground" />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setEditing(true)}>Edit wording</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => void save("delete")}>Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

/** What staff taught this workflow by correcting its output: a small list to review, switch off or delete. */
export function WorkflowRules({ workflowId }: { workflowId: number }) {
  const { data: rules, error, mutate } = useSWR(workflowRulesKey(workflowId), () => listWorkflowRules(workflowId));
  const pending = rules?.filter(rule => rule.status === "proposed") ?? [];
  const kept = rules?.filter(rule => rule.status !== "proposed") ?? [];
  const inUse = kept.filter(rule => rule.status === "active" && !rule.client_id).length;

  return (
    <section aria-labelledby="learned-rules" className="flex min-w-0 flex-col gap-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 id="learned-rules" className="text-base font-medium tracking-tight">Learned rules</h2>
          <p className="max-w-xl text-sm text-pretty text-muted-foreground">
            What your team taught this workflow by correcting its output. Every run follows them, and the reviewer checks them.
          </p>
        </div>
        {kept.length > 0 && <span className="pt-1 text-xs text-muted-foreground tabular-nums">{inUse} of {MAX_RULES} in use</span>}
      </div>
      {error && !rules && <p className="text-sm text-destructive">Couldn&apos;t load rules. <Button variant="ghost" size="sm" onClick={() => void mutate()}>Retry</Button></p>}
      {!rules && !error && <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="size-3 animate-spin" />Loading rules…</p>}
      {pending.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <span className="text-[0.6875rem] tracking-wider text-muted-foreground uppercase">Waiting for a yes · {pending.length}</span>
          <ul className="flex flex-col gap-2.5">
            {pending.map(rule => <RuleSuggestion key={rule.id} rule={rule} clientName={rule.client_name ?? undefined} onDone={() => void mutate()} />)}
          </ul>
        </div>
      )}
      {kept.length > 0 && <ul className="flex flex-col">{kept.map(rule => <RuleRow key={`${rule.id}-${rule.status}-${rule.text}`} rule={rule} onChanged={() => void mutate()} />)}</ul>}
      {rules && rules.length === 0 && (
        <p className="text-sm text-muted-foreground">
          None yet. When someone corrects a run&apos;s output or adds a note on a client&apos;s page, suggested rules appear for a yes.
        </p>
      )}
    </section>
  );
}
