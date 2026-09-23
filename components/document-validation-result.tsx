import { documentValidation } from "@/lib/document-validation";

export function DocumentValidationResult({ metadata, collected = true }: { metadata: unknown; collected?: boolean }) {
  const { status, label, reasons } = documentValidation(metadata, collected);
  return (
    <div className="flex max-w-sm flex-col gap-1 text-sm">
      <span className={status === "mismatch" ? "font-medium text-destructive" : "font-medium"}>{label}</span>
      {status === "supplementary" && <p className="text-xs text-muted-foreground">Does not match a requested document.</p>}
      {reasons.length > 0 && <p className="text-xs font-normal text-muted-foreground">{reasons.join(" ")}</p>}
    </div>
  );
}
