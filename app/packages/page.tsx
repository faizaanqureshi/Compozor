"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { clientsKey, packagesKey } from "@/lib/swr-keys";
import { MoreHorizontal, Trash2 } from "lucide-react";
import {
  ApiError,
  PackageWithAssignmentCount,
  archivePackage,
  listClients,
  listPackages,
} from "@/lib/api";
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
import { PackageFormDialog } from "@/components/package-form-dialog";
import { Panel } from "@/components/panel";
import { ProgressRule, StatStrip, type StatStripItem } from "@/components/stat-strip";

const PREVIEW_DOCUMENTS = 3;

type Collection = { received: number; requested: number; outstanding: number };

export default function PackagesPage() {
  const { data, error: loadError, mutate } = useSWR(packagesKey(), listPackages);
  // Checklist items remember the package they came from, so the client list
  // (shared cache with the Clients page) gives each package's collection.
  const { data: clients, mutate: mutateClients } = useSWR(clientsKey(), listClients);
  const packages: PackageWithAssignmentCount[] | null = data ?? null;
  const error = loadError ? (loadError instanceof ApiError ? loadError.message : String(loadError)) : null;
  const refresh = () => {
    void mutate();
    void mutateClients();
  };

  const { byPackage, totals, clientsWithPackages } = useMemo(() => {
    const byPackage = new Map<number, Collection>();
    const totals: Collection = { received: 0, requested: 0, outstanding: 0 };
    const withPackages = new Set<number>();
    for (const client of clients ?? []) {
      if (client.assigned_packages.length > 0) withPackages.add(client.id);
      for (const item of client.checklist_summary.items) {
        if (item.package_id === null) continue;
        const c = byPackage.get(item.package_id) ?? { received: 0, requested: 0, outstanding: 0 };
        c.requested++;
        totals.requested++;
        if (item.status === "received") {
          c.received++;
          totals.received++;
        } else {
          c.outstanding++;
          totals.outstanding++;
        }
        byPackage.set(item.package_id, c);
      }
    }
    return { byPackage, totals, clientsWithPackages: withPackages.size };
  }, [clients]);

  const documentsDefined = (packages ?? []).reduce((n, p) => n + p.documents.length, 0);
  const summary: StatStripItem[] = [
    {
      label: "Packages",
      value: packages?.length ?? 0,
      detail: packages?.length ? `${documentsDefined} document${documentsDefined === 1 ? "" : "s"} defined` : "None yet",
    },
    {
      label: "Clients assigned",
      value: clientsWithPackages,
      detail: clientsWithPackages ? "With a package assigned" : "No assignments yet",
    },
    {
      label: "Collected",
      value: (
        <>
          {totals.received}
          <span className="text-muted-foreground/70">/{totals.requested}</span>
        </>
      ),
      detail:
        totals.requested === 0 ? (
          "Nothing requested yet"
        ) : (
          <span className="flex items-center gap-2">
            <ProgressRule value={totals.received} total={totals.requested} />
            {Math.round((totals.received / totals.requested) * 100)}% collected
          </span>
        ),
    },
    {
      label: "Outstanding",
      value: totals.outstanding,
      detail: totals.outstanding ? "Still owed by clients" : "Nothing outstanding",
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl leading-tight font-thin tracking-tight [font-family:var(--font-denton)] md:text-5xl">
            Packages
          </h1>
          <p className="max-w-xl text-sm text-pretty text-muted-foreground">
            Named sets of documents, such as a standard T1 return. Define one once, then assign it to clients here or
            from a client&apos;s page.
          </p>
        </div>
        <div className="self-start sm:self-auto">
          <PackageFormDialog onSaved={refresh} />
        </div>
      </header>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <StatStrip
        label="Package summary"
        items={summary}
        loading={packages === null || clients === undefined}
        skeletonCount={4}
        columns="grid-cols-2 lg:grid-cols-4"
      />

      <Panel title="Library" meta={packages ? `${packages.length}` : undefined}>
        {packages === null ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : packages.length === 0 ? (
          <div className="flex flex-col items-start gap-1.5 py-2">
            <p className="text-sm font-medium">Create your first package</p>
            <p className="max-w-md text-sm text-pretty text-muted-foreground">
              List the documents you usually request for a service, then assign the set to clients in one step.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            <div
              aria-hidden
              className="hidden border-b border-border/70 pb-2.5 text-[0.6875rem] tracking-wider text-muted-foreground uppercase md:grid md:grid-cols-[minmax(0,1fr)_8rem_minmax(10rem,14rem)_5.5rem] md:gap-4"
            >
              <span>Package</span>
              <span>Clients</span>
              <span>Collected</span>
              <span />
            </div>
            <ul className="flex flex-col divide-y divide-border/50">
              {packages.map((pkg) => (
                <PackageRow
                  key={pkg.id}
                  pkg={pkg}
                  collection={byPackage.get(pkg.id) ?? { received: 0, requested: 0, outstanding: 0 }}
                  onChange={refresh}
                />
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
}

function PackageRow({
  pkg,
  collection,
  onChange,
}: {
  pkg: PackageWithAssignmentCount;
  collection: Collection;
  onChange: () => void;
}) {
  const [archiving, setArchiving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const documents = [...pkg.documents].sort((a, b) => a.position - b.position);
  const requiredCount = documents.filter((d) => d.is_required).length;
  const optionalCount = documents.length - requiredCount;

  const onArchive = async () => {
    setArchiving(true);
    setError(null);
    try {
      await archivePackage(pkg.id);
      setConfirming(false);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setArchiving(false);
    }
  };

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-3 py-4 md:grid-cols-[minmax(0,1fr)_8rem_minmax(10rem,14rem)_5.5rem] md:items-start">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-sm font-medium">{pkg.name}</span>
        <span className="text-xs text-muted-foreground">
          {requiredCount} required{optionalCount > 0 ? ` · ${optionalCount} optional` : ""}
        </span>
        <p className="line-clamp-2 text-[0.8125rem] leading-relaxed text-foreground/70">
          {documents
            .slice(0, PREVIEW_DOCUMENTS)
            .map((d) => d.doc_type_needed)
            .join(", ")}
          {documents.length > PREVIEW_DOCUMENTS && (
            <span className="text-muted-foreground"> and {documents.length - PREVIEW_DOCUMENTS} more</span>
          )}
        </p>
      </div>

      <div className="col-start-2 row-start-1 md:hidden">
        <PackageActions pkg={pkg} onChange={onChange} onDelete={() => setConfirming(true)} />
      </div>

      <span className="text-sm text-foreground/80 max-md:col-span-2">
        {pkg.assigned_client_count} client{pkg.assigned_client_count === 1 ? "" : "s"}
      </span>

      <div className="max-md:col-span-2">
        {collection.requested === 0 ? (
          <span className="text-sm text-muted-foreground">Nothing requested yet</span>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-foreground/80 tabular-nums">
              {collection.received}
              <span className="text-muted-foreground"> of {collection.requested}</span>
            </span>
            <ProgressRule value={collection.received} total={collection.requested} className="w-full max-w-40" />
            <span className="text-xs text-muted-foreground">
              {collection.outstanding > 0 ? `${collection.outstanding} outstanding` : "All received"}
            </span>
          </div>
        )}
      </div>

      <div className="hidden justify-end md:flex">
        <PackageActions pkg={pkg} onChange={onChange} onDelete={() => setConfirming(true)} />
      </div>

      <Dialog open={confirming} onOpenChange={(open) => !archiving && setConfirming(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {pkg.name}?</DialogTitle>
            <DialogDescription>
              It leaves this list and can&apos;t be assigned to more clients. Documents already requested from clients
              stay as they are.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={archiving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={onArchive} disabled={archiving}>
              {archiving ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function PackageActions({
  pkg,
  onChange,
  onDelete,
}: {
  pkg: PackageWithAssignmentCount;
  onChange: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="-mr-1 flex items-center gap-0.5">
      <PackageFormDialog pkg={pkg} onSaved={onChange} />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon-sm" aria-label={`Options for ${pkg.name}`} className="text-muted-foreground" />}
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 />
            Delete package
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
