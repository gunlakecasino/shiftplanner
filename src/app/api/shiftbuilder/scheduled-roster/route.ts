// v1.0 Release-Ready — Final Debug Pass + Full Audit Trail — UI frozen June 24 2026
import { NextRequest } from "next/server";
import { handleScheduledRosterGet } from "../_handlers/roster";

export const dynamic = "force-dynamic";

/** @deprecated Alias — prefer GET /api/shiftbuilder/roster */
export async function GET(request: NextRequest) {
  return handleScheduledRosterGet(request);
}