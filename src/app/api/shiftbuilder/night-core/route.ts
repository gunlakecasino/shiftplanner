import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore } from "next/cache";
import {
  getNightCoreBundleForDate,
  isNightCoreAllowedForTodayPolicy,
} from "@/lib/shiftbuilder/nightCoreBundle.server";
import { parseLocalDateISO } from "@/lib/shiftbuilder/dateUtils";

/**
 * GET /api/shiftbuilder/night-core?date=YYYY-MM-DD
 *
 * Single-hop builder critical path: night id + assignments + roster + schedule.
 * Runs parallel Supabase reads on the server (close to Postgres).
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  unstable_noStore();
  const dateParam = request.nextUrl.searchParams.get("date");

  if (!dateParam) {
    return NextResponse.json({ error: "Missing ?date=YYYY-MM-DD" }, { status: 400 });
  }

  const parsed = parseLocalDateISO(dateParam);
  if (isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  try {
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
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[night-core] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to load night core bundle",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}