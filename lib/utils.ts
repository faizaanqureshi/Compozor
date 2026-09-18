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

// Phone numbers aren't validated/normalized on input yet (no enforcement -
// see clients edit form), so this is purely a display-time formatter. A
// number that already contains a dash is assumed to be pre-formatted and
// passed through untouched. Otherwise: 10 raw digits -> "647-621-1844",
// 11 raw digits starting with a leading "1" extension -> "1-647-621-1844".
// Anything else (unexpected length, letters, etc.) is returned as-is.
export function formatPhoneNumber(phone: string): string {
  if (phone.includes("-")) return phone

  const digits = phone.replace(/\D/g, "")

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `${digits[0]}-${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`
  }

  return phone
}
