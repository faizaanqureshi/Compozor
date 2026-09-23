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
