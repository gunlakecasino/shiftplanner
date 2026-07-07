import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import { requireTasksAccess } from "../_lib/requireTasksAccess.server";
import { logStatusChange } from "../_lib/workItemActivity.server";
import { rowToWorkItem, WORK_ITEM_COLUMNS } from "@/lib/tasks/mapping";
import { SHIFTBUILDER_DEPARTMENT, SHIFTBUILDER_DEFAULT_DUE_SHIFT } from "@/lib/shiftbuilder/tasksAdapter";

/**
 * GET /api/shiftbuilder/projects/requests — the caller's OWN task/project
 * requests, every approval state (so they see pending / approved / rejected).
 * Owner-scoped to created_by_user_id = actor.user.id — never returns anyone
 * else's work.
 */
export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rate = checkOpsApiRateLimit(`projects-requests:${clientIpFromRequest(request)}`);
  if (!rate.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } });
  }

  const access = await requireTasksAccess(request, "request");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const { data, error } = await admin
    .from("ops_work_items")
    .select(WORK_ITEM_COLUMNS)
    .eq("department", SHIFTBUILDER_DEPARTMENT)
    .eq("created_by_user_id", actor.user.id)
    .eq("is_slot_default", false)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[projects/requests] list error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ requests: (data ?? []).map(rowToWorkItem) });
}

/**
 * POST /api/shiftbuilder/projects/requests — submit a task or project request.
 * Lands approval_state='pending', attributed to the requester by stable ops-user
 * id, unassigned. A manager approves it into the normal flow.
 */
export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rate = checkOpsApiRateLimit(`projects-requests-write:${clientIpFromRequest(request)}`);
  if (!rate.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } });
  }

  const access = await requireTasksAccess(request, "request");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  const workType = body.workType === "project" ? "project" : "task";

  const insert: Record<string, unknown> = {
    work_type: workType,
    title,
    description: body.description ? String(body.description).trim() : null,
    department: SHIFTBUILDER_DEPARTMENT,
    status: "not_started",
    priority: body.priority ?? "normal",
    category: body.category ?? null,
    due_date: body.dueDate ? String(body.dueDate) : null,
    due_shift: workType === "task" ? (body.dueShift ?? SHIFTBUILDER_DEFAULT_DUE_SHIFT) : null,
    approval_state: "pending",
    created_by_user_id: actor.user.id,
    created_by_name: actor.operatorName,
    updated_by_name: actor.operatorName,
  };

  const { data, error } = await admin
    .from("ops_work_items")
    .insert(insert)
    .select(WORK_ITEM_COLUMNS)
    .single();

  if (error) {
    console.error("[projects/requests] create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logStatusChange(admin, {
    workItemId: data.id,
    fromStatus: null,
    toStatus: "not_started",
    actorName: actor.operatorName,
    note: "requested (pending approval)",
  });

  return NextResponse.json({ request: rowToWorkItem(data) }, { status: 201 });
}
