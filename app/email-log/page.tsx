"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, ChevronDown, Sparkles } from "lucide-react";
import {
  ApiError,
  Client,
  EmailLogEntry,
  EmailStatus,
  listClients,
  listEmailLog,
  sendEmailLogEntry,
} from "@/lib/api";
import { cn, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const statusOptions: { value: EmailStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "received", label: "Received" },
  { value: "draft", label: "Draft" },
  { value: "needs_human_attention", label: "Needs attention" },
  { value: "sent", label: "Sent" },
];

type StatusTone = "positive" | "neutral" | "attention";

const statusTone: Record<EmailStatus, StatusTone> = {
  received: "positive",
  sent: "positive",
  draft: "neutral",
  needs_human_attention: "attention",
};

const statusToneClasses: Record<StatusTone, string> = {
  positive: "bg-accent",
  neutral: "bg-muted-foreground/40",
  attention: "bg-destructive",
};

const statusLabels: Record<EmailStatus, string> = {
  received: "Received",
  sent: "Sent",
  draft: "Draft",
  needs_human_attention: "Needs attention",
};

export default function EmailLogPage() {
  const [status, setStatus] = useState<EmailStatus | "all">("all");
  const [entries, setEntries] = useState<EmailLogEntry[] | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<Record<number, string>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const refresh = () => {
    listEmailLog(status === "all" ? undefined : status)
      .then(setEntries)
      .catch((e) => setError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(refresh, [status]);
  useEffect(() => {
    listClients()
      .then(setClients)
      .catch(() => {});
  }, []);

  const clientsById = useMemo(() => {
    const map: Record<number, Client> = {};
    for (const c of clients) map[c.id] = c;
    return map;
  }, [clients]);

  const onSend = async (entry: EmailLogEntry) => {
    setSendingId(entry.id);
    setRowError((prev) => ({ ...prev, [entry.id]: "" }));
    try {
      await sendEmailLogEntry(entry.client_id, entry.id);
      refresh();
    } catch (e) {
      setRowError((prev) => ({
        ...prev,
        [entry.id]: e instanceof ApiError ? e.message : String(e),
      }));
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-6xl font-thin tracking-tight [font-family:var(--font-denton)]">
          Email log
        </h1>
        <p className="text-sm text-muted-foreground">
          Every message sent or received across all clients.
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {statusOptions.map((opt) => (
          <Button
            key={opt.value}
            size="sm"
            variant={status === opt.value ? "default" : "ghost"}
            onClick={() => setStatus(opt.value)}
            className="rounded-lg"
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left">
            <th className="pt-1 pb-2.5 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Subject
            </th>
            <th className="pt-1 pb-2.5 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Direction
            </th>
            <th className="pt-1 pb-2.5 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Status
            </th>
            <th className="pt-1 pb-2.5 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Method
            </th>
            <th className="pt-1 pb-2.5 pr-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Client
            </th>
            <th className="pt-1 pb-2.5 pr-4 text-right text-xs font-medium tracking-wide text-muted-foreground uppercase">
              When
            </th>
            <th className="pt-1 pb-2.5 pr-4" />
          </tr>
        </thead>
        <tbody>
          {entries?.map((entry) => {
            const isOpen = expandedId === entry.id;
            const client = clientsById[entry.client_id];
            return (
              <Fragment key={entry.id}>
                <tr className="group/row border-b border-border/40">
                  <td className="py-3 pr-4 align-top">
                    <button
                      type="button"
                      onClick={() => setExpandedId(isOpen ? null : entry.id)}
                      className="flex items-start gap-1.5 text-left font-medium text-foreground/90 hover:underline hover:underline-offset-4"
                    >
                      <ChevronDown
                        className={cn(
                          "mt-0.5 size-3.5 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-180"
                        )}
                      />
                      <span className="line-clamp-1">
                        {entry.subject || "(no subject)"}
                      </span>
                    </button>
                  </td>
                  <td className="py-3 pr-4 align-top text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      {entry.direction === "outbound" ? (
                        <ArrowUpRight className="size-3.5 text-muted-foreground/70" />
                      ) : (
                        <ArrowDownLeft className="size-3.5 text-muted-foreground/70" />
                      )}
                      {entry.direction === "outbound" ? "Out" : "In"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          statusToneClasses[statusTone[entry.status]]
                        )}
                      />
                      <span className="text-foreground/80">
                        {statusLabels[entry.status]}
                      </span>
                    </span>
                    {entry.status === "needs_human_attention" &&
                      entry.escalation_reason && (
                        <p className="mt-1 max-w-[16rem] text-xs text-amber-600 dark:text-amber-500">
                          {entry.escalation_reason}
                        </p>
                      )}
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <AutosendCell entry={entry} />
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <Link
                      href={`/clients/${entry.client_id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {client?.name ?? `#${entry.client_id}`}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 align-top text-right text-muted-foreground">
                    {formatRelativeTime(entry.created_at)}
                  </td>
                  <td className="py-3 pr-4 align-top">
                    {entry.status === "draft" && (
                      <Button
                        size="sm"
                        disabled={sendingId === entry.id}
                        onClick={() => onSend(entry)}
                      >
                        {sendingId === entry.id ? "Sending…" : "Send"}
                      </Button>
                    )}
                    {rowError[entry.id] && (
                      <p className="mt-1 text-xs text-destructive">
                        {rowError[entry.id]}
                      </p>
                    )}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-border/40">
                    <td colSpan={7} className="bg-muted/30 py-3 pr-4">
                      <p className="whitespace-pre-wrap text-foreground/80">
                        {entry.content || "(no body)"}
                      </p>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {entries?.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-muted-foreground">
                No entries.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AutosendCell({ entry }: { entry: EmailLogEntry }) {
  if (entry.automation_level_at_decision === null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const detail = (
    <>
      {entry.autosend_confidence !== null && (
        <p>Confidence: {entry.autosend_confidence.toFixed(2)}</p>
      )}
      {entry.autosend_threshold !== null && (
        <p>Threshold: {entry.autosend_threshold.toFixed(2)}</p>
      )}
      {entry.autosend_error && <p>Error: {entry.autosend_error}</p>}
    </>
  );

  return (
    <div className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              className={cn(
                "inline-flex cursor-default items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                entry.autosent
                  ? "bg-accent/15 text-accent"
                  : "bg-muted text-muted-foreground"
              )}
            />
          }
        >
          {entry.autosent ? (
            <>
              <Sparkles className="size-3" />
              Auto
            </>
          ) : (
            "Manual"
          )}
        </TooltipTrigger>
        <TooltipContent>{detail}</TooltipContent>
      </Tooltip>
      {entry.autosend_error && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex items-center text-amber-600 dark:text-amber-500" />
            }
          >
            <AlertTriangle className="size-3.5" />
          </TooltipTrigger>
          <TooltipContent>{entry.autosend_error}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
