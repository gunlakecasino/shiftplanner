import { NextRequest, NextResponse } from "next/server";
import { unstable_noStore } from "next/cache";
import { requireOpsSession } from "@/lib/auth/requireOpsSession.server";
import { parseLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import { revalidateNightBoardCaches } from "@/lib/shiftbuilder/revalidateOpsCache";

export const dynamic = "force-dynamic";

/**
 * POST /api/shiftbuilder/refresh-day
 * Body: { date: "YYYY-MM-DD" }
 * Busts server edge caches for one grave night (schedule + assignments bundle).
 */
export async function POST(request: NextRequest) {
  unstable_noStore();

  const session = await requireOpsSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  let date: string | undefined;
  try {
    const body = (await request.json()) as { date?: string };
    date = body.date;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!date) {
    return NextResponse.json({ error: "Missing date" }, { status: 400 });
  }

  const parsed = parseLocalDateISO(date);
  if (isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  try {
    await revalidateNightBoardCaches(date);
    return NextResponse.json({ ok: true, date });
  } catch (error) {
    console.error("[refresh-day] failed", error);
    return NextResponse.json(
      { error: "Failed to refresh day caches" },
      { status: 500 },
    );
  }
}