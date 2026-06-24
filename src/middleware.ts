// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
// PRODUCTION-READY — ShiftBuilder v1.0.0 floor release (June 24, 2026)
// UI frozen. Hardening only: security headers, structured logging, audit API, route aliases, UX transitions.
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
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.includes("hot-update") ||
    url.search.includes("turbopack") ||
    url.search.includes("webpackHotUpdate") ||
    request.headers.get("x-middleware-subrequest")
  ) {
    return NextResponse.next();
  }

  if (process.env.NODE_ENV === "production") {
    const devOnly =
      url.pathname.startsWith("/shiftbuilder/dev") ||
      url.pathname.startsWith("/dev/") ||
      url.pathname === "/shiftbuilder/components" ||
      url.pathname === "/shiftbuilder/ai";
    if (devOnly) {
      return NextResponse.redirect(new URL("/shiftbuilder", request.url));
    }
  }

  if (url.pathname.startsWith("/frontman")) {
    return new NextResponse(
      "Frontman path reached src/middleware.ts (Edge runtime).\n" +
        "This path must be served by root-level proxy.ts (see its runtime: 'nodejs' + matcher).\n" +
        "Fix: rm -rf .next && pnpm dev\n" +
        "If it still fails, proxy.ts may not be activating — check terminal for '[Frontman] proxy.ts module loaded'.",
      { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

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

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("X-DNS-Prefetch-Control", "off");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");

  const pathname = url.pathname;

  if (process.env.NODE_ENV === "production") {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    let supabaseHost = "";
    try {
      supabaseHost = supabaseUrl ? new URL(supabaseUrl).host : "";
    } catch {
      supabaseHost = "";
    }

    const connectSrc = ["'self'", "https://api.x.ai", "wss:"];
    if (supabaseHost) {
      connectSrc.push(`https://${supabaseHost}`, `wss://${supabaseHost}`);
    }

    const csp = [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      `connect-src ${connectSrc.join(" ")}`,
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
    ].join("; ");

    response.headers.set("Content-Security-Policy", csp);
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    if (pathname.startsWith("/shiftbuilder")) {
      response.headers.set(
        "Cache-Control",
        "public, max-age=30, s-maxage=60, stale-while-revalidate=300"
      );
    }
  } else {
    if (pathname.startsWith("/shiftbuilder") || pathname === "/") {
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
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.json|hot-update|frontman).*)",
  ],
};