"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { ApiError, getUsageOverview, getUsageSummary, listOrganizationsUsage } from "@/lib/api";
import { adminOrganizationsKey, adminSummaryKey, adminUsageOverviewKey } from "@/lib/swr-keys";
import { formatCompactNumber } from "@/lib/utils";
import { RangePreset, autoBucketForRange, isAdminEmail, rangeLabel, rangeToWindow } from "@/lib/admin";
import { Panel, panelTableHead } from "@/components/panel";
import {
  CostCell,
  CostOverTime,
  CostSources,
  ModelCosts,
  SortableTh,
  type Sort,
  UnpricedNotice,
  UsageControls,
  UsageTotals,
  UsageWindows,
  useMoney,
} from "@/components/usage-dashboard";
import { Skeleton } from "@/components/ui/skeleton";

type SortKey = "name" | "clients" | "calls" | "cost" | "per_client";

export default function AdminPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const admin = isAdminEmail(user?.primaryEmailAddress?.emailAddress);

  useEffect(() => {
    if (isLoaded && !admin) router.replace("/clients");
  }, [isLoaded, admin, router]);

  // One date range scopes every figure, chart, and table on the page, so
  // the totals can never disagree with the rows beneath them. The fixed
  // windows at the top are the only exception, by design.
  const [range, setRange] = useState<RangePreset>("30d");
  const usageWindow = useMemo(() => rangeToWindow(range), [range]);
  const bucket = autoBucketForRange(range);

  const { data: summary, error: summaryError, isLoading: summaryLoading } = useSWR(
    admin ? adminSummaryKey(range) : null,
    () => getUsageSummary(usageWindow)
  );
  const { data: organizations, error: orgsError, isLoading: orgsLoading } = useSWR(
    admin ? adminOrganizationsKey(range) : null,
    () => listOrganizationsUsage(usageWindow)
  );
  const { data: overview, isLoading: overviewLoading } = useSWR(
    admin ? adminUsageOverviewKey(bucket, range) : null,
    () => getUsageOverview({ bucket, ...usageWindow })
  );

  const error = summaryError ?? orgsError;
  const fetchError = error ? (error instanceof ApiError ? error.message : String(error)) : null;

  // Not loaded yet, or a confirmed non-admin mid-redirect: render nothing
  // rather than flash internal figures.
  if (!isLoaded || !admin) return null;

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl leading-tight font-thin tracking-tight [font-family:var(--font-denton)] md:text-5xl">
          Usage and cost
        </h1>
        {summaryLoading ? (
          <Skeleton className="h-4 w-72" />
        ) : (
          <p className="text-sm text-pretty text-muted-foreground">
            What AI costs to run Compozor, across {summary?.organization_count ?? 0} firm
            {summary?.organization_count === 1 ? "" : "s"} and {summary?.client_count ?? 0} client
            {summary?.client_count === 1 ? "" : "s"}. Internal only.
          </p>
        )}
      </header>

      {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}

      <UsageWindows windows={summary?.windows} loading={summaryLoading} />

      <div className="flex flex-col gap-4 border-t border-border/60 pt-6">
        <UsageControls range={range} onRangeChange={setRange} />
        <UnpricedNotice count={summary?.totals.unpriced_call_count ?? 0} />
        <UsageTotals totals={summary?.totals} activeClients={summary?.active_client_count} loading={summaryLoading} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <CostOverTime periods={overview} bucket={bucket} loading={overviewLoading} />
        <CostSources categories={summary?.by_category} features={summary?.by_feature} loading={summaryLoading} />
      </div>

      <FirmsTable organizations={organizations} loading={orgsLoading} rangeText={rangeLabel(range).toLowerCase()} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <TopClients summary={summary} loading={summaryLoading} />
        <ModelCosts models={summary?.by_model} loading={summaryLoading} />
      </div>
    </div>
  );
}

function FirmsTable({
  organizations,
  loading,
  rangeText,
}: {
  organizations: Awaited<ReturnType<typeof listOrganizationsUsage>> | undefined;
  loading: boolean;
  rangeText: string;
}) {
  const money = useMoney();
  const [sort, setSort] = useState<Sort<SortKey>>({ key: "cost", direction: "desc" });
  const total = (organizations ?? []).reduce((n, o) => n + o.cost_usd, 0);
  const perClient = (o: { cost_usd: number; active_client_count: number }) =>
    o.active_client_count ? o.cost_usd / o.active_client_count : 0;

  const rows = useMemo(() => {
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...(organizations ?? [])].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "clients":
          return (a.active_client_count - b.active_client_count) * dir;
        case "calls":
          return (a.call_count - b.call_count) * dir;
        case "cost":
          return (a.cost_usd - b.cost_usd) * dir;
        case "per_client":
          return (perClient(a) - perClient(b)) * dir;
      }
    });
  }, [organizations, sort]);

  const onSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "name" ? "asc" : "desc" }
    );

  return (
    <Panel title="Firms" meta={loading ? undefined : `${organizations?.length ?? 0} · ${rangeText}`}>
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No firms yet.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70">
                <SortableTh label="Firm" sortKey="name" sort={sort} onSort={onSort} />
                <SortableTh label="Clients" sortKey="clients" sort={sort} onSort={onSort} />
                <SortableTh label="AI calls" sortKey="calls" sort={sort} onSort={onSort} />
                <th className={panelTableHead}>Tokens</th>
                <SortableTh label="Cost" sortKey="cost" sort={sort} onSort={onSort} />
                <SortableTh label="Per active client" sortKey="per_client" sort={sort} onSort={onSort} className="pr-0 text-right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((org) => (
                <tr key={org.id} className="group/row border-b border-border/50 align-top transition-colors last:border-0 hover:bg-muted/30">
                  <td className="py-3 pr-4">
                    <Link href={`/admin/${org.id}`} className="font-medium underline-offset-4 group-hover/row:underline">
                      {org.name}
                    </Link>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-foreground/80 tabular-nums">
                    {org.active_client_count}
                    <span className="text-muted-foreground"> of {org.client_count}</span>
                  </td>
                  <td className="py-3 pr-4 text-foreground/80 tabular-nums">{formatCompactNumber(org.call_count)}</td>
                  <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatCompactNumber(org.input_tokens)} in · {formatCompactNumber(org.output_tokens)} out
                  </td>
                  <td className="py-3 pr-4">
                    <CostCell aggregate={org} share={total ? org.cost_usd / total : undefined} />
                  </td>
                  <td className="py-3 text-right text-foreground/80 tabular-nums">
                    {org.active_client_count ? money.format(perClient(org)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function TopClients({
  summary,
  loading,
}: {
  summary: Awaited<ReturnType<typeof getUsageSummary>> | undefined;
  loading: boolean;
}) {
  const clients = summary?.top_clients ?? [];
  const total = summary?.totals.cost_usd ?? 0;
  return (
    <Panel title="Most expensive clients" meta="Across every firm">
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No client usage in this range.</p>
      ) : (
        <ul className="-my-1 flex flex-col divide-y divide-border/60">
          {clients.map((c) => (
            <li key={`${c.organization_id}-${c.client_id}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 py-3">
              <div className="flex min-w-0 flex-col">
                <Link
                  href={`/admin/${c.organization_id}/clients/${c.client_id}`}
                  className="truncate text-sm font-medium underline-offset-4 hover:underline"
                >
                  {c.client_name ?? "Deleted client"}
                </Link>
                <span className="truncate text-xs text-muted-foreground">
                  {c.organization_name} · {formatCompactNumber(c.call_count)} calls
                </span>
              </div>
              <CostCell aggregate={c} share={total ? c.cost_usd / total : undefined} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
