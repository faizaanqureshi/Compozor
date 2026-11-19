import { headers } from "next/headers";
import Link from "next/link";
import { Check } from "lucide-react";
import depth from "@/components/landing-depth.module.css";
import { AuroraBackground } from "@/components/aurora-background";
import { LandingNav } from "@/components/landing-nav";
import { SiteFooter } from "@/components/site-footer";
import {
  CurrencySwitch,
  PlanPrice,
  PricingCurrencyProvider,
  PricingFootnote,
} from "@/components/pricing-currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COMPARISON_ROWS, PLANS, defaultPricingCurrency, type Plan } from "@/lib/pricing";
import { publicPageMetadata } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const metadata = publicPageMetadata("/pricing");

const NOTES = [
  [
    "Usage is included.",
    "Every plan comes with generous usage for reminders, replies, workflows and Ask. Most firms never go past it.",
  ],
  [
    "No surprise bills.",
    "If your firm goes beyond its included usage, the extra is billed at the end of the month. You get a heads-up first, and you can set a monthly cap.",
  ],
];

const FAQS = [
  [
    "What happens when we add a sixth person?",
    "You move to the next plan from your next bill. Everyone keeps their mailbox, clients and history.",
  ],
  [
    "What counts as usage?",
    "The work Compozor does for you: reading documents, drafting replies and reminders, running workflows and answering in Ask.",
  ],
  [
    "Can we cancel anytime?",
    "Yes. Plans are month to month, and you can download any client’s documents whenever you like.",
  ],
];

const sectionHeading =
  "text-4xl leading-tight font-light tracking-tight [font-family:var(--font-display)]";

