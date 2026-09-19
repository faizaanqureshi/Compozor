"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, UploadCloud } from "lucide-react";
import {
  ApiError,
  ClientImportParseResult,
  getClientImport,
  retryClientImport,
  ClientImportRowIn,
  executeClientImport,
  parseClientImportFile,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const ACCEPTED_EXTENSIONS = [".xlsx", ".pdf", ".docx"];
const ACCEPT_ATTR =
  ".xlsx,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Stage = "upload" | "processing" | "failed" | "review" | "importing" | "done";
const PAGE_SIZE = 50;
const JOB_STORAGE_KEY = "client-import-job";

interface EditableRow {
  name: string;
  email: string;
  phone: string;
  company_name: string;
  is_duplicate: boolean;
  duplicate_reason: string | null;
  included: boolean;
  source: string | null;
  email_error: boolean;
}

function missingFields(row: EditableRow): string[] {
  const missing: string[] = [];
  if (!row.name.trim()) missing.push("name");
  if (row.email_error || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) missing.push("email");
  return missing;
}

function hasValidExtension(filename: string) {
  const lower = filename.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function ClientImportModal({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("upload");
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [importSummary, setImportSummary] = useState<{
    createdCount: number;
    skipped: { name: string | null; email: string | null; reason: string }[];
  } | null>(null);
  const [page, setPage] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [warnings, setWarnings] = useState<string[]>([]);
  const [existingEmails, setExistingEmails] = useState<string[]>([]);
  const requestVersion = useRef(0);
  const executeKey = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    requestVersion.current += 1;
    setPage(0);
    setProgress({ completed: 0, total: 0 });
    setJobId(null);
    setWarnings([]);
    executeKey.current = null;
    sessionStorage.removeItem(JOB_STORAGE_KEY);
    setStage("upload");
    setDragActive(false);
    setError(null);
    setRows([]);
    setImportSummary(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && stage === "upload") {
      const saved = sessionStorage.getItem(JOB_STORAGE_KEY);
      if (saved) { setJobId(saved); setStage("processing"); }
    }
    if (!next && !["processing", "importing", "failed"].includes(stage)) reset();
  };

  const acceptResult = useCallback((result: ClientImportParseResult) => {
    setProgress({ completed: result.completed_batches, total: result.total_batches });
    setWarnings(result.warnings);
    if (result.job_id) {
      setJobId(result.job_id);
      sessionStorage.setItem(JOB_STORAGE_KEY, result.job_id);
    }
    if (result.status === "processing") { setStage("processing"); return; }
    if (result.status === "failed") {
      setError(`${result.failed_batches} section(s) could not be processed. Completed sections are saved.`);
      setStage("failed");
      return;
    }
    setExistingEmails(result.existing_emails);
    setRows(result.rows.map((r) => ({
      name: r.name ?? "", email: r.email ?? "", phone: r.phone ?? "",
      company_name: r.company_name ?? "", source: r.source,
      email_error: r.validation_errors.includes("Invalid email address"),
      is_duplicate: r.is_duplicate, duplicate_reason: r.duplicate_reason, included: true,
    })));
    setPage(0);
    setStage("review");
    setError(null);
  }, []);

  useEffect(() => {
    if (!jobId || stage !== "processing") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const result = await getClientImport(jobId);
        if (cancelled) return;
        acceptResult(result);
        if (result.status === "processing") timer = setTimeout(poll, 1500);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setStage("failed");
      }
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [jobId, stage, acceptResult]);

  const handleFile = async (file: File) => {
    if (!hasValidExtension(file.name) || file.size > 20 * 1024 * 1024) {
      setError("Upload a .xlsx, .pdf, or .docx file up to 20 MB.");
      return;
    }
    const version = ++requestVersion.current;
    setProgress({ completed: 0, total: 0 });
    setJobId(null);
    setError(null);
    setStage("processing");
    try {
      const result = await parseClientImportFile(file);
      if (requestVersion.current === version) acceptResult(result);
    } catch (e) {
      if (requestVersion.current !== version) return;
      setError(e instanceof ApiError ? e.message : String(e));
      setStage("upload");
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const updateRow = (index: number, patch: Partial<EditableRow>) => {
    executeKey.current = null;
    if (patch.email !== undefined) patch.email_error = false;
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const reviewRows = useMemo(() => {
    const existing = new Set(existingEmails.map((email) => email.trim().toLowerCase()));
    const seen = new Set<string>();
    return rows.map((row) => {
      const email = row.email.trim().toLowerCase();
      const reason = existing.has(email) ? "A client with this email already exists"
        : seen.has(email) ? "Duplicate email within this file" : null;
      if (row.included && missingFields(row).length === 0) seen.add(email);
      return { ...row, is_duplicate: !!reason, duplicate_reason: reason };
    });
  }, [rows, existingEmails]);
  const includableCount = reviewRows.filter((r) => r.included && !r.is_duplicate && missingFields(r).length === 0).length;

  const onConfirm = async () => {
    const payload: ClientImportRowIn[] = reviewRows
      .filter((r) => r.included && !r.is_duplicate && missingFields(r).length === 0)
      .map((r) => ({
        name: r.name.trim(),
        email: r.email.trim(),
        phone: r.phone.trim() || undefined,
        company_name: r.company_name.trim() || undefined,
      }));
    if (payload.length === 0) return;

    setStage("importing");
    setError(null);
    try {
      executeKey.current ??= crypto.randomUUID();
      const result = await executeClientImport(payload, executeKey.current);
      sessionStorage.removeItem(JOB_STORAGE_KEY);
      setPage(0);
      setImportSummary({
        createdCount: result.created.length,
        skipped: result.skipped,
      });
      setStage("done");
      onImported();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setStage("review");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="outline" />}>
        <UploadCloud />
        Import clients
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import clients</DialogTitle>
          <DialogDescription>
            Upload a client list. We&apos;ll recognize its columns automatically
            and show the records for review before anything is added.
          </DialogDescription>
        </DialogHeader>

        {stage === "upload" && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter") fileInputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-12 text-center transition-colors",
              dragActive
                ? "border-accent bg-accent/[0.06]"
                : "border-border hover:bg-muted/40"
            )}
          >
            <UploadCloud className="size-8 text-muted-foreground" />
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                Drag and drop your client list here, or click to browse
              </p>
              <p className="text-xs text-muted-foreground">
                Accepts .xlsx, .pdf, and .docx · Up to 20 MB
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </div>
        )}

        {stage === "processing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {progress.total > 0 ? `Processed ${progress.completed} of ${progress.total} sections…` : "Reading your client list…"}
            </p>
          </div>
        )}

        {stage === "review" && (
          <div className="flex min-w-0 flex-col gap-3">
            <div className="max-h-[45vh] overflow-auto rounded-lg ring-1 ring-foreground/10">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-left">
                    <th className="w-8 border-b border-border/70 py-2 pl-3" />
                    <th className="border-b border-border/70 py-2 pr-3 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                      Name
                    </th>
                    <th className="border-b border-border/70 py-2 pr-3 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                      Email
                    </th>
                    <th className="border-b border-border/70 py-2 pr-3 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                      Phone
                    </th>
                    <th className="border-b border-border/70 py-2 pr-3 text-[11px] font-medium tracking-wide text-muted-foreground/70 uppercase">
                      Company
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reviewRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row, index) => {
                    const i = page * PAGE_SIZE + index;
                    const missing = missingFields(row);
                    const includable = missing.length === 0;
                    return (
                      <tr key={i} className="align-top">
                        <td className="border-b border-border/50 py-2 pl-3">
                          <input
                            type="checkbox"
                            aria-label={`Include row ${i + 1}`}
                            checked={row.included && includable}
                            disabled={!includable}
                            onChange={(e) =>
                              updateRow(i, { included: e.target.checked })
                            }
                            className="mt-1.5 size-3.5 accent-accent disabled:opacity-30"
                          />
                        </td>
                        <td className="border-b border-border/50 py-1.5 pr-3">
                          <Input
                            aria-label={`Name, row ${i + 1}`}
                            value={row.name}
                            onChange={(e) => updateRow(i, { name: e.target.value })}
                            aria-invalid={missing.includes("name")}
                            placeholder="Required"
                            className="h-7 text-sm aria-invalid:text-destructive aria-invalid:placeholder:text-destructive/70"
                          />
                          {row.source && <span className="text-[11px] text-muted-foreground">{row.source}</span>}
                        </td>
                        <td className="border-b border-border/50 py-1.5 pr-3">
                          <Input
                            aria-label={`Email, row ${i + 1}`}
                            value={row.email}
                            onChange={(e) => updateRow(i, { email: e.target.value })}
                            aria-invalid={missing.includes("email")}
                            placeholder="Required"
                            className="h-7 text-sm aria-invalid:text-destructive aria-invalid:placeholder:text-destructive/70"
                          />
                          {row.is_duplicate && (
                            <Badge variant="secondary" className="mt-1">
                              {row.duplicate_reason ?? "Duplicate"} — will be skipped
                            </Badge>
                          )}
                        </td>
                        <td className="border-b border-border/50 py-1.5 pr-3">
                          <Input
                            aria-label={`Phone, row ${i + 1}`}
                            value={row.phone}
                            onChange={(e) => updateRow(i, { phone: e.target.value })}
                            className="h-7 text-sm"
                          />
                        </td>
                        <td className="border-b border-border/50 py-1.5 pr-3">
                          <Input
                            aria-label={`Company, row ${i + 1}`}
                            value={row.company_name}
                            onChange={(e) =>
                              updateRow(i, { company_name: e.target.value })
                            }
                            className="h-7 text-sm"
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">
                        No clients found in this file.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{rows.length} source rows · {includableCount} ready to add</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <span>{page + 1} / {Math.max(1, Math.ceil(rows.length / PAGE_SIZE))}</span>
                <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= rows.length} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Rows in red need a name or valid email — fill them in or leave them
              unchecked to skip.
            </p>
          </div>
        )}

        {stage === "importing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Adding clients…</p>
          </div>
        )}

        {stage === "done" && importSummary && (
          <div className="flex flex-col gap-3 py-4">
            <div className="flex items-center gap-2 text-sm">
              <Check className="size-4 text-accent" />
              Added {importSummary.createdCount} client
              {importSummary.createdCount === 1 ? "" : "s"}.
            </div>
            {importSummary.skipped.length > 0 && (
              <div className="flex flex-col gap-1.5 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
                <span className="font-medium text-foreground/80">
                  Skipped {importSummary.skipped.length}:
                </span>
                {importSummary.skipped.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((s, i) => (
                  <span key={i}>
                    {s.name || s.email || "Unnamed row"} — {s.reason}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {stage === "failed" && <div className="flex flex-wrap gap-2">
          <Button onClick={async () => {
            if (!jobId) return;
            setError(null);
            try { acceptResult(await retryClientImport(jobId)); }
            catch (e) { setError(e instanceof Error ? e.message : String(e)); }
          }}>Retry unfinished sections</Button>
          <Button variant="outline" onClick={reset}>Start another import</Button>
        </div>}
        {stage === "done" && importSummary && importSummary.skipped.length > PAGE_SIZE && <div className="flex items-center gap-2">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <span className="text-xs">{page + 1} / {Math.ceil(importSummary.skipped.length / PAGE_SIZE)}</span>
          <Button variant="outline" disabled={(page + 1) * PAGE_SIZE >= importSummary.skipped.length} onClick={() => setPage(page + 1)}>Next</Button>
        </div>}
        {warnings.map((warning) => <p key={warning} className="text-xs text-muted-foreground">{warning}</p>)}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {stage === "review" && (
          <DialogFooter>
            <Button onClick={onConfirm} disabled={includableCount === 0}>
              Confirm &amp; add {includableCount} client
              {includableCount === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        )}
        {stage === "done" && (
          <DialogFooter>
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
