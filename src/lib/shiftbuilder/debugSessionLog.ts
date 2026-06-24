/** Dev-only NDJSON logging for debug sessions (writes via /api/debug-ingest).
 *  Completely disabled in production to avoid noisy 404s on the endpoint.
 */
export function debugSessionLog(payload: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV === 'production') return; // Silent in prod
  const body = JSON.stringify({ sessionId: "a52e65", timestamp: Date.now(), ...payload });
  fetch("/api/debug-ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a52e65" },
    body,
  }).catch(() => {});
}


