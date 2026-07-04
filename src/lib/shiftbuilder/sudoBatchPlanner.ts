"use server";

/**
 * Batch placement engine + week/night listing for Sudo Batch Planner.
 * Split from sudoActions.ts so lightweight Sudo tabs (Engine Config, Weekly Roster)
 * do not statically pull placement → scoring → data.ts into the client graph.
 */

import { supabase } from "../supabase";
import { getFullyResolvedEngineConfig } from "./engineOverrides";
import {
  getSlotsInPlacementOrder,
  logEngineRunSummary,
} from "./placement";
import { runNightEngineFromClient, nightResultToLegacyDraft } from "./engine/adapters";
import { uiToDb, dbToUi } from "./slot-keys";
import type { ZoneDetailEntry } from "./data";

type GraveTm = Awaited<
  ReturnType<typeof import("./data").getGraveAvailableTeamMembers>
>[number];

export interface BatchNightResult {
  nightId: string;
  nightDate: string;
  dayName: string;
  status: "ok" | "skip" | "error";
  /** Number of slots the engine proposed and wrote. */
  assigned: number;
  /** Slots already filled / locked — left untouched. */
  preserved: number;
  /** Slots the engine couldn't fill (no eligible candidate). */
  unfilled: number;
  notes: string[];
  errorMessage?: string;
}

export interface BatchWeekResult {
  weekId: string;
  weekEnding: string;
  nights: BatchNightResult[];
  totalAssigned: number;
  totalPreserved: number;
  totalUnfilled: number;
}

type WeekPlacementEntry = { nightDate: string; slotKey: string; tmId: string };

/** Exported for reuse by the read-only week-preview action in actions.ts. */
export async function loadPlacementHistoriesForRoster(
  tmIds: string[],
): Promise<Record<string, ZoneDetailEntry | null>> {
  if (tmIds.length === 0) return {};
  const { getTmPlacementHistory } = await import("./data");
  const histories: Record<string, ZoneDetailEntry | null> = {};
  const CHUNK = 16;
  for (let i = 0; i < tmIds.length; i += CHUNK) {
    const chunk = tmIds.slice(i, i + CHUNK);
    await Promise.all(
      chunk.map(async (tmId) => {
        histories[tmId] = await getTmPlacementHistory(tmId, 30);
      }),
    );
  }
  return histories;
}

/** All zone/RR assignments in a week — used to merge in-week trails before each night. */
async function loadWeekPlacementEntries(
  nightRows: Array<{ id: string; night_date: string }>,
): Promise<WeekPlacementEntry[]> {
  if (nightRows.length === 0) return [];
  const nightIdToDate = new Map(
    nightRows.map((n) => [String(n.id), String(n.night_date)]),
  );
  const { data: assignRows, error } = await supabase
    .from("zone_assignments")
    .select("night_id, slot_key, slot_type, rr_side, tm_id")
    .in("night_id", [...nightIdToDate.keys()])
    .not("tm_id", "is", null);
  if (error || !assignRows?.length) return [];

  const entries: WeekPlacementEntry[] = [];
  for (const row of assignRows as Array<{
    night_id: string;
    slot_key: string;
    slot_type: string;
    rr_side: string | null;
    tm_id: string;
  }>) {
    const nightDate = nightIdToDate.get(String(row.night_id));
    if (!nightDate || !row.tm_id) continue;
    try {
      const slotKey = dbToUi(row.slot_key, row.slot_type ?? "zone", row.rr_side ?? null);
      entries.push({ nightDate, slotKey, tmId: String(row.tm_id) });
    } catch {
      /* skip unrecognized slot */
    }
  }
  return entries;
}

function buildWeeklyRecentHistoryForNight(
  weekEntries: WeekPlacementEntry[],
  tonightIso: string,
): Map<string, Array<{ nightDate: string; slotKey: string }>> {
  const map = new Map<string, Array<{ nightDate: string; slotKey: string }>>();
  for (const e of weekEntries) {
    if (e.nightDate >= tonightIso) continue;
    if (!map.has(e.tmId)) map.set(e.tmId, []);
    map.get(e.tmId)!.push({ nightDate: e.nightDate, slotKey: e.slotKey });
  }
  return map;
}

