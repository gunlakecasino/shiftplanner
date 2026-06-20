import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { readSessionUserId } from "@/lib/auth/opsSession.server";
import { loadOpsUserById, userForClientResponse } from "@/lib/auth/opsUser.server";

/** GET /api/auth/session — hydrate operator from httpOnly cookie + fresh DB row. */
export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = readSessionUserId(request);
  if (!userId) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const user = await loadOpsUserById(userId);
  if (!user || user.must_change_pin) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: userForClientResponse(user),
  });
}