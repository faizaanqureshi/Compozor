"use client";

import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuestionnaireBuilder, pendingHandoff } from "@/components/questionnaire-builder";
import { ApiError, getQuestionnaireTemplate, listQuestionnaireVersions, type QuestionnaireTemplate, type QuestionnaireVersion } from "@/lib/api";

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
    <Button className="self-start" variant="ghost" size="sm" nativeButton={false} render={<Link href="/questionnaires" />}><ArrowLeft /> Questionnaires</Button>
    {children}
  </div>;
}

/** A blank builder. Nothing is created on the server until the questionnaire is named. */
export function NewQuestionnairePage() {
  const [versions, setVersions] = useState<QuestionnaireVersion[]>([]);
  return <Shell><QuestionnaireBuilder template={null} versions={versions} onSaved={(_, version) => { if (version) setVersions((v) => [...v, version]); }} /></Shell>;
}

export function EditQuestionnairePage({ id }: { id: number }) {
  const { data, error, mutate } = useSWR(Number.isFinite(id) ? ["questionnaire-builder", id] : null, async () => {
    const [template, versions] = await Promise.all([getQuestionnaireTemplate(id), listQuestionnaireVersions(id)]);
    return { template, versions };
  }, {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    // A questionnaire created moments ago opens immediately from the editor's own state.
    fallbackData: (() => { const template = pendingHandoff(id); return template ? { template, versions: [] } : undefined; })(),
  });
  const onSaved = (template: QuestionnaireTemplate, version?: QuestionnaireVersion) => {
    // Keep the cache current without remounting the editor.
    void mutate((prev) => prev && { template, versions: version ? [...prev.versions, version] : prev.versions }, { revalidate: false });
  };
  if (error) return <Shell><p className="text-sm text-destructive">{error instanceof ApiError ? error.message : String(error)}</p></Shell>;
  if (!data) return <Shell><p className="text-sm text-muted-foreground">Loading questionnaire…</p></Shell>;
  if (data.template.archived_at) return <Shell><div className="flex flex-col gap-2"><h1 className="text-4xl font-thin tracking-tight [font-family:var(--font-denton)]">{data.template.name}</h1><p className="text-sm text-muted-foreground">This questionnaire is archived and read-only. Duplicate it from the library to make changes.</p></div></Shell>;
  return <Shell><QuestionnaireBuilder key={data.template.id} template={data.template} versions={data.versions} onSaved={onSaved} /></Shell>;
}
