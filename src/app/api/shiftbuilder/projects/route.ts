import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import { requireTasksAccess } from "./_lib/requireTasksAccess.server";
import { rowToWorkItem, WORK_ITEM_COLUMNS } from "@/lib/tasks/mapping";
import { SHIFTBUILDER_DEPARTMENT } from "@/lib/shiftbuilder/tasksAdapter";

/** GET /api/shiftbuilder/projects — every non-archived Project, with open task counts. */
export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rate = checkOpsApiRateLimit(`projects:${clientIpFromRequest(request)}`);
  if (!rate.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } });
  }

  const access = await requireTasksAccess(request, "view");
  if (!access.ok) return access.response;
  const { admin } = access;

  const [projectsRes, taskCountsRes] = await Promise.all([
    admin
      .from("ops_work_items")
      .select(WORK_ITEM_COLUMNS)
      .eq("work_type", "project")
      .eq("department", SHIFTBUILDER_DEPARTMENT)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    admin
      .from("ops_work_items")
      .select("project_id, status")
      .in("work_type", ["task", "recurring"])
      .eq("department", SHIFTBUILDER_DEPARTMENT)
      .is("archived_at", null)
      .not("project_id", "is", null),
  ]);

  if (projectsRes.error) {
    console.error("[projects] list error:", projectsRes.error);
    return NextResponse.json({ error: projectsRes.error.message }, { status: 500 });
  }

  const counts = new Map<string, { total: number; open: number }>();
  for (const row of taskCountsRes.data ?? []) {
    const pid = row.project_id as string;
    const entry = counts.get(pid) ?? { total: 0, open: 0 };
    entry.total += 1;
    if (row.status !== "complete" && row.status !== "cancelled") entry.open += 1;
    counts.set(pid, entry);
  }

  const projects = (projectsRes.data ?? []).map((r) => ({
    ...rowToWorkItem(r),
    taskCounts: counts.get(r.id) ?? { total: 0, open: 0 },
  }));

  return NextResponse.json({ projects });
}

/** POST /api/shiftbuilder/projects — create a Project. */
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

  const { data, error } = await admin
    .from("ops_work_items")
    .insert({
      work_type: "project",
      title,
      description: body.description ? String(body.description).trim() : null,
      department: SHIFTBUILDER_DEPARTMENT,
      status: "not_started",
      created_by_name: actor.operatorName,
      updated_by_name: actor.operatorName,
    })
    .select(WORK_ITEM_COLUMNS)
    .single();

  if (error) {
    console.error("[projects] create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ project: rowToWorkItem(data) }, { status: 201 });
}
