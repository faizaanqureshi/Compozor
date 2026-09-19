"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

import { isToolFailure, summarizeToolStep, splitAttempts, type TraceStep } from "@/lib/agent-activity";
export type { TraceStep } from "@/lib/agent-activity";

// Renders either a finished trajectory (fetched after the fact) or a
// live-updating one (appended to as tool_call_started/tool_call_result
// events arrive on the /email-log stream) - same rendering either way,
// just fed from different sources. defaultOpen is used for the live case
// so a thread that's actively being processed shows its trace immediately
// rather than behind an extra click.
export function AgentActivityDisclosure({
  trajectory,
  defaultOpen = false,
  attemptStartedAt,
  running,
}: {
  trajectory: TraceStep[];
  defaultOpen?: boolean;
  attemptStartedAt?: string | null;
  running?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { current, previous } = splitAttempts(trajectory, attemptStartedAt);
  const visible = current.filter(step => !(step.tool === "execute_workflow" && step.result === "Workflow execution step received."));

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronDown
          className={cn("size-3 transition-transform", open && "rotate-180")}
        />
        {open ? "Hide agent activity" : "Show agent activity"}
      </button>
      {open && (
        <>
        <ul className="mt-1.5 flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
          {visible.map((step, i) => {
            const interrupted = step.result == null && running === false;
            const pending = step.result == null && !interrupted;
            const failed = isToolFailure(step);
            return (
              <li
                key={`${step.round}-${step.tool}-${i}`}
                className={cn(
                  "flex items-start gap-1.5",
                  failed
                    ? "text-destructive"
                    : pending
                      ? "text-muted-foreground"
                      : "text-foreground/80"
                )}
              >
                <span className="shrink-0">
                  {pending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : failed ? (
                    "✗"
                  ) : (
                    interrupted ? "–" : "✓"
                  )}
                </span>
                <span className="min-w-0 break-words">{interrupted ? "Step stopped before completion" : summarizeToolStep(step)}</span>
              </li>
            );
          })}
        </ul>
        {previous.length > 0 && <details className="mt-2 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Earlier attempts ({previous.length} activity entries)</summary>
          <ul className="mt-1 space-y-1 pl-3">
            {previous.map((step, i) => <li key={i} className="break-words">{step.result == null ? "Step stopped before completion" : summarizeToolStep(step)}</li>)}
          </ul>
        </details>}
        </>
      )}
    </div>
  );
}
