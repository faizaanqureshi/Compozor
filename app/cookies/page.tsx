import { publicPageMetadata } from "@/lib/seo";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal-page-shell";

export const metadata = publicPageMetadata("/cookies");

export default function CookiePolicyPage() {
  return (
    <LegalPageShell title="Cookie Policy" lastUpdated="September 28, 2026">
      <LegalSection heading="1. What cookies are">
        <p>
          Cookies are small pieces of data stored in your browser. They can
          be used for things like keeping you signed in, remembering
          preferences, or tracking activity across sites for advertising.
        </p>
      </LegalSection>

      <LegalSection heading="2. Cookies we use today">
        <p>
          Compozor uses only <strong className="text-foreground">strictly
          necessary cookies and browser storage</strong>:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li><strong className="text-foreground">Sign-in cookies</strong> set by our authentication provider, Clerk, which keep you signed in and protect your session.</li>
          <li><strong className="text-foreground">Mailbox connection cookies</strong> (<code className="rounded bg-muted px-1 py-0.5 text-xs">gmail_oauth_state</code>, <code className="rounded bg-muted px-1 py-0.5 text-xs">outlook_oauth_state</code>) set for up to 10 minutes only while you connect a Gmail or Outlook mailbox, so that only your browser can complete the connection.</li>
          <li><strong className="text-foreground">Client portal cookie</strong> (<code className="rounded bg-muted px-1 py-0.5 text-xs">compozor_portal_session</code>) set after a firm&apos;s client confirms their email with a one-time code. It keeps them signed in to the questionnaire portal for up to 4 hours, and ends after 30 minutes of inactivity.</li>
          <li><strong className="text-foreground">Browser storage</strong> that remembers your progress through the product tour, an in-progress client import, and which questionnaire builder sections you have collapsed.</li>
        </ul>
        <p>
          We do not use any advertising, marketing, or analytics cookies, and
          we don&apos;t run any behavioral tracking or third-party ad scripts
          on this site.
        </p>
      </LegalSection>

      <LegalSection heading="3. Why no consent banner">
        <p>
          Strictly necessary cookies — the kind needed for you to log in and
          use the service — don&apos;t require consent under applicable
          cookie and privacy laws, which is why this site doesn&apos;t show
          a cookie-consent banner today. If we add analytics, marketing, or
          other non-essential cookies in the future, we&apos;ll update this
          policy and, where legally required (for example, for visitors in
          the EU/UK), request your consent before those cookies are set.
        </p>
      </LegalSection>

      <LegalSection heading="4. Your choices">
        <p>
          Most browsers let you block or delete cookies through their
          settings. Because our cookies are needed for signing in and
          connecting a mailbox, blocking them will prevent those from
          working.
        </p>
        <p>
          Compozor honors the Global Privacy Control (GPC) signal as an
          opt-out-of-sale/sharing preference where required by law, although
          we do not currently sell or share personal information in the
          way those laws define it. See our{" "}
          <Link href="/privacy" className="text-foreground underline underline-offset-2">
            Privacy Policy
          </Link>{" "}
          for more on your data rights.
        </p>
      </LegalSection>

      <LegalSection heading="5. Changes to this policy">
        <p>
          We&apos;ll update this page if the cookies we use change. Check
          the &quot;Last updated&quot; date above for the most recent
          revision.
        </p>
      </LegalSection>

      <LegalSection heading="6. Contact us">
        <p>
          Questions about this policy can be sent to{" "}
          <a href="mailto:support@compozor.com" className="text-foreground underline underline-offset-2">
            support@compozor.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
