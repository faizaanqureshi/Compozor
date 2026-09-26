"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { ArrowLeft } from "lucide-react";
import { ApiError, ClientUsageOut, getOrganizationUsageBreakdown } from "@/lib/api";
import { adminOrganizationUsageKey } from "@/lib/swr-keys";
import { formatCompactNumber } from "@/lib/utils";
import { RangePreset, autoBucketForRange, isAdminEmail, rangeLabel, rangeToWindow } from "@/lib/admin";
import { Panel, panelTableHead } from "@/components/panel";
import {
  CostCell,
  CostOverTime,
  CostSources,
  ModelCosts,
  SortableTh,
  UnpricedNotice,
  UsageControls,
  UsageTotals,
  UsageWindows,
  useMoney,
  type Sort,
} from "@/components/usage-dashboard";
import { Skeleton } from "@/components/ui/skeleton";

type SortKey = "name" | "calls" | "cost";

export default function AdminOrganizationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const organizationId = Number(id);
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const admin = isAdminEmail(user?.primaryEmailAddress?.emailAddress);

  useEffect(() => {
    if (isLoaded && !admin) router.replace("/clients");
  }, [isLoaded, admin, router]);

  const [range, setRange] = useState<RangePreset>("30d");
  const bucket = autoBucketForRange(range);
  const usageWindow = useMemo(() => rangeToWindow(range), [range]);
  const { data, error, isLoading } = useSWR(admin ? adminOrganizationUsageKey(organizationId, bucket, range) : null, () =>
    getOrganizationUsageBreakdown(organizationId, { bucket, ...usageWindow })
  );
  const fetchError = error ? (error instanceof ApiError ? error.message : String(error)) : null;

  if (!isLoaded || !admin) return null;

  const activeClients = (data?.by_client ?? []).filter((c) => c.client_id !== null).length;

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link
          href="/admin"
          className="-ml-2 inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Usage and cost
        </Link>
        {isLoading && !data ? (
          <Skeleton className="h-11 w-72" />
        ) : (
          <div className="flex flex-col gap-2">
            <h1 className="text-4xl leading-tight font-thin tracking-tight text-balance [font-family:var(--font-denton)] md:text-5xl">
              {data?.organization_name ?? "Firm"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {data?.client_count ?? 0} client{data?.client_count === 1 ? "" : "s"}. What each one costs to serve, and where
              it comes from.
            </p>
          </div>
        )}
      </header>

      {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}

      <UsageWindows windows={data?.windows} loading={isLoading && !data} />

      <div className="flex flex-col gap-4 border-t border-border/60 pt-6">
        <UsageControls range={range} onRangeChange={setRange} />
        <UnpricedNotice count={data?.totals.unpriced_call_count ?? 0} />
        <UsageTotals totals={data?.totals} activeClients={activeClients} loading={isLoading && !data} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <CostOverTime periods={data?.by_period} bucket={bucket} loading={isLoading && !data} />
        <CostSources categories={data?.by_category} features={data?.by_feature} loading={isLoading && !data} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <ClientsTable
          organizationId={organizationId}
          clients={data?.by_client}
          loading={isLoading && !data}
          rangeText={rangeLabel(range).toLowerCase()}
        />
        <ModelCosts models={data?.by_model} loading={isLoading && !data} />
      </div>
    </div>
  );
}

function ClientsTable({
  organizationId,
  clients,
  loading,
  rangeText,
}: {
  organizationId: number;
  clients: ClientUsageOut[] | undefined;
  loading: boolean;
  rangeText: string;
}) {
  const money = useMoney();
  const [sort, setSort] = useState<Sort<SortKey>>({ key: "cost", direction: "desc" });
  const total = (clients ?? []).reduce((n, c) => n + c.cost_usd, 0);
  const rows = useMemo(() => {
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...(clients ?? [])].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return (a.client_name ?? "").localeCompare(b.client_name ?? "") * dir;
        case "calls":
          return (a.call_count - b.call_count) * dir;
        case "cost":
          return (a.cost_usd - b.cost_usd) * dir;
      }
    });
  }, [clients, sort]);
  const onSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: key === "name" ? "asc" : "desc" }
    );

  return (
    <Panel title="Clients" meta={loading ? undefined : `${rows.length} with usage · ${rangeText}`}>
      {loading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No client usage in this range.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[36rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/70">
                <SortableTh label="Client" sortKey="name" sort={sort} onSort={onSort} />
                <SortableTh label="AI calls" sortKey="calls" sort={sort} onSort={onSort} />
                <th className={panelTableHead}>Tokens</th>
                <SortableTh label="Cost" sortKey="cost" sort={sort} onSort={onSort} className="pr-0" />
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.client_id ?? "none"} className="group/row border-b border-border/50 align-top transition-colors last:border-0 hover:bg-muted/30">
                  <td className="py-3 pr-4">
                    {c.client_id !== null ? (
                      <Link
                        href={`/admin/${organizationId}/clients/${c.client_id}`}
                        className="font-medium underline-offset-4 group-hover/row:underline"
                      >
                        {c.client_name ?? "Deleted client"}
                      </Link>
                    ) : (
                      <span className="flex flex-col">
                        <span className="font-medium">Firm-level</span>
                        <span className="text-xs text-muted-foreground">Mail not tied to a client, imports</span>
                      </span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-foreground/80 tabular-nums">
                    {formatCompactNumber(c.call_count)}
                    <span className="block text-xs text-muted-foreground">
                      {c.call_count ? `${money.format(c.cost_usd / c.call_count)} each` : ""}
                    </span>
                  </td>
                  <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground tabular-nums">
                    {formatCompactNumber(c.input_tokens)} in · {formatCompactNumber(c.output_tokens)} out
                  </td>
                  <td className="py-3">
                    <CostCell aggregate={c} share={total ? c.cost_usd / total : undefined} />
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
