/**
 * Server-side night-core bundle for ShiftBuilder.
 * One parallel Supabase burst close to Postgres — consumed by /api/shiftbuilder/night-core.
 *
 * Always uses the service-role admin client (session APIs already gate access).
 * Do NOT cache assignment payloads with unstable_cache — that caused production
 * "edits vanish on refresh/poll" when revalidateTag lagged multi-replica deploys.
 */

import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentShiftDate, parseLocalDateISO, sameDay } from "./dateUtils";
import {
  buildSlotDefaultBreakMap,
  enrichAssignmentsWithBreakGroups,
  slotDefaultBreakMapToRecord,
} from "./breakGroupResolve";
import {
  buildGravesScheduleRosterRows,
  getScheduledTmsFromGravesDefault,
} from "./gravesDefaultSchedule";
import {
  getCachedActiveTeamMembers,
  getCachedGraveAvailableTeamMembers,
  getCachedNightIdForDate,
  getCachedSlotDefaults,
} from "./data.server";
import type { AuxDef } from "./placement";
import {
  resolveAuxLayout,
  remapAssignmentsToAuxKeys,
  ensureAuxShellsForAssignmentKeys,
  defaultAuxDefsForNewNight,
} from "./auxLayout";

function getBundleSupabase(): SupabaseClient {
  const client = createAdminClientSafe();
  if (!client) {
    throw new Error(
      "Night-core requires SUPABASE_SERVICE_ROLE_KEY (session APIs must not read board data with the anon key)",
    );
  }
  return client;
}

async function fetchAssignmentsForNight(
  nightId: string,
  nameById: Map<string, string>,
): Promise<any[]> {
  const supabase = getBundleSupabase();
  const { data: rows, error } = await supabase
    .from("zone_assignments")
    .select(
      "night_id, slot_key, slot_type, tm_id, rr_side, is_locked, is_filled, updated_at, sort_order, break_group, additional_coverage_slots",
    )
    .eq("night_id", nightId)
    .order("sort_order", { ascending: true })
    .order("slot_key", { ascending: true });

  if (error) {
    console.error("[nightCoreBundle] zone_assignments fetch failed", {
      nightId,
      message: error.message,
      code: error.code,
    });
    throw new Error(`Failed to load zone_assignments: ${error.message}`);
  }
  if (!rows?.length) return [];

  return rows.map((row: any) => ({
    slotKey: row.slot_key,
    tmId: row.tm_id || null,
    tmName: row.tm_id ? nameById.get(row.tm_id) : undefined,
    slotType: row.slot_type || "zone",
    rrSide: row.rr_side || null,
    isLocked: !!row.is_locked,
    isFilled: !!row.is_filled,
    updatedAt: row.updated_at,
    breakGroup: row.break_group ?? null,
    additionalCoverageSlots: Array.isArray(row.additional_coverage_slots)
      ? row.additional_coverage_slots.filter((slot: unknown): slot is string => typeof slot === "string")
      : [],
  }));
}

