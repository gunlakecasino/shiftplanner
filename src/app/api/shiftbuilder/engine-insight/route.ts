import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireOpsPermission } from "@/lib/auth/requireOpsSession.server";
import {
  runPlacementPadAnalyst,
  runPlacementBasicsNarrative,
  type EngineInsightContext,
} from "@/lib/shiftbuilder/engineInsightForPlacement";

export async function POST(req: NextRequest) {
  if (!isSameOriginOpsRequest(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await requireOpsPermission(req, "canEditAssignments");
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  try {
    const body = await req.json();
    const ctx = body as EngineInsightContext;
    if (!ctx?.slotKey) {
      return NextResponse.json({ text: "Missing slotKey.", error: "bad_request" }, { status: 400 });
    }
    const result =
      ctx.mode === "basics" && ctx.rotationBasicsText
        ? await runPlacementBasicsNarrative({
            ...ctx,
            rotationBasicsText: ctx.rotationBasicsText,
          })
        : await runPlacementPadAnalyst(ctx);
    // Note: "light" / "headline" mode is handled inside runPlacementPadAnalyst (dispatches to runMagicOneLinerDetermination using grok fast).
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/engine-insight]", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        text: "Deeper insight unavailable right now. Use the rotation highlights and engine rationale above.",
        error: message,
      },
      { status: 500 },
    );
  }
}