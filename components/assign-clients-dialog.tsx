"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { ApiError, assignWorkflowToClients, type ClientWithChecklistSummary, type Workflow } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Picks the clients one workflow runs for: the step right after creating it,
// and from the library for a workflow with no clients yet. The inverse of
// AssignWorkflowDialog, where the clients are fixed and the workflow is picked.
export function AssignClientsDialog({
  workflow,
  clients,
  open,
  onOpenChange,
  onAssigned,
}: {
  workflow: Workflow;
  clients: ClientWithChecklistSummary[] | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssigned: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(
    () => (clients ?? []).filter((c) => !c.archived_at).sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );
  const assigned = useMemo(
    () =>
      new Set(
        active.filter((c) => c.workflow_statuses.some((w) => w.workflow_id === workflow.id)).map((c) => c.id)
      ),
    [active, workflow.id]
  );
  const term = query.trim().toLowerCase();
  const shown = term
    ? active.filter((c) => `${c.name} ${c.email} ${c.company_name ?? ""}`.toLowerCase().includes(term))
    : active;

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const close = (next: boolean) => {
    if (saving) return;
    if (!next) {
      setQuery("");
      setSelected(new Set());
      setError(null);
    }
    onOpenChange(next);
  };

  const onAssign = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      await assignWorkflowToClients(workflow.id, [...selected]);
      onAssigned();
      setSaving(false);
      setSelected(new Set());
      setQuery("");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Which clients is {workflow.name} for?</DialogTitle>
          <DialogDescription>
            {workflow.execution_mode === "auto"
              ? "It starts for each one as soon as their document checklist is complete."
              : "Your team starts it from each client's page once their document checklist is complete."}
          </DialogDescription>
        </DialogHeader>

        {clients === undefined ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : active.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients yet. Add clients first, then assign this workflow.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {active.length > 6 && (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label="Search clients"
                  placeholder="Search clients"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            )}
            <div className="-mx-2.5 flex max-h-80 flex-col gap-0.5 overflow-y-auto">
              {shown.map((client) => {
                const already = assigned.has(client.id);
                const checked = already || selected.has(client.id);
                return (
                  <label
                    key={client.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm",
                      already ? "text-muted-foreground" : "cursor-pointer hover:bg-muted",
                      selected.has(client.id) && "bg-muted/60"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-primary"
                      checked={checked}
                      disabled={already || saving}
                      onChange={() => toggle(client.id)}
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{client.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{client.company_name || client.email}</span>
                    </span>
                    {already && <span className="shrink-0 text-xs">Already assigned</span>}
                  </label>
                );
              })}
              {shown.length === 0 && <p className="px-2.5 py-2 text-sm text-muted-foreground">No clients match.</p>}
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={saving}>
            Not now
          </Button>
          <Button onClick={onAssign} disabled={saving || selected.size === 0}>
            {saving
              ? "Assigning…"
              : selected.size
                ? `Assign to ${selected.size} client${selected.size === 1 ? "" : "s"}`
                : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
