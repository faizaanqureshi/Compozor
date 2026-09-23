import assert from "node:assert/strict";
import test from "node:test";
import { isStandalonePublicPage } from "../lib/public-routes.ts";

test("marketing and token-upload pages bypass app onboarding", () => {
  for (const route of ["/", "/demo", "/waitlist", "/waitlist/confirmation", "/upload/client-token", "/sign-in", "/sign-in/factor-one", "/sign-up", "/sign-up/verify-email-address", "/privacy", "/terms", "/cookies"]) {
    assert.equal(isStandalonePublicPage(route), true, route);
  }
});

test("public page matching does not exempt dashboard or lookalike routes", () => {
  for (const route of [null, "/clients", "/workflows", "/onboarding", "/waitlist-admin", "/demo-admin", "/upload-admin", "/sign-in-admin", "/sign-up-admin"]) {
    assert.equal(isStandalonePublicPage(route), false, String(route));
  }
});
