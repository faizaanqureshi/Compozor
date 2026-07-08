"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangleIcon,
  BellIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  GlobeIcon,
  MailQuestionIcon,
  PaperclipIcon,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

function useCycle(phaseCount: number, tickMs: number, running: boolean) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!running) return;
    setPhase(0);
    const id = setInterval(() => {
      setPhase((p) => (p + 1) % (phaseCount + 1));
    }, tickMs);
    return () => clearInterval(id);
  }, [running, phaseCount, tickMs]);

  return phase;
}

function Reveal({
  show,
  className,
  children,
}: {
  show: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "transition-all duration-500 ease-out",
        show ? "translate-y-0 opacity-100" : "translate-y-1.5 opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}

function InboxCard({
  initials,
  name,
  email,
  timestamp,
  subjectIcon: SubjectIcon,
  subject,
  badgeShown,
  badgeLabel,
  badgeTone = "accent",
}: {
  initials: string;
  name: string;
  email: string;
  timestamp: string;
  subjectIcon: typeof PaperclipIcon;
  subject: string;
  badgeShown: boolean;
  badgeLabel: string;
  badgeTone?: "accent" | "destructive";
}) {
  return (
    <div className="rounded-xl border border-sidebar-foreground/10 bg-sidebar-foreground/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-foreground/10 text-xs font-medium text-sidebar-foreground/70">
            {initials}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-sidebar-foreground">
              {name}
            </span>
            <span className="truncate text-xs text-sidebar-foreground/45">
              {email}
            </span>
          </div>
        </div>
        <span className="shrink-0 text-xs text-sidebar-foreground/35">
          {timestamp}
        </span>
      </div>
      <div className="mt-3 flex items-center gap-1.5 text-sm text-sidebar-foreground/70">
        <SubjectIcon className="size-3.5 shrink-0 text-sidebar-foreground/40" />
        <span className="truncate">{subject}</span>
      </div>
      <Reveal show={badgeShown} className="mt-3">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            badgeTone === "accent" && "bg-accent/15 text-accent",
            badgeTone === "destructive" && "bg-destructive/15 text-destructive"
          )}
        >
          {badgeTone === "destructive" ? (
            <AlertTriangleIcon className="size-3" />
          ) : (
            <CheckIcon className="size-3" />
          )}
          {badgeLabel}
        </span>
      </Reveal>
    </div>
  );
}

function ReplyCard({
  eyebrow,
  text,
  sent,
  source,
}: {
  eyebrow: string;
  text: string;
  sent: boolean;
  source?: string;
}) {
  return (
    <div className="rounded-xl border border-sidebar-foreground/10 bg-sidebar-foreground/[0.03] p-4">
      <div className="text-[10px] font-medium tracking-wide text-sidebar-foreground/35 uppercase">
        {eyebrow}
      </div>
      <p className="mt-2 text-sm text-sidebar-foreground/80">{text}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-sidebar-foreground/40">
          {sent ? "Sent · just now" : "Sending…"}
        </span>
        {source && (
          <Reveal show={sent} className="inline-flex">
            <span className="inline-flex items-center gap-1 rounded-full border border-sidebar-foreground/15 px-2 py-0.5 font-mono text-[11px] text-sidebar-foreground/50">
              <GlobeIcon className="size-3" />
              {source}
            </span>
          </Reveal>
        )}
      </div>
    </div>
  );
}

function DocumentDemo({ running }: { running: boolean }) {
  const phase = useCycle(4, 1750, running);

  return (
    <div className="flex flex-col gap-3">
      <InboxCard
        initials="AC"
        name="Acme Co."
        email="client@acme.co"
        timestamp="2m ago"
        subjectIcon={PaperclipIcon}
        subject="January bank statement attached"
        badgeShown={phase >= 1}
        badgeLabel={
          phase >= 2
            ? "Verified genuine · matched to Jan 2026 statement"
            : "Verifying authenticity…"
        }
      />

      <Reveal show={phase >= 3}>
        <ReplyCard
          eyebrow="Reply"
          text="“Thanks! We've received and verified your January statement.”"
          sent={phase >= 4}
        />
      </Reveal>

      <Reveal show={phase >= 4}>
        <div className="flex items-center gap-3 rounded-xl border border-sidebar-foreground/10 bg-sidebar-foreground/[0.03] p-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-foreground/10 text-sidebar-foreground/70">
            <FileTextIcon className="size-4" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium text-sidebar-foreground">
              Bank_Statement_Jan.pdf
            </span>
            <span className="truncate font-mono text-xs text-sidebar-foreground/40">
              Clients / Acme Co. / 2026 / Jan
            </span>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent">
            <CheckIcon className="size-3.5" />
            Filed
          </span>
        </div>
      </Reveal>
    </div>
  );
}

