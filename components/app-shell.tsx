"use client";

import { usePathname } from "next/navigation";
import { Nav } from "@/components/nav";
import { MobileTopBar } from "@/components/mobile-top-bar";
import { DashboardBackground } from "@/components/dashboard-background";
import { MobileNavProvider } from "@/components/mobile-nav-context";
import { OnboardingGate } from "@/components/onboarding-gate";
import { ProductTour } from "@/components/product-tour";
import { TooltipProvider } from "@/components/ui/tooltip";

import { isStandalonePublicPage } from "@/lib/public-routes";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Public marketing and client-upload pages never load app onboarding or
  // the product tour, including for an already signed-in visitor.
  if (isStandalonePublicPage(pathname)) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider>
      <MobileNavProvider>
        <OnboardingGate>
          <div className="flex min-h-full flex-1">
            <Nav />
            <div className="relative isolate flex min-w-0 flex-1 flex-col overflow-x-hidden">
              <MobileTopBar />
              <main className="relative flex-1 p-6 xl:p-10">
                <DashboardBackground />
                {children}
              </main>
            </div>
          </div>
          <ProductTour />
        </OnboardingGate>
      </MobileNavProvider>
    </TooltipProvider>
  );
}
