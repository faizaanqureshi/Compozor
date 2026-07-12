"use client";

import { cn } from "@/lib/utils";
import { useCurrency, type CurrencyCode } from "@/components/currency-context";

const OPTIONS: { code: CurrencyCode; flag: string }[] = [
  { code: "USD", flag: "🇺🇸" },
  { code: "CAD", flag: "🇨🇦" },
];

export function CurrencyToggle() {
  const { currency, setCurrency, rate, rateError } = useCurrency();

  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex items-center rounded-full border border-border p-1 text-sm font-medium">
        {OPTIONS.map(({ code, flag }) => (
          <button
            key={code}
            type="button"
            disabled={code === "CAD" && !rate}
            onClick={() => setCurrency(code)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-4 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
              currency === code
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span aria-hidden className="text-lg leading-none">{flag}</span>
            {code}
          </button>
        ))}
      </div>
      {currency === "CAD" && rateError && (
        <span className="text-xs text-destructive">Rate unavailable</span>
      )}
    </div>
  );
}
