import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import type { PermissionKey } from "@/lib/auth/auditActionPermission";
import { requireOpsPermission } from "@/lib/auth/requireOpsSession.server";
import {
  addNightSlotTaskServer,
  batchApplyDraftAssignmentsServer,
  deleteBreakAssignmentServer,
  deleteZoneAssignmentServer,
  removeNightCardBorderServer,
  removeNightSlotTaskServer,
  replaceAllNightSlotTasksServer,
  replaceNightSlotTasksForSlotServer,
  setNightCardBorderServer,
  setNightLockedServer,
  setNightPublishedServer,
  toggleAssignmentLockServer,
  updateNightSlotTaskColorServer,
  updateNightSlotTaskLabelServer,
  updateNightSlotTaskStyleServer,
  upsertBreakAssignmentServer,
  upsertZoneAssignmentServer,
} from "@/lib/shiftbuilder/opsMutations.server";
import { revalidateNightBoardCaches } from "@/lib/shiftbuilder/revalidateOpsCache";

const ACTION_PERMISSIONS: Record<string, PermissionKey> = {
  upsert_zone_assignment: "canEditAssignments",
  delete_zone_assignment: "canEditAssignments",
  batch_apply_draft: "canEditAssignments",
  toggle_assignment_lock: "canLockUnlock",
  set_night_locked: "canLockUnlock",
  set_night_published: "canPublish",
  set_night_card_border: "canEditAssignments",
  remove_night_card_border: "canEditAssignments",
  upsert_break_assignment: "canEditAssignments",
  delete_break_assignment: "canEditAssignments",
  add_night_slot_task: "canEditAssignments",
  remove_night_slot_task: "canEditAssignments",
  update_night_slot_task_color: "canEditAssignments",
  update_night_slot_task_style: "canEditAssignments",
  update_night_slot_task_label: "canEditAssignments",
  replace_night_slot_tasks_for_slot: "canEditAssignments",
  replace_all_night_slot_tasks: "canEditAssignments",
};

async function bustCache(date?: string) {
  try {
    await revalidateNightBoardCaches(date);
  } catch {
    /* non-fatal */
  }
}

export async function POST(request: NextRequest) {
  if (!isSameOriginOpsRequest(request)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = String(body.action ?? "");
  const permission = ACTION_PERMISSIONS[action];
  if (!permission) {
    return NextResponse.json({ error: `Unknown mutation: ${action}` }, { status: 400 });
  }

  const session = await requireOpsPermission(request, permission);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const rateKey = `mutations:${clientIpFromRequest(request)}:${session.actor.user.id}`;
  const rateCheck = checkOpsApiRateLimit(rateKey, 240);
  if (!rateCheck.ok) {
    return NextResponse.json(
      { error: "Too many mutations — slow down" },
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfterSec) } },
    );
  }

  try {
    switch (action) {
      case "upsert_zone_assignment": {
        const result = await upsertZoneAssignmentServer(body as never);
        await bustCache(body.date as string | undefined);
        return NextResponse.json(result);
      }
      case "delete_zone_assignment": {
        const result = await deleteZoneAssignmentServer(body as never);
        await bustCache(body.date as string | undefined);
        return NextResponse.json(result);
      }
      case "batch_apply_draft": {
        await batchApplyDraftAssignmentsServer(
          String(body.nightId),
          (body.slots as never[]) ?? [],
        );
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true });
      }
      case "toggle_assignment_lock": {
        const result = await toggleAssignmentLockServer(body as never);
        await bustCache(body.date as string | undefined);
        return NextResponse.json(result);
      }
      case "set_night_locked": {
        await setNightLockedServer(String(body.nightId), Boolean(body.locked));
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true });
      }
      case "set_night_published": {
        await setNightPublishedServer(String(body.nightId), Boolean(body.published));
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true });
      }
      case "set_night_card_border": {
        await setNightCardBorderServer(
          String(body.nightId),
          String(body.slotKey),
          String(body.color),
        );
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true });
      }
      case "remove_night_card_border": {
        await removeNightCardBorderServer(String(body.nightId), String(body.slotKey));
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true });
      }
      case "upsert_break_assignment": {
        await upsertBreakAssignmentServer(body as never);
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true });
      }
      case "delete_break_assignment": {
        await deleteBreakAssignmentServer(String(body.nightId), String(body.tmId));
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true });
      }
      case "add_night_slot_task": {
        await addNightSlotTaskServer(body as never);
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true });
      }
      case "remove_night_slot_task": {
        await removeNightSlotTaskServer(body as never);
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true });
      }
      case "update_night_slot_task_color": {
        await updateNightSlotTaskColorServer(
          String(body.nightId),
          String(body.slotKey),
          String(body.taskLabel),
          (body.color as string | null) ?? null,
          (body.rrSide as "mens" | "womens" | null) ?? null,
          body.markerType as "highlight" | "underline" | "circle" | "none" | null | undefined,
        );
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true });
      }
      case "update_night_slot_task_style": {
        await updateNightSlotTaskStyleServer(
          String(body.nightId),
          String(body.slotKey),
          String(body.taskLabel),
          (body.textStyle as Record<string, unknown> | null) ?? null,
          (body.rrSide as "mens" | "womens" | null) ?? null,
        );
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true });
      }
      case "update_night_slot_task_label": {
        await updateNightSlotTaskLabelServer(
          String(body.nightId),
          String(body.slotKey),
          String(body.oldLabel),
          String(body.newLabel),
          (body.rrSide as "mens" | "womens" | null) ?? null,
        );
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true });
      }
      case "replace_night_slot_tasks_for_slot": {
        const applied = await replaceNightSlotTasksForSlotServer(body as never);
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true, applied });
      }
      case "replace_all_night_slot_tasks": {
        await replaceAllNightSlotTasksServer(
          String(body.nightId),
          (body.tasks as never[]) ?? [],
        );
        await bustCache(body.date as string | undefined);
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ error: "Unhandled mutation" }, { status: 500 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Mutation failed";
    console.error("[shiftbuilder/mutations]", action, err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}