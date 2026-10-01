"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Download, FileImage, FileSpreadsheet, FileText, Loader2, MoreHorizontal, Plus, Presentation, Trash2, UploadCloud, X } from "lucide-react";

import {
  ApiError,
  deleteSampleTemplate,
  getSampleTemplate,
  getWorkflowWorkSampleDownload,
  startSampleTemplate,
  uploadWorkflowWorkSample,
  type SampleTemplate,
  type SampleTemplateStatus,
  type WorkflowWorkSample,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { sampleFormat, type SampleFormat } from "@/lib/workflow-editor";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SampleTemplateEditor } from "@/components/sample-template-editor";

const ACCEPT = ".docx,.xlsx,.pptx,.pdf,.png,.jpg,.jpeg,.webp,.csv,.txt";
const MAX_SAMPLES = 8;
const MAX_BYTES = 20 * 1024 * 1024;
const POLL_MS = 3000;

const FORMAT_ICONS: Record<SampleFormat["kind"], typeof FileText> = {
  word: FileText,
  slides: Presentation,
  sheet: FileSpreadsheet,
  rebuilt: FileImage,
  data: FileText,
};

function canTemplate(format: SampleFormat) {
  return format.kind === "word" || format.kind === "slides" || format.kind === "rebuilt";
}

