import { MarketingActions } from "@/components/marketing-actions";
import { LandingWorkspacePreview } from "@/components/landing-workspace-preview";

export function LandingHero() {
  return (
    <section className="w-full pt-28 pb-12 sm:pt-44 sm:pb-20">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-6 px-6 sm:gap-8 sm:px-10 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
        <div>
          <p className="mb-5 flex items-center gap-2 text-[0.6875rem] sm:mb-6 sm:gap-3 sm:text-xs uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
            <span className="h-px w-5 shrink-0 sm:w-7 bg-accent" aria-hidden />
            AI agents for professional firms
          </p>
          <h1 className="text-5xl leading-[1.06] font-thin tracking-tight sm:text-7xl xl:text-[5.25rem] [font-family:var(--font-denton)]">
            Less chasing.
            <br />
            <span className="text-marketing-forest dark:text-marketing-brass">
              More work delivered.
            </span>
          </h1>
        </div>
        <div className="max-w-md lg:pb-1">
          <p className="text-base leading-relaxed text-pretty text-foreground/90 sm:text-lg">
            Compozor’s AI agents handle the client back-and-forth, check
            documents against your requirements, and run your workflows to
            prepare work in your firm’s format.
          </p>
          <MarketingActions className="mt-6 sm:mt-7" />
          <p className="mt-4 text-xs text-muted-foreground">
            Review replies or enable automatic follow-through. Early access.
          </p>
          <a
            href="#how-it-works"
            className="mt-4 inline-flex min-h-11 sm:mt-6 rounded-sm py-1 text-sm underline decoration-accent underline-offset-4 transition-colors hover:text-marketing-forest focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring dark:hover:text-marketing-brass"
          >
            See the agent follow through
          </a>
        </div>
      </div>
      <LandingWorkspacePreview />
    </section>
  );
}
