"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { AlertTriangle, ArrowLeft, ChevronDown } from "lucide-react";
import {
  ApiError,
  ClientUsageOut,
  FeatureUsageOut,
  ModelUsageOut,
  PeriodUsageOut,
  UsageBucket,
  getOrganizationUsageBreakdown,
} from "@/lib/api";
import { adminOrganizationUsageKey } from "@/lib/swr-keys";
import { cn, formatCompactNumber, formatCurrency } from "@/lib/utils";
import {
  RangePreset,
  USAGE_BUCKETS,
  autoBucketForRange,
  isAdminEmail,
  periodLabel,
  rangeLabel,
  rangeToWindow,
} from "@/lib/admin";
import { useCurrency } from "@/components/currency-context";
import { CurrencyToggle } from "@/components/currency-toggle";
import { RangeToggle } from "@/components/range-toggle";
import { CostOverTimeChart } from "@/components/cost-over-time-chart";
import { CostBarChart } from "@/components/cost-bar-chart";
import { Skeleton } from "@/components/ui/skeleton";

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

type Row = { label: string; call_count: number; unpriced_call_count: number; input_tokens: number; output_tokens: number; cost_usd: number };

// How many rows a breakdown table shows before it collapses behind an
// expand toggle - most of these lists (features, models) are naturally
// short, but by_client/by_day can run long, and nobody needs to scroll
// through a hundred rows to see the totals above.
const TABLE_ROW_LIMIT = 5;

