"use client";

import { use } from "react";
import { WorkflowEditor } from "@/components/workflow-editor";
import { safeReturnPath } from "@/lib/safe-return";

export default function NewWorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { returnTo } = use(searchParams);
  return <WorkflowEditor returnTo={safeReturnPath(returnTo, "/workflows")} />;
}
