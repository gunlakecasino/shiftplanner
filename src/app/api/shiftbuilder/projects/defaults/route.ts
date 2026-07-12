import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import { requireTasksAccess } from "../_lib/requireTasksAccess.server";
import { rowToWorkItem, WORK_ITEM_COLUMNS } from "@/lib/tasks/mapping";
import { SHIFTBUILDER_DEPARTMENT } from "@/lib/shiftbuilder/tasksAdapter";
import { canonicalizeDefaultSlotKey, isOverlapPoolSlotKey } from "@/lib/shiftbuilder/overlapPoolDefaults";

/**
 * Slot-default chip templates (successor to slot_default_tasks).
 * - Zone / RR / AUX: materialize onto cards on new grave nights via applySlotDefaultsToNight.
 * - AM/PM overlap: standing **pools** (canonical write overlap_am_0 / overlap_pm_0);
 *   distributed to staffed seats by Apply Overlap Tasks — not fixed per-card night seeds.
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
  const rawSlotKey = String(body.slotKey ?? "").trim();
  let slotType = String(body.slotType ?? "").trim();
  if (!title || !rawSlotKey || !slotType) {
    return NextResponse.json({ error: "title, slotKey, slotType are required" }, { status: 400 });
  }

  // New OL pool members always land on the band bucket (_0); never scatter to _1…_5.
  const slotKey = canonicalizeDefaultSlotKey(rawSlotKey);
  if (isOverlapPoolSlotKey(slotKey)) {
    slotType = "overlap";
  }

  const priorityRaw = String(body.priority ?? "normal").trim().toLowerCase();
  const priority = ["low", "normal", "high", "urgent"].includes(priorityRaw)
    ? priorityRaw
    : "normal";

  let recurrence_days: number[] | null = null;
  let recurrence_type: string | null = null;
  if (Array.isArray(body.recurrenceDays) && body.recurrenceDays.length > 0) {
    const parsed: number[] = [];
    for (const x of body.recurrenceDays as unknown[]) {
      const n = typeof x === "number" ? x : Number.parseInt(String(x), 10);
      if (Number.isInteger(n) && n >= 0 && n <= 6) parsed.push(n);
    }
    const days = [...new Set(parsed)].sort((a, b) => a - b);
    if (days.length > 0 && days.length < 7) {
      recurrence_days = days;
      recurrence_type = "weekly";
    }
  }

  const poolSortOrder =
    body.poolSortOrder == null || body.poolSortOrder === ""
      ? null
      : Number.isFinite(Number(body.poolSortOrder))
        ? Math.trunc(Number(body.poolSortOrder))
        : null;

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
      priority,
      recurrence_days,
      recurrence_type,
      pool_sort_order: poolSortOrder,
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
