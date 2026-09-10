import { LandingNav } from "@/components/landing-nav";
import { LandingHero } from "@/components/landing-hero";
import { AuroraBackground } from "@/components/aurora-background";

export default function Home() {
  return (
    <div className="-m-8 overflow-x-hidden md:-m-10">
      <div className="relative isolate min-h-screen overflow-hidden">
        <AuroraBackground />
        <LandingNav />
        <LandingHero />
      </div>
    </div>
  );
}
