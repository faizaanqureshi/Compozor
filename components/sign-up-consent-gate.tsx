"use client";

import { useState } from "react";
import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

// Clerk's <SignUp/> is a prebuilt, self-contained widget - there's no way to
// inject a required field into its own submit flow. Gating it behind an
// explicit consent step here (rather than a passive footer link) is what
// actually ties account creation to an affirmative "I agree" action.
export function SignUpConsentGate({
  forceRedirectUrl,
}: {
  forceRedirectUrl?: string;
}) {
  const [agreed, setAgreed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (confirmed) {
    return (
      <SignUp forceRedirectUrl={forceRedirectUrl} fallbackRedirectUrl="/clients" />
    );
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-5 rounded-2xl bg-card p-6 ring-1 ring-foreground/10 sm:p-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-lg font-medium text-foreground">Before you sign up</h1>
        <p className="text-sm text-muted-foreground">
          Compozor connects to your firm&apos;s inbox and processes client
          documents on your behalf — please review how we handle that data.
        </p>
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
          <Link
            href="/terms"
            target="_blank"
            className="text-foreground underline underline-offset-2 hover:text-accent"
          >
            Terms &amp; Conditions
          </Link>{" "}
          and{" "}
          <Link
            href="/privacy"
            target="_blank"
            className="text-foreground underline underline-offset-2 hover:text-accent"
          >
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      <Button disabled={!agreed} onClick={() => setConfirmed(true)}>
        Continue
      </Button>
    </div>
  );
}
