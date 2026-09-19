// A finished ToolTrajectoryStep (lib/api.ts) always has a `result`; a step
// still in flight on a live stream doesn't yet - `result` is left
// undefined between the tool_call_started and tool_call_result events, and
// the component shows a pending state for it meanwhile.
export interface TraceStep {
  round: number;
  tool: string;
  arguments?: Record<string, unknown>;
  result?: string;
  started_at?: string;
  completed_at?: string;
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
  finish_workflow: "Checked outputs",
  flag_for_review: "Checked need for staff review",
  code_interpreter: "Processed document data",
  render_report: "Built report from saved data",
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

export function humanizeToolName(tool: string): string {
  return (
    TOOL_LABELS[tool] ??
    tool.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())
  );
}

export function isToolFailure(step: TraceStep): boolean {
  if (!step.result) return false;
  if (/^\s*\{\s*"(?:error|verification_failed)"\s*:/.test(step.result)) return true;
  if (step.tool === "verify_workflow" && step.result.trim().startsWith("[")) return step.result.trim() !== "[]";
  if (/^(Unknown tool|Tool call '.*' failed)/.test(step.result)) return true;
  // reconcile_document/extract_document report their own outcome inline
  // (✓/✗ prefix or "Failed to extract...") rather than raising a generic
  // tool-call failure - still needs to render as a failure state.
  return step.result.startsWith("✗") || step.result.startsWith("Failed to extract");
}

export function summarizeToolStep(step: TraceStep): string {
  if (step.result == null) {
    if (step.tool === "execute_workflow") return "Processing documents and outputs…";
    if (step.tool === "plan_workflow") return "Planning the current attempt…";
    if (step.tool === "finish_workflow" || step.tool === "verify_workflow") return "Checking generated outputs…";
    return `${humanizeToolName(step.tool)}…`;
  }
  let data: Record<string, unknown> | unknown[] | null = null;
  try { data = JSON.parse(step.result); } catch { /* Older traces may be truncated. */ }
  const value = data && !Array.isArray(data) ? data : null;
  const short = (text: string) => text.length > 180 ? `${text.slice(0, 180)}…` : text;
  if (isToolFailure(step)) {
    const error = typeof value?.error === "string" ? value.error : null;
    return error ? `Needs correction — ${short(error)}` : "Output checks found issues to repair.";
  }

  if (step.tool === "finish_workflow") return value?.status === "completed" ? "Output checks passed" : "Submitted outputs for checking";
  if (step.tool === "flag_for_review") {
    if (value?.status === "continue" || /^\s*\{\s*"status"\s*:\s*"continue"/.test(step.result)) return "Continuing automatic repairs; no staff action needed";
    return "Paused for staff review";
  }
  if (step.tool === "execute_workflow") return "Preparing the next workflow step";
  if (step.tool === "code_interpreter") return "Processed document data and draft files";
  if (step.tool === "render_report") return typeof value?.pages === "number"
    ? `Built ${value.pages}-page PDF from saved data; completion checks still required`
    : "Built report from saved data";

  if (step.tool === "list_client_documents") {
    if (Array.isArray(data)) return `Found ${data.length} document${data.length === 1 ? "" : "s"} on file`;
    if (step.result.trim().startsWith("[")) return "Looked up documents on file";
    const count = (step.result.match(/^- id=/gm) ?? []).length;
    return `Looked up documents on file (${count} found)`;
  }

  if (step.tool === "read_document") {
    const documentId = step.result.match(/"document_id"\s*:\s*(\d+)/)?.[1];
    if (documentId) return `Read a section of document ${documentId}`;
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

export function splitAttempts(trajectory: TraceStep[], startedAt?: string | null) {
  if (!startedAt) return { current: trajectory, previous: [] as TraceStep[] };
  const start = Date.parse(startedAt);
  const lastPlan = trajectory.findLastIndex(step => step.tool === "plan_workflow");
  const current: TraceStep[] = [], previous: TraceStep[] = [];
  trajectory.forEach((step, i) => {
    const time = step.started_at ? Date.parse(step.started_at) : NaN;
    const isCurrent = Number.isFinite(time) && Number.isFinite(start) ? time >= start : i >= Math.max(0, lastPlan);
    (isCurrent ? current : previous).push(step);
  });
  return { current, previous };
}
