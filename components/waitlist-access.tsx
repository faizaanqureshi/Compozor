"use client";

import Link from "next/link";
import { Show, Waitlist } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

// The waitlist page's signed-in/out switch, resolved in the browser. It must
// stay client-side: the page skips Clerk's middleware so crawlers aren't sent
// through Clerk's handshake (see isCrawlablePage), and a server-rendered
// <Show> would need that middleware.
export function WaitlistAccess() {
  return (
    <>
      <Show when="signed-out">
        <Waitlist
          signInUrl="/sign-in"
          fallback={
            <p role="status" className="text-sm text-muted-foreground">
              Loading the waitlist…
            </p>
          }
          appearance={{
            variables: {
              colorPrimary: "var(--primary)",
              colorBackground: "var(--card)",
              colorForeground: "var(--foreground)",
              colorMutedForeground: "var(--muted-foreground)",
              colorInput: "var(--background)",
              colorInputForeground: "var(--foreground)",
              fontFamily: "var(--font-sans)",
              borderRadius: "var(--radius)",
            },
            elements: {
              rootBox: { width: "100%", maxWidth: "24rem" },
              cardBox: {
                width: "100%",
                boxShadow: "none",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-xl)",
              },
              card: { boxShadow: "none" },
              headerTitle: { fontWeight: "400", letterSpacing: "-0.025em" },
              formButtonPrimary: {
                boxShadow: "none",
                backgroundImage: "none",
              },
              footer: { background: "var(--muted)" },
            },
          }}
        />
      </Show>
      <Show when="signed-in">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8">
          <h2 className="text-xl font-light">You already have access.</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Your workspace is ready. Head back to your dashboard to
            continue.
          </p>
          <Button
            className="mt-6 h-10 px-4"
            nativeButton={false}
            render={<Link href="/clients" />}
          >
            Open dashboard
          </Button>
        </div>
      </Show>
    </>
  );
}
