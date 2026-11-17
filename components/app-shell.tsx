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
import { AskPanel } from "@/components/ask/ask-panel";
import { AskPanelProvider } from "@/components/ask/ask-panel-context";

import { isStandalonePublicPage } from "@/lib/public-routes";
import { isOnboardingPage } from "@/lib/onboarding";

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
          <AskPanelProvider>
          <OnboardingGate>
            {isOnboardingPage(pathname) ? (
              // Full-screen page: see isOnboardingPage for why it skips the
              // animated wrapper below.
              children
            ) : (
              <div className="flex min-h-full flex-1">
                <Nav />
                <div className="relative isolate flex min-w-0 flex-1 flex-col overflow-x-hidden">
                  <MobileTopBar />
                  <main className="relative flex-1 p-6 xl:p-10">
                    <DashboardBackground />
                    {/* One identical entrance for every page, keyed so it replays per navigation. */}
                    <div key={pathname} className="animate-blur-in-sm">
                      {children}
                    </div>
                  </main>
                </div>
                {/* Ask follows you across pages; docked beside the page on wide screens. */}
                <AskPanel />
              </div>
            )}
            <ProductTour key={`${userId}:${pathname}`} />
          </OnboardingGate>
          </AskPanelProvider>
        </MobileNavProvider>
      </TooltipProvider>
    </SWRConfig>
  );
}
