"use client";

import depth from "@/components/landing-depth.module.css";
import { ArrowUpRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  EvidenceIndex,
  ExpenseAllocation,
  IncomeSummary,
  Metric,
} from "@/components/landing-report-preview";
import { LandingTransition } from "@/components/landing-transition";

const practices = [
  {
    id: "accounting",
    label: "Accounting & tax",
    title: "From statements to a clearer month-end.",
    description:
      "Collect the records, resolve missing periods, and prepare an expense workbook your team can review.",
    sources: [
      "Bank and card statements",
      "Receipts and supporting records",
      "Your expense workbook sample",
    ],
    format: "Excel · PDF",
    document: "Monthly expense summary",
    subtitle: "Avery Williams · August 2026",
    other: "Reconciliation reports · transaction exports · client summaries",
  },
  {
    id: "legal",
    label: "Immigration law",
    title: "From scattered evidence to an organized case file.",
    description:
      "Request the right records, track outstanding evidence, and assemble an index and client-summary draft for your legal team.",
    sources: [
      "Identity and travel documents",
      "Employment and education records",
      "Your evidence-index sample",
    ],
    format: "Word · PDF",
    document: "Client evidence index",
    subtitle: "Example engagement · Prepared for legal review",
    other: "Client-summary drafts · document schedules · correspondence drafts",
  },
  {
    id: "lending",
    label: "Mortgage & lending",
    title: "From incoming records to a review-ready file.",
    description:
      "Bring income documents and supporting statements together, identify gaps, and prepare a structured summary for your team.",
    sources: [
      "Pay statements and income records",
      "Bank statements",
      "Your income-summary sample",
    ],
    format: "Excel · PDF",
    document: "Income documentation summary",
    subtitle: "Example engagement · Prepared for advisor review",
    other:
      "Document-gap reports · supporting-record indexes · client summaries",
  },
];