export default async function PricingPage() {
  // Vercel sets this per request; it's absent in local dev (which shows CAD).
  const country = (await headers()).get("x-vercel-ip-country");

  return (
    <div className="marketing-page flex min-h-svh flex-col overflow-x-clip bg-background">
      <LandingNav />
      <PricingCurrencyProvider initial={defaultPricingCurrency(country)}>
        <main id="main-content" className="flex-1">
          <div className="relative isolate">
            <AuroraBackground />
            <div className="mx-auto flex max-w-7xl flex-col gap-12 px-6 pt-28 pb-16 sm:gap-16 sm:px-10 sm:pt-44 sm:pb-24">
              <header className="flex max-w-3xl flex-col">
                <p className="text-xs uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
                  Pricing
                </p>
                <h1 className="mt-5 text-5xl leading-[1.05] font-light tracking-tight text-balance sm:text-6xl xl:text-7xl [font-family:var(--font-display)]">
                  Every plan is all of Compozor.
                </h1>
                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-foreground/90">
                  Pick the plan that fits your team. Each one includes every
                  feature, from client chasing and document checks to workflows
                  and Ask. Bigger plans add room for your people and more
                  hands-on help.
                </p>
                <CurrencySwitch className="mt-8" />
              </header>

              <div
                role="list"
                aria-label="Plans"
                className="grid gap-px overflow-hidden rounded-xl bg-border ring-1 ring-border sm:grid-cols-2 xl:grid-cols-5"
              >
                {PLANS.map((plan) => (
                  <PlanCard key={plan.name} plan={plan} />
                ))}
              </div>
            </div>
          </div>

          <div className="mx-auto flex max-w-7xl flex-col gap-16 px-6 pb-16 sm:gap-24 sm:px-10 sm:pb-24">
            <div className="grid gap-10 border-t border-border pt-10 md:grid-cols-2 md:gap-16">
              {NOTES.map(([title, body]) => (
                <div key={title}>
                  <h2 className="text-2xl font-light tracking-tight">{title}</h2>
                  <p className="mt-3 max-w-prose text-base leading-relaxed text-pretty text-muted-foreground">
                    {body}
                  </p>
                </div>
              ))}
            </div>

            <section aria-labelledby="compare-plans" className="min-w-0">
              <h2 id="compare-plans" className={sectionHeading}>
                Compare plans
              </h2>
              <ComparisonTable />
            </section>

            <section aria-labelledby="pricing-questions">
              <h2 id="pricing-questions" className={sectionHeading}>
                Questions
              </h2>
              <dl className="mt-8 grid gap-8 md:grid-cols-3 md:gap-10">
                {FAQS.map(([question, answer]) => (
                  <div key={question}>
                    <dt className="text-base font-medium">{question}</dt>
                    <dd className="mt-2 text-sm leading-relaxed text-pretty text-muted-foreground">
                      {answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <PricingFootnote className="border-t border-border pt-6 text-sm text-muted-foreground" />
          </div>
        </main>
      </PricingCurrencyProvider>
      <SiteFooter />
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const solid = plan.recommended || !plan.price;
  const isLink = plan.cta.href.startsWith("/");
  return (
    <article
      role="listitem"
      aria-label={plan.name}
      className={cn(
        "flex min-w-0 flex-col gap-5 p-6 xl:p-5 2xl:p-6",
        plan.recommended ? "bg-muted" : "bg-background",
        // Five plans in two columns: the last one spans the row.
        "sm:last:col-span-2 xl:last:col-span-1",
      )}
    >
      <h2 className="flex flex-wrap items-center gap-2 text-base font-medium">
        {plan.name}
        {plan.recommended && (
          <Badge variant="outline" className="text-muted-foreground">
            Recommended
          </Badge>
        )}
      </h2>
      <div>
        <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
          <span className="text-4xl leading-none font-light tracking-tight tabular-nums xl:text-3xl 2xl:text-4xl">
            {plan.price ? <PlanPrice price={plan.price} /> : "Custom"}
          </span>
          {plan.price && <span className="text-sm text-muted-foreground">/ month</span>}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">{plan.size}</p>
      </div>
      <ul className="flex flex-col gap-2.5 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-3">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
            {feature}
          </li>
        ))}
      </ul>
      <Button
        nativeButton={false}
        render={isLink ? <Link href={plan.cta.href} /> : <a href={plan.cta.href} />}
        variant={solid ? "default" : "outline"}
        size="lg"
        className={cn(
          "mt-auto h-11 w-full",
          solid &&
            `${depth.primaryAction} bg-marketing-forest text-sidebar-foreground hover:bg-marketing-forest/90`,
        )}
      >
        {plan.cta.label}
      </Button>
    </article>
  );
}

function ComparisonTable() {
  const cell = "border-t border-border px-4 py-3.5 text-center";
  return (
    // Scrolls inside its own frame on narrow screens rather than the page.
    <div
      className="relative mt-8 overflow-x-auto rounded-xl ring-1 ring-border"
      tabIndex={0}
      role="region"
      aria-labelledby="compare-plans"
    >
      <table className="w-full min-w-3xl border-collapse text-sm">
        <thead>
          <tr className="bg-muted">
            <td className="px-4 py-3.5" />
            {PLANS.map((plan) => (
              <th key={plan.name} scope="col" className="px-4 py-3.5 text-center font-medium">
                {plan.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className={cn(cell, "text-left font-normal")}>Price</th>
            {PLANS.map((plan) => (
              <td key={plan.name} className={cn(cell, "tabular-nums")}>
                {plan.price ? (
                  <>
                    <PlanPrice price={plan.price} />/mo
                  </>
                ) : (
                  "Custom"
                )}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row" className={cn(cell, "text-left font-normal")}>Team size</th>
            {PLANS.map((plan) => (
              <td key={plan.name} className={cell}>{plan.teamSize}</td>
            ))}
          </tr>
          {COMPARISON_ROWS.map((row) => (
            <tr key={row.label}>
              <th scope="row" className={cn(cell, "text-left font-normal")}>{row.label}</th>
              {PLANS.map((plan, i) => (
                <td key={plan.name} className={cell}>
                  {i >= row.from ? (
                    <>
                      <Check className="mx-auto size-4 text-accent" aria-hidden />
                      <span className="sr-only">Included</span>
                    </>
                  ) : (
                    <span className="text-muted-foreground/50">
                      <span aria-hidden>—</span>
                      <span className="sr-only">Not included</span>
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
