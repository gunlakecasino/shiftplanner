import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import { requireTasksAccess } from "../_lib/requireTasksAccess.server";
import { rowToWorkItem, WORK_ITEM_COLUMNS } from "@/lib/tasks/mapping";
import { SHIFTBUILDER_DEPARTMENT } from "@/lib/shiftbuilder/tasksAdapter";

/**
 * Slot-default chip templates (successor to slot_default_tasks). These are the
 * per-slot default tasks that materialize onto every new night's cards. Managed
 * from /projects → Defaults; consumed by applySlotDefaultsToNight.
 */
export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rate = checkOpsApiRateLimit(`projects-defaults:${clientIpFromRequest(request)}`);
  if (!rate.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } });
  }

  const access = await requireTasksAccess(request, "view");
  if (!access.ok) return access.response;

  const { data, error } = await access.admin
    .from("ops_work_items")
    .select(WORK_ITEM_COLUMNS)
    .eq("is_slot_default", true)
    .eq("department", SHIFTBUILDER_DEPARTMENT)
    .is("archived_at", null)
    .order("slot_key", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    console.error("[projects/defaults] list error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ defaults: (data ?? []).map(rowToWorkItem) });
}

/** POST — add a default task to a slot. */
export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  const slotKey = String(body.slotKey ?? "").trim();
  const slotType = String(body.slotType ?? "").trim();
  if (!title || !slotKey || !slotType) {
    return NextResponse.json({ error: "title, slotKey, slotType are required" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("ops_work_items")
    .insert({
      work_type: "recurring",
      title,
      department: SHIFTBUILDER_DEPARTMENT,
      status: "not_started",
      active: true,
      is_slot_default: true,
      slot_key: slotKey,
      slot_type: slotType,
      rr_side: body.rrSide || null,
      task_color: body.taskColor || null,
      is_coverage: Boolean(body.isCoverage),
      created_by_name: actor.operatorName,
      updated_by_name: actor.operatorName,
    })
    .select(WORK_ITEM_COLUMNS)
    .single();

  if (error) {
    console.error("[projects/defaults] create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ default: rowToWorkItem(data) }, { status: 201 });
}
