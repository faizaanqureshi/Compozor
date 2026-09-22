import { MarketingActions } from "@/components/marketing-actions";
import { LandingWorkspacePreview } from "@/components/landing-workspace-preview";

export function LandingHero() {
  return (
    <section className="mx-auto w-full max-w-7xl px-6 pt-36 pb-16 sm:px-10 sm:pt-44 sm:pb-20">
      <div className="grid items-center gap-8 lg:grid-cols-[1.35fr_1fr] lg:gap-16">
        <div>
          <p className="mb-6 flex items-center gap-3 text-xs uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
            <span className="h-px w-7 bg-accent" aria-hidden />
            AI for professional service firms
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
            Compozor follows up with clients, checks their documents, and
            prepares work in your firm’s format. Give your team more time for
            the expertise clients come for.
          </p>
          <MarketingActions className="mt-7" />
          <p className="mt-4 text-xs text-muted-foreground">
            Early access. Built around the way your firm works.
          </p>
          <a
            href="#how-it-works"
            className="mt-6 inline-flex rounded-sm py-1 text-sm underline decoration-accent underline-offset-4 transition-colors hover:text-marketing-forest focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring dark:hover:text-marketing-brass"
          >
            Walk through a client example
          </a>
        </div>
      </div>
      <LandingWorkspacePreview />
    </section>
  );
}
