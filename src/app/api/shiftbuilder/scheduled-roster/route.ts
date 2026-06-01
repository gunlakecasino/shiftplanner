import { NextRequest, NextResponse } from "next/server";
import { getScheduledTmsForNight } from "@/lib/shiftbuilder/schedules";

/**
 * GET /api/shiftbuilder/scheduled-roster?date=YYYY-MM-DD
 *
 * **Canonical scheduled roster endpoint** — the single source of truth for
 * "who is scheduled tonight" in the entire ShiftBuilder + Sudo system.
 *
 * This endpoint (and the underlying `getScheduledTmsForNight` function) must be
 * used by the TM Picker, Roster Rail, eligibility logic, and any future features
 * that need to know which TMs are working on a given night.
 *
 * It uses the exact same resolution logic trusted by the Sudo Weekly Roster tab.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");

  if (!dateParam) {
    return NextResponse.json({ error: "Missing ?date=YYYY-MM-DD" }, { status: 400 });
  }

  const nightDate = new Date(dateParam + "T12:00:00");
  if (isNaN(nightDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  try {
    const result = await getScheduledTmsForNight(nightDate);

    return NextResponse.json({
      date: dateParam,
      allScheduled: result.allScheduled,
      fullGraveScheduled: result.fullGraveScheduled,
      pmOverlapScheduled: result.pmOverlapScheduled,
      amOverlapScheduled: result.amOverlapScheduled,
      scheduledWithRoles: result.scheduledWithRoles,
    });
  } catch (error) {
    console.error("[scheduled-roster] Error:", error);
    return NextResponse.json(
      { error: "Failed to compute canonical scheduled roster" },
      { status: 500 }
    );
  }
}