import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, unstable_noStore } from "next/cache";
import { parseLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import { buildNightSecondaryBundle } from "@/lib/shiftbuilder/nightSecondaryBundle.server";

/**
 * GET /api/shiftbuilder/night-secondary?date=YYYY-MM-DD
 *
 * Deferred builder data — tasks, breaks, borders, notes, zone rotation history.
 * Fully server-side; zero client Supabase on the happy path.
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
    const cached = unstable_cache(
      () => buildNightSecondaryBundle(dateParam),
      ["shiftbuilder-night-secondary", dateParam],
      { revalidate: 45, tags: ["night-secondary", `night-${dateParam}`] },
    );

    const payload = await cached();

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    console.error("[night-secondary] Error:", error);
    return NextResponse.json({ error: "Failed to load night secondary" }, { status: 500 });
  }
}