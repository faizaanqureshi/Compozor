"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";
import { ApiError, getMyOrganization } from "@/lib/api";
import { signInRedirect } from "@/lib/auth-redirects";
import { onboardingDestination } from "@/lib/onboarding";
import { Button } from "@/components/ui/button";

type Check = {
  userId: string;
  orgId: string | null | undefined;
  attempt: number;
  completed?: boolean;
  error?: string;
};

// The database decides completion. Never reuse a browser-wide completion flag
// across accounts or let a pending product tour bypass unfinished setup.
// Completion is re-checked on every navigation, but the last result for the
// same account keeps the shell mounted meanwhile; blanking it per pathname
// unmounted the nav on every click (a visible flash and lost nav state).
//
// The firm is the session's active Clerk Organization. Firms from before
// team accounts (and staff who just accepted an invitation) may have no
// active organization yet; the gate activates it before rendering the app,
// so every request names the firm and invited staff skip firm onboarding.
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId, orgId } = useAuth();
  const clerk = useClerk();
  const pathname = usePathname();
  const router = useRouter();
  const [check, setCheck] = useState<Check | null>(null);
  const [attempt, setAttempt] = useState(0);
  const current = check?.userId === userId && check?.orgId === orgId && check?.attempt === attempt
    ? check : null;

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      const destination = signInRedirect(pathname, window.location.search);
      if (destination) router.replace(destination);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const org = await getMyOrganization();
        if (org.clerk_org_id && !orgId) {
          // Re-runs this effect with the firm in the session token.
          await clerk.setActive({ organization: org.clerk_org_id });
          return;
        }
        if (!cancelled) setCheck({ userId, orgId, attempt, completed: !!org.onboarding_completed_at });
      } catch (error) {
        if (!orgId && error instanceof ApiError && error.code === "select_organization") {
          // Invited staff with no firm selected: open the firm they joined.
          const memberships = await clerk.user?.getOrganizationMemberships();
          const firm = memberships?.data[0]?.organization.id;
          if (firm) {
            await clerk.setActive({ organization: firm });
            return;
          }
        }
        if (!cancelled) setCheck({ userId, orgId, attempt, error: error instanceof Error ? error.message : "Unable to load your account." });
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, userId, orgId, clerk, pathname, attempt, router]);

  useEffect(() => {
    if (!isSignedIn || !current || current.completed === undefined) return;
    const destination = onboardingDestination(current.completed, pathname, window.location.search);
    if (destination) router.replace(destination);
  }, [current, isSignedIn, pathname, router]);

  if (!isLoaded || !isSignedIn || !current) return null;
  if (current.error) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <p role="alert" className="text-sm text-destructive">{current.error}</p>
      <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
    </div>
  );
  if (onboardingDestination(!!current.completed, pathname, "")) return null;
  return <>{children}</>;
}
