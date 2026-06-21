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

  // Same-origin fetch() often omits Origin/Referer; Sec-Fetch-Site is reliable in modern browsers.
  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin" || secFetchSite === "same-site") {
    return true;
  }

  return false;
}