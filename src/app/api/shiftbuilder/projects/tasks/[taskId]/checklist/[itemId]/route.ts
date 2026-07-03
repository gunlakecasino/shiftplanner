import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireTasksAccess } from "../../../../_lib/requireTasksAccess.server";
import { rowToChecklistItem } from "@/lib/tasks/mapping";

type RouteParams = { params: Promise<{ taskId: string; itemId: string }> };

/** PATCH — toggle is_done (canCompleteOwnTasks-level) or edit label (canManageTasks-level). */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { itemId } = await params;
  const body = await request.json().catch(() => ({}));

  const isToggleOnly = Object.keys(body).every((k) => k === "isDone");
  const access = await requireTasksAccess(request, isToggleOnly ? "complete" : "manage");
  if (!access.ok) return access.response;

  const patch: Record<string, unknown> = {};
  if (typeof body.isDone === "boolean") patch.is_done = body.isDone;
  if (typeof body.label === "string") {
    const label = body.label.trim();
    if (!label) return NextResponse.json({ error: "label cannot be empty" }, { status: 400 });
    patch.label = label;
  }

  const { data, error } = await access.admin
    .from("ops_work_item_checklist_items")
    .update(patch)
    .eq("id", itemId)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: rowToChecklistItem(data) });
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { itemId } = await params;
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;

  const { error } = await access.admin.from("ops_work_item_checklist_items").delete().eq("id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
