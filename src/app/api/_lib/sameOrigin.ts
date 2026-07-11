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

function authOriginLogPayload(
  event: "auth_origin_reject" | "auth_origin_relaxed_hit",
  request: NextRequest,
  secFetchSite: string | null,
) {
  return {
    event,
    method: request.method,
    host: request.headers.get("host"),
    secFetchSite,
    hasOrigin: Boolean(request.headers.get("origin")),
    hasReferer: Boolean(request.headers.get("referer")),
  };
}

/**
 * Auth routes (/api/auth/*): require Origin/Referer host match or
 * Sec-Fetch-Site same-origin/same-site in production.
 *
 * Bare application/json + Host bypass removed (KD-8). When Origin/Referer
 * and Sec-Fetch-Site are all missing (some WebViews), reject unless
 * AUTH_RELAXED_ORIGIN=1 (emergency one-release escape).
 *
 * Dev remains permissive.
 */
export function isAuthApiRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  if (hostsMatch(request)) return true;

  const secFetchSite = request.headers.get("sec-fetch-site");
  if (secFetchSite === "same-origin" || secFetchSite === "same-site") {
    return true;
  }

  // Emergency break-glass only — restore Host-only accept for stuck WebViews.
  if (process.env.AUTH_RELAXED_ORIGIN === "1" && request.headers.get("host")) {
    console.warn(
      JSON.stringify(
        authOriginLogPayload("auth_origin_relaxed_hit", request, secFetchSite),
      ),
    );
    return true;
  }

  console.warn(
    JSON.stringify(
      authOriginLogPayload("auth_origin_reject", request, secFetchSite),
    ),
  );
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
