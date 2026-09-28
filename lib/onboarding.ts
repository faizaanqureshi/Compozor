export function onboardingDestination(completed: boolean, pathname: string, search: string): string | null {
  if (!completed && pathname !== "/onboarding") return `/onboarding${search}`;
  if (completed && pathname === "/onboarding") return `/clients${search}`;
  return null;
}

// Onboarding is a full-screen, fixed-position page with no dashboard chrome
// (nav, top bar and background already hide themselves there). The app shell
// renders it without its animated page wrapper: that wrapper keeps a
// filter/transform after its entrance animation, which makes it the
// containing block for position: fixed and collapsed onboarding to zero
// height - a blank page for every new account.
export function isOnboardingPage(pathname: string | null): boolean {
  return pathname === "/onboarding" || !!pathname?.startsWith("/onboarding/");
}

export function mailboxResult(search: string): { error?: string; success?: string } | null {
  const params = new URLSearchParams(search);
  const provider = params.has("outlook") ? "outlook" : "gmail";
  const status = params.get(provider);
  if (status === "error") return { error: params.get("reason") || "Could not connect your mailbox. Please try again." };
  if (status === "connected") return { success: "Your mailbox is connected." };
  return null;
}

export function withoutMailboxResult(search: string): string {
  const params = new URLSearchParams(search);
  for (const key of ["gmail", "outlook", "reason", "email"]) params.delete(key);
  return params.size ? `?${params}` : "";
}
