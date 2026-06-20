import type { NextRequest } from "next/server";

/** Reject obvious cross-origin fetches of internal ops APIs in production. */
export function isSameOriginOpsRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return true;

  const host = request.headers.get("host");
  if (!host) return false;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  return false;
}