import { NextRequest, NextResponse } from "next/server";
import {
  requireOpsAnyPermission,
  requireOpsPermission,
  type OpsSessionActor,
} from "@/lib/auth/requireOpsSession.server";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TasksAccessLevel = "view" | "manage" | "complete" | "request";

export type TasksAccessResult =
  | { ok: true; actor: OpsSessionActor; admin: SupabaseClient }
  | { ok: false; response: NextResponse };

/**
 * Session + permission + admin-client gate shared by every /api/shiftbuilder/projects/**
 * route. "view" requires canAccessTasks; "manage" requires canManageTasks; "complete"
 * accepts either canManageTasks or canCompleteOwnTasks (status-only edits — a floor
 * viewer can toggle status without full edit/reassign/delete rights). "request"
 * requires canRequestTasks — the narrow board intake door; the route handlers
 * additionally scope every read/write to created_by_user_id = actor.user.id.
 * Mirrors the requireSudoAdmin.server.ts / slot-defaults route.ts pattern — writes
 * always go through the service-role client, RLS is not the write gate.
 *
 * Known simplification: canCompleteOwnTasks is not yet scoped to "tasks assigned to
 * this operator" — there is no identity bridge between an OpsUser (operator login)
 * and a tm_profiles row (floor staff assignee) in this schema. It currently grants
 * status-change rights on any task. Tightening this is a fast-follow once that link
 * exists.
 */
export async function requireTasksAccess(
  request: NextRequest,
  level: TasksAccessLevel,
): Promise<TasksAccessResult> {
  const session =
    level === "complete"
      ? await requireOpsAnyPermission(request, ["canManageTasks", "canCompleteOwnTasks"])
      : level === "request"
        ? await requireOpsPermission(request, "canRequestTasks")
        : await requireOpsPermission(request, level === "manage" ? "canManageTasks" : "canAccessTasks");
  if (!session.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: session.error }, { status: session.status }),
    };
  }

  const admin = createAdminClientSafe();
  if (!admin) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Service role not configured" }, { status: 500 }),
    };
  }

  return { ok: true, actor: session.actor, admin };
}
