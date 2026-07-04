import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireTasksAccess } from "../../_lib/requireTasksAccess.server";
import { rowToWorkItem, WORK_ITEM_COLUMNS } from "@/lib/tasks/mapping";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_by_name: actor.operatorName };
  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    patch.title = title;
  }
  if (typeof body.taskColor === "string" || body.taskColor === null) patch.task_color = body.taskColor;
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.isCoverage === "boolean") patch.is_coverage = body.isCoverage;

  const { data, error } = await admin
    .from("ops_work_items")
    .update(patch)
    .eq("id", id)
    .eq("is_slot_default", true)
    .select(WORK_ITEM_COLUMNS)
    .single();

  if (error) {
    console.error("[projects/defaults] update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ default: rowToWorkItem(data) });
}

/** Hard-delete a slot-default (it's a template, not tracked history). */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;

  const { error } = await access.admin
    .from("ops_work_items")
    .delete()
    .eq("id", id)
    .eq("is_slot_default", true);

  if (error) {
    console.error("[projects/defaults] delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
