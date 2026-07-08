"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, MenuIcon } from "lucide-react";
import { SignInButton, SignOutButton, Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const links = [
  {
    href: "/product",
    label: "Products",
    description: "Automatically gather and organize client tax documents.",
  },
  { href: "/pricing", label: "Pricing" },
  { href: "/updates", label: "Updates" },
];

export function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-3 z-50 flex justify-center px-3 sm:top-4 sm:px-4">
      <div className="flex w-full max-w-4xl items-center justify-between gap-2 rounded-full border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur sm:gap-4 sm:px-4 supports-backdrop-filter:bg-card/80">
        <div className="flex items-center gap-4 sm:gap-6">
          <Link href="/" className="shrink-0">
            <Image
              src="/compozor-logo-dark.png"
              alt="Compozor"
              width={795}
              height={214}
              priority
              className="h-6 w-auto sm:h-7 md:h-8"
            />
          </Link>
          <div className="hidden h-6 w-px shrink-0 bg-border md:block" />
          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Products</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <NavigationMenuLink
                    render={<Link href="/product" />}
                    className="w-72 flex-col items-start gap-1"
                  >
                    <span className="font-medium">Document Collection</span>
                    <span className="text-xs text-muted-foreground">
                      Automatically gather and organize client tax documents.
                    </span>
                  </NavigationMenuLink>
                </NavigationMenuContent>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink
                  render={<Link href="/pricing" />}
                  className={cn(navigationMenuTriggerStyle(), "font-medium")}
                >
                  Pricing
                </NavigationMenuLink>
              </NavigationMenuItem>
              <NavigationMenuItem>
                <NavigationMenuLink
                  render={<Link href="/updates" />}
                  className={cn(navigationMenuTriggerStyle(), "font-medium")}
                >
                  Updates
                </NavigationMenuLink>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Show when="signed-in">
            <SignOutButton>
              <button className="hidden text-sm font-medium text-muted-foreground hover:text-foreground md:inline-block">
                Sign out
              </button>
            </SignOutButton>
            <Button
              size="sm"
              nativeButton={false}
              render={<Link href="/email-log" />}
              className="px-2.5 sm:px-3"
            >
              <span className="hidden sm:inline">Dashboard</span>
              <span className="sm:hidden">Go</span>
              <ArrowRightIcon />
            </Button>
          </Show>
          <Show when="signed-out">
            <SignInButton>
              <Button size="sm" variant="outline" className="px-2.5 sm:px-3">
                Sign in
              </Button>
            </SignInButton>
          </Show>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon-sm" className="md:hidden" />
              }
            >
              <MenuIcon />
              <span className="sr-only">Open menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {links.map((link) => (
                <DropdownMenuItem
                  key={link.href}
                  render={<Link href={link.href} />}
                  className="flex-col items-start gap-0.5 py-2"
                >
                  {link.label}
                  {link.description && (
                    <span className="text-xs font-normal text-muted-foreground">
                      {link.description}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
              <Show when="signed-in">
                <DropdownMenuSeparator />
                <SignOutButton>
                  <DropdownMenuItem variant="destructive" closeOnClick={false}>
                    Sign out
                  </DropdownMenuItem>
                </SignOutButton>
              </Show>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
