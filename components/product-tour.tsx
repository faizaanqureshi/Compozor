"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { updateMyOrganization } from "@/lib/api";
import { markOnboardingComplete } from "@/components/onboarding-gate";
import { Button } from "@/components/ui/button";

const PENDING_KEY = "product-tour-pending";
const STEP_KEY = "product-tour-step";

// Nav links sit only `gap-0.5` (2px) apart, so the spotlight's padding has
// to stay under that or the "hole" bleeds into the next link and makes it
// clickable too.
const SPOTLIGHT_PAD = 2;

// Paths where the tour must never render, even if somehow left pending -
// these are the same routes Nav() itself hides on, so there'd be no sidebar
// link to spotlight anyway. "/" is checked for an exact match only - every
// path starts with "/", so treating it as a prefix here would exempt every
// route and the tour would never render anywhere.
const EXEMPT_PREFIXES = ["/sign-in", "/sign-up", "/onboarding"];

// Called once, right when the onboarding wizard's last step is submitted.
// Deliberately does NOT set `onboarding_completed` on the org yet - that
// only happens once the tour itself is finished (see finish() below), so a
// user who closes the tab mid-tour lands right back on /onboarding's wizard
// today, then re-enters the tour rather than skipping it (see
// OnboardingGate, which treats this pending flag as "let them into the app,
// the tour will gate them instead").
export function startProductTour() {
  try {
    localStorage.setItem(PENDING_KEY, "1");
    localStorage.setItem(STEP_KEY, "0");
  } catch {
    // Storage unavailable - the tour just won't resume across reloads.
  }
}

