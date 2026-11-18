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
            ? "You've been invited to Compozor. Set a password to join your team."
            : "You've been invited to Compozor. Set a password to get started."}
        </p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" value={email} readOnly disabled />
        </div>
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
