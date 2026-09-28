// Whether a legal page's "Back to Compozor" link should return to the page
// it was opened from (Settings, the client upload portal, sign-in...) rather
// than the homepage. Only true when the previous history entry is known to be
// a page of this app, so the link never sends someone to another site or does
// nothing in a fresh tab.
export function canReturnToPreviousPage({
  documentUrl,
  currentUrl,
  referrer,
  origin,
  historyLength,
}: {
  // URL of the page load that created this document (the navigation timing
  // entry), and the URL shown now. They differ after any in-app navigation.
  documentUrl: string | null;
  currentUrl: string;
  referrer: string;
  origin: string;
  historyLength: number;
}): boolean {
  if (historyLength <= 1) return false;
  // Reached by client-side navigation: the previous entry is in this app.
  // Fragments are ignored so jumping to a #section doesn't count.
  if (documentUrl && withoutHash(documentUrl) !== withoutHash(currentUrl)) return true;
  // Full page load: only go back if it was opened from this site.
  try {
    return referrer !== "" && new URL(referrer).origin === origin;
  } catch {
    return false;
  }
}

function withoutHash(url: string): string {
  const i = url.indexOf("#");
  return i === -1 ? url : url.slice(0, i);
}
