import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import { requireTasksAccess } from "../../_lib/requireTasksAccess.server";
import { rowToWorkItem, WORK_ITEM_COLUMNS } from "@/lib/tasks/mapping";
import { SHIFTBUILDER_DEPARTMENT } from "@/lib/shiftbuilder/tasksAdapter";

/**
 * GET /api/shiftbuilder/projects/requests/pending — the manager triage queue:
 * every pending request (tasks AND projects), any requester. Manage-gated. Approve
 * or reject each via POST /requests/[id]/decision.
 */
export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rate = checkOpsApiRateLimit(`projects-requests-pending:${clientIpFromRequest(request)}`);
  if (!rate.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } });
  }

  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;
  const { admin } = access;

  const { data, error } = await admin
    .from("ops_work_items")
    .select(WORK_ITEM_COLUMNS)
    .eq("department", SHIFTBUILDER_DEPARTMENT)
    .eq("approval_state", "pending")
    .eq("is_slot_default", false)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[projects/requests/pending] list error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: (data ?? []).map(rowToWorkItem) });
}
