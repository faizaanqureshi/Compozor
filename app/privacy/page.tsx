import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal-page-shell";

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated="September 21, 2026">
      <LegalSection heading="1. Who this policy covers">
        <p>
          Compozor (&quot;Compozor,&quot; &quot;we,&quot; &quot;us&quot;),
          based in Canada, is a document-collection and inbox-automation tool for
          professional service firms (accounting, tax, immigration law,
          mortgage brokering, and similar practices) — it watches a firm&apos;s
          inbox, matches incoming email and documents to the right client,
          and can draft or send follow-up communications on the firm&apos;s
          behalf.
        </p>
        <p>
          This policy covers two different groups of people, and it says
          which applies where it matters:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong className="text-foreground">Firm users</strong> — the
            accountants, lawyers, brokers, and staff who sign up for and
            operate a Compozor account.
          </li>
          <li>
            <strong className="text-foreground">Clients of a firm</strong> —
            the firm&apos;s own customers, who interact with Compozor only
            indirectly: by emailing the firm (whose inbox Compozor watches)
            or by uploading documents through a link the firm sends them.
            For this group, the firm is the party responsible for their
            data (see &quot;Our role as a service provider,&quot; below) —
            questions about a specific firm&apos;s use of your information
            should go to that firm first.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. Information we collect">
        <p>
          <strong className="text-foreground">Account &amp; organization
          data.</strong> Name, email address, and authentication data
          (handled by our authentication provider, Clerk), plus the firm
          information entered during onboarding — firm name, a description
          of the practice, and jurisdiction.
        </p>
        <p>
          <strong className="text-foreground">Gmail data.</strong> If a firm
          connects a Gmail mailbox, we access that mailbox through Google&apos;s
          Gmail API using the <code className="rounded bg-muted px-1 py-0.5 text-xs">gmail.readonly</code>{" "}
          scope, with the firm&apos;s explicit authorization via Google&apos;s
          OAuth consent flow. We use this access only to identify
          correspondence from the firm&apos;s clients, extract and classify
          attached documents, track outstanding document requests, and
          generate suggested (or, where the firm has opted in, automatically
          sent) replies. We do not use Gmail data for advertising, we do not
          sell it, and we do not use it to develop, improve, or train
          generalized or non-personalized AI/machine-learning models, in
          line with Google API Services User Data Policy.
        </p>
        <p>
          <strong className="text-foreground">Uploaded documents.</strong>{" "}
          When a firm&apos;s client uploads files through a Compozor upload
          link, we receive those files and any information the client
          enters alongside them. Depending on the firm&apos;s practice, this
          can include tax records, financial statements, identification
          documents, or immigration paperwork — whatever the firm has
          requested from its client.
        </p>
        <p>
          <strong className="text-foreground">Usage &amp; support
          data.</strong> Technical logs needed to operate and secure the
          service (timestamps, error reports, API request metadata), and
          any information provided when contacting us for support.
        </p>
      </LegalSection>

      <LegalSection heading="3. How we use information">
        <ul className="ml-5 list-disc space-y-1">
          <li>To operate the service: matching emails to clients, classifying and filing documents, tracking checklists, and drafting or sending replies.</li>
          <li>To process documents and email content using AI models (see &quot;AI processing &amp; sub-processors&quot;) in order to provide the classification, matching, and drafting features described above.</li>
          <li>To maintain, secure, and improve Compozor, including detecting and preventing abuse.</li>
          <li>To communicate with firm users about their account and the service.</li>
          <li>To comply with legal obligations, including the security and recordkeeping obligations described below.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="4. AI processing &amp; sub-processors">
        <p>
          Compozor uses the following third-party services to provide the
          product. Each is a sub-processor acting on our (and, in turn, the
          firm&apos;s) instructions, and none is authorized to use the data
          we send it to train general-purpose AI/ML models or for its own
          independent purposes:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li><strong className="text-foreground">OpenAI</strong> — processes email and document content to classify documents, match them to requests, and draft client communications. OpenAI does not train its models on data submitted through its API.</li>
          <li><strong className="text-foreground">Google (Gmail API)</strong> — provides the mailbox access described above, under the firm&apos;s own OAuth authorization.</li>
          <li><strong className="text-foreground">Clerk</strong> — handles authentication and account/session management.</li>
          <li><strong className="text-foreground">Cloudflare (R2)</strong> — stores uploaded documents and files.</li>
          <li><strong className="text-foreground">Sentry</strong> — receives technical error/performance data to help us fix problems; not used to process email or document content.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Our role as a service provider">
        <p>
          For data belonging to a firm&apos;s clients, the firm is the party
          that decides what data to collect and why (the &quot;controller&quot;
          or &quot;business,&quot; depending on the applicable law), and
          Compozor processes that data only on the firm&apos;s instructions,
          as its service provider/processor. Firms that are themselves
          subject to the Gramm-Leach-Bliley Act and the FTC Safeguards
          Rule (which generally includes tax and accounting practices) may
          rely on this section, together with a separate data-processing or
          security addendum available on request, to document our role as
          their service provider.
        </p>
      </LegalSection>

      <LegalSection heading="6. Data retention">
        <p>
          We retain account and client data for as long as the firm&apos;s
          account is active. After an account is closed, data is retained
          for a limited period to allow export, then deleted, unless a
          longer period is required by law or is needed to resolve
          disputes. Firms can request deletion of specific client records
          or their full account at any time by contacting us.
        </p>
      </LegalSection>

      <LegalSection heading="7. Security">
        <p>
          We use administrative, technical, and physical safeguards
          designed to protect the confidentiality, integrity, and
          availability of the data we hold, including encryption in transit
          and at rest, access controls limiting who can view client data,
          and monitoring for security events. No method of transmission or
          storage is perfectly secure, and we cannot guarantee absolute
          security.
        </p>
      </LegalSection>

      <LegalSection heading="8. Cookies">
        <p>
          Compozor uses a minimal set of cookies, described in full in our{" "}
          <Link href="/cookies" className="text-foreground underline underline-offset-2">
            Cookie Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="9. Your privacy rights">
        <p>
          Depending on where you live, you may have rights to know what
          personal information we hold about you, to request a copy of it,
          to correct it, or to request its deletion. We do not sell personal
          information, and we honor Global Privacy Control (GPC) opt-out
          signals where legally required. If you are a client of a firm
          that uses Compozor, we&apos;ll direct requests about your data to
          that firm where they&apos;re better positioned to respond, unless
          the law requires us to respond directly. To exercise these
          rights, contact us at{" "}
          <a href="mailto:info@compozor.com" className="text-foreground underline underline-offset-2">
            info@compozor.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection heading="10. International data transfers">
        <p>
          Compozor and its sub-processors primarily operate and store data
          in the United States. If you or the firm you work with are
          located outside the United States, your information may be
          transferred to, stored, and processed in the United States or
          other countries, which may have different data protection laws
          than your own.
        </p>
      </LegalSection>

      <LegalSection heading="11. Children's privacy">
        <p>
          Compozor is a business tool intended for use by professional
          service firms and their adult clients. It is not directed to, and
          we do not knowingly collect personal information from, children.
        </p>
      </LegalSection>

      <LegalSection heading="12. Changes to this policy">
        <p>
          We may update this policy from time to time. If we make material
          changes, we&apos;ll update the &quot;Last updated&quot; date above
          and, where appropriate, notify firm users directly.
        </p>
      </LegalSection>

      <LegalSection heading="13. Contact us">
        <p>
          Questions about this policy or your data can be sent to{" "}
          <a href="mailto:info@compozor.com" className="text-foreground underline underline-offset-2">
            info@compozor.com
          </a>
          . Compozor is based in Canada.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
