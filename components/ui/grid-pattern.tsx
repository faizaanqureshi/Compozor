"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

interface GridPatternProps extends React.SVGProps<SVGSVGElement> {
  width?: number;
  height?: number;
  className?: string;
}

/**
 * A softly faded line grid - radial-mask keeps it from reading as a harsh
 * repeating tile, which is what separates "textured backdrop" from
 * "wallpaper". Lines use currentColor so callers tint via text-* utilities.
 */
export function GridPattern({
  width = 48,
  height = 48,
  className,
  ...props
}: GridPatternProps) {
  const id = useId();

  return (
    <svg
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full text-foreground/[0.10]",
        className
      )}
      style={{
        maskImage:
          "radial-gradient(ellipse 65% 55% at 50% 35%, black 40%, transparent 85%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 65% 55% at 50% 35%, black 40%, transparent 85%)",
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
