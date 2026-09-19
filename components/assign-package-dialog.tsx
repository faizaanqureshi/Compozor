"use client";

import { cloneElement, isValidElement, useState, type ReactElement } from "react";
import { Package as PackageIcon } from "lucide-react";
import { ApiError, Package, assignPackageToClients, listPackages } from "@/lib/api";
import { cn } from "@/lib/utils";
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

// Two steps in one dialog: pick a package, then confirm which of its
// documents to actually add (required ones default on, optional ones
// default off, both individually toggleable) before assigning to
// `clientIds` - used both for a single client (clientIds.length === 1,
// from the client detail page's package cards) and a batch (from the
// Clients page's multi-select toolbar).
export function AssignPackageDialog({
  clientIds,
  trigger,
  initialPackage,
  onAssigned,
}: {
  clientIds: number[];
  trigger: ReactElement<{ onClick?: (e: React.MouseEvent) => void }>;
  /** Skip the picker step and go straight to the document-selection step
   * for this package - used when a package card itself is the trigger. */
  initialPackage?: Package;
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<Package | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickPackage = (pkg: Package) => {
    setSelectedPackage(pkg);
    setSelectedDocIds(new Set(pkg.documents.filter((d) => d.is_required).map((d) => d.id)));
  };

  const openDialog = async () => {
    setOpen(true);
    setError(null);
    if (initialPackage) {
      pickPackage(initialPackage);
      return;
    }
    setSelectedPackage(null);
    try {
      setPackages(await listPackages());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    }
  };

  const toggleDoc = (docId: number) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const onAssign = async () => {
    if (!selectedPackage || selectedDocIds.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      await assignPackageToClients(selectedPackage.id, clientIds, Array.from(selectedDocIds));
      setOpen(false);
      onAssigned();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const requiredDocs = selectedPackage?.documents.filter((d) => d.is_required) ?? [];
  const optionalDocs = selectedPackage?.documents.filter((d) => !d.is_required) ?? [];

  return (
    <>
      {isValidElement(trigger) ? cloneElement(trigger, { onClick: openDialog }) : trigger}
      <Dialog open={open} onOpenChange={(o) => !saving && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
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

          {!selectedPackage ? (
            packages === null ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : packages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No packages yet - create one first from the Packages page.
              </p>
            ) : (
              <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => pickPackage(pkg)}
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
            )
          ) : (
            <div className="flex max-h-80 flex-col gap-3 overflow-y-auto">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Required
                </span>
                {requiredDocs.map((doc) => (
                  <label
                    key={doc.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted",
                      selectedDocIds.has(doc.id) && "bg-muted/60"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-primary"
                      checked={selectedDocIds.has(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                    />
                    <span className="flex flex-col">
                      <span>{doc.doc_type_needed}</span>
                      {doc.description && (
                        <span className="text-xs text-muted-foreground">{doc.description}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>

              {optionalDocs.length > 0 && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Optional
                  </span>
                  {optionalDocs.map((doc) => (
                    <label
                      key={doc.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted",
                        selectedDocIds.has(doc.id) && "bg-muted/60"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 size-4 accent-primary"
                        checked={selectedDocIds.has(doc.id)}
                        onChange={() => toggleDoc(doc.id)}
                      />
                      <span className="flex flex-col">
                        <span>{doc.doc_type_needed}</span>
                        {doc.description && (
                          <span className="text-xs text-muted-foreground">{doc.description}</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            {selectedPackage && !initialPackage && (
              <Button variant="outline" onClick={() => setSelectedPackage(null)} disabled={saving}>
                Back
              </Button>
            )}
            {selectedPackage && (
              <Button onClick={onAssign} disabled={saving || selectedDocIds.size === 0}>
                {saving ? "Assigning…" : `Assign ${selectedDocIds.size} document${selectedDocIds.size === 1 ? "" : "s"}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
