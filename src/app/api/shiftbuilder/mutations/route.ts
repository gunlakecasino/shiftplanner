import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import type { PermissionKey } from "@/lib/auth/auditActionPermission";
import {
  assertActorCanEditNight,
  nightRefFromMutationBody,
} from "@/lib/auth/assertNightEditable.server";
import { requireOpsPermission } from "@/lib/auth/requireOpsSession.server";
import {
  addNightSlotTaskServer,
  batchApplyDraftAssignmentsServer,
  deleteBreakAssignmentServer,
  deleteZoneAssignmentServer,
  markTmCallOffServer,
  unmarkTmCallOffServer,
  removeNightCardBorderServer,
  removeNightSlotTaskServer,
  moveNightSlotTaskServer,
  replaceAllNightSlotTasksServer,
  replaceNightSlotTasksForSlotServer,
  setNightCardBorderServer,
  setNightLockedServer,
  setNightPublishedServer,
  toggleAssignmentLockServer,
  updateNightSlotTaskColorServer,
  updateNightSlotTaskCoverageSideServer,
  updateNightSlotTaskLabelServer,
  updateNightSlotTaskStyleServer,
  upsertBreakAssignmentServer,
  upsertZoneAssignmentServer,
} from "@/lib/shiftbuilder/opsMutations.server";
import {
  loadOpsKnowledgeServer,
  loadRecentAiFeedbackServer,
  saveAiFeedbackServer,
  saveOpsKnowledgeServer,
} from "@/lib/shiftbuilder/opsKnowledge/opsKnowledge.server";
import type { AiFeedbackExample } from "@/lib/shiftbuilder/opsKnowledge/feedback";
import type { OpsKnowledge } from "@/lib/shiftbuilder/opsKnowledge/types";
import { revalidateNightBoardCaches, revalidateSlotDefaultsCache } from "@/lib/shiftbuilder/revalidateOpsCache";
import {
  addSlotDefaultTaskServer,
  bulkUpsertSlotDefaultsServer,
  removeSlotDefaultTaskServer,
  upsertSlotDefaultServer,
} from "@/lib/shiftbuilder/slotDefaultsMutations.server";
import type { SlotDefault } from "@/lib/shiftbuilder/data";

const ACTION_PERMISSIONS: Record<string, PermissionKey | "authenticated"> = {
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
  move_night_slot_task: "canEditAssignments",
  update_night_slot_task_color: "canEditAssignments",
  update_night_slot_task_style: "canEditAssignments",
  update_night_slot_task_coverage_side: "canEditAssignments",
  update_night_slot_task_label: "canEditAssignments",
  replace_night_slot_tasks_for_slot: "canEditAssignments",
  replace_all_night_slot_tasks: "canEditAssignments",
  mark_tm_call_off: "canEditAssignments",
  unmark_tm_call_off: "canEditAssignments",
  add_slot_default_task: "canAccessSudo",
  remove_slot_default_task: "canAccessSudo",
  upsert_slot_default: "canAccessSudo",
  bulk_upsert_slot_defaults: "canAccessSudo",
  // opsKnowledge — service_role tables; session-gated RPC only
  load_ops_knowledge: "authenticated",
  load_ai_feedback: "authenticated",
  save_ai_feedback: "canEditAssignments",
  save_ops_knowledge: "canAccessSudo",
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

  if (permission === "canEditAssignments" || permission === "canLockUnlock") {
    const editCheck = await assertActorCanEditNight(
      session.actor.permissions,
      nightRefFromMutationBody(body),
    );
    if (!editCheck.ok) {
      return NextResponse.json({ error: editCheck.error }, { status: 403 });
    }
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
      case "move_night_slot_task": {
        await moveNightSlotTaskServer(body as never);
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
      case "update_night_slot_task_coverage_side": {
        await updateNightSlotTaskCoverageSideServer(
          String(body.nightId),
          String(body.slotKey),
          String(body.taskLabel),
          (body.coverageSide as "A" | "B" | null) ?? null,
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
      case "mark_tm_call_off": {
        const result = await markTmCallOffServer({
          nightId: String(body.nightId),
          tmId: String(body.tmId),
          date: String(body.date),
          reason: body.reason != null ? String(body.reason) : null,
        });
        await bustCache(body.date as string | undefined);
        return NextResponse.json(result);
      }
      case "unmark_tm_call_off": {
        const result = await unmarkTmCallOffServer({
          tmId: String(body.tmId),
          date: String(body.date),
        });
        await bustCache(body.date as string | undefined);
        return NextResponse.json(result);
      }
      case "add_slot_default_task": {
        const task = await addSlotDefaultTaskServer({
          slotKey: String(body.slotKey),
          slotType: body.slotType as "zone" | "rr" | "aux" | "overlap",
          rrSide: (body.rrSide as string | undefined) ?? "",
          taskLabel: String(body.taskLabel),
          taskColor: (body.taskColor as string | null | undefined) ?? null,
          isCoverage: Boolean(body.isCoverage),
          sortOrder: Number(body.sortOrder ?? 0),
        });
        try {
          await revalidateSlotDefaultsCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json(task);
      }
      case "remove_slot_default_task": {
        await removeSlotDefaultTaskServer(String(body.id));
        try {
          await revalidateSlotDefaultsCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json({ ok: true });
      }
      case "upsert_slot_default": {
        await upsertSlotDefaultServer({
          slotKey: String(body.slotKey),
          slotType: body.slotType as "zone" | "rr" | "aux" | "overlap",
          rrSide: (body.rrSide as string | undefined) ?? "",
          defaultBreakGroup: Number(body.defaultBreakGroup) as never,
        });
        try {
          await revalidateSlotDefaultsCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json({ ok: true });
      }
      case "bulk_upsert_slot_defaults": {
        await bulkUpsertSlotDefaultsServer((body.rows as SlotDefault[]) ?? []);
        try {
          await revalidateSlotDefaultsCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json({ ok: true });
      }
      case "load_ops_knowledge": {
        const knowledge = await loadOpsKnowledgeServer();
        return NextResponse.json({ ok: true, knowledge });
      }
      case "load_ai_feedback": {
        const limit = body.limit != null ? Number(body.limit) : 40;
        const examples = await loadRecentAiFeedbackServer(limit);
        return NextResponse.json({ ok: true, examples });
      }
      case "save_ai_feedback": {
        const example: AiFeedbackExample = {
          nightIso: String(body.nightIso ?? ""),
          slotKey: String(body.slotKey ?? ""),
          tmId: String(body.tmId ?? ""),
          tmName: String(body.tmName ?? ""),
          aiRationale: String(body.aiRationale ?? ""),
          verdict: body.verdict as AiFeedbackExample["verdict"],
          reason: body.reason != null ? String(body.reason) : undefined,
          facts: body.facts != null ? String(body.facts) : undefined,
        };
        const result = await saveAiFeedbackServer(example);
        return NextResponse.json(result);
      }
      case "save_ops_knowledge": {
        const knowledge = (body.knowledge ?? {}) as OpsKnowledge;
        const result = await saveOpsKnowledgeServer(knowledge);
        return NextResponse.json(result);
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