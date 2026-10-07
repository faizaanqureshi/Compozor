import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { isCrawlablePage } from "@/lib/public-routes";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/waitlist",
  "/waitlist/(.*)",
  "/demo",
  "/upload(.*)",
  "/privacy",
  "/terms",
  "/cookies",
  "/robots\\.txt",
  "/sitemap\\.xml",
  "/opengraph-image",
]);

const clerk = clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

// Indexed marketing pages bypass Clerk entirely - see isCrawlablePage.
export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isCrawlablePage(request.nextUrl.pathname)) return NextResponse.next();
  return clerk(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
