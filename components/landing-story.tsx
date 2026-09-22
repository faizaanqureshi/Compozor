"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  FileSpreadsheet,
  FileText,
  Mail,
  RotateCcw,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LandingTransition } from "@/components/landing-transition";

const steps = [
  {
    id: "setup",
    title: "Define",
    heading: "Your process. Ready for the next client.",
    description:
      "Build a reusable package with the documents you need and the work to follow. Assign it to a client, with requirements specific to their engagement.",
    note: "Define the checklist, reporting period, and workflow once. Reuse them across your practice.",
  },
  {
    id: "collect",
    title: "Collect",
    heading: "The follow-up, followed through.",
    description:
      "Compozor keeps the conversation moving: requesting missing documents, following up on your schedule, and answering routine client questions in your firm’s voice.",
    note: "Clients reply to your email or use a secure upload link. No new account needed.",
  },
  {
    id: "check",
    title: "Check",
    heading: "Received is only the beginning.",
    description:
      "Files are matched to the right client and requirement. Missing information and incorrect periods are identified, with a specific correction request when something needs fixing.",
    note: "Questions that need your judgment are brought back to your team, with context.",
  },
  {
    id: "prepare",
    title: "Prepare",
    heading: "Complete files become finished work.",
    description:
      "Your instructions turn client documents into reports, spreadsheets, letters, and presentations. Work samples guide the format. Output checks and review notes stay with the result.",
    note: "Run a workflow yourself, or let it start when collection is complete.",
  },
];

function ExampleFile({
  name,
  detail,
  complete = false,
}: {
  name: string;
  detail: string;
  complete?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/70 py-4 last:border-0">
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm">{name}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>
      {complete && (
        <Check className="size-4 shrink-0 text-success" aria-label="Received" />
      )}
    </div>
  );
}

