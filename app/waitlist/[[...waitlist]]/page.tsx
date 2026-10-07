import type { Metadata } from "next";
import { publicPageMetadata } from "@/lib/seo";
import Link from "next/link";
import { AuroraBackground } from "@/components/aurora-background";
import { LandingNav } from "@/components/landing-nav";
import { SiteFooter } from "@/components/site-footer";
import { WaitlistAccess } from "@/components/waitlist-access";

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
    <div className="marketing-page relative isolate flex min-h-svh flex-col bg-background">
      <AuroraBackground />
      <LandingNav />
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 pt-40 pb-20 sm:px-10 md:grid-cols-2 md:gap-16">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Early access
          </p>
          <h1 className="mt-6 text-5xl leading-tight font-light tracking-tight sm:text-6xl [font-family:var(--font-display)]">
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
          <WaitlistAccess />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
