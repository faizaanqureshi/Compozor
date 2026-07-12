"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  Landmark,
  LogOut,
  Mail,
  MailQuestion,
  Settings,
  Users,
  X,
} from "lucide-react";
import {
  SignInButton,
  SignOutButton,
  SignUpButton,
  Show,
  useUser,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { isAdminEmail } from "@/lib/admin";
import { useMobileNav } from "@/components/mobile-nav-context";

const links = [
  { href: "/clients", label: "Clients", icon: Users, tourId: "clients" },
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
//  - md to lg: docked in the layout, but permanently collapsed to an icon
//    rail - there's no room to offer the expand/collapse toggle here.
//  - lg and up: docked, and the user can expand/collapse it via `collapsed`.
export function Nav() {
  const pathname = usePathname();
  const { user } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const { mobileOpen, setMobileOpen } = useMobileNav();
  const visibleLinks = isAdminEmail(user?.primaryEmailAddress?.emailAddress)
    ? [...links, adminLink]
    : links;

  useEffect(() => {
    setMobileOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/onboarding")
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
          "dark fixed inset-y-0 left-0 z-50 flex h-screen w-72 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar p-6 text-sidebar-foreground transition-transform duration-200 md:sticky md:top-0 md:w-[4.5rem] md:translate-x-0 md:p-3 md:transition-[width]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          collapsed ? "lg:w-[4.5rem] lg:p-3" : "lg:w-72 lg:p-6"
        )}
      >
      <div
        className={cn(
          "flex items-center gap-2 justify-between px-1 md:justify-center md:px-0",
          !collapsed && "lg:justify-between lg:px-1"
        )}
      >
        <Link
          href="/"
          className={cn("shrink-0 md:hidden", !collapsed && "lg:inline-block")}
        >
          <Image
            src="/compozor-logo.png"
            alt="Compozor"
            width={795}
            height={214}
            priority
            className="h-7 w-auto"
          />
        </Link>
        <Link
          href="/"
          className="relative hidden size-7 shrink-0 overflow-hidden rounded-md md:block lg:hidden"
        >
          <Image
            src="/compozor-logo.png"
            alt="Compozor"
            fill
            sizes="28px"
            priority
            className="object-cover object-left"
          />
        </Link>
        <Button
          variant="ghost"
          size="icon-sm"
          className="shrink-0 text-sidebar-foreground/50 hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground md:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <X />
          <span className="sr-only">Close menu</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className={cn(
            "hidden shrink-0 text-sidebar-foreground/50 hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground lg:inline-flex",
            !collapsed && "ml-auto"
          )}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {visibleLinks.map((link) => {
          const Icon = link.icon;
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              title={link.label}
              data-tour-nav={link.tourId}
              className={cn(
                "flex items-center gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                "md:justify-center md:px-0",
                !collapsed && "lg:justify-start lg:px-2.5",
                active
                  ? "bg-sidebar-foreground/[0.06] font-medium text-sidebar-foreground"
                  : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
              )}
            >
              <Icon
                className={cn(
                  "size-[15px] shrink-0 md:size-[18px]",
                  !collapsed && "lg:size-[15px]",
                  active ? "text-sidebar-foreground/80" : "text-sidebar-foreground/30"
                )}
              />
              <span className={cn("truncate md:hidden", !collapsed && "lg:inline")}>
                {link.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 border-t border-sidebar-foreground/10 pt-4">
        <Show when="signed-out">
          <SignInButton fallbackRedirectUrl="/clients">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sidebar-foreground/60 hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground"
            >
              Sign in
            </Button>
          </SignInButton>
          <SignUpButton fallbackRedirectUrl="/clients">
            <Button
              size="sm"
              className={cn("w-full md:hidden", !collapsed && "lg:inline-flex")}
            >
              Sign up
            </Button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <div
            className={cn(
              "flex items-center gap-2 md:flex-col md:gap-3",
              !collapsed && "lg:flex-row lg:gap-2"
            )}
          >
            <Avatar size="sm" className="shrink-0">
              <AvatarImage src={user?.imageUrl} alt={user?.fullName ?? "User"} />
              <AvatarFallback>
                {(user?.firstName?.[0] ?? user?.primaryEmailAddress?.emailAddress?.[0] ?? "U").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col leading-tight md:hidden",
                !collapsed && "lg:flex"
              )}
            >
              <span className="truncate text-sm font-medium text-sidebar-foreground/80">
                {user?.fullName ?? "Account"}
              </span>
              <span className="truncate text-xs text-sidebar-foreground/65">
                {user?.primaryEmailAddress?.emailAddress}
              </span>
            </div>
            <SignOutButton>
              <Button
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-sidebar-foreground/45 hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground"
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
