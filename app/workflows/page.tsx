"use client";

import { useEffect, useState } from "react";
import { ApiError, type Workflow, listWorkflows } from "@/lib/api";
import { WorkflowLibrary } from "@/components/workflow-library";

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () => {
    listWorkflows()
      .then(result => { setWorkflows(result); setError(null); })
      .catch(e => setError(e instanceof ApiError ? e.message : String(e)));
  };
  useEffect(refresh, []);
  return <WorkflowLibrary workflows={workflows} error={error} onRefresh={refresh} />;
}
