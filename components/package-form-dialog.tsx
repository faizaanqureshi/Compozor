"use client";

import { useState } from "react";
import useSWR from "swr";
import { Plus, X } from "lucide-react";
import {
  ApiError,
  Package,
  PackageDocumentInput,
  createPackage,
  getMyOrganization,
  updatePackage,
} from "@/lib/api";
import { organizationKey } from "@/lib/swr-keys";
import { exampleDocTypeFor } from "@/lib/practice-types";
import { Button, buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type DocRow = PackageDocumentInput;

const emptyRow = (): DocRow => ({ doc_type_needed: "", description: "", is_required: true });

// Shared between the Packages library page (create/edit) and any other
// entry point that wants a "define a new package" affordance - one dialog,
// same shape as WorkflowFormDialog.
export function PackageFormDialog({
  pkg,
  onSaved,
  variant = "default",
}: {
  pkg?: Package;
  onSaved: (pkg: Package) => void;
  variant?: VariantProps<typeof buttonVariants>["variant"];
}) {
  const isEdit = pkg !== undefined;
  const { data: org } = useSWR(organizationKey(), getMyOrganization);
  const docTypePlaceholder = `Doc type (e.g. ${exampleDocTypeFor(org?.practice_type)})`;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(pkg?.name ?? "");
  const [rows, setRows] = useState<DocRow[]>(
    pkg
      ? pkg.documents.map((d) => ({
          doc_type_needed: d.doc_type_needed,
          description: d.description ?? "",
          is_required: d.is_required,
        }))
      : [emptyRow()]
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openDialog = () => {
    setName(pkg?.name ?? "");
    setRows(
      pkg
        ? pkg.documents.map((d) => ({
            doc_type_needed: d.doc_type_needed,
            description: d.description ?? "",
            is_required: d.is_required,
          }))
        : [emptyRow()]
    );
    setError(null);
    setOpen(true);
  };

  const updateRow = (i: number, patch: Partial<DocRow>) => {
    setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };

  const removeRow = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const documents = rows
      .filter((r) => r.doc_type_needed.trim())
      .map((r) => ({
        doc_type_needed: r.doc_type_needed.trim(),
        description: r.description?.trim() || null,
        is_required: r.is_required,
      }));
    if (documents.length === 0) return;

    setSubmitting(true);
    setError(null);
    try {
      const saved = isEdit
        ? await updatePackage(pkg.id, { name, documents })
        : await createPackage({ name, documents });
      setOpen(false);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && (o ? openDialog() : setOpen(false))}>
      <DialogTrigger
        render={isEdit ? <Button variant="ghost" size="sm" /> : <Button variant={variant} />}
      >
        {isEdit ? (
          "Edit"
        ) : (
          <>
            <Plus />
            Create New Package
          </>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{isEdit ? `Edit ${pkg.name}` : "Create New Package"}</DialogTitle>
            <DialogDescription>
              A reusable set of documents you can assign to any client in one
              action - mark each as required (checked by default when
              assigning) or optional (left for the CPA to opt in).
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="package-name">Name</Label>
              <Input
                id="package-name"
                required
                placeholder="Standard T1 Personal Tax Return"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Documents</Label>
              <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
                {rows.map((row, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-border/60 bg-background p-2.5"
                  >
                    <div className="flex flex-1 flex-col gap-1.5">
                      <Input
                        value={row.doc_type_needed}
                        onChange={(e) => updateRow(i, { doc_type_needed: e.target.value })}
                        placeholder={docTypePlaceholder}
                        aria-label={`Doc type, row ${i + 1}`}
                      />
                      <Input
                        value={row.description ?? ""}
                        onChange={(e) => updateRow(i, { description: e.target.value })}
                        aria-label={`Description, row ${i + 1}`}
                        placeholder="Description (optional)"
                      />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={row.is_required}
                          onChange={(e) => updateRow(i, { is_required: e.target.checked })}
                          className="size-3.5 accent-foreground"
                        />
                        Required (unchecked = optional)
                      </label>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => removeRow(i)}
                      disabled={rows.length === 1}
                    >
                      <X />
                      <span className="sr-only">Remove row {i + 1}</span>
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => setRows((prev) => [...prev, emptyRow()])}
              >
                <Plus />
                Add document
              </Button>
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Create package"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
