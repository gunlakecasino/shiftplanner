import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireTasksAccess } from "../../_lib/requireTasksAccess.server";
import { logStatusChange } from "../../_lib/workItemActivity.server";
import {
  rowToActivityEntry,
  rowToChecklistItem,
  rowToComment,
  rowToWorkItem,
  WORK_ITEM_COLUMNS,
} from "@/lib/tasks/mapping";
import { STATUS_REQUIRES_REASON, type WorkItemStatus } from "@/lib/tasks/types";

type RouteParams = { params: Promise<{ taskId: string }> };

/** GET /api/shiftbuilder/projects/tasks/[taskId] — task + checklist + comments + activity. */
export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { taskId } = await params;
  const access = await requireTasksAccess(request, "view");
  if (!access.ok) return access.response;
  const { admin } = access;

  const [taskRes, checklistRes, commentsRes, activityRes] = await Promise.all([
    admin.from("ops_work_items").select(WORK_ITEM_COLUMNS).eq("id", taskId).single(),
    admin.from("ops_work_item_checklist_items").select("*").eq("work_item_id", taskId).order("sort_order"),
    admin.from("ops_work_item_comments").select("*").eq("work_item_id", taskId).order("created_at"),
    admin.from("ops_status_history").select("*").eq("work_item_id", taskId).order("changed_at", { ascending: false }),
  ]);

  if (taskRes.error) {
    return NextResponse.json({ error: taskRes.error.message }, { status: 404 });
  }

  return NextResponse.json({
    task: {
      ...rowToWorkItem(taskRes.data),
      checklist: (checklistRes.data ?? []).map(rowToChecklistItem),
      comments: (commentsRes.data ?? []).map(rowToComment),
      activity: (activityRes.data ?? []).map(rowToActivityEntry),
    },
  });
}

/** PATCH /api/shiftbuilder/projects/tasks/[taskId] — edit fields; status changes are audited. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { taskId } = await params;
  const body = await request.json().catch(() => ({}));

  const statusOnlyKeys = new Set(["status", "statusReason"]);
  const isStatusOnlyPatch = Object.keys(body).every((k) => statusOnlyKeys.has(k));

  const access = await requireTasksAccess(request, isStatusOnlyPatch ? "complete" : "manage");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const patch: Record<string, unknown> = { updated_by_name: actor.operatorName };

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    patch.title = title;
  }
  if (typeof body.description === "string" || body.description === null) {
    patch.description = body.description ? String(body.description).trim() : null;
  }
  if (typeof body.priority === "string") patch.priority = body.priority;
  if (typeof body.category === "string" || body.category === null) patch.category = body.category;
  if (typeof body.projectId === "string" || body.projectId === null) patch.project_id = body.projectId;
  if (typeof body.dueDate === "string" || body.dueDate === null) patch.due_date = body.dueDate;
  if (typeof body.dueShift === "string" || body.dueShift === null) patch.due_shift = body.dueShift;
  if ("assigneeTmId" in body) {
    patch.assignee_tm_id = body.assigneeTmId || null;
    patch.assignee_type = body.assigneeTmId ? "tm" : null;
  }

  let fromStatus: WorkItemStatus | null = null;
  const nextStatus: WorkItemStatus | undefined = typeof body.status === "string" ? body.status : undefined;

  if (nextStatus) {
    const { data: current, error: currentErr } = await admin
      .from("ops_work_items")
      .select("status")
      .eq("id", taskId)
      .single();
    if (currentErr) {
      return NextResponse.json({ error: currentErr.message }, { status: 404 });
    }
    fromStatus = current.status as WorkItemStatus;

    if (nextStatus !== fromStatus) {
      const reason = typeof body.statusReason === "string" ? body.statusReason.trim() : "";
      if (STATUS_REQUIRES_REASON.has(nextStatus) && !reason) {
        return NextResponse.json(
          { error: `A reason is required to mark this task "${nextStatus}"` },
          { status: 400 },
        );
      }
      patch.status = nextStatus;
      patch.status_reason = STATUS_REQUIRES_REASON.has(nextStatus) ? reason : null;
      patch.blocker_note = nextStatus === "blocked" ? reason : null;
      patch.cancel_reason = nextStatus === "cancelled" ? reason : null;
      patch.completed_at = nextStatus === "complete" ? new Date().toISOString() : null;
    }
  }

  const { data, error } = await admin
    .from("ops_work_items")
    .update(patch)
    .eq("id", taskId)
    .select(WORK_ITEM_COLUMNS)
    .single();

  if (error) {
    console.error("[projects/tasks] update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (nextStatus && nextStatus !== fromStatus) {
    await logStatusChange(admin, {
      workItemId: taskId,
      fromStatus,
      toStatus: nextStatus,
      actorName: actor.operatorName,
      note: typeof body.statusReason === "string" ? body.statusReason.trim() || null : null,
    });
  }

  return NextResponse.json({ task: rowToWorkItem(data) });
}

/** DELETE /api/shiftbuilder/projects/tasks/[taskId] — archive (soft delete; reversible). */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { taskId } = await params;
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const { error } = await admin
    .from("ops_work_items")
    .update({ archived_at: new Date().toISOString(), updated_by_name: actor.operatorName })
    .eq("id", taskId);

  if (error) {
    console.error("[projects/tasks] archive error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
