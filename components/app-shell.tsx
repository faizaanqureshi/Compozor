"use client";

import { usePathname } from "next/navigation";
import { Nav } from "@/components/nav";
import { MobileTopBar } from "@/components/mobile-top-bar";
import { DashboardBackground } from "@/components/dashboard-background";
import { MobileNavProvider } from "@/components/mobile-nav-context";
import { OnboardingGate } from "@/components/onboarding-gate";
import { ProductTour } from "@/components/product-tour";
import { TooltipProvider } from "@/components/ui/tooltip";

// The public /upload/[token] page must work without a Clerk session and
// without the internal app chrome (nav rail, onboarding gate, product
// tour) - it's reached by a client, not a signed-in firm user. Keeping this
// check here (rather than restructuring the whole app into route groups)
// means every other route keeps its existing layout untouched.
function isPublicUploadRoute(pathname: string | null): boolean {
  return pathname?.startsWith("/upload/") ?? false;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (isPublicUploadRoute(pathname)) {
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
