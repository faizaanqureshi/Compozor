"use client";

import { useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Loader2, Pencil } from "lucide-react";
import { Panel, panelTableHead } from "@/components/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, UsageReport, getMyUsage, updateMyOrganization } from "@/lib/api";
import { organizationKey, usageKey } from "@/lib/swr-keys";
import { cn } from "@/lib/utils";

const money = (amount: string | number, currency: string, cents = true) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(Number(amount));

const hoursLabel = (hours: number) => `${hours.toLocaleString("en-US", { maximumFractionDigits: 1 })} ${hours === 1 ? "hour" : "hours"}`;

// One labelled line, matching the Settings rows: label left, value right, stacked on phones.
function Row({ label, description, children }: { label: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-border/60 py-5 first:border-t-0 first:pt-1 md:grid-cols-[14rem_minmax(0,1fr)] md:gap-8">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{label}</span>
        {description && <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{description}</p>}
      </div>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

function UsageMeter({ report }: { report: UsageReport }) {
  const usage = report.usage!;
  const over = usage.percent_used > 100;
  const heading = over ? "Over" : usage.projected_percent > 100 ? "On pace to go over" : null;
  const end = new Date(report.period_end);
  end.setUTCDate(end.getUTCDate() - 1);
  const monthEnd = end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  return (
    <div className="flex max-w-md flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-foreground">
          <span className="tabular-nums">{Math.round(usage.percent_used)}%</span> used
        </span>
        {heading && <span className="text-xs text-warning-foreground">{heading}</span>}
      </div>
      <span
        className="block h-1.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label="Included usage used this month"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(usage.percent_used))}
      >
        <span
          className={cn("block h-full rounded-full", over ? "bg-warning" : "bg-primary")}
          style={{ width: `${Math.min(100, usage.percent_used)}%` }}
        />
      </span>
      <p className="text-xs text-muted-foreground">
        {over ? (
          <>
            Extra usage so far:{" "}
            <span className="font-medium text-foreground tabular-nums">{money(usage.extra_usage_amount, report.currency)}</span>, added to
            this month&apos;s bill.
          </>
        ) : (
          <>At this pace you&apos;ll use about {Math.round(usage.projected_percent)}% by {monthEnd}.</>
        )}
        {!report.billing_active && " Billing isn't switched on yet, so nothing is charged."}
      </p>
    </div>
  );
}

function HourlyRate({ report }: { report: UsageReport }) {
  const { mutate } = useSWRConfig();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rate = report.time_saved.hourly_rate;

  const save = async () => {
    const amount = value.trim() === "" ? null : Number(value);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 10000)) {
      setError("Enter an amount between 0 and 10,000.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMyOrganization({ hourly_rate: amount });
      await Promise.all([mutate(organizationKey(), updated, { revalidate: false }), mutate(usageKey())]);
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className={rate ? "text-foreground" : "text-muted-foreground"}>
          {rate ? `${money(rate, report.currency, false)} an hour` : "Not set"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setValue(rate ? String(Number(rate)) : "");
            setEditing(true);
          }}
        >
          <Pencil />
          {rate ? "Edit" : "Add"}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex max-w-xs flex-col gap-2">
      <Label htmlFor="hourly-rate" className="sr-only">
        Hourly rate in {report.currency}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id="hourly-rate"
          inputMode="decimal"
          placeholder="150"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void save()}
          autoFocus
        />
        <span className="shrink-0 text-xs text-muted-foreground">{report.currency} / hour</span>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={saving} onClick={() => setEditing(false)}>
          Cancel
        </Button>
        <Button size="sm" disabled={saving} onClick={() => void save()}>
          {saving && <Loader2 className="animate-spin" />}
          Save rate
        </Button>
      </div>
    </div>
  );
}

function TimeSaved({ report }: { report: UsageReport }) {
  const saved = report.time_saved;
  const hours = Number(saved.hours);
  const items = saved.items.filter((item) => item.count > 0);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-3xl font-light tracking-tight tabular-nums">{hoursLabel(hours)}</span>
        <span className="text-sm text-muted-foreground">
          {saved.value
            ? `Worth about ${money(saved.value, report.currency, false)} of staff time`
            : "Add your hourly rate below to see what this time is worth."}
        </span>
      </div>
      {items.length > 0 ? (
        <table className="w-full max-w-xl text-sm">
          <thead>
            <tr>
              <th className={panelTableHead}>Work Compozor did</th>
              <th className={cn(panelTableHead, "text-right")}>Count</th>
              <th className={cn(panelTableHead, "hidden text-right sm:table-cell")}>Each</th>
              <th className={cn(panelTableHead, "pr-0 text-right")}>Time</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.key} className="border-t border-border/60">
                <td className="py-2.5 pr-4">{item.label}</td>
                <td className="py-2.5 pr-4 text-right tabular-nums">{item.count.toLocaleString("en-US")}</td>
                <td className="hidden py-2.5 pr-4 text-right text-muted-foreground tabular-nums sm:table-cell">{item.minutes_each} min</td>
                <td className="py-2.5 text-right whitespace-nowrap tabular-nums">{hoursLabel(Math.round((item.minutes / 60) * 10) / 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing yet this month. Work Compozor does for your clients appears here.</p>
      )}
      <p className="text-xs text-pretty text-muted-foreground">
        Estimates. Each kind of work is counted at the minutes shown, kept on the low side.
      </p>
    </div>
  );
}

export function PlanUsageSection() {
  const { data: report, error } = useSWR(usageKey(), getMyUsage);
  const month = report
    ? new Date(report.period_start).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : undefined;
  const plan = report?.plan;

  return (
    <Panel title="Plan & usage" meta={month} loadError={error ? String(error) : null}>
      {!report ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="flex flex-col">
          <Row label="Plan">
            {plan ? (
              <span>
                {plan.name}
                <span className="text-muted-foreground">
                  {" · "}
                  {plan.monthly_price ? `${money(plan.monthly_price, report.currency, false)} a month` : "Custom pricing"}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">No plan yet. We&apos;ll set it with you while billing is being set up.</span>
            )}
          </Row>
          {report.usage && (
            <Row label="Included usage" description="Every plan includes AI usage each month. Extra usage is added to that month's bill.">
              <UsageMeter report={report} />
            </Row>
          )}
          <Row label="Active clients" description="Clients Compozor worked on this month.">
            <span className="tabular-nums">{report.active_clients.toLocaleString("en-US")}</span>
          </Row>
          <Row label="Time saved" description="Work Compozor did this month that your team would otherwise do by hand.">
            <TimeSaved report={report} />
          </Row>
          <Row label="Hourly rate" description="What an hour of your team's time is worth. Used only to value time saved.">
            <HourlyRate report={report} />
          </Row>
        </div>
      )}
    </Panel>
  );
}
