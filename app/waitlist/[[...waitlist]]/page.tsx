import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo";
import Link from "next/link";
import { Show, Waitlist } from "@clerk/nextjs";
import { AuroraBackground } from "@/components/aurora-background";
import { LandingNav } from "@/components/landing-nav";
import { SiteFooter } from "@/components/site-footer";
import { Button } from "@/components/ui/button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ waitlist?: string[] }>;
}): Promise<Metadata> {
  const { waitlist } = await params;
  const metadata = publicPageMetadata("/waitlist");
  // Clerk's confirmation routes are not separate landing pages.
  return waitlist?.length
    ? { ...metadata, robots: { index: false, follow: true } }
    : metadata;
}

export default function WaitlistPage() {
  return (
    <div className="relative isolate flex min-h-svh flex-col">
      <AuroraBackground />
      <LandingNav />
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 pt-40 pb-20 sm:px-10 md:grid-cols-2 md:gap-16">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Early access
          </p>
          <h1 className="mt-6 text-5xl leading-tight font-thin tracking-tight sm:text-6xl [font-family:var(--font-denton)]">
            A little less admin.
            <br />A lot more possibility.
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
            We’re welcoming firms to a more considered way of working. Leave
            your email and we’ll let you know when your invitation is ready.
          </p>
          <p className="mt-7 text-sm text-muted-foreground">
            Want a closer look first?{" "}
            <Link
              href="/demo"
              className="text-foreground underline underline-offset-4"
            >
              Book a demo
            </Link>
            .
          </p>
        </div>
        <div className="flex min-w-0 justify-center md:justify-end">
          <Show when="signed-out">
            <Waitlist
              signInUrl="/sign-in"
              fallback={
                <p role="status" className="text-sm text-muted-foreground">
                  Loading the waitlist…
                </p>
              }
              appearance={{
                variables: {
                  colorPrimary: "var(--primary)",
                  colorBackground: "var(--card)",
                  colorForeground: "var(--foreground)",
                  colorMutedForeground: "var(--muted-foreground)",
                  colorInput: "var(--background)",
                  colorInputForeground: "var(--foreground)",
                  fontFamily: "var(--font-sans)",
                  borderRadius: "var(--radius)",
                },
                elements: {
                  rootBox: { width: "100%", maxWidth: "24rem" },
                  cardBox: {
                    width: "100%",
                    boxShadow: "none",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-xl)",
                  },
                  card: { boxShadow: "none" },
                  headerTitle: { fontWeight: "400", letterSpacing: "-0.025em" },
                  formButtonPrimary: {
                    boxShadow: "none",
                    backgroundImage: "none",
                  },
                  footer: { background: "var(--muted)" },
                },
              }}
            />
          </Show>
          <Show when="signed-in">
            <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8">
              <h2 className="text-xl font-light">You already have access.</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Your workspace is ready. Head back to your dashboard to
                continue.
              </p>
              <Button
                className="mt-6 h-10 px-4"
                nativeButton={false}
                render={<Link href="/clients" />}
              >
                Open dashboard
              </Button>
            </div>
          </Show>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
