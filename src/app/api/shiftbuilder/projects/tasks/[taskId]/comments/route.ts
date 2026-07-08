import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireTasksAccess } from "../../../_lib/requireTasksAccess.server";
import { rowToComment } from "@/lib/tasks/mapping";

type RouteParams = { params: Promise<{ taskId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { taskId } = await params;
  const access = await requireTasksAccess(request, "view");
  if (!access.ok) return access.response;

  const { data, error } = await access.admin
    .from("ops_work_item_comments")
    .select("*")
    .eq("work_item_id", taskId)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comments: (data ?? []).map(rowToComment) });
}

/** Comments are a low-friction handoff channel — any operator with task access can post. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { taskId } = await params;
  const access = await requireTasksAccess(request, "complete");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const body = await request.json().catch(() => ({}));
  const text = String(body.body ?? "").trim();
  if (!text) return NextResponse.json({ error: "body is required" }, { status: 400 });

  const { data, error } = await admin
    .from("ops_work_item_comments")
    .insert({ work_item_id: taskId, author_name: actor.operatorName, body: text })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ comment: rowToComment(data) }, { status: 201 });
}
