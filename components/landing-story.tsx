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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { LandingAgentExample } from "@/components/landing-agent-example";
import motion from "@/components/landing-motion.module.css";
import { LandingTransition } from "@/components/landing-transition";
import {
  storyExamples,
  type StoryExample,
} from "@/components/landing-story-examples";

const steps = [
  {
    id: "overview",
    title: "The loop",
    heading: "The back-and-forth, handled.",
    description:
      "Your client sends the wrong document. Compozor catches the mismatch, explains what’s needed, and checks the replacement. Once the requirements are met, your workflow prepares the work. After your team approves it, the work goes back to the client and next period is scheduled.",
    note: "You define the requirements and choose what runs automatically. Your team handles the decisions that need professional judgment.",
  },
  {
    id: "collect",
    title: "Collect",
    heading: "The follow-up, followed through.",
    description:
      "Each period starts on its own: Compozor sends the request, follows up on your schedule, and answers routine client questions in your firm’s voice.",
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
    note: "It starts when collection is complete, or whenever you run it. Approved work is delivered to the client’s portal.",
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

function CollectExample({
  example,
  reply,
}: {
  example: StoryExample;
  reply: boolean;
}) {
  return (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Mail className="size-3.5" aria-hidden />
        Compozor → {example.contact} · on your firm’s behalf
      </div>
      <h4 className="mt-4 text-base">{example.request.subject}</h4>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        {example.request.body}
      </p>
      {reply ? (
        <div
          className="mt-6 border-l-2 border-accent bg-card p-4"
          aria-live="polite"
        >
          <p className="text-xs text-muted-foreground">
            {example.contact} → Your firm
          </p>
          <p className="mt-2 text-sm">{example.reply.text}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {example.reply.files.map((file) => (
              <span
                key={file}
                className="rounded-md border border-border px-3 py-2 text-xs"
              >
                {file}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-6 border-t border-border pt-4 text-xs text-muted-foreground">
          Follow-ups use the reminder schedule you set.
        </p>
      )}
    </>
  );
}

function CheckExample({
  example,
  corrected,
}: {
  example: StoryExample;
  corrected: boolean;
}) {
  return (
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
      {example.checks.map((check) => (
        <ExampleFile
          key={check.name}
          name={check.name}
          detail={check.fixed && corrected ? check.fixed : check.detail}
          complete={!check.fixed || corrected}
        />
      ))}
      {!corrected && (
        <div
          className="mt-4 rounded-lg border border-border bg-card p-4"
          aria-live="polite"
        >
          <p className="text-xs text-muted-foreground">
            Compozor → {example.contact} · correction explained
          </p>
          <p className="mt-2 text-sm leading-relaxed">{example.correction}</p>
        </div>
      )}
      {corrected && (
        <p className="mt-5 text-sm text-success" role="status">
          {example.resolved} Every requirement is satisfied, so the automatic
          workflow can begin.
        </p>
      )}
    </>
  );
}

function PrepareExample({
  example,
  report,
}: {
  example: StoryExample;
  report: boolean;
}) {
  const OutputIcon =
    example.output.kind === "workbook" ? FileSpreadsheet : FileText;
  return (
    <>
      <div className="flex items-center gap-3">
        <OutputIcon
          className="size-5 shrink-0 text-marketing-forest dark:text-marketing-brass"
          aria-hidden
        />
        <div>
          <h4 className="text-base">{example.workflow.title}</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            {example.workflow.inputs}
          </p>
        </div>
      </div>
      {report ? (
        <div className="mt-6" aria-live="polite">
          <div className="space-y-3">
            {[
              "Client information extracted",
              "Prepared using your work sample",
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
            <p className="mt-2 text-lg">{example.output.title}</p>
            <div className="mt-4 flex items-baseline justify-between gap-4 border-t border-border pt-4">
              <span className="text-xs text-muted-foreground">
                {example.output.metricLabel}
              </span>
              <span className="text-2xl font-light tabular-nums">
                {example.output.metricValue}
              </span>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {example.output.note}
            </p>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
            “{example.workflow.instruction}”
          </p>
          <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
            Start manually, or automatically after collection.
          </p>
        </>
      )}
    </>
  );
}

export function LandingStory() {
  const sectionRef = useRef<HTMLElement>(null);
  const [step, setStep] = useState("overview");
  const [exampleId, setExampleId] = useState(storyExamples[0].id);
  const example =
    storyExamples.find((item) => item.id === exampleId) ?? storyExamples[0];
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
  const [corrected, setCorrected] = useState(false);
  const [report, setReport] = useState(false);
  const restart = () => {
    goToStep("overview");
    setReply(false);
    setCorrected(false);
    setReport(false);
  };

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="scroll-mt-24 border-t border-border bg-card py-16 sm:py-28"
    >
      <div className="mx-auto max-w-7xl px-6 sm:px-10">
        <div data-reveal="focus" className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="text-xs uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
              How your AI employee works
            </p>
            <h2 className="mt-5 max-w-2xl text-4xl leading-tight font-light tracking-tight sm:text-5xl [font-family:var(--font-display)]">
              From the first request
              <br />
              to the finished work.
            </h2>
          </div>
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground max-sm:hidden">
            Set up a service once, like a personal tax return due April 30.
            Each period, Compozor runs it from request to prepared work.
          </p>
        </div>
        <Tabs
          value={example.id}
          onValueChange={(v) => setExampleId(String(v))}
          className="mt-10 gap-0 sm:mt-12"
        >
          <div
            data-reveal
            className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5"
          >
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Example
            </p>
            <TabsList
              aria-label="Choose an example firm"
              className="grid h-auto! w-full grid-cols-2 gap-1 rounded-xl border border-border p-1 sm:inline-flex sm:w-auto sm:rounded-4xl"
            >
              {storyExamples.map((item) => (
                <TabsTrigger
                  key={item.id}
                  value={item.id}
                  className="min-h-11 rounded-lg px-4 text-xs sm:min-h-8 sm:flex-none sm:rounded-4xl"
                >
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value={example.id} className="min-w-0">
            {/* Phones scroll rather than tap, so the walkthrough unrolls into a
                sequence showing each step's outcome. Wider screens use the tabs. */}
            <div className="mt-8 sm:hidden">
              <div data-reveal>
                <h3 className="text-2xl font-light tracking-tight">
                  {steps[0].heading}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                  {steps[0].description}
                </p>
              </div>
              <ol className="mt-12 space-y-14">
                {steps.slice(1).map((item, i) => (
                  <li key={item.id} data-reveal className="border-t border-border pt-6">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      0{i + 1} · {item.title}
                    </p>
                    <h3 className="mt-3 text-2xl font-light tracking-tight">
                      {item.heading}
                    </h3>
                    <p className="mt-3 text-base leading-relaxed text-muted-foreground">
                      {item.description}
                    </p>
                    <div className="mt-6 rounded-xl border border-border bg-background p-5">
                      {item.id === "collect" && <CollectExample example={example} reply />}
                      {item.id === "check" && <CheckExample example={example} corrected={false} />}
                      {item.id === "prepare" && <PrepareExample example={example} report />}
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
                Fictional example with automation enabled. No emails are sent or
                workflows run here.
              </p>
            </div>
            <Tabs
              data-reveal
              value={step}
              onValueChange={(v) => setStep(String(v))}
              className="mt-10 gap-10 max-sm:hidden"
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
                    className="min-h-14 flex-col items-start justify-center gap-1 rounded-none px-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-start sm:py-4 after:bottom-0! after:bg-marketing-forest data-active:text-marketing-forest sm:gap-4 dark:data-active:text-marketing-brass dark:after:bg-marketing-brass"
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
                      {item.id === "overview" && (
                        <Accordion className={`${motion.faq} mt-6 border-t border-border`}>
                          <AccordionItem value="setup">
                            <AccordionTrigger className="min-h-11 py-4 font-normal">
                              What your firm sets up
                            </AccordionTrigger>
                            <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
                              Define the documents and reporting period, attach your
                              workflow instructions and work sample, then assign the
                              package to a client. Enable automatic replies and
                              workflow execution, or keep either under manual control.
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}
                    </div>
                    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-background">
                      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-7">
                        <div>
                          <p className="text-sm">{example.client}</p>
                          <p className="mt-1 text-[0.625rem] uppercase tracking-widest text-muted-foreground">
                            Illustrative AI activity
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
                      <LandingTransition changeKey={`${example.id}-${reply}-${corrected}-${report}`}>
                        <div className="p-5 sm:p-7">
                          {item.id === "overview" && (
                            <>
                              <LandingAgentExample example={example} />
                              <Button
                                variant="outline"
                                className="mt-6 min-h-11 gap-3"
                                onClick={() => goToStep("collect")}
                              >
                                Explore the conversation <ArrowRight aria-hidden />
                              </Button>
                            </>
                          )}
                          {item.id === "collect" && (
                            <>
                              <CollectExample example={example} reply={reply} />
                              <Button
                                className="mt-6 gap-3"
                                onClick={() =>
                                  reply ? goToStep("check") : setReply(true)
                                }
                              >
                                {reply
                                  ? "See the document checks"
                                  : "See the client’s reply"}
                                <ArrowRight aria-hidden />
                              </Button>
                            </>
                          )}
                          {item.id === "check" && (
                            <>
                              <CheckExample example={example} corrected={corrected} />
                              <Button
                                className="mt-6 gap-3"
                                onClick={() => {
                                  if (corrected) {
                                    setReport(true);
                                    goToStep("prepare");
                                  } else {
                                    setCorrected(true);
                                  }
                                }}
                              >
                                {corrected
                                  ? "See the workflow result"
                                  : "See the corrected upload"}
                                <ArrowRight aria-hidden />
                              </Button>
                            </>
                          )}
                          {item.id === "prepare" && (
                            <>
                              <PrepareExample example={example} report={report} />
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
                        Fictional example with automation enabled. Buttons explore
                        the preview; no emails are sent or workflows run here.
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </LandingTransition>
            </Tabs>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
