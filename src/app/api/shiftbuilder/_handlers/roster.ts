// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, unstable_noStore } from "next/cache";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { requireOpsSession } from "@/lib/auth/requireOpsSession.server";
import { opsLog } from "@/lib/opsLogger";
import { formatLocalDateISO, parseLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import { getScheduledTmsFromGravesDefault } from "@/lib/shiftbuilder/gravesDefaultSchedule";

async function resolveNightId(
  nightDate: Date,
  nightIdParam: string | null,
): Promise<string | null> {
  if (nightIdParam) return nightIdParam;

  const supabase = createAdminClientSafe();
  if (!supabase) return null;

  const iso = formatLocalDateISO(nightDate);
  const { data } = await supabase
    .from("nights")
    .select("id")
    .eq("night_date", iso)
    .maybeSingle();
  return data?.id ?? null;
}

async function loadScheduledRoster(dateParam: string, nightId: string | null) {
  const nightDate = parseLocalDateISO(dateParam);
  return getScheduledTmsFromGravesDefault(nightDate, nightId);
}

/** Canonical scheduled roster handler (graves_default_schedule + night_on_call). */
export async function handleScheduledRosterGet(request: NextRequest): Promise<NextResponse> {
  const session = await requireOpsSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

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

  const nightId = await resolveNightId(nightDate, nightIdParam);
  const cacheKey = nightId ?? "auto";

  unstable_noStore();

  try {
    const cachedLoad = unstable_cache(
      () => loadScheduledRoster(dateParam, nightId),
      ["scheduled-roster", dateParam, cacheKey],
      { revalidate: 60, tags: ["scheduled-roster", "graves-default", `night-${dateParam}`] },
    );

    const result = await cachedLoad();

    if (!result.allScheduled?.length) {
      opsLog(
        "shiftbuilder/roster",
        "empty_roster",
        { date: dateParam },
        "warn",
      );
    }

    const body = {
      date: dateParam,
      nightId,
      allScheduled: result.allScheduled,
      fullGraveScheduled: result.fullGraveScheduled,
      pmOverlapScheduled: result.pmOverlapScheduled,
      amOverlapScheduled: result.amOverlapScheduled,
      scheduledWithRoles: result.scheduledWithRoles,
    };

    return NextResponse.json(body, {
      headers: { "Cache-Control": "private, no-cache, no-store, must-revalidate" },
    });
  } catch (error) {
    opsLog(
      "shiftbuilder/roster",
      "night_load_error",
      { date: dateParam, message: error instanceof Error ? error.message : String(error) },
      "error",
    );
    return NextResponse.json(
      {
        error: "Failed to load scheduled roster",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}