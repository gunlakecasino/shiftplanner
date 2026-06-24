/** Operator-facing copy for PIN gate failures — no HTTP/debug leakage. */
export function humanizeLoginError(raw?: string, status?: number): string {
  const msg = (raw ?? "").trim().toLowerCase();

  if (status === 429 || msg.includes("too many")) {
    return "Too many attempts — wait a moment and try again.";
  }
  if (status === 403 || msg.includes("unavailable") || msg.includes("forbidden")) {
    return "This account isn't available right now. Contact your supervisor.";
  }
  if (status === 503 || msg.includes("session signing") || msg.includes("unavailable")) {
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