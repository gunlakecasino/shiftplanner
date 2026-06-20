// supabase/functions/verify-pin/index.ts
// Minimal, secure 6-digit PIN-only verifier for GRAVE Ops ShiftBuilder.
// The PIN itself identifies the operator (no username/email selection in the UI).
//
// Uses the existing public.users table + bcrypt pin_hash.
// Called from the Next.js /api/auth/verify-pin proxy. Never trusts client for auth decisions.
// Returns only the safe operator profile on success (no hash ever leaves the function).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import _bcrypt from "https://esm.sh/bcryptjs@2.4.3";
const bcrypt = _bcrypt.default || _bcrypt;

const DEFAULT_ALLOWED_ORIGINS = [
  "https://zds.glcrops.cloud",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function allowedOrigins(): string[] {
  const raw = Deno.env.get("OPS_ALLOWED_ORIGINS") ?? Deno.env.get("OPS_ALLOWED_ORIGIN") ?? "";
  const fromEnv = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_ALLOWED_ORIGINS;
}

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowed = allowedOrigins();
  const allowOrigin =
    origin && allowed.includes(origin) ? origin : allowed[0] ?? "https://zds.glcrops.cloud";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const RATE_WINDOW_MS = 60_000;
const RATE_MAX_ATTEMPTS = 12;
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

function checkPinRateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= RATE_MAX_ATTEMPTS) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { ok: true };
}

function isTempPinExpired(pinIssuedAt: string | null, mustChangePin: boolean): boolean {
  if (!mustChangePin || !pinIssuedAt) return false;
  const issued = new Date(pinIssuedAt).getTime();
  return !Number.isNaN(issued) && issued < Date.now() - 72 * 60 * 60 * 1000;
}

function isAccountLocked(lockedUntil: string | null): boolean {
  if (!lockedUntil) return false;
  const locked = new Date(lockedUntil).getTime();
  return !Number.isNaN(locked) && locked > Date.now();
}

serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rateCheck = checkPinRateLimit(clientIp(req));
  if (!rateCheck.ok) {
    return new Response(JSON.stringify({ error: "Too many PIN attempts — try again shortly" }), {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(rateCheck.retryAfterSec),
      },
    });
  }

  try {
    const { pin } = await req.json();

    if (!pin || typeof pin !== "string" || pin.length !== 6 || !/^\d{6}$/.test(pin)) {
      return new Response(JSON.stringify({ error: "Invalid PIN format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: candidates, error: lookupErr } = await supabase
      .from("users")
      .select(
        "id, email, full_name, username, role, is_active, pin_hash, permissions, must_change_pin, pin_issued_at, locked_until",
      )
      .eq("is_active", true)
      .not("pin_hash", "is", null);

    if (lookupErr || !candidates || candidates.length === 0) {
      await bcrypt.compare("000000", "$2a$12$dummyhashforsecuritytimingonlynotreal");
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let matchedUser: any = null;
    let pinMatchedBlockedUserId: string | null = null;
    const normalizeBcrypt = (h: string) => h.replace(/^\$2a\$/, "$2b$");

    for (const u of candidates) {
      if (isTempPinExpired(u.pin_issued_at, Boolean(u.must_change_pin))) {
        continue;
      }

      try {
        const hashToTest = normalizeBcrypt(u.pin_hash);
        const ok = await bcrypt.compare(pin, hashToTest);
        if (!ok) continue;

        if (isAccountLocked(u.locked_until)) {
          pinMatchedBlockedUserId = u.id;
          continue;
        }

        matchedUser = u;
        break;
      } catch (compareErr) {
        console.error(`[verify-pin] compare error for user ${u.username}:`, compareErr);
      }
    }

    if (!matchedUser) {
      if (pinMatchedBlockedUserId) {
        await supabase.rpc("record_failed_pin_attempt", { p_user_id: pinMatchedBlockedUserId });
      }
      return new Response(JSON.stringify({ error: "Invalid credentials" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[verify-pin] authenticated (${matchedUser.role})`);

    const safeUser = {
      id: matchedUser.id,
      email: matchedUser.email,
      full_name: matchedUser.full_name,
      username: matchedUser.username,
      role: matchedUser.role,
      permissions: matchedUser.permissions ?? null,
      must_change_pin: Boolean(matchedUser.must_change_pin),
    };

    return new Response(JSON.stringify({ success: true, user: safeUser }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[verify-pin] UNCAUGHT error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});