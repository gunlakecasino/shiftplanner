// v1.0 Release-Ready — Final Debug Pass + Full Audit Trail — UI frozen June 24 2026
import { NextRequest, NextResponse } from "next/server";
import { handleNightLayerGet, type NightLayer } from "../_handlers/night";

export const dynamic = "force-dynamic";

/**
 * GET /api/shiftbuilder/night?date=YYYY-MM-DD&layer=core|secondary
 *
 * Canonical night data route (consolidates night-core + night-secondary).
 */
export async function GET(request: NextRequest) {
  const layerRaw = request.nextUrl.searchParams.get("layer") || "core";
  const layer: NightLayer = layerRaw === "secondary" ? "secondary" : "core";
  return handleNightLayerGet(request, layer);
}