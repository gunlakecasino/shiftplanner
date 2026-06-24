// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
import { NextRequest } from "next/server";
import { handleScheduledRosterGet } from "../_handlers/roster";

export const dynamic = "force-dynamic";

/**
 * GET /api/shiftbuilder/roster?date=YYYY-MM-DD&night_id=optional
 *
 * Canonical scheduled roster route (alias of scheduled-roster).
 */
export async function GET(request: NextRequest) {
  return handleScheduledRosterGet(request);
}