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
  // Phase D: priority + day-of-week + fine rank for OL standing pools
  if (typeof body.priority === "string") {
    const p = body.priority.trim().toLowerCase();
    if (["low", "normal", "high", "urgent"].includes(p)) patch.priority = p;
  }
  if ("recurrenceDays" in body) {
    if (body.recurrenceDays == null) {
      patch.recurrence_days = null;
      patch.recurrence_type = null;
    } else if (Array.isArray(body.recurrenceDays)) {
      const parsed: number[] = [];
      for (const x of body.recurrenceDays as unknown[]) {
        const n = typeof x === "number" ? x : Number.parseInt(String(x), 10);
        if (Number.isInteger(n) && n >= 0 && n <= 6) parsed.push(n);
      }
      const days = [...new Set(parsed)].sort((a, b) => a - b);
      if (days.length === 0 || days.length === 7) {
        patch.recurrence_days = null;
        patch.recurrence_type = null;
      } else {
        patch.recurrence_days = days;
        patch.recurrence_type = "weekly";
      }
    }
  }
  if ("poolSortOrder" in body) {
    if (body.poolSortOrder == null || body.poolSortOrder === "") {
      patch.pool_sort_order = null;
    } else {
      const n = Number(body.poolSortOrder);
      patch.pool_sort_order = Number.isFinite(n) ? Math.trunc(n) : null;
    }
  }

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
