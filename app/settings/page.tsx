"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useClerk, useUser } from "@clerk/nextjs";
import { Loader2, Pencil } from "lucide-react";
import { GmailIcon } from "@/components/icons/gmail";
import { OutlookIcon } from "@/components/icons/outlook";
import { Panel } from "@/components/panel";
import { calendarConnectionsKey, inboxConnectionsKey, organizationKey } from "@/lib/swr-keys";
import {
  ApiError,
  AutomationLevel,
  CalendarConnection,
  InboxConnection,
  Organization,
  deleteCalendarConnection,
  deleteInboxConnection,
  getGmailConnectUrl,
  getOutlookConnectUrl,
  getMyOrganization,
  listCalendarConnections,
  listInboxConnections,
  updateMyOrganization,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { extractPhoneDigits, formatPhoneDisplay, isValidPhoneDigits } from "@/lib/phone";
import { PRACTICE_CATEGORIES, practiceCategoryForLabel } from "@/lib/practice-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SectionId = "profile" | "firm" | "sign-off" | "automation" | "connections";

const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "firm", label: "Firm" },
  { id: "sign-off", label: "Email sign-off" },
  { id: "automation", label: "Automation" },
  { id: "connections", label: "Connections" },
];

function errorMessage(e: unknown) {
  return e instanceof ApiError ? e.message : String(e);
}

