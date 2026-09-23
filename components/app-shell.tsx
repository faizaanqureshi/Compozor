"use client";

import { useAuth } from "@clerk/nextjs";
import { SWRConfig } from "swr";
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
  const { userId } = useAuth();

  // Public pages, including authentication, never mount dashboard fetchers or
  // the product tour, including for an already signed-in visitor.
  if (isStandalonePublicPage(pathname)) {
    return <>{children}</>;
  }

  // Drop private SWR data when the active account changes.
  return (
    <SWRConfig key={userId ?? "signed-out"} value={{ provider: () => new Map() }}>
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
            <ProductTour key={`${userId}:${pathname}`} />
          </OnboardingGate>
        </MobileNavProvider>
      </TooltipProvider>
    </SWRConfig>
  );
}
