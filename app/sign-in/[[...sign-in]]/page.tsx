import { SignIn } from "@clerk/nextjs";
import { AuroraBackground } from "@/components/aurora-background";

// Clerk's <SignInButton>/<SignUpButton> set redirect_url to whatever page
// they were clicked from - for the landing page that's "/", which would send
// a fresh sign-in back to the marketing page instead of the app. The
// redirect_url QUERY PARAM outranks the fallbackRedirectUrl prop in Clerk's
// resolution order, so simply omitting the force prop isn't enough - a "/"
// redirect has to be actively overridden with a forced "/clients".
function meaningfulRedirect(redirectUrl: string | undefined) {
  if (!redirectUrl) return undefined;
  const path = new URL(redirectUrl, "http://localhost").pathname;
  return path === "/" ? "/clients" : redirectUrl;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { redirect_url } = await searchParams;

  return (
    <div className="fixed inset-0 isolate overflow-hidden bg-background">
      <AuroraBackground />
      <div className="relative flex h-full items-center justify-center">
        <SignIn
          forceRedirectUrl={meaningfulRedirect(redirect_url)}
          fallbackRedirectUrl="/clients"
        />
      </div>
    </div>
  );
}
