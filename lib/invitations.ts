// Clerk invitation tickets are JWTs. A firm (organization) invitation names
// the firm in its "oid" claim; an account invitation has none. Read without
// verifying - it only decides which firm to open after Clerk itself has
// accepted the ticket, never what anyone may access.
export function invitationOrganizationId(ticket: string | null | undefined): string | null {
  const payload = ticket?.split(".")[1];
  if (!payload) return null;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "="));
    const oid = (JSON.parse(json) as { oid?: unknown }).oid;
    return typeof oid === "string" && oid.startsWith("org_") ? oid : null;
  } catch {
    return null;
  }
}
