import depth from "@/components/landing-depth.module.css";
import Image from "next/image";
import {
  Check,
  ChevronRight,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Mail,
  Users,
  Workflow,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** A presentation of the client workspace with fictional data; no real client records. */
export function LandingWorkspacePreview() {
  return (
    <figure data-reveal className="mt-12 sm:mt-16">
      <div className={`${depth.stage} overflow-hidden rounded-xl bg-marketing-forest p-3 sm:p-8 lg:px-14 lg:pt-12 lg:pb-10`}>
        <div className="mb-6 hidden items-center justify-between text-xs text-sidebar-foreground sm:flex">
          <span className="uppercase tracking-widest">
            The work, all together
          </span>
          <span className="text-sidebar-foreground/80">
            Collect. Check. Prepare.
          </span>
        </div>
        <div className={`${depth.workspace} grid overflow-hidden rounded-lg border border-sidebar-foreground/20 bg-card md:grid-cols-[150px_1fr] lg:grid-cols-[175px_1fr]`}>
          <div className="hidden flex-col bg-sidebar px-4 py-6 text-sidebar-foreground md:flex">
            <Image
              src="/compozor-logo-dark.png"
              alt="Compozor"
              width={795}
              height={214}
              className="mb-10 h-auto w-28 brightness-0 invert"
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
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-7">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                Clients <ChevronRight className="size-3" aria-hidden />
                <span className="text-foreground">Avery Williams</span>
              </p>
              <span className="hidden text-[0.625rem] uppercase tracking-widest text-muted-foreground sm:block">
                Illustrative preview
              </span>
            </div>
            <div className="p-5 sm:p-7">
              <div className="mb-7 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-normal tracking-tight sm:text-2xl">
                    Avery Williams
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Monthly bookkeeping · August 2026
                  </p>
                </div>
                <Badge variant="success" className="h-6 gap-1.5">
                  <Check aria-hidden /> Ready for review
                </Badge>
              </div>
              <div className="grid gap-7 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <p className="mb-3 text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
                    Document checklist
                  </p>
                  {[
                    ["Bank statement", "August 2026"],
                    ["Expense receipts", "8 files received"],
                    ["Income statement", "August 2026"],
                  ].map(([label, note]) => (
                    <div
                      key={label}
                      className="flex items-center gap-3 border-b border-border py-3"
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
                    </div>
                  ))}
                  <div className="mt-4 flex gap-2 text-xs leading-relaxed text-muted-foreground">
                    <Mail
                      className="mt-0.5 size-3.5 shrink-0 text-marketing-forest"
                      aria-hidden
                    />
                    <span>
                      Follow-up sent. Remaining receipts received and matched.
                    </span>
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-background p-4 sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <p className="text-[0.6875rem] uppercase tracking-widest text-muted-foreground">
                      Workflow
                    </p>
                    <span className="text-xs text-success">Completed</span>
                  </div>
                  <p className="text-base tracking-tight">
                    Monthly expense report
                  </p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="size-3.5" aria-hidden /> Guided by your
                    work sample
                  </div>
                  <ul className="mt-5 space-y-2.5 text-xs">
                    {[
                      "Transactions extracted",
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
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>Every conversation, document, and next step in context.</span>
        <span>Illustrative workspace · Fictional client data</span>
      </figcaption>
    </figure>
  );
}
