"use client";

import { useEffect, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { ExternalLink, Loader2, Pencil } from "lucide-react";
import { Panel, panelTableHead } from "@/components/panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  ApiError,
  PlanKey,
  UsageReport,
  cancelPlan,
  changePlan,
  getMyUsage,
  openBillingPortal,
  setExtraUsage,
  startCheckout,
  updateMyOrganization,
} from "@/lib/api";
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

function TrialMeter({ percent }: { percent: number }) {
  const full = percent >= 100;
  return (
    <div className="flex max-w-md flex-col gap-2.5">
      <span className="text-foreground">
        <span className="tabular-nums">{Math.round(percent)}%</span> used
      </span>
      <span className="block h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Trial usage used"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <span className={cn("block h-full rounded-full", full || percent >= 80 ? "bg-warning" : "bg-primary")}
          style={{ width: `${Math.min(100, percent)}%` }} />
      </span>
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
        {over && report.extra_usage.enabled && report.billing_active ? (
          <>
            Extra usage so far:{" "}
            <span className="font-medium text-foreground tabular-nums">{money(usage.extra_usage_amount, report.currency)}</span>, added to
            your next bill.
          </>
        ) : usage.percent_used >= 100 ? (
          <>Included usage resets on {resetDate(report)}.</>
        ) : (
          <>At this pace you&apos;ll use about {Math.round(usage.projected_percent)}% by {monthEnd}.</>
        )}
      </p>
    </div>
  );
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const resetDate = (report: UsageReport) =>
  new Date(report.period_end).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// The API's reason points to this page; here, say what to do on it.
function pausedMessage(report: UsageReport) {
  if (!report.plan) return "Workflows are paused: your trial's workflow usage is used up. Choose a plan to keep running them.";
  if (report.extra_usage.enabled) return `Workflows are paused: this month's extra usage limit is reached. Raise the limit below, or wait until ${resetDate(report)}.`;
  if (report.extra_usage.available) return `Workflows are paused: included usage is used up. Turn on extra usage below, or wait until it resets on ${resetDate(report)}.`;
  return `Workflows are paused: included usage is used up until ${resetDate(report)}.`;
}

const errorText = (e: unknown) => (e instanceof ApiError ? e.message : String(e));

// Choosing a plan sends the admin to Stripe Checkout; they come back to this section.
function PlanPicker({ report }: { report: UsageReport }) {
  const [currency, setCurrency] = useState(report.currency);
  const [pending, setPending] = useState<PlanKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const choose = async (plan: PlanKey) => {
    setPending(plan);
    setError(null);
    try {
      window.location.assign((await startCheckout(plan, currency)).url);
    } catch (e) {
      setError(errorText(e));
      setPending(null);
    }
  };
  return (
    <div className="flex max-w-xl flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">
          {report.access === "trial" && report.trial
            ? `You're on a free trial until ${shortDate(report.trial.ends_at)}. Choose a plan anytime.`
            : report.access === "locked"
              ? "Choose a plan to turn Compozor back on."
              : "Choose a plan to start running workflows."}
        </span>
        <div className="flex shrink-0 rounded-md ring-1 ring-border" role="group" aria-label="Currency">
          {(["CAD", "USD"] as const).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={currency === code}
              onClick={() => setCurrency(code)}
              className={cn(
                "px-2.5 py-1 text-xs first:rounded-l-md last:rounded-r-md",
                currency === code ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {code}
            </button>
          ))}
        </div>
      </div>
      <ul className="flex flex-col">
        {report.available_plans.map((plan) => (
          <li key={plan.key} className="flex items-center justify-between gap-4 border-t border-border/60 py-2.5 first:border-t-0">
            <span>
              {plan.name}
              <span className="text-muted-foreground">
                {" · "}
                {money(plan.monthly_price[currency], currency, false)} a month
              </span>
            </span>
            <Button size="sm" variant="outline" disabled={pending !== null} onClick={() => void choose(plan.key)}>
              {pending === plan.key && <Loader2 className="animate-spin" />}
              Choose
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Billed monthly. For more than 20 people, email us about Enterprise.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ManageBilling({ label = "Manage billing" }: { label?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = async () => {
    setPending(true);
    setError(null);
    try {
      window.location.assign((await openBillingPortal()).url);
    } catch (e) {
      setError(errorText(e));
      setPending(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Button size="sm" variant="outline" disabled={pending} onClick={() => void open()}>
        {pending ? <Loader2 className="animate-spin" /> : <ExternalLink />}
        {label}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

type PlanAction = { kind: "change"; plan: PlanKey; name: string; upgrade: boolean } | { kind: "cancel" } | { kind: "keep" };

// Upgrade, downgrade, cancel and undo all happen here; Stripe's page is only
// for the card, billing details and invoices.
function SubscribedPlan({ report }: { report: UsageReport }) {
  const { mutate } = useSWRConfig();
  const [changing, setChanging] = useState(false);
  const [action, setAction] = useState<PlanAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = report.plan!;
  const currency = report.currency;
  const ends = resetDate(report);
  const rank = (key: string) => report.available_plans.findIndex((p) => p.key === key);
  const pending = report.cancel_at_period_end || report.scheduled_plan !== null;

  const confirm = async () => {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      const updated =
        action.kind === "cancel"
          ? await cancelPlan()
          : await changePlan(action.kind === "keep" ? (plan.key as PlanKey) : action.plan);
      await mutate(usageKey(), updated, { revalidate: false });
      setAction(null);
      setChanging(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const target = action?.kind === "change" ? report.available_plans.find((p) => p.key === action.plan) : null;
  const dialog =
    action?.kind === "change"
      ? action.upgrade
        ? {
            title: `Upgrade to ${action.name}`,
            body: `Starts now. You'll be charged ${money(target!.monthly_price[currency], currency, false)} today, less credit for the unused part of ${plan.name}. Included usage starts fresh with the new plan.`,
            button: `Upgrade to ${action.name}`,
          }
        : {
            title: `Switch to ${action.name}`,
            body: `You keep ${plan.name} until ${ends}, then move to ${action.name} at ${money(target!.monthly_price[currency], currency, false)} a month. You can change your mind before then.`,
            button: `Switch on ${ends}`,
          }
      : action?.kind === "cancel"
        ? {
            title: "Cancel plan",
            body: `You keep ${plan.name} until ${ends}. After that, workflows pause and nothing more is charged. Your clients and documents stay, and you can choose a plan again anytime.`,
            button: "Cancel plan",
          }
        : {
            title: `Keep ${plan.name}`,
            body: report.cancel_at_period_end
              ? `Your plan continues past ${ends} and renews as usual.`
              : `You stay on ${plan.name} after ${ends} instead of switching.`,
            button: `Keep ${plan.name}`,
          };

  return (
    <div className="flex flex-col gap-3">
      {!changing && (
        <span>
          {plan.name}
          <span className="text-muted-foreground">
            {" · "}
            {plan.monthly_price ? `${money(plan.monthly_price, currency, false)} a month` : "Custom pricing"}
          </span>
        </span>
      )}
      {report.subscription_status === "past_due" && (
        <p className="text-xs text-warning-foreground">Your last payment didn&apos;t go through. Update your card to keep your plan.</p>
      )}
      {pending && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <p className="text-xs text-muted-foreground">
            {report.cancel_at_period_end
              ? `Ends on ${ends}. Workflows pause after that.`
              : `Switches to ${report.scheduled_plan!.name} on ${ends}.`}
          </p>
          <Button size="sm" variant="ghost" onClick={() => setAction({ kind: "keep" })}>
            Keep {plan.name}
          </Button>
        </div>
      )}
      {changing && (
        <ul className="flex max-w-xl flex-col">
          {report.available_plans.map((option) => {
            const current = option.key === plan.key;
            const upgrade = rank(option.key) > rank(plan.key);
            return (
              <li key={option.key} className="flex items-center justify-between gap-4 border-t border-border/60 py-2.5 first:border-t-0">
                <span>
                  {option.name}
                  <span className="text-muted-foreground">
                    {" · "}
                    {money(option.monthly_price[currency], currency, false)} a month
                  </span>
                </span>
                {current ? (
                  <span className="px-3 text-xs text-muted-foreground">Current plan</span>
                ) : (
                  <Button
                    size="sm"
                    variant={upgrade ? "default" : "outline"}
                    onClick={() => setAction({ kind: "change", plan: option.key, name: option.name, upgrade })}
                  >
                    {upgrade ? "Upgrade" : "Downgrade"}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-start gap-2">
        <Button size="sm" variant="outline" onClick={() => setChanging((open) => !open)}>
          {changing ? "Done" : "Change plan"}
        </Button>
        <ManageBilling label={report.subscription_status === "past_due" ? "Update card" : "Card & invoices"} />
        {!report.cancel_at_period_end && (
          <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setAction({ kind: "cancel" })}>
            Cancel plan
          </Button>
        )}
      </div>

      <Dialog open={action !== null} onOpenChange={(open) => !open && !busy && (setAction(null), setError(null))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialog.title}</DialogTitle>
            <DialogDescription>{dialog.body}</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => (setAction(null), setError(null))}>
              Back
            </Button>
            <Button variant={action?.kind === "cancel" ? "destructive" : "default"} disabled={busy} onClick={() => void confirm()}>
              {busy && <Loader2 className="animate-spin" />}
              {dialog.button}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PlanRowValue({ report }: { report: UsageReport }) {
  if (!report.plan) return <PlanPicker report={report} />;
  if (report.billing_active) return <SubscribedPlan report={report} />;
  return (
    <div className="flex flex-col gap-1">
      <span>
        {report.plan.name}
        <span className="text-muted-foreground">
          {" · "}
          {report.plan.monthly_price ? `${money(report.plan.monthly_price, report.currency, false)} a month` : "Custom pricing"}
        </span>
      </span>
      <p className="text-xs text-muted-foreground">Billed by agreement with Compozor.</p>
    </div>
  );
}

// Off by default: when included usage runs out, workflows pause until the
// period resets. On, they keep running and the extra is added to the bill.
function ExtraUsage({ report }: { report: UsageReport }) {
  const { mutate } = useSWRConfig();
  const extra = report.extra_usage;
  const [limit, setLimit] = useState(extra.limit ? String(Number(extra.limit)) : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const price = report.plan?.monthly_price ? Number(report.plan.monthly_price) : null;

  const save = async (enabled: boolean, limitText: string) => {
    const amount = limitText.trim() === "" ? null : Number(limitText);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 100000)) {
      setError("Enter an amount between 0 and 100,000, or leave it empty for no limit.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await mutate(usageKey(), await setExtraUsage(enabled, amount), { revalidate: false });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  if (!extra.available) {
    return <p className="text-muted-foreground">Available once you&apos;re on a plan with a card on file.</p>;
  }
  return (
    <div className="flex max-w-md flex-col gap-3">
      <label className="flex items-center gap-3">
        <Switch checked={extra.enabled} disabled={saving} onCheckedChange={(on) => void save(on, limit)} />
        <span>{extra.enabled ? "On" : "Off"}</span>
        {saving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </label>
      {price !== null && (
        <p className="text-xs text-muted-foreground">
          Each 10% beyond your included usage adds{" "}
          <span className="text-foreground tabular-nums">{money(price / 10, report.currency)}</span>, the same rate as your plan.
        </p>
      )}
      {extra.enabled && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="extra-usage-limit" className="text-xs font-normal text-muted-foreground">
            Monthly limit (optional)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="extra-usage-limit"
              inputMode="decimal"
              placeholder="No limit"
              className="max-w-36"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void save(true, limit)}
            />
            <span className="shrink-0 text-xs text-muted-foreground">{report.currency}</span>
            <Button size="sm" variant="outline" disabled={saving} onClick={() => void save(true, limit)}>
              Save limit
            </Button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
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
  // Back from Stripe Checkout: the subscription arrives by webhook a moment
  // later, so check again every couple of seconds until it shows (up to 30s).
  // (Read once on the client; nothing it affects renders before the report loads.)
  const [awaitingCheckout, setAwaitingCheckout] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("billing") === "success"
  );
  useEffect(() => {
    if (!awaitingCheckout) return;
    const stop = setTimeout(() => setAwaitingCheckout(false), 30000);
    return () => clearTimeout(stop);
  }, [awaitingCheckout]);
  const { data: report, error } = useSWR(usageKey(), getMyUsage, {
    refreshInterval: (latest) => (awaitingCheckout && !latest?.billing_active ? 2000 : 0),
  });
  const finishingCheckout = awaitingCheckout && report && !report.billing_active;
  const month = report
    ? new Date(report.period_start).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : undefined;

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
          {finishingCheckout ? (
            <p role="status" className="mb-4 flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Payment received. Setting up your plan…
            </p>
          ) : report.access !== "locked" && report.workflows_paused_reason && (
            <p role="status" className="mb-4 rounded-lg bg-warning/20 px-4 py-3 text-sm text-warning-foreground">
              {pausedMessage(report)}
            </p>
          )}
          <Row label="Plan">
            <PlanRowValue report={report} />
          </Row>
          {report.access === "trial" && report.trial && (
            <Row label="Trial usage" description="Your trial includes usage for workflows. When it's used up, workflows pause until you choose a plan.">
              <TrialMeter percent={report.trial.percent_used} />
            </Row>
          )}
          {report.usage && (
            <Row label="Included usage" description="Every plan includes usage each month. When it runs out, workflows pause until it resets, unless extra usage is on.">
              <UsageMeter report={report} />
            </Row>
          )}
          {report.usage && (
            <Row label="Extra usage" description="Keep workflows running after included usage runs out. Added to your next bill.">
              <ExtraUsage report={report} />
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
