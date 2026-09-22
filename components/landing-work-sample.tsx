"use client";

import depth from "@/components/landing-depth.module.css";
import { useId, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ExpenseBreakdown,
  SpendingTrend,
  Metric,
  exampleExpenseTotal,
  money,
} from "@/components/landing-report-preview";
import styles from "@/components/landing-motion.module.css";
import material from "@/components/landing-work-sample.module.css";
import { LandingTransition } from "@/components/landing-transition";

export function LandingWorkSample() {
  const [view, setView] = useState("report");
  const [sources, setSources] = useState(false);
  const sourceId = useId();

  return (
    <figure className="min-w-0">
      <Tabs
        value={view}
        onValueChange={(v) => {
          setView(String(v));
          setSources(false);
        }}
        className={`${depth.paper} gap-0 overflow-hidden rounded-xl border border-border bg-card text-foreground`}
      >
        <div className="flex flex-col justify-between gap-4 border-b border-border bg-card px-5 py-5 sm:flex-row sm:items-center sm:px-8">
          <div className="flex items-center gap-3">
            <FileSpreadsheet
              className="size-4 text-marketing-forest dark:text-marketing-brass"
              aria-hidden
            />
            <span className="text-sm">Monthly expense report</span>
          </div>
          <TabsList
            aria-label="Compare a work sample with a client report"
            className="h-auto! w-full justify-start sm:w-auto rounded-4xl border border-border p-1"
          >
            <TabsTrigger
              value="sample"
              className="min-h-11 flex-1 rounded-4xl px-3 text-xs sm:min-h-8 sm:flex-none"
            >
              Reference layout
            </TabsTrigger>
            <TabsTrigger
              value="report"
              className="min-h-11 flex-1 rounded-4xl px-3 text-xs sm:min-h-8 sm:flex-none"
            >
              Prepared report
            </TabsTrigger>
          </TabsList>
        </div>
        <div className="grid lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="order-last grid content-start gap-7 p-5 lg:order-first sm:grid-cols-2 sm:p-8 lg:grid-cols-1 lg:gap-9">
            <div>
              <p className="text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
                01 / The material
              </p>
              <div className="mt-4 space-y-4">
                {[
                  ["August statement.pdf", "Reporting period · 01–31 Aug"],
                  ["Expense receipts", "8 supporting files"],
                  [
                    "Firm expense sample.xlsx",
                    "Your layout, headings, and charts",
                  ],
                ].map(([name, detail]) => (
                  <div key={name} className="flex gap-3">
                    <FileText
                      className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <div>
                      <p className="text-xs">{name}</p>
                      <p className="mt-1 text-[0.6875rem] sm:text-[0.625rem] leading-relaxed text-muted-foreground">
                        {detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
                02 / Your instructions
              </p>
              <blockquote className="mt-4 border-l border-marketing-brass/60 pl-4 text-sm leading-relaxed text-foreground">
                “Summarize expenses by category. Show the spending trend, retain
                our format, and include source references and review notes.”
              </blockquote>
              <div className="mt-6 space-y-2 text-[0.6875rem] sm:text-[0.625rem] text-muted-foreground">
                <p className="flex items-center gap-2">
                  <Check className="size-3" aria-hidden />
                  Client data supplies the facts
                </p>
                <p className="flex items-center gap-2">
                  <Check className="size-3" aria-hidden />
                  Your sample guides the presentation
                </p>
              </div>
            </div>
          </aside>
          <div className={`${material.reportStage} min-w-0 p-3 sm:p-8 lg:p-10`}>
            <LandingTransition panels className="relative z-10 min-w-0">
              {(["sample", "report"] as const).map((mode) => (
                <TabsContent key={mode} value={mode} className="min-w-0">
                  <article
                    className={`${depth.paper} rounded-lg border border-border bg-card p-4 text-foreground sm:p-8`}
                  >
                    <header className="flex items-center justify-between gap-4 border-b border-border pb-5">
                      <span className="text-xs uppercase tracking-widest">
                        North & Co.
                      </span>
                      <span className="text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-widest text-muted-foreground">
                        {mode === "sample"
                          ? "Reference layout"
                          : "Illustrative report"}
                      </span>
                    </header>
                    <div className="my-6">
                      <p className="text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-widest text-muted-foreground">
                        Monthly financial overview
                      </p>
                      <h3 className="mt-2 text-2xl font-light tracking-tight sm:text-3xl">
                        Expense statement
                      </h3>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {mode === "sample"
                          ? "Client name · Reporting period"
                          : "Avery Williams · August 2026"}
                      </p>
                    </div>
                    <div className={`${material.metrics} grid grid-cols-3 gap-3 border-y border-border py-5`}>
                      <Metric
                        label="Total expenses"
                        value={mode === "sample" ? "—" : money(exampleExpenseTotal)}
                      />
                      <Metric
                        label="Categories"
                        value={mode === "sample" ? "—" : "03"}
                      />
                      <Metric
                        label="Receipts"
                        value={mode === "sample" ? "—" : "08"}
                      />
                    </div>
                    <div className="grid gap-8 py-7 sm:grid-cols-2">
                      <ExpenseBreakdown sample={mode === "sample"} />
                      <SpendingTrend sample={mode === "sample"} />
                    </div>
                    <div className="border-t border-border pt-5">
                      <p className="text-[0.6875rem] sm:text-[0.625rem] uppercase tracking-widest text-muted-foreground">
                        Observations & review notes
                      </p>
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                        {mode === "sample"
                          ? "Space for the period’s findings, source references, and any information your team should review."
                          : "Travel accounts for 50.7% of expenses. Eight supporting receipts are listed against the statement. Software renewals are grouped together for review; no tax treatment is inferred."}
                      </p>
                    </div>
                    {mode === "report" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSources(!sources)}
                          aria-expanded={sources}
                          aria-controls={sourceId}
                          className="mt-4 -ml-2 gap-2 text-xs"
                        >
                          {sources
                            ? "Hide source references"
                            : "Inspect source references"}
                          <ChevronDown
                            className={`${styles.disclosureChevron} ${sources ? "rotate-180" : ""}`}
                            aria-hidden
                          />
                        </Button>
                        <div
                          id={sourceId}
                          aria-hidden={!sources}
                          inert={!sources}
                          data-open={sources}
                          className={styles.disclosure}
                        >
                          <div className="min-h-0 overflow-hidden">
                            <div className="overflow-x-auto pt-3">
                              <table className="w-full text-left text-[0.6875rem] sm:text-[0.625rem]">
                                <caption className="pb-3 text-left text-muted-foreground">
                                  Selected entries from the illustrative source ledger
                                </caption>
                                <thead>
                                  <tr className="border-b border-border">
                                    <th className="py-2 font-normal">
                                      Date / category
                                    </th>
                                    <th className="py-2 font-normal">Source</th>
                                    <th className="py-2 text-right font-normal">CAD</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {[
                                    [
                                      "03 Aug · Office",
                                      "Statement p. 1 · Receipt 01",
                                      "$240",
                                    ],
                                    [
                                      "07 Aug · Travel",
                                      "Statement p. 1 · Receipt 02",
                                      "$180",
                                    ],
                                    [
                                      "11 Aug · Software",
                                      "Statement p. 1 · Receipt 03",
                                      "$60",
                                    ],
                                  ].map((row) => (
                                    <tr
                                      key={row[0]}
                                      className="border-b border-border/60"
                                    >
                                      <td className="py-3 pr-3">{row[0]}</td>
                                      <td className="py-3 pr-3 text-muted-foreground">
                                        {row[1]}
                                      </td>
                                      <td className="py-3 text-right tabular-nums">
                                        {row[2]}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                    <footer className="mt-5 flex flex-wrap justify-between gap-2 border-t border-border pt-4 text-[0.6875rem] sm:text-[0.625rem] text-muted-foreground">
                      <span>Prepared for professional review</span>
                      <span>01 / Monthly overview</span>
                    </footer>
                  </article>
                </TabsContent>
              ))}
            </LandingTransition>
          </div>
        </div>
      </Tabs>
      <figcaption className="mt-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
          Fictional data, real possibilities. Samples guide the format; client
          documents provide the facts.
        </p>
        <Button
          onClick={() => {
            setView(view === "sample" ? "report" : "sample");
            setSources(false);
          }}
          variant="ghost"
          className="shrink-0 self-start gap-3 text-foreground hover:bg-muted hover:text-foreground sm:self-auto"
        >
          {view === "sample"
            ? "See it with client data"
            : "Compare the reference layout"}
          <ArrowRight aria-hidden />
        </Button>
      </figcaption>
    </figure>
  );
}
