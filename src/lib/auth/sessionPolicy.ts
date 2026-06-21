/** Shared ops session timing — idle sliding window + absolute cap. */

const DEFAULT_IDLE_MINUTES = 30;
const DEFAULT_ABSOLUTE_HOURS = 18;

function parsePositiveNumber(raw: string | undefined, fallback: number): number {
  const n = Number.parseFloat(String(raw ?? "").trim());
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Minutes of inactivity before the session expires (sliding). */
export function sessionIdleMinutes(): number {
  const secondsRaw = process.env.OPS_SESSION_IDLE_SECONDS;
  if (secondsRaw) {
    const sec = parsePositiveNumber(secondsRaw, 0);
    if (sec > 0) return sec / 60;
  }

  const raw =
    process.env.OPS_SESSION_IDLE_MINUTES ??
    process.env.NEXT_PUBLIC_OPS_SESSION_IDLE_MINUTES;
  return parsePositiveNumber(raw, DEFAULT_IDLE_MINUTES);
}

export function sessionIdleSec(): number {
  return Math.max(60, Math.round(sessionIdleMinutes() * 60));
}

export function sessionIdleMs(): number {
  return sessionIdleSec() * 1000;
}

/** Hard cap from first sign-in — session cannot extend beyond this. */
export function sessionAbsoluteMaxSec(): number {
  const hours = parsePositiveNumber(process.env.OPS_SESSION_ABSOLUTE_HOURS, DEFAULT_ABSOLUTE_HOURS);
  return hours * 60 * 60;
}