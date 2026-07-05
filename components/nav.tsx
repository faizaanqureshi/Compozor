"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useOrg } from "@/lib/org-context";

const links = [
  { href: "/clients", label: "Clients" },
  { href: "/email-log", label: "Email Log" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const org = useOrg();

  return (
    <nav className="flex items-center justify-between border-b border-zinc-200 px-6 py-3">
      <div className="flex items-center gap-6">
        <span className="font-semibold">{org.name}</span>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={
              pathname.startsWith(link.href)
                ? "font-medium text-black underline"
                : "text-zinc-600 hover:text-black"
            }
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
