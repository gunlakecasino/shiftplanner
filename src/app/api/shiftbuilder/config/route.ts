// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const READ_RESOURCES = new Set(["slot-defaults", "graves-schedule", "on-call"]);

/**
 * GET /api/shiftbuilder/config?resource=slot-defaults|graves-schedule|on-call
 *
 * Canonical read-only config route (consolidates slot-defaults, graves-default-schedule GET, night-on-call GET).
 */
export async function GET(request: NextRequest) {
  const resource = request.nextUrl.searchParams.get("resource")?.trim();

  if (!resource || !READ_RESOURCES.has(resource)) {
    return NextResponse.json(
      {
        error: "Missing or invalid ?resource= parameter",
        allowed: [...READ_RESOURCES],
      },
      { status: 400 },
    );
  }

  switch (resource) {
    case "slot-defaults":
      return (await import("../slot-defaults/route")).GET(request);
    case "graves-schedule":
      return (await import("../graves-default-schedule/route")).GET(request);
    case "on-call":
      return (await import("../night-on-call/route")).GET(request);
    default:
      return NextResponse.json({ error: "Unknown resource" }, { status: 400 });
  }
}