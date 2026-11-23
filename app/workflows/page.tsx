"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ApiError, listClients, listWorkflows } from "@/lib/api";
import { clientsKey, workflowsKey } from "@/lib/swr-keys";
import { WorkflowLibrary } from "@/components/workflow-library";

export default function WorkflowsPage({ searchParams }: { searchParams: Promise<{ assign?: string | string[] }> }) {
  const { assign } = use(searchParams);
  const router = useRouter();
  const { data: workflows, error, mutate } = useSWR(workflowsKey(), listWorkflows);
  // Clients carry each workflow's latest run status; shared cache with the
  // Clients page, so this is usually already loaded.
  const { data: clients, mutate: mutateClients } = useSWR(clientsKey(), listClients);
  const assignId = typeof assign === "string" && /^\d+$/.test(assign) ? Number(assign) : undefined;
  return (
    <WorkflowLibrary
      workflows={workflows ?? null}
      clients={clients}
      error={error ? (error instanceof ApiError ? error.message : String(error)) : null}
      onRefresh={() => {
        void mutate();
        void mutateClients();
      }}
      assignWorkflowId={assignId}
      onAssignClosed={() => assignId !== undefined && router.replace("/workflows", { scroll: false })}
    />
  );
}
