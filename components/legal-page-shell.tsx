import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";

// Shared shell for the public legal pages (/privacy, /terms, /cookies) -
// plain, restrained, readable prose rather than marketing chrome, per
// DESIGN_SYSTEM.md's "purposeful over decorative" principle. These pages
// are reached without a Clerk session (see the pathname exemptions in
// nav.tsx, mobile-top-bar.tsx, dashboard-background.tsx, and
// onboarding-gate.tsx), so nothing here assumes an authenticated user.
export function LegalPageShell({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-16 sm:py-20">
      <div className="flex flex-col gap-3">
        <Link
          href="/"
          className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon className="size-3.5" />
          Back to Compozor
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground">
          Last updated {lastUpdated}
        </p>
      </div>
      <div className="flex flex-col gap-8 text-sm leading-relaxed sm:text-base">
        {children}
      </div>
    </div>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-medium text-foreground sm:text-xl">
        {heading}
      </h2>
      <div className="flex flex-col gap-3 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

// Marks a fact that only the business (not this research/drafting pass) can
// supply - legal entity name, registered address, governing-law
// jurisdiction, etc. Styled with the sparing "accent = needs attention, not
// broken" convention from DESIGN_SYSTEM.md §2/§6 rather than invented text,
// so it's visibly a TODO instead of a fabricated fact sitting in a legal
// document.
export function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-accent/15 px-1.5 py-0.5 font-medium text-accent">
      {children}
    </span>
  );
}
