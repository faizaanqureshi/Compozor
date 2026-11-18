import test from "node:test";
import assert from "node:assert/strict";
import { invitationOrganizationId } from "../lib/invitations.ts";

const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;

test("reads the firm from an organization invitation ticket", () => {
  assert.equal(invitationOrganizationId(jwt({ oid: "org_3MIKzHE3", st: "organization_invitation" })), "org_3MIKzHE3");
});

test("account invitations and junk have no firm", () => {
  assert.equal(invitationOrganizationId(jwt({ st: "invitation" })), null);
  assert.equal(invitationOrganizationId(jwt({ oid: "user_1" })), null);
  assert.equal(invitationOrganizationId("not-a-jwt"), null);
  assert.equal(invitationOrganizationId(undefined), null);
});
