import {
  ClockIcon,
  MailWarningIcon,
  ShieldCheckIcon,
  UsersIcon,
} from "lucide-react";

const builtFor = [
  {
    icon: UsersIcon,
    label: "Firms with 50+ active clients",
  },
  {
    icon: ClockIcon,
    label: "The tax-season email crunch",
  },
  {
    icon: MailWarningIcon,
    label: "Manual document chasing",
  },
];

export function LandingProof() {
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:gap-12 sm:px-6 sm:py-16 md:gap-16 md:py-24">
      <div className="flex flex-col items-center gap-4 border-t border-border pt-8 text-center sm:pt-12 md:pt-16">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheckIcon className="size-4 text-accent" />
          Built by engineers who've shipped compliance systems for SBA banks
        </div>
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {builtFor.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Icon className="size-4 text-muted-foreground/60" />
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 border-l-2 border-accent/40 pl-6">
        <span className="text-sm font-medium text-muted-foreground">
          Why I built this
        </span>
        <p className="text-lg text-foreground/90 text-pretty">
          I built this after watching accountants lose entire afternoons
          every week to the same email dance: chasing a client for last
          year's T4, matching a stray attachment to the right file, drafting
          the same “thanks, got it” reply for the hundredth time. None of
          that work requires a person — it just requires someone to notice
          it needs doing. So we built a system that notices.
        </p>
        <span className="text-sm text-muted-foreground">— Founder</span>
      </div>
    </section>
  );
}
