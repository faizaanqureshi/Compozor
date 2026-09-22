import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // Crawlers must be able to read noindex on sign-in and token-upload pages.
    // Private app routes remain protected by Clerk; robots.txt is not security.
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
