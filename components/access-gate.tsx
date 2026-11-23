"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { PlanUsageSection } from "@/components/plan-usage-section";
import { getMyOrganization, getMyUsage } from "@/lib/api";
import { organizationKey, usageKey } from "@/lib/swr-keys";

const backFromCheckout = () =>
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("billing") === "success";

// With the free trial over and no plan, nothing in Compozor runs; this
// replaces every page until an admin chooses a plan. Data is kept.
export function AccessGate({ children }: { children: React.ReactNode }) {
  const clerk = useClerk();
  const { data: org } = useSWR(organizationKey(), getMyOrganization, {
    // Back from Stripe Checkout: unlock as soon as the subscription arrives.
    refreshInterval: (latest) => (latest?.access === "locked" && backFromCheckout() ? 2000 : 0),
  });
  if (org?.access !== "locked") return <>{children}</>;
  const admin = org.current_user_role === "admin";
  return (
    <div className="flex min-h-screen flex-col items-center px-4 py-12 sm:py-20">
      <div className="flex w-full max-w-3xl flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-light tracking-tight">Your free trial has ended</h1>
          <p className="max-w-xl text-sm text-pretty text-muted-foreground">
            Compozor has stopped working for {org.name}: no workflows, emails or reminders. Your clients and
            documents are kept.{" "}
            {admin ? "Choose a plan to turn everything back on." : "Ask an admin at your firm to choose a plan."}
          </p>
        </div>
        {admin && <PlanUsageSection />}
        <Button variant="ghost" className="self-start text-muted-foreground" onClick={() => void clerk.signOut({ redirectUrl: "/sign-in" })}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));

// For admins: the trial's days left, and any limit the firm is near or at.
export function UsageNotice() {
  const pathname = usePathname();
  const { data: org } = useSWR(organizationKey(), getMyOrganization);
  const admin = org?.current_user_role === "admin";
  const { data: report } = useSWR(admin ? usageKey() : null, getMyUsage);
  if (!report || pathname.startsWith("/settings")) return null;
  const alert = report.alerts[0];
  const trial = report.access === "trial" && report.trial;
  if (!alert && !trial) return null;
  const urgent = !!alert && !alert.key.endsWith("_80") && alert.key !== "included_100_extra";
  const days = trial ? daysLeft(trial.ends_at) : 0;
  return (
    <div
      role="status"
      className={
        urgent || (trial && days <= 3)
          ? "mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-warning/20 px-4 py-3 text-sm text-warning-foreground"
          : "mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground"
      }
    >
      <span>
        {trial && <span className="font-medium">Free trial · {days === 1 ? "1 day" : `${days} days`} left. </span>}
        {alert ? alert.headline + "." : "Choose a plan anytime to keep everything running after it ends."}
      </span>
      <Link href="/settings#plan" className="font-medium underline-offset-4 hover:underline">
        {trial ? "Choose a plan" : "See usage"}
      </Link>
    </div>
  );
}
