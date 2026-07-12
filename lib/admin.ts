// Mirrors the backend's INTERNAL_ADMIN_EMAILS allowlist (see
// accounting-saas/app/config.py's internal_admin_emails) so the sidebar icon
// and /admin pages don't flash for non-admins. This is a UX nicety only, not
// the real security boundary - the backend's get_internal_admin dependency
// (checked against *verified* Clerk emails) is what actually enforces this,
// and NEXT_PUBLIC_* values are baked into the client bundle anyway.
const ADMIN_EMAILS = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export const isAdminEmail = (email?: string | null) =>
  !!email && ADMIN_EMAILS.has(email.toLowerCase());
