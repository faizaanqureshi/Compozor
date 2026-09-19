"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// A finished ToolTrajectoryStep (lib/api.ts) always has a `result`; a step
// still in flight on a live stream doesn't yet - `result` is left
// undefined between the tool_call_started and tool_call_result events, and
// the component shows a pending state for it meanwhile.
export interface TraceStep {
  round: number;
  tool: string;
  arguments?: Record<string, unknown>;
  result?: string;
}

const TOOL_LABELS: Record<string, string> = {
  plan_workflow: "Planned workflow",
  execute_workflow: "Worked on workflow",
  verify_workflow: "Checked workflow requirements",
  search_documents: "Searched documents",
  prepare_documents: "Prepared source files",
  extract_records: "Extracted requested information",
  extract_transactions: "Extracted transaction data",
  record_progress: "Saved workflow progress",
  finish_workflow: "Completed workflow",
  flag_for_review: "Requested staff review",
  list_client_documents: "Looked up documents on file",
  read_document: "Read a document",
  get_full_conversation_history: "Pulled full conversation history",
  // Workflow pipeline stages (see workflow_agent.py) - each of these is a
  // separate, independently-verifiable step rather than one big agent
  // loop, so a bookkeeper reviewing a run can see exactly which document
  // or step something went wrong at, not just a final pass/fail.
  extract_document: "Extracted transactions from a document",
  reconcile_document: "Checked a statement's totals reconcile",
  categorize_transactions: "Categorized transactions",
  extract_sources: "Read source documents",
  generate_outputs: "Generated and verified files",
  generate_response: "Worked on workflow",
};

function humanizeToolName(tool: string): string {
  return (
    TOOL_LABELS[tool] ??
    tool.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

function isToolFailure(step: TraceStep): boolean {
  if (!step.result) return false;
  if (/^(Unknown tool|Tool call '.*' failed)/.test(step.result)) return true;
  // reconcile_document/extract_document report their own outcome inline
  // (✓/✗ prefix or "Failed to extract...") rather than raising a generic
  // tool-call failure - still needs to render as a failure state.
  return step.result.startsWith("✗") || step.result.startsWith("Failed to extract");
}

function summarizeToolStep(step: TraceStep): string {
  if (step.result == null) return `${humanizeToolName(step.tool)}…`;
  if (isToolFailure(step)) return step.result;

  if (step.tool === "list_client_documents") {
    const count = (step.result.match(/^- id=/gm) ?? []).length;
    return `Looked up documents on file (${count} found)`;
  }

  if (step.tool === "read_document") {
    const match = step.result.match(/^Loaded document \d+ \((.+)\) - attached below\.$/);
    const description = match?.[1] ?? step.result;
    return `Read "${description}"`;
  }

  if (step.tool === "get_full_conversation_history") {
    return "Pulled full conversation history";
  }

  if (
    step.tool === "extract_document" ||
    step.tool === "reconcile_document" ||
    step.tool === "categorize_transactions"
  ) {
    // These already report a complete, human-readable outcome (e.g. "✓
    // balances reconcile" or "Extracted 47 transactions from march.pdf
    // (via table)") - shown as-is rather than prefixed with the tool
    // label, which would just repeat itself.
    return step.result;
  }

  const trimmed = step.result.length > 140 ? `${step.result.slice(0, 140)}…` : step.result;
  return `${humanizeToolName(step.tool)} — ${trimmed}`;
}

// Renders either a finished trajectory (fetched after the fact) or a
// live-updating one (appended to as tool_call_started/tool_call_result
// events arrive on the /email-log stream) - same rendering either way,
// just fed from different sources. defaultOpen is used for the live case
// so a thread that's actively being processed shows its trace immediately
// rather than behind an extra click.
export function AgentActivityDisclosure({
  trajectory,
  defaultOpen = false,
}: {
  trajectory: TraceStep[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

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
        <ul className="mt-1.5 flex flex-col gap-1 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs">
          {trajectory.map((step, i) => {
            const pending = step.result == null;
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
                    "✓"
                  )}
                </span>
                <span>{summarizeToolStep(step)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
