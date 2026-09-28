"use client";

import { useParams } from "next/navigation";
import { EditQuestionnairePage } from "@/components/questionnaire-builder-page";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <EditQuestionnairePage id={Number(id)} />;
}
