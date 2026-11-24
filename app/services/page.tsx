"use client";

import { useState } from "react";
import useSWR from "swr";
import { MoreHorizontal, Trash2, UserPlus } from "lucide-react";
import { ApiError, Service, archiveService, listClients, listServiceClients, listServices } from "@/lib/api";
import { clientsKey, servicesKey } from "@/lib/swr-keys";
import { formatDay, scheduleDescription } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Panel } from "@/components/panel";
import { ServiceFormDialog } from "@/components/service-form-dialog";
import { ServiceClientsDialog } from "@/components/assign-service-dialog";

export default function ServicesPage() {
  const { data: services, error, mutate } = useSWR(servicesKey(), listServices);
  const refresh = () => void mutate();

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl leading-tight font-light tracking-tight [font-family:var(--font-display)] md:text-5xl">
            Services
          </h1>
          <p className="max-w-xl text-sm text-pretty text-muted-foreground">
            The work you do for clients on a schedule, like a yearly tax return. Set one up once and assign it to
            clients; each period then asks for the documents, chases them, and runs the work on its own.
          </p>
        </div>
        <div className="self-start sm:self-auto">
          <ServiceFormDialog onSaved={refresh} />
        </div>
      </header>

      {error && <p className="text-sm text-destructive">{error instanceof ApiError ? error.message : String(error)}</p>}

      <Panel title="Your services" meta={services ? `${services.length}` : undefined}>
        {services === undefined ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : services.length === 0 ? (
          <div className="flex flex-col items-start gap-1.5 py-2">
            <p className="text-sm font-medium">Create your first service</p>
            <p className="max-w-md text-sm text-pretty text-muted-foreground">
              Pick the documents to request, the workflows to run, how often, and when it&apos;s due.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            <div aria-hidden
              className="hidden border-b border-border/70 pb-2.5 text-[0.6875rem] tracking-wider text-muted-foreground uppercase md:grid md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)_7rem_7.5rem] md:gap-4">
              <span>Service</span>
              <span>Next period</span>
              <span>Clients</span>
              <span />
            </div>
            <ul className="flex flex-col divide-y divide-border/50">
              {services.map((s) => <ServiceRow key={s.id} service={s} onChange={refresh} />)}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
}

function ServiceRow({ service, onChange }: { service: Service; onChange: () => void }) {
  const [assigning, setAssigning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: clients } = useSWR(assigning ? clientsKey() : null, listClients);
  const { data: assigned, mutate: mutateAssigned } = useSWR(
    assigning ? ["service-clients", service.id] : null, () => listServiceClients(service.id));
  const next = service.next_period;

  const onDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      await archiveService(service.id);
      setConfirming(false);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  };

  const work = [service.package_name ? `Requests ${service.package_name}` : "No documents",
    service.workflow_names.length ? `runs ${service.workflow_names.join(", ")}` : "no workflows yet"].join("; ");

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 py-4 md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)_7rem_7.5rem] md:items-start">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-sm font-medium">{service.name}</span>
        <span className="text-xs text-muted-foreground">{scheduleDescription(service)}</span>
        <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-foreground/70">{work}</p>
      </div>
      <div className="col-start-2 row-start-1 md:hidden">
        <RowActions service={service} onChange={onChange} onAssign={() => setAssigning(true)} onDelete={() => setConfirming(true)} />
      </div>
      <div className="text-sm max-md:col-span-2">
        {next ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-foreground/80">{next.label}</span>
            <span className="text-xs text-muted-foreground">
              Requests {formatDay(next.opens_on)} · due {formatDay(next.due_on)}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>
      <span className="text-sm text-foreground/80 max-md:col-span-2">
        {service.client_count} client{service.client_count === 1 ? "" : "s"}
      </span>
      <div className="hidden justify-end md:flex">
        <RowActions service={service} onChange={onChange} onAssign={() => setAssigning(true)} onDelete={() => setConfirming(true)} />
      </div>

      <ServiceClientsDialog
        service={service}
        clients={clients}
        assignedClientIds={new Set((assigned ?? []).map((a) => a.client_id))}
        open={assigning}
        onOpenChange={setAssigning}
        onAssigned={() => { void mutateAssigned(); onChange(); }}
      />

      <Dialog open={confirming} onOpenChange={(open) => !deleting && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {service.name}?</DialogTitle>
            <DialogDescription>
              No new periods start for its clients. Work already done and documents already received stay.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={onDelete} disabled={deleting}>{deleting ? "Deleting…" : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function RowActions({ service, onChange, onAssign, onDelete }: {
  service: Service; onChange: () => void; onAssign: () => void; onDelete: () => void;
}) {
  return (
    <div className="-mr-1 flex items-center gap-0.5">
      <ServiceFormDialog service={service} onSaved={onChange} />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Options for ${service.name}`} className="text-muted-foreground" />}>
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onAssign}>
            <UserPlus />
            Assign to clients
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 />
            Delete service
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