function sizeLabel(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function message(e: unknown) {
  return e instanceof ApiError ? e.message : "Something went wrong. Try again.";
}

function fields(count: number) {
  return `${count} field${count === 1 ? "" : "s"}`;
}

// One work sample: what the agent does with it, and its fill-in template
// from setup to approval, in a single status line with one next step.
function SampleCard({ sample, disabled, onRemove, onStatusChange }: {
  sample: WorkflowWorkSample;
  disabled: boolean;
  onRemove: () => void;
  onStatusChange: (status: SampleTemplateStatus | null) => void;
}) {
  const format = sampleFormat(sample.filename);
  const Icon = FORMAT_ICONS[format.kind];
  const templatable = canTemplate(format);
  const [template, setTemplate] = useState<SampleTemplate | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedHere = useRef(false);
  const status = template?.status ?? sample.template_status ?? null;

  const apply = useCallback((next: SampleTemplate | null) => {
    setTemplate(next);
    onStatusChange(next?.status ?? null);
  }, [onStatusChange]);

  useEffect(() => {
    if (!sample.template_status) return;
    getSampleTemplate(sample.id).then(setTemplate).catch(() => undefined);
  }, [sample.id, sample.template_status]);

  useEffect(() => {
    if (status !== "processing") return;
    const timer = setInterval(() => {
      getSampleTemplate(sample.id).then((next) => {
        if (next.status === "processing") return;
        apply(next);
        // Open the fields for review when setup the user started here finishes.
        if (next.status === "draft" && startedHere.current) setEditing(true);
      }).catch(() => undefined);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, sample.id, apply]);

  const run = async (action: () => Promise<SampleTemplate | null>) => {
    setBusy(true);
    setError(null);
    try {
      apply(await action());
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const setUp = () => {
    startedHere.current = true;
    void run(() => startSampleTemplate(sample.id));
  };

  const download = async () => {
    const tab = window.open("", "_blank");
    try {
      const { download_url } = await getWorkflowWorkSampleDownload(sample.id);
      if (tab) {
        tab.opener = null;
        tab.location.href = download_url;
      }
    } catch (e) {
      tab?.close();
      setError(message(e));
    }
  };

  const slotCount = template?.slots.length ?? 0;
  let line: React.ReactNode = format.how;
  let action: React.ReactNode = null;
  if (templatable && status === "processing") {
    line = (
      <span className="inline-flex items-center gap-2">
        <Loader2 className="size-3.5 shrink-0 animate-spin" />
        {format.kind === "rebuilt" ? "Rebuilding as an editable file and finding fields. This can take a few minutes." : "Finding the parts that change for each client…"}
      </span>
    );
  } else if (templatable && status === "draft") {
    line = <span className="inline-flex items-center gap-2"><span className="size-1.5 shrink-0 rounded-full bg-warning" aria-hidden />Template ready to review{template ? ` · ${fields(slotCount)}` : ""}</span>;
    action = <Button type="button" size="sm" disabled={disabled} onClick={() => setEditing(true)}>Review fields</Button>;
  } else if (templatable && status === "approved") {
    line = <span className="inline-flex items-center gap-2"><span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />Template approved{template ? ` · ${fields(slotCount)}` : ""} · formatting is locked</span>;
    action = <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => setEditing(true)}>Edit fields</Button>;
  } else if (templatable && status === "failed") {
    line = <span className="text-destructive">{template?.error ?? "Template setup failed."}</span>;
    action = <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={setUp}>Try again</Button>;
  } else if (templatable) {
    if (format.kind === "rebuilt") {
      line = (
        <span className="text-warning-foreground">
          Recreated from its layout, so formatting may drift. Make a template, or add the original Word, Excel or PowerPoint file.
        </span>
      );
    }
    action = (
      <Button type="button" size="sm" variant="outline" disabled={disabled || busy} onClick={setUp}>
        {busy && <Loader2 className="animate-spin" />}
        Make template
      </Button>
    );
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="break-all">{sample.filename}</span>
            <span className="text-xs text-muted-foreground">{format.label} · {sizeLabel(sample.size_bytes)}</span>
          </p>
          <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{line}</p>
          {status === "draft" && template?.warnings.map((warning) => (
            <p key={warning} className="text-xs leading-relaxed text-warning-foreground">{warning}</p>
          ))}
          {sample.missing_fonts && sample.missing_fonts.length > 0 && (
            <p className="text-xs leading-relaxed text-warning-foreground">
              Previews don&apos;t have {sample.missing_fonts.join(", ")}. <Link href="/settings#fonts" className="underline underline-offset-2">Upload fonts</Link>
            </p>
          )}
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1.5 pl-12 sm:pl-0">
        {action}
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`Options for ${sample.filename}`} disabled={disabled} />}>
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void download()}>
              <Download />
              Download sample
            </DropdownMenuItem>
            {status && status !== "processing" && (
              <DropdownMenuItem onClick={() => void run(async () => { await deleteSampleTemplate(sample.id); return null; })}>
                <X />
                Stop using template
              </DropdownMenuItem>
            )}
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              <Trash2 />
              Remove from workflow
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {(status === "draft" || status === "approved") && (
        <SampleTemplateEditor sampleId={sample.id} filename={sample.filename} open={editing} onOpenChange={setEditing} onChanged={apply} />
      )}
    </li>
  );
}

// Examples of finished work. Each card says how the agent uses that file,
// and Word, PowerPoint, PDF and image samples can become fill-in templates
// so formatting can't drift.
export function WorkflowWorkSamples({ value, onChange, disabled, onBusyChange }: {
  value: WorkflowWorkSample[];
  onChange: (samples: WorkflowWorkSample[]) => void;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [uploading, setUploading] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const full = value.length >= MAX_SAMPLES;
  const locked = disabled || !!uploading;
  const compact = value.length > 0;

  async function upload(files: FileList | File[] | null) {
    const selected = Array.from(files ?? []);
    if (!selected.length || locked) return;
    setError(null);
    if (selected.length + value.length > MAX_SAMPLES) {
      setError(`Choose up to ${MAX_SAMPLES} work samples.`);
      return;
    }
    if (selected.some((file) => file.size === 0 || file.size > MAX_BYTES)) {
      setError("Each work sample must be nonempty and under 20 MB.");
      return;
    }
    onBusyChange(true);
    const saved = [...value];
    try {
      for (const file of selected) {
        setUploading(file.name);
        saved.push(await uploadWorkflowWorkSample(file));
        onChange([...saved]);
      }
    } catch (e) {
      setError(`${e instanceof ApiError ? e.message : "Upload failed."} Samples already uploaded are kept; add the rest again.`);
    } finally {
      setUploading(null);
      onBusyChange(false);
      if (input.current) input.current.value = "";
    }
  }

  const dropHandlers = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      if (!locked) setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      void upload(event.dataTransfer.files);
    },
  };

  return (
    <div className="flex flex-col gap-3">
      {value.length > 0 && (
        <ul className="flex flex-col gap-3">
          {value.map((sample) => (
            <SampleCard
              key={sample.id}
              sample={sample}
              disabled={locked}
              onRemove={() => onChange(value.filter((item) => item.id !== sample.id))}
              onStatusChange={(status) => onChange(value.map((item) => (item.id === sample.id ? { ...item, template_status: status } : item)))}
            />
          ))}
        </ul>
      )}

      {!full && (
        <div
          {...dropHandlers}
          className={cn(
            "flex items-center gap-3 rounded-xl border border-dashed border-border transition-colors",
            compact ? "flex-row justify-between px-4 py-3" : "flex-col px-5 py-8 text-center",
            dragging ? "border-foreground/40 bg-muted/60" : "bg-muted/20",
            locked && "opacity-60"
          )}
        >
          {uploading ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              <span className="break-all">Uploading {uploading}…</span>
            </p>
          ) : compact ? (
            <>
              <p id={hintId} className="text-xs text-muted-foreground">Drop more samples here · {MAX_SAMPLES - value.length} more allowed</p>
              <Button type="button" variant="ghost" size="sm" disabled={locked} onClick={() => input.current?.click()}>
                <Plus />
                Add sample
              </Button>
            </>
          ) : (
            <>
              <UploadCloud className="size-5 text-muted-foreground" aria-hidden />
              <div className="flex flex-col gap-1">
                <p className="text-sm">Drop examples of finished work here</p>
                <p id={hintId} className="text-xs text-muted-foreground">
                  Word, Excel, PowerPoint, PDF, images, CSV or text · up to {MAX_SAMPLES} files, 20 MB each
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={locked} onClick={() => input.current?.click()}>
                Browse files
              </Button>
            </>
          )}
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            aria-label="Upload work samples"
            aria-describedby={hintId}
            className="sr-only"
            disabled={locked}
            onChange={(event) => void upload(event.target.files)}
          />
        </div>
      )}

      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}

      {!compact && (
        <dl className="grid gap-3 pt-1 text-xs sm:grid-cols-3">
          {[
            ["Word & PowerPoint", "Filled in place. A template locks the formatting exactly."],
            ["Excel", "Filled in place, keeping formulas, charts and styles."],
            ["PDF & images", "Recreated from the layout. A template rebuilds it once as an editable file."],
          ].map(([term, detail]) => (
            <div key={term} className="flex flex-col gap-0.5">
              <dt className="font-medium">{term}</dt>
              <dd className="leading-relaxed text-muted-foreground">{detail}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
