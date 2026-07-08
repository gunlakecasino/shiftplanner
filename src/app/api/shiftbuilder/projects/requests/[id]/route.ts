import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { requireTasksAccess } from "../../_lib/requireTasksAccess.server";
import { rowToWorkItem, WORK_ITEM_COLUMNS } from "@/lib/tasks/mapping";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Confirm the target row exists AND was created by this actor. Returns the row's
 * id on success, or a 404 response (we 404 rather than 403 so a requester can't
 * probe which ids belong to other operators).
 */
async function requireOwnedRequest(
  admin: import("@supabase/supabase-js").SupabaseClient,
  id: string,
  ownerUserId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const { data, error } = await admin
    .from("ops_work_items")
    .select("id, created_by_user_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !data || data.created_by_user_id !== ownerUserId) {
    return { ok: false, response: NextResponse.json({ error: "Request not found" }, { status: 404 }) };
  }
  return { ok: true };
}

/**
 * PATCH /api/shiftbuilder/projects/requests/[id] — the requester edits their own
 * submission. Descriptive fields only (title, description, priority, category,
 * dueDate). Never status, assignee, project, or approval — those are manager-owned.
 * Allowed at any point in the item's life (edit-anytime).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const access = await requireTasksAccess(request, "request");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const owned = await requireOwnedRequest(admin, id, actor.user.id);
  if (!owned.ok) return owned.response;

  const body = await request.json().catch(() => ({}));
  const patch: Record<string, unknown> = { updated_by_name: actor.operatorName };

  if (typeof body.title === "string") {
    const title = body.title.trim();
    if (!title) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    patch.title = title;
  }
  if (typeof body.description === "string" || body.description === null) {
    patch.description = body.description ? String(body.description).trim() : null;
  }
  if (typeof body.priority === "string") patch.priority = body.priority;
  if (typeof body.category === "string" || body.category === null) patch.category = body.category;
  if (typeof body.dueDate === "string" || body.dueDate === null) patch.due_date = body.dueDate;

  const { data, error } = await admin
    .from("ops_work_items")
    .update(patch)
    .eq("id", id)
    .select(WORK_ITEM_COLUMNS)
    .single();

  if (error) {
    console.error("[projects/requests] edit error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ request: rowToWorkItem(data) });
}

/**
 * DELETE /api/shiftbuilder/projects/requests/[id] — the requester withdraws their
 * own submission. Soft-archive (reversible) so a manager mid-task is never silently
 * wiped. Allowed at any point in the item's life.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const access = await requireTasksAccess(request, "request");
  if (!access.ok) return access.response;
  const { admin, actor } = access;

  const owned = await requireOwnedRequest(admin, id, actor.user.id);
  if (!owned.ok) return owned.response;

  const { error } = await admin
    .from("ops_work_items")
    .update({ archived_at: new Date().toISOString(), updated_by_name: actor.operatorName })
    .eq("id", id);

  if (error) {
    console.error("[projects/requests] withdraw error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