export function isProductTourPending(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

type Step = {
  path: string;
  navSelector: string;
  title: string;
  body: string;
  prompt: string;
};

const steps: Step[] = [
  {
    path: "/clients",
    navSelector: '[data-tour-nav="clients"]',
    title: "Your client roster",
    body: "Every client lives here — active status, outstanding documents, and a feed of recent activity so you always know what's next.",
    prompt: "Click Clients in the sidebar to continue.",
  },
  {
    path: "/email-log",
    navSelector: '[data-tour-nav="email-log"]',
    title: "Every email, one thread",
    body: "See every message sent or received across clients, including AI-drafted replies that are waiting for your review before they go out.",
    prompt: "Click Email Log in the sidebar to continue.",
  },
  {
    path: "/unmatched-emails",
    navSelector: '[data-tour-nav="unmatched-emails"]',
    title: "Emails without a match",
    body: "When a reply doesn't match a known client, it lands here so you can link it to the right person or spin up a new client on the spot.",
    prompt: "Click Unmatched Emails in the sidebar to continue.",
  },
  {
    path: "/settings",
    navSelector: '[data-tour-nav="settings"]',
    title: "Automation & mailbox",
    body: "Control how aggressively Compozor auto-sends drafted replies, how often to nudge clients for missing documents, and manage your connected mailbox.",
    prompt: "Click Settings in the sidebar to continue.",
  },
];

type Phase = "target" | "arrived";

export function ProductTour() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [pending, setPending] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // Re-checked on every route change, not just on first mount: this
  // component lives at the layout level so it survives client-side
  // navigations without remounting, and it may well have first mounted
  // before startProductTour() was ever called (e.g. while still on
  // /onboarding) - a mount-only read would freeze `pending` at false
  // forever and the tour would never appear once the wizard finished.
  useEffect(() => {
    setMounted(true);
    setPending(isProductTourPending());
    try {
      const saved = Number(localStorage.getItem(STEP_KEY));
      if (Number.isFinite(saved)) {
        setStepIndex(Math.min(Math.max(saved, 0), steps.length - 1));
      }
    } catch {
      // Ignore - defaults to step 0.
    }
  }, [pathname]);

  const exempt = pathname === "/" || EXEMPT_PREFIXES.some((p) => pathname.startsWith(p));
  const step = steps[stepIndex];
  const isFinalStep = stepIndex === steps.length - 1;
  const arrived = !exempt && pathname === step?.path;
  const phase: Phase = arrived ? "arrived" : "target";

  useEffect(() => {
    if (!pending || exempt) return;
    if (arrived) {
      try {
        localStorage.setItem(STEP_KEY, String(stepIndex));
      } catch {
        // Non-fatal - just means a refresh mid-step re-derives from stepIndex state.
      }
    }
  }, [pending, exempt, arrived, stepIndex]);

  useEffect(() => {
    if (!pending || exempt || !step) return;
    const recalc = () => {
      const el = document.querySelector(step.navSelector);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    recalc();
    window.addEventListener("resize", recalc);
    // Sidebar collapse/expand animates its width - poll briefly to track it
    // rather than wiring a ResizeObserver just for this.
    const id = window.setInterval(recalc, 250);
    return () => {
      window.removeEventListener("resize", recalc);
      window.clearInterval(id);
    };
  }, [pending, exempt, step]);

  if (!mounted || !pending || exempt || !step) return null;

  const onNext = () => {
    const next = Math.min(stepIndex + 1, steps.length - 1);
    setStepIndex(next);
    // Persist right away (not just once arrived) so a refresh between
    // clicking Next and actually navigating doesn't rewind this step.
    try {
      localStorage.setItem(STEP_KEY, String(next));
    } catch {
      // Non-fatal - worst case a refresh here re-shows this step's Next button.
    }
  };

  const onFinish = async () => {
    setFinishing(true);
    setFinishError(null);
    try {
      await updateMyOrganization({ onboarding_completed: true });
      try {
        localStorage.removeItem(PENDING_KEY);
        localStorage.removeItem(STEP_KEY);
      } catch {
        // Non-fatal - the org update already went through.
      }
      markOnboardingComplete();
      window.location.reload();
    } catch (e) {
      setFinishError(e instanceof Error ? e.message : String(e));
      setFinishing(false);
    }
  };

  const cardPosition = rect
    ? {
        top: Math.min(
          Math.max(rect.top, 16),
          (typeof window !== "undefined" ? window.innerHeight : 800) - 220
        ),
        left: rect.right + 16,
      }
    : null;

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[200]">
      {rect ? (
        <>
          <div
            className="pointer-events-auto fixed bg-black/70 transition-all duration-200"
            style={{ top: 0, left: 0, right: 0, height: Math.max(rect.top - SPOTLIGHT_PAD, 0) }}
          />
          <div
            className="pointer-events-auto fixed bg-black/70 transition-all duration-200"
            style={{ top: rect.bottom + SPOTLIGHT_PAD, left: 0, right: 0, bottom: 0 }}
          />
          <div
            className="pointer-events-auto fixed bg-black/70 transition-all duration-200"
            style={{
              top: rect.top - SPOTLIGHT_PAD,
              left: 0,
              width: Math.max(rect.left - SPOTLIGHT_PAD, 0),
              height: rect.height + SPOTLIGHT_PAD * 2,
            }}
          />
          <div
            className="pointer-events-auto fixed bg-black/70 transition-all duration-200"
            style={{
              top: rect.top - SPOTLIGHT_PAD,
              left: rect.right + SPOTLIGHT_PAD,
              right: 0,
              height: rect.height + SPOTLIGHT_PAD * 2,
            }}
          />
          <div
            className="pointer-events-none fixed rounded-lg ring-1 ring-accent transition-all duration-200"
            style={{
              top: rect.top - SPOTLIGHT_PAD,
              left: rect.left - SPOTLIGHT_PAD,
              width: rect.width + SPOTLIGHT_PAD * 2,
              height: rect.height + SPOTLIGHT_PAD * 2,
              boxShadow: "0 0 0 2px color-mix(in oklch, var(--accent) 25%, transparent)",
            }}
          />
        </>
      ) : (
        <div className="pointer-events-auto fixed inset-0 bg-black/70" />
      )}

      <div
        className="pointer-events-auto fixed z-[201] flex w-80 flex-col gap-3 rounded-2xl bg-card p-5 text-card-foreground shadow-xl ring-1 ring-foreground/10 animate-blur-in-sm"
        style={
          cardPosition
            ? { top: cardPosition.top, left: cardPosition.left }
            : {
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }
        }
      >
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Step {stepIndex + 1} of {steps.length}
        </span>
        <h3 className="text-3xl font-thin tracking-tight [font-family:var(--font-denton)]">{step.title}</h3>
        <p className="text-sm text-muted-foreground">{step.body}</p>

        {finishError && <p className="text-xs text-destructive">{finishError}</p>}

        {phase === "target" ? (
          <p className="text-sm font-medium text-accent">{step.prompt}</p>
        ) : isFinalStep ? (
          <Button onClick={onFinish} disabled={finishing} className="self-start">
            {finishing ? "Finishing…" : "Finish tour"}
            {!finishing && <Check />}
          </Button>
        ) : (
          <Button onClick={onNext} className="self-start">
            Next
            <ArrowRight />
          </Button>
        )}
      </div>
    </div>,
    document.body
  );
}
