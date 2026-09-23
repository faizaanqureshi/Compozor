import { isAuthPage, isStandalonePublicPage } from "./public-routes";

// Clerk's redirect_url outranks its fallback prop. Explicitly replace invalid
// destinations, including old links containing recursively nested auth URLs.
export function postAuthRedirect(
  value: string | string[] | undefined,
  origin = "https://www.compozor.com"
): string {
  if (typeof value !== "string" || !value || /[\\\x00-\x20]/.test(value)) return "/clients";
  try {
    const url = new URL(value, origin);
    const origins = [origin, "https://www.compozor.com", "https://compozor.com"];
    if (
      value.startsWith("//") ||
      !["http:", "https:"].includes(url.protocol) ||
      !origins.includes(url.origin)
    ) return "/clients";
    const path = decodeURIComponent(url.pathname);
    if (path.startsWith("//") || isAuthPage(path) || path === "/") return "/clients";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/clients";
  }
}

export function signInRedirect(pathname: string, search = ""): string | null {
  if (isStandalonePublicPage(pathname)) return null;
  return `/sign-in?redirect_url=${encodeURIComponent(pathname + search)}`;
}
