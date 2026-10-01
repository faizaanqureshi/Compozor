"use client";

import { use } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ApiError, getWorkflow } from "@/lib/api";
import { WorkflowEditor } from "@/components/workflow-editor";
import { Skeleton } from "@/components/ui/skeleton";

export default function EditWorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const workflowId = Number(id);
  const { data: workflow, error } = useSWR(Number.isInteger(workflowId) ? ["workflow", workflowId] : null, () => getWorkflow(workflowId));

  if (error || !Number.isInteger(workflowId)) {
    return (
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {error instanceof ApiError && error.status === 404 ? "This workflow doesn't exist or was archived." : "Couldn't load this workflow."}
        </p>
        <Link href="/workflows" className="text-sm underline underline-offset-4">Back to workflows</Link>
      </div>
    );
  }
  if (!workflow) {
    return (
      <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6" role="status" aria-label="Loading workflow">
        <Skeleton className="h-12 w-72" />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-96 w-full" />
          <Skeleton className="hidden h-72 w-full lg:block" />
        </div>
      </div>
    );
  }
  // Keyed so switching workflows starts from that workflow's saved values.
  return <WorkflowEditor key={workflow.id} workflow={workflow} />;
}
