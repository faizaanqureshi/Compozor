"use client";

import { cloneElement, isValidElement, useMemo, useState, type ReactElement } from "react";
import useSWR from "swr";
import { Search } from "lucide-react";
import {
  ApiError,
  Service,
  assignService,
  listServices,
  type ClientWithChecklistSummary,
} from "@/lib/api";
import { servicesKey } from "@/lib/swr-keys";
import { MONTHS, formatDay, scheduleDescription } from "@/lib/services";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Options = { ownYearEnd: boolean; month: number; day: number; openNow: boolean };
const defaultOptions: Options = { ownYearEnd: false, month: 12, day: 31, openNow: false };

// The year-end and "start now" choices shared by both ways of assigning.
function AssignOptions({ service, options, onChange }: {
  service: Service; options: Options; onChange: (o: Options) => void;
}) {
  const hasYearEnd = service.cadence === "yearly" || service.cadence === "quarterly";
  const next = service.next_period;
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted/50 p-3.5 text-sm">
      {hasYearEnd && (
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2.5">
            <input type="checkbox" className="size-4 accent-primary" checked={options.ownYearEnd}
              onChange={(e) => onChange({ ...options, ownYearEnd: e.target.checked })} />
            Their own year-end
            <span className="text-muted-foreground">
              (service uses {MONTHS[service.year_end_month - 1].slice(0, 3)} {service.year_end_day})
            </span>
          </label>
          {options.ownYearEnd && (
            <div className="grid max-w-xs grid-cols-[minmax(0,1fr)_5rem] gap-2 pl-6.5">
              <NativeSelect aria-label="Year-end month" value={options.month}
                onChange={(e) => onChange({ ...options, month: Number(e.target.value) })}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </NativeSelect>
              <Input aria-label="Year-end day" inputMode="numeric" value={options.day}
                onChange={(e) => onChange({ ...options, day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
            </div>
          )}
        </div>
      )}
      <label className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={options.openNow}
          onChange={(e) => onChange({ ...options, openNow: e.target.checked })} />
        <span>
          Start now
          <span className="block text-xs text-muted-foreground">
            {next && !options.ownYearEnd
              ? `Otherwise the first request for ${next.label} goes out on ${formatDay(next.opens_on)}.`
              : "Otherwise the first request goes out when the period opens."}
          </span>
        </span>
      </label>
    </div>
  );
}

const payload = (options: Options) => ({
  year_end_month: options.ownYearEnd ? options.month : null,
  year_end_day: options.ownYearEnd ? options.day : null,
  open_now: options.openNow,
});

/** Assign a service to fixed clients: from a client's page or the client list's selection. */
export function AssignServiceDialog({ clientIds, trigger, onAssigned, assignedServiceIds = [] }: {
  clientIds: number[];
  trigger: ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  onAssigned: () => void;
  assignedServiceIds?: number[];
}) {
  const [open, setOpen] = useState(false);
  const { data: services } = useSWR(open ? servicesKey() : null, listServices);
  const [picked, setPicked] = useState<Service | null>(null);
  const [options, setOptions] = useState<Options>(defaultOptions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = () => {
    setPicked(null);
    setOptions(defaultOptions);
    setError(null);
    setOpen(true);
  };

  const onAssign = async () => {
    if (!picked) return;
    setSaving(true);
    setError(null);
    try {
      await assignService(picked.id, { client_ids: clientIds, ...payload(options) });
      setOpen(false);
      onAssigned();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const who = clientIds.length === 1 ? "this client" : `${clientIds.length} clients`;
  return (
    <>
      {isValidElement(trigger) ? cloneElement(trigger, { onClick: start }) : trigger}
      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign a service</DialogTitle>
            <DialogDescription>
              Each period, Compozor asks {who} for the documents, chases them, and runs the work.
            </DialogDescription>
          </DialogHeader>
          {services === undefined ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : services.length === 0 ? (
            <p className="text-sm text-muted-foreground">No services yet. Create one on the Services page first.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="-mx-2.5 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
                {services.map((s) => {
                  const already = assignedServiceIds.includes(s.id);
                  return (
                    <label key={s.id} className={cn("flex items-start gap-3 rounded-lg px-2.5 py-2 text-sm",
                      already ? "text-muted-foreground" : "cursor-pointer hover:bg-muted",
                      picked?.id === s.id && "bg-muted/60")}>
                      <input type="radio" name="service" className="mt-1 size-4 accent-primary" disabled={already || saving}
                        checked={picked?.id === s.id} onChange={() => setPicked(s)} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{s.name}</span>
                        <span className="truncate text-xs text-muted-foreground">{scheduleDescription(s)}</span>
                      </span>
                      {already && <span className="shrink-0 text-xs">Assigned</span>}
                    </label>
                  );
                })}
              </div>
              {picked && <AssignOptions service={picked} options={options} onChange={setOptions} />}
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={onAssign} disabled={saving || !picked}>{saving ? "Assigning…" : "Assign"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Assign one service to clients picked from the list: from the Services page. */
export function ServiceClientsDialog({ service, clients, assignedClientIds, open, onOpenChange, onAssigned }: {
  service: Service;
  clients: ClientWithChecklistSummary[] | undefined;
  assignedClientIds: Set<number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [options, setOptions] = useState<Options>(defaultOptions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useMemo(
    () => (clients ?? []).filter((c) => !c.archived_at).sort((a, b) => a.name.localeCompare(b.name)), [clients]);
  const term = query.trim().toLowerCase();
  const shown = term ? active.filter((c) => `${c.name} ${c.email} ${c.company_name ?? ""}`.toLowerCase().includes(term)) : active;

  const close = (next: boolean) => {
    if (saving) return;
    if (!next) {
      setQuery("");
      setSelected(new Set());
      setOptions(defaultOptions);
      setError(null);
    }
    onOpenChange(next);
  };

  const onAssign = async () => {
    setSaving(true);
    setError(null);
    try {
      await assignService(service.id, { client_ids: [...selected], ...payload(options) });
      setSaving(false);
      close(false);
      onAssigned();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Who is {service.name} for?</DialogTitle>
          <DialogDescription>{scheduleDescription(service)}. Each period runs on its own for these clients.</DialogDescription>
        </DialogHeader>
        {clients === undefined ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="flex flex-col gap-3">
            {active.length > 6 && (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Search clients" placeholder="Search clients" value={query}
                  onChange={(e) => setQuery(e.target.value)} className="pl-8" />
              </div>
            )}
            <div className="-mx-2.5 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
              {shown.map((c) => {
                const already = assignedClientIds.has(c.id);
                return (
                  <label key={c.id} className={cn("flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm",
                    already ? "text-muted-foreground" : "cursor-pointer hover:bg-muted", selected.has(c.id) && "bg-muted/60")}>
                    <input type="checkbox" className="size-4 shrink-0 accent-primary" disabled={already || saving}
                      checked={already || selected.has(c.id)}
                      onChange={() => setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                        return next;
                      })} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{c.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{c.company_name || c.email}</span>
                    </span>
                    {already && <span className="shrink-0 text-xs">Assigned</span>}
                  </label>
                );
              })}
              {shown.length === 0 && <p className="px-2.5 py-2 text-sm text-muted-foreground">No clients match.</p>}
            </div>
            {selected.size > 0 && <AssignOptions service={service} options={options} onChange={setOptions} />}
          </div>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={saving}>Cancel</Button>
          <Button onClick={onAssign} disabled={saving || selected.size === 0}>
            {saving ? "Assigning…" : selected.size ? `Assign to ${selected.size} client${selected.size === 1 ? "" : "s"}` : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
