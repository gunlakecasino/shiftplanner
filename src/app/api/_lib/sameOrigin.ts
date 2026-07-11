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

function logAuthOrigin(
  event: "auth_origin_reject" | "auth_origin_relaxed_hit",
  request: NextRequest,
  secFetchSite: string | null,
) {
  console.warn(
    JSON.stringify(authOriginLogPayload(event, request, secFetchSite)),
  );
}

/**
 * Auth routes (/api/auth/*): require Origin/Referer host match or
 * Sec-Fetch-Site same-origin/same-site in production.
 *
 * Bare application/json + Host bypass removed (KD-8).
 *
 * Rules (production):
 * 1. If Origin or Referer is present → host must match; mismatch fails closed
 *    (no Sec-Fetch fallthrough).
 * 2. Else if Host is present and sec-fetch-site is same-origin/same-site → allow.
 * 3. Else if AUTH_RELAXED_ORIGIN=1 and Host is set and Origin/Referer/Sec-Fetch
 *    are all missing → emergency allow (WebView break-glass only; remove after soak).
 * 4. Else reject with structured warn log.
 *
 * Dev remains permissive.
 */
export function isAuthApiRequest(request: NextRequest): boolean {
  if (process.env.NODE_ENV !== "production") return true;

  const host = request.headers.get("host");
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const secFetchSite = request.headers.get("sec-fetch-site");

  // Explicit Origin/Referer: host must match. Do not consult Sec-Fetch on mismatch.
  if (origin || referer) {
    if (hostsMatch(request)) return true;
    logAuthOrigin("auth_origin_reject", request, secFetchSite);
    return false;
  }

  // No Origin/Referer: Sec-Fetch only when Host is present (matches ops path).
  if (
    host &&
    (secFetchSite === "same-origin" || secFetchSite === "same-site")
  ) {
    return true;
  }

  // Emergency break-glass: WebViews that omit Origin/Referer/Sec-Fetch-Site entirely.
  // Does not re-open cross-site traffic (mismatched Origin or cross-site Sec-Fetch).
  if (
    process.env.AUTH_RELAXED_ORIGIN === "1" &&
    host &&
    !origin &&
    !referer &&
    !secFetchSite
  ) {
    logAuthOrigin("auth_origin_relaxed_hit", request, secFetchSite);
    return true;
  }

  logAuthOrigin("auth_origin_reject", request, secFetchSite);
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
