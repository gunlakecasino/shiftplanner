import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireTasksAccess } from "../../../_lib/requireTasksAccess.server";
import { distributeTasks, type DistributionMode } from "@/lib/tasks/pools";

/**
 * POST /api/shiftbuilder/projects/pools/[poolId]/distribute
 *
 * Assigns the pool's open, unfinished tasks across the active roster per the
 * pool's distribution_mode. Idempotent-ish: re-running redistributes the same
 * open tasks (a fresh spread), which is the intended "shuffle again" behavior.
 *
 * Roster scope note: distributes across ALL active TMs for now. Narrowing to
 * "scheduled tonight" is a deliberate future refinement (needs the night's
 * roster) — see docs/TASKS_SYSTEM_PLAN.md 4.9.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ poolId: string }> }) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { poolId } = await params;
  const access = await requireTasksAccess(request, "manage");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const { data: pool, error: poolErr } = await admin
    .from("ops_task_pools")
    .select("id, distribution_mode, active")
    .eq("id", poolId)
    .single();
  if (poolErr) return NextResponse.json({ error: poolErr.message }, { status: 404 });

  const mode = pool.distribution_mode as DistributionMode;
  if (mode === "manual") {
    return NextResponse.json({ distributed: 0, message: "This pool is set to manual assignment." });
  }

  const [tasksRes, rosterRes] = await Promise.all([
    admin
      .from("ops_work_items")
      .select("id")
      .eq("pool_id", poolId)
      .eq("work_type", "task")
      .is("archived_at", null)
      .not("status", "in", "(complete,cancelled)")
      .order("created_at", { ascending: true }),
    admin.from("tm_profiles").select("tm_id").eq("active", true).order("display_name", { ascending: true }),
  ]);

  if (tasksRes.error) return NextResponse.json({ error: tasksRes.error.message }, { status: 500 });
  if (rosterRes.error) return NextResponse.json({ error: rosterRes.error.message }, { status: 500 });

  const taskIds = (tasksRes.data ?? []).map((t) => t.id as string);
  const memberIds = (rosterRes.data ?? []).map((r) => r.tm_id as string);

  if (taskIds.length === 0) {
    return NextResponse.json({ distributed: 0, message: "No open tasks in this pool to distribute." });
  }
  if (memberIds.length === 0) {
    return NextResponse.json({ error: "No active roster members to distribute to." }, { status: 400 });
  }

  const seed = Date.now() & 0xffffffff;
  const assignments = distributeTasks(taskIds, memberIds, mode, seed);

  // Small N (pool tasks) — sequential updates keep it simple and auditable.
  let distributed = 0;
  for (const a of assignments) {
    const { error } = await admin
      .from("ops_work_items")
      .update({
        assignee_tm_id: a.assigneeTmId,
        assignee_type: "tm",
        updated_by_name: actor.operatorName,
      })
      .eq("id", a.taskId);
    if (error) {
      console.error("[projects/pools] distribute update error:", error);
      return NextResponse.json({ error: error.message, distributed }, { status: 500 });
    }
    distributed += 1;
  }

  return NextResponse.json({ distributed });
}
