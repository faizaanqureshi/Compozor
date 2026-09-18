"use client";

import { usePathname } from "next/navigation";
import { AuroraBackground } from "@/components/aurora-background";

// Landing, auth, and onboarding pages render their own full-screen
// background (see app/page.tsx, sign-in/sign-up, onboarding) - skip the
// dashboard variant there so the two don't stack.
export function DashboardBackground() {
  const pathname = usePathname();
  const isDashboard =
    pathname !== "/" &&
    !pathname.startsWith("/sign-in") &&
    !pathname.startsWith("/sign-up") &&
    !pathname.startsWith("/onboarding");

  if (!isDashboard) return null;

  return <AuroraBackground variant="panel" />;
}
