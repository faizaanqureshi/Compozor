"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useClerk, useUser } from "@clerk/nextjs";
import { Check, Loader2, Pencil } from "lucide-react";
import { GmailIcon } from "@/components/icons/gmail";
import { OutlookIcon } from "@/components/icons/outlook";
import { SectionCard } from "@/components/section-card";
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
import { extractPhoneDigits, formatPhoneDisplay, isValidPhoneDigits } from "@/lib/phone";
import { PRACTICE_CATEGORIES, practiceCategoryForLabel } from "@/lib/practice-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <Pencil className="size-3.5" />
      Edit
    </button>
  );
}

function DisplayField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">
        {value ? <span className="whitespace-pre-wrap">{value}</span> : <span className="text-muted-foreground/60">Not set</span>}
      </span>
    </div>
  );
}

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

function YourProfileSection({
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
  // Canonical digits-only, same as what's persisted - may be incomplete
  // (< 10 digits) mid-type, or briefly > 10 if the user's typed/pasted too
  // many, which phoneError below surfaces rather than silently trimming.
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const startEdit = () => {
    // Prefill from Clerk's name only as a starting point for an org that's
    // never set contact_name - once saved, the stored value always wins.
    setContactName(current?.contact_name ?? user?.fullName ?? "");
    setPhoneDigits(current?.phone ?? "");
    setPhoneError(null);
    setEdit(true);
  };

  const onPhoneChange = (raw: string) => {
    setPhoneDigits(extractPhoneDigits(raw));
    setPhoneError(null);
  };

  const save = async () => {
    if (phoneDigits && !isValidPhoneDigits(phoneDigits)) {
      setPhoneError("Enter a valid 10-digit phone number.");
      return;
    }
    if (await onSave({ contact_name: contactName.trim(), phone: phoneDigits })) setEdit(false);
  };

  const accountEmail = (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">Account email</span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-foreground">{user?.primaryEmailAddress?.emailAddress ?? "—"}</span>
        <button
          type="button"
          onClick={() => openUserProfile()}
          className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Manage account
        </button>
      </div>
    </div>
  );

  return (
    <SectionCard
      title="Your profile"
      subtitle="Your own name and contact details, separate from your firm's information below."
      action={current && !edit ? <EditButton onClick={startEdit} /> : undefined}
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!current ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : !edit ? (
        <div className="flex flex-col gap-4">
          <DisplayField label="Name" value={current.contact_name} />
          <DisplayField label="Phone number" value={current.phone ? formatPhoneDisplay(current.phone) : null} />
          {accountEmail}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-name">Name</Label>
            <Input id="contact-name" placeholder="e.g. Jane Doe" value={contactName}
              onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contact-phone">Phone number</Label>
            <Input
              id="contact-phone"
              type="tel"
              placeholder="e.g. (416) 000-1234"
              value={phoneDigits.length > 10 ? phoneDigits : formatPhoneDisplay(phoneDigits)}
              onChange={(e) => onPhoneChange(e.target.value)}
              aria-invalid={Boolean(phoneError)}
            />
            {phoneError && <p className="text-sm text-destructive">{phoneError}</p>}
          </div>
          {accountEmail}
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={save}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Saving…" : "Save profile"}
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEdit(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function OrganizationSection({
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
  // The category value awaiting confirmation - non-null while the dialog
  // is open. Only ever set when actually changing an already-persisted
  // practice_type (see selectCategory), never on first-time setup or
  // reselecting what's already chosen.
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

  // Applies a category selection: switches categoryValue and, only for a
  // preset with a real seed, autofills the description (see the module
  // doc on PRACTICE_CATEGORIES - "Other" has no seed, so an existing
  // description is deliberately left untouched rather than blanked).
  const applyCategory = (value: string) => {
    setCategoryValue(value);
    if (value === "other") return;
    const seed = PRACTICE_CATEGORIES.find((c) => c.value === value)?.seed;
    if (seed) setDescription(seed);
  };

  const selectCategory = (value: string) => {
    if (value === categoryValue) return;
    // Only warn when this edit session actually started from an
    // already-persisted type - never on first-time setup, and never
    // twice for the same no-op reselect (handled by the check above).
    if (current?.practice_type) {
      setPendingCategoryValue(value);
    } else {
      applyCategory(value);
    }
  };

  const pendingSeed = pendingCategoryValue ? PRACTICE_CATEGORIES.find((c) => c.value === pendingCategoryValue)?.seed : undefined;

  const effectiveType = categoryValue === "other" ? customType : (PRACTICE_CATEGORIES.find((c) => c.value === categoryValue)?.label ?? "");
  const save = async () => {
    const ok = await onSave({
      name: name.trim(), practice_type: effectiveType.trim(),
      practice_description: description.trim(), jurisdiction: jurisdiction.trim(),
    });
    if (ok) setEdit(false);
  };

  return (
    <>
    <SectionCard
      title="Organization"
      subtitle="Your firm's information — the same details you set during onboarding, editable anytime."
      action={current && !edit ? <EditButton onClick={startEdit} /> : undefined}
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!current ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : !edit ? (
        <div className="flex flex-col gap-4">
          <DisplayField label="Organization / firm name" value={current.name} />
          <DisplayField label="Practice type" value={current.practice_type} />
          <DisplayField label="Practice / company description" value={current.practice_description} />
          <DisplayField label="Jurisdiction" value={current.jurisdiction} />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-name">Organization / firm name</Label>
            <Input id="org-name" placeholder="e.g. Smith & Associates" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Practice type</Label>
            <div className="flex flex-wrap gap-2">
              {PRACTICE_CATEGORIES.map((category) => (
                <button
                  type="button"
                  key={category.value}
                  aria-pressed={categoryValue === category.value}
                  onClick={() => selectCategory(category.value)}
                  className={cn(
                    "rounded-lg border-2 px-3 py-1.5 text-left text-sm font-medium transition-colors",
                    categoryValue === category.value
                      ? "border-accent bg-accent/[0.08] text-accent"
                      : "border-border bg-muted/40 hover:bg-muted/70"
                  )}
                >
                  {category.label}
                </button>
              ))}
            </div>
            {categoryValue === "other" && (
              <Input placeholder="e.g. Bookkeeping" value={customType} onChange={(e) => setCustomType(e.target.value)} />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-description">Practice / company description</Label>
            <Textarea id="org-description" value={description} onChange={(e) => setDescription(e.target.value)} />
            <p className="text-xs text-muted-foreground">Drives how the AI describes your firm to clients in every email it writes.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="org-jurisdiction">Jurisdiction</Label>
            <Input id="org-jurisdiction" placeholder="e.g. Ontario, Canada" value={jurisdiction} onChange={(e) => setJurisdiction(e.target.value)} />
            <p className="text-xs text-muted-foreground">Which government/regulatory sources the AI should treat as authoritative.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={save}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Saving…" : "Save organization"}
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEdit(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </SectionCard>

    <Dialog open={pendingCategoryValue !== null} onOpenChange={(open) => !open && setPendingCategoryValue(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change organization type?</DialogTitle>
          <DialogDescription>
            Changing your organization type will change how Compozor understands your business and may affect your AI experience.
            {pendingSeed
              ? " Your practice description will also be updated to the default for the new organization type, which you can edit afterward."
              : ""}
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
            Yes, change organization type
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

function EmailSignOffSection({
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

  const startEdit = () => {
    setSignature(current?.email_signature ?? "");
    setEdit(true);
  };

  const save = async () => {
    if (await onSave(signature)) setEdit(false);
  };

  return (
    <SectionCard
      title="Email sign-off"
      subtitle="Exactly what appears at the bottom of every email Compozor sends — the AI never writes its own closing; this is what's deterministically appended instead."
      action={current && !edit ? <EditButton onClick={startEdit} /> : undefined}
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!current ? (
        <Skeleton className="h-32 w-full" />
      ) : !edit ? (
        <div className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-foreground/80">
          {resolved}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Textarea
            rows={5}
            placeholder={`Best regards,\n\n${fallbackName}`}
            value={signature}
            onChange={(e) => setSignature(e.target.value)}
          />
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Preview</span>
            <div className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 p-3 text-sm text-foreground/80">
              {preview}
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={saving} onClick={save}>
              {saving && <Loader2 className="animate-spin" />}
              {saving ? "Saving…" : "Save sign-off"}
            </Button>
            <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEdit(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </SectionCard>
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
          aria-label="Remind after, in days"
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
  const missingProviders = connections === null ? [] : (["gmail", "outlook"] as const).filter(
    (provider) => !connections.some((connection) => (connection.provider ?? "gmail") === provider)
  );

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
                {conn.provider === "outlook" ? <OutlookIcon className="size-5 shrink-0 text-foreground" /> : <GmailIcon className="size-5 shrink-0" />}
                <span className="break-all text-sm font-medium">{conn.email_address}</span>
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
              <div className="flex items-center gap-4">
                {conn.status === "needs_reauth" && (
                  <Button variant="ghost" size="sm" disabled={connecting} onClick={() => onConnect(conn.provider ?? "gmail")}>
                    {connecting ? "Redirecting…" : "Reconnect"}
                  </Button>
                )}
              <button
                onClick={() => onDelete(conn.id)}
                disabled={deletingId === conn.id}
                className="text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline disabled:opacity-50"
              >
                {deletingId === conn.id ? "Removing…" : "Disconnect"}
              </button>
              </div>
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
      {missingProviders.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {missingProviders.map((provider) => (
            <Button key={provider} variant="outline" onClick={() => onConnect(provider)} disabled={connecting}>
              {provider === "gmail" ? <GmailIcon className="size-4" /> : <OutlookIcon className="size-4" />}
              {connecting ? "Redirecting…" : `Connect ${provider === "gmail" ? "Gmail" : "Outlook"}`}
            </Button>
          ))}
        </div>
      )}
      {missingProviders.includes("outlook") && <p className="text-xs text-muted-foreground">Outlook supports Microsoft 365 work accounts and personal Outlook or Hotmail accounts.</p>}
    </SectionCard>
  );
}

const legalLinks = [
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms & Conditions" },
  { href: "/cookies", label: "Cookie Policy" },
];

function LegalLinksSection() {
  return (
    <SectionCard title="Legal">
      <div className="flex flex-col gap-1">
        {legalLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="w-fit text-sm text-foreground/80 underline underline-offset-2 hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </div>
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
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingOrganization, setSavingOrganization] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
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

  const onSaveProfile = async (fields: { contact_name: string; phone: string }) => {
    setSavingProfile(true);
    setOrgError(null);
    try {
      const updated = await updateMyOrganization(fields);
      mutateOrg(updated, { revalidate: false });
      return true;
    } catch (e) {
      setOrgError(e instanceof ApiError ? e.message : String(e));
      return false;
    } finally {
      setSavingProfile(false);
    }
  };

  const onSaveOrganization = async (fields: {
    name: string; practice_type: string; practice_description: string; jurisdiction: string;
  }) => {
    setSavingOrganization(true);
    setOrgError(null);
    try {
      const updated = await updateMyOrganization(fields);
      mutateOrg(updated, { revalidate: false });
      return true;
    } catch (e) {
      setOrgError(e instanceof ApiError ? e.message : String(e));
      return false;
    } finally {
      setSavingOrganization(false);
    }
  };

  const onSaveSignature = async (signature: string) => {
    setSavingSignature(true);
    setOrgError(null);
    try {
      const updated = await updateMyOrganization({ email_signature: signature });
      mutateOrg(updated, { revalidate: false });
      return true;
    } catch (e) {
      setOrgError(e instanceof ApiError ? e.message : String(e));
      return false;
    } finally {
      setSavingSignature(false);
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
          Your profile, organization details, email sign-off, automation, reminders, and mailbox connections.
        </p>
      </div>

      <div className="flex w-full flex-col gap-6">
        <YourProfileSection
          key={`profile-${org?.id ?? "loading"}`}
          current={org ?? null}
          error={orgErrorMessage}
          saving={savingProfile}
          onSave={onSaveProfile}
        />

        <OrganizationSection
          key={`org-${org?.id ?? "loading"}`}
          current={org ?? null}
          error={orgErrorMessage}
          saving={savingOrganization}
          onSave={onSaveOrganization}
        />

        <EmailSignOffSection
          key={`signature-${org?.id ?? "loading"}`}
          current={org ?? null}
          error={orgErrorMessage}
          saving={savingSignature}
          onSave={onSaveSignature}
        />

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

        <LegalLinksSection />
      </div>
    </div>
  );
}
