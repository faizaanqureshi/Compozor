import depth from "@/components/landing-depth.module.css";
import { ClipboardList, Mail, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Matches the citation chips in the app's Ask answers.
const CHIP =
  "inline-flex h-5 translate-y-[-1px] items-center gap-1 rounded-md bg-muted px-1.5 align-middle text-[0.6875rem] leading-none font-medium text-muted-foreground";

/** Static illustration of an Ask exchange. Fictional data; nothing here runs. */
export function LandingAskPreview() {
  return (
    <figure
      className={`${depth.paper} overflow-hidden rounded-xl border border-border bg-card`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <p className="flex items-center gap-2 text-sm">
          <Sparkles
            className="size-3.5 text-marketing-forest dark:text-marketing-brass"
            aria-hidden
          />
          Ask
        </p>
        <span className="text-[0.625rem] uppercase tracking-widest text-muted-foreground">
          Illustrative preview
        </span>
      </div>
      <div className="space-y-5 p-5 sm:p-6">
        <p className="ml-auto w-fit max-w-[85%] rounded-lg bg-muted px-4 py-3 text-sm">
          Which tax clients are still missing a slip?
        </p>
        <p className="text-sm leading-relaxed">
          Two clients. Maya Chen sent a 2024 T4, and Compozor asked her for
          the 2025 slip{" "}
          <span className={CHIP}>
            <Mail className="size-3 shrink-0" strokeWidth={1.75} aria-hidden />
            Email · 3 Nov
          </span>
          . Jonah Price hasn’t sent his T5 yet{" "}
          <span className={CHIP}>
            <ClipboardList
              className="size-3 shrink-0"
              strokeWidth={1.75}
              aria-hidden
            />
            Checklist
          </span>
          .
        </p>
        <div className="rounded-lg border border-border p-4">
          <p className="flex items-center gap-2 text-sm">
            <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            Reminder for Jonah Price
          </p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            One email listing what’s still outstanding, from your connected
            mailbox.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className={cn(buttonVariants({ size: "sm" }), "pointer-events-none")}>
              Send reminder
            </span>
            <span className="text-xs text-muted-foreground">
              Nothing happens until you confirm.
            </span>
          </div>
        </div>
      </div>
      <figcaption className="border-t border-border px-5 py-3 text-[0.625rem] text-muted-foreground sm:px-6">
        Fictional example · no emails are sent here
      </figcaption>
    </figure>
  );
}
