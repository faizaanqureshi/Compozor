"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import {
  ChevronsLeft,
  ChevronsRight,
  Landmark,
  LogOut,
  Mail,
  MailQuestion,
  Package,
  Settings,
  Users,
  Workflow,
  X,
} from "lucide-react";
import {
  SignInButton,
  SignOutButton,
  SignUpButton,
  Show,
  useUser,
} from "@clerk/nextjs";
import { getMyOrganization } from "@/lib/api";
import { organizationKey } from "@/lib/swr-keys";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { isAdminEmail } from "@/lib/admin";
import { useMobileNav } from "@/components/mobile-nav-context";

const links = [
  { href: "/clients", label: "Clients", icon: Users, tourId: "clients" },
  { href: "/workflows", label: "Workflows", icon: Workflow, tourId: "workflows" },
  { href: "/packages", label: "Packages", icon: Package, tourId: "packages" },
  { href: "/email-log", label: "Email Log", icon: Mail, tourId: "email-log" },
  {
    href: "/unmatched-emails",
    label: "Unmatched Emails",
    icon: MailQuestion,
    tourId: "unmatched-emails",
  },
  { href: "/settings", label: "Settings", icon: Settings, tourId: "settings" },
];

// Not part of `links` above - only shown to whitelisted internal staff (see
// lib/admin.ts), spliced in below rather than always present.
const adminLink = { href: "/admin", label: "Admin", icon: Landmark, tourId: "admin" };

// Breakpoint behavior:
//  - below md: off-canvas drawer, opened via the mobile top bar's hamburger.
//  - md to xl: docked in the layout, but permanently collapsed to an icon
//    rail - there's no room to offer the expand/collapse toggle here.
//  - xl and up: docked, and the user can expand/collapse it via `collapsed`.
export function Nav() {
  const pathname = usePathname();
  const { user, isLoaded, isSignedIn } = useUser();
  // Shares its SWR cache entry with the Settings page (same key) - editing
  // your name or firm name there updates this instantly everywhere else,
  // with no polling or extra plumbing needed.
  const { data: org } = useSWR(isLoaded && isSignedIn ? organizationKey() : null, getMyOrganization);
  const [collapsed, setCollapsed] = useState(false);
  const { mobileOpen, setMobileOpen } = useMobileNav();
  const visibleLinks = isAdminEmail(user?.primaryEmailAddress?.emailAddress)
    ? [...links, adminLink]
    : links;

  // contact_name/org name are unset until someone visits Settings (or,
  // for the org name, sets a firm name during onboarding) - Clerk's own
  // name is the only thing guaranteed to exist for a brand-new account.
  const displayName = org?.contact_name || user?.fullName || "Account";
  const orgLabel = org?.name || null;

  useEffect(() => {
    setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/cookies")
  )
    return null;

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cn(
          "dark fixed inset-y-0 left-0 z-50 flex h-screen w-72 shrink-0 flex-col gap-10 border-r border-sidebar-border bg-sidebar px-4 py-6 text-sidebar-foreground transition-transform duration-200 md:sticky md:top-0 md:w-20 md:translate-x-0 md:px-3 md:transition-[width]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "xl:w-20 xl:px-3" : "xl:w-72 xl:px-4"
        )}
      >
      <div
        className={cn(
          "flex min-h-11 items-center gap-2 justify-between px-3 md:justify-center md:px-0",
          !collapsed && "xl:justify-between xl:px-3"
        )}
      >
        <Link
          href="/"
          className={cn("shrink-0 md:hidden", !collapsed && "xl:inline-block")}
        >
          <Image
            src="/compozor-wordmark-light.png"
            alt="Compozor"
            width={789}
            height={140}
            priority
            className="h-6 w-auto"
          />
        </Link>
        <Link
          href="/"
          className={cn("hidden shrink-0 md:block", !collapsed && "xl:hidden")}
        >
          <Image
            src="/compozor-mark-light.png"
            alt="Compozor"
            width={135}
            height={135}
            priority
            className="size-8"
          />
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="size-11 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X />
          <span className="sr-only">Close menu</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "hidden shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground xl:inline-flex",
            collapsed ? "xl:absolute xl:top-6 xl:-right-4 xl:size-8 xl:rounded-full xl:border xl:border-sidebar-border xl:bg-sidebar" : "-mr-2 ml-auto"
          )}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-1.5">
        {visibleLinks.map((link) => {
          const Icon = link.icon;
          const active = pathname.startsWith(link.href);
          return (
            <Tooltip key={link.href}>
              <TooltipTrigger
                render={
                  <Link
                    href={link.href}
                    aria-label={link.label}
                    data-tour-nav={link.tourId}
                    className={cn(
                      "flex min-h-11 items-center gap-3.5 rounded-lg px-3 text-[0.9375rem] transition-colors",
                      "md:size-14 md:min-h-0 md:justify-center md:self-center md:px-0",
                      !collapsed && "xl:h-11 xl:w-auto xl:justify-start xl:self-stretch xl:px-3",
                      active
                        ? "bg-sidebar-foreground/10 text-sidebar-foreground"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground"
                    )}
                  />
                }
              >
                <Icon
                  strokeWidth={1.5}
                  className={cn(
                    "size-5 shrink-0 md:size-6",
                    !collapsed && "xl:size-5",
                    active ? "text-sidebar-foreground" : "text-sidebar-foreground/70"
                  )}
                />
                <span className={cn("truncate md:hidden", !collapsed && "xl:inline")}>
                  {link.label}
                </span>
              </TooltipTrigger>
              {/* Labels are hidden only on the collapsed rail; tooltips stand in there. */}
              <TooltipContent
                side="right"
                sideOffset={10}
                className={cn("max-md:hidden", !collapsed && "xl:hidden")}
              >
                {link.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 border-t border-sidebar-foreground/10 pt-5">
        <Show when="signed-out">
          <SignInButton fallbackRedirectUrl="/clients">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sidebar-foreground/75 hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground"
            >
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton fallbackRedirectUrl="/clients">
            <Button
              size="sm"
              className={cn("w-full md:hidden", !collapsed && "xl:inline-flex")}
            >
              Sign up
            </Button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <div
            className={cn(
              "flex items-center gap-3 px-1 md:flex-col md:gap-3 md:px-0",
              !collapsed && "xl:flex-row xl:gap-3 xl:px-1"
            )}
          >
            <Avatar className="shrink-0">
              <AvatarImage src={user?.imageUrl} alt={user?.fullName ?? "User"} />
              <AvatarFallback>
                {(user?.firstName?.[0] ?? user?.primaryEmailAddress?.emailAddress?.[0] ?? "U").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col leading-tight md:hidden",
                !collapsed && "xl:flex"
              )}
            >
              <span
                className="truncate text-sm font-medium text-sidebar-foreground"
                title={orgLabel ? `${displayName} · ${orgLabel}` : displayName}
              >
                {displayName}
                {orgLabel && (
                  <>
                    {" "}
                    <span aria-hidden className="text-sidebar-foreground/50">·</span>{" "}
                    {orgLabel}
                  </>
                )}
              </span>
              <span className="mt-0.5 truncate text-xs text-sidebar-foreground/70">
                {user?.primaryEmailAddress?.emailAddress}
              </span>
            </div>
            <SignOutButton>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground"
              >
                <LogOut />
                <span className="sr-only">Sign out</span>
              </Button>
            </SignOutButton>
          </div>
        </Show>
      </div>
      </aside>
    </>
  );
}
