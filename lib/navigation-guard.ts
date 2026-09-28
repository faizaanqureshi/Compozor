type ClickModifiers = { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };
type AnchorLike = { href: string; target: string; hasAttribute: (name: string) => boolean };
type LocationLike = { href: string; origin: string; pathname: string; search: string };

/**
 * Whether clicking this link would leave the current page within the app, and so
 * should be confirmed while there are unsaved edits. New tabs, downloads,
 * external links and same-page hash links are left alone.
 */
export function isGuardedNavigation(anchor: AnchorLike, event: ClickModifiers, current: LocationLike): boolean {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const url = new URL(anchor.href, current.href);
  if (url.origin !== current.origin) return false;
  return url.pathname !== current.pathname || url.search !== current.search;
}
