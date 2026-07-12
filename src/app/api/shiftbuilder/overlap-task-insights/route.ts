import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireOpsSession } from "@/lib/auth/requireOpsSession.server";
import { getOverlapTaskInsightsServer } from "@/lib/shiftbuilder/overlapTaskInsights.server";
import type { OverlapTonightChip } from "@/lib/shiftbuilder/rotation/buildOverlapTaskInsight";

/**
 * POST /api/shiftbuilder/overlap-task-insights
 * Body: { slotKey?, band?, nightDate, tmId?, tonightChips?, windowNights? }
 * Returns OverlapTaskInsightModel for PlacementPad OL mode (Phase C).
 */
export async function POST(req: NextRequest) {
  if (!isSameOriginOpsRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await requireOpsSession(req);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  try {
    const body = await req.json();
    const nightDate = String(body?.nightDate ?? "").slice(0, 10);
    if (!nightDate) {
      return NextResponse.json({ error: "nightDate is required" }, { status: 400 });
    }

    const tonightChips: OverlapTonightChip[] = Array.isArray(body?.tonightChips)
      ? (body.tonightChips as OverlapTonightChip[])
      : [];

    const insight = await getOverlapTaskInsightsServer({
      slotKey: body?.slotKey != null ? String(body.slotKey) : undefined,
      band:
        body?.band === "AM" || body?.band === "PM"
          ? body.band
          : undefined,
      nightDate,
      nightId: body?.nightId != null ? String(body.nightId) : null,
      tmId: body?.tmId != null ? String(body.tmId) : null,
      tonightChips,
      windowNights:
        typeof body?.windowNights === "number" ? body.windowNights : undefined,
    });

    return NextResponse.json({ insight });
  } catch (err) {
    console.error("[api/overlap-task-insights]", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
