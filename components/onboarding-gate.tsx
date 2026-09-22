"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { getMyOrganization } from "@/lib/api";
import { isProductTourPending } from "@/components/product-tour";

const EXEMPT_PREFIXES = ["/sign-in", "/sign-up", "/privacy", "/terms", "/cookies"];

const STORAGE_KEY = "onboarding-complete";

// How long a cached "complete" is trusted before re-checking the server.
// Bounds staleness if the backend's onboarding state ever changes out from
// under this cache (e.g. an org/DB reset during testing) - without this, a
// stale sessionStorage flag would let an unboarded user straight into
// gated pages indefinitely, since nothing else would ever re-validate it.
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CachedStatus {
  complete: true;
  cachedAt: number;
}

// Re-read (and re-validate the TTL on) every call rather than freezing to a
// module-level boolean forever once true - a long-lived tab that's never
// reloaded still re-checks after the TTL elapses, not just on next reload.
function readCache(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<CachedStatus>;
    return (
      parsed.complete === true &&
      typeof parsed.cachedAt === "number" &&
      Date.now() - parsed.cachedAt < CACHE_TTL_MS
    );
  } catch {
    return false;
  }
}

export function markOnboardingComplete() {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ complete: true, cachedAt: Date.now() } satisfies CachedStatus)
    );
  } catch {
    // Storage unavailable (private mode etc.) - falls back to fetching
    // getMyOrganization() every navigation, which is correct if slower.
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
  const [status, setStatus] = useState<Status>(() =>
    readCache() ? "complete" : "unknown"
  );

  const exempt =
    pathname === "/" || EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (!isLoaded || !isSignedIn || exempt) return;
    if (readCache()) {
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
    // A pending product tour means the wizard is done and the user is
    // deliberately being kept on gated pages (the tour itself gates them
    // instead) even though onboarding_completed hasn't been set server-side
    // yet - see startProductTour() in product-tour.tsx for why.
    if (status === "incomplete" && pathname !== "/onboarding" && !isProductTourPending()) {
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
  // redirect to /onboarding being in progress. A pending tour is let through
  // regardless - see the effect above.
  if (!isLoaded || status === "unknown") return null;
  if (status === "incomplete" && !isProductTourPending()) return null;

  return <>{children}</>;
}
