import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import { requireTasksAccess } from "../_lib/requireTasksAccess.server";
import { logStatusChange } from "../_lib/workItemActivity.server";
import { rowToWorkItem, WORK_ITEM_COLUMNS } from "@/lib/tasks/mapping";
import { resolveSlotTriple } from "@/lib/shiftbuilder/slotCatalog";
import { computeNextDueDate } from "@/lib/tasks/recurrence";
import { SHIFTBUILDER_DEPARTMENT, SHIFTBUILDER_DEFAULT_DUE_SHIFT, tonightDateISO } from "@/lib/shiftbuilder/tasksAdapter";

/** GET /api/shiftbuilder/projects/tasks — filterable task list. */
export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rate = checkOpsApiRateLimit(`projects-tasks:${clientIpFromRequest(request)}`);
  if (!rate.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } });
  }

  const access = await requireTasksAccess(request, "view");
  if (!access.ok) return access.response;
  const { admin } = access;

  const sp = request.nextUrl.searchParams;
  const projectId = sp.get("projectId");
  const statusParam = sp.get("status");
  const category = sp.get("category");
  const assigneeTmId = sp.get("assigneeTmId");
  const dueOnOrBefore = sp.get("dueOnOrBefore");
  const includeArchived = sp.get("includeArchived") === "true";
  const workType = sp.get("workType");

  let query = admin
    .from("ops_work_items")
    .select(WORK_ITEM_COLUMNS)
    .in("work_type", workType ? [workType] : ["task", "recurring"])
    .eq("department", SHIFTBUILDER_DEPARTMENT)
    // Slot-default chip templates are managed in the Defaults view + consumed by
    // the night materializer; they are not tracker instances.
    .eq("is_slot_default", false)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (!includeArchived) query = query.is("archived_at", null);
  if (projectId) query = query.eq("project_id", projectId);
  if (category) query = query.eq("category", category);
  if (assigneeTmId) query = query.eq("assignee_tm_id", assigneeTmId);
  if (dueOnOrBefore) query = query.lte("due_date", dueOnOrBefore);
  if (statusParam) query = query.in("status", statusParam.split(","));

  const { data, error } = await query;
  if (error) {
    console.error("[projects/tasks] list error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tasks: (data ?? []).map(rowToWorkItem) });
}

/** POST /api/shiftbuilder/projects/tasks — create a task, or a recurring template. */
export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const workType = body.workType === "recurring" ? "recurring" : "task";
  const dueDate = body.dueDate ? String(body.dueDate) : workType === "task" ? tonightDateISO() : null;

  const insert: Record<string, unknown> = {
    work_type: workType,
    title,
    description: body.description ? String(body.description).trim() : null,
    department: SHIFTBUILDER_DEPARTMENT,
    project_id: body.projectId || null,
    pool_id: body.poolId || null,
    priority: body.priority ?? "normal",
    status: "not_started",
    category: body.category ?? null,
    assignee_type: body.assigneeTmId ? "tm" : null,
    assignee_tm_id: body.assigneeTmId || null,
    due_date: dueDate,
    due_shift: body.dueShift ?? (workType === "task" ? SHIFTBUILDER_DEFAULT_DUE_SHIFT : null),
    created_by_name: actor.operatorName,
    updated_by_name: actor.operatorName,
  };

  // Optional location (zone/RR/aux/overlap). Resolve the (key, type, side) triple
  // authoritatively from the catalog so a partial/inconsistent payload can't corrupt
  // the row. A located tracked task is NOT a slot-default template — is_slot_default
  // stays false (its column default).
  const slot = resolveSlotTriple(body.slotKey, body.rrSide);
  insert.slot_key = slot.slotKey;
  insert.slot_type = slot.slotType;
  insert.rr_side = slot.rrSide;

  if (workType === "recurring") {
    const recurrenceType = body.recurrenceType;
    const recurrenceDays = Array.isArray(body.recurrenceDays) ? body.recurrenceDays : null;
    const advanceDays = Number(body.advanceDays) || 1;
    if (!recurrenceType) {
      return NextResponse.json({ error: "recurrenceType is required for a recurring task" }, { status: 400 });
    }
    insert.recurrence_type = recurrenceType;
    insert.recurrence_days = recurrenceDays;
    insert.advance_days = advanceDays;
    insert.active = true;
    insert.next_due_date = computeNextDueDate(
      { recurrenceType, recurrenceDays, advanceDays },
      dueDate ?? tonightDateISO(),
    );
  }

  const { data, error } = await admin.from("ops_work_items").insert(insert).select(WORK_ITEM_COLUMNS).single();
  if (error) {
    console.error("[projects/tasks] create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logStatusChange(admin, {
    workItemId: data.id,
    fromStatus: null,
    toStatus: "not_started",
    actorName: actor.operatorName,
    note: "created",
  });

  return NextResponse.json({ task: rowToWorkItem(data) }, { status: 201 });
}
