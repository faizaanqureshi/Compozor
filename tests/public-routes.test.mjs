import assert from "node:assert/strict";
import test from "node:test";
import { isStandalonePublicPage } from "../lib/public-routes.ts";

test("marketing and token-upload pages bypass app onboarding", () => {
  for (const route of ["/", "/demo", "/waitlist", "/waitlist/confirmation", "/upload/client-token"]) {
    assert.equal(isStandalonePublicPage(route), true, route);
  }
});

test("public page matching does not exempt dashboard or lookalike routes", () => {
  for (const route of [null, "/clients", "/workflows", "/onboarding", "/waitlist-admin", "/demo-admin", "/upload-admin"]) {
    assert.equal(isStandalonePublicPage(route), false, String(route));
  }
});
