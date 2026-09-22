import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal-page-shell";

export default function CookiePolicyPage() {
  return (
    <LegalPageShell title="Cookie Policy" lastUpdated="September 21, 2026">
      <LegalSection heading="1. What cookies are">
        <p>
          Cookies are small pieces of data stored in your browser. They can
          be used for things like keeping you signed in, remembering
          preferences, or tracking activity across sites for advertising.
        </p>
      </LegalSection>

      <LegalSection heading="2. Cookies we use today">
        <p>
          Compozor currently uses only <strong className="text-foreground">strictly
          necessary cookies</strong> — specifically, the session cookie set
          by our authentication provider, Clerk, which keeps you signed in
          while using the app. We do not currently use any advertising,
          marketing, or analytics cookies, and we don&apos;t currently run
          any behavioral tracking or third-party ad scripts on this site.
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
          settings. Because our only current cookie is the sign-in session
          cookie, blocking it will prevent you from staying signed in to
          Compozor.
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
          <a href="mailto:info@compozor.com" className="text-foreground underline underline-offset-2">
            info@compozor.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
