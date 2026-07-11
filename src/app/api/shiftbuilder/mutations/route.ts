import { NextRequest, NextResponse } from "next/server";
import { isSameOriginOpsRequest } from "@/app/api/_lib/sameOrigin";
import { checkOpsApiRateLimit, clientIpFromRequest } from "@/app/api/_lib/rateLimit";
import type { PermissionKey } from "@/lib/auth/auditActionPermission";
import {
  assertActorCanEditNight,
  nightRefFromMutationBody,
} from "@/lib/auth/assertNightEditable.server";
import {
  requireOpsAnyPermission,
  requireOpsPermission,
} from "@/lib/auth/requireOpsSession.server";
import {
  addNightSlotTaskServer,
  addTMAccommodationServer,
  addTMPreferenceServer,
  batchApplyDraftAssignmentsServer,
  deleteBreakAssignmentServer,
  deleteTMAccommodationServer,
  deleteTMPreferenceServer,
  deleteZoneAssignmentServer,
  markTmCallOffServer,
  unmarkTmCallOffServer,
  removeNightCardBorderServer,
  removeNightSlotTaskServer,
  moveNightSlotTaskServer,
  replaceAllNightSlotTasksServer,
  replaceNightSlotTasksForSlotServer,
  restoreTMServer,
  setNightCardBorderServer,
  setNightLockedServer,
  setNightPublishedServer,
  setTMDisplayNameServer,
  setTMGravePoolServer,
  softDeleteTMServer,
  type GravePoolValue,
  type SoftDeleteReason,
  toggleAssignmentLockServer,
  updateActiveEngineConfigServer,
  updateNightSlotTaskColorServer,
  updateNightSlotTaskCoverageSideServer,
  updateNightSlotTaskLabelServer,
  updateNightSlotTaskStyleServer,
  updateNightTmStatusServer,
  upsertBreakAssignmentServer,
  upsertSlotSkillServer,
  upsertTMServer,
  upsertZoneAssignmentServer,
} from "@/lib/shiftbuilder/opsMutations.server";
import {
  revalidateNightBoardCaches,
  revalidateRosterCache,
  revalidateSlotDefaultsCache,
} from "@/lib/shiftbuilder/revalidateOpsCache";
import {
  addSlotDefaultTaskServer,
  bulkUpsertSlotDefaultsServer,
  removeSlotDefaultTaskServer,
  upsertSlotDefaultServer,
} from "@/lib/shiftbuilder/slotDefaultsMutations.server";
import type { SlotDefault } from "@/lib/shiftbuilder/data";

/**
 * Single key = require that bit; array = require any one of the bits.
 * Array form is for multi-permission OR only (e.g. sudo ∥ manage-team).
 * Night published/draft gate below runs if any required key is
 * canEditAssignments or canLockUnlock — keep that true for board mutations.
 */
const ACTION_PERMISSIONS: Record<string, PermissionKey | PermissionKey[]> = {
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
  // KD-16: privileged identity / eligibility — sudo or manage-team only
  set_tm_grave_pool: ["canAccessSudo", "canManageTeam"],
  set_tm_display_name: ["canAccessSudo", "canManageTeam"],
  upsert_tm_profile: ["canAccessSudo", "canManageTeam"],
  soft_delete_tm: ["canAccessSudo", "canManageTeam"],
  restore_tm: ["canAccessSudo", "canManageTeam"],
  upsert_slot_skill: ["canAccessSudo", "canManageTeam"],
  add_tm_preference: ["canAccessSudo", "canManageTeam"],
  delete_tm_preference: ["canAccessSudo", "canManageTeam"],
  add_tm_accommodation: ["canAccessSudo", "canManageTeam"],
  delete_tm_accommodation: ["canAccessSudo", "canManageTeam"],
  // Night schedule status (board-adjacent) — assignment editors
  update_night_tm_status: "canEditAssignments",
  // Engine config is sudo-only
  update_engine_config: "canAccessSudo",
  add_slot_default_task: "canAccessSudo",
  remove_slot_default_task: "canAccessSudo",
  upsert_slot_default: "canAccessSudo",
  bulk_upsert_slot_defaults: "canAccessSudo",
};

