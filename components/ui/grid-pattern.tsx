"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface GridPatternProps extends React.SVGProps<SVGSVGElement> {
  width?: number;
  height?: number;
  className?: string;
  /**
   * "hero" (default) fades out ~60% down a tall viewport-height box - right
   * for a hero/full-screen backdrop. "panel" covers the whole box edge to
   * edge, for shorter content boxes (dashboard pages) where a hero-style
   * fade would visibly cut off before reaching the bottom of the box.
   */
  maskVariant?: "hero" | "panel";
}

const maskByVariant: Record<NonNullable<GridPatternProps["maskVariant"]>, string> = {
  hero: "radial-gradient(ellipse 65% 55% at 50% 35%, black 40%, transparent 85%)",
  panel: "radial-gradient(ellipse 90% 90% at 50% 40%, black 50%, transparent 100%)",
};

/**
 * A softly faded line grid - radial-mask keeps it from reading as a harsh
 * repeating tile, which is what separates "textured backdrop" from
 * "wallpaper". Lines use currentColor so callers tint via text-* utilities.
 */
export function GridPattern({
  width = 48,
  height = 48,
  className,
  maskVariant = "hero",
  ...props
}: GridPatternProps) {
  const id = useId();
  const mask = maskByVariant[maskVariant];

  return (
    <svg
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full text-foreground/[0.10]",
        className
      )}
      style={{
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
      {...props}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${width} 0 L 0 0 0 ${height}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
