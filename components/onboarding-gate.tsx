"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getMyOrganization } from "@/lib/api";
import { signInRedirect } from "@/lib/auth-redirects";
import { onboardingDestination } from "@/lib/onboarding";
import { Button } from "@/components/ui/button";

type Check = {
  userId: string;
  attempt: number;
  completed?: boolean;
  error?: string;
};

// The database decides completion. Never reuse a browser-wide completion flag
// across accounts or let a pending product tour bypass unfinished setup.
// Completion is re-checked on every navigation, but the last result for the
// same account keeps the shell mounted meanwhile; blanking it per pathname
// unmounted the nav on every click (a visible flash and lost nav state).
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [check, setCheck] = useState<Check | null>(null);
  const [attempt, setAttempt] = useState(0);
  const current = check?.userId === userId && check?.attempt === attempt
    ? check : null;

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !userId) {
      const destination = signInRedirect(pathname, window.location.search);
      if (destination) router.replace(destination);
      return;
    }
    let cancelled = false;
    getMyOrganization().then((org) => {
      if (!cancelled) setCheck({ userId, attempt, completed: !!org.onboarding_completed_at });
    }).catch((error) => {
      if (!cancelled) setCheck({ userId, attempt, error: error instanceof Error ? error.message : "Unable to load your account." });
    });
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, userId, pathname, attempt, router]);

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
