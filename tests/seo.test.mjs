import assert from "node:assert/strict";
import test from "node:test";
import { publicPageMetadata, publicSitemap, SITE_URL, SITE_STRUCTURED_DATA } from "../lib/seo.ts";

const publicPaths = ["/", "/waitlist", "/privacy", "/terms", "/cookies"];

test("sitemap only includes canonical public pages with matching metadata", () => {
  const sitemap = publicSitemap();
  assert.deepEqual(sitemap.map(({ url }) => new URL(url).pathname), publicPaths);
  for (const path of publicPaths) {
    const metadata = publicPageMetadata(path);
    const canonical = new URL(path, SITE_URL).href;
    assert.equal(metadata.alternates.canonical, canonical);
    assert.equal(metadata.openGraph.url, canonical);
    assert.ok(sitemap.some(({ url }) => url === canonical));
    assert.equal(new URL(metadata.openGraph.images[0].url).origin, SITE_URL);
    assert.ok(metadata.description.length > 50);
  }
  assert.equal(new Set(publicPaths.map((path) => publicPageMetadata(path).title.absolute)).size, publicPaths.length);
});

test("preview pages remain noindex but keep production canonical URLs", () => {
  const original = process.env.VERCEL_ENV;
  try {
    for (const environment of ["preview", "production"]) {
      process.env.VERCEL_ENV = environment;
      for (const path of publicPaths) {
        const metadata = publicPageMetadata(path);
        assert.equal(metadata.robots.index, environment === "production");
        assert.equal(new URL(metadata.alternates.canonical).origin, SITE_URL);
      }
    }
  } finally {
    if (original === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = original;
  }
});

test("website structured data refers to the declared organization", () => {
  const [organization, website] = SITE_STRUCTURED_DATA["@graph"];
  assert.equal(website.publisher["@id"], organization["@id"]);
  assert.equal(website.url, `${SITE_URL}/`);
  assert.equal(new URL(organization.logo).origin, SITE_URL);
});
