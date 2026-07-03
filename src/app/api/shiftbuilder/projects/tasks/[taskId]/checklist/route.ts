import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireTasksAccess } from "../../../_lib/requireTasksAccess.server";
import { rowToChecklistItem } from "@/lib/tasks/mapping";

type RouteParams = { params: Promise<{ taskId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { taskId } = await params;
  const access = await requireTasksAccess(request, "view");
  if (!access.ok) return access.response;

  const { data, error } = await access.admin
    .from("ops_work_item_checklist_items")
    .select("*")
    .eq("work_item_id", taskId)
    .order("sort_order");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ checklist: (data ?? []).map(rowToChecklistItem) });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { taskId } = await params;
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;
  const { admin } = access;

  const body = await request.json().catch(() => ({}));
  const label = String(body.label ?? "").trim();
  if (!label) return NextResponse.json({ error: "label is required" }, { status: 400 });

  const { count } = await admin
    .from("ops_work_item_checklist_items")
    .select("id", { count: "exact", head: true })
    .eq("work_item_id", taskId);

  const { data, error } = await admin
    .from("ops_work_item_checklist_items")
    .insert({ work_item_id: taskId, label, sort_order: count ?? 0 })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: rowToChecklistItem(data) }, { status: 201 });
}
