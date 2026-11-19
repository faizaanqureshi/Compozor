import depth from "@/components/landing-depth.module.css";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { LandingAskPreview } from "@/components/landing-ask-preview";
import { LandingPractices } from "@/components/landing-practices";
import { LandingWorkSample } from "@/components/landing-work-sample";
import { MarketingActions } from "@/components/marketing-actions";
import { ArrowUpRight } from "lucide-react";

/** Heading and short copy beside a list of plain statements. */
function SplitSection({
  id,
  className,
  eyebrow,
  title,
  copy,
  items,
  aside,
}: {
  id?: string;
  className?: string;
  eyebrow: string;
  title: ReactNode;
  copy: ReactNode;
  items: [string, string][];
  aside?: ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-24 py-16 sm:py-28", className)}>
      <div className="mx-auto grid max-w-7xl gap-8 px-6 sm:gap-12 sm:px-10 md:grid-cols-2 md:gap-24">
        <div data-reveal="focus" className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
            {eyebrow}
          </p>
          <h2 className="mt-5 text-4xl leading-tight font-light tracking-tight [font-family:var(--font-display)] sm:text-4xl sm:font-light sm:[font-family:inherit]">
            {title}
          </h2>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            {copy}
          </p>
          {aside && <div className="mt-10 max-w-lg">{aside}</div>}
        </div>
        <div className="divide-y divide-border">
          {items.map(([itemTitle, itemCopy]) => (
            <div
              data-reveal="later"
              key={itemTitle}
              className="py-6 first:pt-0 last:pb-0"
            >
              <h3 className="text-lg text-marketing-forest dark:text-marketing-brass">
                {itemTitle}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {itemCopy}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LandingSections() {
  return (
    <>
      <section
        id="workflows"
        className="scroll-mt-24 border-y border-border/60 bg-muted/40 py-16 text-foreground sm:py-28"
      >
        <div className="mx-auto max-w-7xl px-6 sm:px-10">
          <div
            data-reveal="focus"
            className="mb-8 grid sm:mb-12 items-end gap-8 lg:grid-cols-2 lg:gap-24"
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
                Workflows & work samples
              </p>
              <h2 className="mt-5 text-[2.625rem] leading-tight font-light tracking-tight sm:text-6xl [font-family:var(--font-display)]">
                Your instructions.
                <br />
                Your firm’s signature.
              </h2>
            </div>
            <div className="max-w-md lg:pb-2">
              <p className="text-base leading-relaxed text-muted-foreground">
                The details make it yours. Give Compozor an example of your
                work, then use your client’s documents to prepare a new
                version—with the structure, figures, and supporting detail your
                team needs.
              </p>
              <p className="mt-6 text-xs uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
                Word · Excel · PowerPoint · PDF
              </p>
            </div>
          </div>
          <div data-reveal>
            <LandingWorkSample />
          </div>
        </div>
      </section>
      <LandingPractices />
      <SplitSection
        id="ask"
        className="border-y border-border/60 bg-muted/40"
        eyebrow="Ask & teams"
        title={<>Ask about any client.<br />Share the work.</>}
        copy="Ask answers questions about your clients and your firm, and can carry out the work with you. Your team shares the clients, each from their own mailbox."
        aside={<LandingAskPreview />}
        items={[
          [
            "Answers that show their source",
            "Each fact links to the email, document page, or checklist it came from. If Ask can’t find something, it says so.",
          ],
          [
            "Your Knowledge and the web",
            "Ask searches the fees, policies, and procedures your firm has written down, and the public web for rules and deadlines.",
          ],
          [
            "It does the work. You confirm it.",
            "Ask can add clients, assign packages, update checklists, and draft emails. Each change waits for a staff member to confirm it.",
          ],
          [
            "A mailbox for each person",
            "Each staff member can connect their own Gmail or Outlook. Email to the clients they look after goes out from it.",
          ],
          [
            "Clients assigned to staff",
            "Admins assign each client to someone on the team. Staff can take on unassigned clients themselves.",
          ],
        ]}
      />
      <SplitSection
        eyebrow="Trust & control"
        title={<>Automation,<br />on your terms.</>}
        copy="Keep the decisions that need your judgment. Let Compozor take care of the follow-through."
        items={[
          [
            "You choose what runs",
            "Drafted emails wait for your approval until you turn on automatic sending. Workflows run when you start them, or when a client’s checklist is complete.",
          ],
          [
            "You can see where it came from",
            "Client conversations, checklist progress, and workflow activity stay with the work. Prepared work comes with checks and review notes.",
          ],
          [
            "You handle the exceptions",
            "Uncertain documents and unresolved questions are surfaced for your team, with the context to make a decision.",
          ],
        ]}
      />
      <SplitSection
        id="security"
        className="border-y border-border bg-muted/60"
        eyebrow="Security & privacy"
        title={<>Client data,<br />kept in its place.</>}
        copy={
          <>
            Short answers to the questions firms ask first. Our{" "}
            <Link
              href="/privacy"
              className="underline decoration-accent underline-offset-4 transition-colors hover:text-foreground"
            >
              privacy policy
            </Link>{" "}
            has the details.
          </>
        }
        items={[
          [
            "Where is client data stored?",
            "Documents and prepared files are kept in cloud storage, and everything else in Compozor’s database. Every record belongs to one firm, and each firm can only reach its own. Our privacy policy lists every provider we use.",
          ],
          [
            "Who can see it?",
            "Only the people your firm invites. Admins manage the team, the firm mailbox, and deletions. Email in a staff member’s own mailbox that isn’t about a client stays private to them.",
          ],
          [
            "Does AI train on our data?",
            "Compozor doesn’t train AI models on your firm’s or your clients’ data.",
          ],
          [
            "How are sensitive details handled?",
            "Questionnaire answers, upload links, and mailbox sign-in credentials are encrypted in the database. When Ask or the email assistant reads questionnaire answers, SIN, banking, ID numbers, dates of birth, and health details are left out.",
          ],
        ]}
      />
    </>
  );
}

export function LandingClosing() {
  return (
    <section className={`${depth.ambient} bg-sidebar text-sidebar-foreground`}>
      <div className="mx-auto grid max-w-5xl items-start gap-8 px-6 py-20 sm:px-10 sm:py-24 md:grid-cols-[1fr_160px] md:gap-16">
        <div data-reveal="focus">
          <p className="text-xs uppercase tracking-widest text-sidebar-foreground/70">
            An invitation to work differently
          </p>
          <h2 className="mt-5 max-w-2xl text-5xl leading-tight font-light tracking-tight text-balance sm:text-6xl [font-family:var(--font-display)]">
            See how Compozor
            <br />
            fits your firm.
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-sidebar-foreground/90">
            Bring a workflow you do every week. We’ll explore how Compozor could
            handle it with you.
          </p>
          <MarketingActions inverse className="mt-8" />
          <p className="mt-4 text-xs text-sidebar-foreground/75">
            30-minute walkthrough · Early access by invitation
          </p>
          <p className="mt-8 border-t border-sidebar-foreground/15 pt-6 text-sm text-sidebar-foreground/90">
            Every plan is all of Compozor.{" "}
            <Link
              href="/pricing"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-sm underline underline-offset-4 transition-colors hover:text-sidebar-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            >
              See pricing <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </p>
        </div>
        <Image
          data-reveal="later"
          src="/compozor-mark-white.png"
          alt=""
          width={512}
          height={512}
          unoptimized
          className="order-first size-20 object-contain max-sm:hidden md:order-last md:mt-14 md:size-40"
        />
      </div>
    </section>
  );
}
