// @ts-nocheck
import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthApiRequest } from "./sameOrigin";

type HeaderMap = Record<string, string | undefined>;

function mockRequest(headers: HeaderMap, method = "POST") {
  return {
    method,
    headers: {
      get(name: string) {
        const key = name.toLowerCase();
        for (const [k, v] of Object.entries(headers)) {
          if (k.toLowerCase() === key) return v ?? null;
        }
        return null;
      },
    },
  } as any;
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

  it("allows sec-fetch-site same-origin / same-site", () => {
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

  it("AUTH_RELAXED_ORIGIN=1 restores Host-only accept and logs", () => {
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
    expect(warn).toHaveBeenCalled();
    const payload = JSON.parse(String(warn.mock.calls[0][0]));
    expect(payload.event).toBe("auth_origin_relaxed_hit");
  });
});
