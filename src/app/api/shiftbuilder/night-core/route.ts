// v1.0 Release-Ready — Final Debug Pass + Full Audit Trail — UI frozen June 24 2026
import { NextRequest } from "next/server";
import { handleNightLayerGet } from "../_handlers/night";

export const dynamic = "force-dynamic";

/** @deprecated Alias — prefer GET /api/shiftbuilder/night?layer=core */
export async function GET(request: NextRequest) {
  return handleNightLayerGet(request, "core");
}