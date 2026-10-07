export function isStandalonePublicPage(pathname: string | null): boolean {
  return (
    pathname === "/" ||
    pathname === "/demo" ||
    isAuthPage(pathname) ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/cookies" ||
    pathname === "/waitlist" ||
    !!pathname?.startsWith("/waitlist/") ||
    !!pathname?.startsWith("/upload/")
  );
}

export function isAuthPage(pathname: string | null): boolean {
  return !!pathname && /^\/sign-(in|up)(?:\/|$)/.test(pathname);
}

// Pages search engines index (see app/sitemap.ts), plus the files crawlers
// fetch. proxy.ts skips Clerk's middleware for them: on a development Clerk
// instance it sends every cookie-less page load through a handshake redirect
// on Clerk's domain, and a crawler (which keeps no cookies) loops on it
// forever - Search Console's "Redirect error". These pages only use Clerk in
// the browser, never on the server.
const CRAWLABLE_PATHS = new Set(["/", "/waitlist", "/privacy", "/terms", "/cookies", "/robots.txt", "/sitemap.xml", "/opengraph-image"]);

export function isCrawlablePage(pathname: string): boolean {
  return CRAWLABLE_PATHS.has(pathname);
}
