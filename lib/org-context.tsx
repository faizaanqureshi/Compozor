"use client";

import { createContext, useContext } from "react";
import type { Organization } from "@/lib/api";

const OrgContext = createContext<Organization | null>(null);

export function OrgProvider({
  org,
  children,
}: {
  org: Organization;
  children: React.ReactNode;
}) {
  return <OrgContext value={org}>{children}</OrgContext>;
}

export function useOrg(): Organization {
  const org = useContext(OrgContext);
  if (!org) throw new Error("useOrg must be used within an OrgProvider");
  return org;
}
