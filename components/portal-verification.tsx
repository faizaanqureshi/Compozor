"use client";

// Emailed one-time-code verification for the Secure Client Portal. The code
// is never stored or logged here; it lives only in this input until sent.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PortalApiError,
  VERIFICATION_UNAVAILABLE_CODES,
  confirmVerification,
  isLinkError,
  requestVerification,
  type VerificationIssued,
} from "@/lib/client-portal-api";

function secondsUntil(iso: string | null, now: number): number {
  return iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000)) : 0;
}

function formatWait(seconds: number): string {
  return seconds >= 100 ? `${Math.ceil(seconds / 60)} min` : `${seconds}s`;
}

export function PortalVerification({
  token,
  organizationName,
  intro,
  onVerified,
  onCancel,
  onLinkInvalid,
  onNotRequired,
}: {
  token: string;
  organizationName?: string;
  intro?: React.ReactNode;
  onVerified: () => void;
  onCancel?: () => void;
  onLinkInvalid: (message: string) => void;
  onNotRequired?: () => void;
}) {
  const [issued, setIssued] = useState<VerificationIssued | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"request" | "confirm" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The firm has to act (no mailbox / no email on file); don't offer retries.
  const [blocked, setBlocked] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const firm = organizationName ?? "your firm";
  const resendWait = Math.max(secondsUntil(issued?.resend_available_at ?? null, now), secondsUntil(waitUntil, now));
  const expired = issued !== null && secondsUntil(issued.expires_at, now) === 0;

  const handle = (e: unknown) => {
    if (isLinkError(e)) return onLinkInvalid((e as PortalApiError).message);
    if (!(e instanceof PortalApiError)) return setError("Something went wrong. Please try again.");
    if (e.code === "verification_not_required") return onNotRequired?.();
    if (VERIFICATION_UNAVAILABLE_CODES.has(e.code)) return setBlocked(`${e.message}`);
    if (e.status === 429) {
      const retry = typeof e.detail.retry_after_seconds === "number" ? e.detail.retry_after_seconds : 60;
      setWaitUntil(new Date(Date.now() + retry * 1000).toISOString());
    }
    setError(e.message);
  };

  const send = async () => {
    setBusy("request");
    setError(null);
    try {
      const result = await requestVerification(token);
      setIssued(result);
      setCode("");
    } catch (e) {
      handle(e);
    } finally {
      setBusy(null);
    }
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    if (code.length !== 6 || busy) return;
    setBusy("confirm");
    setError(null);
    try {
      await confirmVerification(token, code);
      onVerified();
    } catch (e) {
      setCode("");
      handle(e);
    } finally {
      setBusy(null);
    }
  };

  if (blocked) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-pretty text-foreground">{blocked}</p>
        <p className="text-sm text-muted-foreground">
          For your security, questionnaire answers are only available after email verification. Please contact {firm} for help.
        </p>
        {onCancel && (
          <Button variant="outline" className="self-start" onClick={onCancel}>
            Back
          </Button>
        )}
      </div>
    );
  }

  if (!issued) {
    return (
      <div className="flex flex-col gap-4">
        {intro ?? (
          <p className="text-sm text-pretty text-muted-foreground">
            To protect your information, we&apos;ll email a 6-digit code to the address {firm} has on file.
          </p>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={send} disabled={busy !== null || resendWait > 0}>
            {busy === "request" && <Loader2 className="animate-spin" />}
            {busy === "request" ? "Sending…" : resendWait > 0 ? `Send code in ${formatWait(resendWait)}` : "Email me a code"}
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={busy !== null}>
              Not now
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={confirm} className="flex flex-col gap-4">
      <p className="text-sm text-pretty text-muted-foreground">
        We sent a 6-digit code to <span className="font-medium text-foreground">{issued.destination}</span>. It expires in 10 minutes
        and can be used once.
      </p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="portal-verification-code">Verification code</Label>
        <Input
          id="portal-verification-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          className="max-w-44 text-base tracking-[0.3em] tabular-nums"
          value={code}
          disabled={expired}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          autoFocus
        />
      </div>
      {expired && <p role="alert" className="text-sm text-destructive">This code has expired. Request a new code to continue.</p>}
      {error && !expired && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={code.length !== 6 || expired || busy !== null}>
          {busy === "confirm" && <Loader2 className="animate-spin" />}
          {busy === "confirm" ? "Verifying…" : "Verify"}
        </Button>
        <Button type="button" variant="outline" onClick={send} disabled={busy !== null || resendWait > 0}>
          {busy === "request" && <Loader2 className="animate-spin" />}
          {resendWait > 0 ? `Resend in ${formatWait(resendWait)}` : "Send a new code"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy !== null}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
