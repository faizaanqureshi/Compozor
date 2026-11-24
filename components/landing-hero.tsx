import { MarketingActions } from "@/components/marketing-actions";
import { LandingWorkspacePreview } from "@/components/landing-workspace-preview";

export function LandingHero() {
  return (
    <section className="w-full pt-24 pb-12 sm:pt-44 sm:pb-20">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-6 px-6 sm:gap-8 sm:px-10 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
        <div>
          <p className="mb-6 flex items-center gap-2 text-[0.6875rem] sm:mb-6 sm:gap-3 sm:text-xs uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
            <span className="h-px w-5 shrink-0 sm:w-7 bg-accent" aria-hidden />
            An AI employee for your firm
          </p>
          <h1 className="text-[3.25rem] leading-[1.02] font-light tracking-tight text-balance sm:text-7xl sm:leading-[1.06] xl:text-[5.25rem] [font-family:var(--font-display)]">
            Set it up once.
            <br />
            <span className="text-marketing-forest dark:text-marketing-brass">
              It follows through.
            </span>
          </h1>
        </div>
        <div className="mt-1 max-w-md sm:mt-0 lg:pb-1">
          <p className="text-lg leading-relaxed text-pretty text-foreground/90">
            Compozor requests documents from your clients, checks them, chases
            what’s missing and prepares the first draft of the work, then does
            it all again next period. Your team reviews and approves.
          </p>
          <p className="mt-4 text-base leading-relaxed text-pretty text-foreground/90">
            Replies go out from your own Gmail or Outlook. Your clients don’t
            need an account or an app.
          </p>
          <MarketingActions primaryOnly className="mt-7" />
          <p className="mt-4 hidden text-xs text-muted-foreground sm:block">
            14-day free trial, no card needed. You choose what runs on its own.
          </p>
          <a
            href="#how-it-works"
            className="mt-6 hidden min-h-11 sm:inline-flex rounded-sm py-1 text-sm underline decoration-accent underline-offset-4 transition-colors hover:text-marketing-forest focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring dark:hover:text-marketing-brass"
          >
            See how it works
          </a>
        </div>
      </div>
      <LandingWorkspacePreview />
    </section>
  );
}
