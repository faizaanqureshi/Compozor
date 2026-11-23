// A run's stop reason is shown to staff. Most are written for them; an
// unexpected server error (e.g. "KeyError: 'totals'") is not, so it gets a
// plain explanation and the raw text is kept only as a technical detail.
const SERVER_ERROR = /^\s*(?:[A-Z][A-Za-z]*(?:Error|Exception)\b|Traceback\b)|'NoneType' object|object has no attribute/;

export const SERVER_ERROR_MESSAGE =
  "Something went wrong on our side while running this. Saved work is kept, so you can run it again.";

export function runReason(reason: string): { text: string; technical?: string } {
  return SERVER_ERROR.test(reason) ? { text: SERVER_ERROR_MESSAGE, technical: reason } : { text: reason };
}
