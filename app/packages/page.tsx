"use client";

import { useState } from "react";
import useSWR from "swr";
import { packagesKey } from "@/lib/swr-keys";
import { Package as PackageIcon } from "lucide-react";
import {
  ApiError,
  PackageWithAssignmentCount,
  archivePackage,
  listPackages,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PackageFormDialog } from "@/components/package-form-dialog";

export default function PackagesPage() {
  const { data, error: loadError, mutate } = useSWR(packagesKey(), listPackages);
  const packages: PackageWithAssignmentCount[] | null = data ?? null;
  const error = loadError ? (loadError instanceof ApiError ? loadError.message : String(loadError)) : null;
  const refresh = () => void mutate();

  return (
    <div className="flex w-full flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-4xl font-thin tracking-tight [font-family:var(--font-denton)] sm:text-5xl md:text-6xl">
            Packages
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Reusable, named sets of documents - define one once (e.g. a
            standard T1 return) and assign it to any number of clients in a
            single action, from here or from a client&apos;s own page.
          </p>
        </div>
        <PackageFormDialog onSaved={refresh} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {packages === null ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
      ) : packages.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-card p-12 text-center ring-1 ring-foreground/10">
          <PackageIcon className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No packages yet. Create one, then assign it to clients from here
            or from a client&apos;s page.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 animate-fade-in md:grid-cols-2 xl:grid-cols-3">
          {packages.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} onChange={refresh} />
          ))}
        </div>
      )}
    </div>
  );
}

function PackageCard({
  pkg,
  onChange,
}: {
  pkg: PackageWithAssignmentCount;
  onChange: () => void;
}) {
  const [archiving, setArchiving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiredCount = pkg.documents.filter((d) => d.is_required).length;
  const optionalCount = pkg.documents.length - requiredCount;

  const onArchive = async () => {
    setArchiving(true);
    setError(null);
    try {
      await archivePackage(pkg.id);
      onChange();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setArchiving(false);
    }
  };

  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">{pkg.name}</h2>
        <Badge variant="secondary">
          {pkg.assigned_client_count} client{pkg.assigned_client_count === 1 ? "" : "s"}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        {requiredCount} required{optionalCount > 0 ? ` · ${optionalCount} optional` : ""}
      </p>
      <ul className="flex flex-col gap-1 text-sm text-foreground/70">
        {pkg.documents.slice(0, 4).map((doc) => (
          <li key={doc.id} className="truncate">
            {doc.doc_type_needed}
            {!doc.is_required && <span className="text-muted-foreground"> (optional)</span>}
          </li>
        ))}
        {pkg.documents.length > 4 && (
          <li className="text-muted-foreground">+{pkg.documents.length - 4} more</li>
        )}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="mt-auto flex items-center gap-1.5 pt-2">
        <PackageFormDialog pkg={pkg} onSaved={onChange} />
        <Dialog open={confirming} onOpenChange={(open) => !archiving && setConfirming(open)}>
          <DialogTrigger render={<Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" />}>
            Delete
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {pkg.name}?</DialogTitle>
              <DialogDescription>
                It disappears from this list and can&apos;t be assigned to
                any more clients, but documents already added to clients from
                it stay exactly as they are.
              </DialogDescription>
            </DialogHeader>
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
      </div>
    </section>
  );
}
