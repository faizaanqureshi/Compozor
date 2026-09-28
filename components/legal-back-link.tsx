"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { canReturnToPreviousPage } from "@/lib/legal-back-navigation";

// The legal pages' back link. Returns to wherever the page was opened from
// (Settings, the client upload portal, sign-in...) and falls back to the
// homepage when there's no in-app page to return to. It stays a real link
// to "/" so modified clicks and no-JS visits behave as before.
export function LegalBackLink({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const canGoBack = canReturnToPreviousPage({
      documentUrl: navigation?.name ?? null,
      currentUrl: window.location.href,
      referrer: document.referrer,
      origin: window.location.origin,
      historyLength: window.history.length,
    });
    if (!canGoBack) return;
    e.preventDefault();
    router.back();
  };

  return (
    <Link
      href="/"
      onClick={onClick}
      className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeftIcon className="size-3.5" />
      {children}
    </Link>
  );
}
