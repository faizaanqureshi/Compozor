"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";

export function LandingNav() {
  return (
    <header className="fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="flex w-full max-w-4xl items-center justify-between gap-4 rounded-full border border-border bg-card/95 px-4 py-2 shadow-sm backdrop-blur supports-backdrop-filter:bg-card/80">
        <div className="flex items-center gap-6">
          <Link href="/" className="shrink-0">
            <Image
              src="/compozor-logo-dark.png"
              alt="Compozor"
              width={795}
              height={214}
              priority
              className="h-8 w-auto"
            />
          </Link>
          <div className="h-6 w-px shrink-0 bg-border" />
          <NavigationMenu>
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
        <div className="flex items-center gap-3">
          <Show when="signed-in">
            <SignOutButton>
              <button className="text-sm font-medium text-muted-foreground hover:text-foreground">
                Sign out
              </button>
            </SignOutButton>
            <Button size="sm" nativeButton={false} render={<Link href="/email-log" />}>
              Dashboard
              <ArrowRightIcon />
            </Button>
          </Show>
          <Show when="signed-out">
            <SignInButton>
              <Button size="sm" variant="outline">
                Sign in
              </Button>
            </SignInButton>
          </Show>
        </div>
      </div>
    </header>
  );
}
