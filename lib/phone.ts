// North American (10-digit) phone number handling for editable phone
// fields - canonical storage is always exactly 10 raw digits (e.g.
// "9057490504"); punctuation is presentation-only, applied at display/
// input time. Deliberately does not attempt general international
// parsing (see Organization.phone) - a longer-format number should be
// rejected by isValidPhoneDigits, not silently truncated or reformatted.
//
// This is a distinct utility from formatPhoneNumber in lib/utils.ts (used
// for read-only display of Client.phone, dash-separated, not
// canonicalized/validated on input) - that one only formats whatever's
// already stored, with no normalization or progressive-typing behavior,
// so it doesn't fit an editable field that needs to enforce and reshape a
// canonical value as the user types.

// Strips everything but digits, and drops a leading "1" country-code
// digit when present (e.g. a pasted "+1 905-749-0504" or "1-905-749-0504")
// so the canonical form stays a plain 10-digit number either way.
export function extractPhoneDigits(input: string): string {
  let digits = input.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  return digits;
}

export function isValidPhoneDigits(digits: string): boolean {
  return /^\d{10}$/.test(digits);
}

// "9057490504" -> "(905) 749-0504", building up progressively as digits
// arrive so it reads naturally mid-type (e.g. "(905) 749-05").
export function formatPhoneDisplay(digits: string): string {
  const d = digits.slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
