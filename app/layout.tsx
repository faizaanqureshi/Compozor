import type { Metadata } from "next";
import "./globals.css";
import { getOrCreateOrg } from "@/lib/get-org";
import { OrgProvider } from "@/lib/org-context";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "Accounting SaaS",
  description: "Tax document collection dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const org = await getOrCreateOrg();

  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">
        <OrgProvider org={org}>
          <Nav />
          <main className="flex-1 p-6">{children}</main>
        </OrgProvider>
      </body>
    </html>
  );
}
