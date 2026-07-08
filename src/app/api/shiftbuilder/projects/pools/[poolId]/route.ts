import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireTasksAccess } from "../../_lib/requireTasksAccess.server";
import { rowToPool } from "@/lib/tasks/mapping";

const POOL_COLUMNS = "id, name, description, distribution_mode, active, created_by_name, created_at, updated_at";

type RouteParams = { params: Promise<{ poolId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { poolId } = await params;
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;
  const { admin } = access;

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
    patch.name = name;
  }
  if (typeof body.description === "string" || body.description === null) {
    patch.description = body.description ? String(body.description).trim() : null;
  }
  if (["random", "round_robin", "manual"].includes(body.distributionMode)) {
    patch.distribution_mode = body.distributionMode;
  }
  if (typeof body.active === "boolean") patch.active = body.active;

  const { data, error } = await admin
    .from("ops_task_pools")
    .update(patch)
    .eq("id", poolId)
    .select(POOL_COLUMNS)
    .single();

  if (error) {
    console.error("[projects/pools] update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ pool: rowToPool(data) });
}

/** DELETE — remove the pool. Tasks' pool_id FK is ON DELETE SET NULL, so tasks survive, unpooled. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { poolId } = await params;
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;

  const { error } = await access.admin.from("ops_task_pools").delete().eq("id", poolId);
  if (error) {
    console.error("[projects/pools] delete error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
