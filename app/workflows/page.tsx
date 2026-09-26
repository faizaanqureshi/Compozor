"use client";

import useSWR from "swr";
import { ApiError, listWorkflows } from "@/lib/api";
import { workflowsKey } from "@/lib/swr-keys";
import { WorkflowLibrary } from "@/components/workflow-library";

export default function WorkflowsPage() {
  const { data: workflows, error, mutate } = useSWR(workflowsKey(), listWorkflows);
  return (
    <WorkflowLibrary
      workflows={workflows ?? null}
      error={error ? (error instanceof ApiError ? error.message : String(error)) : null}
      onRefresh={() => void mutate()}
    />
  );
}
