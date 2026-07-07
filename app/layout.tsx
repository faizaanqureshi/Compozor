import {ClerkProvider} from "@clerk/nextjs";
import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Accounting SaaS",
  description: "Tax document collection dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <Nav />
          <main className="flex-1 p-6">{children}</main>
        </ClerkProvider>
      </body>
    </html>
  );
}