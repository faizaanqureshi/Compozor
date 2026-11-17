"use client";

import { useEffect, useId, useState } from "react";
import {
  ApiError,
  KnowledgeAudience,
  KnowledgeEntry,
  createKnowledgeEntry,
  getKnowledgeEntry,
  updateKnowledgeEntry,
} from "@/lib/api";
import { AUDIENCE_OPTIONS } from "@/lib/knowledge";
import { cn } from "@/lib/utils";
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

export type KnowledgeDraft = {
  title: string;
  body: string;
  audience: KnowledgeAudience;
};

// One dialog for adding, editing and "Save this answer": title, the text
// itself (typed or pasted), and who it's for. Editing loads the full text,
// since the list only carries an excerpt.
export function KnowledgeEntryDialog({
  open,
  onOpenChange,
  ...form
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId?: number;
  initial?: Partial<KnowledgeDraft>;
  sourceEmailLogId?: number;
  heading?: string;
  description?: string;
  onSaved: (entry: KnowledgeEntry) => void;
}) {
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        {open && (
          <KnowledgeForm
            key={form.entryId ?? "new"}
            {...form}
            saving={saving}
            setSaving={setSaving}
            close={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Mounted fresh each time the dialog opens, so its fields start from `initial`
// (or the loaded entry) without resetting state in an effect.
function KnowledgeForm({
  entryId,
  initial,
  sourceEmailLogId,
  heading,
  description,
  onSaved,
  saving,
  setSaving,
  close,
}: {
  entryId?: number;
  initial?: Partial<KnowledgeDraft>;
  sourceEmailLogId?: number;
  heading?: string;
  description?: string;
  onSaved: (entry: KnowledgeEntry) => void;
  saving: boolean;
  setSaving: (saving: boolean) => void;
  close: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<KnowledgeDraft>({
    title: initial?.title ?? "",
    body: initial?.body ?? "",
    audience: initial?.audience ?? "clients",
  });
  const [loading, setLoading] = useState(entryId !== undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entryId === undefined) return;
    let cancelled = false;
    getKnowledgeEntry(entryId)
      .then((entry) => {
        if (!cancelled) setDraft({ title: entry.title, body: entry.body, audience: entry.audience });
      })
      .catch((e) => !cancelled && setError(e instanceof ApiError ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  const canSave = draft.title.trim() && draft.body.trim() && !saving && !loading;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const entry =
        entryId !== undefined
          ? await updateKnowledgeEntry(entryId, draft)
          : await createKnowledgeEntry({
              ...draft,
              ...(sourceEmailLogId !== undefined
                ? { source: "saved_answer" as const, source_email_log_id: sourceEmailLogId }
                : {}),
            });
      onSaved(entry);
      close();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{heading ?? (entryId !== undefined ? "Edit knowledge" : "Add knowledge")}</DialogTitle>
        <DialogDescription>
          {description ?? "Write it the way you'd explain it to a new colleague. Pasting is fine."}
        </DialogDescription>
      </DialogHeader>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) void save();
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-title`}>Title</Label>
          <Input
            id={`${id}-title`}
            value={draft.title}
            maxLength={200}
            disabled={loading}
            placeholder="e.g. Personal tax return fees"
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-body`}>Details</Label>
          <Textarea
            id={`${id}-body`}
            value={loading ? "Loading…" : draft.body}
            disabled={loading}
            rows={8}
            className="max-h-[50vh] min-h-40"
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
        </div>
        <div role="radiogroup" aria-label="Who it's for" className="grid gap-2 sm:grid-cols-2">
          {AUDIENCE_OPTIONS.map((option) => {
            const selected = draft.audience === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-1 rounded-xl p-3.5 ring-1 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  selected ? "bg-muted/50 ring-foreground/40" : "ring-foreground/10 hover:bg-muted/30"
                )}
              >
                <span className="flex items-center gap-2.5">
                  <input
                    type="radio"
                    name={`${id}-audience`}
                    value={option.value}
                    checked={selected}
                    onChange={() => setDraft({ ...draft, audience: option.value })}
                    className="size-3.5 accent-foreground"
                  />
                  <span className="text-sm font-medium">{option.title}</span>
                </span>
                <span className="pl-6 text-xs text-muted-foreground">{option.body}</span>
              </label>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
