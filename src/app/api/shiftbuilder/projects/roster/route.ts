import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireTasksAccess } from "../_lib/requireTasksAccess.server";

/** GET /api/shiftbuilder/projects/roster — active TMs for the assignee picker. */
export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await requireTasksAccess(request, "view");
  if (!access.ok) return access.response;

  const { data, error } = await access.admin
    .from("tm_profiles")
    .select("tm_id, display_name, full_name")
    .eq("active", true)
    .order("display_name", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const roster = (data ?? []).map((r) => ({
    tmId: r.tm_id,
    name: r.display_name || r.full_name || r.tm_id,
  }));

  return NextResponse.json({ roster });
}
