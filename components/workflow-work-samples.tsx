"use client";

import { useId, useRef, useState } from "react";
import { FileText, Loader2, Plus, X } from "lucide-react";
import { ApiError, uploadWorkflowWorkSample, type WorkflowWorkSample } from "@/lib/api";
import { Button } from "@/components/ui/button";

const ACCEPT = ".docx,.xlsx,.pptx,.pdf,.png,.jpg,.jpeg,.webp,.csv,.txt";

export function WorkflowWorkSamples({ value, onChange, disabled, onBusyChange }: {
  value: WorkflowWorkSample[];
  onChange: (samples: WorkflowWorkSample[]) => void;
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const selected = Array.from(files);
    if (selected.length + value.length > 8) {
      setError("Choose up to eight work samples.");
      return;
    }
    if (selected.some((file) => file.size === 0 || file.size > 20 * 1024 * 1024)) {
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
      setError(`${e instanceof ApiError ? e.message : "Upload failed."} Successfully uploaded samples are kept; select the remaining files to retry.`);
    } finally {
      setUploading(null);
      onBusyChange(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section aria-label="Work samples" className="space-y-3 border-t border-border/70 pt-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xs font-medium">Work samples <span className="ml-1 font-normal text-muted-foreground">Optional</span></h3>
        <Button type="button" variant="outline" size="sm" disabled={disabled || !!uploading || value.length >= 8} onClick={() => input.current?.click()}>
          <Plus className="size-3.5" /> Add samples
        </Button>
      </div>
      <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
        Add examples of the finished work. The agent follows their style and structure, using your client’s documents for the content.
      </p>
      <input ref={input} type="file" multiple accept={ACCEPT} aria-label="Upload work samples" aria-describedby={hintId} className="sr-only" disabled={disabled || !!uploading} onChange={(event) => void upload(event.target.files)} />
      {value.length > 0 && <ul className="divide-y divide-border/60 rounded-lg border border-border/70 px-3">
        {value.map((sample) => <li key={sample.id} className="flex items-center gap-3 py-2.5">
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="break-words text-xs">{sample.filename}</p>
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">{Math.max(1, Math.round(sample.size_bytes / 1024)).toLocaleString()} KB</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${sample.filename}`} disabled={disabled || !!uploading} onClick={() => onChange(value.filter((item) => item.id !== sample.id))}>
            <X className="size-3.5" />
          </Button>
        </li>)}
      </ul>}
      {uploading && <p role="status" className="flex items-start gap-2 text-xs text-muted-foreground"><Loader2 className="size-3.5 shrink-0 animate-spin" /><span className="break-words">Uploading {uploading}…</span></p>}
      <p className="text-[0.6875rem] leading-relaxed text-muted-foreground">Word, Excel and PowerPoint preserve formatting best. PDF, images, CSV and text also accepted. Up to 8 files, 20 MB each.</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </section>
  );
}
