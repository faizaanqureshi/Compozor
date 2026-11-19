import { headers } from "next/headers";
import { AuroraBackground } from "@/components/aurora-background";
import { InviteAccept } from "@/components/invite-accept";
import { SignUpConsentGate } from "@/components/sign-up-consent-gate";

import { postAuthRedirect } from "@/lib/auth-redirects";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirect_url?: string | string[];
    __clerk_status?: string | string[];
    __clerk_ticket?: string | string[];
    firm?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const { redirect_url } = params;
  const requestHeaders = await headers();
  const origin = `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;
  const destination = postAuthRedirect(redirect_url, origin);

  // Invitations (to join a firm, or to open a new firm's account) land here
  // with Clerk's ticket. They get one invite screen instead of the generic
  // sign-up; existing accounts are signed in by the ticket itself.
  const ticket = typeof params.__clerk_ticket === "string" ? params.__clerk_ticket : null;
  if (ticket) {
    const firm = typeof params.firm === "string" ? params.firm.trim().slice(0, 120) : undefined;
    return (
      <div className="marketing-page fixed inset-0 isolate overflow-hidden bg-background">
        <AuroraBackground />
        <div className="relative flex h-full items-center justify-center px-4">
          <InviteAccept
            ticket={ticket}
            status={typeof params.__clerk_status === "string" ? params.__clerk_status : undefined}
            firmName={firm || undefined}
            redirectUrl={destination}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="marketing-page fixed inset-0 isolate overflow-hidden bg-background">
      <AuroraBackground />
      <div className="relative flex h-full items-center justify-center px-4">
        <SignUpConsentGate forceRedirectUrl={destination} />
      </div>
    </div>
  );
}
