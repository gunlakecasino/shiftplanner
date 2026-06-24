/** Operator-facing copy for PIN gate failures — no HTTP/debug leakage. */

export type LoginErrorDetails = {
  retryAfterSec?: number;
  requiresAdminContact?: boolean;
  failedAttempts?: number;
};

export function formatLockoutWait(retryAfterSec: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterSec));
  if (seconds >= 60) {
    const minutes = Math.ceil(seconds / 60);
    return minutes === 1
      ? "Too many incorrect attempts. Try again in 1 minute."
      : `Too many incorrect attempts. Try again in ${minutes} minutes.`;
  }
  return `Too many incorrect attempts. Try again in ${seconds} second${seconds === 1 ? "" : "s"}.`;
}

export function humanizeLoginError(
  raw?: string,
  status?: number,
  details?: LoginErrorDetails,
): string {
  const msg = (raw ?? "").trim().toLowerCase();

  if (
    details?.requiresAdminContact ||
    (details?.failedAttempts !== undefined && details.failedAttempts >= 8) ||
    msg.includes("account_locked_admin")
  ) {
    return "This account is locked. Contact an administrator.";
  }

  if (
    (status === 403 || msg.includes("account_locked")) &&
    typeof details?.retryAfterSec === "number" &&
    details.retryAfterSec > 0
  ) {
    return formatLockoutWait(details.retryAfterSec);
  }

  if (status === 429 || msg.includes("too many")) {
    return "Too many attempts — wait a moment and try again.";
  }
  if (status === 403 || msg.includes("unavailable") || msg.includes("forbidden")) {
    return "This account isn't available right now. Contact an administrator.";
  }
  if (status === 503 || msg.includes("session signing")) {
    return "Sign-in is temporarily unavailable. Try again shortly.";
  }
  if (msg.includes("network") || msg.includes("failed to reach")) {
    return "Can't reach the server. Check your connection and try again.";
  }
  if (msg.includes("pin must") || msg.includes("6 digit")) {
    return "Enter a 6-digit PIN.";
  }
  if (status === 401 || msg.includes("invalid") || msg.includes("credentials")) {
    return "Incorrect PIN. Try again.";
  }

  return "Sign-in didn't work. Try again.";
}