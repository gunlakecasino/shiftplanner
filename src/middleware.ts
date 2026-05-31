import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Velvet Ops Middleware — Performance + Security Headers
 *
 * Phase 0: First aggressive cache headers + basic security for the ops surface.
 * Future phases will add:
 *   - Canary / feature flag routing for virtual roster + new SW strategies
 *   - A/B for PPR vs legacy shell
 *   - Edge-level cache warming hints
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  // === Security (minimal but correct for internal authenticated tool) ===
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // No need for full CSP yet — internal tool with controlled devices.
  // We will add a strict one later behind a flag if we ever expose public routes.

  // === Cache hints for non-static dynamic routes (the shell + API) ===
  // Active night data is intentionally short-cache (realtime + RQ handle freshness).
  // Historical / read-only views can be longer.
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/shiftbuilder") || pathname.startsWith("/today")) {
    // Let the page decide via route segment config or 'use cache'.
    // Middleware only adds a weak hint for CDNs in front of Railway/Vercel.
    response.headers.set(
      "Cache-Control",
      "public, max-age=30, s-maxage=60, stale-while-revalidate=300"
    );
  }

  // Nightwatch (canvas/journal) — slightly more tolerant
  if (pathname.startsWith("/nightwatch")) {
    response.headers.set(
      "Cache-Control",
      "public, max-age=60, s-maxage=120, stale-while-revalidate=600"
    );
  }

  return response;
}

export const config = {
  // Only run on the routes that matter for perf (skip static + API + _next)
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json).*)",
  ],
};