function mergeBatchNightIntoWeekEntries(
  weekEntries: WeekPlacementEntry[],
  nightDate: string,
  proposed: Record<string, string>,
): void {
  weekEntries.push(
    ...Object.entries(proposed)
      .filter(([, tmId]) => !!tmId)
      .map(([slotKey, tmId]) => ({ nightDate, slotKey, tmId })),
  );
}

export interface BatchRunOptions {
  /** If true, skip nights that already have ANY zone assignments (don't overwrite). */
  skipFilledNights?: boolean;
  /** If true, also skip nights with no TMs in the Graves Default Schedule for that date. */
  requireSchedule?: boolean;
  /**
   * If true, restrict the engine roster to only TMs whose names resolved in the
   * ADP schedule import (night_tm_status). Default: FALSE — the engine uses ALL
   * active grave-pool TMs so that name-matching gaps never starve the roster.
   * Turn this on only after you've confirmed the schedule import captured everyone.
   */
  filterBySchedule?: boolean;
}

/**
 * Run the weighted placement engine for every night in a week (or a single
 * specified night) and commit the proposals directly to zone_assignments.
 *
 * Does NOT run Grok — the batch runner is deterministic / weighted-only for
 * speed and predictability. Operator can always open a specific night in the
 * main board and run Grok there if they want an AI-assisted override.
 *
 * Behaviour per night:
 *   - Respects `is_locked = true` (never overwrites a locked slot)
 *   - Respects `skipFilledNights` — skips the whole night if ≥1 zone already set
 *   - Respects `requireSchedule` — skips the night if Graves Default Schedule has no TMs
 *   - Only writes slots that were EMPTY before the run (fills gaps, not overwrites)
 */
