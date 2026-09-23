export function documentValidation(metadata: unknown) {
  const value = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  const status = typeof value.validation_status === "string" ? value.validation_status : "unknown";
  const labels: Record<string, string> = {
    accepted: "Correct · Collected",
    mismatch: "Incorrect · Replacement needed",
    supplementary: "Other document",
    processing: "Validating",
    needs_review: "Unable to validate",
  };
  const reasons = Array.isArray(value.validation_reasons)
    ? value.validation_reasons.filter((reason): reason is string => typeof reason === "string")
    : [];
  return { status, label: labels[status] ?? "Not validated", reasons };
}
