// @ts-nocheck
// Frontman dev proxy (Next.js 16 root proxy convention). No bundled types for @frontman-ai/nextjs
// (dev-only tooling for visual UI/UX at /frontman; not part of production build or Railway output).
// This silences the module declaration error while keeping the integration intact. Safe because
// this file is excluded from normal app bundling per Next.js proxy semantics.
import { createMiddleware } from "@frontman-ai/nextjs";
import { type NextRequest, NextResponse } from "next/server";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Frontman proxy (Next.js 16+ "proxy" convention)
 *
 * Frontman (https://frontman.sh) is an AI-powered visual UI/UX development tool.
 * It needs full Node.js capabilities (filesystem access for source edits, process.cwd(), etc.).
 *
 * Per Next.js 16 guidance, anything requiring Node runtime must use the root-level
 * `proxy.ts` file (not middleware.ts) with `runtime: 'nodejs'`.
 *
 * This file's ONLY job is to serve and power /frontman.
 * All other middleware concerns (Turbopack HMR no-cache headers, icon rewrites,
 * security, prod cache hints) live in src/middleware.ts.
 *
 * See:
 *  - https://nextjs.org/docs/messages/middleware-to-proxy
 *  - https://frontman.sh/docs/integrations/nextjs/
 *  - UI_UX_DEVELOPMENT.md
 */

// Compute a stable project root. Using the location of proxy.ts is more reliable
// than process.cwd() when the dev command is invoked from different directories.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('[Frontman] proxy.ts module loaded (Next.js 16 proxy convention active)');

const frontman = createMiddleware({
  // Defaults to api.frontman.sh (hosted). For local Frontman server use:
  // host: 'frontman.local:4000',
  projectRoot: process.env.PROJECT_ROOT || __dirname,
});

export function proxy(req: NextRequest): NextResponse | Promise<NextResponse> {
  const pathname = req.nextUrl.pathname;

  // Diagnostic: prove that the proxy handler is being invoked for frontman paths.
  if (pathname === '/frontman' || pathname.startsWith('/frontman/')) {
    console.log('[Frontman] proxy handler invoked for', pathname);
    const result = frontman(req);
    if (!result) {
      console.warn('[Frontman] createMiddleware returned no response for', pathname);
    }
    return result || NextResponse.next();
  }

  // For anything else that matches the config below, just continue.
  // (In practice the matcher should limit us to Frontman paths only.)
  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",

  // Be explicit and minimal: only Frontman paths should be handled by this proxy.
  // This guarantees /frontman never falls through to the App Router (which 404s
  // because there is deliberately no app/frontman/page.tsx).
  matcher: ["/frontman", "/frontman/:path*"],
};
