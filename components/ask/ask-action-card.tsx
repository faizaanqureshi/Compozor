"use client";

import { useState } from "react";
import { Check, Loader2, Mail, Send, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError, sendChecklistReminder, sendEmailLogEntry } from "@/lib/api";
import type { AskAction, AskActionResult } from "@/lib/ask";

const VISIBLE_TARGETS = 4;

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : "Couldn't send. Try again from the client's page.";
}

// A suggestion from Ask, never something it did. Nothing happens until staff
// open the confirmation and press send; the send itself goes through the same
// endpoints (and checks) as the client page's own buttons.
export function AskActionCard({
  action,
  onResolved,
}: {
  action: AskAction;
  onResolved?: (status: "done" | "failed", results: AskActionResult[]) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<AskActionResult[] | null>(action.results ?? null);
  const isDraft = action.kind === "send_draft";
  const done = action.state === "done" || (results !== null && results.every((r) => r.ok));
  const failures = (results ?? []).filter((r) => !r.ok);
  const count = action.targets.length;
  const verb = isDraft ? "Send draft" : count === 1 ? "Send reminder" : `Send ${count} reminders`;

  const run = async () => {
    setRunning(true);
    const out: AskActionResult[] = [];
    for (const target of action.targets) {
      try {
        if (isDraft && target.email_id) await sendEmailLogEntry(target.client_id, target.email_id);
        else await sendChecklistReminder(target.client_id, target.item_ids);
        out.push({ client_id: target.client_id, ok: true, detail: "Sent" });
      } catch (error) {
        out.push({ client_id: target.client_id, ok: false, detail: errorText(error) });
      }
    }
    setResults(out);
    setRunning(false);
    setConfirming(false);
    onResolved?.(out.every((r) => r.ok) ? "done" : "failed", out);
  };

  const shown = action.targets.slice(0, VISIBLE_TARGETS);
  const hidden = count - shown.length;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Mail className="size-4" strokeWidth={1.75} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="text-sm font-medium">{action.title}</p>
          {action.description && <p className="text-sm text-pretty text-muted-foreground">{action.description}</p>}
        </div>
      </div>

      {isDraft ? (
        <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
          <p className="font-medium">{action.targets[0]?.subject}</p>
          <p className="mt-1 line-clamp-3 text-muted-foreground">{action.targets[0]?.preview}</p>
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60 text-sm">
          {shown.map((target) => {
            const result = results?.find((r) => r.client_id === target.client_id);
            return (
              <li key={target.client_id} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{target.client_name}</span>
                  {target.items && target.items.length > 0 && (
                    <span className="text-muted-foreground"> · {target.items.join(", ")}</span>
                  )}
                </span>
                {result ? (
                  result.ok ? (
                    <Check className="size-3.5 shrink-0 text-success" aria-label="Sent" />
                  ) : (
                    <TriangleAlert className="size-3.5 shrink-0 text-destructive" aria-label={result.detail} />
                  )
                ) : (
                  target.last_reminder && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      reminded {new Date(`${target.last_reminder}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  )
                )}
              </li>
            );
          })}
          {hidden > 0 && <li className="px-3 py-2 text-muted-foreground">and {hidden} more</li>}
        </ul>
      )}

      {done ? (
        <p className="flex items-center gap-1.5 text-sm text-success">
          <Check className="size-3.5" /> {isDraft ? "Draft sent." : `Sent to ${count} client${count === 1 ? "" : "s"}.`}
        </p>
      ) : failures.length > 0 ? (
        <p className="text-sm text-destructive">{failures[0].detail}</p>
      ) : action.state === "dismissed" ? null : (
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => setConfirming(true)}>
            <Send />
            Review and send
          </Button>
          <span className="text-xs text-muted-foreground">Nothing is sent until you confirm.</span>
        </div>
      )}

      <Dialog open={confirming} onOpenChange={(open) => !running && setConfirming(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-8">{isDraft ? "Send this draft?" : `${verb}?`}</DialogTitle>
            <DialogDescription>
              {isDraft
                ? `It goes to ${action.targets[0]?.client_name} from your connected mailbox, exactly as written.`
                : "Each client gets one email listing what's still outstanding, from your connected mailbox."}
            </DialogDescription>
          </DialogHeader>
          {isDraft ? (
            <div className="max-h-64 overflow-y-auto rounded-lg bg-muted/50 px-3 py-2.5 text-sm whitespace-pre-wrap">
              <p className="mb-1.5 font-medium">{action.targets[0]?.subject}</p>
              {action.targets[0]?.preview}
            </div>
          ) : (
            <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto text-sm">
              {action.targets.map((target) => (
                <li key={target.client_id}>
                  <span className="font-medium">{target.client_name}</span>
                  {target.items && <span className="text-muted-foreground"> · {target.items.join(", ")}</span>}
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={running}>
              Cancel
            </Button>
            <Button onClick={run} disabled={running}>
              {running ? <Loader2 className="animate-spin" /> : <Send />}
              {running ? "Sending…" : verb}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
