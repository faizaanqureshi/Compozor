"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useSignIn, useSignUp } from "@clerk/nextjs/legacy";
import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invitationOrganizationId } from "@/lib/invitations";

type Status = "sign_up" | "sign_in" | "complete" | string | undefined;

function clerkMessage(error: unknown): string {
  if (isClerkAPIResponseError(error)) {
    const first = error.errors[0];
    if (first?.code === "form_identifier_exists" || first?.code === "identifier_already_signed_in") {
      return "You already have a Compozor account. Sign in to accept the invitation.";
    }
    if (first?.code?.startsWith("ticket_") || first?.code === "invitation_expired" || first?.code === "invitation_revoked") {
      return "This invitation link has expired or was revoked. Ask your firm admin to send a new one.";
    }
    return first?.longMessage || first?.message || "Something went wrong. Please try again.";
  }
  return "Something went wrong. Please try again.";
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.94l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
      {children}
    </div>
  );
}

// Where an emailed invitation lands (Clerk's ticket link redirects to
// /sign-up?__clerk_ticket=...&__clerk_status=...). One screen instead of
// Clerk's generic "Fill in missing fields": the invited email is shown and
// locked, the person adds their name and a password, agrees to the terms,
// and lands straight inside the firm that invited them.
//
// Firm invitations carry the firm's id in the ticket; account invitations
// (a new firm's owner) do not, and continue to firm setup as usual.
export function InviteAccept({
  ticket,
  status,
  firmName,
  redirectUrl,
}: {
  ticket: string;
  status: Status;
  firmName?: string;
  redirectUrl: string;
}) {
  const router = useRouter();
  const clerk = useClerk();
  const { isSignedIn } = useAuth();
  const { isLoaded: signUpLoaded, signUp, setActive } = useSignUp();
  const { isLoaded: signInLoaded, signIn } = useSignIn();
  const organizationId = invitationOrganizationId(ticket);
  const joining = firmName ? `Join ${firmName}` : organizationId ? "Join your firm" : "Create your account";

  const [email, setEmail] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const started = useRef(false);

  const finish = async (sessionId: string | null) => {
    if (!sessionId || !setActive) return;
    await setActive({ session: sessionId, organization: organizationId ?? undefined });
    router.replace(redirectUrl);
  };

  // Start the sign-up (or sign-in) from the ticket as soon as Clerk loads.
  useEffect(() => {
    if (started.current || !signUpLoaded || !signInLoaded || !signUp || !signIn) return;
    started.current = true;
    void (async () => {
      try {
        if (isSignedIn) {
          // Already signed in on this browser: an existing account accepted
          // the invitation by opening the link. Open the firm they joined.
          if (organizationId) {
            try {
              await clerk.setActive({ organization: organizationId });
            } catch {
              // Not a member of it under this account - fall through to the app.
            }
          }
          router.replace(redirectUrl);
          return;
        }
        if (status === "sign_in") {
          // An existing account: the ticket signs them in, no password needed.
          const attempt = await signIn.create({ strategy: "ticket", ticket });
          if (attempt.status === "complete") return finish(attempt.createdSessionId);
          setFatal("Sign in to accept the invitation.");
          return;
        }
        if (status === "complete") {
          // The invitation was already accepted - just sign in.
          router.replace(`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`);
          return;
        }
        const attempt = await signUp.create({ strategy: "ticket", ticket });
        if (attempt.status === "complete") return finish(attempt.createdSessionId);
        setEmail(attempt.emailAddress);
      } catch (e) {
        setFatal(clerkMessage(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signUpLoaded, signInLoaded]);

  // Join with Google instead of a password. Continues the ticket sign-up
  // (so the invitation, firm and waitlist bypass carry over) and returns via
  // /sign-up/sso-callback; the firm is opened by the app's onboarding gate.
  const continueWithGoogle = async () => {
    if (!signUp) return;
    setBusy(true);
    setError(null);
    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        continueSignUp: true,
        legalAccepted: true,
        redirectUrl: "/sign-up/sso-callback",
        redirectUrlComplete: redirectUrl,
      });
    } catch (e) {
      setError(clerkMessage(e));
      setBusy(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!signUp || !agreed) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await signUp.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
        legalAccepted: true,
      });
      if (attempt.status === "complete") {
        await finish(attempt.createdSessionId);
        return;
      }
      setError("Some details are still missing. Please check the form and try again.");
    } catch (e) {
      setError(clerkMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (fatal) {
    return (
      <Card>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-lg font-medium text-foreground">{joining}</h1>
          <p role="alert" className="text-sm text-muted-foreground">{fatal}</p>
        </div>
        <Button nativeButton={false} render={<Link href={`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`} />}>
          Go to sign in
        </Button>
      </Card>
    );
  }

  if (!email) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" />
          Opening your invitation…
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-medium text-foreground">{joining}</h1>
        <p className="text-sm text-muted-foreground">
          {organizationId
            ? "You've been invited to Compozor. Continue with Google or set a password to join your team."
            : "You've been invited to Compozor. Continue with Google or set a password to get started."}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" value={email} readOnly disabled />
      </div>
      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" onClick={continueWithGoogle} disabled={busy}>
          <GoogleMark />
          Continue with Google
        </Button>
        <p className="text-xs text-muted-foreground">
          Use the Google account for {email}. By continuing you agree to the{" "}
          <Link href="/terms" target="_blank" className="underline underline-offset-2">Terms</Link> and{" "}
          <Link href="/privacy" target="_blank" className="underline underline-offset-2">Privacy Policy</Link>.
        </p>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or set a password
        <span className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-first">First name</Label>
            <Input id="invite-first" autoComplete="given-name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invite-last">Last name</Label>
            <Input id="invite-last" autoComplete="family-name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-password">Password</Label>
          <Input
            id="invite-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <label className="flex items-start gap-2.5 text-sm text-foreground/90">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded-sm border-border accent-primary"
          />
          <span>
            I agree to Compozor&apos;s{" "}
            <Link href="/terms" target="_blank" className="text-foreground underline underline-offset-2 hover:text-accent">
              Terms &amp; Conditions
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className="text-foreground underline underline-offset-2 hover:text-accent">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {/* Clerk's bot protection mounts its widget here. */}
        <div id="clerk-captcha" />
        <Button type="submit" disabled={busy || !agreed || !firstName.trim() || !lastName.trim() || password.length < 8}>
          {busy && <Loader2 className="animate-spin" />}
          {busy ? "Joining…" : joining}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link href={`/sign-in?redirect_url=${encodeURIComponent(redirectUrl)}`} className="text-foreground underline underline-offset-2">
          Sign in
        </Link>
      </p>
    </Card>
  );
}
