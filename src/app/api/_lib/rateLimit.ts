type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 120;

/** Default verify-pin attempts per IP per minute (KD-12 / D1). */
export const DEFAULT_VERIFY_PIN_PER_MIN = 8;

/** Default /api/complete requests per IP+user per minute (KD-12 / D2). */
export const DEFAULT_COMPLETE_PER_MIN = 30;

/**
 * Lightweight in-memory rate limiter for ops API spam protection.
 *
 * **Single-replica assumption:** counters live in a process-local `Map`.
 * They do **not** share across Railway replicas, multiple Node processes, or
 * redeploys. Keep the ShiftPlanner service at **one replica** until a durable
 * store (Redis/Upstash) is wired. Multi-instance deploys effectively multiply
 * the allowed rate by the number of processes.
 *
 * Window is a fixed 60s from the first request in each bucket key.
 */
export function checkOpsApiRateLimit(
  key: string,
  maxRequests = DEFAULT_MAX_REQUESTS,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }

  if (bucket.count >= maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return { ok: false, retryAfterSec };
  }

  bucket.count += 1;
  return { ok: true };
}

export function clientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Positive integer from env, or `fallback` when unset/invalid.
 * Used by PIN and complete endpoints for operator-tunable limits.
 */
export function rateLimitFromEnv(envName: string, fallback: number): number {
  const raw = process.env[envName]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return n;
}

/** `OPS_RATE_VERIFY_PIN_PER_MIN` (default 8). */
export function verifyPinRateLimitPerMin(): number {
  return rateLimitFromEnv("OPS_RATE_VERIFY_PIN_PER_MIN", DEFAULT_VERIFY_PIN_PER_MIN);
}

/** `OPS_RATE_COMPLETE_PER_MIN` (default 30). */
export function completeRateLimitPerMin(): number {
  return rateLimitFromEnv("OPS_RATE_COMPLETE_PER_MIN", DEFAULT_COMPLETE_PER_MIN);
}
