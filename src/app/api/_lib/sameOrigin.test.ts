import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthApiRequest, isSameOriginOpsRequest } from "./sameOrigin";
import type { NextRequest } from "next/server";

type HeaderMap = Record<string, string | undefined>;

/** Minimal NextRequest-shaped stub for header/pathname checks. */
function mockRequest(
  headers: HeaderMap,
  options: { method?: string; pathname?: string } = {},
): NextRequest {
  const { method = "POST", pathname = "/api/auth/verify-pin" } = options;
  return {
    method,
    nextUrl: { pathname },
    headers: {
      get(name: string) {
        const key = name.toLowerCase();
        for (const [k, v] of Object.entries(headers)) {
          if (k.toLowerCase() === key) return v ?? null;
        }
        return null;
      },
    },
  } as unknown as NextRequest;
}

describe("isAuthApiRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("is permissive outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(isAuthApiRequest(mockRequest({}))).toBe(true);
  });

  it("allows Origin host match in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      isAuthApiRequest(
        mockRequest({
          host: "ops.example.com",
          origin: "https://ops.example.com",
        }),
      ),
    ).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("allows Referer host match when Origin is absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(
      isAuthApiRequest(
        mockRequest({
          host: "ops.example.com",
          referer: "https://ops.example.com/login",
        }),
      ),
    ).toBe(true);
  });

  it("allows sec-fetch-site same-origin / same-site when Host is present", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(
      isAuthApiRequest(
        mockRequest({
          host: "ops.example.com",
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).toBe(true);
    expect(
      isAuthApiRequest(
        mockRequest({
          host: "ops.example.com",
          "sec-fetch-site": "same-site",
        }),
      ),
    ).toBe(true);
  });

  it("rejects sec-fetch-site without Host", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      isAuthApiRequest(
        mockRequest({
          "sec-fetch-site": "same-origin",
        }),
      ),
    ).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("rejects bare JSON + Host without origin signals (removed bypass)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      isAuthApiRequest(
        mockRequest({
          host: "ops.example.com",
          "content-type": "application/json",
        }),
      ),
    ).toBe(false);
    expect(warn).toHaveBeenCalled();
    const payload = JSON.parse(String(warn.mock.calls[0][0]));
    expect(payload.event).toBe("auth_origin_reject");
  });

  it("rejects cross-origin Origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      isAuthApiRequest(
        mockRequest({
          host: "ops.example.com",
          origin: "https://evil.example",
        }),
      ),
    ).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("fails closed on mismatched Origin even with spoofed same-site Sec-Fetch", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      isAuthApiRequest(
        mockRequest({
          host: "ops.example.com",
          origin: "https://evil.example",
          "sec-fetch-site": "same-site",
        }),
      ),
    ).toBe(false);
    const payload = JSON.parse(String(warn.mock.calls[0][0]));
    expect(payload.event).toBe("auth_origin_reject");
  });

  it("rejects sec-fetch-site cross-site", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      isAuthApiRequest(
        mockRequest({
          host: "ops.example.com",
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("AUTH_RELAXED_ORIGIN=1 allows only when Origin/Referer/Sec-Fetch are all missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_RELAXED_ORIGIN", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      isAuthApiRequest(
        mockRequest({
          host: "ops.example.com",
          "content-type": "application/json",
        }),
      ),
    ).toBe(true);
    const payload = JSON.parse(String(warn.mock.calls[0][0]));
    expect(payload.event).toBe("auth_origin_relaxed_hit");
  });

  it("AUTH_RELAXED_ORIGIN=1 still rejects mismatched Origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_RELAXED_ORIGIN", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      isAuthApiRequest(
        mockRequest({
          host: "ops.example.com",
          origin: "https://evil.example",
        }),
      ),
    ).toBe(false);
    const payload = JSON.parse(String(warn.mock.calls[0][0]));
    expect(payload.event).toBe("auth_origin_reject");
  });

  it("AUTH_RELAXED_ORIGIN=1 still rejects when sec-fetch-site is present (e.g. cross-site)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_RELAXED_ORIGIN", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      isAuthApiRequest(
        mockRequest({
          host: "ops.example.com",
          "sec-fetch-site": "cross-site",
        }),
      ),
    ).toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it("AUTH_RELAXED_ORIGIN=1 rejects when Host is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_RELAXED_ORIGIN", "1");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(isAuthApiRequest(mockRequest({}))).toBe(false);
    expect(warn).toHaveBeenCalled();
  });
});

describe("isSameOriginOpsRequest auth routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("routes /api/auth/* through tightened isAuthApiRequest (bare JSON rejected)", () => {
    vi.stubEnv("NODE_ENV", "production");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      isSameOriginOpsRequest(
        mockRequest(
          {
            host: "ops.example.com",
            "content-type": "application/json",
          },
          { pathname: "/api/auth/verify-pin" },
        ),
      ),
    ).toBe(false);
    const payload = JSON.parse(String(warn.mock.calls[0][0]));
    expect(payload.event).toBe("auth_origin_reject");
  });

  it("allows /api/auth/* with matching Origin", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(
      isSameOriginOpsRequest(
        mockRequest(
          {
            host: "ops.example.com",
            origin: "https://ops.example.com",
          },
          { pathname: "/api/auth/logout" },
        ),
      ),
    ).toBe(true);
  });
});
