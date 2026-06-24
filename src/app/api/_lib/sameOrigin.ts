import type { NextRequest } from "next/server";

function hostsMatch(request: NextRequest): boolean {
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

/**
 * Auth routes (/api/auth/*): PIN gate fetch on some mobile browsers omits
 * Origin/Referer but is still a same-tab JSON POST to our host.
 */
export function isAuthApiRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (hostsMatch(request)) return true;

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin" || secFetchSite === "same-site") {
    return true;
  }

  if (request.method === "POST") {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json") && request.headers.get("host")) {
      return true;
    }
  }

  return false;
}

/** Reject obvious cross-origin fetches of internal ops APIs in production. */
export function isSameOriginOpsRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return true;

  if (request.nextUrl.pathname.startsWith("/api/auth/")) {
    return isAuthApiRequest(request);
  }

  const host = request.headers.get("host");
  if (!host) return false;

  if (hostsMatch(request)) return true;

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin" || secFetchSite === "same-site") {
    return true;
  }

  return false;
}