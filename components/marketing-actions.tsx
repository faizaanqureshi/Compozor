import depth from "@/components/landing-depth.module.css";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import glass from "@/components/landing-glass.module.css";

export function MarketingActions({
  className,
  inverse = false,
}: {
  className?: string;
  inverse?: boolean;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-x-5 gap-y-3 sm:gap-x-7 sm:gap-y-4", className)}
    >
      <Button
        nativeButton={false}
        render={<Link href="/demo" />}
        size="lg"
        className={cn(
          "h-11 gap-4 px-5",
          depth.primaryAction,
          inverse
            ? "bg-marketing-brass text-sidebar hover:bg-marketing-brass/90"
            : "bg-marketing-forest text-sidebar-foreground hover:bg-marketing-forest/90",
        )}
      >
        Book a demo <ArrowRight aria-hidden />
      </Button>
      <Link
        href="/waitlist"
        className={cn(
          "inline-flex min-h-11 items-center rounded-sm py-2 text-sm underline-offset-4 transition-colors hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring",
          inverse && glass.dark,
          inverse && glass.action,
        )}
      >
        Join the waitlist
      </Link>
    </div>
  );
}
