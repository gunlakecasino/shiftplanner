// @ts-nocheck
/**
 * KD-2 session secret matrix — production fail-closed, PREV dual-verify, sign≠PREV.
 */
import { createHmac } from "crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import {
  OPS_SESSION_COOKIE,
  createSessionToken,
  readSessionUserId,
} from "./opsSession.server";

const PRIMARY = "primary-session-secret-at-least-32-chars!!";
const PREV = "previous-session-secret-at-least-32-chars!";
const SERVICE_ROLE = "service-role-key-must-not-sign-in-prod";

function snapshotEnv(keys: string[]) {
  const prev: Record<string, string | undefined> = {};
  for (const k of keys) prev[k] = process.env[k];
  return prev;
}

function restoreEnv(prev: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/** Minimal cookie jar — avoids constructing a full NextRequest in unit tests. */
function requestWithSession(token: string): NextRequest {
  return {
    cookies: {
      get(name: string) {
        if (name === OPS_SESSION_COOKIE) return { name, value: token };
        return undefined;
      },
    },
  } as unknown as NextRequest;
}

/** Craft a token HMAC'd with an arbitrary secret (for PREV dual-verify cases). */
function forgeTokenWithSecret(userId: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    typ: "session",
    sub: userId,
    exp: now + 3600,
    abs: now + 3600 * 18,
    jti: `test-${now}`,
  };
  const encoded = Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

const ENV_KEYS = [
  "NODE_ENV",
  "OPS_SESSION_SECRET",
  "OPS_SESSION_SECRET_PREV",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
];

describe("opsSession.server KD-2 secret policy", () => {
  let envSnap: Record<string, string | undefined>;

  beforeEach(() => {
    envSnap = snapshotEnv(ENV_KEYS);
    delete process.env.OPS_SESSION_SECRET;
    delete process.env.OPS_SESSION_SECRET_PREV;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    restoreEnv(envSnap);
    vi.restoreAllMocks();
  });

  it("production + no OPS_SESSION_SECRET → createSessionToken null (ignores service-role)", () => {
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;

    expect(createSessionToken("user-1")).toBeNull();
  });

  it("production + no OPS_SESSION_SECRET → readSessionUserId null even with forged service-role cookie", () => {
    process.env.NODE_ENV = "production";
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
    const forged = forgeTokenWithSecret("user-1", SERVICE_ROLE);
    expect(readSessionUserId(requestWithSession(forged))).toBeNull();
  });

  it("production + primary only → sign and verify succeed", () => {
    process.env.NODE_ENV = "production";
    process.env.OPS_SESSION_SECRET = PRIMARY;

    const token = createSessionToken("user-1");
    expect(token).toBeTruthy();
    expect(readSessionUserId(requestWithSession(token!))).toBe("user-1");
  });

  it("token signed with PREV verifies when primary set and PREV distinct", () => {
    process.env.NODE_ENV = "production";
    process.env.OPS_SESSION_SECRET = PRIMARY;
    process.env.OPS_SESSION_SECRET_PREV = PREV;

    const prevToken = forgeTokenWithSecret("user-prev", PREV);
    expect(readSessionUserId(requestWithSession(prevToken))).toBe("user-prev");
  });

  it("token signed only with PREV fails when PREV unset", () => {
    process.env.NODE_ENV = "production";
    process.env.OPS_SESSION_SECRET = PRIMARY;
    // PREV not set

    const prevToken = forgeTokenWithSecret("user-prev", PREV);
    expect(readSessionUserId(requestWithSession(prevToken))).toBeNull();
  });

  it("PREV set but primary missing → fail closed (verify secrets empty)", () => {
    process.env.NODE_ENV = "production";
    delete process.env.OPS_SESSION_SECRET;
    process.env.OPS_SESSION_SECRET_PREV = PREV;
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;

    expect(createSessionToken("user-1")).toBeNull();
    const prevToken = forgeTokenWithSecret("user-prev", PREV);
    expect(readSessionUserId(requestWithSession(prevToken))).toBeNull();
  });

  it("sign uses primary only — new token HMAC matches primary, not PREV", () => {
    process.env.NODE_ENV = "production";
    process.env.OPS_SESSION_SECRET = PRIMARY;
    process.env.OPS_SESSION_SECRET_PREV = PREV;

    const token = createSessionToken("user-sign");
    expect(token).toBeTruthy();
    const [encoded, sig] = token!.split(".");
    const primarySig = createHmac("sha256", PRIMARY).update(encoded).digest("base64url");
    const prevSig = createHmac("sha256", PREV).update(encoded).digest("base64url");
    expect(sig).toBe(primarySig);
    expect(sig).not.toBe(prevSig);
  });

  it("dev may fall back to SUPABASE_SERVICE_ROLE_KEY (not NEXT_PUBLIC_)", () => {
    process.env.NODE_ENV = "development";
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY = "public-must-not-work";
    // no OPS_SESSION_SECRET, no server service role
    expect(createSessionToken("user-1")).toBeNull();

    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
    const token = createSessionToken("user-dev");
    expect(token).toBeTruthy();
    expect(readSessionUserId(requestWithSession(token!))).toBe("user-dev");
  });
});
