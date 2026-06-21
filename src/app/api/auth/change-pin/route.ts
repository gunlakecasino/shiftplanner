import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import {
  attachSessionCookie,
  verifyPinChangeToken,
} from "@/lib/auth/opsSession.server";
import { pinPolicyError } from "@/lib/auth/pinPolicy";
import { loadOpsUserById, userForClientResponse } from "@/lib/auth/opsUser.server";

/**
 * POST /api/auth/change-pin
 * Body: { pinChangeToken, userId, currentPin, newPin }
 *
 * Requires a signed pinChangeToken from /api/auth/verify-pin (proves temp PIN auth).
 * Does NOT accept bare userId without token — blocks account takeover.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rateKey = `change-pin:${clientIpFromRequest(request)}`;
  const rateCheck = checkOpsApiRateLimit(rateKey, 15);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Too many attempts — try again shortly" },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSec) } },
    );
  }

  let body: {
    userId?: string;
    currentPin?: string;
    newPin?: string;
    pinChangeToken?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const currentPin = body.currentPin?.trim();
  const newPin = body.newPin?.trim();
  const pinChangeToken = body.pinChangeToken?.trim();

  if (!userId || !currentPin || !newPin || !pinChangeToken) {
    return NextResponse.json(
      { error: "pinChangeToken, userId, currentPin, and newPin are required" },
      { status: 400 },
    );
  }

  if (!verifyPinChangeToken(pinChangeToken, userId)) {
    return NextResponse.json(
      { error: "PIN change authorization expired — sign in with your temporary PIN again" },
      { status: 401 },
    );
  }

  const pinErr = pinPolicyError(newPin);
  if (pinErr) {
    return NextResponse.json({ error: pinErr }, { status: 400 });
  }

  if (currentPin === newPin) {
    return NextResponse.json(
      { error: "New PIN must be different from your temporary PIN" },
      { status: 400 },
    );
  }

  const client = createAdminClientSafe();
  if (!client) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { error: changeErr } = await client.rpc("change_user_pin", {
    p_user_id: userId,
    p_current_pin: currentPin,
    p_new_pin: newPin,
    p_require_must_change: true,
  });

  if (changeErr) {
    const msg = changeErr.message || "PIN change failed";
    if (msg.toLowerCase().includes("incorrect")) {
      await client.rpc("record_failed_pin_attempt", { p_user_id: userId });
    }
    const status = msg.toLowerCase().includes("incorrect") ? 401 : 400;
    return NextResponse.json({ error: msg }, { status });
  }

  await client.rpc("reset_pin_attempts", { p_user_id: userId });

  const freshUser = await loadOpsUserById(userId);
  if (!freshUser) {
    return NextResponse.json({ error: "PIN updated but profile reload failed" }, { status: 500 });
  }

  const response = NextResponse.json({
    success: true,
    user: userForClientResponse(freshUser),
  });

  if (!attachSessionCookie(response, userId)) {
    return NextResponse.json({ error: "Server session signing unavailable" }, { status: 503 });
  }
  return response;
}