async function fetchOnScheduleTmIds(
  nightId: string,
  shiftDate: string,
): Promise<Set<string>> {
  const tmIdSet = new Set<string>();
  const supabase = getBundleSupabase();

  const shiftDateObj = shiftDate ? new Date(`${shiftDate}T12:00:00Z`) : null;
  const nextDateStr: string | null = (() => {
    if (!shiftDateObj || isNaN(shiftDateObj.getTime())) return null;
    const d = new Date(shiftDateObj);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const [tonightStatusRes, tomorrowNightRes] = await Promise.all([
    supabase.from("night_tm_status").select("tm_id, status").eq("night_id", nightId),
    nextDateStr
      ? supabase.from("nights").select("id").eq("night_date", nextDateStr).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  (tonightStatusRes.data || [])
    .filter((r: any) => !r.status || ["present", "scheduled"].includes(r.status))
    .forEach((r: any) => r.tm_id && tmIdSet.add(r.tm_id));

  if (tomorrowNightRes.data?.id) {
    const { data: nextDayStatus } = await supabase
      .from("night_tm_status")
      .select("tm_id, status")
      .eq("night_id", tomorrowNightRes.data.id);

    const nextWorkingTmIds = (nextDayStatus || [])
      .filter((r: any) => !r.status || ["present", "scheduled"].includes(r.status))
      .map((r: any) => r.tm_id)
      .filter(Boolean);

    if (nextWorkingTmIds.length > 0) {
      const { data: amProfiles } = await supabase
        .from("tm_profiles")
        .select("tm_id")
        .in("tm_id", nextWorkingTmIds)
        .eq("grave_pool", "AM")
        .eq("active", true);
      (amProfiles || []).forEach((r: any) => r.tm_id && tmIdSet.add(r.tm_id));
    }
  }

  if (tmIdSet.size > 0) return tmIdSet;

  const { data: nightRow } = await supabase
    .from("nights")
    .select("week_id")
    .eq("id", nightId)
    .single();

  if (!nightRow?.week_id) return tmIdSet;

  const { data: weekNights } = await supabase
    .from("nights")
    .select("id")
    .eq("week_id", nightRow.week_id);

  if (!weekNights?.length) return tmIdSet;

  const nightIds = weekNights.map((n: any) => n.id);
  const [zoneRes, breakRes, overlapRes] = await Promise.all([
    supabase.from("zone_assignments").select("tm_id").in("night_id", nightIds).not("tm_id", "is", null),
    supabase.from("break_assignments").select("tm_id").in("night_id", nightIds).not("tm_id", "is", null),
    supabase.from("overlap_assignments").select("tm_id").in("night_id", nightIds).not("tm_id", "is", null),
  ]);

  (zoneRes.data || []).forEach((r: any) => r.tm_id && tmIdSet.add(r.tm_id));
  (breakRes.data || []).forEach((r: any) => r.tm_id && tmIdSet.add(r.tm_id));
  (overlapRes.data || []).forEach((r: any) => r.tm_id && tmIdSet.add(r.tm_id));

  return tmIdSet;
}

export type NightCoreBundlePayload = {
  nightId: string | null;
  /** Night-level lifecycle: draft | published | archived | locked (nights.status). */
  status?: string | null;
  /** Night-level lock (nights.is_locked). When true, board writes must be blocked client-side. */
  isLocked?: boolean;
  /** Night row updated_at — optimistic concurrency for batch_apply_draft. */
  updatedAt?: string | null;
  assignments: Record<string, any>;
  auxDefs: AuxDef[];
  members: any[];
  scheduledTmIdsTonight: string[];
  realRoster: any[];
  graveRoster: any[];
  /** Canonical TM rail pool — graves_default_schedule (+ night_on_call) only. */
  gravesScheduleRoster: any[];
  fullGraveScheduledTonight: string[];
  pmOverlapScheduledTonight: string[];
  amOverlapScheduledTonight: string[];
  overlapBreakTmIdsTonight: string[];
  rawDbAssignments: any[];
  rawBreakRows: any[];
  slotDefaultBreaks: Record<string, number>;
};

async function fetchAuxLayoutForNight(nightId: string): Promise<unknown | null> {
  const supabase = getBundleSupabase();
  const { data, error } = await supabase
    .from("nights")
    .select("aux_layout")
    .eq("id", nightId)
    .maybeSingle();
  if (error) {
    console.warn("[nightCoreBundle] aux_layout fetch failed", error.message);
    return null;
  }
  return data?.aux_layout ?? null;
}

async function fetchNightMeta(
  nightId: string | null,
  isoDate: string,
): Promise<{ status: string | null; isLocked: boolean; updatedAt: string | null }> {
  const supabase = getBundleSupabase();
  // Prefer id; fall back to date so callers always get meta when a night row exists.
  const query = nightId
    ? supabase.from("nights").select("status, is_locked, updated_at").eq("id", nightId).maybeSingle()
    : supabase.from("nights").select("status, is_locked, updated_at").eq("night_date", isoDate).maybeSingle();
  const { data, error } = await query;
  if (error) {
    console.warn("[nightCoreBundle] night meta fetch failed", error.message);
    return { status: null, isLocked: false, updatedAt: null };
  }
  return {
    status: (data as any)?.status ?? null,
    isLocked: !!(data as any)?.is_locked,
    updatedAt: (data as any)?.updated_at ?? null,
  };
}

async function buildNightCoreBundleUncached(
  isoDate: string,
  options: { printOnly?: boolean } = {},
): Promise<NightCoreBundlePayload> {
  const nightDate = new Date(`${isoDate}T12:00:00`);
  const printOnly = options.printOnly === true;

  const [nightId, graveMembers, slotDefaults, allMembers] = await Promise.all([
    getCachedNightIdForDate(isoDate),
    printOnly ? Promise.resolve([]) : getCachedGraveAvailableTeamMembers(),
    getCachedSlotDefaults(),
    getCachedActiveTeamMembers(),
  ]);

  const nameById = new Map(allMembers.map((m) => [m.id, m.name]));

  const [dbAssignments, weekOnScheduleSet, scheduled] = await Promise.all([
    nightId ? fetchAssignmentsForNight(nightId, nameById) : Promise.resolve([]),
    nightId && !printOnly ? fetchOnScheduleTmIds(nightId, isoDate) : Promise.resolve(new Set<string>()),
    getScheduledTmsFromGravesDefault(nightDate, nightId),
  ]);

  const defaultBreakMap = buildSlotDefaultBreakMap(slotDefaults as any);
  const overlapBreakTmIds = new Set<string>();
  for (const tm of scheduled.overlapBreakScheduled || []) {
    if (tm.id) overlapBreakTmIds.add(tm.id);
    if (tm.tmId) overlapBreakTmIds.add(tm.tmId);
  }
  const legacyAssignments = enrichAssignmentsWithBreakGroups(
    dbAssignments,
    defaultBreakMap,
    overlapBreakTmIds,
  );

  const storedAuxLayout = nightId ? await fetchAuxLayoutForNight(nightId) : null;
  let auxDefs = storedAuxLayout
    ? resolveAuxLayout(storedAuxLayout, dbAssignments)
    : nightId
      ? resolveAuxLayout(null, dbAssignments)
      : defaultAuxDefsForNewNight();
  // Ensure shells exist for every DB aux assignment (step_up, admin, …) so TMs
  // never land on a key the board does not render (e.g. STEP vs AUX3).
  auxDefs = ensureAuxShellsForAssignmentKeys(auxDefs, Object.keys(legacyAssignments));
  const assignments = remapAssignmentsToAuxKeys(legacyAssignments, auxDefs);

  const members = printOnly
    ? []
    : allMembers.map((tm) => ({
        ...tm,
        isOnSchedule: weekOnScheduleSet.has(tm.id),
      }));

  const graveRoster = printOnly
    ? []
    : graveMembers.map((m) => ({
        ...m,
        isOnWeek: weekOnScheduleSet.has(m.id),
        isPMOverlap: m.gravePool === "PM",
        isAMOverlap: m.gravePool === "AM",
      }));

  const scheduledId = (t: any) => t.tmId || t.tm_id || t.id;
  const fullGrave = new Set((scheduled.fullGraveScheduled || []).map(scheduledId));
  const pmOverlap = new Set((scheduled.pmOverlapScheduled || []).map(scheduledId));
  const amOverlap = new Set((scheduled.amOverlapScheduled || []).map(scheduledId));
  const allScheduled = new Set((scheduled.allScheduled || []).map(scheduledId));

  const enrichRoster = (list: any[]) =>
    list.map((m) => ({
      ...m,
      isPMOverlapTonight: pmOverlap.has(m.id),
      isAMOverlapTonight: amOverlap.has(m.id),
      isFullGraveTonight: fullGrave.has(m.id),
    }));

  const gravesScheduleRoster = printOnly ? [] : buildGravesScheduleRosterRows(scheduled, allMembers);

  const nightMeta = await fetchNightMeta(nightId, isoDate);

  return {
    nightId,
    status: nightMeta.status,
    isLocked: nightMeta.isLocked,
    updatedAt: nightMeta.updatedAt,
    assignments,
    auxDefs,
    members,
    scheduledTmIdsTonight: Array.from(allScheduled),
    realRoster: enrichRoster(members),
    graveRoster: enrichRoster(graveRoster),
    gravesScheduleRoster,
    fullGraveScheduledTonight: Array.from(fullGrave),
    pmOverlapScheduledTonight: Array.from(pmOverlap),
    amOverlapScheduledTonight: Array.from(amOverlap),
    overlapBreakTmIdsTonight: Array.from(overlapBreakTmIds),
    rawDbAssignments: dbAssignments,
    rawBreakRows: [],
    slotDefaultBreaks: slotDefaultBreakMapToRecord(defaultBreakMap),
  };
}

/** /today policy: tonight always allowed; historical nights require published status. */
export async function isNightCoreAllowedForTodayPolicy(isoDate: string): Promise<boolean> {
  const target = parseLocalDateISO(isoDate);
  if (sameDay(target, currentShiftDate())) return true;

  const supabase = getBundleSupabase();
  const { data, error } = await supabase
    .from("nights")
    .select("status")
    .eq("night_date", isoDate)
    .maybeSingle();

  if (error) {
    console.warn("[night-core] today policy status check failed", error);
    return false;
  }
  return data?.status === "published";
}

/**
 * Fresh night-core payload for the builder critical path.
 * Intentionally uncached: board mutations must be visible on the next poll/refresh.
 * Roster/slot-defaults inside the builder still use short-lived data.server caches.
 */
export async function getNightCoreBundleForDate(
  isoDate: string,
  options: { printOnly?: boolean } = {},
): Promise<NightCoreBundlePayload> {
  return buildNightCoreBundleUncached(isoDate, options);
}
