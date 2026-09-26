"use client";

import depth from "@/components/landing-depth.module.css";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "@/components/landing-motion.module.css";
import glass from "@/components/landing-glass.module.css";
import { Menu, ArrowRight } from "lucide-react";
import { Show } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const links = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#workflows", label: "Workflows" },
  { href: "/#for-firms", label: "For firms" },
];

export function LandingNav() {
  const headerRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

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
      className={`${styles.header} fixed inset-x-0 top-0 z-50 flex justify-center sm:top-5 sm:px-6`}
    >
      <nav
        aria-label="Main navigation"
        className={`${styles.nav} ${glass.light} flex w-full items-center justify-between gap-2 px-5 sm:gap-4 sm:rounded-full sm:px-6`}
      >
        <Link href="/" aria-label="Compozor home" className="shrink-0">
          <Image
            src="/compozor-wordmark.png"
            alt="Compozor"
            width={789}
            height={140}
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
            className={`${depth.primaryAction} h-9 bg-marketing-forest px-4 text-sm text-sidebar-foreground hover:bg-marketing-forest/90 max-sm:hidden`}
          >
            Book a demo
          </Button>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="icon" className="size-11 max-sm:-mr-2.5 lg:hidden" />
              }
            >
              <Menu />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>
            <SheetContent
              side="top"
              className="marketing-page data-[side=top]:h-dvh gap-0 border-0 bg-background px-5 pt-3 pb-8 shadow-none sm:px-10 [&>[data-slot=sheet-close]]:top-3 [&>[data-slot=sheet-close]]:right-2.5 [&>[data-slot=sheet-close]]:size-11 sm:[&>[data-slot=sheet-close]]:right-8"
            >
              <SheetTitle className="flex h-11 items-center">
                <Image
                  src="/compozor-wordmark.png"
                  alt="Compozor"
                  width={789}
                  height={140}
                  className="h-5 w-auto"
                />
              </SheetTitle>
              <nav aria-label="Menu" className="mt-10 flex flex-col">
                {links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={closeMenu}
                    className="flex min-h-16 items-center justify-between border-b border-border text-2xl font-light tracking-tight"
                  >
                    {link.label}
                    <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
                  </a>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-3">
                <Button
                  nativeButton={false}
                  render={<Link href="/demo" onClick={closeMenu} />}
                  size="lg"
                  className="h-12 bg-marketing-forest text-base text-sidebar-foreground hover:bg-marketing-forest/90"
                >
                  Book a demo
                </Button>
                <Button
                  nativeButton={false}
                  render={<Link href="/waitlist" onClick={closeMenu} />}
                  variant="outline"
                  size="lg"
                  className="h-12 text-base"
                >
                  Join the waitlist
                </Button>
                <Show when="signed-out">
                  <Link
                    href="/sign-in"
                    onClick={closeMenu}
                    className="flex min-h-11 items-center justify-center text-sm text-muted-foreground"
                  >
                    Sign in
                  </Link>
                </Show>
                <Show when="signed-in">
                  <Link
                    href="/clients"
                    onClick={closeMenu}
                    className="flex min-h-11 items-center justify-center gap-1.5 text-sm"
                  >
                    Dashboard <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                </Show>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
