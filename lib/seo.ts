import type { Metadata, MetadataRoute } from "next";

// The apex domain redirects to www in production. Keep all discovery signals
// on that same host, including builds served through a preview URL.
export const SITE_URL = "https://www.compozor.com";
export const SITE_NAME = "Compozor";
export const SITE_DESCRIPTION =
  "Automate client follow-ups, collect and check documents, and turn them into reports, spreadsheets, and finished work for your professional service firm.";

export const PUBLIC_SEARCH_PAGES = {
  "/": {
    title: "Compozor | AI Document Collection & Workflow Automation",
    description: SITE_DESCRIPTION,
  },
  "/waitlist": {
    title: "Join the Waitlist | Compozor",
    description:
      "Get early access to Compozor. Automate client follow-ups, document collection, and workflows for your firm. Join the waitlist or book a demo.",
  },
  "/privacy": {
    title: "Privacy Policy | Compozor",
    description:
      "Learn how Compozor collects, uses, and protects information when firms and their clients use our document collection and workflow services.",
  },
  "/terms": {
    title: "Terms & Conditions | Compozor",
    description:
      "Read the terms governing your use of Compozor, including accounts, connected services, client documents, and automated workflows.",
  },
  "/cookies": {
    title: "Cookie Policy | Compozor",
    description:
      "Learn about the necessary cookies Compozor uses for sign-in, security, and essential functionality, and how to manage your preferences.",
  },
} as const;

export function isPreviewDeployment(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

export function publicPageMetadata(
  path: keyof typeof PUBLIC_SEARCH_PAGES,
): Metadata {
  const { title, description } = PUBLIC_SEARCH_PAGES[path];
  const url = new URL(path, SITE_URL).href;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    robots: { index: !isPreviewDeployment(), follow: true },
    openGraph: {
      type: "website",
      siteName: SITE_NAME,
      locale: "en_US",
      title,
      description,
      url,
      images: [{ url: `${SITE_URL}/opengraph-image`, width: 1200, height: 630,
        alt: "Compozor — Less chasing. More work delivered." }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${SITE_URL}/opengraph-image`],
    },
  };
}

export function publicSitemap(): MetadataRoute.Sitemap {
  // Do not invent last-modified timestamps on every build.
  return Object.keys(PUBLIC_SEARCH_PAGES).map((path) => ({
    url: new URL(path, SITE_URL).href,
  }));
}

export const SITE_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      logo: `${SITE_URL}/android-chrome-512x512.png`,
      description: SITE_DESCRIPTION,
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en",
    },
  ],
};
