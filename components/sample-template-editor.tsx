"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import {
  ApiError,
  approveSampleTemplate,
  getSampleTemplate,
  getSampleTemplateDocument,
  getSampleTemplateFiles,
  updateSampleTemplateSlots,
  type SampleTemplate,
  type TemplateSlot,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { fieldColor, occurrences, slotKey, type DocumentView, type FieldSlot } from "@/lib/template-document";
import { TemplateDocumentViewer } from "@/components/template-document-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

function message(e: unknown) {
  return e instanceof ApiError ? e.message : "Something went wrong. Try again.";
}

function kindText(slot: FieldSlot, view: DocumentView | null) {
  if (slot.kind === "list") return `List · ${slot.count ?? 1} example item${slot.count === 1 ? "" : "s"}`;
  if (slot.kind === "table_rows") return `Table rows · ${slot.count ?? 1} example row${slot.count === 1 ? "" : "s"}`;
  const places = view && slot.find ? occurrences(view, slot.find) : 0;
  return places > 1 ? `Text · appears ${places} times` : "Text";
}

// Full-size editor for a sample's fill-in template: the document with every
// field highlighted, and the list of fields beside it.
export function SampleTemplateEditor({ sampleId, filename, open, onOpenChange, onChanged }: {
  sampleId: number;
  filename: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: (template: SampleTemplate) => void;
}) {
  const [template, setTemplate] = useState<SampleTemplate | null>(null);
  const [view, setView] = useState<DocumentView | null>(null);
  const [slots, setSlots] = useState<FieldSlot[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "save" | "approve" | "preview" | "download">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([getSampleTemplate(sampleId), getSampleTemplateDocument(sampleId)])
      .then(([loaded, doc]) => {
        if (cancelled) return;
        setError(null);
        setTemplate(loaded);
        setSlots(loaded.slots as FieldSlot[]);
        setView(doc);
        setDirty(false);
        setActive(null);
      })
      .catch((e) => !cancelled && setError(message(e)));
    return () => {
      cancelled = true;
    };
  }, [open, sampleId]);

  const activate = (key: string) => {
    setActive(key);
    requestAnimationFrame(() => {
      document.querySelector(`[data-field="${CSS.escape(key)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const change = (next: FieldSlot[]) => {
    setSlots(next);
    setDirty(true);
  };

  const apply = (next: SampleTemplate) => {
    setTemplate(next);
    setSlots(next.slots as FieldSlot[]);
    setDirty(false);
    onChanged(next);
  };

  const save = async () => {
    setBusy("save");
    setError(null);
    try {
      apply(await updateSampleTemplateSlots(sampleId, slots as TemplateSlot[]));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    setBusy("approve");
    setError(null);
    try {
      apply(await approveSampleTemplate(sampleId));
      onOpenChange(false);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const openFile = async (which: "preview" | "download") => {
    setBusy(which);
    setError(null);
    setNotice(null);
    const tab = window.open("", "_blank");
    try {
      const files = await getSampleTemplateFiles(sampleId);
      const url = which === "preview" ? files.preview_url : files.template_url;
      if (!url) {
        tab?.close();
        setNotice("The exact-layout preview isn't available right now. Download the template to check it in Word or PowerPoint.");
      } else if (tab) {
        tab.opener = null;
        tab.location.href = url;
      }
    } catch (e) {
      tab?.close();
      setError(message(e));
    } finally {
      setBusy(null);
    }
  };

  const requestClose = (next: boolean) => {
    if (!next && dirty) {
      setConfirmClose(true);
      return;
    }
    onOpenChange(next);
  };

  const approved = template?.status === "approved";

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogContent className="flex h-[92dvh] w-[calc(100vw_-_1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,84rem)] [&>[data-slot=dialog-close]]:right-4 [&>[data-slot=dialog-close]]:top-4">
        <header className="flex shrink-0 flex-col gap-1 border-b border-border/70 px-5 py-4 pr-14 sm:px-6">
          <DialogTitle className="text-lg">Template for {filename}</DialogTitle>
          <DialogDescription className="text-xs">
            Highlighted parts change for each client. Everything else stays exactly as it is.
          </DialogDescription>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="min-h-0 flex-1 overflow-y-auto bg-muted/50">
            {view ? (
              <TemplateDocumentViewer
                view={view}
                slots={slots}
                active={active}
                onActivate={activate}
                onCreate={(slot) => {
                  const next = [...slots, slot];
                  change(next);
                  setActive(slotKey(slot, next.length - 1));
                }}
              />
            ) : error ? (
              <p className="p-6 text-sm text-destructive">{error}</p>
            ) : (
              <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading the document…</p>
            )}
          </div>

          <aside className="flex max-h-[45dvh] shrink-0 flex-col border-t border-border/70 lg:max-h-none lg:w-[22rem] lg:border-t-0 lg:border-l">
            <div className="flex flex-col gap-1 px-5 pt-4 pb-3">
              <p className="text-[0.6875rem] tracking-widest text-muted-foreground uppercase">
                Fields · {slots.length}
              </p>
              <p className="text-xs text-muted-foreground">
                {approved ? "Approved. New runs fill this template." : "Draft. Review the fields, then approve to use it."}
                {template?.source === "converted" && template.similarity !== null && (
                  <> Rebuilt as an editable file, {Math.round(template.similarity * 100)}% match with the original.</>
                )}
              </p>
              {!approved && template?.warnings.map((warning) => (
                <p key={warning} className="text-xs leading-relaxed text-warning-foreground">{warning}</p>
              ))}
              <ul className="mt-2 flex flex-col gap-1.5 rounded-lg bg-muted/50 px-3 py-2.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
                <li><span className="text-foreground/80">Select text</span> on the page to make it a field.</li>
                <li><span className="text-foreground/80">Use the handle</span> beside a table row or paragraph to repeat it per record.</li>
                <li><span className="text-foreground/80">Click a highlight</span> to rename it or say what goes there.</li>
              </ul>
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto border-y border-border/60">
              {slots.length === 0 && (
                <li className="px-5 py-4 text-xs text-muted-foreground">No fields yet. Select text on the page that changes for each client.</li>
              )}
              {slots.map((slot, index) => {
                const key = slotKey(slot, index);
                const isActive = key === active;
                return (
                  <li key={key} className={cn("border-b border-border/50 last:border-0", isActive && "bg-muted/60")}>
                    <div className="flex items-start gap-2.5 px-5 py-3">
                      <button type="button" aria-label={`Show ${slot.label} on the page`} onClick={() => activate(key)} className="mt-2.5 shrink-0">
                        <span className={cn("block size-2 rounded-full", fieldColor(slots, key).dot)} />
                      </button>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <Input
                          aria-label="Field name"
                          value={slot.label}
                          onFocus={() => setActive(key)}
                          onChange={(e) => change(slots.map((s, i) => (i === index ? { ...s, label: e.target.value } : s)))}
                          className="h-8 text-xs"
                        />
                        <button type="button" onClick={() => activate(key)} className="text-left text-[0.6875rem] text-muted-foreground hover:text-foreground">
                          {kindText(slot, view)}
                          {slot.kind === "text" && slot.find && <> · “{slot.find.length > 40 ? `${slot.find.slice(0, 40)}…` : slot.find}”</>}
                        </button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Keep ${slot.label} as fixed text`}
                        title="Keep as fixed text"
                        onClick={() => {
                          change(slots.filter((_, i) => i !== index));
                          setActive(null);
                        }}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                    {isActive && (
                      <div className="px-5 pb-3 pl-10">
                        <Textarea
                          aria-label="What goes here"
                          rows={2}
                          placeholder="What goes here, e.g. the client's full legal name"
                          value={(slot.description as string | undefined) ?? ""}
                          onChange={(e) => change(slots.map((s, i) => (i === index ? { ...s, description: e.target.value } : s)))}
                          className="resize-none text-xs"
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="flex flex-col gap-2 px-5 py-4">
              {error && view && <p role="alert" className="text-xs text-destructive">{error}</p>}
              {confirmClose ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs">You have unsaved changes.</p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setConfirmClose(false)}>Keep editing</Button>
                    <Button type="button" size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => { setConfirmClose(false); setDirty(false); onOpenChange(false); }}>
                      Discard changes
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {dirty && approved && (
                    <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">Saving returns this template to draft. Approve it again to use your changes.</p>
                  )}
                  {dirty ? (
                    <Button type="button" disabled={!!busy} onClick={save}>
                      {busy === "save" && <Loader2 className="animate-spin" />}
                      Save changes
                    </Button>
                  ) : !approved ? (
                    <Button type="button" disabled={!!busy || slots.length === 0 || !template} onClick={approve}>
                      {busy === "approve" && <Loader2 className="animate-spin" />}
                      Approve template
                    </Button>
                  ) : null}
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" className="flex-1" disabled={dirty || !!busy} onClick={() => openFile("preview")}>
                      {busy === "preview" && <Loader2 className="animate-spin" />}
                      {busy === "preview" ? "Rendering…" : "Exact layout"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="flex-1" disabled={dirty || !!busy} onClick={() => openFile("download")}>
                      {busy === "download" && <Loader2 className="animate-spin" />}
                      Download
                    </Button>
                  </div>
                  {notice && <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">{notice}</p>}
                </>
              )}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}
