"use client";

import { useParams } from "next/navigation";
import { QuestionnaireImportPage } from "@/components/questionnaire-import-review";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <QuestionnaireImportPage id={Number(id)} />;
}
