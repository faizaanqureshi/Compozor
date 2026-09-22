"use client";

import { useEffect } from "react";
import styles from "@/components/landing-motion.module.css";

/** Progressive enhancement: content remains visible without JavaScript. */
export function LandingMotion() {
  useEffect(() => {
    const root = document.getElementById("main-content");
    if (!root || !("IntersectionObserver" in window)) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const elements = Array.from(
      root.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const reveal = (element: HTMLElement, animate: boolean) => {
      element.classList.remove(styles.pending);
      if (animate) element.classList.add(styles.revealed);
      observer.unobserve(element);
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) reveal(entry.target as HTMLElement, true);
        }
      },
      { rootMargin: "0px 0px -32px 0px", threshold: 0.06 },
    );

    const reset = () => {
      observer.disconnect();
      elements.forEach((element) =>
        element.classList.remove(styles.pending, styles.revealed),
      );
    };
    const setup = () => {
      reset();
      if (preference.matches) return;
      for (const element of elements) {
        // Leave the initial viewport and restored scroll position readable.
        if (element.getBoundingClientRect().top < window.innerHeight - 32)
          continue;
        element.classList.add(styles.pending);
        observer.observe(element);
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (!(event.target instanceof Element)) return;
      const element = event.target.closest<HTMLElement>("[data-reveal]");
      if (element) reveal(element, false);
    };
    setup();
    preference.addEventListener("change", setup);
    root.addEventListener("focusin", onFocus);
    return () => {
      reset();
      preference.removeEventListener("change", setup);
      root.removeEventListener("focusin", onFocus);
    };
  }, []);

  return null;
}
