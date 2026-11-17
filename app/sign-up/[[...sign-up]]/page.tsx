import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuroraBackground } from "@/components/aurora-background";
import { SignUpConsentGate } from "@/components/sign-up-consent-gate";

import { postAuthRedirect } from "@/lib/auth-redirects";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[]; __clerk_status?: string | string[] }>;
}) {
  const params = await searchParams;
  const { redirect_url } = params;
  // Firm invitations link here. Someone who already has an account accepts
  // theirs by signing in (Clerk marks the link with __clerk_status=sign_in).
  if (params.__clerk_status === "sign_in") {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string") query.set(key, value);
    }
    redirect(`/sign-in?${query}`);
  }
  const requestHeaders = await headers();
  const origin = `${requestHeaders.get("x-forwarded-proto") ?? "https"}://${requestHeaders.get("host")}`;

  return (
    <div className="marketing-page fixed inset-0 isolate overflow-hidden bg-background">
      <AuroraBackground />
      <div className="relative flex h-full items-center justify-center px-4">
        <SignUpConsentGate forceRedirectUrl={postAuthRedirect(redirect_url, origin)} />
      </div>
    </div>
  );
}
