import depth from "@/components/landing-depth.module.css";
import styles from "@/components/landing-workspace-preview.module.css";
import Image from "next/image";
import {
  Check,
  Download,
  Ellipsis,
  Plus,
  RotateCcw,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Mail,
  Users,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

/** Static product illustration. Controls are visual details, not live app actions. */
export function LandingWorkspacePreview() {
  return (
    <figure data-reveal className="mx-auto mt-10 w-full max-w-[112rem] px-6 sm:mt-16 sm:px-5 lg:px-6">
      <div className={`${depth.stage} ${styles.stage} overflow-hidden rounded-xl bg-marketing-forest`}>
        <div className={`${depth.workspace} ${styles.workspace} relative z-10 grid overflow-hidden rounded-lg border border-sidebar-foreground/20 bg-card md:grid-cols-[150px_1fr] lg:grid-cols-[175px_1fr]`}>
          <div className="hidden flex-col bg-sidebar px-4 py-6 text-sidebar-foreground md:flex">
            <Image
              src="/compozor-wordmark-light.png"
              alt="Compozor"
              width={789}
              height={140}
              className="mb-10 h-auto w-28"
            />
            <div className="space-y-1">
              {[
                { label: "Clients", icon: Users, active: true },
                { label: "Email log", icon: Mail },
                { label: "Packages", icon: FolderOpen },
                { label: "Workflows", icon: Workflow },
              ].map(({ label, icon: Icon, active }) => (
                <div
                  key={label}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-xs ${active ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/85"}`}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </div>
              ))}
            </div>
            <p className="mt-auto pt-12 text-[0.625rem] uppercase tracking-widest text-sidebar-foreground/70">
              Example workspace
            </p>
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-7">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                Clients <ChevronRight className="size-3" aria-hidden />
                <span className="text-foreground">Avery Williams</span>
              </p>
              <span className="hidden text-[0.625rem] uppercase tracking-widest text-muted-foreground sm:block">
                Illustrative preview
              </span>
            </div>
            <div className="flex flex-1 flex-col p-4 sm:p-7 lg:py-9">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-7 lg:mb-10">
                <div>
                  <h2 className="text-xl font-normal tracking-tight sm:text-2xl">
                    Avery Williams
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Monthly bookkeeping · August 2026
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge variant="success" className="h-6 gap-1.5">
                    <Check aria-hidden /> Ready for review
                  </Badge>
                  <span className={`${buttonVariants({ variant: "outline", size: "sm" })} max-sm:hidden`}>
                    <Plus aria-hidden /> Assign package
                  </span>
                </div>
              </div>
              <div className="grid flex-1 gap-5 sm:gap-7 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="lg:flex lg:flex-col">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
                      Document checklist
                    </p>
                    <span className="text-[0.625rem] text-muted-foreground">3 of 3 satisfied</span>
                  </div>
                  {[
                    ["Bank statement", "August 2026"],
                    ["Expense receipts", "8 files received"],
                    ["Income statement", "August 2026"],
                  ].map(([label, note]) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 border-b border-border py-3 lg:py-5"
                    >
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
                        <Check className="size-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs sm:text-sm">{label}</p>
                        <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                          {note}
                        </p>
                      </div>
                      <Ellipsis className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </div>
                  ))}
                  <div className="mt-4 flex gap-2 text-xs leading-relaxed max-sm:hidden lg:mt-auto lg:pt-5 text-muted-foreground">
                    <Mail
                      className="mt-0.5 size-3.5 shrink-0 text-marketing-forest"
                      aria-hidden
                    />
                    <span>
                      Compozor requested the correct period, checked the replacement, and started the workflow.
                    </span>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3 max-sm:hidden">
                    <span className={buttonVariants({ variant: "outline", size: "xs" })}>
                      <Mail aria-hidden /> Send reminder
                    </span>
                    <span className="text-[0.6875rem] text-muted-foreground">View email log</span>
                  </div>
                </div>
                <div className="flex flex-col rounded-lg border border-border bg-background p-4 sm:p-5 lg:p-6">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <p className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
                      Workflow
                    </p>
                    <span className="text-xs text-success">Completed</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-base tracking-tight">Monthly expense report</p>
                    <span className={`${buttonVariants({ variant: "outline", size: "xs" })} max-sm:hidden`}>
                      <RotateCcw aria-hidden /> Rerun
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground max-sm:hidden">
                    <FileText className="size-3.5" aria-hidden /> Guided by your
                    work sample
                  </div>
                  <ul className="mt-5 space-y-2.5 text-xs max-sm:hidden lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:gap-4 lg:space-y-0 lg:py-5">
                    {[
                      "Started after requirements were met",
                      "Report prepared in your format",
                      "Output checks complete",
                    ].map((text) => (
                      <li key={text} className="flex items-center gap-2">
                        <Check className="size-3 text-success" aria-hidden />
                        {text}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-marketing-forest text-sidebar-foreground">
                      <FileSpreadsheet className="size-4" aria-hidden />
                    </div>
                    <div className="min-w-0">
                      <p className="break-words text-xs font-medium">
                        Expense_report_August.xlsx
                      </p>
                      <p className="mt-1 text-[0.6875rem] text-muted-foreground">
                        Prepared for your team’s review
                      </p>
                    </div>
                    <Download className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 flex flex-wrap justify-between gap-2 text-xs leading-relaxed text-muted-foreground">
        <span className="max-sm:hidden">Every conversation, document, and next step in context.</span>
        <span>Static product preview · Fictional client data</span>
      </figcaption>
    </figure>
  );
}
