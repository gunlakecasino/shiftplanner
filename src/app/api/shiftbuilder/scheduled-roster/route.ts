import { NextRequest, NextResponse } from "next/server";
import { getScheduledTmsFromGravesDefault } from "@/lib/shiftbuilder/gravesDefaultSchedule";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { formatLocalDateISO, parseLocalDateISO } from "@/lib/shiftbuilder/dateUtils";

/**
 * GET /api/shiftbuilder/scheduled-roster?date=YYYY-MM-DD&night_id=optional
 *
 * Canonical scheduled roster — reads graves_default_schedule + night_on_call only.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const dateParam = searchParams.get("date");
  const nightIdParam = searchParams.get("night_id");

  if (!dateParam) {
    return NextResponse.json({ error: "Missing ?date=YYYY-MM-DD" }, { status: 400 });
  }

  const nightDate = parseLocalDateISO(dateParam);
  if (isNaN(nightDate.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  let nightId = nightIdParam;
  if (!nightId) {
    const supabase = createAdminClientSafe();
    if (supabase) {
      const iso = formatLocalDateISO(nightDate);
      const { data } = await supabase
        .from("nights")
        .select("id")
        .eq("night_date", iso)
        .maybeSingle();
      nightId = data?.id ?? null;
    }
  }

  try {
    const result = await getScheduledTmsFromGravesDefault(nightDate, nightId);

    if (!result.allScheduled?.length) {
      console.warn("[scheduled-roster] Empty — run seed-graves-default-schedule or edit Graves Default Schedule page", {
        date: dateParam,
      });
    }

    return NextResponse.json({
      date: dateParam,
      nightId,
      allScheduled: result.allScheduled,
      fullGraveScheduled: result.fullGraveScheduled,
      pmOverlapScheduled: result.pmOverlapScheduled,
      amOverlapScheduled: result.amOverlapScheduled,
      scheduledWithRoles: result.scheduledWithRoles,
    });
  } catch (error) {
    console.error("[scheduled-roster] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to load scheduled roster",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}