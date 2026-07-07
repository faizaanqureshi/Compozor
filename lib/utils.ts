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
