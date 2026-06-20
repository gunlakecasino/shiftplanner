import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest, NextResponse } from "next/server";

export const OPS_SESSION_COOKIE = "oms_ops_session";
const SESSION_MAX_AGE_SEC = 60 * 60 * 18; // 18h
const PIN_CHANGE_MAX_AGE_SEC = 15 * 60;

type TokenPayload = {
  typ: "session" | "pin_change";
  sub: string;
  exp: number;
  jti: string;
};

const usedPinChangeTokens = new Map<string, number>();

function sessionSecret(): string | null {
  const secret =
    process.env.OPS_SESSION_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return secret || null;
}

function b64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function b64urlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function signPayload(payload: Omit<TokenPayload, "exp" | "jti"> & { ttlSec: number }): string | null {
  const secret = sessionSecret();
  if (!secret) return null;

  const jti = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const body: TokenPayload = {
    typ: payload.typ,
    sub: payload.sub,
    jti,
    exp: Math.floor(Date.now() / 1000) + payload.ttlSec,
  };

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
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionToken(userId: string): string | null {
  return signPayload({ typ: "session", sub: userId, ttlSec: SESSION_MAX_AGE_SEC });
}

export function createPinChangeToken(userId: string): string | null {
  return signPayload({ typ: "pin_change", sub: userId, ttlSec: PIN_CHANGE_MAX_AGE_SEC });
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

  // Prune old entries
  if (usedPinChangeTokens.size > 500) {
    const cutoff = Date.now() - PIN_CHANGE_MAX_AGE_SEC * 1000;
    for (const [k, t] of usedPinChangeTokens) {
      if (t < cutoff) usedPinChangeTokens.delete(k);
    }
  }

  return true;
}

export function attachSessionCookie(response: NextResponse, userId: string): void {
  const token = createSessionToken(userId);
  if (!token) return;
  response.cookies.set(OPS_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
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