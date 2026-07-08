import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import { requireTasksAccess } from "../_lib/requireTasksAccess.server";
import { rowToPool } from "@/lib/tasks/mapping";

const POOL_COLUMNS = "id, name, description, distribution_mode, active, created_by_name, created_at, updated_at";

/** GET /api/shiftbuilder/projects/pools — pools with open-task counts. */
export async function GET(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const rate = checkOpsApiRateLimit(`projects-pools:${clientIpFromRequest(request)}`);
  if (!rate.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSec) } });
  }

  const access = await requireTasksAccess(request, "view");
  if (!access.ok) return access.response;
  const { admin } = access;

  const [poolsRes, countsRes] = await Promise.all([
    admin.from("ops_task_pools").select(POOL_COLUMNS).order("created_at", { ascending: false }),
    admin
      .from("ops_work_items")
      .select("pool_id, status")
      .not("pool_id", "is", null)
      .is("archived_at", null),
  ]);

  if (poolsRes.error) {
    console.error("[projects/pools] list error:", poolsRes.error);
    return NextResponse.json({ error: poolsRes.error.message }, { status: 500 });
  }

  const counts = new Map<string, { total: number; open: number }>();
  for (const row of countsRes.data ?? []) {
    const pid = row.pool_id as string;
    const entry = counts.get(pid) ?? { total: 0, open: 0 };
    entry.total += 1;
    if (row.status !== "complete" && row.status !== "cancelled") entry.open += 1;
    counts.set(pid, entry);
  }

  const pools = (poolsRes.data ?? []).map((r) => ({
    ...rowToPool(r),
    taskCounts: counts.get(r.id) ?? { total: 0, open: 0 },
  }));

  return NextResponse.json({ pools });
}

/** POST /api/shiftbuilder/projects/pools — create a pool. */
export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const mode = ["random", "round_robin", "manual"].includes(body.distributionMode)
    ? body.distributionMode
    : "round_robin";

  const { data, error } = await admin
    .from("ops_task_pools")
    .insert({
      name,
      description: body.description ? String(body.description).trim() : null,
      distribution_mode: mode,
      created_by_name: actor.operatorName,
    })
    .select(POOL_COLUMNS)
    .single();

  if (error) {
    console.error("[projects/pools] create error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pool: rowToPool(data) }, { status: 201 });
}
