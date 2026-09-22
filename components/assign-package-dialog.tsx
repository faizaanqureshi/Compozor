"use client";

import { cloneElement, isValidElement, useState, type ReactElement } from "react";
import { Package as PackageIcon } from "lucide-react";
import { ApiError, Package, listPackages } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PackageDocumentPicker } from "@/components/package-document-picker";

// Two steps in one dialog: pick a package, then confirm which of its
// documents to actually add (required ones default on, optional ones
// default off, both individually toggleable) before assigning to
// `clientIds` - used for a batch assign from the Clients page's
// multi-select toolbar (always a fresh assign, never editing an existing
// selection - see the client detail page's own Assign-package popup for
// that case, which uses PackageDocumentPicker directly).
export function AssignPackageDialog({
  clientIds,
  trigger,
  onAssigned,
}: {
  clientIds: number[];
  trigger: ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const openDialog = async () => {
    setOpen(true);
    setError(null);
    setSelectedPackage(null);
    try {
      setPackages(await listPackages());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  return (
    <>
      {isValidElement(trigger) ? cloneElement(trigger, { onClick: openDialog }) : trigger}
      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedPackage ? selectedPackage.name : "Assign package"}
            </DialogTitle>
            <DialogDescription>
              {selectedPackage
                ? `Choose which documents to add for ${clientIds.length} selected client${clientIds.length === 1 ? "" : "s"}.`
                : `Choose a package to assign to ${clientIds.length} selected client${clientIds.length === 1 ? "" : "s"}.`}
            </DialogDescription>
          </DialogHeader>

          {selectedPackage ? (
            <PackageDocumentPicker
              pkg={selectedPackage}
              clientIds={clientIds}
              onAssigned={() => {
                setOpen(false);
                onAssigned();
              }}
              onBack={() => setSelectedPackage(null)}
              onSavingChange={setSaving}
            />
          ) : packages === null ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : packages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No packages yet - create one first from the Packages page.
            </p>
          ) : (
            <div className="flex max-h-[55vh] flex-col gap-1 overflow-y-auto">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setSelectedPackage(pkg)}
                  className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted"
                >
                  <PackageIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col">
                    <span>{pkg.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {pkg.documents.length} document{pkg.documents.length === 1 ? "" : "s"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </DialogContent>
      </Dialog>
    </>
  );
}
