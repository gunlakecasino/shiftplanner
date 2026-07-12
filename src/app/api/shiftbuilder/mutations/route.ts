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
  getOrCreateNightForDateServer,
  markTmCallOffServer,
  unmarkTmCallOffServer,
  clearPlacementHistoryForSlotServer,
  recordPlacementHistoryServer,
  refreshTmZoneMatrixServer,
  removeNightCardBorderServer,
  removeNightSlotTaskServer,
  moveNightSlotTaskServer,
  replaceAllNightSlotTasksServer,
  replaceNightSlotTasksForSlotServer,
  applyOverlapTasksToNightServer,
  restoreTMServer,
  saveNightNotesServer,
  seedDefaultBreaksForNightServer,
  setNightCardBorderServer,
  setNightLockedServer,
  setNightPublishedServer,
  setTMDisplayNameServer,
  setTMGravePoolServer,
  softDeleteTMServer,
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
  type GravePoolValue,
} from "@/lib/shiftbuilder/opsMutations.server";
import { ProposalValidationError } from "@/lib/shiftbuilder/validateAssignments.server";
import { revalidateNightBoardCaches, revalidateSlotDefaultsCache } from "@/lib/shiftbuilder/revalidateOpsCache";
import {
  addSlotDefaultTaskServer,
  bulkUpsertSlotDefaultsServer,
  removeSlotDefaultTaskServer,
  upsertSlotDefaultServer,
} from "@/lib/shiftbuilder/slotDefaultsMutations.server";
import type { SlotDefault } from "@/lib/shiftbuilder/data";
import {
  loadOpsKnowledgeServer,
  loadRecentAiFeedbackServer,
  saveAiFeedbackServer,
  saveOpsKnowledgeServer,
} from "@/lib/shiftbuilder/opsKnowledge/opsKnowledge.server";

/** Single permission or any-of list (sudo/manage-team identity surfaces). */
type ActionPerm = PermissionKey | "authenticated" | PermissionKey[];

const ACTION_PERMISSIONS: Record<string, ActionPerm> = {
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
  apply_overlap_tasks: "canAccessSudo",
  mark_tm_call_off: "canEditAssignments",
  unmark_tm_call_off: "canEditAssignments",
  add_slot_default_task: "canAccessSudo",
  remove_slot_default_task: "canAccessSudo",
  upsert_slot_default: "canAccessSudo",
  bulk_upsert_slot_defaults: "canAccessSudo",
  // Team / sudo identity
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
  update_night_tm_status: "canEditAssignments",
  update_engine_config: "canAccessSudo",
  // Board residual
  save_night_notes: "canEditAssignments",
  get_or_create_night: "canEditAssignments",
  seed_default_breaks: "canEditAssignments",
  record_placement_history: "canEditAssignments",
  refresh_tm_zone_matrix: "canEditAssignments",
  // Knowledge / AI feedback
  load_ops_knowledge: "authenticated",
  save_ops_knowledge: "canAccessSudo",
  load_ai_feedback: "authenticated",
  save_ai_feedback: "canEditAssignments",
  // Batch planner
  batch_run_engine_week: "canRunEngine",
  batch_run_engine_night: "canRunEngine",
  list_batch_weeks: "canRunEngine",
  list_batch_nights: "canRunEngine",
};

function needsNightEditGate(perm: ActionPerm): boolean {
  const keys = Array.isArray(perm) ? perm : [perm];
  return keys.some((k) => k === "canEditAssignments" || k === "canLockUnlock");
}

async function resolveSession(request: NextRequest, perm: ActionPerm) {
  if (Array.isArray(perm)) {
    return requireOpsAnyPermission(request, perm);
  }
  return requireOpsPermission(request, perm);
}

