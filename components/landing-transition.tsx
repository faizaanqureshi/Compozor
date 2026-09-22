"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import styles from "@/components/landing-motion.module.css";

/** Animate intrinsic content height without fixing a panel to its tallest state. */
export function LandingTransition({
  children,
  className,
  panels = false,
  changeKey,
}: {
  children: ReactNode;
  className?: string;
  panels?: boolean;
  changeKey?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const previousKey = useRef(changeKey);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    let previousHeight: number | undefined;
    let previousWidth: number | undefined;

    const resize = () => {
      const { height, width } = content.getBoundingClientRect();
      if (height === previousHeight && width === previousWidth) return;
      const from = frame.getBoundingClientRect().height;
      animation?.cancel();
      frame.style.height = `${height}px`;
      // Responsive reflow is immediate; intentional content changes ease in place.
      if (
        previousHeight !== undefined &&
        previousWidth === width &&
        !preference.matches &&
        Math.abs(from - height) > 1
      ) {
        animation = frame.animate(
          [{ height: `${from}px` }, { height: `${height}px` }],
          { duration: 550, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
        );
      }
      previousHeight = height;
      previousWidth = width;
    };
    const onPreferenceChange = () => animation?.cancel();
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(content);
    preference.addEventListener("change", onPreferenceChange);
    return () => {
      observer.disconnect();
      animation?.cancel();
      preference.removeEventListener("change", onPreferenceChange);
      frame.style.removeProperty("height");
    };
  }, []);

  useLayoutEffect(() => {
    if (previousKey.current === changeKey) return;
    previousKey.current = changeKey;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animation = contentRef.current?.animate(
      [
        { opacity: 0.25, transform: "translateY(4px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 550, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
    );
    const stop = () => animation?.cancel();
    preference.addEventListener("change", stop);
    return () => {
      stop();
      preference.removeEventListener("change", stop);
    };
  }, [changeKey]);

  return (
    <div ref={frameRef} className={cn(styles.transitionFrame, className)}>
      <div
        ref={contentRef}
        className={cn(styles.transitionContent, panels && styles.panelGroup)}
      >
        {children}
      </div>
    </div>
  );
}
