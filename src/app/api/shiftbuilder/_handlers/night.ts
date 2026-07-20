// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore } from "next/cache";
import { assertActorCanReadNight } from "@/lib/auth/assertNightEditable.server";
import { requireOpsSession } from "@/lib/auth/requireOpsSession.server";
import { opsLog } from "@/lib/opsLogger";
import { parseLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import {
  getNightCoreBundleForDate,
  isNightCoreAllowedForTodayPolicy,
} from "@/lib/shiftbuilder/nightCoreBundle.server";
import { buildNightSecondaryBundle } from "@/lib/shiftbuilder/nightSecondaryBundle.server";

export type NightLayer = "core" | "secondary";

export async function handleNightLayerGet(
  request: NextRequest,
  layer: NightLayer,
): Promise<NextResponse> {
  unstable_noStore();

  const session = await requireOpsSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const dateParam = request.nextUrl.searchParams.get("date");
  if (!dateParam) {
    return NextResponse.json({ error: "Missing ?date=YYYY-MM-DD" }, { status: 400 });
  }

  const parsed = parseLocalDateISO(dateParam);
  if (isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  try {
    const readCheck = await assertActorCanReadNight(session.actor.permissions, {
      date: dateParam,
    });
    if (!readCheck.ok) {
      return NextResponse.json({ error: readCheck.error }, { status: 403 });
    }

    if (layer === "core") {
      const policy = request.nextUrl.searchParams.get("policy");
      if (policy === "today") {
        const allowed = await isNightCoreAllowedForTodayPolicy(dateParam);
        if (!allowed) {
          return NextResponse.json(
            { error: "Schedule not available for this date" },
            { status: 403 },
          );
        }
      }
      const payload = await getNightCoreBundleForDate(dateParam);
      return NextResponse.json(payload, {
        headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
      });
    }

    // Fresh every request — tasks/notes/breaks must match the board after mutations.
    // (Previous unstable_cache(45s) could re-show pre-edit tasks after refresh/poll.)
    const payload = await buildNightSecondaryBundle(dateParam, {
      includeSideTasks: session.actor.permissions.canAccessTasks === true,
    });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
    });
  } catch (error) {
    opsLog(
      "shiftbuilder/night",
      "night_load_error",
      {
        layer,
        date: dateParam,
        message: error instanceof Error ? error.message : String(error),
      },
      "error",
    );
    return NextResponse.json(
      {
        error: layer === "core" ? "Failed to load night core bundle" : "Failed to load night secondary",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
