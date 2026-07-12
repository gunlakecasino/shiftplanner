// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
import { NextRequest, NextResponse } from "next/server";
import { requireOpsSession } from "@/lib/auth/requireOpsSession.server";
import {
  EngineConfigLoadError,
  getFullyResolvedEngineConfigServer,
} from "@/lib/shiftbuilder/engineConfig.server";

export const dynamic = "force-dynamic";

const READ_RESOURCES = new Set([
  "slot-defaults",
  "graves-schedule",
  "on-call",
  "engine",
]);

/**
 * GET /api/shiftbuilder/config?resource=slot-defaults|graves-schedule|on-call|engine
 *
 * Canonical read-only config route. `engine` is session-gated service-role only
 * (never browser anon REST to engine_* tables).
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
    case "engine": {
      const session = await requireOpsSession(request);
      if (!session.ok) {
        return NextResponse.json(
          { error: session.error },
          { status: session.status },
        );
      }
      try {
        const config = await getFullyResolvedEngineConfigServer();
        // Sets serialize; convert for JSON
        const payload = {
          ...config,
          // eligibilityRules / signalOverrides stay as plain arrays
        };
        return NextResponse.json(payload, {
          headers: {
            "Cache-Control": "private, no-cache, no-store, must-revalidate",
          },
        });
      } catch (e) {
        const msg =
          e instanceof EngineConfigLoadError
            ? e.message
            : e instanceof Error
              ? e.message
              : "Engine config unavailable";
        return NextResponse.json({ error: msg }, { status: 503 });
      }
    }
    default:
      return NextResponse.json({ error: "Unknown resource" }, { status: 400 });
  }
}