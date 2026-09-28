import { publicPageMetadata } from "@/lib/seo";
import Link from "next/link";
import { LegalPageShell, LegalSection } from "@/components/legal-page-shell";

export const metadata = publicPageMetadata("/privacy");

const link = "text-foreground underline underline-offset-2";
const code = "rounded bg-muted px-1 py-0.5 text-xs";
const CONTACT = "support@compozor.com";

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated="September 28, 2026">
      <LegalSection heading="1. Who this policy covers">
        <p>
          Compozor (&quot;Compozor,&quot; &quot;we,&quot; &quot;us&quot;),
          based in Canada, is a document-collection and client-communication
          tool for professional service firms (accounting, tax, legal,
          immigration, mortgage brokering, and similar practices). With a
          firm&apos;s authorization it reads the firm&apos;s connected inbox
          for client correspondence, collects and checks the documents clients
          send, drafts or sends replies, schedules meetings, and runs
          firm-defined workflows that prepare work from those documents.
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
            indirectly: by emailing the firm, or by uploading documents and
            completing questionnaires through a link the firm sends them. For this group, the firm is the party
            responsible for their data (see &quot;Our role as a service
            provider,&quot; below) — questions about a specific firm&apos;s use
            of your information should go to that firm first.
          </li>
        </ul>
      </LegalSection>

      <LegalSection heading="2. Information we collect">
        <p>
          <strong className="text-foreground">Account &amp; organization
          data.</strong> Name, email address, and authentication data
          (handled by our authentication provider, Clerk), plus the firm
          information entered during onboarding — firm name, a description of
          the practice, and jurisdiction.
        </p>
        <p>
          <strong className="text-foreground">Connected mailbox &amp; calendar
          data.</strong> A firm can connect a Gmail or Microsoft 365 (Outlook)
          mailbox through the provider&apos;s own consent screen. We request
          only the permissions the features below need:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            <strong className="text-foreground">Reading mail</strong> (Google{" "}
            <code className={code}>gmail.readonly</code>; Microsoft{" "}
            <code className={code}>Mail.Read</code>) — to read newly received
            messages and their attachments, match them to the firm&apos;s
            clients, and collect the documents clients send. Messages from
            senders who aren&apos;t one of the firm&apos;s clients, or whose
            sender can&apos;t be verified, are kept for the firm to review and
            may be classified automatically (for example as spam or a potential
            new client); they are not added to any client&apos;s file.
          </li>
          <li>
            <strong className="text-foreground">Sending mail</strong> (Google{" "}
            <code className={code}>gmail.send</code>; Microsoft{" "}
            <code className={code}>Mail.Send</code>) — to send replies from
            the firm&apos;s own address that firm staff approve, or that the
            firm has chosen to send automatically.
          </li>
          <li>
            <strong className="text-foreground">Calendar</strong> (Google{" "}
            <code className={code}>calendar.freebusy</code> and{" "}
            <code className={code}>calendar.events</code>; Microsoft{" "}
            <code className={code}>Calendars.ReadWrite</code>) — to check when
            the firm is free and to create meetings it schedules with clients.
          </li>
        </ul>
        <p>
          The firm can disconnect its mailbox in Compozor, or revoke access in
          its Google or Microsoft account settings, at any time.
        </p>
        <p>
          <strong className="text-foreground">Uploaded documents.</strong>{" "}
          When a firm&apos;s client uploads files through a Compozor upload
          link, or sends them by email, we receive those files and any
          information entered alongside them. Depending on the firm&apos;s
          practice, this can include tax records, financial statements,
          identification documents, or immigration paperwork — whatever the
          firm has requested.
        </p>
        <p>
          <strong className="text-foreground">Questionnaire answers.</strong>{" "}
          When a firm asks a client to complete a questionnaire through its
          Compozor client portal, we receive the client&apos;s answers,
          including saved drafts, and keep a PDF copy of each submission for
          the firm. Before showing a questionnaire, we email a one-time code
          to the client&apos;s address on file to confirm it&apos;s them.
        </p>
        <p>
          <strong className="text-foreground">Work product.</strong> Reports,
          spreadsheets, and other files that Compozor prepares from those
          documents when a firm runs one of its workflows, along with a record
          of the steps taken to prepare them.
        </p>
        <p>
          <strong className="text-foreground">Usage &amp; support
          data.</strong> Technical logs needed to operate and secure the
          service (timestamps, error reports, API request metadata), and any
          information provided when contacting us for support.
        </p>
      </LegalSection>

      <LegalSection heading="3. How we use information">
        <ul className="ml-5 list-disc space-y-1">
          <li>To operate the service: matching emails to clients, checking and filing documents, tracking checklists, drafting or sending replies, scheduling meetings, and running the firm&apos;s workflows.</li>
          <li>To process email content and documents with AI models (see &quot;Service providers &amp; AI processing&quot;) in order to provide those features for the firm.</li>
          <li>To maintain and secure Compozor, including detecting and preventing abuse.</li>
          <li>To communicate with firm users about their account and the service.</li>
          <li>To comply with legal obligations.</li>
        </ul>
        <p>
          We don&apos;t sell personal information, use it for advertising, or
          use a firm&apos;s or its clients&apos; data to train AI models.
        </p>
      </LegalSection>

      <LegalSection heading="4. Google user data">
        <p>
          Compozor&apos;s use and transfer to any other app of information
          received from Google APIs will adhere to the{" "}
          <a
            href="https://developers.google.com/terms/api-services-user-data-policy"
            className={link}
            target="_blank"
            rel="noreferrer"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>We use Gmail and Google Calendar data only to provide and improve the user-facing features described in this policy.</li>
          <li>We transfer it to others only as needed to provide those features (for example, to the AI service provider that reads a document for the firm), to comply with law, or as part of a merger or acquisition with notice to users.</li>
          <li>We don&apos;t use it for advertising, sell it, or use it to develop, improve, or train generalized AI or machine-learning models.</li>
          <li>People at Compozor don&apos;t read it unless the firm asks us to (for example, for support), it&apos;s needed for security or to comply with law, or it has been aggregated and anonymized for internal operations.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="5. Service providers &amp; AI processing">
        <p>
          We use the following service providers to run Compozor. Each
          processes data only on our instructions to provide the service, and
          none may use it to train general-purpose AI models or for its own
          purposes:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li><strong className="text-foreground">OpenAI</strong> (United States) — reads email and document content to check and match documents, draft replies, and run workflows. OpenAI does not train its models on data sent through its API, and keeps it for up to 30 days before deleting it.</li>
          <li><strong className="text-foreground">Railway</strong> (United States) — hosts Compozor&apos;s application servers and database.</li>
          <li><strong className="text-foreground">Cloudflare R2</strong> — stores uploaded documents and prepared files.</li>
          <li><strong className="text-foreground">Vercel</strong> — hosts the Compozor website. It does not store firm or client data.</li>
          <li><strong className="text-foreground">Clerk</strong> (United States) — handles sign-in and account sessions for firm users.</li>
          <li><strong className="text-foreground">Google and Microsoft</strong> — provide mailbox and calendar access under the firm&apos;s own authorization.</li>
          <li><strong className="text-foreground">Sentry</strong> — receives technical error reports so we can fix problems. Email and document content is removed before reports are sent.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="6. Our role as a service provider">
        <p>
          For data belonging to a firm&apos;s clients, the firm decides what
          information to collect and why, and is the organization responsible
          for it under Canadian privacy law (such as PIPEDA and provincial
          private-sector privacy laws, including Québec&apos;s Law 25) and
          other applicable laws. Compozor processes that information only on
          the firm&apos;s behalf, as its service provider. Firms in the
          United States subject to the Gramm-Leach-Bliley Act and the FTC
          Safeguards Rule may rely on this section, together with a
          data-processing or security addendum available on request, to
          document our role.
        </p>
      </LegalSection>

      <LegalSection heading="7. Data retention &amp; deletion">
        <p>
          We keep account and client data while the firm&apos;s account is
          active. When a firm deletes a document, or permanently deletes an
          archived client, in Compozor, the stored files are removed from
          storage. A firm can download its
          clients&apos; documents at any time, and can ask us to delete
          specific client records or its entire account by contacting{" "}
          <a href={`mailto:${CONTACT}`} className={link}>{CONTACT}</a>. We
          complete deletion requests within 30 days, unless we must keep
          something longer by law or to resolve a dispute. Data sent to our
          AI provider is deleted by it within 30 days.
        </p>
      </LegalSection>

      <LegalSection heading="8. Security">
        <p>
          We use administrative and technical safeguards designed to protect
          the data we hold, including encryption in transit, encryption at
          rest for stored documents and for mailbox sign-in credentials,
          separation of each firm&apos;s data, verification of an incoming
          email&apos;s sender before it&apos;s treated as a client&apos;s, and
          monitoring for security events. No method of transmission or storage
          is perfectly secure, and we cannot guarantee absolute security. If a
          breach creates a real risk of significant harm, we&apos;ll notify
          affected firms without unreasonable delay so they can meet their own
          obligations.
        </p>
      </LegalSection>

      <LegalSection heading="9. Cookies">
        <p>
          Compozor uses only the cookies and browser storage it needs to work,
          described in our{" "}
          <Link href="/cookies" className={link}>
            Cookie Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="10. Your privacy rights">
        <p>
          Depending on where you live, you may have rights to access the
          personal information we hold about you, to correct it, to withdraw
          consent, or to request its deletion. We do not sell personal
          information, and we honor Global Privacy Control (GPC) opt-out
          signals where legally required. If you are a client of a firm that
          uses Compozor, we&apos;ll refer requests about your data to that firm
          where it is better placed to respond, unless the law requires us to
          respond directly. To exercise these rights, contact our Privacy
          Officer at{" "}
          <a href={`mailto:${CONTACT}`} className={link}>{CONTACT}</a>. If
          you&apos;re not satisfied with our response, you can complain to the
          Office of the Privacy Commissioner of Canada or your provincial
          privacy regulator.
        </p>
      </LegalSection>

      <LegalSection heading="11. Where data is stored">
        <p>
          Compozor and its service providers store and process data primarily
          in the United States. Information stored outside Canada is subject to
          the laws of the country where it is held, and may be accessible to
          that country&apos;s courts, law enforcement, and national security
          authorities.
        </p>
      </LegalSection>

      <LegalSection heading="12. Children's privacy">
        <p>
          Compozor is a business tool intended for use by professional service
          firms and their adult clients. It is not directed to, and we do not
          knowingly collect personal information from, children.
        </p>
      </LegalSection>

      <LegalSection heading="13. Changes to this policy">
        <p>
          We may update this policy from time to time. If we make material
          changes, we&apos;ll update the &quot;Last updated&quot; date above
          and, where appropriate, notify firm users directly.
        </p>
      </LegalSection>

      <LegalSection heading="14. Contact us">
        <p>
          Questions about this policy or your data can be sent to our Privacy
          Officer at{" "}
          <a href={`mailto:${CONTACT}`} className={link}>{CONTACT}</a>.
          Compozor is based in Canada.
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
