import { GridPattern } from "@/components/ui/grid-pattern";
import { cn } from "@/lib/utils";

interface AuroraBackgroundProps {
  /**
   * "hero" (default) - tuned for a tall, full-screen hero (landing, auth,
   * onboarding): blobs anchored to the top corners, fading to plain
   * background before the bottom of the box.
   * "panel" - tuned for a shorter, content-driven dashboard page: grid and
   * blobs spread across the whole box instead of fading out partway down,
   * and there's no fade-to-background overlay, since the box ends where the
   * page's real content ends rather than scrolling into more content.
   */
  variant?: "hero" | "panel";
}

export function AuroraBackground({ variant = "hero" }: AuroraBackgroundProps) {
  const isPanel = variant === "panel";

  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <GridPattern width={48} height={48} maskVariant={variant} />
      <div
        className={cn(
          "motion-safe:animate-[aurora-drift-a_28s_ease-in-out_infinite] absolute size-[38rem] rounded-full bg-secondary/40 blur-3xl",
          isPanel ? "top-[-10%] left-[-10%]" : "top-[-15%] left-[-10%]"
        )}
      />
      <div
        className={cn(
          "motion-safe:animate-[aurora-drift-b_34s_ease-in-out_infinite] absolute size-[34rem] rounded-full bg-accent/25 blur-3xl",
          isPanel ? "top-[-5%] right-[-15%]" : "top-[-10%] right-[-15%]"
        )}
      />
      <div
        className={cn(
          "motion-safe:animate-[aurora-drift-c_40s_ease-in-out_infinite] absolute size-[44rem] rounded-full bg-muted-foreground/10 blur-3xl",
          isPanel ? "bottom-[-15%] left-[20%]" : "bottom-[-20%] left-[15%]"
        )}
      />
      <div className="bg-grain absolute inset-0 opacity-[0.035] mix-blend-overlay" />
      {!isPanel && (
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background" />
      )}
    </div>
  );
}
