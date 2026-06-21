/** Shared ops session timing — idle sliding window + absolute cap. */

const DEFAULT_IDLE_MINUTES = 5;
const DEFAULT_ABSOLUTE_HOURS = 18;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const n = parseInt(String(raw ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Minutes of inactivity before the session expires (sliding). */
export function sessionIdleMinutes(): number {
  const raw =
    process.env.OPS_SESSION_IDLE_MINUTES ??
    process.env.NEXT_PUBLIC_OPS_SESSION_IDLE_MINUTES;
  return parsePositiveInt(raw, DEFAULT_IDLE_MINUTES);
}

export function sessionIdleSec(): number {
  return sessionIdleMinutes() * 60;
}

export function sessionIdleMs(): number {
  return sessionIdleSec() * 1000;
}

/** Hard cap from first sign-in — session cannot extend beyond this. */
export function sessionAbsoluteMaxSec(): number {
  const hours = parsePositiveInt(process.env.OPS_SESSION_ABSOLUTE_HOURS, DEFAULT_ABSOLUTE_HOURS);
  return hours * 60 * 60;
}