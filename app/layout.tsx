import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";

const neueMontreal = localFont({
  variable: "--font-sans",
  src: [
    { path: "./fonts/neue-montreal/PPNeueMontreal-Light.otf", weight: "300", style: "normal" },
    { path: "./fonts/neue-montreal/PPNeueMontreal-Regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/neue-montreal/PPNeueMontreal-Italic.otf", weight: "400", style: "italic" },
    { path: "./fonts/neue-montreal/PPNeueMontreal-Semibold.otf", weight: "600", style: "normal" },
    { path: "./fonts/neue-montreal/PPNeueMontreal-SemiboldItalic.otf", weight: "600", style: "italic" },
    { path: "./fonts/neue-montreal/PPNeueMontreal-Extrabold.otf", weight: "800", style: "normal" },
  ],
});

const denton = localFont({
  variable: "--font-denton",
  src: [
    { path: "./fonts/denton/DentonTest-Thin.otf", weight: "100", style: "normal" },
    { path: "./fonts/denton/DentonTest-Regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/denton/DentonTest-Medium.otf", weight: "500", style: "normal" },
    { path: "./fonts/denton/DentonTest-Bold.otf", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "Compozor",
  description: "Client communication, document collection, and workflows for professional service firms.",
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
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
    <html lang="en" className={cn("h-full", "font-sans", neueMontreal.variable, denton.variable)}>
      <body className="min-h-full flex flex-col">
        <ClerkProvider waitlistUrl="/waitlist" signInUrl="/sign-in" signUpUrl="/sign-up">
          <AppShell>{children}</AppShell>
        </ClerkProvider>
      </body>
    </html>
  );
}