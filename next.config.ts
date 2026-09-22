import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Vercel preview deployments must never compete with the production site.
    return process.env.VERCEL_ENV === "preview"
      ? [{ source: "/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex" }] }]
      : [];
  },
};

export default nextConfig;
