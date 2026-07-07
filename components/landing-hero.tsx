import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LandingDemo } from "@/components/landing-demo";

export function LandingHero() {
  return (
    <section className="animate-blur-in mx-auto flex min-h-screen w-full max-w-7xl flex-col items-center justify-center gap-20 px-6 pt-32 pb-16 md:flex-row md:items-center md:gap-24">
      <div className="flex max-w-2xl flex-col gap-7">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="uppercase tracking-wide text-muted-foreground">
            Automated intake
          </Badge>
          <span className="text-sm text-muted-foreground">
            For accounting & tax firms
          </span>
        </div>
        <h1 className="text-6xl leading-[1.05] font-thin tracking-tight text-balance sm:text-7xl [font-family:var(--font-denton)]">
          Stop chasing clients.
          <br />
          We send the follow‑up.
        </h1>
        <p className="text-lg text-muted-foreground text-pretty">
          We watch the inbox, match every email to the right client, and
          file the attachments the moment they land — no more digging
          through folders.
        </p>
        <div className="flex flex-col gap-2.5">
          <div>
            <Button size="lg" nativeButton={false} render={<Link href="/sign-up" />}>
              Join the Waitlist
              <ArrowRightIcon />
            </Button>
          </div>
          <span className="text-sm text-muted-foreground">
            Now onboarding a small group of early firms.
          </span>
        </div>
      </div>
      <div className="flex w-full max-w-xl justify-center">
        <LandingDemo />
      </div>
    </section>
  );
}
