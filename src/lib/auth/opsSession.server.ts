// v1.0 Release-Ready — UI frozen June 24 2026
import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import {
  sessionAbsoluteMaxSec,
  sessionIdleSec,
} from "./sessionPolicy";

export const OPS_SESSION_COOKIE = "oms_ops_session";
const PIN_CHANGE_MAX_AGE_SEC = 15 * 60;

type TokenPayload = {
  typ: "session" | "pin_change";
  sub: string;
  /** Idle deadline (unix sec) — extended on activity while below abs. */
  exp: number;
  /** Absolute session cap (unix sec) — set once at login. */
  abs?: number;
  jti: string;
};

const usedPinChangeTokens = new Map<string, number>();

function sessionSecret(): string | null {
  const dedicated = process.env.OPS_SESSION_SECRET?.trim();
  if (dedicated) return dedicated;

  const fallback =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (process.env.NODE_ENV === "production") {
    if (fallback) {
      console.warn(
        "[opsSession] OPS_SESSION_SECRET missing — using SUPABASE_SERVICE_ROLE_KEY fallback. Set a dedicated OPS_SESSION_SECRET on Railway.",
      );
      return fallback;
    }
    console.error(
      "[opsSession] No session signing secret — set OPS_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY on Railway",
    );
    return null;
  }

  if (!fallback) {
    console.error(
      "[opsSession] No session signing secret in development — add OPS_SESSION_SECRET to .env.local (recommended) or SUPABASE_SERVICE_ROLE_KEY, then restart `pnpm dev`.",
    );
  }

  return fallback || null;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function signPayload(body: TokenPayload): string | null {
  const secret = sessionSecret();
  if (!secret) return null;

  const encoded = b64url(JSON.stringify(body));
  const sig = createHmac("sha256", secret).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function verifySignedToken(token: string): TokenPayload | null {
  const secret = sessionSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;

  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(b64urlDecode(encoded)) as TokenPayload;
    if (!payload?.sub || !payload?.exp || !payload?.typ || !payload?.jti) return null;
    const now = nowSec();
    if (payload.exp < now) return null;
    if (payload.typ === "session" && payload.abs != null && payload.abs < now) return null;
    return payload;
  } catch {
    return null;
  }
}

function newJti(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildSessionPayload(userId: string, abs?: number): TokenPayload | null {
  const now = nowSec();
  const absoluteCap = abs ?? now + sessionAbsoluteMaxSec();
  const idleDeadline = Math.min(now + sessionIdleSec(), absoluteCap);
  if (idleDeadline <= now) return null;

  return {
    typ: "session",
    sub: userId,
    exp: idleDeadline,
    abs: absoluteCap,
    jti: newJti(),
  };
}

function slideSessionPayload(existing: TokenPayload): TokenPayload | null {
  if (existing.typ !== "session") return null;

  const now = nowSec();
  const absoluteCap =
    existing.abs ??
    (existing.exp > now ? existing.exp : now + sessionAbsoluteMaxSec());

  if (absoluteCap < now) return null;

  const idleDeadline = Math.min(now + sessionIdleSec(), absoluteCap);
  if (idleDeadline <= now) return null;

  return {
    typ: "session",
    sub: existing.sub,
    exp: idleDeadline,
    abs: absoluteCap,
    jti: newJti(),
  };
}

export function createSessionToken(userId: string): string | null {
  const body = buildSessionPayload(userId);
  if (!body) return null;
  return signPayload(body);
}

export function createPinChangeToken(userId: string): string | null {
  const now = nowSec();
  const body: TokenPayload = {
    typ: "pin_change",
    sub: userId,
    jti: newJti(),
    exp: now + PIN_CHANGE_MAX_AGE_SEC,
  };
  return signPayload(body);
}

export function readSessionUserId(request: NextRequest): string | null {
  const token = request.cookies.get(OPS_SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = verifySignedToken(token);
  if (!payload || payload.typ !== "session") return null;
  return payload.sub;
}

export function verifyPinChangeToken(token: string, userId: string): boolean {
  const payload = verifySignedToken(token);
  if (!payload || payload.typ !== "pin_change" || payload.sub !== userId) return false;

  if (usedPinChangeTokens.has(payload.jti)) return false;
  usedPinChangeTokens.set(payload.jti, Date.now());

  if (usedPinChangeTokens.size > 500) {
    const cutoff = Date.now() - PIN_CHANGE_MAX_AGE_SEC * 1000;
    for (const [k, t] of usedPinChangeTokens) {
      if (t < cutoff) usedPinChangeTokens.delete(k);
    }
  }

  return true;
}

function writeSessionCookie(response: NextResponse, token: string): void {
  const payload = verifySignedToken(token);
  const now = nowSec();
  const maxAge = payload
    ? Math.max(60, (payload.exp ?? now + sessionIdleSec()) - now)
    : sessionIdleSec();

  response.cookies.set(OPS_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge,
  });
}

export function attachSessionCookie(response: NextResponse, userId: string): boolean {
  const token = createSessionToken(userId);
  if (!token) return false;
  writeSessionCookie(response, token);
  return true;
}

/** Extend idle deadline after confirmed activity (session GET, etc.). */
export function refreshSessionCookie(request: NextRequest, response: NextResponse): boolean {
  const token = request.cookies.get(OPS_SESSION_COOKIE)?.value;
  if (!token) return false;

  const payload = verifySignedToken(token);
  if (!payload || payload.typ !== "session") return false;

  const slid = slideSessionPayload(payload);
  if (!slid) return false;

  const nextToken = signPayload(slid);
  if (!nextToken) return false;

  writeSessionCookie(response, nextToken);
  return true;
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(OPS_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}