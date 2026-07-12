"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { useUser } from "@clerk/nextjs";
import { AlertTriangle, ArrowUp } from "lucide-react";
import { ApiError, OrganizationUsageOut, listOrganizationsUsage } from "@/lib/api";
import { adminOrganizationsKey } from "@/lib/swr-keys";
import { cn, formatCompactNumber, formatCurrency } from "@/lib/utils";
import { isAdminEmail } from "@/lib/admin";
import { useCurrency } from "@/components/currency-context";
import { CurrencyToggle } from "@/components/currency-toggle";
import { Skeleton } from "@/components/ui/skeleton";

type SortKey = "name" | "clients" | "calls" | "tokens" | "cost";
type Sort = { key: SortKey; direction: "asc" | "desc" };

export default function AdminPage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const admin = isAdminEmail(user?.primaryEmailAddress?.emailAddress);

  useEffect(() => {
    if (isLoaded && !admin) router.replace("/clients");
  }, [isLoaded, admin, router]);

  const {
    data: organizations,
    error,
    isLoading,
  } = useSWR(admin ? adminOrganizationsKey() : null, () => listOrganizationsUsage());
  const [sort, setSort] = useState<Sort>({ key: "cost", direction: "desc" });
  const { currency, rate } = useCurrency();
  // rate is undefined only while CAD's first fetch is in flight - fall back
  // to 1 (i.e. show USD figures) rather than multiplying by undefined.
  const toDisplay = (usd: number) => usd * (rate ?? 1);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "name" ? "asc" : "desc" }
    );
  };

  const rows = useMemo(() => {
    const dir = sort.direction === "asc" ? 1 : -1;
    return [...(organizations ?? [])].sort((a, b) => {
      switch (sort.key) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "clients":
          return (a.client_count - b.client_count) * dir;
        case "calls":
          return (a.call_count - b.call_count) * dir;
        case "tokens":
          return (
            (a.input_tokens + a.output_tokens - (b.input_tokens + b.output_tokens)) * dir
          );
        case "cost":
          return (a.cost_usd - b.cost_usd) * dir;
      }
    });
  }, [organizations, sort]);

  const totals = useMemo(() => {
    const list = organizations ?? [];
    return {
      clients: list.reduce((n, o) => n + o.client_count, 0),
      cost: list.reduce((n, o) => n + o.cost_usd, 0),
      unpriced: list.reduce((n, o) => n + o.unpriced_call_count, 0),
    };
  }, [organizations]);

  const fetchError = error ? (error instanceof ApiError ? error.message : String(error)) : null;

  // Not loaded yet, or a confirmed non-admin mid-redirect - render nothing
  // rather than flash the table.
  if (!isLoaded || !admin) return null;

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-thin tracking-tight [font-family:var(--font-denton)] sm:text-5xl md:text-6xl">
            Admin
          </h1>
          {isLoading ? (
            <Skeleton className="h-4 w-72" />
          ) : (
            <p className="text-sm text-muted-foreground">
              {organizations?.length ?? 0} organization
              {organizations?.length === 1 ? "" : "s"} · {totals.clients} client
              {totals.clients === 1 ? "" : "s"} · {formatCurrency(toDisplay(totals.cost), currency)}{" "}
              total spend
            </p>
          )}
        </div>
        <CurrencyToggle />
      </div>

      {fetchError && <p className="text-sm text-destructive">{fetchError}</p>}

      {!isLoading && totals.unpriced > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4 shrink-0" />
          <span>
            {totals.unpriced} call{totals.unpriced === 1 ? "" : "s"} used a model with no
            pricing entry yet — totals below understate real spend until the pricing table
            is updated.
          </span>
        </div>
      )}

      <section className="flex flex-col gap-4">
        <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Organizations
        </div>
        <div className="rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="text-left">
                  <SortableTh label="Organization" sortKey="name" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Clients" sortKey="clients" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Calls" sortKey="calls" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Tokens" sortKey="tokens" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Cost" sortKey="cost" sort={sort} onSort={toggleSort} />
                </tr>
              </thead>
              <tbody>
                {isLoading &&
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="border-b border-border/50 py-3 pr-4">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    </tr>
                  ))}
                {!isLoading &&
                  rows.map((org, i) => (
                    <OrganizationRow
                      key={org.id}
                      org={org}
                      currency={currency}
                      toDisplay={toDisplay}
                      delayMs={Math.min(i, 10) * 25}
                    />
                  ))}
                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="animate-blur-in-sm py-8 text-center text-muted-foreground">
                      No organizations yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function OrganizationRow({
  org,
  currency,
  toDisplay,
  delayMs,
}: {
  org: OrganizationUsageOut;
  currency: string;
  toDisplay: (usd: number) => number;
  delayMs: number;
}) {
  return (
    <tr className="group/row animate-blur-in-sm" style={{ animationDelay: `${delayMs}ms` }}>
      <td className="border-b border-border/50 py-3 pr-4">
        <Link
          href={`/admin/${org.id}`}
          className="font-thin underline-offset-4 [font-family:var(--font-denton)] group-hover/row:underline"
        >
          {org.name}
        </Link>
      </td>
      <td className="border-b border-border/50 py-3 pr-4 text-foreground/70">
        {org.client_count}
      </td>
      <td className="border-b border-border/50 py-3 pr-4 text-foreground/70">
        {org.call_count}
      </td>
      <td className="border-b border-border/50 py-3 pr-4 text-foreground/70">
        {formatCompactNumber(org.input_tokens)} in / {formatCompactNumber(org.output_tokens)} out
      </td>
      <td className="border-b border-border/50 py-3 pr-4">
        <span className="inline-flex items-center gap-1.5">
          <span className="text-foreground/80">{formatCurrency(toDisplay(org.cost_usd), currency)}</span>
          {org.unpriced_call_count > 0 && (
            <span
              title={`${org.unpriced_call_count} call(s) with no pricing entry - actual spend is higher`}
              className="size-1.5 rounded-full bg-amber-500"
            />
          )}
        </span>
      </td>
    </tr>
  );
}

function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort;
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th className="border-b border-border/70 py-2 pr-4 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex items-center gap-1 transition-colors",
          active ? "text-foreground" : "hover:text-foreground/70"
        )}
      >
        {label}
        <ArrowUp
          className={cn(
            "size-3 transition-transform",
            active ? "opacity-100" : "opacity-0",
            active && sort.direction === "desc" && "rotate-180"
          )}
        />
      </button>
    </th>
  );
}
