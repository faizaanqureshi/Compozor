"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getMyOrganization } from "@/lib/api";

const EXEMPT_PREFIXES = ["/sign-in", "/sign-up"];

const STORAGE_KEY = "onboarding-complete";

// Cached across navigations (and reloads, via sessionStorage) so onboarded
// users don't wait on an org fetch every time. Only the completed state is
// cached - it can only flip one way, when the onboarding page finishes and
// calls markOnboardingComplete.
let knownComplete =
  typeof window !== "undefined" && sessionStorage.getItem(STORAGE_KEY) === "1";

export function markOnboardingComplete() {
  knownComplete = true;
  try {
    sessionStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Storage unavailable (private mode etc.) - in-memory flag still works.
  }
}

type Status = "unknown" | "complete" | "incomplete" | "error";

// Every Clerk user gets an auto-created but unconfigured Organization on
// first authenticated API call (see FRONTEND_CONTEXT.md) - there's no
// server-side block on hitting other endpoints before onboarding finishes,
// so gating has to happen here, on every authenticated route. Rendering of
// gated pages is held back until the status is known, so the user never sees
// a flash of /clients before being redirected to /onboarding.
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [status, setStatus] = useState<Status>(
    knownComplete ? "complete" : "unknown"
  );

  const exempt =
    pathname === "/" || EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (!isLoaded || !isSignedIn || exempt) return;
    if (knownComplete) {
      setStatus("complete");
      return;
    }

    let cancelled = false;
    getMyOrganization()
      .then((org) => {
        if (cancelled) return;
        if (org.onboarding_completed_at) {
          markOnboardingComplete();
          setStatus("complete");
        } else {
          setStatus("incomplete");
        }
      })
      .catch(() => {
        // Not signed in yet from the API's perspective, or a transient
        // failure - fail open and let the page itself surface the error.
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, exempt, pathname]);

  useEffect(() => {
    if (exempt) return;
    if (status === "incomplete" && pathname !== "/onboarding") {
      router.replace("/onboarding");
    } else if (status === "complete" && pathname === "/onboarding") {
      router.replace("/clients");
    }
  }, [status, exempt, pathname, router]);

  if (exempt || (isLoaded && !isSignedIn)) return <>{children}</>;

  // The onboarding page is the safe default while status is unresolved: the
  // only redirect away from it is for already-onboarded users, and it has its
  // own loading skeleton.
  if (pathname === "/onboarding") {
    return status === "complete" ? null : <>{children}</>;
  }

  // Hold back gated pages until we know onboarding is done ("error" fails
  // open). Covers Clerk still loading, the org fetch in flight, and the
  // redirect to /onboarding being in progress.
  if (!isLoaded || status === "unknown" || status === "incomplete") return null;

  return <>{children}</>;
}