function UsageTable({
  rows,
  labelHeader,
  currency,
  toDisplay,
}: {
  rows: Row[];
  labelHeader: string;
  currency: string;
  toDisplay: (usd: number) => number;
}) {
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No usage in this window.</p>;
  }

  const hasMore = rows.length > TABLE_ROW_LIMIT;
  const visibleRows = expanded ? rows : rows.slice(0, TABLE_ROW_LIMIT);

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="text-left">
              <th className="border-b border-border/70 py-2 pr-4 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                {labelHeader}
              </th>
              <th className="border-b border-border/70 py-2 pr-4 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                Calls
              </th>
              <th className="border-b border-border/70 py-2 pr-4 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                Tokens
              </th>
              <th className="border-b border-border/70 py-2 pr-4 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                Cost
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r, i) => (
              <tr key={i}>
                <td className="border-b border-border/50 py-3 pr-4 text-foreground/80">{r.label}</td>
                <td className="border-b border-border/50 py-3 pr-4 text-foreground/70">{r.call_count}</td>
                <td className="border-b border-border/50 py-3 pr-4 text-foreground/70">
                  {formatCompactNumber(r.input_tokens)} in / {formatCompactNumber(r.output_tokens)} out
                </td>
                <td className="border-b border-border/50 py-3 pr-4">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="text-foreground/80">{formatCurrency(toDisplay(r.cost_usd), currency)}</span>
                    {r.unpriced_call_count > 0 && (
                      <span
                        title={`${r.unpriced_call_count} call(s) with no pricing entry - actual spend is higher`}
                        className="size-1.5 rounded-full bg-amber-500"
                      />
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {expanded ? "Show less" : `Show all ${rows.length}`}
          <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}

const featureRows = (rows: FeatureUsageOut[]): Row[] =>
  rows.map((r) => ({ label: r.feature, ...r }));
const modelRows = (rows: ModelUsageOut[]): Row[] => rows.map((r) => ({ label: r.model, ...r }));
const periodRows = (rows: PeriodUsageOut[], bucket: UsageBucket): Row[] =>
  rows.map((r) => ({ label: periodLabel(r.period, bucket), ...r }));
const clientRows = (rows: ClientUsageOut[]): Row[] =>
  rows.map((r) => ({ label: r.client_name ?? "(no client)", ...r }));

export default function AdminOrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const organizationId = Number(id);
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const admin = isAdminEmail(user?.primaryEmailAddress?.emailAddress);

  useEffect(() => {
    if (isLoaded && !admin) router.replace("/clients");
  }, [isLoaded, admin, router]);

  // Same date-range filter as the org list page - scopes the hero total and
  // every breakdown card (feature/model/period/client) on this page to the
  // same window at once. The chart's own time-bucket granularity is derived
  // from the range rather than chosen separately, so there's only one
  // filter control on the page, not two.
  const [range, setRange] = useState<RangePreset>("all");
  const bucket = autoBucketForRange(range);
  const usageWindow = useMemo(() => rangeToWindow(range), [range]);
  const {
    data: breakdown,
    error,
    isLoading,
  } = useSWR(admin ? adminOrganizationUsageKey(organizationId, bucket, range) : null, () =>
    getOrganizationUsageBreakdown(organizationId, { bucket, ...usageWindow })
  );
  const { currency, rate } = useCurrency();
  const toDisplay = (usd: number) => usd * (rate ?? 1);

  const totals = useMemo(() => {
    const rows = breakdown?.by_feature ?? [];
    return {
      calls: rows.reduce((n, r) => n + r.call_count, 0),
      cost: rows.reduce((n, r) => n + r.cost_usd, 0),
      unpriced: rows.reduce((n, r) => n + r.unpriced_call_count, 0),
    };
  }, [breakdown]);

  const fetchError = error ? (error instanceof ApiError ? error.message : String(error)) : null;

  if (!isLoaded || !admin) return null;

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          All organizations
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-2">
            {isLoading ? (
              <Skeleton className="h-10 w-72" />
            ) : (
              <h1 className="text-4xl font-thin tracking-tight [font-family:var(--font-denton)] sm:text-5xl md:text-6xl">
                {breakdown?.organization_name}
              </h1>
            )}
          </div>
          <CurrencyToggle />
        </div>
      </div>

      {/* Date range first - scopes the hero total, chart, and every
          breakdown card below it. */}
      <RangeToggle value={range} onChange={setRange} />

      {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}

      {!isLoading && totals.unpriced > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            {totals.unpriced} call{totals.unpriced === 1 ? "" : "s"} used a model with no
            pricing entry yet — totals below understate real spend.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-72 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <SectionCard title="Cost over time">
            <div className="flex flex-col gap-1">
              <span className="text-4xl font-thin tracking-tight tabular-nums [font-family:var(--font-denton)]">
                {formatCurrency(toDisplay(totals.cost), currency)}
              </span>
              <span className="text-sm text-muted-foreground">
                Total spend · {totals.calls} call{totals.calls === 1 ? "" : "s"} ·{" "}
                {rangeLabel(range).toLowerCase()}
              </span>
            </div>
            <CostOverTimeChart
              data={(breakdown?.by_period ?? []).map((r) => ({
                label: periodLabel(r.period, bucket),
                value: toDisplay(r.cost_usd),
              }))}
              formatValue={(v) => formatCurrency(v, currency)}
            />
            <UsageTable
              rows={periodRows(breakdown?.by_period ?? [], bucket)}
              labelHeader={USAGE_BUCKETS.find((b) => b.value === bucket)?.label ?? "Period"}
              currency={currency}
              toDisplay={toDisplay}
            />
          </SectionCard>

          <SectionCard title="By feature">
            <CostBarChart
              data={(breakdown?.by_feature ?? []).map((r) => ({
                label: r.feature,
                value: toDisplay(r.cost_usd),
              }))}
              formatValue={(v) => formatCurrency(v, currency)}
            />
            <UsageTable
              rows={featureRows(breakdown?.by_feature ?? [])}
              labelHeader="Feature"
              currency={currency}
              toDisplay={toDisplay}
            />
          </SectionCard>
          <SectionCard title="By model">
            <CostBarChart
              data={(breakdown?.by_model ?? []).map((r) => ({
                label: r.model,
                value: toDisplay(r.cost_usd),
              }))}
              formatValue={(v) => formatCurrency(v, currency)}
            />
            <UsageTable
              rows={modelRows(breakdown?.by_model ?? [])}
              labelHeader="Model"
              currency={currency}
              toDisplay={toDisplay}
            />
          </SectionCard>
          <SectionCard title="By client">
            <CostBarChart
              data={(breakdown?.by_client ?? []).map((r) => ({
                label: r.client_name ?? "(no client)",
                value: toDisplay(r.cost_usd),
              }))}
              formatValue={(v) => formatCurrency(v, currency)}
            />
            <UsageTable
              rows={clientRows(breakdown?.by_client ?? [])}
              labelHeader="Client"
              currency={currency}
              toDisplay={toDisplay}
            />
          </SectionCard>
        </div>
      )}
    </div>
  );
}
