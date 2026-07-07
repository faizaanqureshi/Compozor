"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, SignUpButton, Show, UserButton, useAuth } from "@clerk/nextjs";
import { getMyOrganization, Organization } from "@/lib/api";

const links = [
  { href: "/clients", label: "Clients" },
  { href: "/email-log", label: "Email Log" },
  { href: "/unmatched-emails", label: "Unmatched Emails" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    getMyOrganization()
      .then(setOrg)
      .catch(() => setOrg(null));
  }, [isSignedIn]);

  return (
    <nav className="flex items-center justify-between border-b border-zinc-200 px-6 py-3">
      <div className="flex items-center gap-6">
        <span className="font-semibold">
          {isSignedIn && org ? org.name : "Accounting SaaS"}
        </span>
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
      <div className="flex items-center gap-3">
        <Show when="signed-out">
          <SignInButton>
            <button className="text-sm text-zinc-600 hover:text-black">
              Sign in
            </button>
          </SignInButton>
          <SignUpButton>
            <button className="rounded bg-black text-white text-sm px-3 py-1.5">
              Sign up
            </button>
          </SignUpButton>
        </Show>
        <Show when="signed-in">
          <UserButton />
        </Show>
      </div>
    </nav>
  );
}
