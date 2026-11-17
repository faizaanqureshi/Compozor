// Links into a client's page from Ask citations: ?doc=, ?email= or ?run=
// point at one row, which the page scrolls to and briefly highlights.
export type ClientDeepLink = { doc?: number; email?: number; run?: number };

export function readClientDeepLink(search: string): ClientDeepLink {
  const params = new URLSearchParams(search);
  const out: ClientDeepLink = {};
  for (const key of ["doc", "email", "run"] as const) {
    const value = Number(params.get(key));
    if (Number.isInteger(value) && value > 0) out[key] = value;
  }
  return out;
}

export function deepLinkElementId(link: ClientDeepLink): string | null {
  if (link.doc) return `document-${link.doc}`;
  if (link.email) return `email-${link.email}`;
  if (link.run) return `workflow-run-${link.run}`;
  return null;
}

// For useSyncExternalStore reads of window.location that never change while mounted.
export const noSubscribe = () => () => {};
