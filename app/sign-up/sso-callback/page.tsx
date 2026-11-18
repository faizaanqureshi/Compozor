import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

// Google comes back here after "Continue with Google" on the invite screen.
// Clerk finishes the sign-up (the invitation ticket was already applied) and
// sends the person on to the redirectUrlComplete given by InviteAccept.
export default function SsoCallbackPage() {
  return (
    <div className="flex h-dvh items-center justify-center gap-2 bg-background text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" />
      Finishing sign-in…
      <AuthenticateWithRedirectCallback />
      {/* Clerk's bot protection may mount here while completing the sign-up. */}
      <div id="clerk-captcha" />
    </div>
  );
}
