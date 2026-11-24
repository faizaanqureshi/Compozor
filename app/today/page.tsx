"use client";

import Link from "next/link";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";
import { Panel } from "@/components/panel";
import { StatStrip } from "@/components/stat-strip";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DailySummary, getDailySummary } from "@/lib/api";
import { dailySummaryKey } from "@/lib/swr-keys";
import { formatShortDate } from "@/lib/utils";

// Short labels for the strip; the API's longer labels read better in the email.
const DONE: { key: string; label: string }[] = [
  { key: "emails_sent", label: "Emails sent" },
  { key: "emails_drafted", label: "Replies drafted" },
  { key: "emails_sorted", label: "Emails filed" },
  { key: "documents_checked", label: "Documents checked" },
  { key: "meetings_booked", label: "Meetings booked" },
  { key: "workflow_runs", label: "Work prepared" },
];

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

function Row({ href, primary, secondary, badge }: { href: string; primary: string; secondary?: string | null; badge?: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 rounded-md px-2 py-2.5 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="min-w-0 flex-1">
          <span className="font-medium">{primary}</span>
          {secondary && <span className="text-muted-foreground"> · {secondary}</span>}
        </span>
        {badge}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
      </Link>
    </li>
  );
}

function Group({ title, total, shown, more, children }: { title: string; total: number; shown: number; more: string; children: React.ReactNode }) {
  if (!total) return null;
  return (
    <section className="flex flex-col gap-1">
      <h3 className="px-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {title} <span className="tabular-nums">({total})</span>
      </h3>
      <ul className="flex flex-col">{children}</ul>
      {total > shown && (
        <Link href={more} className="px-2 py-1 text-xs text-muted-foreground underline-offset-4 hover:underline">
          and {total - shown} more
        </Link>
      )}
    </section>
  );
}

function NeedsYou({ s }: { s: DailySummary }) {
  const n = s.needs_you;
  if (!s.needs_you_total) return <p className="px-2 text-sm text-muted-foreground">Nothing needs you right now.</p>;
  return (
    <div className="flex flex-col gap-5">
      <Group title="Work to review" total={n.runs.total} shown={n.runs.items.length} more="/workflows">
        {n.runs.items.map((r) => (
          <Row
            key={r.run_id}
            href={`/clients/${r.client_id}`}
            primary={r.client_name}
            secondary={r.workflow_name}
            badge={r.status === "needs_review" ? <Badge variant="warning">Stopped</Badge> : <Badge variant="outline">Ready to approve</Badge>}
          />
        ))}
      </Group>
      <Group title="Email drafts to approve" total={n.drafts.total} shown={n.drafts.items.length} more="/email-log">
        {n.drafts.items.map((d) => (
          <Row key={d.email_id} href={`/clients/${d.client_id}`} primary={d.client_name} secondary={d.subject} />
        ))}
      </Group>
      <Group title="Flagged for a person" total={n.escalations.total} shown={n.escalations.items.length} more="/email-log">
        {n.escalations.items.map((d) => (
          <Row key={d.email_id} href={`/clients/${d.client_id}`} primary={d.client_name} secondary={d.subject} />
        ))}
      </Group>
      {n.unmatched_emails > 0 && (
        <section className="flex flex-col gap-1">
          <h3 className="px-2 text-xs font-medium tracking-wider text-muted-foreground uppercase">Unknown senders</h3>
          <ul>
            <Row
              href="/unmatched-emails"
              primary={`${n.unmatched_emails} ${n.unmatched_emails === 1 ? "email" : "emails"} from people who aren't clients yet`}
            />
          </ul>
        </section>
      )}
    </div>
  );
}

function DueThisWeek({ s }: { s: DailySummary }) {
  const { documents, promises } = s.due_this_week;
  if (!documents.total && !promises.total) return <p className="px-2 text-sm text-muted-foreground">Nothing due in the next 7 days.</p>;
  return (
    <div className="flex flex-col gap-5">
      <Group title="Documents due" total={documents.total} shown={documents.items.length} more="/clients">
        {documents.items.map((d) => (
          <Row
            key={d.client_id}
            href={`/clients/${d.client_id}`}
            primary={d.client_name}
            secondary={`${d.outstanding} ${d.outstanding === 1 ? "document" : "documents"} outstanding`}
            badge={
              d.overdue ? (
                <Badge variant="warning">Overdue since {formatShortDate(d.due)}</Badge>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">Due {formatShortDate(d.due)}</span>
              )
            }
          />
        ))}
      </Group>
      <Group title="Client promises" total={promises.total} shown={promises.items.length} more="/clients">
        {promises.items.map((p) => (
          <Row
            key={`${p.client_id}-${p.expected_by}`}
            href={`/clients/${p.client_id}`}
            primary={p.client_name}
            secondary={p.description}
            badge={<span className="shrink-0 text-xs text-muted-foreground tabular-nums">By {formatShortDate(p.expected_by)}</span>}
          />
        ))}
      </Group>
    </div>
  );
}

export default function TodayPage() {
  const { data: s, error } = useSWR(dailySummaryKey(), getDailySummary, { refreshInterval: 5 * 60_000 });
  const counts = new Map(s?.done.map((d) => [d.key, d.count]));
  return (
    <div className="relative isolate mx-auto flex min-h-full w-full max-w-[96rem] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl leading-tight font-light tracking-tight [font-family:var(--font-display)] md:text-5xl">Today</h1>
        {s ? (
          <p className="text-sm text-pretty text-muted-foreground">
            {longDate(s.day)}.{" "}
            {s.needs_you_total ? `${s.needs_you_total} ${s.needs_you_total === 1 ? "thing needs" : "things need"} you.` : "Nothing needs you."}
          </p>
        ) : (
          <Skeleton className="h-4 w-56" />
        )}
      </header>

      <div className="flex flex-col gap-2">
        <h2 className="text-sm text-muted-foreground">Yesterday, Compozor</h2>
        <StatStrip
          label="What Compozor did yesterday"
          loading={!s}
          skeletonCount={6}
          columns="grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
          items={DONE.map((d) => ({
            label: d.label,
            value: (counts.get(d.key) ?? 0).toLocaleString("en-US"),
            tone: counts.get(d.key) ? undefined : "text-muted-foreground",
          }))}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Needs you" meta={s ? String(s.needs_you_total) : undefined} loadError={error ? String(error) : null}>
          {s ? <NeedsYou s={s} /> : <Skeleton className="h-32 w-full" />}
        </Panel>
        <Panel title="Due this week" loadError={error ? String(error) : null}>
          {s ? <DueThisWeek s={s} /> : <Skeleton className="h-32 w-full" />}
        </Panel>
      </div>
    </div>
  );
}
