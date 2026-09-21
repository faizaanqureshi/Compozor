"use client";

import { usePathname } from "next/navigation";
import { AuroraBackground } from "@/components/aurora-background";

// Landing, auth, onboarding, and legal pages render their own full-screen
// background (or none at all, for the plain-prose legal pages) - see
// app/page.tsx, sign-in/sign-up, onboarding, and app/privacy|terms|cookies -
// skip the dashboard variant there so the two don't stack.
export function DashboardBackground() {
  const pathname = usePathname();
  const isDashboard =
    pathname !== "/" &&
    !pathname.startsWith("/sign-in") &&
    !pathname.startsWith("/sign-up") &&
    !pathname.startsWith("/onboarding") &&
    !pathname.startsWith("/privacy") &&
    !pathname.startsWith("/terms") &&
    !pathname.startsWith("/cookies");

  if (!isDashboard) return null;

  return <AuroraBackground variant="panel" />;
}
