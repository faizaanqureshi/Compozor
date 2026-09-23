export function onboardingDestination(completed: boolean, pathname: string, search: string): string | null {
  if (!completed && pathname !== "/onboarding") return `/onboarding${search}`;
  if (completed && pathname === "/onboarding") return `/clients${search}`;
  return null;
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
