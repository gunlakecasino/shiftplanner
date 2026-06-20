import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireOpsSession } from "@/lib/auth/requireOpsSession.server";
import { getTmPlacementHistory } from "@/lib/shiftbuilder/data";

/** Batch placement history for rotation cross-checks on the placement pad. */
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
    const tmIds = Array.isArray(body?.tmIds) ? (body.tmIds as string[]) : [];
    const days = typeof body?.days === "number" ? body.days : 30;
    const unique = [...new Set(tmIds.filter((id) => typeof id === "string" && id.length > 0))].slice(
      0,
      24,
    );

    const entries = await Promise.all(
      unique.map(async (tmId) => {
        const h = await getTmPlacementHistory(tmId, days);
        return [tmId, h] as const;
      }),
    );

    const histories: Record<string, Awaited<ReturnType<typeof getTmPlacementHistory>>> = {};
    for (const [id, h] of entries) histories[id] = h;

    return NextResponse.json({ histories });
  } catch (err) {
    console.error("[api/placement-histories]", err);
    return NextResponse.json({ histories: {}, error: String(err) }, { status: 500 });
  }
}