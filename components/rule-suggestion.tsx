"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { ApiError, updateWorkflowRule, type WorkflowRule } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Scope = "workflow" | "client";

// Two quiet choices for who a rule applies to; shown only when it could be either.
function ScopeChoice({ value, clientName, onChange, disabled }: {
  value: Scope; clientName: string; onChange: (scope: Scope) => void; disabled?: boolean;
}) {
  const options: { value: Scope; label: string }[] = [
    { value: "workflow", label: "All clients" },
    { value: "client", label: `Only ${clientName}` },
  ];
  return (
    <div role="radiogroup" aria-label="Applies to" className="flex flex-wrap gap-1.5">
      {options.map(option => (
        <button key={option.value} type="button" role="radio" aria-checked={value === option.value} disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn("max-w-56 truncate rounded-4xl border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
            value === option.value ? "border-foreground/40 bg-muted/60 text-foreground" : "border-border text-muted-foreground hover:bg-muted/40")}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** One proposed rule: confirm it for future runs, keep it to this run, reword it, or narrow it to one client. */
export function RuleSuggestion({ rule, clientName, onDone }: {
  rule: WorkflowRule;
  // The run's client, so staff can keep a rule to them.
  clientName?: string;
  onDone: (rule: WorkflowRule) => void;
}) {
  const [text, setText] = useState(rule.text);
  const [editing, setEditing] = useState(false);
  const [scope, setScope] = useState<Scope>(rule.client_id ? "client" : "workflow");
  const [busy, setBusy] = useState<"apply" | "skip" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (status: "active" | "dismissed") => {
    setBusy(status === "active" ? "apply" : "skip");
    setError(null);
    try {
      const changes = status === "active"
        ? { status, ...(text.trim() !== rule.text ? { text: text.trim() } : {}),
            ...(scope !== (rule.client_id ? "client" : "workflow") ? { scope } : {}) }
        : { status };
      onDone(await updateWorkflowRule(rule.workflow_id, rule.id, changes));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <li className="flex flex-col gap-3 rounded-xl p-4 ring-1 ring-foreground/10">
      <div className="flex items-start gap-3">
        {editing ? (
          <Textarea autoFocus rows={2} maxLength={240} value={text} aria-label="Rule wording"
            onChange={e => setText(e.target.value)} onBlur={() => setEditing(false)}
            className="min-h-0 resize-none text-sm leading-relaxed" />
        ) : (
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-pretty text-foreground">{text}</p>
        )}
        {!editing && (
          <Button variant="ghost" size="icon-xs" aria-label="Edit wording" className="mt-0.5 text-muted-foreground"
            onClick={() => setEditing(true)} disabled={busy !== null}>
            <Pencil />
          </Button>
        )}
      </div>
      {rule.reason && <p className="-mt-1.5 text-xs leading-relaxed text-muted-foreground">{rule.reason}</p>}
      {rule.conflict && (
        <p className="flex gap-2 text-xs leading-relaxed text-warning-foreground">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" />
          <span>Differs from your instructions: “{rule.conflict.replace(/[.\s]+$/, "")}”. If you apply it, this rule wins.</span>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        {clientName ? <ScopeChoice value={scope} clientName={clientName} onChange={setScope} disabled={busy !== null} /> : <span />}
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => decide("dismissed")} disabled={busy !== null}>
            {busy === "skip" && <Loader2 className="animate-spin" />}Just this time
          </Button>
          <Button size="sm" onClick={() => decide("active")} disabled={busy !== null || !text.trim()}>
            {busy === "apply" && <Loader2 className="animate-spin" />}Apply to future runs
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </li>
  );
}
