"use client";

import styles from "@/components/landing-motion.module.css";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function LandingFaq() {
  return (
    <section
      className={`${styles.faq} mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:px-10 sm:py-28 md:grid-cols-[0.7fr_1fr] md:gap-24`}
    >
      <h2 data-reveal="focus" className="text-3xl font-light tracking-tight">
        A few things
        <br />
        you might be wondering.
      </h2>
      <Accordion data-reveal>
        {[
          [
            "Do my clients need another account?",
            "No. Clients can reply to your firm’s emails with attachments or use a secure upload link. Your team manages the work in Compozor.",
          ],
          [
            "Is this only for accounting firms?",
            "No. Compozor supports professional service firms with different document requirements and workflows. You define your practice, what each client needs to provide, and the work to prepare.",
          ],
          [
            "Can I review work before it goes out?",
            "Yes. You control email automation and can review drafts before sending. Workflow outputs are available to your team with checks and review notes; unresolved issues are flagged for attention.",
          ],
          [
            "How do work samples help?",
            "Upload an example report, workbook, letter, or presentation alongside your workflow instructions. Compozor uses it to guide the output’s style and structure, while drawing the content from your client’s documents.",
          ],
          [
            "How can my firm get access?",
            "Book a demo to walk through your firm’s process, or join the waitlist. We invite firms as early access opens. Existing users can continue to sign in.",
          ],
        ].map(([question, answer], i) => (
          <AccordionItem key={question} value={i}>
            <AccordionTrigger className="py-5 text-base font-normal">
              {question}
            </AccordionTrigger>
            <AccordionContent className="pb-5 pr-8 text-sm leading-relaxed text-muted-foreground">
              {answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
