export function documentValidation(metadata: unknown, collected = true) {
  const value = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  let status = typeof value.validation_status === "string" ? value.validation_status : "unknown";
  const labels: Record<string, string> = {
    accepted: "Correct · Collected",
    mismatch: "Incorrect · Replacement needed",
    supplementary: "Other document",
    processing: "Validating",
    needs_review: "Needs a check",
  };
  let reasons = Array.isArray(value.validation_reasons)
    ? value.validation_reasons.filter((reason): reason is string => typeof reason === "string")
    : [];
  if (status === "accepted" && !collected) {
    status = "needs_review";
    reasons = ["The request this file was matched to has changed. Check it still fits what you asked for."];
  }
  return { status, label: labels[status] ?? "Not validated", reasons };
}
