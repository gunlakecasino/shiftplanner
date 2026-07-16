import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireTasksAccess } from "../../../_lib/requireTasksAccess.server";
import { rowToWorkItem, WORK_ITEM_COLUMNS } from "@/lib/tasks/mapping";
import { computeNextDueDate } from "@/lib/tasks/recurrence";
import { SHIFTBUILDER_DEFAULT_DUE_SHIFT, tonightDateISO } from "@/lib/shiftbuilder/tasksAdapter";

type RouteParams = { params: Promise<{ taskId: string }> };

/**
 * POST /api/shiftbuilder/projects/tasks/[taskId]/generate-next
 *
 * Materializes the next real instance of a recurring template (T4 — instances
 * are always real rows, never computed on the fly). Manually triggered for
 * now — no scheduled generator job in this pass (see plan D3). Safe to call
 * repeatedly: each call advances next_due_date, so it can't double-generate
 * the same occurrence.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { taskId } = await params;
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const { data: template, error: fetchErr } = await admin
    .from("ops_work_items")
    .select(WORK_ITEM_COLUMNS)
    .eq("id", taskId)
    .single();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 404 });
  if (template.work_type !== "recurring") {
    return NextResponse.json({ error: "Not a recurring template" }, { status: 400 });
  }
  if (!template.active) {
    return NextResponse.json({ error: "Template is paused" }, { status: 400 });
  }

  const generateFor = template.next_due_date ?? tonightDateISO();

  const { data: instance, error: insertErr } = await admin
    .from("ops_work_items")
    .insert({
      work_type: "task",
      title: template.title,
      description: template.description,
      department: template.department,
      project_id: template.project_id,
      priority: template.priority,
      category: template.category,
      status: "not_started",
      assignee_type: template.assignee_type,
      assignee_tm_id: template.assignee_tm_id,
      slot_key: template.slot_key,
      slot_type: template.slot_type,
      rr_side: template.rr_side,
      pool_id: template.pool_id,
      due_date: generateFor,
      due_shift: template.due_shift ?? SHIFTBUILDER_DEFAULT_DUE_SHIFT,
      parent_template_id: template.id,
      created_by_name: actor.operatorName,
      updated_by_name: actor.operatorName,
    })
    .select(WORK_ITEM_COLUMNS)
    .single();

  if (insertErr) {
    console.error("[projects/tasks] generate-next insert error:", insertErr);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const nextDue = computeNextDueDate(
    {
      recurrenceType: template.recurrence_type,
      recurrenceDays: template.recurrence_days,
      advanceDays: template.advance_days ?? 1,
    },
    generateFor,
  );

  const { data: updatedTemplate, error: updateErr } = await admin
    .from("ops_work_items")
    .update({ next_due_date: nextDue, updated_by_name: actor.operatorName })
    .eq("id", taskId)
    .select(WORK_ITEM_COLUMNS)
    .single();

  if (updateErr) {
    console.error("[projects/tasks] generate-next template update error:", updateErr);
  }

  return NextResponse.json({
    instance: rowToWorkItem(instance),
    template: updatedTemplate ? rowToWorkItem(updatedTemplate) : rowToWorkItem(template),
  });
}
