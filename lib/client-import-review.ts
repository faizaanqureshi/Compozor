export interface EditableRow {
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

export function missingFields(row: EditableRow): string[] {
  const missing: string[] = [];
  if (!row.name.trim()) missing.push("name");
  if (row.email_error || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) missing.push("email");
  return missing;
}

// Always resolve duplicate ownership in source order, independently of display order.
export function reviewImportRows(rows: EditableRow[], existingEmails: string[]) {
  const existing = new Set(existingEmails.map((email) => email.trim().toLowerCase()));
  const seen = new Set<string>();
  return rows.map((row) => {
    const email = row.email.trim().toLowerCase();
    const reason = existing.has(email) ? "A client with this email already exists"
      : seen.has(email) ? "Duplicate email within this file" : null;
    if (row.included && missingFields(row).length === 0) seen.add(email);
    return { ...row, is_duplicate: !!reason, duplicate_reason: reason };
  });
}

// Capture once when review opens so fixing a field never moves the active row.
export function initialImportReviewOrder(rows: EditableRow[], existingEmails: string[]) {
  return reviewImportRows(rows, existingEmails)
    .map((row, index) => ({ index, priority: row.is_duplicate ? 2 : missingFields(row).length ? 0 : 1 }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(({ index }) => index);
}
