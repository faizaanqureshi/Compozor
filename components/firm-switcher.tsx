"use client";

import { useOrganization, useOrganizationList } from "@clerk/nextjs";
import { Building2, Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Only for staff who belong to more than one firm - everyone else never
// sees it. Switching reloads the app so no cached data from the previous
// firm can show in the next one.
export function FirmSwitcher({ labelClassName }: { labelClassName?: string }) {
  const { organization } = useOrganization();
  const { isLoaded, userMemberships, setActive } = useOrganizationList({ userMemberships: true });
  const firms = userMemberships?.data ?? [];
  if (!isLoaded || firms.length < 2) return null;

  const choose = async (organizationId: string) => {
    if (organizationId === organization?.id) return;
    await setActive({ organization: organizationId });
    // A full reload on purpose: it drops every cached response from the other firm.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/clients");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            className="h-10 w-full justify-start gap-2 px-2 text-sidebar-foreground/80 hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground"
            aria-label="Switch firm"
          />
        }
      >
        <Building2 className="shrink-0" />
        <span className={cn("min-w-0 flex-1 truncate text-left text-sm", labelClassName)}>
          {organization?.name ?? "Choose a firm"}
        </span>
        <ChevronsUpDown className={cn("shrink-0 opacity-60", labelClassName)} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-64">
        <DropdownMenuLabel>Your firms</DropdownMenuLabel>
        {firms.map(({ organization: firm }) => (
          <DropdownMenuItem key={firm.id} onClick={() => void choose(firm.id)}>
            <span className="min-w-0 flex-1 truncate">{firm.name}</span>
            {firm.id === organization?.id && <Check />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
