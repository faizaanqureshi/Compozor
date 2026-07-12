import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const RELATIVE_TIME_DIVISIONS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
]

const relativeTimeFormatter = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
})

export function formatRelativeTime(iso: string): string {
  const diffSeconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  for (const [unit, secondsInUnit] of RELATIVE_TIME_DIVISIONS) {
    if (Math.abs(diffSeconds) >= secondsInUnit) {
      return relativeTimeFormatter.format(
        Math.round(diffSeconds / secondsInUnit),
        unit
      )
    }
  }
  return relativeTimeFormatter.format(diffSeconds, "second")
}

// Costs are computed server-side from fractions of a cent per call (see
// openai_pricing.py), so a $0.01-precision formatter would round small
// per-org totals to "$0.00" - four decimal places keeps them legible.
// One formatter per currency code (a fresh Intl.NumberFormat per call is
// wasteful and the codes here are a closed, tiny set).
const currencyFormatters: Partial<Record<string, Intl.NumberFormat>> = {}

function currencyFormatter(currency: string): Intl.NumberFormat {
  return (currencyFormatters[currency] ??= new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }))
}

export function formatCurrency(amount: number, currency: string = "USD"): string {
  return currencyFormatter(currency).format(amount)
}

const compactNumberFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
})

export function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value)
}
