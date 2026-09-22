export function isStandalonePublicPage(pathname: string | null): boolean {
  return (
    pathname === "/" ||
    pathname === "/demo" ||
    pathname === "/waitlist" ||
    !!pathname?.startsWith("/waitlist/") ||
    !!pathname?.startsWith("/upload/")
  );
}
