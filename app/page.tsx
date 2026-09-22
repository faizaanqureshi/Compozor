import { LandingNav } from "@/components/landing-nav";
import { LandingHero } from "@/components/landing-hero";
import { SiteFooter } from "@/components/site-footer";
import { LandingStory } from "@/components/landing-story";
import { LandingSections, LandingClosing } from "@/components/landing-sections";
import { LandingFaq } from "@/components/landing-faq";
import { AuroraBackground } from "@/components/aurora-background";
import { LandingMotion } from "@/components/landing-motion";
import type { Metadata } from "next";
import styles from "@/components/landing-motion.module.css";

export const metadata: Metadata = {
  title: "Compozor — Less chasing. More work delivered.",
  description:
    "Client communication, document collection, and work prepared your way. Compozor helps professional service firms turn client documents into reports, spreadsheets, and more.",
};

export default function Home() {
  return (
    <div className={`${styles.page} marketing-page overflow-x-clip`}>
      <a
        href="#main-content"
        className="sr-only fixed top-3 left-3 z-[60] rounded-lg bg-card px-4 py-3 text-sm focus:not-sr-only"
      >
        Skip to content
      </a>
      <LandingNav />
      <main id="main-content">
        <LandingMotion />
        <div className="relative isolate">
          <AuroraBackground />
          <LandingHero />
        </div>
        <LandingStory />
        <LandingSections />
        <LandingFaq />
        <LandingClosing />
      </main>
      <SiteFooter />
    </div>
  );
}
