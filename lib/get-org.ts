import { cache } from "react";
import { createOrganization, listOrganizations } from "@/lib/api";

export const getOrCreateOrg = cache(async () => {
  const orgs = await listOrganizations();
  if (orgs.length > 0) return orgs[0];
  return createOrganization("My Firm");
});
