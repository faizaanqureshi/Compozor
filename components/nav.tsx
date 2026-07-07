"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsLeft,
  ChevronsRight,
  LogOut,
  Mail,
  MailQuestion,
  Settings,
  Users,
} from "lucide-react";
import {
  SignInButton,
  SignOutButton,
  SignUpButton,
  Show,
  useAuth,
  useUser,
} from "@clerk/nextjs";
import { getMyOrganization, Organization } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const links = [
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/email-log", label: "Email Log", icon: Mail },
  { href: "/unmatched-emails", label: "Unmatched Emails", icon: MailQuestion },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Nav() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const [org, setOrg] = useState<Organization | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!isSignedIn) return;
    getMyOrganization()
      .then(setOrg)
      .catch(() => setOrg(null));
  }, [isSignedIn]);

  if (
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up")
  )
    return null;

  return (
    <aside
      className={cn(
        "dark sticky top-0 flex h-screen shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-[4.5rem] p-3" : "w-72 p-6"
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        {!collapsed && (
          <span className="truncate font-heading text-base font-semibold tracking-tight">
            {isSignedIn && org ? org.name : "Accounting SaaS"}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          className="ml-auto shrink-0 text-sidebar-foreground/50 hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
          <span className="sr-only">Toggle sidebar</span>
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5">
        {links.map((link) => {
          const Icon = link.icon;
          const active = pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              title={collapsed ? link.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                collapsed && "justify-center px-0",
                active
                  ? "bg-sidebar-foreground/[0.06] font-medium text-sidebar-foreground"
                  : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
              )}
            >
              <Icon
                className={cn(
                  "shrink-0",
                  collapsed ? "size-[18px]" : "size-[15px]",
                  active ? "text-sidebar-foreground/80" : "text-sidebar-foreground/30"
                )}
              />
              {!collapsed && <span className="truncate">{link.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col gap-2 border-t border-sidebar-foreground/10 pt-4">
        <Show when="signed-out">
          <SignInButton>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sidebar-foreground/60 hover:bg-sidebar-foreground/8 hover:text-sidebar-foreground"
            >
              Sign in
            </Button>
          </SignInButton>
          {!collapsed && (
            <SignUpButton>
              <Button size="sm" className="w-full">
                Sign up
              </Button>
            </SignUpButton>
          )}
        </Show>
        <Show when="signed-in">
          <div
            className={cn(
              "flex items-center gap-2",
              collapsed && "flex-col gap-3"
            )}
          >
            <Avatar size="sm" className="shrink-0">
              <AvatarImage src={user?.imageUrl} alt={user?.fullName ?? "User"} />
              <AvatarFallback>
                {(user?.firstName?.[0] ?? user?.primaryEmailAddress?.emailAddress?.[0] ?? "U").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex min-w-0 flex-1 flex-col leading-tight">
                <span className="truncate text-sm font-medium text-sidebar-foreground/80">
                  {user?.fullName ?? "Account"}
                </span>
                <span className="truncate text-xs text-sidebar-foreground/45">
                  {user?.primaryEmailAddress?.emailAddress}
                </span>
              </div>
            )}
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
  );
}
