"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { GmailIcon } from "@/components/icons/gmail";
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
import { AuroraBackground } from "@/components/aurora-background";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { startProductTour } from "@/components/product-tour";

type Category = {
  value: string;
  label: string;
  seed: string;
};

const categories: Category[] = [
  {
    value: "accounting",
    label: "Accounting",
    seed: "an accounting firm helping clients gather tax documents",
  },
  {
    value: "immigration",
    label: "Immigration law",
    seed:
      "an immigration law firm helping clients gather PR application documents",
  },
  {
    value: "mortgage",
    label: "Mortgage / lending",
    seed: "a mortgage brokerage helping clients gather loan application documents",
  },
  {
    value: "other",
    label: "Other",
    seed: "",
  },
];

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

type Step = "practice" | "gmail" | "automation";

function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "practice", label: "Your firm" },
    { key: "gmail", label: "Connect mailbox" },
    { key: "automation", label: "Automation" },
  ];
  const activeIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center gap-3">
      {steps.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <div key={s.key} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-medium transition-colors",
                  done
                    ? "border-accent bg-accent text-accent-foreground"
                    : active
                      ? "border-accent text-accent"
                      : "border-border text-muted-foreground"
                )}
              >
                {done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-xs font-medium",
                  active || done ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span className="h-px w-8 shrink-0 bg-border/60" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [org, setOrg] = useState<Organization | null>(null);
  const [connections, setConnections] = useState<InboxConnection[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [category, setCategory] = useState<string | null>(null);
  const [name, setName] = useState("");
  const nameTouched = useRef(false);
  const [practiceDescription, setPracticeDescription] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [savingPractice, setSavingPractice] = useState(false);
  const [practiceError, setPracticeError] = useState<string | null>(null);

  const [connecting, setConnecting] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);

  const [automationLevel, setAutomationLevel] =
    useState<AutomationLevel>("no_automation");
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const load = () => {
    Promise.all([getMyOrganization(), listInboxConnections()])
      .then(([nextOrg, nextConnections]) => {
        setOrg(nextOrg);
        setConnections(nextConnections);
        setName((prev) => (nameTouched.current || prev ? prev : nextOrg.name));
      })
      .catch((e) => setLoadError(e instanceof ApiError ? e.message : String(e)));
  };

  useEffect(load, []);

  const step: Step | null = !org
    ? null
    : !org.practice_description
      ? "practice"
      : !connections || connections.every((c) => c.status !== "active")
        ? "gmail"
        : "automation";

  const onSelectCategory = (value: string) => {
    setCategory(value);
    const seed = categories.find((c) => c.value === value)?.seed ?? "";
    setPracticeDescription(seed);
  };

  const onSubmitPractice = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPractice(true);
    setPracticeError(null);
    try {
      const updated = await updateMyOrganization({
        name: name.trim(),
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
      window.location.href = authorization_url;
    } catch (e) {
      setGmailError(e instanceof ApiError ? e.message : String(e));
      setConnecting(false);
    }
  };

  const onFinish = async () => {
    setFinishing(true);
    setFinishError(null);
    try {
      await updateMyOrganization({ automation_level: automationLevel });
      // Deliberately not marking onboarding complete yet - that only happens
      // once the guided product tour finishes (see ProductTour.onFinish),
      // so a user who bails mid-tour lands back in the wizard, then the
      // tour, rather than skipping straight into the app.
      startProductTour();
      router.replace("/clients");
    } catch (e) {
      setFinishError(e instanceof ApiError ? e.message : String(e));
      setFinishing(false);
    }
  };

  return (
    <div className="fixed inset-0 isolate overflow-y-auto bg-background">
      <AuroraBackground />
      <div className="relative mx-auto flex min-h-full w-full max-w-xl flex-col justify-center gap-8 px-6 py-16">
        <div className="flex flex-col gap-3">
          <h1 className="text-5xl font-thin tracking-tight [font-family:var(--font-denton)]">
            Let&apos;s set things up
          </h1>
          <p className="text-sm text-muted-foreground">
            A few quick steps before you get to your clients.
          </p>
        </div>

        {loadError && <p className="text-sm text-destructive">{loadError}</p>}

        {!step ? (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <StepIndicator step={step} />

            {step === "practice" && (
              <form
                onSubmit={onSubmitPractice}
                className="flex animate-blur-in-sm flex-col gap-6 rounded-2xl bg-card p-6 ring-1 ring-foreground/10"
              >
                <div className="flex flex-col gap-1.5 border-b border-border/70 pb-6">
                  <Label htmlFor="firm-name">Firm name</Label>
                  <Input
                    id="firm-name"
                    required
                    placeholder="e.g. Doe & Associates"
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      nameTouched.current = true;
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Used as the firm&apos;s sign-off name in every AI-drafted
                    email.
                  </p>
                </div>

                <div className="flex flex-col gap-2 border-b border-border/70 pb-6">
                  <Label>What kind of practice is this?</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {categories.map((c) => (
                      <button
                        type="button"
                        key={c.value}
                        onClick={() => onSelectCategory(c.value)}
                        className={cn(
                          "rounded-lg border-2 px-3 py-2 text-left text-sm font-medium transition-colors",
                          category === c.value
                            ? "border-accent bg-accent/[0.08] text-accent"
                            : "border-border bg-muted/40 hover:bg-muted/70"
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 border-b border-border/70 pb-6">
                  <Label htmlFor="practice-description">
                    Describe your practice
                  </Label>
                  <Textarea
                    id="practice-description"
                    required
                    placeholder="e.g. an immigration law firm helping clients gather PR application documents"
                    value={practiceDescription}
                    onChange={(e) => setPracticeDescription(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    This drives how the AI describes your firm to clients in every
                    email it writes. Edit the sentence above however you like.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="jurisdiction">Jurisdiction</Label>
                  <Input
                    id="jurisdiction"
                    required
                    placeholder="e.g. Canada"
                    value={jurisdiction}
                    onChange={(e) => setJurisdiction(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Which government/regulatory sources the AI should treat as
                    authoritative when it looks things up for clients.
                  </p>
                </div>

                {practiceError && (
                  <p className="text-sm text-destructive">{practiceError}</p>
                )}

                <Button type="submit" disabled={savingPractice} className="self-end">
                  {savingPractice ? "Saving…" : "Continue"}
                </Button>
              </form>
            )}

            {step === "gmail" && (
              <div className="flex animate-blur-in-sm flex-col gap-5 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
                <div className="flex flex-col gap-2 border-b border-border/70 pb-5">
                  <Label>Connect your mailbox</Label>
                  <p className="text-sm text-muted-foreground">
                    Client replies and documents come in through this mailbox.
                    Without it connected, the inbox pipeline has nothing to watch.
                  </p>
                </div>

                {gmailError && (
                  <p className="text-sm text-destructive">{gmailError}</p>
                )}

                <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-6">
                  <p className="text-sm text-muted-foreground">
                    No mailbox connected yet.
                  </p>
                  <Button onClick={() => onConnectMailbox("gmail")} disabled={connecting}>
                    <GmailIcon className="size-4" />
                    {connecting ? "Redirecting…" : "Connect Gmail"}
                  </Button>
                  <Button variant="outline" onClick={() => onConnectMailbox("outlook")} disabled={connecting}>
                    {connecting ? "Redirecting…" : "Connect Outlook"}
                  </Button>
                </div>
              </div>
            )}

            {step === "automation" && (
              <div className="flex animate-blur-in-sm flex-col gap-5 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
                <div className="flex flex-col gap-2 border-b border-border/70 pb-5">
                  <Label>Automation level</Label>
                  <p className="text-sm text-muted-foreground">
                    You haven&apos;t seen an AI-drafted email yet, so we&apos;d
                    recommend starting with no automation and revisiting this
                    from settings once you trust the drafts. This is just a
                    starting point, not a final decision.
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  {automationOptions.map((opt) => {
                    const selected = automationLevel === opt.value;
                    return (
                      <label
                        key={opt.value}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-4 rounded-lg border-2 px-4 py-3 transition-colors",
                          selected
                            ? "border-accent bg-accent/[0.08]"
                            : "border-border bg-muted/40 hover:bg-muted/70"
                        )}
                      >
                        <input
                          type="radio"
                          name="automation_level"
                          className="sr-only"
                          checked={selected}
                          onChange={() => setAutomationLevel(opt.value)}
                        />
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={cn(
                              "text-sm font-medium",
                              selected && "text-accent"
                            )}
                          >
                            {opt.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {opt.description}
                          </span>
                        </div>
                        <div
                          className={cn(
                            "flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                            selected
                              ? "border-accent bg-accent text-accent-foreground"
                              : "border-border"
                          )}
                        >
                          {selected && <Check className="size-3.5" />}
                        </div>
                      </label>
                    );
                  })}
                </div>

                {finishError && (
                  <p className="text-sm text-destructive">{finishError}</p>
                )}

                <Button onClick={onFinish} disabled={finishing} className="self-end">
                  {finishing && <Loader2 className="animate-spin" />}
                  {finishing ? "Finishing up…" : "Finish setup"}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
