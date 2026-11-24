"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus } from "lucide-react";
import {
  ApiError,
  Service,
  ServiceCadence,
  ServiceDueRule,
  ServiceInput,
  createService,
  listPackages,
  listWorkflows,
  updateService,
} from "@/lib/api";
import { packagesKey, workflowsKey } from "@/lib/swr-keys";
import { CADENCE_LABELS, MONTHS, dueDescription } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const blank: ServiceInput = {
  name: "",
  description: "",
  package_id: null,
  workflow_ids: [],
  cadence: "yearly",
  due_rule: "fixed_date",
  due_month: 4,
  due_day: 30,
  due_months_after: 0,
  due_days_after: 0,
  opens_days_after_period_end: 1,
  year_end_month: 12,
  year_end_day: 31,
  run_automatically: true,
};

const toInput = (s: Service): ServiceInput => ({
  name: s.name,
  description: s.description ?? "",
  package_id: s.package_id,
  workflow_ids: s.workflow_ids,
  cadence: s.cadence,
  due_rule: s.due_rule,
  due_month: s.due_month,
  due_day: s.due_day,
  due_months_after: s.due_months_after,
  due_days_after: s.due_days_after,
  opens_days_after_period_end: s.opens_days_after_period_end,
  year_end_month: s.year_end_month,
  year_end_day: s.year_end_day,
  run_automatically: s.run_automatically,
});

const num = (v: string) => (v === "" ? 0 : Math.max(0, Math.floor(Number(v)) || 0));

