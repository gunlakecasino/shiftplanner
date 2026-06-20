import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { clearSessionCookie, readSessionUserId } from "@/lib/auth/opsSession.server";

export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userId = readSessionUserId(request);
  const response = NextResponse.json({ success: true, userId: userId ?? null });
  clearSessionCookie(response);
  return response;
}