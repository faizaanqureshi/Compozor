"use client";

import { useState } from "react";
import {
  ApiError,
  Package,
  assignPackageToClients,
  updatePackageAssignmentDocuments,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

// The "which of this package's documents do you actually want" step -
// shared by AssignPackageDialog (bulk multi-client assign) and the client
// page's Assign-package popup (single client, list -> this step, all in
// one dialog rather than nesting a second one on top of the first).
export function PackageDocumentPicker({
  pkg,
  clientIds,
  currentDocumentIds,
  onAssigned,
  onBack,
  onSavingChange,
}: {
  pkg: Package;
  clientIds: number[];
  /** This client's already-checked document ids for this package, when
   * it's already assigned - switches to "Save changes" (reconcile the new
   * selection against what's there) instead of "Assign" (always adds
   * fresh). Only meaningful for a single client (clientIds.length === 1). */
  currentDocumentIds?: number[];
  onAssigned: () => void;
  onBack: () => void;
  /** So a parent dialog can refuse to close mid-save - this component owns
   * `saving` itself since it also owns the submit call. */
  onSavingChange?: (saving: boolean) => void;
}) {
  const isEditing = currentDocumentIds !== undefined;
  const [selectedDocIds, setSelectedDocIds] = useState<Set<number>>(
    () => new Set(currentDocumentIds ?? pkg.documents.filter((d) => d.is_required).map((d) => d.id))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDoc = (docId: number) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const onSubmit = async () => {
    if (selectedDocIds.size === 0) return;
    setSaving(true);
    onSavingChange?.(true);
    setError(null);
    try {
      if (isEditing) {
        await updatePackageAssignmentDocuments(pkg.id, clientIds[0], Array.from(selectedDocIds));
      } else {
        await assignPackageToClients(pkg.id, clientIds, Array.from(selectedDocIds));
      }
      onAssigned();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
      onSavingChange?.(false);
    }
  };

  const requiredDocs = pkg.documents.filter((d) => d.is_required);
  const optionalDocs = pkg.documents.filter((d) => !d.is_required);

  return (
    <>
      <div className="flex max-h-[55vh] flex-col gap-4 overflow-y-auto">
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

      {error && <p className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button variant="outline" onClick={onBack} disabled={saving}>
          Back
        </Button>
        <Button onClick={onSubmit} disabled={saving || selectedDocIds.size === 0}>
          {isEditing
            ? saving
              ? "Saving…"
              : "Save changes"
            : saving
              ? "Assigning…"
              : `Assign ${selectedDocIds.size} document${selectedDocIds.size === 1 ? "" : "s"}`}
        </Button>
      </DialogFooter>
    </>
  );
}
