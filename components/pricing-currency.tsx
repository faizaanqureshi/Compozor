"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { saveChosenPlan } from "@/lib/chosen-plan";
import type { PlanKey } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  PRICING_CURRENCY_STORAGE_KEY,
  PRICING_FOOTNOTES,
  parsePricingCurrency,
  type PricingCurrency,
} from "@/lib/pricing";

// The visitor's own choice, kept in localStorage so it survives visits. The
// in-memory copy keeps the switch working this visit when storage is blocked.
let chosen: PricingCurrency | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readChoice(): PricingCurrency | null {
  if (chosen) return chosen;
  try {
    return parsePricingCurrency(window.localStorage.getItem(PRICING_CURRENCY_STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveChoice(currency: PricingCurrency) {
  chosen = currency;
  try {
    window.localStorage.setItem(PRICING_CURRENCY_STORAGE_KEY, currency);
  } catch {
    /* preference only */
  }
  listeners.forEach((listener) => listener());
}

const PricingCurrencyContext = createContext<PricingCurrency>("cad");

/** `initial` comes from the visitor's country (see defaultPricingCurrency); a saved choice wins. */
export function PricingCurrencyProvider({
  initial,
  children,
}: {
  initial: PricingCurrency;
  children: ReactNode;
}) {
  const saved = useSyncExternalStore(subscribe, readChoice, () => null);
  return (
    <PricingCurrencyContext.Provider value={saved ?? initial}>
      {children}
    </PricingCurrencyContext.Provider>
  );
}

const OPTIONS: { value: PricingCurrency; label: string }[] = [
  { value: "cad", label: "CA$" },
  { value: "usd", label: "US$" },
];

export function CurrencySwitch({ className }: { className?: string }) {
  const currency = useContext(PricingCurrencyContext);
  return (
    <div
      role="group"
      aria-label="Currency"
      className={cn("inline-flex w-fit gap-0.5 rounded-lg bg-muted p-0.5", className)}
    >
      {OPTIONS.map((option) => (
        <Button
          key={option.value}
          variant="ghost"
          aria-pressed={currency === option.value}
          onClick={() => saveChoice(option.value)}
          className="h-11 px-4 text-muted-foreground hover:bg-transparent aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:ring-1 aria-pressed:ring-foreground/10 sm:h-8 sm:px-3.5"
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export function PlanPrice({ price }: { price: Record<PricingCurrency, string> }) {
  return <>{price[useContext(PricingCurrencyContext)]}</>;
}

export function PricingFootnote({ className }: { className?: string }) {
  return <p className={className}>{PRICING_FOOTNOTES[useContext(PricingCurrencyContext)]}</p>;
}

/** A plan's "Start free trial" link: remembers the plan and currency for the end of onboarding. */
export function ChosenPlanLink({ plan, href, ...props }: { plan: PlanKey; href: string } & Omit<React.ComponentProps<typeof Link>, "href">) {
  const currency = useContext(PricingCurrencyContext);
  return (
    <Link
      href={href}
      {...props}
      onClick={(event) => {
        saveChosenPlan({ plan, currency: currency === "usd" ? "USD" : "CAD" });
        props.onClick?.(event);
      }}
    />
  );
}
