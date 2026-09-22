import depth from "@/components/landing-depth.module.css";
import Image from "next/image";
import { LandingPractices } from "@/components/landing-practices";
import { LandingWorkSample } from "@/components/landing-work-sample";
import { MarketingActions } from "@/components/marketing-actions";

export function LandingSections() {
  return (
    <>
      <section
        id="workflows"
        className="scroll-mt-24 border-y border-border/60 bg-muted/40 py-20 text-foreground sm:py-28"
      >
        <div className="mx-auto max-w-7xl px-6 sm:px-10">
          <div
            data-reveal="focus"
            className="mb-12 grid items-end gap-8 lg:grid-cols-2 lg:gap-24"
          >
            <div>
              <p className="text-xs uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
                Workflows & work samples
              </p>
              <h2 className="mt-5 text-5xl leading-tight font-thin tracking-tight sm:text-6xl [font-family:var(--font-denton)]">
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
      <section className="border-y border-border bg-marketing-brass/5 py-20 sm:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 sm:px-10 md:grid-cols-2 md:gap-24">
          <div data-reveal="focus">
            <p className="text-xs uppercase tracking-widest text-marketing-forest dark:text-marketing-brass">
              Trust & control
            </p>
            <h2 className="mt-5 text-3xl leading-tight font-light tracking-tight sm:text-4xl">
              Automation,
              <br />
              on your terms.
            </h2>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
              Keep the decisions that need your judgment. Let Compozor take care
              of the follow-through.
            </p>
          </div>
          <div className="divide-y divide-border">
            {[
              [
                "You choose what runs",
                "Review drafted emails before sending, or enable automatic sending. Start workflows yourself or run them when collection is complete.",
              ],
              [
                "You can see what happened",
                "Client conversations, checklist progress, workflow activity, and output review notes stay with the work.",
              ],
              [
                "You handle the exceptions",
                "Uncertain documents and unresolved questions are surfaced for your team, with the context to make a decision.",
              ],
            ].map(([title, copy]) => (
              <div
                data-reveal="later"
                key={title}
                className="py-6 first:pt-0 last:pb-0"
              >
                <h3 className="text-lg text-marketing-forest dark:text-marketing-brass">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {copy}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export function LandingClosing() {
  return (
    <section className={`${depth.ambient} bg-sidebar text-sidebar-foreground`}>
      <div className="mx-auto grid max-w-5xl items-start gap-8 px-6 py-20 sm:px-10 sm:py-24 md:grid-cols-[1fr_160px] md:gap-16">
        <div data-reveal="focus">
          <p className="text-xs uppercase tracking-widest text-marketing-brass">
            An invitation to work differently
          </p>
          <h2 className="mt-5 max-w-2xl text-5xl leading-tight font-thin tracking-tight text-balance sm:text-6xl [font-family:var(--font-denton)]">
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
        </div>
        <Image
          data-reveal="later"
          src="/android-chrome-512x512.png"
          alt=""
          width={512}
          height={512}
          unoptimized
          className="order-first size-20 object-contain md:order-last md:mt-14 md:size-40"
        />
      </div>
    </section>
  );
}
