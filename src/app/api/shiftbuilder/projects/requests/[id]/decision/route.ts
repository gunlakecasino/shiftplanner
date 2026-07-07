import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireTasksAccess } from "../../../_lib/requireTasksAccess.server";
import { logStatusChange } from "../../../_lib/workItemActivity.server";
import { rowToWorkItem, WORK_ITEM_COLUMNS } from "@/lib/tasks/mapping";
import type { WorkItemStatus } from "@/lib/tasks/types";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/shiftbuilder/projects/requests/[id]/decision — a manager approves or
 * rejects a pending request. Manage-gated. Approve moves it into the normal flow
 * (approval_state='approved', appears on the Projects page); reject records a note
 * shown back to the requester. Only pending items can be decided.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const body = await request.json().catch(() => ({}));
  const decision = body.decision === "reject" ? "reject" : body.decision === "approve" ? "approve" : null;
  if (!decision) {
    return NextResponse.json({ error: "decision must be 'approve' or 'reject'" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim() : "";

  const { data: current, error: currentErr } = await admin
    .from("ops_work_items")
    .select("id, approval_state, status")
    .eq("id", id)
    .maybeSingle();
  if (currentErr || !current) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (current.approval_state !== "pending") {
    return NextResponse.json({ error: "This request has already been decided" }, { status: 409 });
  }

  const patch: Record<string, unknown> =
    decision === "approve"
      ? { approval_state: "approved", approval_note: null, updated_by_name: actor.operatorName }
      : { approval_state: "rejected", approval_note: note || null, updated_by_name: actor.operatorName };

  const { data, error } = await admin
    .from("ops_work_items")
    .update(patch)
    .eq("id", id)
    .select(WORK_ITEM_COLUMNS)
    .single();

  if (error) {
    console.error("[projects/requests/decision] update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const status = current.status as WorkItemStatus;
  await logStatusChange(admin, {
    workItemId: id,
    fromStatus: status,
    toStatus: status,
    actorName: actor.operatorName,
    note: decision === "approve" ? "request approved" : `request rejected${note ? `: ${note}` : ""}`,
  });

  return NextResponse.json({ request: rowToWorkItem(data) });
}