function QuestionDemo({ running }: { running: boolean }) {
  const phase = useCycle(3, 1750, running);

  return (
    <div className="flex flex-col gap-3">
      <InboxCard
        initials="JS"
        name="Jamie Sato"
        email="jamie@sato-design.com"
        timestamp="1m ago"
        subjectIcon={MailQuestionIcon}
        subject="Quick question — what is a T4?"
        badgeShown={phase >= 1}
        badgeLabel="Recognized returning client · 3 past emails"
      />

      <Reveal show={phase >= 2}>
        <ReplyCard
          eyebrow="Auto-reply"
          text="“A T4 is the tax slip your employer issues each year showing your income and deductions, per canada.ca. We'll use it to prepare your return.”"
          sent={phase >= 3}
          source="canada.ca"
        />
      </Reveal>
    </div>
  );
}

function EscalationDemo({ running }: { running: boolean }) {
  const phase = useCycle(2, 1900, running);

  return (
    <div className="flex flex-col gap-3">
      <InboxCard
        initials="RC"
        name="Riley Chen"
        email="riley@chenconsulting.ca"
        timestamp="just now"
        subjectIcon={PaperclipIcon}
        subject="GST_return_v3.pdf attached"
        badgeShown={phase >= 1}
        badgeLabel="3rd mismatched attempt for GST/HST Return Q1"
        badgeTone="destructive"
      />

      <Reveal show={phase >= 2}>
        <div className="rounded-xl border border-destructive/20 bg-destructive/[0.06] p-4">
          <div className="flex items-center gap-1.5 text-[10px] font-medium tracking-wide text-destructive uppercase">
            <AlertTriangleIcon className="size-3" />
            Needs your review
          </div>
          <p className="mt-2 text-sm text-sidebar-foreground/80">
            Wrong document submitted three times for the same request —
            flagged for a human instead of guessing again.
          </p>
        </div>
      </Reveal>
    </div>
  );
}

function TimelineRow({
  icon: Icon,
  label,
  detail,
  show,
  tone = "muted",
}: {
  icon: typeof ClockIcon;
  label: string;
  detail: string;
  show: boolean;
  tone?: "muted" | "accent";
}) {
  return (
    <Reveal show={show} className="flex items-start gap-3">
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full border",
          tone === "accent"
            ? "border-accent/40 bg-accent/15 text-accent"
            : "border-sidebar-foreground/15 text-sidebar-foreground/50"
        )}
      >
        <Icon className="size-3.5" />
      </div>
      <div className="flex flex-col gap-0.5 pt-0.5">
        <span className="text-sm font-medium text-sidebar-foreground">
          {label}
        </span>
        <span className="text-xs text-sidebar-foreground/45">{detail}</span>
      </div>
    </Reveal>
  );
}

function ReminderDemo({ running }: { running: boolean }) {
  const phase = useCycle(2, 1900, running);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-sidebar-foreground/10 bg-sidebar-foreground/[0.03] p-4">
      <TimelineRow
        icon={CheckIcon}
        label="Checklist reminder sent"
        detail="Morgan Lee · Day 0"
        show={phase >= 0}
        tone="accent"
      />
      <TimelineRow
        icon={ClockIcon}
        label="No response after 3 days"
        detail="Still missing: T2 Schedule 100"
        show={phase >= 1}
      />
      <TimelineRow
        icon={BellIcon}
        label="Follow-up sent automatically"
        detail="No one had to remember to check"
        show={phase >= 2}
        tone="accent"
      />
    </div>
  );
}

const tabs = [
  { value: "documents", label: "Documents", Component: DocumentDemo },
  { value: "questions", label: "Questions", Component: QuestionDemo },
  { value: "escalations", label: "Escalations", Component: EscalationDemo },
  { value: "reminders", label: "Reminders", Component: ReminderDemo },
] as const;

type TabValue = (typeof tabs)[number]["value"];

export function LandingDemo() {
  const [mode, setMode] = useState<TabValue>("documents");

  return (
    <div className="dark w-full max-w-xl overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl">
      <Tabs value={mode} onValueChange={(value) => setMode(value as TabValue)}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-sidebar-foreground/10 px-3 py-2.5 sm:px-5 sm:py-3">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-sidebar-foreground/20" />
            <span className="size-1.5 rounded-full bg-sidebar-foreground/20" />
            <span className="size-1.5 rounded-full bg-sidebar-foreground/20" />
            <span className="ml-2.5 hidden font-mono text-xs text-sidebar-foreground/35 sm:inline">
              app.yourfirm.com
            </span>
          </div>
          <TabsList variant="line" className="h-7 gap-2 sm:gap-3">
            {tabs.map(({ value, label }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="px-1 text-[11px] sm:text-xs"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="p-4 sm:p-6">
          {tabs.map(({ value, Component }) => (
            <TabsContent key={value} value={value}>
              <Component running={mode === value} />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
