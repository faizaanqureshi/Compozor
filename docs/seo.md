# Search visibility

The canonical public host is `https://www.compozor.com`. The apex domain redirects
there in Vercel. Keep that redirect and the canonical host aligned.

## Implemented

- `lib/seo.ts` owns the public page list, unique titles/descriptions, canonical
  URLs, social metadata, and Organization/WebSite structured data.
- `/sitemap.xml` lists only the homepage, waitlist, and three legal pages.
- `/robots.txt` permits crawling and advertises the sitemap. Neither endpoint
  requires authentication. Crawling is allowed so Google can read `noindex`.
- The root layout defaults to `noindex`; public marketing pages explicitly opt
  in. App, sign-in, upload, and waitlist confirmation pages are not indexable.
  Clerk still protects private routes. Indexing directives are not access control.
- Vercel previews get a `noindex` HTTP header, even for marketing pages.
- `/opengraph-image` is generated at build time using bundled brand fonts;
  it needs neither authentication nor an external image/font service.

## Google Search Console (account setup, not a code deployment)

1. Verify ownership of the `compozor.com` domain property, ideally using the DNS
   TXT record Google supplies. A verified URL-prefix property for
   `https://www.compozor.com/` also works for that host.
2. After this code is deployed, submit `https://www.compozor.com/sitemap.xml`
   under **Sitemaps**. It should report **Success** after Google fetches it.
3. Inspect `https://www.compozor.com/`, run **Test live URL**, and request indexing.
4. Check **Page indexing** and **Core Web Vitals** as Google collects data.

Search Console ownership is reported set up by the site owner; sitemap submission
and Google's indexing have not been independently verified. Google chooses the
final snippet and ranking; metadata and sitemap submission do not guarantee either.

## Release checks

Run `pnpm test`, `pnpm typecheck`, and `pnpm build --webpack`. With the built server
running, fetch the sitemap, robots file, share image, homepage, and legal pages
without a session. Verify HTTP 200 and correct content types; verify the canonical
and Open Graph URLs use www, public pages allow indexing, and sign-in/upload pages
carry noindex. Private routes must remain inaccessible without authentication.

Add future marketing pages to the public page list and use `publicPageMetadata`.
Do not add authenticated routes, client links, or the external `/demo` redirect to
the sitemap. Do not fabricate last-modified dates, reviews, or customer counts.
