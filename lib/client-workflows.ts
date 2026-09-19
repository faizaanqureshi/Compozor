import type { ClientWorkflowAssignment, WorkflowRun } from "./api";

export interface WorkflowGroup {
  workflowId: number;
  workflowName: string;
  workflowArchived: boolean;
  assignment?: ClientWorkflowAssignment;
  runs: WorkflowRun[];
}

/** Keep run history, but never use it as the inventory of assigned work. */
export function groupClientWorkflows(runs: WorkflowRun[], assignments: ClientWorkflowAssignment[]): WorkflowGroup[] {
  const groups = new Map<number, WorkflowGroup>();
  for (const run of runs) {
    if (!groups.has(run.workflow_id)) groups.set(run.workflow_id, {
      workflowId: run.workflow_id, workflowName: run.workflow_name,
      workflowArchived: run.workflow_archived, runs: [],
    });
    groups.get(run.workflow_id)!.runs.push(run);
  }
  for (const assignment of assignments) {
    const group = groups.get(assignment.workflow_id) ?? {
      workflowId: assignment.workflow_id, workflowName: assignment.workflow_name,
      workflowArchived: assignment.workflow_archived, runs: [],
    };
    group.assignment = assignment;
    group.workflowName = assignment.workflow_name;
    group.workflowArchived = assignment.workflow_archived;
    groups.set(group.workflowId, group);
  }
  return [...groups.values()];
}

export function assignmentReadiness(assignment: ClientWorkflowAssignment): string {
  if (assignment.workflow_archived) return "Workflow deleted";
  if (!assignment.checklist_total) return "Add document requirements to prepare this workflow.";
  if (!assignment.ready) return `Waiting for ${assignment.checklist_remaining} document requirement${assignment.checklist_remaining === 1 ? "" : "s"} across this client's checklist.`;
  return assignment.execution_mode === "manual"
    ? "Ready to run · Start this workflow when you're ready."
    : "Documents ready · Runs automatically, or start it now.";
}