export async function batchRunEngineForWeek(
  weekId: string,
  options: BatchRunOptions = {}
): Promise<BatchWeekResult> {
  const { skipFilledNights = false, requireSchedule = false, filterBySchedule = false } = options;

  // Fetch the week's nights in chronological order
  const { data: nightRows, error: nightErr } = await supabase
    .from("nights")
    .select("id, night_date, day_name")
    .eq("week_id", weekId)
    .order("night_date", { ascending: true });
  if (nightErr) throw new Error(`batchRunEngineForWeek: could not fetch nights — ${nightErr.message}`);
  if (!nightRows || nightRows.length === 0) throw new Error("No nights found for this week.");

  // Load session-stable data once for the whole batch
  // zoneMatrix is preloaded here for future richer week-level orchestration
  // and to keep the data loading pattern consistent with per-night runs.
  const { getTMSkillScores, getSlotDifficultyRaw, getTMPreferences, getTMPairAffinities, getTMAccommodations, getGraveAvailableTeamMembers, getTmZoneMatrix } =
    await import("./data");

  const [engineConfig, skillScores, slotDifficulty, preferenceRows, pairAffinityRows, accommodationRows, grave, zoneMatrix] =
    await Promise.all([
      getFullyResolvedEngineConfig(),
      getTMSkillScores(),
      getSlotDifficultyRaw(),
      getTMPreferences(),
      getTMPairAffinities(),
      getTMAccommodations(),
      getGraveAvailableTeamMembers(),
      getTmZoneMatrix(),
    ]);

  // Build per-TM Maps once
  const prefByTm = new Map<string, any[]>();
  preferenceRows.forEach((r: any) => {
    if (!prefByTm.has(r.tmId)) prefByTm.set(r.tmId, []);
    prefByTm.get(r.tmId)!.push(r);
  });
  const pairByTm = new Map<string, any[]>();
  pairAffinityRows.forEach((r: any) => {
    if (!pairByTm.has(r.tmId)) pairByTm.set(r.tmId, []);
    pairByTm.get(r.tmId)!.push(r);
  });
  const accByTm = new Map<string, any[]>();
  accommodationRows.forEach((r: any) => {
    if (!accByTm.has(r.tmId)) accByTm.set(r.tmId, []);
    accByTm.get(r.tmId)!.push(r);
  });

  const results: BatchNightResult[] = [];
  const tmIds = grave.map((tm) => tm.id).filter(Boolean);
  const [placementHistories, weekPlacementEntries] = await Promise.all([
    loadPlacementHistoriesForRoster(tmIds),
    loadWeekPlacementEntries(nightRows as Array<{ id: string; night_date: string }>),
  ]);
  const mutableWeekEntries = [...weekPlacementEntries];

  for (const night of nightRows) {
    const nightId = String(night.id);
    const nightDate = String(night.night_date);
    const dayName = String(night.day_name ?? "");

    try {
      const nightResult = await runEngineForSingleNight({
        nightId,
        nightDate,
        dayName,
        grave,
        engineConfig,
        skillScores,
        slotDifficulty,
        prefByTm,
        pairByTm,
        accByTm,
        placementHistories,
        weeklyRecentHistory: buildWeeklyRecentHistoryForNight(mutableWeekEntries, nightDate),
        skipFilledNights,
        requireSchedule,
        filterBySchedule,
      });
      if (nightResult.status === "ok" && nightResult.assigned > 0) {
        const { getNightAssignments } = await import("@/lib/shiftbuilder/data");
        const fresh = await getNightAssignments(nightId);
        const proposed: Record<string, string> = {};
        for (const a of fresh) {
          if (!a.tmId) continue;
          try {
            const uiKey = dbToUi(a.slotKey, a.slotType ?? "zone", a.rrSide ?? null);
            proposed[uiKey] = a.tmId;
          } catch {
            /* skip */
          }
        }
        mergeBatchNightIntoWeekEntries(mutableWeekEntries, nightDate, proposed);
      }
      results.push(nightResult);
    } catch (err) {
      results.push({
        nightId,
        nightDate,
        dayName,
        status: "error",
        assigned: 0,
        preserved: 0,
        unfilled: 0,
        notes: [],
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Also get the week_ending for the result header
  const { data: weekRow } = await supabase
    .from("weeks")
    .select("week_ending")
    .eq("id", weekId)
    .maybeSingle();

  return {
    weekId,
    weekEnding: (weekRow as any)?.week_ending ?? "",
    nights: results,
    totalAssigned: results.reduce((s, r) => s + r.assigned, 0),
    totalPreserved: results.reduce((s, r) => s + r.preserved, 0),
    totalUnfilled: results.reduce((s, r) => s + r.unfilled, 0),
  };
}

/**
 * Run the engine for a single night by nightId. Used by the per-night "Run"
 * button in the Sudo Batch Planner tab. Loads its own session data so it can
 * be called independently of batchRunEngineForWeek.
 */
export async function batchRunEngineForNight(
  nightId: string,
  options: BatchRunOptions = {}
): Promise<BatchNightResult> {
  const { skipFilledNights = false, requireSchedule = false, filterBySchedule = false } = options;

  const { data: nightRow, error: nightErr } = await supabase
    .from("nights")
    .select("id, night_date, day_name")
    .eq("id", nightId)
    .maybeSingle();
  if (nightErr || !nightRow) throw new Error(`Night ${nightId} not found`);

  const { getTMSkillScores, getSlotDifficultyRaw, getTMPreferences, getTMPairAffinities, getTMAccommodations, getGraveAvailableTeamMembers, getTmZoneMatrix } =
    await import("./data");

  const [engineConfig, skillScores, slotDifficulty, preferenceRows, pairAffinityRows, accommodationRows, grave, zoneMatrix] =
    await Promise.all([
      getFullyResolvedEngineConfig(),
      getTMSkillScores(),
      getSlotDifficultyRaw(),
      getTMPreferences(),
      getTMPairAffinities(),
      getTMAccommodations(),
      getGraveAvailableTeamMembers(),
      getTmZoneMatrix(), // preloaded once — fixes the previous per-TM N+1 inside scoring
    ]);

  const prefByTm = new Map<string, any[]>();
  preferenceRows.forEach((r: any) => {
    if (!prefByTm.has(r.tmId)) prefByTm.set(r.tmId, []);
    prefByTm.get(r.tmId)!.push(r);
  });
  const pairByTm = new Map<string, any[]>();
  pairAffinityRows.forEach((r: any) => {
    if (!pairByTm.has(r.tmId)) pairByTm.set(r.tmId, []);
    pairByTm.get(r.tmId)!.push(r);
  });
  const accByTm = new Map<string, any[]>();
  accommodationRows.forEach((r: any) => {
    if (!accByTm.has(r.tmId)) accByTm.set(r.tmId, []);
    accByTm.get(r.tmId)!.push(r);
  });

  const tmIds = grave.map((tm) => tm.id).filter(Boolean);
  const nightDate = String((nightRow as any).night_date);
  const placementHistories = await loadPlacementHistoriesForRoster(tmIds);

  const { data: weekNightRows } = await supabase
    .from("nights")
    .select("id, night_date")
    .eq("id", nightId);
  const weekEntries = weekNightRows
    ? await loadWeekPlacementEntries(weekNightRows as Array<{ id: string; night_date: string }>)
    : [];

  return runEngineForSingleNight({
    nightId,
    nightDate,
    dayName: String((nightRow as any).day_name ?? ""),
    grave,
    engineConfig,
    skillScores,
    slotDifficulty,
    prefByTm,
    pairByTm,
    accByTm,
    zoneMatrix,
    placementHistories,
    weeklyRecentHistory: buildWeeklyRecentHistoryForNight(weekEntries, nightDate),
    skipFilledNights,
    requireSchedule,
    filterBySchedule,
  });
}

/**
 * Internal: runs the unified engine for one night and writes the proposals.
 * All session-stable data is pre-loaded by the caller.
 */
async function runEngineForSingleNight(params: {
  nightId: string;
  nightDate: string;
  dayName: string;
  grave: GraveTm[];
  engineConfig: Awaited<ReturnType<typeof getFullyResolvedEngineConfig>>;
  skillScores: Map<string, number>;
  slotDifficulty: Map<string, number>;
  prefByTm: Map<string, any[]>;
  pairByTm: Map<string, any[]>;
  accByTm: Map<string, any[]>;
  zoneMatrix?: Map<string, Map<string, any>>;
  placementHistories?: Record<string, ZoneDetailEntry | null>;
  weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;
  skipFilledNights: boolean;
  requireSchedule: boolean;
  filterBySchedule: boolean;
}): Promise<BatchNightResult> {
  const {
    nightId,
    nightDate,
    dayName,
    grave,
    engineConfig,
    skillScores,
    slotDifficulty,
    prefByTm,
    pairByTm,
    accByTm,
    zoneMatrix,
    placementHistories = {},
    weeklyRecentHistory = new Map(),
    skipFilledNights,
    requireSchedule,
    filterBySchedule,
  } = params;
  const notes: string[] = [];

  // Load night-specific data in parallel (dynamic import keeps heavy modules off static graph)
  const { getAllScheduledTmIdsForNight } = await import("@/lib/shiftbuilder/gravesDefaultSchedule");
  const nightDateObj = new Date(`${nightDate}T12:00:00`);
  const { getNightAssignments } = await import("@/lib/shiftbuilder/data");
  const [scheduledIds, existingAssignments] = await Promise.all([
    getAllScheduledTmIdsForNight(nightDateObj, nightId),
    getNightAssignments(nightId),
  ]);

  if (requireSchedule && scheduledIds.size === 0) {
    return { nightId, nightDate, dayName, status: "skip", assigned: 0, preserved: 0, unfilled: 0, notes: ["Skipped: no TMs scheduled in Graves Default Schedule for this night"] };
  }

  // Check for existing zone assignments
  const zoneAssignments = existingAssignments.filter((a) => a.slotType === "zone" && a.tmId);
  if (skipFilledNights && zoneAssignments.length > 0) {
    return { nightId, nightDate, dayName, status: "skip", assigned: 0, preserved: zoneAssignments.length, unfilled: 0, notes: [`Skipped: ${zoneAssignments.length} zone(s) already filled`] };
  }

  // Build assignments map in the shape the engine expects (SlotAssignmentRow).
  // Existing assignments come back with DB slot_keys (e.g. "zone_9", "rr_1_2",
  // "admin"). The engine works with UI keys (e.g. "Z9", "MRR1", "ADM").
  // Translate each DB row back to its UI key so preserve-detection works.
  const assignmentsMap: Record<string, { tmId: string; tmName: string; isLocked?: boolean }> = {};
  for (const a of existingAssignments) {
    if (!a.tmId) continue;
    try {
      const uiKey = dbToUi(a.slotKey, a.slotType ?? "zone", a.rrSide ?? null);
      assignmentsMap[uiKey] = { tmId: a.tmId, tmName: a.tmName ?? a.tmId, isLocked: a.isLocked };
    } catch {
      // Unrecognized slot shape — skip; planner will treat this slot as empty
    }
  }

  // Filter grave roster by schedule only when explicitly requested.
  // requireSchedule gates whether we RUN a night (skip with no schedule data).
  // filterBySchedule gates whether we NARROW the roster to scheduled TMs only —
  // defaults false so the full grave pool is always available.
  const rosterForEngine = (filterBySchedule && scheduledIds.size > 0)
    ? grave.filter((tm) => scheduledIds.has(tm.id))
    : grave;

  if (rosterForEngine.length === 0) {
    return { nightId, nightDate, dayName, status: "skip", assigned: 0, preserved: 0, unfilled: 0, notes: ["Skipped: no available TMs for this night"] };
  }

  // Run the unified engine (F1 fix, 2026-07-04: batch now shares the same
  // eligibility-rules-aware engine as the interactive board, instead of the
  // legacy runWeightedPlanner which never saw engine_eligibility_rules /
  // engine_signal_overrides). "no-ai" + "all-existing" reproduces the batch
  // runner's prior deterministic, never-overwrite-a-filled-slot behavior.
  const orderedSlots = getSlotsInPlacementOrder();
  const engineResult = runNightEngineFromClient(
    {
      nightIso: nightDate,
      config: engineConfig,
      eligibilityRules: engineConfig.eligibilityRules,
      auxDefs: [],
      members: rosterForEngine as unknown as Array<Record<string, unknown>>,
      assignments: assignmentsMap,
      histories: placementHistories,
      weeklyRecentHistory,
      zoneMatrix,
      skillScores,
      slotDifficulty,
      preferencesByTm: prefByTm,
      pairAffinitiesByTm: pairByTm,
      accommodationsByTm: accByTm,
    },
    { mode: "no-ai", preserve: "all-existing" },
  );
  const plannerResult = nightResultToLegacyDraft(engineResult);
  const engineNotes = engineResult.telemetry.stages.flatMap((s) => s.notes);

  notes.push(...engineNotes);

  // === Rich engine telemetry (2026-05-30) ===
  const preservedCount = Object.values(plannerResult.breakdown).filter(b => b.preserved).length;
  const filledCount = Object.keys(plannerResult.proposedAssignments).length;
  const unfilledSlots = Object.entries(plannerResult.proposedAssignments)
    .filter(([, tmId]) => !tmId)
    .map(([k]) => k);

  logEngineRunSummary({
    mode: 'batch-night',
    dayName,
    nightDate,
    rosterSize: rosterForEngine.length,
    slotsProcessed: orderedSlots.length,
    preservedSlots: preservedCount,
    filledSlots: filledCount,
    unfilledSlots: unfilledSlots.length,
    usedGrok: false,
    grokPicksApplied: 0,
    matrixPreloaded: !!zoneMatrix && zoneMatrix.size > 0,
    warnings: engineNotes,
    topUnfilledSlots: unfilledSlots.slice(0, 6),
    placementMethod: engineConfig.placementMethod,
  });

  // Count preserved (already filled) vs new proposals
  let preserved = 0;
  let assigned = 0;
  let unfilled = 0;

  for (const [slotKey, tmId] of Object.entries(plannerResult.proposedAssignments)) {
    const breakdown = plannerResult.breakdown[slotKey];
    if (breakdown?.preserved) {
      preserved++;
      continue; // was already filled — don't re-write
    }
    // Translate UI slot key → DB shape (slot_key, slot_type, rr_side)
    let dbSlot: ReturnType<typeof uiToDb>;
    try {
      dbSlot = uiToDb(slotKey);
    } catch {
      notes.push(`Unknown slot key "${slotKey}" — skipped`);
      continue;
    }

    // Write the new proposal to zone_assignments
    const { error: writeErr } = await supabase
      .from("zone_assignments")
      .upsert(
        {
          night_id: nightId,
          slot_key: dbSlot.slot_key,
          slot_type: dbSlot.slot_type,
          tm_id: tmId,
          rr_side: dbSlot.rr_side,
          is_filled: true,
          is_locked: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "night_id,slot_type,slot_key,rr_side" }
      );
    if (writeErr) {
      notes.push(`Failed to write ${slotKey}: ${writeErr.message}`);
    } else {
      assigned++;
    }
  }

  // Count slots the planner couldn't fill
  for (const slotKey of orderedSlots) {
    const breakdown = plannerResult.breakdown[slotKey];
    if (breakdown && !breakdown.preserved && breakdown.pickedTmId === null) {
      unfilled++;
    }
  }

  return { nightId, nightDate, dayName, status: "ok", assigned, preserved, unfilled, notes };
}

/**
 * Fetch all nights for a given weekId, ordered chronologically.
 * Used by the Batch Planner tab's night list.
 */
export async function listNightsForWeek(
  weekId: string
): Promise<Array<{ nightId: string; nightDate: string; dayName: string; assignmentCount: number }>> {
  const { data: nightRows, error: nightErr } = await supabase
    .from("nights")
    .select("id, night_date, day_name")
    .eq("week_id", weekId)
    .order("night_date", { ascending: true });
  if (nightErr) throw new Error(`listNightsForWeek: ${nightErr.message}`);
  if (!nightRows || nightRows.length === 0) return [];

  const nightIds = nightRows.map((n: any) => n.id);

  // Count existing zone assignments per night so the UI can show filled/empty
  const { data: assignRows } = await supabase
    .from("zone_assignments")
    .select("night_id")
    .in("night_id", nightIds)
    .not("tm_id", "is", null)
    .eq("slot_type", "zone");

  const countByNight = new Map<string, number>();
  (assignRows ?? []).forEach((r: any) => {
    countByNight.set(r.night_id, (countByNight.get(r.night_id) ?? 0) + 1);
  });

  return nightRows.map((n: any) => ({
    nightId: String(n.id),
    nightDate: String(n.night_date),
    dayName: String(n.day_name ?? ""),
    assignmentCount: countByNight.get(String(n.id)) ?? 0,
  }));
}

/**
 * List all weeks that have nights in the DB (for the week picker in the
 * Batch Planner tab). Returns weeks ordered by week_ending descending.
 */
export async function listWeeksWithNights(): Promise<
  Array<{ weekId: string; weekEnding: string; weekLabel: string; nightCount: number }>
> {
  const { data: weeks, error: weekErr } = await supabase
    .from("weeks")
    .select("id, week_ending, label")
    .order("week_ending", { ascending: false });
  if (weekErr) throw new Error(`listWeeksWithNights: ${weekErr.message}`);
  if (!weeks || weeks.length === 0) return [];

  const weekIds = weeks.map((w: any) => w.id);
  const { data: nightCounts } = await supabase
    .from("nights")
    .select("week_id")
    .in("week_id", weekIds);

  const countByWeek = new Map<string, number>();
  (nightCounts ?? []).forEach((n: any) => {
    countByWeek.set(n.week_id, (countByWeek.get(n.week_id) ?? 0) + 1);
  });

  return weeks
    .map((w: any) => ({
      weekId: w.id,
      weekEnding: w.week_ending,
      weekLabel: w.label ?? `Week ending ${w.week_ending}`,
      nightCount: countByWeek.get(w.id) ?? 0,
    }))
    .filter((w) => w.nightCount > 0);
}

