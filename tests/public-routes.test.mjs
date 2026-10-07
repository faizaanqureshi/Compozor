import assert from "node:assert/strict";
import test from "node:test";
import { isCrawlablePage, isStandalonePublicPage } from "../lib/public-routes.ts";

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

test("indexed pages and crawler files skip Clerk's middleware", () => {
  for (const route of ["/", "/waitlist", "/privacy", "/terms", "/cookies", "/robots.txt", "/sitemap.xml", "/opengraph-image"]) {
    assert.equal(isCrawlablePage(route), true, route);
  }
});

test("app, auth and lookalike routes keep Clerk's middleware", () => {
  for (const route of ["/clients", "/onboarding", "/sign-in", "/sign-up", "/waitlist/confirmation", "/demo", "/upload/token", "/terms-admin", "/robots.txt.bak", "/clients/1/terms"]) {
    assert.equal(isCrawlablePage(route), false, route);
  }
});
