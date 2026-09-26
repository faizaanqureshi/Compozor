"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { ApiError, getClientUsageBreakdown } from "@/lib/api";
import { adminClientUsageKey } from "@/lib/swr-keys";
import { RangePreset, autoBucketForRange, isAdminEmail, rangeToWindow } from "@/lib/admin";
import {
  CostOverTime,
  CostSources,
  ModelCosts,
  UnpricedNotice,
  UsageControls,
  UsageTotals,
  UsageWindows,
} from "@/components/usage-dashboard";
import { Skeleton } from "@/components/ui/skeleton";

// What one client costs to serve: fixed windows, the selected range's
// totals, how it moved over time, and which parts of the product drove it.
export default function AdminClientUsagePage({ params }: { params: Promise<{ id: string; clientId: string }> }) {
  const { id, clientId } = use(params);
  const organizationId = Number(id);
  const client = Number(clientId);
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const admin = isAdminEmail(user?.primaryEmailAddress?.emailAddress);

  useEffect(() => {
    if (isLoaded && !admin) router.replace("/clients");
  }, [isLoaded, admin, router]);

  const [range, setRange] = useState<RangePreset>("30d");
  const bucket = autoBucketForRange(range);
  const usageWindow = useMemo(() => rangeToWindow(range), [range]);
  const { data, error, isLoading } = useSWR(admin ? adminClientUsageKey(organizationId, client, bucket, range) : null, () =>
    getClientUsageBreakdown(organizationId, client, { bucket, ...usageWindow })
  );
  const fetchError = error ? (error instanceof ApiError ? error.message : String(error)) : null;
  const loading = isLoading && !data;

  if (!isLoaded || !admin) return null;

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link
          href={`/admin/${organizationId}`}
          className="-ml-2 inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {data?.organization_name ?? "Firm"}
        </Link>
        {loading ? (
          <Skeleton className="h-11 w-72" />
        ) : (
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl leading-tight font-thin tracking-tight text-balance [font-family:var(--font-denton)] md:text-5xl">
              {data?.client_name ?? "Client"}
            </h1>
            <p className="text-sm text-muted-foreground">
              AI cost for this client at {data?.organization_name}, and where it comes from.
            </p>
          </div>
        )}
      </header>

      {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}

      <UsageWindows windows={data?.windows} loading={loading} />

      <div className="flex flex-col gap-4 border-t border-border/60 pt-6">
        <UsageControls range={range} onRangeChange={setRange} />
        <UnpricedNotice count={data?.totals.unpriced_call_count ?? 0} />
        <UsageTotals totals={data?.totals} loading={loading} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <CostOverTime periods={data?.by_period} bucket={bucket} loading={loading} />
        <div className="flex min-w-0 flex-col gap-6">
          <CostSources categories={data?.by_category} features={data?.by_feature} loading={loading} />
          <ModelCosts models={data?.by_model} loading={loading} />
        </div>
      </div>
    </div>
  );
}
