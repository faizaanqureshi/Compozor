import { CheckCircle2, CircleAlert, ListChecks } from "lucide-react";

import type { EmailAction } from "@/lib/api";

function describe(action: EmailAction): string {
  if (action.type === "request_document") {
    return `Add ${action.document}${action.description ? ` (${action.description})` : ""} to the checklist`;
  }
  if (action.type === "new_date") {
    const day = action.new_date
      ? new Date(`${action.new_date}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric" })
      : "";
    return `Hold reminders for ${action.label ?? "outstanding items"} until ${day}`;
  }
  return action.type;
}

/** What the assistant will do (or did) when this reply is sent. */
export function EmailActionsNote({ actions }: { actions: EmailAction[] | null | undefined }) {
  if (!actions || actions.length === 0) return null;
  const queued = actions.filter((a) => a.status === "queued");
  const applied = actions.filter((a) => a.status === "applied");
  const failed = actions.filter((a) => a.status === "failed");
  return (
    <div className="flex flex-col gap-1.5 rounded-lg border border-input bg-muted/40 px-3 py-2 text-xs">
      {queued.length > 0 && (
        <Group icon={<ListChecks className="size-3.5" />} title="When you send this, Compozor will also:" items={queued} />
      )}
      {applied.length > 0 && (
        <Group icon={<CheckCircle2 className="size-3.5" />} title="Done when this was sent:" items={applied} />
      )}
      {failed.length > 0 && (
        <Group
          icon={<CircleAlert className="size-3.5 text-destructive" />}
          title="Couldn't complete, please do this by hand:"
          items={failed}
        />
      )}
    </div>
  );
}

function Group({ icon, title, items }: { icon: React.ReactNode; title: string; items: EmailAction[] }) {
  return (
    <div className="flex items-start gap-2 text-muted-foreground">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {items.map((action, i) => (
            <li key={i}>{describe(action)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
