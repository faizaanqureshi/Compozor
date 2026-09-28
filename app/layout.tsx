import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";
import { SITE_URL, SITE_DESCRIPTION } from "@/lib/seo";

const geist = localFont({
  variable: "--font-sans",
  src: "./fonts/geist/Geist.ttf",
  weight: "100 900",
});

// SOFT and WONK are pinned to 0 in the file; weight and optical size stay variable.
const fraunces = localFont({
  variable: "--font-display",
  src: "./fonts/fraunces/Fraunces.ttf",
  weight: "100 900",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Compozor",
  description: SITE_DESCRIPTION,
  // Only explicitly listed marketing pages opt into indexing. This also keeps
  // new dashboard pages, sign-in, and client upload links out of search.
  robots: { index: false, follow: true },
  manifest: "/site.webmanifest",
  icons: {
    // Every icon is the white mark on its own brand tile, legible on any
    // tab strip or shortcut tile. (A color-scheme-aware SVG followed the OS
    // setting, not Chrome's theme, and vanished on dark themes over a light
    // OS.) The ICO must not claim sizes "any", or Chrome prefers it over
    // the SVG.
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("h-full", "font-sans", geist.variable, fraunces.variable)}>
      <body className="min-h-full flex flex-col">
        <ClerkProvider waitlistUrl="/waitlist" signInUrl="/sign-in" signUpUrl="/sign-up">
          <AppShell>{children}</AppShell>
        </ClerkProvider>
      </body>
    </html>
  );
}