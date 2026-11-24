"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, X } from "lucide-react";
import { ApiError, ClientService, listClientServices, removeService } from "@/lib/api";
import { clientServicesKey } from "@/lib/swr-keys";
import { MONTHS } from "@/lib/services";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/panel";
import { AssignServiceDialog } from "@/components/assign-service-dialog";

// The services this client gets (e.g. T1 every year). Each runs its periods on its own.
export function ClientServicesCard({ clientId, onChange }: { clientId: number; onChange?: () => void }) {
  const { data, error, mutate } = useSWR(clientServicesKey(clientId), () => listClientServices(clientId));
  const refresh = () => {
    void mutate();
    onChange?.();
  };
  return (
    <Panel
      title="Services"
      meta={data?.length ? `${data.length}` : undefined}
      loadError={error ? String(error) : null}
      action={
        <AssignServiceDialog
          clientIds={[clientId]}
          assignedServiceIds={(data ?? []).map((s) => s.service_id)}
          onAssigned={refresh}
          trigger={<Button variant="outline" size="sm"><Plus />Assign service</Button>}
        />
      }
    >
      {data === undefined ? (
        <Skeleton className="h-12 w-full" />
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No services yet. Assign one and Compozor runs it every period: requests, chasing and the work.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/50">
          {data.map((cs) => <ServiceLine key={cs.id} clientService={cs} onChange={refresh} />)}
        </ul>
      )}
    </Panel>
  );
}

function ServiceLine({ clientService, onChange }: { clientService: ClientService; onChange: () => void }) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onRemove = async () => {
    setRemoving(true);
    setError(null);
    try {
      await removeService(clientService.service_id, clientService.client_id);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setRemoving(false);
    }
  };
  return (
    <li className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{clientService.service_name}</span>
        {clientService.year_end_month && clientService.year_end_day && (
          <span className="text-xs text-muted-foreground">
            Year ends {MONTHS[clientService.year_end_month - 1].slice(0, 3)} {clientService.year_end_day}
          </span>
        )}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
      <Button variant="ghost" size="icon-sm" className="text-muted-foreground" disabled={removing} onClick={onRemove}
        aria-label={`Stop ${clientService.service_name} for this client`}>
        <X />
      </Button>
    </li>
  );
}
