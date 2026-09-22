"use client";

import depth from "@/components/landing-depth.module.css";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import styles from "@/components/landing-motion.module.css";
import glass from "@/components/landing-glass.module.css";
import { Menu, ArrowRight } from "lucide-react";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#workflows", label: "Workflows" },
  { href: "/#for-firms", label: "For firms" },
];

export function LandingNav() {
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let frame = 0;
    let compact = false;
    const update = () => {
      frame = 0;
      // Separate thresholds prevent jitter near the transition point.
      compact = window.scrollY > (compact ? 12 : 32);
      header.dataset.compact = String(compact);
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className={`${styles.header} fixed inset-x-0 top-4 z-50 flex justify-center px-4 sm:top-5 sm:px-6`}
    >
      <nav
        aria-label="Main navigation"
        className={`${styles.nav} ${glass.light} flex w-full items-center justify-between gap-2 rounded-full px-3 sm:gap-4 sm:px-6`}
      >
        <Link href="/" aria-label="Compozor home" className="shrink-0">
          <Image
            src="/compozor-logo-dark.png"
            alt="Compozor"
            width={795}
            height={214}
            priority
            className={`${styles.logo} w-auto`}
          />
        </Link>
        <div className="hidden items-center gap-7 lg:flex">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1 sm:gap-6">
          <Show when="signed-out">
            <Link
              href="/sign-in"
              className="hidden text-sm text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              Sign in
            </Link>
          </Show>
          <Show when="signed-in">
            <Link href="/clients" className="hidden items-center gap-1.5 text-sm sm:flex">
              <span>Dashboard</span>
              <ArrowRight className="hidden size-3.5 sm:block" aria-hidden />
            </Link>
          </Show>
          <Button
            nativeButton={false}
            render={<Link href="/demo" />}
            className={`${depth.primaryAction} h-11 bg-marketing-forest px-3 text-xs text-sidebar-foreground hover:bg-marketing-forest/90 sm:h-9 sm:px-4 sm:text-sm`}
          >
            Book a demo
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon" className="size-11 lg:hidden" />
              }
            >
              <Menu />
              <span className="sr-only">Open menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={`${styles.menu} ${glass.light} w-60 [&_[role=menuitem]]:min-h-11 [&_[role=menuitem]]:px-3`}>
              {links.map((link) => (
                <DropdownMenuItem
                  key={link.href}
                  render={<a href={link.href} />}
                >
                  {link.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem render={<Link href="/demo" />}>
                Book a demo
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/waitlist" />}>
                Join the waitlist
              </DropdownMenuItem>
              <Show when="signed-out">
                <DropdownMenuItem className="sm:hidden" render={<Link href="/sign-in" />}>
                  Sign in
                </DropdownMenuItem>
              </Show>
              <Show when="signed-in">
                <DropdownMenuItem className="sm:hidden" render={<Link href="/clients" />}>
                  Dashboard
                </DropdownMenuItem>
              </Show>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  );
}