async function resolveIsoDateFromBody(body: Record<string, unknown>): Promise<string | undefined> {
  if (typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.date)) {
    return body.date.slice(0, 10);
  }
  const nightId =
    typeof body.nightId === "string"
      ? body.nightId
      : typeof body.targetNightId === "string"
        ? body.targetNightId
        : null;
  if (!nightId) return undefined;
  try {
    const { createAdminClientSafe } = await import("@/app/api/admin/_lib/createAdminClient");
    const client = createAdminClientSafe();
    if (!client) return undefined;
    const { data } = await client
      .from("nights")
      .select("night_date")
      .eq("id", nightId)
      .maybeSingle();
    const raw = data?.night_date != null ? String(data.night_date) : "";
    return raw ? raw.slice(0, 10) : undefined;
  } catch {
    return undefined;
  }
}

async function bustCache(body: Record<string, unknown>) {
  try {
    const date = await resolveIsoDateFromBody(body);
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

  const session = await resolveSession(request, permission);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  if (needsNightEditGate(permission)) {
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
        await bustCache(body);
        return NextResponse.json(result);
      }
      case "delete_zone_assignment": {
        const result = await deleteZoneAssignmentServer(body as never);
        await bustCache(body);
        return NextResponse.json(result);
      }
      case "batch_apply_draft": {
        const result = await batchApplyDraftAssignmentsServer(
          String(body.nightId),
          (body.slots as never[]) ?? [],
          body.date != null ? String(body.date) : null,
          body.expectedUpdatedAt != null ? String(body.expectedUpdatedAt) : null,
        );
        await bustCache(body);
        return NextResponse.json(result);
      }
      case "toggle_assignment_lock": {
        const result = await toggleAssignmentLockServer(body as never);
        await bustCache(body);
        return NextResponse.json(result);
      }
      case "set_night_locked": {
        await setNightLockedServer(String(body.nightId), Boolean(body.locked));
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "set_night_published": {
        await setNightPublishedServer(String(body.nightId), Boolean(body.published));
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "set_night_card_border": {
        await setNightCardBorderServer(
          String(body.nightId),
          String(body.slotKey),
          String(body.color),
        );
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "remove_night_card_border": {
        await removeNightCardBorderServer(String(body.nightId), String(body.slotKey));
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "upsert_break_assignment": {
        await upsertBreakAssignmentServer(body as never);
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "delete_break_assignment": {
        await deleteBreakAssignmentServer(String(body.nightId), String(body.tmId));
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "add_night_slot_task": {
        await addNightSlotTaskServer(body as never);
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "remove_night_slot_task": {
        await removeNightSlotTaskServer(body as never);
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "move_night_slot_task": {
        await moveNightSlotTaskServer(body as never);
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "update_night_slot_task_color": {
        await updateNightSlotTaskColorServer(
          String(body.nightId),
          String(body.slotKey),
          String(body.taskLabel ?? ""),
          (body.color as string | null) ?? null,
          (body.rrSide as "mens" | "womens" | null) ?? null,
          body.markerType as "highlight" | "underline" | "circle" | "none" | null | undefined,
          (body.taskId as string | null | undefined) ?? null,
        );
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "update_night_slot_task_style": {
        await updateNightSlotTaskStyleServer(
          String(body.nightId),
          String(body.slotKey),
          String(body.taskLabel ?? ""),
          (body.textStyle as Record<string, unknown> | null) ?? null,
          (body.rrSide as "mens" | "womens" | null) ?? null,
          (body.taskId as string | null | undefined) ?? null,
        );
        await bustCache(body);
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
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "update_night_slot_task_label": {
        await updateNightSlotTaskLabelServer(
          String(body.nightId),
          String(body.slotKey),
          String(body.oldLabel ?? ""),
          String(body.newLabel),
          (body.rrSide as "mens" | "womens" | null) ?? null,
          (body.taskId as string | null | undefined) ?? null,
        );
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "replace_night_slot_tasks_for_slot": {
        const applied = await replaceNightSlotTasksForSlotServer(body as never);
        await bustCache(body);
        return NextResponse.json({ ok: true, applied });
      }
      case "replace_all_night_slot_tasks": {
        await replaceAllNightSlotTasksServer(
          String(body.nightId),
          (body.tasks as never[]) ?? [],
        );
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "apply_overlap_tasks": {
        const preview = body.preview === true;
        const result = await applyOverlapTasksToNightServer(String(body.nightId), {
          bands: Array.isArray(body.bands)
            ? (body.bands as Array<"AM" | "PM">)
            : undefined,
          forceRandom: body.forceRandom === true,
          preview,
        });
        // Preview is read-only; skip night cache bust so board doesn't flash.
        if (!preview) await bustCache(body);
        return NextResponse.json({ ok: true, ...result });
      }
      case "mark_tm_call_off": {
        const result = await markTmCallOffServer({
          nightId: String(body.nightId),
          tmId: String(body.tmId),
          date: String(body.date),
          reason: body.reason != null ? String(body.reason) : null,
        });
        await bustCache(body);
        return NextResponse.json(result);
      }
      case "unmark_tm_call_off": {
        const result = await unmarkTmCallOffServer({
          tmId: String(body.tmId),
          date: String(body.date),
        });
        await bustCache(body);
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

      // ── Team / sudo ──────────────────────────────────────────────
      case "set_tm_grave_pool": {
        await setTMGravePoolServer(
          String(body.tmId),
          (body.value ?? null) as GravePoolValue,
        );
        return NextResponse.json({ ok: true });
      }
      case "set_tm_display_name": {
        await setTMDisplayNameServer(
          String(body.tmId),
          String(body.displayName ?? body.newDisplayName ?? ""),
        );
        return NextResponse.json({ ok: true });
      }
      case "upsert_tm_profile": {
        const result = await upsertTMServer(body as never);
        return NextResponse.json(result);
      }
      case "soft_delete_tm": {
        await softDeleteTMServer(String(body.tmId), (body.reason as never) ?? "separated");
        return NextResponse.json({ ok: true });
      }
      case "restore_tm": {
        await restoreTMServer(String(body.tmId));
        return NextResponse.json({ ok: true });
      }
      case "upsert_slot_skill": {
        await upsertSlotSkillServer({
          tmId: String(body.tmId),
          slotId: String(body.slotId),
          score: Number(body.score),
        });
        return NextResponse.json({ ok: true });
      }
      case "add_tm_preference": {
        await addTMPreferenceServer(body as never);
        return NextResponse.json({ ok: true });
      }
      case "delete_tm_preference": {
        await deleteTMPreferenceServer(String(body.id));
        return NextResponse.json({ ok: true });
      }
      case "add_tm_accommodation": {
        await addTMAccommodationServer(body as never);
        return NextResponse.json({ ok: true });
      }
      case "delete_tm_accommodation": {
        await deleteTMAccommodationServer(String(body.id));
        return NextResponse.json({ ok: true });
      }
      case "update_night_tm_status": {
        await updateNightTmStatusServer(body as never);
        await bustCache(body);
        return NextResponse.json({ ok: true });
      }
      case "update_engine_config": {
        await updateActiveEngineConfigServer(body as never);
        return NextResponse.json({ ok: true });
      }

      // ── Board residual (P1) ──────────────────────────────────────
      case "save_night_notes": {
        const result = await saveNightNotesServer(
          String(body.nightId),
          String(body.notes ?? ""),
        );
        await bustCache(body);
        return NextResponse.json(result);
      }
      case "get_or_create_night": {
        const result = await getOrCreateNightForDateServer({
          date: String(body.date),
          dayName: String(body.dayName ?? ""),
        });
        await bustCache(body);
        return NextResponse.json(result);
      }
      case "seed_default_breaks": {
        const result = await seedDefaultBreaksForNightServer(String(body.nightId));
        await bustCache(body);
        return NextResponse.json(result);
      }
      case "record_placement_history": {
        try {
          // Singular night×slot ownership: clear any prior TM, then insert.
          const nightId = String((body as { nightId?: string }).nightId ?? "");
          const slotKey = String((body as { slotKey?: string }).slotKey ?? "");
          const slotType = String((body as { slotType?: string }).slotType ?? "zone");
          const rrSide =
            (body as { rrSide?: string | null }).rrSide ?? null;
          if (nightId && slotKey) {
            await clearPlacementHistoryForSlotServer({
              nightId,
              slotKey,
              slotType,
              rrSide,
            });
          }
          await recordPlacementHistoryServer(body as never);
        } catch (e) {
          // Soft-fail history so apply path is never blocked by matrix side-effects.
          console.warn("[mutations] record_placement_history", e);
        }
        return NextResponse.json({ ok: true });
      }
      case "refresh_tm_zone_matrix": {
        try {
          const tmId = String(body.tmId ?? "");
          const lookbackWeeks =
            body.lookbackWeeks != null ? Number(body.lookbackWeeks) : 12;
          await refreshTmZoneMatrixServer(tmId, lookbackWeeks);
        } catch (e) {
          console.warn("[mutations] refresh_tm_zone_matrix", e);
        }
        return NextResponse.json({ ok: true });
      }

      // ── Knowledge ────────────────────────────────────────────────
      case "load_ops_knowledge": {
        const knowledge = await loadOpsKnowledgeServer();
        return NextResponse.json({ knowledge });
      }
      case "save_ops_knowledge": {
        await saveOpsKnowledgeServer(body.knowledge as never);
        return NextResponse.json({ ok: true });
      }
      case "load_ai_feedback": {
        const examples = await loadRecentAiFeedbackServer(
          body.limit != null ? Number(body.limit) : 40,
        );
        return NextResponse.json({ examples });
      }
      case "save_ai_feedback": {
        await saveAiFeedbackServer(body as never);
        return NextResponse.json({ ok: true });
      }

      // ── Batch planner (P0) ───────────────────────────────────────
      case "batch_run_engine_week": {
        const { batchRunEngineForWeekServer } = await import(
          "@/lib/shiftbuilder/sudoBatchPlanner.server"
        );
        const result = await batchRunEngineForWeekServer(
          String(body.weekId),
          (body.options as never) ?? {},
        );
        return NextResponse.json(result);
      }
      case "batch_run_engine_night": {
        const { batchRunEngineForNightServer } = await import(
          "@/lib/shiftbuilder/sudoBatchPlanner.server"
        );
        const result = await batchRunEngineForNightServer(
          String(body.nightId),
          (body.options as never) ?? {},
        );
        return NextResponse.json(result);
      }
      case "list_batch_weeks": {
        const { listWeeksWithNightsServer } = await import(
          "@/lib/shiftbuilder/sudoBatchPlanner.server"
        );
        const weeks = await listWeeksWithNightsServer();
        return NextResponse.json({ weeks });
      }
      case "list_batch_nights": {
        const { listNightsForWeekServer } = await import(
          "@/lib/shiftbuilder/sudoBatchPlanner.server"
        );
        const nights = await listNightsForWeekServer(String(body.weekId));
        return NextResponse.json({ nights });
      }

      default:
        return NextResponse.json({ error: "Unhandled mutation" }, { status: 500 });
    }
  } catch (err: unknown) {
    const isProposalValidation =
      err instanceof ProposalValidationError ||
      (err instanceof Error &&
        err.name === "ProposalValidationError" &&
        Array.isArray((err as ProposalValidationError).invalid));
    if (isProposalValidation) {
      const pe = err as ProposalValidationError;
      console.warn("[shiftbuilder/mutations] assignment rejected", pe.invalid);
      return NextResponse.json(
        { error: pe.message, invalid: pe.invalid, valid: false },
        { status: 400 },
      );
    }
    const msg = err instanceof Error ? err.message : "Mutation failed";
    console.error("[shiftbuilder/mutations]", action, err);
    const status =
      msg.includes("another operator") || msg.includes("reload")
        ? 409
        : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
