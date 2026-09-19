"use client";

import { useState } from "react";
import useSWR from "swr";
import { Check } from "lucide-react";
import { GmailIcon } from "@/components/icons/gmail";
import { inboxConnectionsKey, organizationKey } from "@/lib/swr-keys";
import {
  ApiError,
  AutomationLevel,
  InboxConnection,
  Organization,
  deleteInboxConnection,
  getGmailConnectUrl,
  getOutlookConnectUrl,
  getMyOrganization,
  listInboxConnections,
  updateMyOrganization,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";

const automationOptions: { value: AutomationLevel; label: string; description: string }[] = [
  {
    value: "no_automation",
    label: "No automation",
    description: "Every AI-drafted email always needs a human to click send.",
  },
  {
    value: "medium_automation",
    label: "Medium automation",
    description: "Autosends only when the model is quite confident (high bar).",
  },
  {
    value: "high_automation",
    label: "High automation",
    description: "Autosends unless the model's confidence is low (sends most of the time).",
  },
];

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {title}
          </h2>
          {subtitle && <div className="text-sm text-muted-foreground">{subtitle}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

function AutomationSection({
  current,
  error,
  savingAutomation,
  onChangeAutomation,
}: {
  current: Organization | null;
  error: string | null;
  savingAutomation: boolean;
  onChangeAutomation: (level: AutomationLevel) => void;
}) {
  return (
    <SectionCard
      title="Automation level"
      subtitle="Controls whether AI-drafted emails (checklist reminders, document-received acknowledgments, wrong-document follow-ups, answered/clarifying client questions) send themselves automatically."
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!current ? (
        <div className="flex flex-col gap-2.5">
          {automationOptions.map((_, i) => (
            <Skeleton key={i} className="h-[3.75rem] w-full rounded-lg" />
          ))}
        </div>
      ) : (
      <div className="flex flex-col gap-2.5">
        {automationOptions.map((opt, i) => {
          const selected = current?.automation_level === opt.value;
          return (
            <label
              style={{ animationDelay: `${i * 40}ms` }}
              key={opt.value}
              className={cn(
                "flex cursor-pointer animate-blur-in-sm items-center justify-between gap-4 rounded-lg border-2 px-4 py-3 transition-colors",
                selected
                  ? "border-foreground bg-muted/60"
                  : "border-border/60 hover:bg-muted/30"
              )}
            >
              <input
                type="radio"
                name="automation_level"
                className="sr-only"
                checked={selected}
                disabled={savingAutomation || !current}
                onChange={() => onChangeAutomation(opt.value)}
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{opt.label}</span>
                <span className="text-xs text-muted-foreground">{opt.description}</span>
              </div>
              <div
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border/60"
                )}
              >
                {selected && <Check className="size-3.5" />}
              </div>
            </label>
          );
        })}
      </div>
      )}
    </SectionCard>
  );
}

function ReminderSection({
  current,
  savingInterval,
  error,
  onSaveInterval,
}: {
  current: Organization | null;
  savingInterval: boolean;
  error: string | null;
  onSaveInterval: (days: number | null) => void;
}) {
  const [enabled, setEnabled] = useState(
    () => current?.reminder_interval_days !== null && current !== null
  );
  const [days, setDays] = useState(() =>
    current && current.reminder_interval_days !== null
      ? String(current.reminder_interval_days)
      : "7"
  );

  const onToggle = (next: boolean) => {
    setEnabled(next);
    onSaveInterval(next ? Number(days) || 7 : null);
  };

  const commitDays = () => {
    if (!enabled) return;
    const n = Number(days);
    if (!Number.isFinite(n) || n < 1) return;
    if (current?.reminder_interval_days === n) return;
    onSaveInterval(n);
  };

  return (
    <SectionCard
      title="Proactive reminders"
      subtitle="When on, clients with outstanding checklist items who haven't been reminded in this many days get an automatic re-reminder. The first reminder to any client is always manual — this only re-nudges clients who've already been contacted at least once."
      action={
        current ? (
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            disabled={savingInterval}
            className="animate-blur-in-sm"
            style={{ animationDelay: "100ms" }}
          />
        ) : (
          <Skeleton className="h-5 w-9 rounded-full" />
        )
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!current ? (
        <Skeleton className="h-8 w-48" />
      ) : (
      <div
        className={cn(
          "flex items-center gap-3 transition-opacity animate-blur-in-sm",
          !enabled && "pointer-events-none opacity-40"
        )}
        style={{ animationDelay: "100ms" }}
      >
        <span className="text-sm text-foreground/80">Remind after</span>
        <Input
          type="number"
          min={1}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          onBlur={commitDays}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitDays();
            }
          }}
          disabled={!enabled || savingInterval}
          className="w-20 text-center"
        />
        <span className="text-sm text-foreground/80">days</span>
        {savingInterval && (
          <span className="text-xs text-muted-foreground">Saving…</span>
        )}
      </div>
      )}
    </SectionCard>
  );
}