export function ServiceFormDialog({ service, onSaved }: { service?: Service; onSaved: (s: Service) => void }) {
  const isEdit = service !== undefined;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ServiceInput>(service ? toInput(service) : blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: packages } = useSWR(open ? packagesKey() : null, listPackages);
  const { data: workflows } = useSWR(open ? workflowsKey() : null, listWorkflows);

  const set = (patch: Partial<ServiceInput>) => setForm((f) => ({ ...f, ...patch }));
  const toggleWorkflow = (id: number) =>
    set({ workflow_ids: form.workflow_ids.includes(id) ? form.workflow_ids.filter((w) => w !== id) : [...form.workflow_ids, id] });
  const hasYearEnd = form.cadence === "yearly" || form.cadence === "quarterly";

  const onOpenChange = (next: boolean) => {
    if (saving) return;
    if (next) {
      setForm(service ? toInput(service) : blank);
      setError(null);
    }
    setOpen(next);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const input: ServiceInput = {
      ...form,
      name: form.name.trim(),
      description: form.description?.trim() || null,
      due_month: form.due_rule === "fixed_date" ? form.due_month : null,
      due_day: form.due_rule === "fixed_date" ? form.due_day : null,
      due_months_after: form.due_rule === "after_period_end" ? form.due_months_after : 0,
      due_days_after: form.due_rule === "after_period_end" ? form.due_days_after : 0,
    };
    try {
      const saved = isEdit ? await updateService(service.id, input) : await createService(input);
      setOpen(false);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={isEdit ? <Button variant="ghost" size="sm" /> : <Button />}>
        {isEdit ? (
          "Edit"
        ) : (
          <>
            <Plus />
            New service
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? `Edit ${service.name}` : "New service"}</DialogTitle>
            <DialogDescription>
              Work you do for clients on a schedule. Each period, Compozor asks for the documents, chases them, and
              runs the workflows once everything is in.
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[60vh] flex-col gap-5 overflow-y-auto pr-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="service-name">Name</Label>
              <Input id="service-name" required placeholder="T1 personal tax" value={form.name}
                onChange={(e) => set({ name: e.target.value })} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="service-description">
                Description <span className="font-normal text-muted-foreground">Optional</span>
              </Label>
              <Textarea id="service-description" rows={2} value={form.description ?? ""}
                onChange={(e) => set({ description: e.target.value })} />
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="service-cadence">How often</Label>
                <NativeSelect id="service-cadence" value={form.cadence}
                  onChange={(e) => set({ cadence: e.target.value as ServiceCadence })}>
                  {(Object.keys(CADENCE_LABELS) as ServiceCadence[]).map((c) => (
                    <option key={c} value={c}>{CADENCE_LABELS[c]}</option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="service-due-rule">When it&apos;s due</Label>
                <NativeSelect id="service-due-rule" value={form.due_rule}
                  onChange={(e) => set({ due_rule: e.target.value as ServiceDueRule })}>
                  <option value="fixed_date">On a set date</option>
                  <option value="after_period_end">After the period ends</option>
                </NativeSelect>
              </div>
            </div>

            {form.due_rule === "fixed_date" ? (
              <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="service-due-month">Due month</Label>
                  <NativeSelect id="service-due-month" value={form.due_month ?? 4}
                    onChange={(e) => set({ due_month: Number(e.target.value) })}>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="service-due-day">Day</Label>
                  <Input id="service-due-day" inputMode="numeric" value={form.due_day ?? ""}
                    onChange={(e) => set({ due_day: Math.min(31, num(e.target.value)) || null })} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="service-due-months">Months after</Label>
                  <Input id="service-due-months" inputMode="numeric" value={form.due_months_after ?? 0}
                    onChange={(e) => set({ due_months_after: num(e.target.value) })} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="service-due-days">Days after</Label>
                  <Input id="service-due-days" inputMode="numeric" value={form.due_days_after ?? 0}
                    onChange={(e) => set({ due_days_after: num(e.target.value) })} />
                </div>
              </div>
            )}
            <p className="-mt-3 text-xs text-muted-foreground">{dueDescription(form)}.</p>

            {hasYearEnd && (
              <div className="flex flex-col gap-1.5">
                <Label>Year ends</Label>
                <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
                  <NativeSelect aria-label="Year-end month" value={form.year_end_month}
                    onChange={(e) => set({ year_end_month: Number(e.target.value) })}>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </NativeSelect>
                  <Input aria-label="Year-end day" inputMode="numeric" value={form.year_end_day}
                    onChange={(e) => set({ year_end_day: Math.min(31, num(e.target.value)) || 31 })} />
                </div>
                <p className="text-xs text-muted-foreground">
                  A client can have their own, such as a corporation&apos;s year-end.
                </p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="service-opens">Send the first request</Label>
              <div className="flex items-center gap-2 text-sm">
                <Input id="service-opens" inputMode="numeric" className="max-w-20" value={form.opens_days_after_period_end}
                  onChange={(e) => set({ opens_days_after_period_end: num(e.target.value) })} />
                <span className="text-muted-foreground">days after the period ends</span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="service-package">Documents to request</Label>
              <NativeSelect id="service-package" value={form.package_id ?? ""}
                onChange={(e) => set({ package_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">No documents</option>
                {(packages ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">The package&apos;s required documents are requested each period.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Workflows to run</Label>
              {workflows === undefined ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : workflows.filter((w) => !w.archived_at).length === 0 ? (
                <p className="text-sm text-muted-foreground">No workflows yet. You can add them later.</p>
              ) : (
                <div className="-mx-2.5 flex max-h-44 flex-col gap-0.5 overflow-y-auto">
                  {workflows.filter((w) => !w.archived_at).map((w) => (
                    <label key={w.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted">
                      <input type="checkbox" className="size-4 accent-primary" checked={form.workflow_ids.includes(w.id)}
                        onChange={() => toggleWorkflow(w.id)} />
                      {w.name}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <label className="flex items-start justify-between gap-4">
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Start workflows on their own</span>
                <span className="text-xs text-muted-foreground">As soon as a period&apos;s documents are all in. Off: your team clicks Run now.</span>
              </span>
              <Switch checked={form.run_automatically} onCheckedChange={(on) => set({ run_automatically: on })} />
            </label>
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create service"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
