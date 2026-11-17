"use client";

import useSWR from "swr";
import { getMyOrganization } from "@/lib/api";
import { organizationKey } from "@/lib/swr-keys";

// Whether the signed-in staff member is a firm admin; undefined while the
// firm is loading. The backend enforces the same rule - this only decides
// what the UI offers.
export function useIsFirmAdmin(): boolean | undefined {
  const { data } = useSWR(organizationKey(), getMyOrganization);
  return data ? data.current_user_role === "admin" : undefined;
}

