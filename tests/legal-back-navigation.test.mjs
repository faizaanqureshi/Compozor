import test from "node:test";
import assert from "node:assert/strict";
import { canReturnToPreviousPage } from "../lib/legal-back-navigation.ts";

const origin = "https://compozor.com";
const at = (path) => `${origin}${path}`;

test("returns to the page it was opened from after in-app navigation", () => {
  // Settings -> Privacy, and the client upload portal -> Privacy.
  for (const from of ["/settings", "/upload/abc123"]) {
    assert.equal(
      canReturnToPreviousPage({ documentUrl: at(from), currentUrl: at("/privacy"), referrer: "", origin, historyLength: 3 }),
      true,
      from
    );
  }
});

test("returns after a full page load opened from this site", () => {
  assert.equal(
    canReturnToPreviousPage({
      documentUrl: at("/terms"),
      currentUrl: at("/terms"),
      referrer: at("/sign-in"),
      origin,
      historyLength: 2,
    }),
    true
  );
});

test("falls back to the homepage with no in-app page to return to", () => {
  const direct = { documentUrl: at("/privacy"), currentUrl: at("/privacy"), origin };
  // Typed URL or bookmark.
  assert.equal(canReturnToPreviousPage({ ...direct, referrer: "", historyLength: 2 }), false);
  // Arrived from another site.
  assert.equal(canReturnToPreviousPage({ ...direct, referrer: "https://www.google.com/", historyLength: 2 }), false);
  // Fresh tab: nothing to go back to, even if opened from this site.
  assert.equal(canReturnToPreviousPage({ ...direct, referrer: at("/settings"), historyLength: 1 }), false);
  // Jumping to a #section on the same page isn't in-app navigation.
  assert.equal(
    canReturnToPreviousPage({ ...direct, currentUrl: at("/privacy#cookies"), referrer: "", historyLength: 3 }),
    false
  );
  // Unreadable referrer.
  assert.equal(canReturnToPreviousPage({ ...direct, referrer: "not a url", historyLength: 2 }), false);
});
