import { AuroraBackground } from "@/components/aurora-background";
import { SignUpConsentGate } from "@/components/sign-up-consent-gate";

// See app/sign-in - a redirect_url of "/" comes from buttons clicked on the
// landing page, and the query param outranks fallbackRedirectUrl in Clerk's
// resolution order, so it must be actively overridden, not just omitted.
function meaningfulRedirect(redirectUrl: string | undefined) {
  if (!redirectUrl) return undefined;
  const path = new URL(redirectUrl, "http://localhost").pathname;
  return path === "/" ? "/clients" : redirectUrl;
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;

  return (
    <div className="fixed inset-0 isolate overflow-hidden bg-background">
      <AuroraBackground />
      <div className="relative flex h-full items-center justify-center px-4">
        <SignUpConsentGate forceRedirectUrl={meaningfulRedirect(redirect_url)} />
      </div>
    </div>
  );
}
