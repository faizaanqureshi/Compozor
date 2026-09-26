"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Client, EmailLogEntry } from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/panel";

const MAX_CLIENTS = 6;

// Words and a dot tone per email. Needing a person is the only escalation;
// an unsent draft needs attention; everything else stays calm.
function describe(entry: EmailLogEntry): { label: string; dot: string } {
  if (entry.status === "needs_human_attention" && !entry.resolved_at) {
    return { label: "Needs your review", dot: "bg-destructive" };
  }
  if (entry.direction === "inbound") return { label: "Email received", dot: "bg-chart-2" };
  if (entry.status === "sent") return { label: "Email sent", dot: "bg-chart-4" };
  return { label: "Reply drafted", dot: "bg-warning" };
}

// The latest few clients with email activity, one line each: what happened
// most recently, and how much else has happened since the client's last line.
export function RecentActivity({
  entries,
  clientsById,
  loading,
}: {
  entries: EmailLogEntry[] | undefined;
  clientsById: Record<number, Client>;
  loading: boolean;
}) {
  const groups = useMemo(() => {
    const byClient = new Map<number, EmailLogEntry[]>();
    for (const entry of [...(entries ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      const list = byClient.get(entry.client_id);
      if (list) list.push(entry);
      else byClient.set(entry.client_id, [entry]);
    }
    return [...byClient.entries()].slice(0, MAX_CLIENTS).map(([clientId, list]) => ({ clientId, list }));
  }, [entries]);

  return (
    <Panel
      title="Recent activity"
      action={
        <Link
          href="/email-log"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Email log
          <ArrowRight className="size-3.5" />
        </Link>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="-my-2 flex flex-col divide-y divide-border/60">
          {groups.map(({ clientId, list }) => {
            const latest = list[0];
            const { label, dot } = describe(latest);
            const client = clientsById[clientId];
            return (
              <li key={clientId} className="flex items-start gap-3 py-3">
                <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", dot)} aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-baseline justify-between gap-3">
                    {client ? (
                      <Link
                        href={`/clients/${clientId}`}
                        className="truncate text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {client.name}
                      </Link>
                    ) : (
                      <span className="truncate text-sm font-medium">Unknown client</span>
                    )}
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelativeTime(latest.created_at)}
                    </span>
                  </div>
                  <span className="truncate text-xs text-muted-foreground">
                    {label}
                    {latest.subject ? ` · ${latest.subject}` : ""}
                    {list.length > 1 && ` · ${list.length} emails`}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
