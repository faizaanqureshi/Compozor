"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Check, Loader2, UploadCloud } from "lucide-react";
import {
  ApiError,
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

// Keep in sync with MAX_IMPORT_ROWS in Compozor-API's client_import service -
// display-only, the backend is the actual source of truth for the cap.
const MAX_IMPORT_ROWS = 500;

const ACCEPTED_EXTENSIONS = [".xlsx", ".pdf", ".docx"];
const ACCEPT_ATTR =
  ".xlsx,.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

type Stage = "upload" | "processing" | "review" | "importing" | "done";

interface EditableRow {
  name: string;
  email: string;
  phone: string;
  company_name: string;
  is_duplicate: boolean;
  duplicate_reason: string | null;
  included: boolean;
}

function missingFields(row: EditableRow): string[] {
  const missing: string[] = [];
  if (!row.name.trim()) missing.push("name");
  if (!row.email.trim()) missing.push("email");
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
  const [truncated, setTruncated] = useState(false);
  const [importSummary, setImportSummary] = useState<{
    createdCount: number;
    skipped: { name: string | null; email: string | null; reason: string }[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStage("upload");
    setDragActive(false);
    setError(null);
    setRows([]);
    setTruncated(false);
    setImportSummary(null);
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleFile = async (file: File) => {
    if (!hasValidExtension(file.name)) {
      setError("Unsupported file type — please upload a .xlsx, .pdf, or .docx file.");
      return;
    }
    setError(null);
    setStage("processing");
    try {
      const result = await parseClientImportFile(file);
      setRows(
        result.rows.map((r) => ({
          name: r.name ?? "",
          email: r.email ?? "",
          phone: r.phone ?? "",
          company_name: r.company_name ?? "",
          is_duplicate: r.is_duplicate,
          duplicate_reason: r.duplicate_reason,
          included: true,
        }))
      );
      setTruncated(result.truncated);
      setStage("review");
    } catch (e) {
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
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const includableCount = rows.filter(
    (r) => r.included && missingFields(r).length === 0
  ).length;

  const onConfirm = async () => {
    const payload: ClientImportRowIn[] = rows
      .filter((r) => r.included && missingFields(r).length === 0)
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
      const result = await executeClientImport(payload);
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
            Upload a client list and we&apos;ll extract the records for you to
            review before anything is added.
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
                Accepts .xlsx, .pdf, and .docx
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
              We&apos;re parsing your client list…
            </p>
          </div>
        )}

        {stage === "review" && (
          <div className="flex flex-col gap-3">
            {truncated && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
                <AlertTriangle className="size-3.5" />
                This file has more than {MAX_IMPORT_ROWS} rows — only the first{" "}
                {MAX_IMPORT_ROWS} were extracted.
              </p>
            )}
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
                  {rows.map((row, i) => {
                    const missing = missingFields(row);
                    const includable = missing.length === 0;
                    return (
                      <tr key={i} className="align-top">
                        <td className="border-b border-border/50 py-2 pl-3">
                          <input
                            type="checkbox"
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
                            value={row.name}
                            onChange={(e) => updateRow(i, { name: e.target.value })}
                            aria-invalid={missing.includes("name")}
                            placeholder="Required"
                            className="h-7 text-sm aria-invalid:text-destructive aria-invalid:placeholder:text-destructive/70"
                          />
                        </td>
                        <td className="border-b border-border/50 py-1.5 pr-3">
                          <Input
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
                            value={row.phone}
                            onChange={(e) => updateRow(i, { phone: e.target.value })}
                            className="h-7 text-sm"
                          />
                        </td>
                        <td className="border-b border-border/50 py-1.5 pr-3">
                          <Input
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
            <p className="text-xs text-muted-foreground">
              Rows in red are missing a required field — fill them in or leave them
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
                {importSummary.skipped.map((s, i) => (
                  <span key={i}>
                    {s.name || s.email || "Unnamed row"} — {s.reason}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

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