function MailboxSection({
  connections,
  error,
  connecting,
  deletingId,
  onConnect,
  onDelete,
}: {
  connections: InboxConnection[] | null;
  error: string | null;
  connecting: boolean;
  deletingId: number | null;
  onConnect: (provider: "gmail" | "outlook") => void;
  onDelete: (id: number) => void;
}) {
  const hasConnections = connections && connections.length > 0;

  return (
    <SectionCard title="Mailbox connections">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {connections === null ? (
        <Skeleton className="h-16 w-full rounded-lg" />
      ) : hasConnections ? (
        <div
          className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/60 animate-blur-in-sm"
          style={{ animationDelay: "200ms" }}
        >
          {connections!.map((conn) => (
            <div
              key={conn.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-sm font-medium">{conn.email_address}</span>
                <span className="text-xs text-muted-foreground">{conn.provider === "outlook" ? "Outlook" : "Gmail"}</span>
                {conn.status === "needs_reauth" ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                    <span className="size-1.5 rounded-full bg-accent" />
                    needs reauth
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent">
                    <span className="size-1.5 rounded-full bg-accent" />
                    connected
                  </span>
                )}
              </div>
              <button
                onClick={() => onDelete(conn.id)}
                disabled={deletingId === conn.id}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
              >
                {deletingId === conn.id ? "Removing…" : "Disconnect"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div
          className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border/60 px-4 py-6 animate-blur-in-sm"
          style={{ animationDelay: "200ms" }}
        >
          <p className="text-sm text-muted-foreground">No mailbox connected.</p>

        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={() => onConnect("gmail")} disabled={connecting}>
          <GmailIcon className="size-4" />{connecting ? "Redirecting…" : "Connect Gmail"}
        </Button>
        <Button variant="outline" onClick={() => onConnect("outlook")} disabled={connecting}>
          {connecting ? "Redirecting…" : "Connect Outlook"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Outlook supports Microsoft 365 work accounts and personal Outlook or Hotmail accounts.</p>
    </SectionCard>
  );
}

export default function SettingsPage() {
  const {
    data: org,
    error: orgFetchError,
    mutate: mutateOrg,
  } = useSWR(organizationKey(), getMyOrganization);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [savingInterval, setSavingInterval] = useState(false);
  const [orgError, setOrgError] = useState<string | null>(null);

  const {
    data: connections,
    error: connectionsFetchError,
    mutate: mutateConnections,
  } = useSWR(inboxConnectionsKey(), listInboxConnections);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const orgErrorMessage =
    orgError ??
    (orgFetchError
      ? orgFetchError instanceof ApiError
        ? orgFetchError.message
        : String(orgFetchError)
      : null);
  const gmailErrorMessage =
    gmailError ??
    (connectionsFetchError
      ? connectionsFetchError instanceof ApiError
        ? connectionsFetchError.message
        : String(connectionsFetchError)
      : null);

  const onChangeAutomation = async (level: AutomationLevel) => {
    setSavingAutomation(true);
    setOrgError(null);
    try {
      const updated = await updateMyOrganization({ automation_level: level });
      mutateOrg(updated, { revalidate: false });
    } catch (e) {
      setOrgError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSavingAutomation(false);
    }
  };

  const onSaveInterval = async (days: number | null) => {
    setSavingInterval(true);
    setOrgError(null);
    try {
      const updated = await updateMyOrganization({ reminder_interval_days: days });
      mutateOrg(updated, { revalidate: false });
    } catch (e) {
      setOrgError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSavingInterval(false);
    }
  };

  const onConnect = async (provider: "gmail" | "outlook") => {
    setConnecting(true);
    setGmailError(null);
    try {
      const { authorization_url } = await (provider === "outlook" ? getOutlookConnectUrl() : getGmailConnectUrl());
      window.location.href = authorization_url;
    } catch (e) {
      setGmailError(e instanceof ApiError ? e.message : String(e));
      setConnecting(false);
    }
  };

  const onDelete = async (id: number) => {
    setDeletingId(id);
    try {
      await deleteInboxConnection(id);
      mutateConnections();
    } catch (e) {
      setGmailError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-thin tracking-tight [font-family:var(--font-denton)] sm:text-5xl md:text-6xl">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure automation, reminders, and mailbox connections for your organization.
        </p>
      </div>

      <div className="flex w-full flex-col gap-6">
        <AutomationSection
          current={org ?? null}
          error={orgErrorMessage}
          savingAutomation={savingAutomation}
          onChangeAutomation={onChangeAutomation}
        />

        <ReminderSection
          key={org?.id ?? "loading"}
          current={org ?? null}
          savingInterval={savingInterval}
          error={orgErrorMessage}
          onSaveInterval={onSaveInterval}
        />

        <MailboxSection
          connections={connections ?? null}
          error={gmailErrorMessage}
          connecting={connecting}
          deletingId={deletingId}
          onConnect={onConnect}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}
