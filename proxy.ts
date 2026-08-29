// Frontman is a devDependency (@frontman-ai/nextjs). Next 16 loads this root
// proxy at boot. A module-scope import / createMiddleware() throws before
// `node server.js` binds PORT on Railway. Production must no-op and never
// load the Frontman module. Dev /frontman stays via a lazy import.
import { type NextRequest, NextResponse } from "next/server";

export const config = {
  runtime: "nodejs",
  matcher: ["/frontman", "/frontman/:path*"],
};

export async function proxy(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.next();
  }

  const pathname = req.nextUrl.pathname;
  if (pathname !== "/frontman" && !pathname.startsWith("/frontman/")) {
    return NextResponse.next();
  }

  const [{ createMiddleware }, path, { fileURLToPath }] = await Promise.all([
    // Lazy so the Frontman package is never evaluated on Railway.
    // @ts-expect-error — @frontman-ai/nextjs ships no types
    import("@frontman-ai/nextjs"),
    import("path"),
    import("url"),
  ]);

  const projectRoot =
    process.env.PROJECT_ROOT || path.dirname(fileURLToPath(import.meta.url));
  const frontman = createMiddleware({ projectRoot });
  const result = frontman(req);
  return (await Promise.resolve(result)) || NextResponse.next();
}
