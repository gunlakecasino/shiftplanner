import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireOpsPermission } from "@/lib/auth/requireOpsSession.server";
import {
  addGravesDefaultScheduleMember,
  getGravesDefaultScheduleGrid,
  removeGravesDefaultScheduleMember,
  upsertGravesDefaultScheduleRows,
  normalizeDaysMap,
  type GravesBand,
} from "@/lib/shiftbuilder/gravesDefaultSchedule";

const BANDS: GravesBand[] = ["grave", "am_overlap", "pm_overlap"];

function parseBand(raw: unknown): GravesBand | null {
  return typeof raw === "string" && BANDS.includes(raw as GravesBand)
    ? (raw as GravesBand)
    : null;
}

export async function GET() {
  try {
    const grid = await getGravesDefaultScheduleGrid();
    return NextResponse.json(grid);
  } catch (error) {
    console.error("[graves-default-schedule] GET", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load grid" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await requireOpsPermission(request, "canApplySchedules");
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  try {
    const body = await request.json();
    const updates = Array.isArray(body?.updates) ? body.updates : [];
    const parsed = updates.map((u: { tmId: string; band: GravesBand; days: unknown }) => ({
      tmId: u.tmId,
      band: u.band,
      days: normalizeDaysMap(u.days),
    }));
    await upsertGravesDefaultScheduleRows(parsed);
    return NextResponse.json({ ok: true, count: parsed.length });
  } catch (error) {
    console.error("[graves-default-schedule] PUT", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await requireOpsPermission(request, "canApplySchedules");
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  try {
    const body = await request.json();
    const tmId = typeof body?.tmId === "string" ? body.tmId : "";
    const band = parseBand(body?.band);
    if (!tmId || !band) {
      return NextResponse.json({ error: "tmId and band are required" }, { status: 400 });
    }
    await addGravesDefaultScheduleMember(tmId, band);
    const grid = await getGravesDefaultScheduleGrid();
    return NextResponse.json({ ok: true, ...grid });
  } catch (error) {
    console.error("[graves-default-schedule] POST", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add TM" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await requireOpsPermission(request, "canApplySchedules");
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const tmId = searchParams.get("tmId") || "";
    const band = parseBand(searchParams.get("band"));
    if (!tmId || !band) {
      return NextResponse.json({ error: "tmId and band query params required" }, { status: 400 });
    }
    await removeGravesDefaultScheduleMember(tmId, band);
    const grid = await getGravesDefaultScheduleGrid();
    return NextResponse.json({ ok: true, ...grid });
  } catch (error) {
    console.error("[graves-default-schedule] DELETE", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove TM" },
      { status: 500 },
    );
  }
}