export function LandingStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const [step, setStep] = useState("setup");
  const advanceFocus = useRef(false);
  const goToStep = (next: string) => {
    advanceFocus.current = next !== step;
    setStep(next);
  };
  useEffect(() => {
    if (!advanceFocus.current) return;
    advanceFocus.current = false;
    const frame = requestAnimationFrame(() => {
      const panel = sectionRef.current?.querySelector<HTMLElement>(
        `[data-panel="${step}"]`,
      );
      panel?.focus({ preventScroll: true });
      if (panel) {
        const { top } = panel.getBoundingClientRect();
        if (top < 100 || top > window.innerHeight - 160) {
          panel.scrollIntoView({
            block: "start",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "instant"
              : "smooth",
          });
        }
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [step]);
  const [reply, setReply] = useState(false);
  const [correction, setCorrection] = useState(false);
  const [corrected, setCorrected] = useState(false);
  const [report, setReport] = useState(false);
  const restart = () => {
    goToStep("setup");
    setReply(false);
    setCorrection(false);
    setCorrected(false);
    setReport(false);
  };

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="scroll-mt-24 border-t border-border bg-card py-20 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-6 sm:px-10">
        <div data-reveal="focus" className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-xs uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
              A quieter way to get the work done
            </p>
            <h2 className="mt-5 max-w-2xl text-4xl leading-tight font-thin tracking-tight sm:text-5xl [font-family:var(--font-denton)]">
              From the first request
              <br />
              to the finished work.
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            Follow a client through Compozor.
            <br />
            Try each step of the example below.
          </p>
        </div>
        <Tabs
          data-reveal
          value={step}
          onValueChange={(v) => setStep(String(v))}
          className="mt-10 gap-10 sm:mt-12"
        >
          <TabsList
            variant="line"
            aria-label="Explore the client document process"
            className="grid h-auto! w-full grid-cols-4 gap-0 border-b border-border p-0"
          >
            {steps.map((item, i) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className="justify-start gap-2 rounded-none px-1 py-4 text-sm after:bottom-0! after:bg-marketing-forest data-active:text-marketing-forest sm:gap-4 dark:data-active:text-marketing-brass dark:after:bg-marketing-brass"
              >
                <span className="text-[0.625rem] text-muted-foreground sm:text-xs">
                  0{i + 1}
                </span>
                {item.title}
              </TabsTrigger>
            ))}
          </TabsList>
          <LandingTransition panels>
            {steps.map((item) => (
              <TabsContent
                key={item.id}
                value={item.id}
                tabIndex={-1}
                data-panel={item.id}
                className="grid scroll-mt-28 items-center gap-8 lg:min-h-[490px] lg:grid-cols-[0.8fr_1.2fr] lg:gap-20"
              >
                <div className="order-last max-w-md lg:order-first">
                  <h3 className="text-2xl font-light tracking-tight sm:text-3xl">
                    {item.heading}
                  </h3>
                  <p className="mt-5 text-base leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                  <p className="mt-7 border-l border-accent pl-4 text-sm leading-relaxed text-muted-foreground">
                    {item.note}
                  </p>
                </div>
                <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-background">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-7">
                    <div>
                      <p className="text-sm">Avery Williams</p>
                      <p className="mt-1 text-[0.625rem] uppercase tracking-widest text-muted-foreground">
                        Interactive example
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={restart}
                      aria-label="Restart example"
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  </div>
                  <LandingTransition changeKey={`${reply}-${correction}-${corrected}-${report}`}>
                    <div className="p-5 sm:p-7">
                      {item.id === "setup" && (
                        <>
                          <p className="text-[0.625rem] uppercase tracking-widest text-muted-foreground">
                            Reusable package
                          </p>
                          <h4 className="mt-2 text-xl tracking-tight">
                            Monthly bookkeeping
                          </h4>
                          <div className="mt-3">
                            <ExampleFile
                              name="Bank statement"
                              detail="August 2026 · all pages"
                            />
                            <ExampleFile
                              name="Expense receipts"
                              detail="Supporting receipts for the reporting period"
                            />
                          </div>
                          <div className="mt-5 flex items-start gap-3 rounded-lg border border-border bg-card p-4">
                            <FileSpreadsheet
                              className="mt-0.5 size-4 text-marketing-forest dark:text-marketing-brass"
                              aria-hidden
                            />
                            <div>
                              <p className="text-sm">Monthly expense report</p>
                              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                Workflow attached · firm’s workbook as the sample
                              </p>
                            </div>
                          </div>
                          <Button
                            className="mt-6 gap-3"
                            onClick={() => goToStep("collect")}
                          >
                            Assign example package <ArrowRight aria-hidden />
                          </Button>
                        </>
                      )}
                      {item.id === "collect" && (
                        <>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Mail className="size-3.5" aria-hidden />
                            Your firm → Avery
                          </div>
                          <h4 className="mt-4 text-base">
                            A quick reminder for August
                          </h4>
                          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                            Hi Avery, we’re ready to prepare your monthly report.
                            Please send your August bank statement and expense
                            receipts. You can reply here or use your upload link.
                          </p>
                          {reply ? (
                            <div
                              className="mt-6 border-l-2 border-accent bg-card p-4"
                              aria-live="polite"
                            >
                              <p className="text-xs text-muted-foreground">
                                Avery → Your firm
                              </p>
                              <p className="mt-2 text-sm">
                                Here you go. Let me know if you need anything else.
                              </p>
                              <div className="mt-4 flex flex-wrap gap-2">
                                <span className="rounded-md border border-border px-3 py-2 text-xs">
                                  Statement_July.pdf
                                </span>
                                <span className="rounded-md border border-border px-3 py-2 text-xs">
                                  8 receipts
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
                              Follow-ups use the reminder schedule you set.
                            </p>
                          )}
                          <Button
                            className="mt-6 gap-3"
                            onClick={() =>
                              reply ? goToStep("check") : setReply(true)
                            }
                          >
                            {reply
                              ? "Check these documents"
                              : "See the client’s reply"}
                            <ArrowRight aria-hidden />
                          </Button>
                        </>
                      )}
                      {item.id === "check" && (
                        <>
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs uppercase tracking-widest">
                              Document checks
                            </p>
                            <span
                              className={cn(
                                "text-xs",
                                corrected ? "text-success" : "text-destructive",
                              )}
                            >
                              {corrected
                                ? "Ready for the workflow"
                                : "A correction is needed"}
                            </span>
                          </div>
                          <ExampleFile
                            name="Expense receipts"
                            detail="8 files · matched to the checklist"
                            complete
                          />
                          <ExampleFile
                            name="Bank statement"
                            detail={
                              corrected
                                ? "August 2026 · correct reporting period"
                                : "Expected August 2026 · received July 2026"
                            }
                            complete={corrected}
                          />
                          {correction && !corrected && (
                            <div
                              className="mt-4 rounded-lg border border-border bg-card p-4"
                              aria-live="polite"
                            >
                              <p className="text-xs text-muted-foreground">
                                Correction request · example draft
                              </p>
                              <p className="mt-2 text-sm leading-relaxed">
                                Thanks, Avery. The statement covers July. Could you
                                send the August statement so we can prepare the
                                right report?
                              </p>
                            </div>
                          )}
                          {corrected && (
                            <p className="mt-5 text-sm text-success" role="status">
                              Corrected statement received. Both requirements are
                              satisfied.
                            </p>
                          )}
                          <Button
                            className="mt-6 gap-3"
                            onClick={() =>
                              corrected
                                ? goToStep("prepare")
                                : correction
                                  ? setCorrected(true)
                                  : setCorrection(true)
                            }
                          >
                            {corrected
                              ? "Continue to the workflow"
                              : correction
                                ? "See the corrected upload"
                                : "See the correction request"}
                            <ArrowRight aria-hidden />
                          </Button>
                        </>
                      )}
                      {item.id === "prepare" && (
                        <>
                          <div className="flex items-center gap-3">
                            <FileSpreadsheet
                              className="size-5 text-marketing-forest dark:text-marketing-brass"
                              aria-hidden
                            />
                            <div>
                              <h4 className="text-base">Monthly expense report</h4>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Statement + receipts + your work sample
                              </p>
                            </div>
                          </div>
                          {report ? (
                            <div className="mt-6" aria-live="polite">
                              <div className="space-y-3">
                                {[
                                  "Client information extracted",
                                  "Report prepared using your sample",
                                  "Output checks and review notes attached",
                                ].map((line) => (
                                  <p
                                    key={line}
                                    className="flex items-center gap-2 text-xs"
                                  >
                                    <Check
                                      className="size-3.5 text-success"
                                      aria-hidden
                                    />
                                    {line}
                                  </p>
                                ))}
                              </div>
                              <div className="mt-6 rounded-lg border border-border bg-card p-5">
                                <p className="text-[0.625rem] uppercase tracking-widest text-muted-foreground">
                                  Illustrative output
                                </p>
                                <p className="mt-2 text-lg">
                                  August expense summary
                                </p>
                                <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
                                  <span className="text-xs text-muted-foreground">
                                    Total expenses
                                  </span>
                                  <span className="text-2xl font-light tabular-nums">
                                    $1,340.00
                                  </span>
                                </div>
                                <p className="mt-3 text-xs text-muted-foreground">
                                  Workbook prepared for your team’s review
                                </p>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                                “Group expenses by category, calculate totals, and
                                prepare the monthly summary in our workbook format.”
                              </p>
                              <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
                                Start manually, or automatically after collection.
                              </p>
                            </>
                          )}
                          {report ? (
                            <Button
                              nativeButton={false}
                              render={<a href="#workflows" />}
                              variant="outline"
                              className="mt-6 gap-3"
                            >
                              Explore work samples <ArrowRight aria-hidden />
                            </Button>
                          ) : (
                            <Button
                              className="mt-6 gap-3"
                              onClick={() => setReport(true)}
                            >
                              Preview completed work <ArrowRight aria-hidden />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </LandingTransition>
                  <div className="border-t border-border px-5 py-3 text-[0.625rem] leading-relaxed text-muted-foreground sm:px-7">
                    Illustrative journey with fictional data. No emails are sent.
                  </div>
                </div>
              </TabsContent>
            ))}
          </LandingTransition>
        </Tabs>
      </div>
    </section>
  );
}
