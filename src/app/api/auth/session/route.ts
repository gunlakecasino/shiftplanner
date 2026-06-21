import { NextRequest, NextResponse } from "next/server";
import { readSessionUserId, refreshSessionCookie } from "@/lib/auth/opsSession.server";
import { sessionIdleMinutes } from "@/lib/auth/sessionPolicy";
import { loadOpsUserById, userForClientResponse } from "@/lib/auth/opsUser.server";

/** GET /api/auth/session — hydrate operator from httpOnly cookie + fresh DB row. */
export async function GET(request: NextRequest) {
  const userId = readSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const user = await loadOpsUserById(userId);
  if (!user || user.must_change_pin) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const response = NextResponse.json({
    authenticated: true,
    user: userForClientResponse(user),
    idleTimeoutMinutes: sessionIdleMinutes(),
  });

  refreshSessionCookie(request, response);
  return response;
}