export function LandingPractices() {
  return (
    <section
      id="for-firms"
      className="mx-auto max-w-7xl scroll-mt-24 px-6 py-14 sm:px-10 sm:py-28"
    >
      <div
        data-reveal="focus"
        className="mb-8 flex sm:mb-12 flex-col justify-between gap-6 md:flex-row md:items-end"
      >
        <div>
          <p className="text-xs uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
            A few possibilities
          </p>
          <h2 className="mt-5 text-4xl leading-tight font-thin tracking-tight sm:text-5xl [font-family:var(--font-denton)]">
            The work changes.
            <br />
            The care stays.
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
          An expense analysis. A carefully ordered case file. A clearer picture
          of income. Explore what the work could look like in your practice.
        </p>
      </div>
      <div data-reveal>
        <Tabs
          defaultValue="accounting"
          orientation="vertical"
          className="grid gap-7 sm:gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-16"
        >
          <div>
            <TabsList
              variant="line"
              aria-label="Explore workflows for your practice"
              className="w-full items-stretch gap-0 p-0"
            >
              {practices.map((p, i) => (
                <TabsTrigger
                  key={p.id}
                  value={p.id}
                  className="group min-h-14 sm:min-h-20 justify-start gap-4 rounded-none border-x-0 border-t-0 border-b border-border px-0 py-3 sm:py-5 text-left text-base font-normal whitespace-normal after:hidden data-active:text-marketing-forest dark:data-active:text-marketing-brass"
                >
                  <span className="text-[0.625rem] tabular-nums text-muted-foreground">
                    0{i + 1}
                  </span>
                  <span className="flex-1">{p.label}</span>
                  <ArrowUpRight
                    className="size-4 opacity-0 transition-opacity group-data-active:opacity-100"
                    aria-hidden
                  />
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="mt-8 hidden lg:block">
              <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                Your requirements and samples define the work. These are
                starting points, not a fixed menu.
              </p>
              <Button
                nativeButton={false}
                render={<a href="/demo" />}
                variant="ghost"
                className="mt-4 -ml-3 gap-2 text-xs"
              >
                Explore your use case <ArrowUpRight aria-hidden />
              </Button>
            </div>
          </div>
          <LandingTransition panels className="min-w-0">
            {practices.map((p) => (
              <TabsContent key={p.id} value={p.id} className="min-w-0">
                <div>
                  <div className="mb-7 grid gap-6 sm:grid-cols-[1.2fr_1fr] sm:gap-8">
                    <div>
                      <h3 className="text-2xl font-light tracking-tight">
                        {p.title}
                      </h3>
                      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                        {p.description}
                      </p>
                    </div>
                    <div className="border-l border-border pl-5">
                      <p className="text-[0.625rem] uppercase tracking-widest text-muted-foreground">
                        Source material
                      </p>
                      <ul className="mt-3 space-y-2">
                        {p.sources.map((source) => (
                          <li key={source} className="text-xs leading-relaxed">
                            {source}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  <article className={`${depth.paper} overflow-hidden rounded-lg border border-border bg-card`}>
                    <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-8">
                      <span className="text-[0.625rem] uppercase tracking-widest text-muted-foreground">
                        An example from your firm
                      </span>
                      <span className="text-[0.625rem] uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
                        {p.format}
                      </span>
                    </header>
                    <div className="p-5 sm:p-8">
                      <h4 className="text-2xl font-light tracking-tight">
                        {p.document}
                      </h4>
                      <p className="mt-2 mb-6 text-xs text-muted-foreground">
                        {p.subtitle}
                      </p>
                      {p.id === "accounting" && (
                        <>
                          <div className="grid grid-cols-3 gap-2 sm:gap-4 border-y border-border py-5">
                            <Metric label="Expenses" value="$1,340" />
                            <Metric label="Receipts" value="08" />
                            <Metric label="Categories" value="03" />
                          </div>
                          <div className="mt-7 grid items-center gap-7 xl:grid-cols-[1.2fr_0.8fr]">
                            <ExpenseAllocation />
                            <div className="border-l border-border pl-5">
                              <p className="text-[0.625rem] uppercase tracking-widest text-muted-foreground">
                                In focus
                              </p>
                              <p className="mt-3 text-sm leading-relaxed">
                                Travel represents just over half of the month’s
                                spending.
                              </p>
                              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                                Software renewals total $240 across three
                                receipts. Review the grouping before finalizing.
                              </p>
                            </div>
                          </div>
                          <div className="mt-7 border-t border-border pt-5">
                            <p className="text-[0.625rem] uppercase tracking-widest text-muted-foreground">
                              Included in the workbook
                            </p>
                            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
                              <span>Transaction ledger</span>
                              <span>Category summary</span>
                              <span>Source references</span>
                              <span>Review notes</span>
                            </div>
                          </div>
                        </>
                      )}
                      {p.id === "legal" && <EvidenceIndex />}
                      {p.id === "lending" && <IncomeSummary />}
                    </div>
                    <footer className="flex flex-wrap justify-between gap-2 border-t border-border px-5 py-4 text-[0.625rem] text-muted-foreground sm:px-8">
                      <span>Illustrative document · fictional information</span>
                      <span>Prepared for professional review</span>
                    </footer>
                  </article>
                  <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
                    Also possible: {p.other}.
                  </p>
                </div>
              </TabsContent>
            ))}
          </LandingTransition>
        </Tabs>
        <div className="mt-10 flex flex-col justify-between gap-4 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="max-w-xl text-sm text-muted-foreground">
            A different kind of firm? Define the documents you need and the work
            you want prepared.
          </p>
          <Button
            nativeButton={false}
            render={<a href="/demo" />}
            variant="ghost"
            className="shrink-0 self-start gap-3 sm:self-auto"
          >
            Show us your workflow <ArrowUpRight aria-hidden />
          </Button>
        </div>
      </div>
    </section>
  );
}
