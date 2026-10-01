// A return path from the query string, limited to this app so it can't send
// someone to another site after saving.
export function safeReturnPath(value: string | string[] | undefined, fallback: string): string {
  const path = Array.isArray(value) ? value[0] : value;
  return path && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : fallback;
}
