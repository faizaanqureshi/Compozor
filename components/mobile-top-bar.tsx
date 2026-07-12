"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMobileNav } from "@/components/mobile-nav-context";

export function MobileTopBar() {
  const pathname = usePathname();
  const { setMobileOpen } = useMobileNav();

  if (
    pathname === "/" ||
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/onboarding")
  )
    return null;

  return (
    <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4 md:hidden">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setMobileOpen(true)}
      >
        <Menu />
        <span className="sr-only">Open menu</span>
      </Button>
      <Link href="/" className="shrink-0">
        <Image
          src="/compozor-logo-dark.png"
          alt="Compozor"
          width={795}
          height={214}
          priority
          className="h-5 w-auto"
        />
      </Link>
    </div>
  );
}
