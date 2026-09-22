import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal-page-shell";

export default function TermsPage() {
  return (
    <LegalPageShell title="Terms &amp; Conditions" lastUpdated="September 21, 2026">
      <LegalSection heading="1. Acceptance of these terms">
        <p>
          These Terms &amp; Conditions (&quot;Terms&quot;) govern access to
          and use of Compozor (&quot;Compozor,&quot; &quot;we,&quot;
          &quot;us&quot;), a document-collection and inbox-automation
          service. By creating an account or using Compozor, you agree to
          these Terms on behalf of yourself and the firm you represent. If
          you don&apos;t agree, don&apos;t use the service.
        </p>
      </LegalSection>

      <LegalSection heading="2. Description of the service">
        <p>
          Compozor connects to a firm&apos;s inbox (e.g., Gmail) and
          document-upload links, uses automated and AI-assisted processing
          to classify and match incoming client documents and messages
          against a checklist the firm configures, and can draft and, at
          the firm&apos;s chosen automation level, automatically send
          replies to the firm&apos;s clients.
        </p>
      </LegalSection>

      <LegalSection heading="3. Eligibility &amp; accounts">
        <p>
          You must be an authorized representative of the firm you&apos;re
          signing up on behalf of, and you must have the authority to
          connect the firm&apos;s mailbox and to submit the firm&apos;s
          client data for processing by Compozor. You&apos;re responsible
          for keeping your account credentials secure and for all activity
          under your account.
        </p>
      </LegalSection>

      <LegalSection heading="4. Your data, and your responsibility for it">
        <p>
          Data you or your clients submit to Compozor — email content,
          uploaded documents, checklist information — remains your (or your
          client&apos;s) property. We&apos;re granted only a limited license
          to process it in order to provide the service, as described in
          our{" "}
          <Link href="/privacy" className="text-foreground underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
        <p>
          You are responsible for having the appropriate authorization,
          notice, or consent from your own clients before submitting their
          information to Compozor, and for your own compliance with any law
          or professional obligation that applies to your practice —
          including, where applicable, the Gramm-Leach-Bliley Act, state
          privacy laws, and professional confidentiality rules for your
          field (e.g., attorney-client confidentiality, accountant
          practitioner obligations). Compozor is a tool that helps you meet
          those obligations more efficiently; it doesn&apos;t take on your
          professional or regulatory responsibilities for you.
        </p>
      </LegalSection>

      <LegalSection heading="5. AI-generated content is not professional advice">
        <p>
          Compozor uses AI (including third-party models such as OpenAI&apos;s)
          to classify documents and to draft — and, depending on your
          automation settings, to send — communications to your clients. AI
          output can be inaccurate or inappropriate for a given situation.{" "}
          <strong className="text-foreground">
            AI-generated content is not legal, tax, accounting, financial,
            or immigration advice, and Compozor is not a substitute for
            your own professional judgment.
          </strong>
        </p>
        <p>
          You are solely responsible for reviewing and approving any
          AI-drafted communication before it&apos;s relied upon, and for
          everything that is sent to your clients under your firm&apos;s
          name — regardless of whether a human at your firm reviewed a
          specific message before it went out.
        </p>
        <p>
          Compozor supports multiple automation levels, up to fully
          automatic sending with no per-message human review. Choosing a
          higher automation level is your deliberate decision. If you
          enable automatic sending, you accept full responsibility for the
          content of communications sent to your clients under that
          setting, to the same extent as if a member of your firm had
          written and sent them personally.
        </p>
      </LegalSection>

      <LegalSection heading="6. Acceptable use">
        <ul className="ml-5 list-disc space-y-1">
          <li>Don&apos;t use Compozor for any unlawful purpose, or to submit data you&apos;re not authorized to share.</li>
          <li>Don&apos;t attempt to bypass, disable, or interfere with security features of the service.</li>
          <li>Don&apos;t reverse-engineer, decompile, or attempt to extract the source code of the service, except as permitted by law.</li>
          <li>Don&apos;t use the service to send spam or communications that violate applicable email or communications law.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="7. Third-party services">
        <p>
          Compozor depends on third-party services — including Google,
          OpenAI, Clerk, and Cloudflare — to operate. We aren&apos;t
          responsible for outages, changes, or limitations in those
          services that are outside our control.
        </p>
      </LegalSection>

      <LegalSection heading="8. Fees">
        <p>
          Compozor is currently offered to early customers under terms
          communicated directly to them. If and when paid plans are
          introduced generally, pricing and billing terms will be presented
          separately and no charge will be made without your agreement to
          those terms.
        </p>
      </LegalSection>

      <LegalSection heading="9. Term &amp; termination">
        <p>
          Either party may terminate access to the service at any time.
          Following termination, your data will be available for export
          for a limited period, after which it will be deleted in
          accordance with our{" "}
          <Link href="/privacy" className="text-foreground underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="10. Disclaimer of warranties">
        <p>
          The service is provided &quot;as is&quot; and &quot;as
          available,&quot; without warranties of any kind, whether express
          or implied, including warranties of merchantability, fitness for
          a particular purpose, or non-infringement. We don&apos;t warrant
          that the service will be uninterrupted, error-free, or that AI
          output will be accurate or complete.
        </p>
      </LegalSection>

      <LegalSection heading="11. Limitation of liability">
        <p>
          To the maximum extent permitted by law, Compozor and its
          officers, employees, and service providers will not be liable
          for any indirect, incidental, special, consequential, or
          punitive damages, or for any loss of profits, data, or goodwill,
          arising from your use of the service — including from
          AI-generated content sent to your clients. Our total liability
          for any claim arising from these Terms or the service is limited
          to the amount you paid us in the twelve months before the claim
          arose (or a nominal amount if you have not paid any fees).
        </p>
      </LegalSection>

      <LegalSection heading="12. Indemnification">
        <p>
          You agree to indemnify and hold Compozor harmless from claims
          arising from your misuse of the service, your lack of
          authorization to submit any data you provide, your violation of
          these Terms, or your violation of any law or professional
          obligation applicable to your practice.
        </p>
      </LegalSection>

      <LegalSection heading="13. Governing law">
        <p>
          These Terms are governed by the laws of the Province of Ontario,
          Canada, without regard to conflict-of-law principles.
        </p>
      </LegalSection>

      <LegalSection heading="14. Changes to these terms">
        <p>
          We may update these Terms from time to time. If we make material
          changes, we&apos;ll update the &quot;Last updated&quot; date above
          and, where appropriate, notify you directly.
        </p>
      </LegalSection>

      <LegalSection heading="15. Contact us">
        <p>
          Questions about these Terms can be sent to{" "}
          <a href="mailto:info@compozor.com" className="text-foreground underline underline-offset-2">
            info@compozor.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
