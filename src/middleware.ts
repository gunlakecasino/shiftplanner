import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Velvet Ops Middleware (Edge-safe only)
 *
 * Responsibilities:
 * - Dev-only aggressive no-cache headers (critical for stable Turbopack HMR)
 * - Production cache hints for the main shells
 * - Security headers
 * - PWA / Safari icon fallbacks
 * - Early bail on HMR/Turbopack internal requests
 *
 * IMPORTANT: This file must stay 100% Edge Runtime compatible.
 * Frontman (the /frontman visual AI tool) is handled **exclusively** by the root
 * `proxy.ts` (Next.js 16 "proxy" convention + `runtime: "nodejs"`). The matcher
 * below + proxy.ts narrow matcher ensure this file is never invoked for /frontman.
 *
 * Never add Node-only APIs (process.cwd, fs, child_process, etc.) here.
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl;

  // === NEVER touch HMR / Turbopack chunk requests ===
  // These are the #1 cause of "module factory is not available" during dev.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.includes("hot-update") ||
    url.search.includes("turbopack") ||
    url.search.includes("webpackHotUpdate") ||
    request.headers.get("x-middleware-subrequest")
  ) {
    return NextResponse.next();
  }

  // Safety net: Frontman paths must be handled exclusively by root `proxy.ts`
  // (which uses the Next.js 16 "proxy" + runtime: "nodejs" convention so that
  // @frontman-ai/nextjs can use fs, process.cwd(), source editing, etc.).
  //
  // If a /frontman request reaches this file, either:
  //   - the proxy.ts matcher/config isn't being picked up, or
  //   - the matcher below was changed to let it through.
  // In either case we return a clear error instead of letting it 404 silently
  // or (worse) trying to run Node-only code under Edge.
  if (url.pathname.startsWith("/frontman")) {
    return new NextResponse(
      "Frontman path reached src/middleware.ts (Edge runtime).\n" +
        "This path must be served by root-level proxy.ts (see its runtime: 'nodejs' + matcher).\n" +
        "Fix: rm -rf .next && pnpm dev\n" +
        "If it still fails, proxy.ts may not be activating — check terminal for '[Frontman] proxy.ts module loaded'.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  // PWA / Safari homescreen icon fallbacks.
  // Keeps real assets under /public/icons/ without polluting the root.
  const iconRewrites: Record<string, string> = {
    "/apple-touch-icon.png": "/icons/apple-touch-icon.png",
    "/apple-touch-icon-precomposed.png": "/icons/apple-touch-icon.png",
    "/apple-touch-icon-120x120.png": "/icons/icon-192.png",
    "/apple-touch-icon-152x152.png": "/icons/icon-192.png",
    "/apple-touch-icon-180x180.png": "/icons/icon-192.png",
  };
  if (iconRewrites[url.pathname]) {
    return NextResponse.rewrite(new URL(iconRewrites[url.pathname], request.url));
  }

  const response = NextResponse.next();

  // Minimal security headers (internal ops tool)
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  const pathname = url.pathname;

  if (process.env.NODE_ENV === "production") {
    if (pathname.startsWith("/shiftbuilder") || pathname.startsWith("/today")) {
      response.headers.set(
        "Cache-Control",
        "public, max-age=30, s-maxage=60, stale-while-revalidate=300"
      );
    }
    if (pathname.startsWith("/nightwatch")) {
      response.headers.set(
        "Cache-Control",
        "public, max-age=60, s-maxage=120, stale-while-revalidate=600"
      );
    }
  } else {
    // DEV: Strongest possible no-cache on the main app documents.
    // This forces the browser to always revalidate the shell that owns the HMR runtime.
    if (
      pathname.startsWith("/shiftbuilder") ||
      pathname.startsWith("/today") ||
      pathname.startsWith("/nightwatch") ||
      pathname === "/"
    ) {
      response.headers.set(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
      );
      response.headers.set("Pragma", "no-cache");
      response.headers.set("Expires", "0");
      response.headers.set("Surrogate-Control", "no-store");
    }
  }

  return response;
}

export const config = {
  // Strongly exclude /frontman (and all HMR/static noise).
  // Frontman is handled only by the root `proxy.ts` (Next 16 proxy convention + Node runtime).
  // Including frontman here would cause this Edge middleware to run for it, which is wrong.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json|hot-update|frontman).*)",
  ],
};
