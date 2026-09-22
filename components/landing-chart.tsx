"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "@/components/landing-motion.module.css";

/** Reveal the marks once in view; labels and values always stay readable. */
export function LandingChart({
  children,
  className,
  enabled = true,
}: {
  children: ReactNode;
  className?: string;
  enabled?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const chart = ref.current;
    if (!chart || !enabled || !("IntersectionObserver" in window)) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (preference.matches) return;

    chart.dataset.chartState = "pending";
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          chart.dataset.chartState = "revealed";
          observer.disconnect();
        }
      },
      { threshold: 0.3, rootMargin: "0px 0px -24px 0px" },
    );
    observer.observe(chart);
    const settle = () => {
      observer.disconnect();
      delete chart.dataset.chartState;
    };
    preference.addEventListener("change", settle);
    return () => {
      settle();
      preference.removeEventListener("change", settle);
    };
  }, [enabled]);

  return (
    <figure ref={ref} className={cn(styles.chart, className)}>
      {children}
    </figure>
  );
}
