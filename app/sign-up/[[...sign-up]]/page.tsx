import { headers } from "next/headers";
import { AuroraBackground } from "@/components/aurora-background";
import { SignUpConsentGate } from "@/components/sign-up-consent-gate";

import { postAuthRedirect } from "@/lib/auth-redirects";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const { redirect_url } = await searchParams;
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
