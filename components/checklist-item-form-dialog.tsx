"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  ApiError,
  ChecklistItem,
  createChecklistItem,
  editChecklistItem,
  getMyOrganization,
} from "@/lib/api";
import { organizationKey } from "@/lib/swr-keys";
import { exampleDocTypesFor } from "@/lib/practice-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Shared between "Add requirement" (ChecklistCard) and "Edit requirement"
// (ChecklistItemActions' three-dot menu) - one dialog, mode driven by
// whether `item` is present, same shape as PackageFormDialog's isEdit
// pattern. Externally controlled (open/onOpenChange) rather than owning
// its own trigger, since the two entry points live in different
// components and need different triggers (an inline "+" link vs. a
// dropdown item).
export function ChecklistItemFormDialog({
  clientId,
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  clientId: number;
  item?: ChecklistItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = item !== undefined;
  const { data: org } = useSWR(organizationKey(), getMyOrganization);
  const docTypePlaceholder = exampleDocTypesFor(org?.practice_type);
  const [docTypeNeeded, setDocTypeNeeded] = useState(item?.doc_type_needed ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  // Deadline is stored as expected_date_range_end - a due date only;
  // document validation ignores it.
  const [deadline, setDeadline] = useState(item?.expected_date_range_end ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedMaterial, setConfirmedMaterial] = useState(false);
  const [showReceivedWarning, setShowReceivedWarning] = useState(false);
  const [showNotifyChoice, setShowNotifyChoice] = useState(false);

  const resetForm = () => {
    setDocTypeNeeded(item?.doc_type_needed ?? "");
    setDescription(item?.description ?? "");
    setDeadline(item?.expected_date_range_end ?? "");
    setError(null);
    setConfirmedMaterial(false);
    setShowReceivedWarning(false);
    setShowNotifyChoice(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (submitting) return;
    if (next) resetForm();
    onOpenChange(next);
  };

  // Only the requirement name defines what document satisfies it - the
  // description is context and the deadline is a due date, so neither can
  // un-receive an item (mirrors backend edit_checklist_item).
  const isMaterial = isEdit && docTypeNeeded.trim() !== item!.doc_type_needed;

  const performSave = async (notifyClient: boolean, confirmMaterialNow = confirmedMaterial) => {
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit) {
        await editChecklistItem(clientId, item!.id, {
          doc_type_needed: docTypeNeeded.trim(),
          description: description.trim(),
          expected_date_range_end: deadline || null,
          confirm_material: confirmMaterialNow,
          notify_client: notifyClient,
        });
      } else {
        await createChecklistItem(clientId, {
          doc_type_needed: docTypeNeeded.trim(),
          description: description.trim() || undefined,
          expected_date_range_end: deadline || undefined,
        });
      }
      setShowReceivedWarning(false);
      setShowNotifyChoice(false);
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // Sequential gate: a material edit to a Received item is confirmed first
  // (confirmedMaterialNow lets the "Continue editing" handler re-run this
  // immediately without waiting on the state update to land), then an
  // already-communicated item offers the notify choice, otherwise it just
  // saves. Re-run from the top after each acknowledgment rather than
  // chaining ad hoc, so reopening the form always re-evaluates cleanly.
  const proceed = (confirmedMaterialNow = confirmedMaterial) => {
    if (isMaterial && item!.status === "received" && !confirmedMaterialNow) {
      setShowReceivedWarning(true);
      return;
    }
    if (isEdit && item!.possibly_communicated) {
      setShowNotifyChoice(true);
      return;
    }
    performSave(false, confirmedMaterialNow);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    proceed();
  };

  const onContinueEditingReceived = () => {
    setConfirmedMaterial(true);
    setShowReceivedWarning(false);
    proceed(true);
  };

  return (
    <>
      <Dialog open={open && !showReceivedWarning && !showNotifyChoice} onOpenChange={handleOpenChange}>
        <DialogContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{isEdit ? "Edit requirement" : "Add requirement"}</DialogTitle>
              <DialogDescription>
                {isEdit
                  ? "Changes apply going forward - emails already sent to the client are never rewritten."
                  : "A document Compozor should ask this client for."}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="checklist-item-doc-type">Requirement / document type</Label>
                <Input
                  id="checklist-item-doc-type"
                  required
                  autoFocus
                  placeholder={docTypePlaceholder}
                  value={docTypeNeeded}
                  onChange={(e) => setDocTypeNeeded(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="checklist-item-description">Description</Label>
                <Textarea
                  id="checklist-item-description"
                  placeholder="Helps the client understand what's needed, and helps the AI match the right document - e.g. which account, which period, which entity."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="checklist-item-deadline">Deadline (optional)</Label>
                <Input
                  id="checklist-item-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : isEdit ? "Save changes" : "Add requirement"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showReceivedWarning} onOpenChange={(o) => !o && setShowReceivedWarning(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This requirement is already marked as received</DialogTitle>
            <DialogDescription>
              Changing what&apos;s being requested means the existing document may no longer satisfy
              this requirement. The requirement will be returned to Missing and Compozor will request
              the updated document.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReceivedWarning(false)}>
              Cancel
            </Button>
            <Button onClick={onContinueEditingReceived}>Continue editing</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showNotifyChoice} onOpenChange={(o) => !o && setShowNotifyChoice(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This requirement was already sent to the client</DialogTitle>
            <DialogDescription>
              Saving these changes will update what Compozor asks for going forward. Previous emails
              will remain unchanged.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNotifyChoice(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => performSave(false)} disabled={submitting}>
              {submitting ? "Saving…" : "Save only"}
            </Button>
            <Button onClick={() => performSave(true)} disabled={submitting}>
              {submitting ? "Saving…" : "Save & notify client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
