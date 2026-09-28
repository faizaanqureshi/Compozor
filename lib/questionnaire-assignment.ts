import type { QuestionnaireAssignment, QuestionnaireAssignSkipReason, QuestionnaireBulkAssignResult, QuestionnaireTemplate } from "@/lib/api";

/** Only active questionnaires with a published version can be assigned; the server picks the latest. */
export function assignableTemplates(templates: QuestionnaireTemplate[]): QuestionnaireTemplate[] {
  return templates
    .filter((t) => !t.archived_at && !!t.latest_published_version)
    .sort((a, b) => a.name.localeCompare(b.name));
}

const clients = (n: number) => `${n} client${n === 1 ? "" : "s"}`;

const SKIP_TEXT: Record<QuestionnaireAssignSkipReason, (n: number) => string> = {
  already_assigned: (n) => `${n === 1 ? "1 already has" : `${n} already have`} this questionnaire`,
  already_submitted: (n) => `${n} already completed it`,
  previously_cancelled: (n) => `${n} had it cancelled earlier`,
  client_unavailable: (n) => `${n} ${n === 1 ? "is" : "are"} archived or unavailable`,
};

export function summarizeAssignment(result: QuestionnaireBulkAssignResult): { headline: string; details: string[] } {
  const { assigned, skipped, failed } = result;
  const headline = assigned.length
    ? `Assigned to ${clients(assigned.length)}.`
    : failed.length ? "Nothing was assigned." : "No new assignments were needed.";
  const counts = new Map<QuestionnaireAssignSkipReason, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  const details = [...counts].map(([reason, n]) => `Skipped: ${SKIP_TEXT[reason](n)}.`);
  if (failed.length) details.push(`Couldn't assign ${clients(failed.length)}. Retrying won't duplicate anything already assigned.`);
  return { headline, details };
}

/** An open assignment can be moved to a newer published version; it never happens automatically. */
export function hasNewerVersion(assignment: Pick<QuestionnaireAssignment, "template_id" | "version_number">, templates?: Pick<QuestionnaireTemplate, "id" | "latest_published_version">[]): boolean {
  const latest = templates?.find((t) => t.id === assignment.template_id)?.latest_published_version;
  return !!latest && latest > assignment.version_number;
}
