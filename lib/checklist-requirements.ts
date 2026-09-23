type Requirement = { doc_type_needed: string; description?: string | null };

export function requirementChanged(current: Requirement, next: Requirement): boolean {
  return current.doc_type_needed.trim() !== next.doc_type_needed.trim()
    || (current.description?.trim() ?? "") !== (next.description?.trim() ?? "");
}