function requireBodyTmId(body: Record<string, unknown>): string {
  const raw = body.tmId;
  if (raw == null) throw new Error("tmId is required");
  const tmId = String(raw).trim();
  if (!tmId || tmId === "undefined" || tmId === "null") {
    throw new Error("tmId is required");
  }
  return tmId;
}

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

  const session = Array.isArray(permission)
    ? await requireOpsAnyPermission(request, permission)
    : await requireOpsPermission(request, permission);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  // Night published/draft policy: run when any required key is a board-edit bit
  // (works for string keys and future OR-arrays that include those keys).
  const permissionKeys = Array.isArray(permission) ? permission : [permission];
  if (
    permissionKeys.some((p) => p === "canEditAssignments" || p === "canLockUnlock")
  ) {
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
      case "set_tm_grave_pool": {
        const tmId = requireBodyTmId(body);
        const raw = body.value;
        const value: GravePoolValue =
          raw === null || raw === undefined || raw === ""
            ? null
            : (String(raw) as Exclude<GravePoolValue, null>);
        const result = await setTMGravePoolServer(tmId, value);
        try {
          await revalidateRosterCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json(result);
      }
      case "set_tm_display_name": {
        const tmId = requireBodyTmId(body);
        const displayName = String(body.displayName ?? body.newDisplayName ?? "");
        const result = await setTMDisplayNameServer(tmId, displayName);
        try {
          await revalidateRosterCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json(result);
      }

      case "update_night_tm_status": {
        const result = await updateNightTmStatusServer({
          nightId: String(body.nightId ?? ""),
          tmId: requireBodyTmId(body),
          status: String(body.status ?? ""),
          note: body.note != null ? String(body.note) : null,
          tmName: body.tmName != null ? String(body.tmName) : null,
        });
        await bustCache(body.date as string | undefined);
        return NextResponse.json(result);
      }
      case "upsert_tm_profile": {
        const result = await upsertTMServer({
          tmId: body.tmId != null && String(body.tmId).trim() ? String(body.tmId) : undefined,
          displayName: String(body.displayName ?? ""),
          fullName: (body.fullName as string | null | undefined) ?? null,
          employeeName: (body.employeeName as string | null | undefined) ?? null,
          active: body.active as boolean | undefined,
          gravePool: (body.gravePool as string | null | undefined) ?? null,
          primarySection: (body.primarySection as string | null | undefined) ?? null,
          gender: (body.gender as "M" | "F" | null | undefined) ?? null,
          tieBreakRank: body.tieBreakRank as number | null | undefined,
          skillScore: body.skillScore as number | null | undefined,
          status: body.status as string | undefined,
          slotPreference: (body.slotPreference as string | null | undefined) ?? null,
          notes: (body.notes as string | null | undefined) ?? null,
        });
        try {
          await revalidateRosterCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json(result);
      }
      case "soft_delete_tm": {
        const tmId = requireBodyTmId(body);
        const reason = (body.reason as SoftDeleteReason | undefined) ?? "separated";
        const result = await softDeleteTMServer(tmId, reason);
        try {
          await revalidateRosterCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json(result);
      }
      case "restore_tm": {
        const result = await restoreTMServer(requireBodyTmId(body));
        try {
          await revalidateRosterCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json(result);
      }
      case "upsert_slot_skill": {
        const result = await upsertSlotSkillServer({
          tmId: requireBodyTmId(body),
          slotId: String(body.slotId ?? ""),
          score: Number(body.score),
        });
        try {
          await revalidateRosterCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json(result);
      }
      case "add_tm_preference": {
        const result = await addTMPreferenceServer({
          tmId: requireBodyTmId(body),
          stance: String(body.stance ?? ""),
          strength: String(body.strength ?? ""),
          target: String(body.target ?? ""),
          note: body.note != null ? String(body.note) : null,
        });
        try {
          await revalidateRosterCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json(result);
      }
      case "delete_tm_preference": {
        const result = await deleteTMPreferenceServer(String(body.id ?? ""));
        try {
          await revalidateRosterCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json(result);
      }
      case "add_tm_accommodation": {
        const result = await addTMAccommodationServer({
          tmId: requireBodyTmId(body),
          type: String(body.type ?? ""),
          severity: String(body.severity ?? ""),
          target: body.target != null ? String(body.target) : null,
          note: String(body.note ?? ""),
          status: body.status != null ? String(body.status) : undefined,
        });
        try {
          await revalidateRosterCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json(result);
      }
      case "delete_tm_accommodation": {
        const result = await deleteTMAccommodationServer(String(body.id ?? ""));
        try {
          await revalidateRosterCache();
        } catch {
          /* non-fatal */
        }
        return NextResponse.json(result);
      }
      case "update_engine_config": {
        const result = await updateActiveEngineConfigServer({
          placementMethod: body.placementMethod as string | undefined,
          grokReasoningEffort: body.grokReasoningEffort as string | undefined,
          notes: body.notes as string | null | undefined,
          weights: body.weights as Record<string, number> | undefined,
          eligibilityRules: body.eligibilityRules as unknown[] | undefined,
        });
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
      default:
        return NextResponse.json({ error: "Unhandled mutation" }, { status: 500 });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Mutation failed";
    console.error("[shiftbuilder/mutations]", action, err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}