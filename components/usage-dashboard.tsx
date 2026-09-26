"use client";

import { useMemo } from "react";
import { AlertTriangle, ArrowUp } from "lucide-react";
import type {
  CategoryUsageOut,
  FeatureUsageOut,
  ModelUsageOut,
  PeriodUsageOut,
  UsageAggregate,
  UsageBucket,
  UsageCategory,
  UsageWindowOut,
} from "@/lib/api";
import { RANGE_PRESETS, periodLabel, type RangePreset } from "@/lib/admin";
import { cn, formatCompactNumber, formatCurrency } from "@/lib/utils";
import { useCurrency, type CurrencyCode } from "@/components/currency-context";
import { Panel, panelTableHead } from "@/components/panel";
import { StatStrip, type StatStripItem } from "@/components/stat-strip";
import { Skeleton } from "@/components/ui/skeleton";

// Where AI spend comes from, in a fixed order and one chart colour each.
export const CATEGORY_META: Record<UsageCategory, { label: string; swatch: string }> = {
  workflows: { label: "Workflows", swatch: "bg-chart-1" },
  email: { label: "Email and replies", swatch: "bg-chart-2" },
  documents: { label: "Document checks", swatch: "bg-chart-4" },
  client_import: { label: "Client import", swatch: "bg-chart-5" },
  other: { label: "Other", swatch: "bg-chart-3" },
};
const CATEGORY_ORDER = Object.keys(CATEGORY_META) as UsageCategory[];

// Readable names for recorded feature ids, falling back to the id itself.
const FEATURE_LABELS: Record<string, string> = {
  qa_answer: "Answering client questions",
  communication_review: "Reviewing answers before sending",
  email_intent: "Reading client emails",
  email_junk_triage: "Filtering junk mail",
  inbound_email_triage: "Sorting unmatched mail",
  "email_draft.checklist_reminder": "Drafting reminders",
  "email_draft.followup": "Drafting follow-ups",
  "email_draft.received_acknowledgment": "Drafting receipts",
  "email_draft.checklist_edit": "Drafting request changes",
  "email_draft.commitment_followup": "Drafting promise follow-ups",
  "email_draft.supplementary_document": "Drafting extra-document replies",
  "email_draft.unsupported_file": "Drafting unsupported-file replies",
  document_classification: "Checking documents",
  checklist_extraction: "Reading document requests",
  workflow_builder: "Building workflows",
  workflow_plan: "Planning workflow runs",
  workflow_execute: "Running workflows",
  workflow_extract: "Extracting workflow data",
  workflow_extract_records: "Extracting workflow records",
  workflow_categorize: "Categorizing transactions",
  workflow_review_request: "Reviewing workflow requests",
  workflow_verify_advanced: "Verifying workflow output",
  client_import_extraction: "Reading client imports",
  client_import_mapping: "Mapping client imports",
};

export function featureLabel(feature: string) {
  return FEATURE_LABELS[feature] ?? feature;
}

// Formats a USD amount in the selected display currency.
export function useMoney() {
  const { currency, rate } = useCurrency();
  // rate is undefined only while CAD's first fetch is in flight; show USD
  // figures until it arrives rather than multiplying by undefined.
  return useMemo(() => {
    const factor = rate ?? 1;
    const code: CurrencyCode = rate === undefined ? "USD" : currency;
    return {
      currency: code,
      format: (usd: number) => formatMoney(usd * factor, code),
      convert: (usd: number) => usd * factor,
    };
  }, [currency, rate]);
}

