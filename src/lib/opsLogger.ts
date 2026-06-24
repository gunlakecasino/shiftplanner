// v1.0 Release-Ready — Final Debug Pass + Full Audit Trail — UI frozen June 24 2026

export type OpsLogLevel = "debug" | "info" | "warn" | "error";

/** Production info events only — keeps Railway logs actionable without spam. */
const PROD_INFO_EVENTS = new Set([
  "audit_query",
  "audit_persist_failed",
  "auth_denied",
  "mutation_denied",
  "night_load_error",
  "session_invalid",
]);

export type OpsLogPayload = Record<string, unknown>;

/**
 * Structured ops logging.
 * - Dev: console.info/warn/error with full JSON object payload.
 * - Production: errors/warns always; info only for allowlisted operational events.
 */
export function opsLog(
  scope: string,
  event: string,
  payload: OpsLogPayload = {},
  level: OpsLogLevel = "info",
): void {
  const entry = {
    scope,
    event,
    ts: new Date().toISOString(),
    ...payload,
  };

  const isProd = process.env.NODE_ENV === "production";

  if (isProd) {
    if (level === "error") {
      console.error(`[${scope}] ${event}`, JSON.stringify(entry));
      return;
    }
    if (level === "warn") {
      console.warn(`[${scope}] ${event}`, JSON.stringify(entry));
      return;
    }
    if (level === "info" && PROD_INFO_EVENTS.has(event)) {
      console.info(`[${scope}] ${event}`, JSON.stringify(entry));
    }
    return;
  }

  if (level === "error") {
    console.error(`[${scope}] ${event}`, entry);
    return;
  }
  if (level === "warn") {
    console.warn(`[${scope}] ${event}`, entry);
    return;
  }
  console.info(`[${scope}] ${event}`, entry);
}