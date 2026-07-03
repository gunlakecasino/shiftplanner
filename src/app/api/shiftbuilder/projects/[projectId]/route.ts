import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireTasksAccess } from "../_lib/requireTasksAccess.server";
import { rowToWorkItem, WORK_ITEM_COLUMNS } from "@/lib/tasks/mapping";

type RouteParams = { params: Promise<{ projectId: string }> };

/** PATCH /api/shiftbuilder/projects/[projectId] — edit title/description/status. */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { projectId } = await params;
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
  if (typeof body.description === "string" || body.description === null) {
    patch.description = body.description ? String(body.description).trim() : null;
  }
  if (typeof body.status === "string") patch.status = body.status;

  const { data, error } = await admin
    .from("ops_work_items")
    .update(patch)
    .eq("id", projectId)
    .eq("work_type", "project")
    .select(WORK_ITEM_COLUMNS)
    .single();

  if (error) {
    console.error("[projects] update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: rowToWorkItem(data) });
}

/** DELETE /api/shiftbuilder/projects/[projectId] — archive (soft delete; reversible). */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { projectId } = await params;
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const { error } = await admin
    .from("ops_work_items")
    .update({ archived_at: new Date().toISOString(), updated_by_name: actor.operatorName })
    .eq("id", projectId)
    .eq("work_type", "project");

  if (error) {
    console.error("[projects] archive error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
