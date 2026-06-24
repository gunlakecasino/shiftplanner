import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import {
  attachSessionCookie,
  createPinChangeToken,
} from "@/lib/auth/opsSession.server";
import { userForClientResponse, loadOpsUserById } from "@/lib/auth/opsUser.server";

function edgeVerifyPinUrl(): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return "https://iazgrcainbokkdqunkok.functions.supabase.co/verify-pin";
  }
  try {
    const u = new URL(supabaseUrl);
    return `${u.protocol}//${u.host.replace(".supabase.co", ".functions.supabase.co")}/verify-pin`;
  } catch {
    return "https://iazgrcainbokkdqunkok.functions.supabase.co/verify-pin";
  }
}

/**
 * POST /api/auth/verify-pin — PIN login with httpOnly session cookie.
 * Proxies to the Supabase edge function, then issues signed server session.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = clientIpFromRequest(request);
  const rateCheck = checkOpsApiRateLimit(`verify-pin:${ip}`, 12);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Too many PIN attempts — try again shortly" },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSec) } },
    );
  }

  let body: { pin?: string; lastUserId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pin = body.pin?.trim();
  if (!pin || !/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be exactly 6 digits" }, { status: 400 });
  }

  const lastUserId =
    typeof body.lastUserId === "string" && body.lastUserId.trim()
      ? body.lastUserId.trim()
      : undefined;

  const edgeRes = await fetch(edgeVerifyPinUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin, lastUserId }),
  });

  const edgeJson = await edgeRes.json().catch(() => ({}));

  if (!edgeRes.ok || !edgeJson.success || !edgeJson.user?.id) {
    const status =
      edgeRes.status === 429 ? 429 : edgeRes.status === 403 ? 403 : 401;
    return NextResponse.json(
      {
        error: edgeJson.error || "Invalid credentials",
        retryAfterSec: edgeJson.retryAfterSec,
        requiresAdminContact: edgeJson.requiresAdminContact,
        failedAttempts: edgeJson.failedAttempts,
      },
      {
        status,
        ...(edgeJson.retryAfterSec
          ? { headers: { "Retry-After": String(edgeJson.retryAfterSec) } }
          : {}),
      },
    );
  }

  const client = createAdminClientSafe();
  if (client) {
    await client.rpc("reset_pin_attempts", { p_user_id: edgeJson.user.id });
  }

  const freshUser = await loadOpsUserById(edgeJson.user.id);
  if (!freshUser) {
    return NextResponse.json({ error: "Account unavailable" }, { status: 403 });
  }

  const requiresPinChange = !!freshUser.must_change_pin;
  const pinChangeToken = requiresPinChange ? createPinChangeToken(freshUser.id) : null;

  if (requiresPinChange && !pinChangeToken) {
    return NextResponse.json({ error: "Server session signing unavailable" }, { status: 503 });
  }

  const response = NextResponse.json({
    success: true,
    user: userForClientResponse(freshUser),
    requiresPinChange,
    pinChangeToken: requiresPinChange ? pinChangeToken : undefined,
  });

  if (!requiresPinChange && !attachSessionCookie(response, freshUser.id)) {
    console.error(
      "[verify-pin] Session cookie not attached — set OPS_SESSION_SECRET or SUPABASE_SERVICE_ROLE_KEY on the server",
    );
    return NextResponse.json(
      {
        error:
          "Server session signing unavailable — set OPS_SESSION_SECRET (or SUPABASE_SERVICE_ROLE_KEY) on Railway",
      },
      { status: 503 },
    );
  }

  return response;
}