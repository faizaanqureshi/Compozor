"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// "Delete permanently" confirmation for the Archive popups (clients and
// email log) - unlike archiving itself, this actually removes the row, so
// it always needs an explicit confirm. Shared since both popups need the
// exact same shape for both their single-item and "delete all" actions.
export function PurgeConfirmDialog({
  open,
  onOpenChange,
  count,
  itemLabel,
  purging,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  itemLabel: string;
  purging: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !purging && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="pr-8">
            Delete {count > 1 ? `${count} ${itemLabel}s` : `this ${itemLabel}`} permanently?
          </DialogTitle>
          <DialogDescription>This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={purging}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={purging}>
            {purging ? "Deleting…" : "Delete permanently"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
