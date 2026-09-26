"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Check, Loader2 } from "lucide-react";
import { GmailIcon } from "@/components/icons/gmail";
import { OutlookIcon } from "@/components/icons/outlook";
import {
  ApiError,
  AutomationLevel,
  InboxConnection,
  Organization,
  getGmailConnectUrl,
  getOutlookConnectUrl,
  getMyOrganization,
  listInboxConnections,
  updateMyOrganization,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { extractPhoneDigits, formatPhoneDisplay, isValidPhoneDigits } from "@/lib/phone";
import { PRACTICE_CATEGORIES } from "@/lib/practice-types";
import { AuroraBackground } from "@/components/aurora-background";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { mailboxResult, withoutMailboxResult } from "@/lib/onboarding";
import { startProductTour } from "@/components/product-tour";

// Same names as Settings, so the choice made here is recognisable later.
const automationOptions: { value: AutomationLevel; label: string; description: string; recommended?: boolean }[] = [
  {
    value: "no_automation",
    label: "No automation",
    description: "Every drafted email waits for someone to press send.",
    recommended: true,
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

type Step = "practice" | "gmail" | "automation";

// What each step asks for and what it makes possible, shown beside the form.
const STEPS: { key: Step; label: string; title: string; body: string; outcome: string }[] = [
  {
    key: "practice",
    label: "Your firm",
    title: "Tell us about your firm.",
    body: "Compozor writes to your clients on your behalf. These details shape how it introduces your firm and which rules it treats as authoritative.",
    outcome: "Emails that sound like your firm",
  },
  {
    key: "gmail",
    label: "Mailbox",
    title: "Connect the mailbox your clients write to.",
    body: "Client replies and documents arrive here. One sign-in covers mail and calendar, so Compozor can also propose meeting times.",
    outcome: "Replies and documents collected for you",
  },
  {
    key: "automation",
    label: "Automation",
    title: "Decide how much Compozor sends on its own.",
    body: "Start by reviewing every draft. Once you trust them, raise the level in Settings at any time.",
    outcome: "Follow-ups sent the way you prefer",
  },
];

function StepList({ step }: { step: Step }) {
  const activeIndex = STEPS.findIndex((s) => s.key === step);
  return (
    <ol className="flex flex-col">
      {STEPS.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={s.key} className="relative flex gap-4 pb-6 last:pb-0">
            {i < STEPS.length - 1 && (
              <span aria-hidden className="absolute top-7 bottom-1 left-3 w-px bg-border" />
            )}
            <span
              className={cn(
                "relative flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums transition-colors",
                done
                  ? "bg-foreground text-background"
                  : active
                    ? "bg-card text-foreground ring-1 ring-foreground"
                    : "bg-card text-muted-foreground ring-1 ring-border"
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <div className="flex flex-col gap-0.5 pt-0.5">
              <span className={cn("text-sm", active ? "font-medium text-foreground" : done ? "text-foreground" : "text-muted-foreground")}>
                {s.label}
              </span>
              <span className="text-xs text-muted-foreground">{s.outcome}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// A labelled group of fields inside the form, separated by hairlines.
function FieldGroup({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-5 border-t border-border/60 pt-6 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <legend className="text-[0.6875rem] tracking-wider text-muted-foreground uppercase">{title}</legend>
        {note && <p className="text-xs text-pretty text-muted-foreground">{note}</p>}
      </div>
      {children}
    </fieldset>
  );
}

function Optional() {
  return <span className="ml-1.5 font-normal text-muted-foreground">Optional</span>;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useUser();
  const [org, setOrg] = useState<Organization | null>(null);
  const [connections, setConnections] = useState<InboxConnection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [category, setCategory] = useState<string | null>(null);
  const [customPracticeType, setCustomPracticeType] = useState("");
  const [name, setName] = useState("");
  const nameTouched = useRef(false);
  // The person filling this out, not the firm - separate field so a firm
  // with several employees (each their own Compozor account/instance, once
  // that exists) can each carry their own name against the same org,
  // rather than this doubling as the firm's own identity.
  const [contactName, setContactName] = useState<string | null>(null);
  const resolvedContactName = contactName ?? org?.contact_name ?? user?.fullName ?? "";
  const [phoneDigits, setPhoneDigits] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [practiceDescription, setPracticeDescription] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [savingPractice, setSavingPractice] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);

  const [connecting, setConnecting] = useState(false);
  const [callbackResult] = useState(() => typeof window === "undefined" ? null : mailboxResult(window.location.search));
  const [gmailError, setGmailError] = useState<string | null>(callbackResult?.error ?? null);

  const [automationLevel, setAutomationLevel] =
    useState<AutomationLevel>("no_automation");
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const load = () => {
    Promise.all([getMyOrganization(), listInboxConnections()])
      .then(([nextOrg, nextConnections]) => {
        setLoadError(null);
        setOrg(nextOrg);
        setAutomationLevel(nextOrg.automation_level);
        setConnections(nextConnections);
        setName((prev) => (nameTouched.current || prev ? prev : nextOrg.name));
        setPhoneDigits((prev) => (prev ? prev : nextOrg.phone ?? ""));
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(load, []);

  useEffect(() => {
    if (callbackResult) {
      window.history.replaceState({}, "", window.location.pathname + withoutMailboxResult(window.location.search) + window.location.hash);
    }
  }, [callbackResult]);

  const step: Step | null = !org
    ? null
    : !org.practice_description
      ? "practice"
      : !connections || connections.every((c) => c.status !== "active")
        ? "gmail"
        : "automation";

  const onSelectCategory = (value: string) => {
    setCategory(value);
    const seed = PRACTICE_CATEGORIES.find((c) => c.value === value)?.seed ?? "";
    setPracticeDescription(seed);
  };

  const onPhoneChange = (raw: string) => {
    setPhoneDigits(extractPhoneDigits(raw));
    setPhoneError(null);
  };

  const onSubmitPractice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) {
      setPracticeError("Pick what kind of practice this is.");
      return;
    }
    const practiceType =
      category === "other" ? customPracticeType.trim() : (PRACTICE_CATEGORIES.find((c) => c.value === category)?.label ?? "");
    if (!practiceType) {
      setPracticeError("Enter your practice type.");
      return;
    }
    if (phoneDigits && !isValidPhoneDigits(phoneDigits)) {
      setPhoneError("Enter a valid 10-digit phone number.");
      return;
    }
    setSavingPractice(true);
    setPracticeError(null);
    try {
      const updated = await updateMyOrganization({
        name: name.trim(),
        contact_name: resolvedContactName.trim(),
        phone: phoneDigits,
        practice_type: practiceType,
        practice_description: practiceDescription.trim(),
        jurisdiction: jurisdiction.trim(),
      });
      setOrg(updated);
    } catch (e) {
      setPracticeError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSavingPractice(false);
    }
  };

  const onConnectMailbox = async (provider: "gmail" | "outlook") => {
    setConnecting(true);
    setGmailError(null);
    try {
      const { authorization_url } = await (provider === "outlook" ? getOutlookConnectUrl() : getGmailConnectUrl());
      window.location.assign(authorization_url);
    } catch (e) {
      setGmailError(e instanceof ApiError ? e.message : String(e));
      setConnecting(false);
    }
  };

  const onFinish = async () => {
    setFinishing(true);
    setFinishError(null);
    try {
      await updateMyOrganization({
        automation_level: automationLevel,
        onboarding_completed: true,
      });
      if (user) startProductTour(user.id);
      router.replace("/clients");
    } catch (e) {
      setFinishError(e instanceof ApiError ? e.message : String(e));
      setFinishing(false);
    }
  };

  const stepIndex = step ? STEPS.findIndex((s) => s.key === step) : 0;
  const meta = STEPS[stepIndex];

  return (
    <div className="fixed inset-0 isolate overflow-y-auto bg-background">
      <AuroraBackground />
      <div className="relative mx-auto flex min-h-full w-full max-w-6xl flex-col px-6 py-8 sm:px-10 sm:py-10">
        <header className="flex items-center justify-between gap-4">
          <Image src="/compozor-wordmark.png" alt="Compozor" width={789} height={140} priority className="h-5.5 w-auto" />
          {step && (
            <span className="text-xs text-muted-foreground tabular-nums">
              Step {stepIndex + 1} of {STEPS.length}
            </span>
          )}
        </header>

        <div className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-10 lg:content-center py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)] lg:gap-20">
          {/* Context: where you are, why it matters, what's next. */}
          <section className="flex flex-col gap-8 lg:sticky lg:top-10 lg:self-start lg:pt-4">
            <div className="flex flex-col gap-5">
              <p className="flex items-center gap-3 text-[0.6875rem] tracking-widest text-muted-foreground uppercase">
                <span aria-hidden className="h-px w-7 bg-accent" />
                Setup
              </p>
              {step ? (
                <h1
                  key={meta.key}
                  className="animate-blur-in-sm text-[2.5rem] leading-[1.05] font-thin tracking-tight text-balance [font-family:var(--font-denton)] sm:text-5xl lg:text-[3.5rem]"
                >
                  {meta.title}
                </h1>
              ) : (
                <Skeleton className="h-24 w-full max-w-md" />
              )}
              {step && <p className="max-w-md text-[0.9375rem] leading-relaxed text-pretty text-foreground/80">{meta.body}</p>}
            </div>
            {step && (
              <div className="hidden lg:block">
                <StepList step={step} />
              </div>
            )}
            {step && (
              <div className="flex gap-1.5 lg:hidden" aria-hidden>
                {STEPS.map((s, i) => (
                  <span key={s.key} className={cn("h-0.5 flex-1 rounded-full", i <= stepIndex ? "bg-foreground" : "bg-border")} />
                ))}
              </div>
            )}
          </section>

          <section className="flex min-w-0 flex-col gap-4">
            {loadError && (
              <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
                <p role="alert" className="text-sm text-destructive">{loadError}</p>
                <Button variant="outline" onClick={load}>Try again</Button>
              </div>
            )}
            {gmailError && <p role="alert" className="text-sm text-destructive">{gmailError}</p>}
            {callbackResult?.success && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="size-3.5 text-success" />
                {callbackResult.success}
              </p>
            )}

            {!step ? (
              !loadError && <Skeleton className="h-[28rem] w-full rounded-xl" />
            ) : step === "practice" ? (
              <form
                onSubmit={onSubmitPractice}
                className="flex animate-blur-in-sm flex-col gap-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8"
              >
                <FieldGroup title="You" note="Your own details, separate from the firm.">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="contact-name">Your name</Label>
                      <Input
                        id="contact-name"
                        required
                        placeholder="Jane Doe"
                        value={resolvedContactName}
                        onChange={(e) => setContactName(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="contact-phone">
                        Phone number
                        <Optional />
                      </Label>
                      <Input
                        id="contact-phone"
                        type="tel"
                        placeholder="(416) 000-1234"
                        value={phoneDigits.length > 10 ? phoneDigits : formatPhoneDisplay(phoneDigits)}
                        onChange={(e) => onPhoneChange(e.target.value)}
                        aria-invalid={Boolean(phoneError)}
                      />
                      {phoneError && <p className="text-sm text-destructive">{phoneError}</p>}
                    </div>
                  </div>
                </FieldGroup>

                <FieldGroup title="Your firm">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="firm-name">Firm name</Label>
                    <Input
                      id="firm-name"
                      required
                      placeholder="Doe & Associates"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        nameTouched.current = true;
                      }}
                    />
                    <p className="text-xs text-muted-foreground">Used when emails sign off on the firm&apos;s behalf.</p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <Label id="practice-type-label">Practice type</Label>
                    <div role="group" aria-labelledby="practice-type-label" className="flex flex-wrap gap-1.5">
                      {PRACTICE_CATEGORIES.map((c) => {
                        const active = category === c.value;
                        return (
                          <button
                            type="button"
                            key={c.value}
                            aria-pressed={active}
                            onClick={() => onSelectCategory(c.value)}
                            className={cn(
                              "inline-flex h-9 items-center rounded-lg border px-3.5 text-[0.8125rem] transition-colors",
                              active
                                ? "border-foreground bg-foreground text-background"
                                : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                    {category === "other" && (
                      <Input
                        autoFocus
                        required
                        aria-label="Practice type"
                        placeholder="Bookkeeping"
                        value={customPracticeType}
                        onChange={(e) => setCustomPracticeType(e.target.value)}
                      />
                    )}
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="practice-description">Describe your practice</Label>
                    <Textarea
                      id="practice-description"
                      required
                      rows={4}
                      placeholder="An immigration law firm helping clients gather PR application documents."
                      value={practiceDescription}
                      onChange={(e) => setPracticeDescription(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      How Compozor introduces your firm in every email. Picking a practice type fills in a starting point.
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="jurisdiction">Jurisdiction</Label>
                    <Input
                      id="jurisdiction"
                      required
                      placeholder="Ontario, Canada"
                      value={jurisdiction}
                      onChange={(e) => setJurisdiction(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Which government and regulatory sources Compozor treats as authoritative.
                    </p>
                  </div>
                </FieldGroup>

                {practiceError && <p className="text-sm text-destructive">{practiceError}</p>}

                <div className="flex justify-end border-t border-border/60 pt-5">
                  <Button type="submit" disabled={savingPractice}>
                    {savingPractice && <Loader2 className="animate-spin" />}
                    {savingPractice ? "Saving…" : "Continue"}
                  </Button>
                </div>
              </form>
            ) : step === "gmail" ? (
              <div className="flex animate-blur-in-sm flex-col gap-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
                <FieldGroup title="Choose your provider">
                  <ul className="flex flex-col divide-y divide-border/60 rounded-lg ring-1 ring-foreground/10">
                    {(
                      [
                        { provider: "gmail", name: "Google", detail: "Gmail and Google Workspace", Icon: GmailIcon },
                        { provider: "outlook", name: "Microsoft", detail: "Microsoft 365, Outlook and Hotmail", Icon: OutlookIcon },
                      ] as const
                    ).map(({ provider, name: providerName, detail, Icon }) => (
                      <li key={provider} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4">
                        <Icon className="size-5 shrink-0" />
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm font-medium">{providerName}</span>
                          <span className="text-xs text-muted-foreground">{detail}</span>
                        </div>
                        <Button
                          variant={provider === "gmail" ? "default" : "outline"}
                          disabled={connecting}
                          onClick={() => onConnectMailbox(provider)}
                        >
                          {connecting ? "Redirecting…" : "Connect"}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </FieldGroup>

                <FieldGroup title="What Compozor does with it">
                  <ul className="flex flex-col gap-2.5 text-sm text-foreground/85">
                    {[
                      "Reads replies from your clients and files their attachments.",
                      "Drafts responses, and sends only what your automation level allows.",
                      "Checks your calendar to suggest open meeting times.",
                    ].map((line) => (
                      <li key={line} className="flex gap-2.5">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        {line}
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    You&apos;ll be sent to your provider to sign in, then brought back here.
                  </p>
                </FieldGroup>
              </div>
            ) : (
              <div className="flex animate-blur-in-sm flex-col gap-6 rounded-xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
                <FieldGroup title="Sending drafted emails" note="Reminders, receipts, follow-ups on wrong documents, and answers to client questions.">
                  <div
                    role="radiogroup"
                    aria-label="Automation level"
                    className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-lg ring-1 ring-foreground/10"
                  >
                    {automationOptions.map((opt) => {
                      const selected = automationLevel === opt.value;
                      return (
                        <label
                          key={opt.value}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 px-4 py-3.5 transition-colors",
                            selected ? "bg-muted/50" : "hover:bg-muted/30"
                          )}
                        >
                          <input
                            type="radio"
                            name="automation_level"
                            className="sr-only"
                            checked={selected}
                            onChange={() => setAutomationLevel(opt.value)}
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
                            <span className="flex flex-wrap items-baseline gap-2">
                              <span className="text-sm font-medium">{opt.label}</span>
                              {opt.recommended && <span className="text-xs text-muted-foreground">Recommended to start</span>}
                            </span>
                            <span className="text-xs text-muted-foreground">{opt.description}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </FieldGroup>

                {finishError && <p className="text-sm text-destructive">{finishError}</p>}

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5">
                  <span className="text-xs text-muted-foreground">You can change this anytime in Settings.</span>
                  <Button onClick={onFinish} disabled={finishing}>
                    {finishing && <Loader2 className="animate-spin" />}
                    {finishing ? "Finishing up…" : "Finish setup"}
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
