// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
/**
 * Frontman + OpenTelemetry instrumentation (dev-only)
 *
 * Gives Frontman deep visibility into:
 * - HTTP requests / API routes
 * - Page / Server Component render timing
 * - Early lifecycle logs (startup, config, middleware)
 *
 * This is gold for UI/UX work on the heavy client surfaces (ShiftBuilderClient monolith,
 * PlacementPad with its many effects + xAI calls, liveCache + realtime, dnd-kit pendingDrag,
 * equalize observers, portal positioning, week health computations, print dual mode, etc.).
 *
 * Zero production impact. The middleware already gates Frontman to dev.
 *
 * See: https://frontman.sh/docs/integrations/nextjs/
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // @ts-expect-error - @frontman-ai/nextjs Instrumentation export lacks types in 0.6.x (young package). Safe in dev-only path.
    const { setup } = await import("@frontman-ai/nextjs/Instrumentation");
    setup();
  }
}
