import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Railway health / production Frontman gate", () => {
  it("probes /api/health with a 120s timeout, not /", () => {
    const railway = source("railway.json");
    expect(railway).toContain('"healthcheckPath": "/api/health"');
    expect(railway).toContain('"healthcheckTimeout": 120');
    expect(railway).not.toContain('"healthcheckPath": "/"');
  });

  it("returns 200 text/plain ok with no redirect, auth, or Supabase", () => {
    const health = source("src/app/api/health/route.ts");
    expect(health).toContain('return healthOk("ok")');
    expect(health).toContain("text/plain");
    expect(health).not.toMatch(/from ["']next\/navigation["']/);
    expect(health).not.toContain("supabase");
    expect(health).not.toContain("readSessionUserId");
    expect(health).not.toContain("OpsAuthGate");
  });

  it("never statically imports or initializes Frontman in production proxy", () => {
    const proxy = source("proxy.ts");
    const instrumentation = source("instrumentation.ts");
    const pkg = JSON.parse(source("package.json")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.dependencies?.["@frontman-ai/nextjs"]).toBeUndefined();
    expect(pkg.devDependencies?.["@frontman-ai/nextjs"]).toBeTruthy();
    expect(proxy).not.toMatch(/^import .* from ["']@frontman-ai\/nextjs["']/m);
    expect(proxy).toContain('process.env.NODE_ENV === "production"');
    expect(proxy).toContain('import("@frontman-ai/nextjs")');
    expect(proxy.indexOf("const frontman = createMiddleware")).toBeGreaterThan(
      proxy.indexOf('NODE_ENV === "production"'),
    );
    expect(instrumentation).toContain('process.env.NODE_ENV === "production"');
    expect(instrumentation).toContain('import("@frontman-ai/nextjs/Instrumentation")');
  });

  it("keeps /api/health out of the Edge middleware matcher", () => {
    const middleware = source("src/middleware.ts");
    expect(middleware).toContain('url.pathname === "/api/health"');
    expect(middleware).toMatch(/\(\?!api/);
  });
});