// Cents for everyday amounts, more precision only when a figure would
// otherwise round to zero.
function formatMoney(amount: number, currency: string) {
  if (amount !== 0 && Math.abs(amount) < 0.01) return formatCurrency(amount, currency);
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap items-center gap-1">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={opt.disabled}
            onClick={() => onChange(opt.value)}
            className={cn(
              "inline-flex h-8 items-center rounded-lg px-3 text-[0.8125rem] transition-colors disabled:opacity-40",
              active ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// The page's one date range, plus the display currency.
export function UsageControls({ range, onRangeChange }: { range: RangePreset; onRangeChange: (range: RangePreset) => void }) {
  const { currency, setCurrency, rate, rateError } = useCurrency();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Segmented label="Date range" options={RANGE_PRESETS} value={range} onChange={onRangeChange} />
      <div className="flex items-center gap-2">
        {currency === "CAD" && rateError && <span className="text-xs text-destructive">Rate unavailable</span>}
        <Segmented
          label="Currency"
          options={[
            { value: "USD" as CurrencyCode, label: "USD" },
            { value: "CAD" as CurrencyCode, label: "CAD", disabled: !rate && currency !== "CAD" },
          ]}
          value={currency}
          onChange={setCurrency}
        />
      </div>
    </div>
  );
}

// Spend over fixed trailing windows, whatever range the page shows below.
export function UsageWindows({ windows, loading }: { windows: UsageWindowOut[] | undefined; loading: boolean }) {
  const money = useMoney();
  const items: StatStripItem[] = (windows ?? []).map((w) => ({
    label: w.label,
    value: money.format(w.cost_usd),
    detail: `${formatCompactNumber(w.call_count)} AI call${w.call_count === 1 ? "" : "s"}`,
  }));
  return (
    <StatStrip
      label="Spend by period"
      items={items}
      loading={loading}
      columns="grid-cols-2 lg:grid-cols-5 [&>*:last-child]:max-lg:col-span-2"
    />
  );
}

// The range's totals: what it cost, what drove it, and what a client costs.
export function UsageTotals({
  totals,
  activeClients,
  loading,
}: {
  totals: UsageAggregate | undefined;
  activeClients?: number;
  loading: boolean;
}) {
  const money = useMoney();
  const t = totals;
  const items: StatStripItem[] = t
    ? [
        {
          label: "Total cost",
          value: money.format(t.cost_usd),
          detail: `${money.format(t.token_cost_usd)} tokens · ${money.format(t.tool_cost_usd)} tools`,
        },
        ...(activeClients !== undefined
          ? [
              {
                label: "Per active client",
                value: activeClients ? money.format(t.cost_usd / activeClients) : "—",
                detail: `${activeClients} client${activeClients === 1 ? "" : "s"} with usage`,
              },
            ]
          : []),
        {
          label: "AI calls",
          value: formatCompactNumber(t.call_count),
          detail: t.call_count ? `${money.format(t.cost_usd / t.call_count)} per call` : "None in this range",
        },
        {
          label: "Tokens",
          value: formatCompactNumber(t.input_tokens + t.output_tokens),
          detail: `${formatCompactNumber(t.input_tokens)} in (${cachedShare(t)} cached) · ${formatCompactNumber(t.output_tokens)} out`,
        },
        {
          label: "Hosted tools",
          value: money.format(t.tool_cost_usd),
          detail: `${t.web_search_calls} searches · ${t.container_sessions} code sessions`,
        },
      ]
    : [];
  const count = activeClients !== undefined ? 5 : 4;
  return (
    <StatStrip
      label="Totals for this range"
      items={items}
      loading={loading}
      skeletonCount={count}
      columns={count === 5 ? "grid-cols-2 lg:grid-cols-5 [&>*:last-child]:max-lg:col-span-2" : "grid-cols-2 lg:grid-cols-4"}
    />
  );
}

function cachedShare(t: UsageAggregate) {
  return t.input_tokens ? `${Math.round((t.cached_input_tokens / t.input_tokens) * 100)}%` : "0%";
}

export function UnpricedNotice({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p className="flex items-start gap-2 rounded-lg bg-warning/15 px-4 py-3 text-sm text-warning-foreground">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      {count} call{count === 1 ? "" : "s"} used a model with no price on record, so these totals understate real
      spend. Add the model to the backend&apos;s pricing table.
    </p>
  );
}

// A thin rule split by category, for a row's cost mix.
export function CategorySplit({ costs, className }: { costs: Partial<Record<UsageCategory, number>>; className?: string }) {
  const parts = CATEGORY_ORDER.filter((c) => (costs[c] ?? 0) > 0);
  const total = parts.reduce((n, c) => n + (costs[c] ?? 0), 0);
  if (total === 0) return <span className={cn("block h-1 rounded-full bg-muted", className)} aria-hidden />;
  return (
    <span
      className={cn("flex h-1 gap-px overflow-hidden rounded-full bg-muted", className)}
      title={parts.map((c) => `${CATEGORY_META[c].label}: ${Math.round(((costs[c] ?? 0) / total) * 100)}%`).join(" · ")}
      aria-hidden
    >
      {parts.map((c) => (
        <span key={c} className={cn("h-full", CATEGORY_META[c].swatch)} style={{ flexGrow: costs[c] }} />
      ))}
    </span>
  );
}

function CategoryLegend({ categories }: { categories: UsageCategory[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
      {categories.map((c) => (
        <span key={c} className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-xs", CATEGORY_META[c].swatch)} aria-hidden />
          {CATEGORY_META[c].label}
        </span>
      ))}
    </div>
  );
}

function niceCeiling(max: number) {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * magnitude >= max) ?? 10;
  return step * magnitude;
}

// Cost per period as stacked columns, one colour per category.
export function CostOverTime({
  periods,
  bucket,
  loading,
}: {
  periods: PeriodUsageOut[] | undefined;
  bucket: UsageBucket;
  loading: boolean;
}) {
  const money = useMoney();
  const data = periods ?? [];
  const present = CATEGORY_ORDER.filter((c) => data.some((p) => (p.category_costs[c] ?? 0) > 0));
  const ceiling = niceCeiling(Math.max(0, ...data.map((p) => p.cost_usd)));
  const labelEvery = Math.max(1, Math.ceil(data.length / 6));

  return (
    <Panel title="Cost over time" meta={`By ${bucket}`}>
      {loading ? (
        <Skeleton className="h-56 w-full" />
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No usage in this range.</p>
      ) : (
        <figure className="flex flex-col gap-4">
          <CategoryLegend categories={present} />
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
            <div className="flex h-48 flex-col justify-between text-right text-[0.6875rem] text-muted-foreground tabular-nums">
              <span className="-translate-y-1/2">{money.format(ceiling)}</span>
              <span>{money.format(ceiling / 2)}</span>
              <span className="translate-y-1/2">{money.format(0)}</span>
            </div>
            <div className="relative h-48">
              <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
                <div className="border-t border-border/70" />
                <div className="border-t border-dashed border-border/70" />
                <div className="border-t border-border" />
              </div>
              <div
                className="absolute inset-0 flex items-end gap-px sm:gap-1"
                role="img"
                aria-label={`Cost by ${bucket}, split by where it came from.`}
              >
                {data.map((p) => (
                  <div
                    key={p.period}
                    className="flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-xs hover:bg-muted/60"
                    title={`${periodLabel(p.period, bucket)}: ${money.format(p.cost_usd)}\n${present
                      .filter((c) => (p.category_costs[c] ?? 0) > 0)
                      .map((c) => `${CATEGORY_META[c].label} ${money.format(p.category_costs[c] ?? 0)}`)
                      .join("\n")}`}
                  >
                    <div className="mx-auto flex w-full max-w-8 flex-col-reverse overflow-hidden rounded-t-xs" style={{ height: `${(p.cost_usd / ceiling) * 100}%` }}>
                      {present.map((c) => (
                        <span key={c} className={CATEGORY_META[c].swatch} style={{ flexGrow: p.category_costs[c] ?? 0 }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div />
            <div className="mt-2 flex h-4 gap-px text-[0.6875rem] text-muted-foreground sm:gap-1" aria-hidden>
              {data.map((p, i) => (
                <span key={p.period} className="relative min-w-0 flex-1">
                  {i % labelEvery === 0 && (
                    <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap">{periodLabel(p.period, bucket)}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </figure>
      )}
    </Panel>
  );
}

// Where the range's cost came from: each category's share, with the
// features inside it, most expensive first.
export function CostSources({
  categories,
  features,
  loading,
}: {
  categories: CategoryUsageOut[] | undefined;
  features: FeatureUsageOut[] | undefined;
  loading: boolean;
}) {
  const money = useMoney();
  const total = (categories ?? []).reduce((n, c) => n + c.cost_usd, 0);
  return (
    <Panel title="Where it comes from">
      {loading ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !categories?.length ? (
        <p className="text-sm text-muted-foreground">No usage in this range.</p>
      ) : (
        <ul className="-my-1 flex flex-col divide-y divide-border/60">
          {categories.map((c) => {
            const share = total ? c.cost_usd / total : 0;
            const inCategory = (features ?? []).filter((f) => f.category === c.category);
            return (
              <li key={c.category} className="flex flex-col gap-2 py-3.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <span className={cn("size-2 rounded-xs", CATEGORY_META[c.category]?.swatch ?? "bg-chart-3")} aria-hidden />
                    {CATEGORY_META[c.category]?.label ?? c.label}
                  </span>
                  <span className="text-sm tabular-nums">
                    {money.format(c.cost_usd)}
                    <span className="ml-2 text-xs text-muted-foreground">{Math.round(share * 100)}%</span>
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <div className={cn("h-full rounded-full", CATEGORY_META[c.category]?.swatch)} style={{ width: `${share * 100}%` }} />
                </div>
                <ul className="flex flex-col gap-1 pl-4">
                  {inCategory.map((f) => (
                    <li key={f.feature} className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                      <span className="truncate" title={f.feature}>
                        {featureLabel(f.feature)}
                        {f.unpriced_call_count > 0 && <span className="text-warning-foreground"> · unpriced</span>}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {money.format(f.cost_usd)} · {formatCompactNumber(f.call_count)}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

export function ModelCosts({ models, loading }: { models: ModelUsageOut[] | undefined; loading: boolean }) {
  const money = useMoney();
  const max = Math.max(0, ...(models ?? []).map((m) => m.cost_usd));
  return (
    <Panel title="By model">
      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : !models?.length ? (
        <p className="text-sm text-muted-foreground">No usage in this range.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {models.map((m) => (
            <li key={m.model} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-mono text-[0.8125rem]">
                  {m.model}
                  {m.unpriced_call_count > 0 && <span className="font-sans text-xs text-warning-foreground"> · no price</span>}
                </span>
                <span className="shrink-0 tabular-nums">{money.format(m.cost_usd)}</span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-chart-2" style={{ width: `${max ? (m.cost_usd / max) * 100 : 0}%` }} />
              </div>
              <span className="text-xs text-muted-foreground">
                {formatCompactNumber(m.call_count)} calls · {formatCompactNumber(m.input_tokens)} in · {formatCompactNumber(m.output_tokens)} out
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// Sortable-by-cost table rows share this cell: amount, split rule, share.
export function CostCell({ aggregate, share }: { aggregate: UsageAggregate; share?: number }) {
  const money = useMoney();
  return (
    <div className="flex min-w-32 flex-col gap-1.5">
      <span className="inline-flex items-baseline gap-2 tabular-nums">
        {money.format(aggregate.cost_usd)}
        {share !== undefined && <span className="text-xs text-muted-foreground">{Math.round(share * 100)}%</span>}
        {aggregate.unpriced_call_count > 0 && (
          <span title={`${aggregate.unpriced_call_count} calls with no price on record`} className="size-1.5 rounded-full bg-warning" />
        )}
      </span>
      <CategorySplit costs={aggregate.category_costs} className="w-full max-w-40" />
    </div>
  );
}

export type Sort<K extends string> = { key: K; direction: "asc" | "desc" };

export function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: K;
  sort: Sort<K>;
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={cn(panelTableHead, className)}
      aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn("inline-flex items-center gap-1 uppercase transition-colors", active ? "text-foreground" : "hover:text-foreground")}
      >
        {label}
        <ArrowUp
          className={cn("size-3 transition-transform", active ? "opacity-100" : "opacity-0", active && sort.direction === "desc" && "rotate-180")}
        />
      </button>
    </th>
  );
}
