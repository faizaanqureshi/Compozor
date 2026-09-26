import { headers } from "next/headers";
import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { AuroraBackground } from "@/components/aurora-background";

import { postAuthRedirect } from "@/lib/auth-redirects";

export default async function SignInPage({
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
      <div className="relative flex h-full items-center justify-center">
        <SignIn
          forceRedirectUrl={postAuthRedirect(redirect_url, origin)}
          fallbackRedirectUrl="/clients"
        />
      </div>
      <div className="absolute inset-x-0 bottom-6 flex justify-center gap-4 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
        <Link href="/terms" className="hover:text-foreground">Terms &amp; Conditions</Link>
      </div>
    </div>
  );
}