// One setting: what it is (and, briefly, why it matters) on the left, its
// value or control on the right. Stacks on phones.
function SettingRow({
  label,
  htmlFor,
  description,
  children,
}: {
  label: string;
  htmlFor?: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2 border-t border-border/60 py-5 first:border-t-0 first:pt-1 last:pb-1 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8">
      <div className="flex flex-col gap-1">
        {htmlFor ? (
          <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
            {label}
          </Label>
        ) : (
          <span className="text-sm font-medium">{label}</span>
        )}
        {description && <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

function Value({ children }: { children?: React.ReactNode }) {
  return children ? (
    <span className="whitespace-pre-wrap text-foreground">{children}</span>
  ) : (
    <span className="text-muted-foreground">Not set</span>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      <Pencil />
      Edit
    </Button>
  );
}

function EditFooter({ saving, label, onSave, onCancel }: { saving: boolean; label: string; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 border-t border-border/60 pt-4">
      <Button variant="outline" disabled={saving} onClick={onCancel}>
        Cancel
      </Button>
      <Button disabled={saving} onClick={onSave}>
        {saving && <Loader2 className="animate-spin" />}
        {saving ? "Saving…" : label}
      </Button>
    </div>
  );
}

function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

const automationOptions: { value: AutomationLevel; label: string; description: string }[] = [
  {
    value: "no_automation",
    label: "No automation",
    description: "Every drafted email waits for someone to press send.",
  },
  {
    value: "medium_automation",
    label: "Medium automation",
    description: "Sends on its own only when the draft clears a high confidence bar.",
  },
  {
    value: "high_automation",
    label: "High automation",
    description: "Sends most drafts, holding back only those with low confidence.",
  },
];

function ProfileSection({
  current,
  error,
  saving,
  onSave,
}: {
  current: Organization | null;
  error: string | null;
  saving: boolean;
  onSave: (fields: { contact_name: string; phone: string }) => Promise<boolean>;
}) {
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const [edit, setEdit] = useState(false);
  const [contactName, setContactName] = useState("");
  // Digits only, as stored; may be incomplete while typing, and phoneError
  // flags too many digits rather than trimming them silently.
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const startEdit = () => {
    // Clerk's name is only a starting point until a contact name is saved.
    setContactName(current?.contact_name ?? user?.fullName ?? "");
    setPhoneDigits(current?.phone ?? "");
    setPhoneError(null);
    setEdit(true);
  };

  const save = async () => {
    if (phoneDigits && !isValidPhoneDigits(phoneDigits)) {
      setPhoneError("Enter a valid 10-digit phone number.");
      return;
    }
    if (await onSave({ contact_name: contactName.trim(), phone: phoneDigits })) setEdit(false);
  };

  const accountEmail = (
    <SettingRow label="Sign-in email" description="Managed through your account.">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="break-all">{user?.primaryEmailAddress?.emailAddress ?? "—"}</span>
        <Button variant="link" size="sm" className="h-auto px-0 text-muted-foreground" onClick={() => openUserProfile()}>
          Manage account
        </Button>
      </div>
    </SettingRow>
  );

  return (
    <Panel
      title="Profile"
      meta="Your own details"
      action={current && !edit ? <EditButton onClick={startEdit} /> : undefined}
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!current ? (
        <RowsSkeleton rows={3} />
      ) : !edit ? (
        <div className="flex flex-col">
          <SettingRow label="Name">
            <Value>{current.contact_name}</Value>
          </SettingRow>
          <SettingRow label="Phone number">
            <Value>{current.phone ? formatPhoneDisplay(current.phone) : null}</Value>
          </SettingRow>
          {accountEmail}
        </div>
      ) : (
        <>
          <div className="flex flex-col">
            <SettingRow label="Name" htmlFor="contact-name">
              <Input
                id="contact-name"
                placeholder="Jane Doe"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </SettingRow>
            <SettingRow label="Phone number" htmlFor="contact-phone">
              <div className="flex flex-col gap-1.5">
                <Input
                  id="contact-phone"
                  type="tel"
                  placeholder="(416) 000-1234"
                  value={phoneDigits.length > 10 ? phoneDigits : formatPhoneDisplay(phoneDigits)}
                  onChange={(e) => {
                    setPhoneDigits(extractPhoneDigits(e.target.value));
                    setPhoneError(null);
                  }}
                  aria-invalid={Boolean(phoneError)}
                />
                {phoneError && <p className="text-sm text-destructive">{phoneError}</p>}
              </div>
            </SettingRow>
            {accountEmail}
          </div>
          <EditFooter saving={saving} label="Save profile" onSave={save} onCancel={() => setEdit(false)} />
        </>
      )}
    </Panel>
  );
}

function FirmSection({
  current,
  error,
  saving,
  onSave,
}: {
  current: Organization | null;
  error: string | null;
  saving: boolean;
  onSave: (fields: { name: string; practice_type: string; practice_description: string; jurisdiction: string }) => Promise<boolean>;
}) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState("");
  // "" (none picked yet) | a PRACTICE_CATEGORIES value (e.g. "accounting") | "other"
  const [categoryValue, setCategoryValue] = useState("");
  const [customType, setCustomType] = useState("");
  const [description, setDescription] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  // The category awaiting confirmation. Only set when changing an already
  // saved practice type, never on first-time setup or a reselect.
  const [pendingCategoryValue, setPendingCategoryValue] = useState<string | null>(null);

  const startEdit = () => {
    setName(current?.name ?? "");
    const existing = practiceCategoryForLabel(current?.practice_type);
    if (existing) {
      setCategoryValue(existing.value);
      setCustomType("");
    } else {
      setCategoryValue(current?.practice_type ? "other" : "");
      setCustomType(current?.practice_type ?? "");
    }
    setDescription(current?.practice_description ?? "");
    setJurisdiction(current?.jurisdiction ?? "");
    setPendingCategoryValue(null);
    setEdit(true);
  };

  // A preset with a seed also fills in the description; "Other" has no seed,
  // so an existing description is left as it is rather than blanked.
  const applyCategory = (value: string) => {
    setCategoryValue(value);
    if (value === "other") return;
    const seed = PRACTICE_CATEGORIES.find((c) => c.value === value)?.seed;
    if (seed) setDescription(seed);
  };

  const selectCategory = (value: string) => {
    if (value === categoryValue) return;
    if (current?.practice_type) setPendingCategoryValue(value);
    else applyCategory(value);
  };

  const pendingSeed = pendingCategoryValue
    ? PRACTICE_CATEGORIES.find((c) => c.value === pendingCategoryValue)?.seed
    : undefined;

  const effectiveType =
    categoryValue === "other" ? customType : (PRACTICE_CATEGORIES.find((c) => c.value === categoryValue)?.label ?? "");

  const save = async () => {
    const ok = await onSave({
      name: name.trim(),
      practice_type: effectiveType.trim(),
      practice_description: description.trim(),
      jurisdiction: jurisdiction.trim(),
    });
    if (ok) setEdit(false);
  };

  const descriptionHelp = "How Compozor describes your firm in every email it writes.";
  const jurisdictionHelp = "Which government and regulatory sources Compozor treats as authoritative.";

  return (
    <>
      <Panel
        title="Firm"
        meta="Set during onboarding"
        action={current && !edit ? <EditButton onClick={startEdit} /> : undefined}
      >
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!current ? (
          <RowsSkeleton rows={4} />
        ) : !edit ? (
          <div className="flex flex-col">
            <SettingRow label="Firm name">
              <Value>{current.name}</Value>
            </SettingRow>
            <SettingRow label="Practice type">
              <Value>{current.practice_type}</Value>
            </SettingRow>
            <SettingRow label="Description" description={descriptionHelp}>
              <p className="max-w-prose text-pretty">
                <Value>{current.practice_description}</Value>
              </p>
            </SettingRow>
            <SettingRow label="Jurisdiction" description={jurisdictionHelp}>
              <Value>{current.jurisdiction}</Value>
            </SettingRow>
          </div>
        ) : (
          <>
            <div className="flex flex-col">
              <SettingRow label="Firm name" htmlFor="org-name">
                <Input id="org-name" placeholder="Smith & Associates" value={name} onChange={(e) => setName(e.target.value)} />
              </SettingRow>
              <SettingRow label="Practice type">
                <div className="flex flex-col gap-2">
                  <div role="group" aria-label="Practice type" className="flex flex-wrap gap-1.5">
                    {PRACTICE_CATEGORIES.map((category) => {
                      const active = categoryValue === category.value;
                      return (
                        <button
                          type="button"
                          key={category.value}
                          aria-pressed={active}
                          onClick={() => selectCategory(category.value)}
                          className={cn(
                            "inline-flex h-8 items-center rounded-lg border px-3 text-[0.8125rem] transition-colors",
                            active
                              ? "border-foreground bg-foreground text-background"
                              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                          )}
                        >
                          {category.label}
                        </button>
                      );
                    })}
                  </div>
                  {categoryValue === "other" && (
                    <Input
                      placeholder="Bookkeeping"
                      aria-label="Practice type"
                      value={customType}
                      onChange={(e) => setCustomType(e.target.value)}
                    />
                  )}
                </div>
              </SettingRow>
              <SettingRow label="Description" htmlFor="org-description" description={descriptionHelp}>
                <Textarea id="org-description" rows={5} value={description} onChange={(e) => setDescription(e.target.value)} />
              </SettingRow>
              <SettingRow label="Jurisdiction" htmlFor="org-jurisdiction" description={jurisdictionHelp}>
                <Input
                  id="org-jurisdiction"
                  placeholder="Ontario, Canada"
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                />
              </SettingRow>
            </div>
            <EditFooter saving={saving} label="Save firm details" onSave={save} onCancel={() => setEdit(false)} />
          </>
        )}
      </Panel>

      <Dialog open={pendingCategoryValue !== null} onOpenChange={(open) => !open && setPendingCategoryValue(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change practice type?</DialogTitle>
            <DialogDescription>
              This changes how Compozor understands your business and may affect how it writes to clients.
              {pendingSeed ? " Your description will also switch to the default for the new type, which you can edit." : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingCategoryValue(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pendingCategoryValue) applyCategory(pendingCategoryValue);
                setPendingCategoryValue(null);
              }}
            >
              Change practice type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SignOffSection({
  current,
  error,
  saving,
  onSave,
}: {
  current: Organization | null;
  error: string | null;
  saving: boolean;
  onSave: (signature: string) => Promise<boolean>;
}) {
  const [edit, setEdit] = useState(false);
  const [signature, setSignature] = useState("");
  const fallbackName = current?.contact_name || current?.name || "";
  const resolved = current?.email_signature || `Best,\n${fallbackName}`;
  const preview = signature.trim() ? signature : `Best,\n${fallbackName}`;

  const save = async () => {
    if (await onSave(signature)) setEdit(false);
  };

  const sheet = (text: string) => (
    <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm whitespace-pre-wrap text-foreground/85 ring-1 ring-foreground/5">
      {text}
    </div>
  );

  return (
    <Panel
      title="Email sign-off"
      meta="On every email"
      action={
        current && !edit ? (
          <EditButton
            onClick={() => {
              setSignature(current?.email_signature ?? "");
              setEdit(true);
            }}
          />
        ) : undefined
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!current ? (
        <Skeleton className="h-24 w-full" />
      ) : !edit ? (
        <div className="flex flex-col">
          <SettingRow
            label="Closing"
            description="Compozor never writes its own sign-off. This text is appended exactly as written."
          >
            <div className="max-w-md">{sheet(resolved)}</div>
          </SettingRow>
        </div>
      ) : (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sign-off">Sign-off</Label>
              <Textarea
                id="sign-off"
                rows={5}
                placeholder={`Best regards,\n\n${fallbackName}`}
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Preview</span>
              {sheet(preview)}
            </div>
          </div>
          <EditFooter saving={saving} label="Save sign-off" onSave={save} onCancel={() => setEdit(false)} />
        </>
      )}
    </Panel>
  );
}

function AutomationSection({
  current,
  error,
  savingAutomation,
  savingInterval,
  onChangeAutomation,
  onSaveInterval,
}: {
  current: Organization | null;
  error: string | null;
  savingAutomation: boolean;
  savingInterval: boolean;
  onChangeAutomation: (level: AutomationLevel) => void;
  onSaveInterval: (days: number | null) => void;
}) {
  const [enabled, setEnabled] = useState(() => current !== null && current.reminder_interval_days !== null);
  const [days, setDays] = useState(() =>
    current && current.reminder_interval_days !== null ? String(current.reminder_interval_days) : "7"
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
    <Panel
      title="Automation"
      meta={savingAutomation || savingInterval ? "Saving…" : "Saved as you change it"}
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!current ? (
        <RowsSkeleton rows={3} />
      ) : (
        <div className="flex flex-col">
          <SettingRow
            label="Sending drafted emails"
            description="Reminders, receipts, follow-ups on wrong documents, and answers to client questions."
          >
            <div
              role="radiogroup"
              aria-label="Automation level"
              className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg ring-1 ring-foreground/10"
            >
              {automationOptions.map((opt) => {
                const selected = current.automation_level === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors",
                      selected ? "bg-muted/50" : "hover:bg-muted/30"
                    )}
                  >
                    <input
                      type="radio"
                      name="automation_level"
                      className="sr-only"
                      checked={selected}
                      disabled={savingAutomation}
                      onChange={() => onChangeAutomation(opt.value)}
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                        selected ? "border-foreground" : "border-foreground/25"
                      )}
                    >
                      {selected && <span className="size-2 rounded-full bg-foreground" />}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{opt.label}</span>
                      <span className="text-xs text-muted-foreground">{opt.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </SettingRow>

          <SettingRow
            label="Follow-up reminders"
            description="Re-reminds clients who still owe documents. The first reminder to a client is always sent by you."
          >
            <div className="flex flex-col gap-3">
              <label className="flex w-fit cursor-pointer items-center gap-3">
                <Switch checked={enabled} onCheckedChange={onToggle} disabled={savingInterval} />
                <span className="text-sm">{enabled ? "On" : "Off"}</span>
              </label>
              <div
                className={cn(
                  "flex items-center gap-3 transition-opacity",
                  !enabled && "pointer-events-none opacity-40"
                )}
              >
                <span className="text-sm text-foreground/80">Every</span>
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
                  aria-label="Remind every, in days"
                  className="w-20 text-center"
                />
                <span className="text-sm text-foreground/80">days since the last reminder</span>
              </div>
            </div>
          </SettingRow>
        </div>
      )}
    </Panel>
  );
}

type MailProvider = "gmail" | "outlook";

interface MergedConnection {
  provider: MailProvider;
  email: string;
  inboxId: number | null;
  calendarId: number | null;
  needsReauth: boolean;
}

// One Google or Outlook consent covers both mail and calendar (see
// gmail_oauth.py's GMAIL_SCOPES / outlook_client.py's SCOPES), so the two
// API resources are merged into one row per account.
function mergeConnections(
  inboxConnections: InboxConnection[],
  calendarConnections: CalendarConnection[]
): MergedConnection[] {
  const calendarProviderFor: Record<MailProvider, CalendarConnection["provider"]> = {
    gmail: "google",
    outlook: "outlook",
  };
  return inboxConnections.map((inbox) => {
    const provider = (inbox.provider ?? "gmail") as MailProvider;
    const calendar = calendarConnections.find(
      (c) =>
        c.provider === calendarProviderFor[provider] &&
        c.calendar_email.toLowerCase() === inbox.email_address.toLowerCase()
    );
    return {
      provider,
      email: inbox.email_address,
      inboxId: inbox.id,
      calendarId: calendar?.id ?? null,
      needsReauth: inbox.status === "needs_reauth" || calendar?.status === "needs_reauth",
    };
  });
}

function ConnectionsSection({
  organization,
  inboxConnections,
  calendarConnections,
  error,
  connecting,
  deletingId,
  savingTimezone,
  onConnect,
  onDelete,
  onSaveTimezone,
}: {
  organization: Organization | null;
  inboxConnections: InboxConnection[] | null;
  calendarConnections: CalendarConnection[] | null;
  error: string | null;
  connecting: boolean;
  deletingId: number | null;
  savingTimezone: boolean;
  onConnect: (provider: MailProvider) => void;
  onDelete: (connection: MergedConnection) => void;
  onSaveTimezone: (timezone: string) => void;
}) {
  const loaded = inboxConnections !== null && calendarConnections !== null;
  const merged = loaded ? mergeConnections(inboxConnections!, calendarConnections!) : [];
  const missingProviders = loaded
    ? (["gmail", "outlook"] as const).filter((provider) => !merged.some((c) => c.provider === provider))
    : [];
  // Every IANA name the browser knows; matches the backend's own
  // zoneinfo.available_timezones() check without bundling timezone data.
  const timezones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [];
    }
  }, []);

  return (
    <Panel title="Connections" meta="Mail and calendar">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-col">
        <SettingRow
          label="Mailboxes"
          description="Compozor reads and replies to client email here, and proposes meeting times from the same account's calendar."
        >
          {!loaded ? (
            <Skeleton className="h-14 w-full rounded-lg" />
          ) : (
            <div className="flex flex-col gap-3">
              {merged.length > 0 ? (
                <ul className="flex flex-col divide-y divide-border/60 rounded-lg ring-1 ring-foreground/10">
                  {merged.map((conn) => {
                    const id = conn.inboxId ?? conn.calendarId;
                    return (
                      <li key={`${conn.provider}:${conn.email}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                        {conn.provider === "outlook" ? (
                          <OutlookIcon className="size-5 shrink-0 text-foreground" />
                        ) : (
                          <GmailIcon className="size-5 shrink-0" />
                        )}
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-medium">{conn.email}</span>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {conn.provider === "outlook" ? "Outlook" : "Google"}
                            <span aria-hidden className="text-muted-foreground/50">·</span>
                            {conn.needsReauth ? (
                              <span className="inline-flex items-center gap-1.5 text-destructive">
                                <span className="size-1.5 rounded-full bg-destructive" />
                                Needs reconnecting
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="size-1.5 rounded-full bg-success" />
                                Connected
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          {conn.needsReauth && (
                            <Button variant="outline" size="sm" disabled={connecting} onClick={() => onConnect(conn.provider)}>
                              {connecting ? "Redirecting…" : "Reconnect"}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground"
                            disabled={deletingId === id}
                            onClick={() => onDelete(conn)}
                          >
                            {deletingId === id ? "Removing…" : "Disconnect"}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-muted-foreground">Nothing connected yet.</p>
              )}
              {missingProviders.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {missingProviders.map((provider) => (
                    <Button key={provider} variant="outline" onClick={() => onConnect(provider)} disabled={connecting}>
                      {provider === "gmail" ? <GmailIcon className="size-4" /> : <OutlookIcon className="size-4" />}
                      {connecting ? "Redirecting…" : `Connect ${provider === "gmail" ? "Google" : "Outlook"}`}
                    </Button>
                  ))}
                </div>
              )}
              {missingProviders.includes("outlook") && (
                <p className="text-xs text-muted-foreground">
                  Outlook works with Microsoft 365 work accounts and personal Outlook or Hotmail accounts.
                </p>
              )}
            </div>
          )}
        </SettingRow>

        <SettingRow
          label="Timezone"
          htmlFor="org-timezone"
          description="Needed before Compozor can propose meeting times to clients."
        >
          <NativeSelect
            id="org-timezone"
            className="max-w-sm"
            value={organization?.timezone ?? ""}
            disabled={savingTimezone || !organization}
            onChange={(e) => onSaveTimezone(e.target.value)}
          >
            <option value="" disabled>
              Select a timezone…
            </option>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </NativeSelect>
        </SettingRow>
      </div>
    </Panel>
  );
}

const legalLinks = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/cookies", label: "Cookie Policy" },
];

export default function SettingsPage() {
  const { data: org, error: orgFetchError, mutate: mutateOrg } = useSWR(organizationKey(), getMyOrganization);
  const [saving, setSaving] = useState<Partial<Record<"profile" | "firm" | "sign-off" | "automation" | "interval" | "timezone", boolean>>>({});
  // Errors stay with the section whose save failed.
  const [errors, setErrors] = useState<Partial<Record<SectionId, string | null>>>({});

  const {
    data: connections,
    error: connectionsFetchError,
    mutate: mutateConnections,
  } = useSWR(inboxConnectionsKey(), listInboxConnections);
  const {
    data: calendarConnections,
    error: calendarConnectionsFetchError,
    mutate: mutateCalendarConnections,
  } = useSWR(calendarConnectionsKey(), listCalendarConnections);
  const [connecting, setConnecting] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadError = orgFetchError ? errorMessage(orgFetchError) : null;
  const errorFor = (section: SectionId) => errors[section] ?? loadError;
  const connectionsError =
    errors.connections ??
    (connectionsFetchError
      ? errorMessage(connectionsFetchError)
      : calendarConnectionsFetchError
        ? errorMessage(calendarConnectionsFetchError)
        : null);

  // Saves organization fields for one section, keeping its busy flag and
  // error separate from the others.
  const saveOrg = async (
    busyKey: keyof typeof saving,
    section: SectionId,
    fields: Parameters<typeof updateMyOrganization>[0]
  ) => {
    setSaving((prev) => ({ ...prev, [busyKey]: true }));
    setErrors((prev) => ({ ...prev, [section]: null }));
    try {
      const updated = await updateMyOrganization(fields);
      mutateOrg(updated, { revalidate: false });
      return true;
    } catch (e) {
      setErrors((prev) => ({ ...prev, [section]: errorMessage(e) }));
      return false;
    } finally {
      setSaving((prev) => ({ ...prev, [busyKey]: false }));
    }
  };

  // One click grants both mail and calendar scopes together.
  const onConnect = async (provider: MailProvider) => {
    setConnecting(true);
    setErrors((prev) => ({ ...prev, connections: null }));
    try {
      const { authorization_url } = await (provider === "outlook" ? getOutlookConnectUrl() : getGmailConnectUrl());
      window.location.href = authorization_url;
    } catch (e) {
      setErrors((prev) => ({ ...prev, connections: errorMessage(e) }));
      setConnecting(false);
    }
  };

  // Deleting either half of a connection removes both on the backend (see
  // calendar_client.disconnect), so both caches refresh either way.
  const onDeleteConnection = async (connection: MergedConnection) => {
    const id = connection.inboxId ?? connection.calendarId;
    if (id === null) return;
    setDeletingId(id);
    try {
      if (connection.inboxId !== null) await deleteInboxConnection(connection.inboxId);
      else if (connection.calendarId !== null) await deleteCalendarConnection(connection.calendarId);
      mutateConnections();
      mutateCalendarConnections();
    } catch (e) {
      setErrors((prev) => ({ ...prev, connections: errorMessage(e) }));
    } finally {
      setDeletingId(null);
    }
  };

  const current = org ?? null;

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl leading-tight font-thin tracking-tight [font-family:var(--font-denton)] md:text-5xl">
          Settings
        </h1>
        <p className="text-sm text-muted-foreground">How Compozor represents your firm, and how much it does on its own.</p>
      </header>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-10 xl:grid-cols-[11rem_minmax(0,56rem)]">
        {/* Section index beside the content on wide screens. */}
        <nav aria-label="Settings sections" className="hidden xl:block">
          <ul className="sticky top-10 flex flex-col gap-0.5 border-l border-border">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="-ml-px block border-l border-transparent py-1.5 pl-4 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-6 [&>*]:scroll-mt-10">
          <div id="profile">
            <ProfileSection
              key={`profile-${org?.id ?? "loading"}`}
              current={current}
              error={errorFor("profile")}
              saving={!!saving.profile}
              onSave={(fields) => saveOrg("profile", "profile", fields)}
            />
          </div>
          <div id="firm">
            <FirmSection
              key={`firm-${org?.id ?? "loading"}`}
              current={current}
              error={errorFor("firm")}
              saving={!!saving.firm}
              onSave={(fields) => saveOrg("firm", "firm", fields)}
            />
          </div>
          <div id="sign-off">
            <SignOffSection
              key={`sign-off-${org?.id ?? "loading"}`}
              current={current}
              error={errorFor("sign-off")}
              saving={!!saving["sign-off"]}
              onSave={(signature) => saveOrg("sign-off", "sign-off", { email_signature: signature })}
            />
          </div>
          <div id="automation">
            <AutomationSection
              key={`automation-${org?.id ?? "loading"}`}
              current={current}
              error={errorFor("automation")}
              savingAutomation={!!saving.automation}
              savingInterval={!!saving.interval}
              onChangeAutomation={(level) => void saveOrg("automation", "automation", { automation_level: level })}
              onSaveInterval={(days) => void saveOrg("interval", "automation", { reminder_interval_days: days })}
            />
          </div>
          <div id="connections">
            <ConnectionsSection
              organization={current}
              inboxConnections={connections ?? null}
              calendarConnections={calendarConnections ?? null}
              error={connectionsError}
              connecting={connecting}
              deletingId={deletingId}
              savingTimezone={!!saving.timezone}
              onConnect={onConnect}
              onDelete={onDeleteConnection}
              onSaveTimezone={(timezone) => void saveOrg("timezone", "connections", { timezone })}
            />
          </div>

          <footer className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/60 pt-5 text-xs text-muted-foreground">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="underline-offset-4 hover:text-foreground hover:underline">
                {link.label}
              </Link>
            ))}
          </footer>
        </div>
      </div>
    </div>
  );
}
