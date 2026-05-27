import { supabase, getSupabaseClient } from '../supabase';
import { dbToUi } from './slot-keys';

/**
 * Shift Builder Data Layer — Real Supabase backed.
 * 
 * Responsibilities:
 * - Load real team members from tm_profiles
 * - Load real zone/rr/aux assignments from zone_assignments for a night
 * - Reliable immediate write-back (upsert / delete) for manual edits
 * - Support on-schedule roster (TMs scheduled/used in the week)
 * - Helpers for live realtime subscriptions (channel factory)
 * 
 * Slot key conventions in DB:
 *   - Zones: "zone_1" ... "zone_10"   (slot_type: "zone")
 *   - RR: "rr_1_2", "rr_6" ... with rr_side: "mens" | "womens"
 *   - Aux: "admin", "z9_sr", "trash_1", "support_1" etc (slot_type: "aux")
 * 
 * The UI layer maps these to pretty labels (Z1, MRR1/WRR1, AUX...).
 */

/**
 * Logs Supabase errors in a structured way that survives serialization
 * across React Server Components, edge runtimes, and production logging pipelines.
 * PostgrestError objects frequently collapse to `{}` when passed directly to console.error.
 */
function logSupabaseError(label: string, error: any) {
  console.error(`[shiftbuilder/data] ${label}:`, {
    message: error?.message ?? 'unknown',
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    raw: error,
  });
}


// ============================================================================
// Types
// ============================================================================

export interface TeamMember {
  id: string;          // tm_id e.g. "tm_abby"
  name: string;        // display_name preferred
  fullName?: string;
  status?: string;
  primarySection?: string | null;
  gravePool?: string | null;   // e.g. "A", "B", "Main", etc. — indicates GRAVE shift availability
  /** Biological gender used to assign MRR (Men's) vs WRR (Women's) restroom slots. */
  gender?: 'M' | 'F' | null;
}

export interface ZoneAssignmentRow {
  slotKey: string;           // e.g. "zone_1", "rr_1_2", "admin"
  tmId: string | null;
  tmName?: string;
  slotType: 'zone' | 'rr' | 'aux' | string;
  rrSide?: 'mens' | 'womens' | null;
  isLocked: boolean;
  isFilled: boolean;
  updatedAt?: string;
}

export interface NightInfo {
  id: string;
  nightDate: string;
  dayName: string;
  weekId: string;
  status: string;
  isLocked: boolean;
}

// ============================================================================
// Core Data Fetchers
// ============================================================================

/**
 * All active team members (full roster).
 * Used as the source for the draggable roster rail.
 */
export async function getActiveTeamMembers(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('tm_profiles')
    .select('tm_id, display_name, full_name, status, primary_section, active, grave_pool, gender')
    .eq('active', true)
    .order('display_name', { ascending: true });

  if (error) {
    console.error('[shiftbuilder/data] getActiveTeamMembers error:', error);
    throw new Error(`Failed to load team members: ${error.message}`);
  }

  return (data || []).map((p: any) => ({
    id: p.tm_id,
    name: p.display_name || p.full_name || p.tm_id,
    fullName: p.full_name,
    status: p.status,
    primarySection: p.primary_section,
    gravePool: p.grave_pool ?? null,
    gender: p.gender ?? null,
  }));
}

/**
 * Returns only TMs who have some form of GRAVE shift availability.
 * Uses `grave_pool` as the primary signal (TMs in a grave rotation/pool).
 * Falls back to those with eligibility for GRAVE-relevant slots if needed.
 *
 * This powers the "GRAVE shift only (11pm–6:55am)" filter in the Roster Rail.
 */
export async function getGraveAvailableTeamMembers(): Promise<TeamMember[]> {
  const { data, error } = await supabase
    .from('tm_profiles')
    .select('tm_id, display_name, full_name, status, primary_section, active, grave_pool, gender')
    .eq('active', true)
    .not('grave_pool', 'is', null)   // Primary signal: they are in a grave pool
    .order('display_name', { ascending: true });

  if (error) {
    console.error('[shiftbuilder/data] getGraveAvailableTeamMembers error:', error);
    throw new Error(`Failed to load GRAVE-available team members: ${error.message}`);
  }

  return (data || []).map((p: any) => ({
    id: p.tm_id,
    name: p.display_name || p.full_name || p.tm_id,
    fullName: p.full_name,
    status: p.status,
    primarySection: p.primary_section,
    gravePool: p.grave_pool ?? null,
    gender: p.gender ?? null,
  }));
}

/**
 * Returns all active TMs with grave_pool = 'PM' (out at ~1:00am).
 * Derived directly from tm_profiles.grave_pool — the authoritative source of truth.
 * (Previously used overlap_assignments which had no PM/AM type distinction.)
 */
export async function getGravePMOverlapMembers(): Promise<TeamMember[]> {
  try {
    const { data, error } = await supabase
      .from('tm_profiles')
      .select('tm_id, display_name, full_name, status, primary_section, active, grave_pool, gender')
      .eq('active', true)
      .eq('grave_pool', 'PM')
      .order('display_name', { ascending: true });

    if (error) {
      console.error('[shiftbuilder/data] getGravePMOverlapMembers failed:', error);
      return [];
    }

    return (data || []).map((p: any) => ({
      id: p.tm_id,
      name: p.display_name || p.full_name || p.tm_id,
      fullName: p.full_name,
      status: p.status,
      primarySection: p.primary_section,
      gravePool: 'PM',
      gender: p.gender ?? null,
      isPMOverlap: true,
      isAMOverlap: false,
    }));
  } catch (err) {
    console.error('[shiftbuilder/data] getGravePMOverlapMembers unexpected error:', err);
    return [];
  }
}

/**
 * Returns all active TMs with grave_pool = 'AM' (in at 5:00–5:30am).
 * Derived directly from tm_profiles.grave_pool — the authoritative source of truth.
 * Note: AM overlap TMs are scheduled on the ADP export for the NEXT calendar day
 * (e.g. a Friday grave shift has AM overlaps imported as Saturday 5am).
 */
export async function getGraveAMOverlapMembers(): Promise<TeamMember[]> {
  try {
    const { data, error } = await supabase
      .from('tm_profiles')
      .select('tm_id, display_name, full_name, status, primary_section, active, grave_pool, gender')
      .eq('active', true)
      .eq('grave_pool', 'AM')
      .order('display_name', { ascending: true });

    if (error) {
      console.error('[shiftbuilder/data] getGraveAMOverlapMembers failed:', error);
      return [];
    }

    return (data || []).map((p: any) => ({
      id: p.tm_id,
      name: p.display_name || p.full_name || p.tm_id,
      fullName: p.full_name,
      status: p.status,
      primarySection: p.primary_section,
      gravePool: 'AM',
      gender: p.gender ?? null,
      isPMOverlap: false,
      isAMOverlap: true,
    }));
  } catch (err) {
    console.error('[shiftbuilder/data] getGraveAMOverlapMembers unexpected error:', err);
    return [];
  }
}

/**
 * Returns the set of TM ids that are "on schedule" for a given night.
 *
 * Sources (merged):
 *   1. night_tm_status rows for tonight's night_id — populated by ADP import.
 *   2. night_tm_status rows for the NEXT calendar day, filtered to grave_pool='AM'
 *      TMs only. Reason: AM overlap TMs (in at 5:00–5:30am) are scheduled by ADP
 *      under the next morning's date (e.g. a Friday grave shift has AM overlaps
 *      imported as Saturday 5am), so their night_tm_status rows live under the
 *      Saturday night_id, not Friday's.
 *   3. Fallback heuristic: TMs appearing in zone/break/overlap_assignments for
 *      any night this week — covers weeks where no ADP import has been run yet.
 *
 * Falls back to empty set if no data exists at all.
 *
 * @param nightId   The night_id of the grave shift (e.g. Friday night's row)
 * @param shiftDate ISO date string of the shift night (e.g. '2026-05-22')
 */
export async function getOnScheduleTmIdsForNight(
  nightId: string,
  shiftDate: string
): Promise<Set<string>> {
  const tmIdSet = new Set<string>();

  // --- Compute tomorrow's ISO date (only when a valid shiftDate was supplied) ---
  const shiftDateObj = shiftDate ? new Date(`${shiftDate}T12:00:00Z`) : null;
  const nextDateStr: string | null = (() => {
    if (!shiftDateObj || isNaN(shiftDateObj.getTime())) return null;
    const d = new Date(shiftDateObj);
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  // --- Parallel: tonight's night_tm_status + tomorrow's night lookup ---
  const [tonightStatusRes, tomorrowNightRes] = await Promise.all([
    supabase
      .from('night_tm_status')
      .select('tm_id')
      .eq('night_id', nightId),
    nextDateStr
      ? supabase.from('nights').select('id').eq('night_date', nextDateStr).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  (tonightStatusRes.data || []).forEach((r: any) => r.tm_id && tmIdSet.add(r.tm_id));

  // AM overlap TMs are imported as next-day schedule entries
  if (tomorrowNightRes.data?.id) {
    const tomorrowNightId = tomorrowNightRes.data.id;
    const { data: nextDayStatus } = await supabase
      .from('night_tm_status')
      .select('tm_id')
      .eq('night_id', tomorrowNightId);

    if (nextDayStatus?.length) {
      const nextTmIds = (nextDayStatus || []).map((r: any) => r.tm_id).filter(Boolean);
      if (nextTmIds.length > 0) {
        // Only include those who are AM overlap TMs (grave_pool = 'AM')
        const { data: amProfiles } = await supabase
          .from('tm_profiles')
          .select('tm_id')
          .in('tm_id', nextTmIds)
          .eq('grave_pool', 'AM')
          .eq('active', true);
        (amProfiles || []).forEach((r: any) => r.tm_id && tmIdSet.add(r.tm_id));
      }
    }
  }

  // If night_tm_status has data, we're done — ADP import is the source of truth.
  if (tmIdSet.size > 0) return tmIdSet;

  // --- Fallback heuristic: scan assignment tables for the whole week ---
  // Used when no ADP schedule has been imported yet.
  const { data: nightRow, error: nightErr } = await supabase
    .from('nights')
    .select('week_id')
    .eq('id', nightId)
    .single();

  if (nightErr || !nightRow?.week_id) {
    console.warn('[shiftbuilder/data] Could not resolve week for night', nightId);
    return tmIdSet;
  }

  const { data: weekNights } = await supabase
    .from('nights')
    .select('id')
    .eq('week_id', nightRow.week_id);

  if (!weekNights?.length) return tmIdSet;

  const nightIds = weekNights.map((n: any) => n.id);

  const [zoneRes, breakRes, overlapRes] = await Promise.all([
    supabase.from('zone_assignments').select('tm_id').in('night_id', nightIds).not('tm_id', 'is', null),
    supabase.from('break_assignments').select('tm_id').in('night_id', nightIds).not('tm_id', 'is', null),
    supabase.from('overlap_assignments').select('tm_id').in('night_id', nightIds).not('tm_id', 'is', null),
  ]);

  (zoneRes.data || []).forEach((r: any) => r.tm_id && tmIdSet.add(r.tm_id));
  (breakRes.data || []).forEach((r: any) => r.tm_id && tmIdSet.add(r.tm_id));
  (overlapRes.data || []).forEach((r: any) => r.tm_id && tmIdSet.add(r.tm_id));

  return tmIdSet;
}

/**
 * Get full roster for the shift builder, with on-schedule flag for the night.
 * On-schedule TMs come first / expanded in the UI.
 */
export async function getTeamMembersForNight(nightId: string, shiftDate?: string): Promise<(TeamMember & { isOnSchedule: boolean })[]> {
  const [all, scheduled] = await Promise.all([
    getActiveTeamMembers(),
    getOnScheduleTmIdsForNight(nightId, shiftDate ?? ''),
  ]);

  return all.map((tm) => ({
    ...tm,
    isOnSchedule: scheduled.has(tm.id),
  }));
}

// ============================================================================
// Night Resolver / Creator
// ============================================================================

/**
 * Format a Date as a local YYYY-MM-DD string. Avoids the UTC drift that
 * Date.prototype.toISOString() introduces for dates near midnight in
 * negative-UTC offsets (Brian's M3 Max in EST/EDT lands a few hours off
 * a given local date if we use ISO directly).
 */
function localDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Shift-week start helper duplicated locally so this module doesn't depend
 * on the UI layer. Friday-anchored week per ZDS operational convention.
 */
function startOfShiftWeekLocal(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() + 7 - 5) % 7; // Friday (5) anchored
  d.setDate(d.getDate() - back);
  return d;
}

/**
 * Find a night by its date. Returns null if no row exists. Use this to check
 * before reading assignments — if null, the night hasn't been touched yet.
 */
export async function getNightIdForDate(date: Date): Promise<string | null> {
  const iso = localDateIso(date);
  const { data, error } = await supabase
    .from("nights")
    .select("id")
    .eq("night_date", iso)
    .maybeSingle();

  if (error) {
    console.warn("[shiftbuilder/data] getNightIdForDate error", error);
    return null;
  }
  return data?.id ?? null;
}

/**
 * Find or create the night row for `date`. Lazily creates the parent `week`
 * row if needed. Use when the operator makes their first edit on a date that
 * doesn't yet have a night row — keeps the DB empty for un-edited nights.
 *
 * Returns the night id on success, throws if the inserts fail (which should
 * be rare — schema mismatches or RLS issues).
 */
export async function getOrCreateNightForDate(
  date: Date,
  dayName: string
): Promise<string> {
  // 1. Existing night?
  const existing = await getNightIdForDate(date);
  if (existing) return existing;

  // 2. Find or create the parent week.
  const weekStart = startOfShiftWeekLocal(date);
  const weekStartIso = localDateIso(weekStart);
  const weekEndingIso = (() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    return localDateIso(end);
  })();

  let weekId: string | null = null;
  {
    const { data } = await supabase
      .from("weeks")
      .select("id")
      .eq("week_start", weekStartIso)
      .maybeSingle();
    weekId = data?.id ?? null;
  }

  if (!weekId) {
    const { data: newWeek, error: wErr } = await supabase
      .from("weeks")
      .insert({
        week_start: weekStartIso,
        week_ending: weekEndingIso,
        // Leave other columns to defaults; if the schema requires more,
        // we'll surface the error and add fields here.
      })
      .select("id")
      .single();

    if (wErr || !newWeek) {
      throw new Error(`Failed to create week for ${weekStartIso}: ${wErr?.message ?? "unknown"}`);
    }
    weekId = newWeek.id;
  }

  // 3. Create the night under that week.
  const { data: newNight, error: nErr } = await supabase
    .from("nights")
    .insert({
      week_id: weekId,
      night_date: localDateIso(date),
      day_name: dayName,
      status: "draft",
      is_locked: false,
    })
    .select("id")
    .single();

  if (nErr || !newNight) {
    throw new Error(`Failed to create night for ${localDateIso(date)}: ${nErr?.message ?? "unknown"}`);
  }

  const newNightId = newNight.id;

  // Auto-seed default tasks and break template in parallel — fire-and-forget
  // so a seeding failure never blocks night creation. Errors are logged but
  // do not propagate; the operator can always add tasks/breaks manually.
  Promise.all([
    seedDefaultTasksForNight(newNightId).catch((e) =>
      console.warn('[shiftbuilder/data] getOrCreateNightForDate: task seed failed', e)
    ),
    seedDefaultBreaksForNight(newNightId).catch((e) =>
      console.warn('[shiftbuilder/data] getOrCreateNightForDate: break seed failed', e)
    ),
  ]);

  return newNightId;
}

// ============================================================================
// Night + Assignment Loaders
// ============================================================================

/**
 * List recent nights for the night selector (most recent first).
 */
export async function listRecentNights(limit = 14): Promise<NightInfo[]> {
  const { data, error } = await supabase
    .from('nights')
    .select('id, night_date, day_name, week_id, status, is_locked')
    .order('night_date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[shiftbuilder/data] listRecentNights error:', error);
    throw error;
  }

  return (data || []).map((n: any) => ({
    id: n.id,
    nightDate: n.night_date,
    dayName: n.day_name,
    weekId: n.week_id,
    status: n.status,
    isLocked: !!n.is_locked,
  }));
}

/**
 * Load all zone/rr/aux assignments for one night, enriched with TM display names.
 */
export async function getNightAssignments(nightId: string): Promise<ZoneAssignmentRow[]> {
  const { data: rows, error } = await supabase
    .from('zone_assignments')
    .select('night_id, slot_key, slot_type, tm_id, rr_side, is_locked, is_filled, updated_at, sort_order')
    .eq('night_id', nightId)
    .order('sort_order', { ascending: true })
    .order('slot_key', { ascending: true });

  if (error) {
    console.error('[shiftbuilder/data] getNightAssignments error:', error);
    throw new Error(`Failed to load assignments for night ${nightId}: ${error.message}`);
  }

  if (!rows || rows.length === 0) return [];

  // Batch fetch names for any assigned TMs
  const tmIds = Array.from(new Set(rows.map((r: any) => r.tm_id).filter(Boolean)));

  const nameMap = new Map<string, string>();
  if (tmIds.length > 0) {
    const { data: profiles, error: pErr } = await supabase
      .from('tm_profiles')
      .select('tm_id, display_name, full_name')
      .in('tm_id', tmIds);

    if (pErr) {
      console.warn('[shiftbuilder/data] name enrichment partial failure:', pErr.message);
    } else {
      (profiles || []).forEach((p: any) => {
        nameMap.set(p.tm_id, p.display_name || p.full_name || p.tm_id);
      });
    }
  }

  return rows.map((row: any) => ({
    slotKey: row.slot_key,
    tmId: row.tm_id || null,
    tmName: row.tm_id ? nameMap.get(row.tm_id) : undefined,
    slotType: row.slot_type || 'zone',
    rrSide: row.rr_side || null,
    isLocked: !!row.is_locked,
    isFilled: !!row.is_filled,
    updatedAt: row.updated_at,
  }));
}

/**
 * Phase 1: Unified assignments read via the new transition view.
 * This is the preferred path for new Ops Hub and agent features.
 * Falls back gracefully if view is not yet populated.
 */
export async function getUnifiedCurrentAssignments(graveShiftId: string): Promise<ZoneAssignmentRow[]> {
  const { data: rows, error } = await supabase
    .from('v_current_assignments')
    .select('*')
    .eq('grave_shift_id', graveShiftId)
    .order('slot_key', { ascending: true });

  if (error) {
    console.warn('[shiftbuilder/data] v_current_assignments not available or error, falling back:', error.message);
    // Fallback to legacy for safety during transition
    return getNightAssignments(graveShiftId);
  }

  if (!rows || rows.length === 0) return [];

  const tmIds = Array.from(new Set(rows.map((r: any) => r.tm_id).filter(Boolean)));
  const nameMap = new Map<string, string>();

  if (tmIds.length > 0) {
    const { data: profiles } = await supabase
      .from('tm_profiles')
      .select('tm_id, display_name, full_name')
      .in('tm_id', tmIds);

    (profiles || []).forEach((p: any) => {
      nameMap.set(p.tm_id, p.display_name || p.full_name || p.tm_id);
    });
  }

  return rows.map((row: any) => ({
    slotKey: row.slot_key,
    tmId: row.tm_id || null,
    tmName: row.tm_id ? nameMap.get(row.tm_id) : undefined,
    slotType: row.slot_type || row.category || 'zone',
    rrSide: null, // normalized in view if needed later
    isLocked: !!row.is_locked,
    isFilled: !!row.is_filled,
    updatedAt: row.updated_at,
  }));
}

// ============================================================================
// Write-back (immediate persistence)
// ============================================================================

export interface UpsertAssignmentParams {
  nightId: string;
  slotKey: string;
  tmId: string | null;
  slotType?: 'zone' | 'rr' | 'aux' | string;
  rrSide?: 'mens' | 'womens' | null;
  isLocked?: boolean;
}

/**
 * Assign, unassign, or update a slot.
 * When tmId is null → deletes the row for that (night,slot_key,slot_type,rr_side)
 * Otherwise → upserts the assignment row.
 * 
 * This is the single source of truth for manual write-back.
 */
export async function upsertZoneAssignment(params: UpsertAssignmentParams) {
  const client = getSupabaseClient();

  const {
    nightId,
    slotKey,
    tmId,
    slotType = 'zone',
    rrSide = null,
    isLocked = false,
  } = params;

  if (!nightId || !slotKey) {
    throw new Error('nightId and slotKey are required for upsertZoneAssignment');
  }

  if (!tmId) {
    // Unassign / clear the slot
    let q = client
      .from('zone_assignments')
      .delete()
      .eq('night_id', nightId)
      .eq('slot_key', slotKey)
      .eq('slot_type', slotType);

    if (rrSide) {
      q = q.eq('rr_side', rrSide);
    } else {
      // Also delete any rr_side variants if we are clearing a logical pair (defensive)
      // For safety we delete exact match first; caller should be explicit for RR sides.
    }

    const { error } = await q;
    if (error) {
      logSupabaseError('delete assignment failed', error);
      throw new Error(`Failed to clear assignment: ${error.message || 'unknown'} (code: ${error.code || 'unknown'})`);
    }
    return { success: true, action: 'deleted' as const };
  }

  // Assign or re-assign
  const row: Record<string, any> = {
    night_id: nightId,
    slot_key: slotKey,
    slot_type: slotType,
    tm_id: tmId,
    rr_side: rrSide,
    is_filled: true,
    is_locked: isLocked,
    updated_at: new Date().toISOString(),
  };

  // Use upsert with the actual unique columns (night_id, slot_type, slot_key, rr_side)
  const { error } = await client
    .from('zone_assignments')
    .upsert(row, {
      onConflict: 'night_id,slot_type,slot_key,rr_side',
    });

  if (error) {
    logSupabaseError('upsert assignment failed', error);
    throw new Error(`Failed to save assignment: ${error.message || 'unknown'} (code: ${error.code || 'unknown'})`);
  }

  return { success: true, action: 'upserted' as const };
}

/**
 * Apply an engine draft in a single round-trip (instead of N individual upserts).
 *
 * Splits the draft into two groups:
 *   - toUpsert: rows where a TM is being assigned → single batch .upsert()
 *   - toDelete: rows being cleared → parallel .delete() calls
 *     (Supabase doesn't support batch delete with per-row differing WHERE, so we
 *     fan out deletes in parallel — still fast vs. the previous serial approach.)
 */
export async function batchApplyDraftAssignments(
  nightId: string,
  slots: Array<{
    slotKey: string;    // DB format e.g. "zone_1"
    slotType: string;   // e.g. "zone" | "rr" | "aux"
    rrSide: string | null;
    tmId: string | null; // null → clear the slot
  }>
): Promise<void> {
  const client = getSupabaseClient();
  const now = new Date().toISOString();

  const toUpsert = slots.filter((s) => s.tmId !== null);
  const toDelete = slots.filter((s) => s.tmId === null);
  const errors: string[] = [];

  // Single batch upsert for all assignments
  if (toUpsert.length > 0) {
    const rows = toUpsert.map((s) => ({
      night_id: nightId,
      slot_key: s.slotKey,
      slot_type: s.slotType,
      rr_side: s.rrSide,
      tm_id: s.tmId,
      is_filled: true,
      is_locked: false,
      updated_at: now,
    }));

    const { error } = await client
      .from('zone_assignments')
      .upsert(rows, { onConflict: 'night_id,slot_type,slot_key,rr_side' });

    if (error) errors.push(`batch upsert failed: ${error.message}`);
  }

  // Parallel deletes for cleared slots
  if (toDelete.length > 0) {
    const results = await Promise.allSettled(
      toDelete.map(async (s) => {
        let q = client
          .from('zone_assignments')
          .delete()
          .eq('night_id', nightId)
          .eq('slot_key', s.slotKey)
          .eq('slot_type', s.slotType);
        if (s.rrSide) q = q.eq('rr_side', s.rrSide);
        const { error } = await q;
        if (error) throw new Error(`delete ${s.slotKey}: ${error.message}`);
      })
    );
    results.forEach((r) => {
      if (r.status === 'rejected') errors.push(r.reason?.message ?? 'delete failed');
    });
  }

  if (errors.length > 0) throw new Error(`batchApplyDraftAssignments: ${errors.join('; ')}`);
}

/**
 * Toggle the is_locked flag on an existing assignment row.
 * If the row does not exist yet, this is a no-op (caller should assign first).
 */
export async function toggleAssignmentLock(params: {
  nightId: string;
  slotKey: string;
  slotType: string;
  rrSide?: string | null;
  currentLocked: boolean;
}) {
  const client = getSupabaseClient();

  const { nightId, slotKey, slotType, rrSide = null, currentLocked } = params;

  // We update directly (more efficient than full upsert when we know tm_id exists)
  let q = client
    .from('zone_assignments')
    .update({
      is_locked: !currentLocked,
      updated_at: new Date().toISOString(),
    })
    .eq('night_id', nightId)
    .eq('slot_key', slotKey)
    .eq('slot_type', slotType);

  if (rrSide) q = q.eq('rr_side', rrSide);

  const { error } = await q;

  if (error) {
    logSupabaseError('toggle lock failed', error);
    throw new Error(`Failed to toggle lock: ${error.message || 'unknown'} (code: ${error.code || 'unknown'})`);
  }

  return { success: true, newLocked: !currentLocked };
}

// ============================================================================
// Per-night Notes (Notes & Side Tasks pad on the artboard)
// ============================================================================
//
// Requires the schema migration:
//   ALTER TABLE nights ADD COLUMN IF NOT EXISTS notes TEXT;
//
// Operator-visible notes that ride along with the night's deployment plan.
// Persisted as plain text — the UI's contentEditable doesn't preserve
// formatting today, so storing innerText is the right shape.

export async function getNightNotes(nightId: string): Promise<string> {
  const { data, error } = await supabase
    .from("nights")
    .select("notes")
    .eq("id", nightId)
    .maybeSingle();
  if (error) {
    console.warn("[shiftbuilder/data] getNightNotes failed", error.message);
    return "";
  }
  return (data?.notes ?? "") as string;
}

export async function saveNightNotes(nightId: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from("nights")
    .update({ notes, updated_at: new Date().toISOString() })
    .eq("id", nightId);
  if (error) {
    throw new Error(`Failed to save notes: ${error.message}`);
  }
}

// ============================================================================
// Slot Task Selector — catalog + per-night selections
// ============================================================================
//
// Requires the schema migration `supabase/migrations/20260520_slot_tasks.sql`.
// See that file for table shape + seed data.
//
// Two surfaces:
//   * slot_task_catalog — the menu of POSSIBLE tasks per (slot_key, slot_type,
//     rr_side). Loaded once on app mount and kept in component state.
//   * night_slot_tasks — which catalog tasks are SELECTED for a specific night
//     + slot. Loaded with the rest of the night, mutated by the task-selector
//     UI. Uses the same race-free `(captured nightId)` pattern as
//     upsertZoneAssignment.

export interface CatalogTask {
  id: string;
  slotKey: string;
  slotType: 'zone' | 'rr' | 'aux' | 'overlap';
  rrSide: 'mens' | 'womens' | null;
  label: string;
  sortOrder: number;
  isDefaultOnNewNight: boolean;   // NEW: when true, this task is auto-seeded on fresh nights
}

export interface NightSlotTask {
  id: string;
  nightId: string;
  slotKey: string;
  slotType: 'zone' | 'rr' | 'aux' | 'overlap';
  rrSide: 'mens' | 'womens' | null;
  taskLabel: string;
  catalogTaskId: string | null;
  sortOrder: number;
  color: string | null; // per-task highlight color (hex) for the colored sphere
  isCoverage: boolean;  // true for "Add Coverage" bars — distinct from regular tasks
}

/**
 * Full catalog (all slot types). Called once on mount; the result rarely
 * changes so the client caches it in state. If/when an admin UI lets the
 * operator edit the catalog, callers should re-fetch.
 */
export async function getSlotTaskCatalog(): Promise<CatalogTask[]> {
  const { data, error } = await supabase
    .from('slot_task_catalog')
    .select('id, slot_key, slot_type, rr_side, label, sort_order, is_default_on_new_night')
    .order('slot_type', { ascending: true })
    .order('slot_key', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (error) {
    // Supabase PostgrestError can serialize to {} via console.error in some
    // browsers — surface each field explicitly so the real cause is visible.
    console.error('[shiftbuilder/data] getSlotTaskCatalog error:', {
      message: (error as any).message,
      details: (error as any).details,
      hint: (error as any).hint,
      code: (error as any).code,
    });
    return [];
  }

  const mapped = (data || []).map((r: any) => ({
    id: r.id,
    slotKey: r.slot_key,
    slotType: r.slot_type,
    rrSide: r.rr_side,
    label: r.label,
    sortOrder: r.sort_order ?? 0,
    isDefaultOnNewNight: r.is_default_on_new_night ?? false,
  }));
  return mapped;
}

/**
 * Selections for a single night. Returns one row per (slot, task) pair.
 * The UI groups them by slot key downstream.
 */
export async function getNightSlotTasks(nightId: string): Promise<NightSlotTask[]> {
  if (!nightId) return [];

  const { data, error } = await supabase
    .from('night_slot_tasks')
    .select('id, night_id, slot_key, slot_type, rr_side, task_label, catalog_task_id, sort_order, color, is_coverage')
    .eq('night_id', nightId)
    .order('sort_order', { ascending: true })
    .order('task_label', { ascending: true });

  if (error) {
    console.error('[shiftbuilder/data] getNightSlotTasks error:', error);
    return [];
  }

  return (data || []).map((r: any) => ({
    id: r.id,
    nightId: r.night_id,
    slotKey: r.slot_key,
    slotType: r.slot_type,
    rrSide: r.rr_side,
    taskLabel: r.task_label,
    catalogTaskId: r.catalog_task_id,
    sortOrder: r.sort_order ?? 0,
    color: r.color ?? null,
    isCoverage: r.is_coverage ?? false,
  }));
}

/**
 * Idempotent: ON CONFLICT (the unique index on
 * night_id, slot_key, slot_type, rr_side, task_label) does nothing. Safe to
 * call repeatedly if the UI fires the same toggle twice.
 */
export interface AddTaskParams {
  nightId: string;
  slotKey: string;
  slotType: 'zone' | 'rr' | 'aux' | 'overlap';
  rrSide?: 'mens' | 'womens' | null;
  taskLabel: string;
  catalogTaskId?: string | null;
  sortOrder?: number;
  color?: string | null; // optional highlight color for the task sphere
  isCoverage?: boolean;  // true for "Add Coverage" bars
}

export async function addNightSlotTask(params: AddTaskParams): Promise<void> {
  const {
    nightId, slotKey, slotType,
    rrSide = null, taskLabel,
    catalogTaskId = null, sortOrder = 0,
    color = null,
    isCoverage = false,
  } = params;

  if (!nightId || !slotKey || !taskLabel) {
    throw new Error('addNightSlotTask requires nightId, slotKey, taskLabel');
  }

  // Insert; rely on the unique index to dedupe. We can't easily use upsert
  // here because the unique key includes COALESCE(rr_side, '_none_') which
  // PostgREST doesn't expose as an onConflict target. Insert + swallow
  // duplicate-key errors is the simplest path.
  const { error } = await supabase
    .from('night_slot_tasks')
    .insert({
      night_id: nightId,
      slot_key: slotKey,
      slot_type: slotType,
      rr_side: rrSide,
      task_label: taskLabel,
      catalog_task_id: catalogTaskId,
      sort_order: sortOrder,
      color,
      is_coverage: isCoverage,
    });

  if (error) {
    // 23505 = unique_violation; treat as no-op since the task is already
    // selected. Anything else is a real error.
    if ((error as any).code === '23505') return;
    logSupabaseError('addNightSlotTask failed', error);
    throw new Error(`Failed to add task: ${error.message || 'unknown'} (code: ${error.code || 'unknown'})`);
  }
}

/**
 * Append an operator-authored task to the catalog for a specific slot. Used by
 * the in-app "+ Add custom task" input in the task selector. Returns the new
 * row so the client can stitch it into local state without re-fetching the
 * full catalog.
 *
 * Idempotent on (slot_key, slot_type, rr_side, label) — if the operator
 * adds the same label twice we just return the existing row instead of
 * erroring out.
 */
export interface AddCatalogParams {
  slotKey: string;
  slotType: 'zone' | 'rr' | 'aux' | 'overlap';
  rrSide?: 'mens' | 'womens' | null;
  label: string;
  sortOrder?: number;
}

export async function addSlotCatalogTask(params: AddCatalogParams): Promise<CatalogTask | null> {
  const { slotKey, slotType, rrSide = null, label, sortOrder = 100 } = params;
  if (!slotKey || !label.trim()) {
    throw new Error('addSlotCatalogTask requires slotKey and non-empty label');
  }

  // Try insert first.
  const { data, error } = await supabase
    .from('slot_task_catalog')
    .insert({
      slot_key: slotKey,
      slot_type: slotType,
      rr_side: rrSide,
      label: label.trim(),
      sort_order: sortOrder,
    })
    .select('id, slot_key, slot_type, rr_side, label, sort_order, is_default_on_new_night')
    .single();

  if (!error && data) {
    return {
      id: data.id,
      slotKey: data.slot_key,
      slotType: data.slot_type,
      rrSide: data.rr_side,
      label: data.label,
      sortOrder: data.sort_order ?? 0,
      isDefaultOnNewNight: data.is_default_on_new_night ?? false,
    };
  }

  // 23505 = unique_violation: row already exists. Fetch + return it.
  if ((error as any)?.code === '23505') {
    let q = supabase
      .from('slot_task_catalog')
      .select('id, slot_key, slot_type, rr_side, label, sort_order, is_default_on_new_night')
      .eq('slot_key', slotKey)
      .eq('slot_type', slotType)
      .eq('label', label.trim());
    q = rrSide ? q.eq('rr_side', rrSide) : q.is('rr_side', null);
    const { data: existing } = await q.maybeSingle();
    if (existing) {
      return {
        id: existing.id,
        slotKey: existing.slot_key,
        slotType: existing.slot_type,
        rrSide: existing.rr_side,
        label: existing.label,
        sortOrder: existing.sort_order ?? 0,
        isDefaultOnNewNight: existing.is_default_on_new_night ?? false,
      };
    }
  }

  console.error('[shiftbuilder/data] addSlotCatalogTask failed:', error);
  throw new Error(`Failed to add catalog task: ${(error as any)?.message ?? 'unknown'}`);
}

export interface RemoveTaskParams {
  nightId: string;
  slotKey: string;
  slotType: 'zone' | 'rr' | 'aux' | 'overlap';
  rrSide?: 'mens' | 'womens' | null;
  taskLabel: string;
}

export async function removeNightSlotTask(params: RemoveTaskParams): Promise<void> {
  const { nightId, slotKey, slotType, rrSide = null, taskLabel } = params;
  if (!nightId || !slotKey || !taskLabel) {
    throw new Error('removeNightSlotTask requires nightId, slotKey, taskLabel');
  }

  let q = supabase
    .from('night_slot_tasks')
    .delete()
    .eq('night_id', nightId)
    .eq('slot_key', slotKey)
    .eq('slot_type', slotType)
    .eq('task_label', taskLabel);

  // The unique index treats NULL rr_side as a sentinel; the delete predicate
  // has to match the same shape.
  if (rrSide) q = q.eq('rr_side', rrSide);
  else q = q.is('rr_side', null);

  const { error } = await q;
  if (error) {
    logSupabaseError('removeNightSlotTask failed', error);
    throw new Error(`Failed to remove task: ${error.message || 'unknown'} (code: ${error.code || 'unknown'})`);
  }
}

/**
 * Set (or clear) the highlight color on a specific task row.
 * Used for the per-task colored sphere feature.
 */
export async function updateNightSlotTaskColor(
  nightId: string,
  slotKey: string,
  taskLabel: string,
  color: string | null,
  rrSide: 'mens' | 'womens' | null = null
): Promise<void> {
  if (!nightId || !slotKey || !taskLabel) {
    throw new Error('setNightSlotTaskColor requires nightId, slotKey, taskLabel');
  }

  let q = supabase
    .from('night_slot_tasks')
    .update({ color })
    .eq('night_id', nightId)
    .eq('slot_key', slotKey)
    .eq('task_label', taskLabel);

  if (rrSide) q = q.eq('rr_side', rrSide);
  else q = q.is('rr_side', null);

  const { error } = await q;

  if (error) {
    logSupabaseError('updateNightSlotTaskColor failed', error);
    throw new Error(`Failed to set task color: ${error.message || 'unknown'} (code: ${error.code || 'unknown'})`);
  }
}

/**
 * Rename / edit the label of an existing task on a slot.
 * Because the label is part of the identifying key, we update the task_label column directly.
 */
export async function updateNightSlotTaskLabel(
  nightId: string,
  slotKey: string,
  oldLabel: string,
  newLabel: string,
  rrSide: 'mens' | 'womens' | null = null
): Promise<void> {
  if (!nightId || !slotKey || !oldLabel || !newLabel) {
    throw new Error('updateNightSlotTaskLabel requires nightId, slotKey, oldLabel, newLabel');
  }

  const trimmed = newLabel.trim();
  if (!trimmed) {
    throw new Error('Task label cannot be empty');
  }

  let q = supabase
    .from('night_slot_tasks')
    .update({ task_label: trimmed })
    .eq('night_id', nightId)
    .eq('slot_key', slotKey)
    .eq('task_label', oldLabel);

  if (rrSide) q = q.eq('rr_side', rrSide);
  else q = q.is('rr_side', null);

  const { error } = await q;

  if (error) {
    logSupabaseError('updateNightSlotTaskLabel failed', error);
    throw new Error(`Failed to update task label: ${error.message || 'unknown'} (code: ${error.code || 'unknown'})`);
  }
}

// ============================================================================
// Catalog & Task Management (for Sudo "Tasks" hub + cross-card drag)
// ============================================================================
//
// New helpers (2026-05-22) to support the central Tasks tab and the ability
// to drag a task instance from one card/slot to another on the canvas.
//
// All follow the same error-logging + validation style as the functions above.
// No schema changes required — the existing tables are sufficient.
//

export interface UpdateCatalogParams {
  id: string;
  label?: string;
  sortOrder?: number;
  slotKey?: string;
  slotType?: 'zone' | 'rr' | 'aux' | 'overlap';
  rrSide?: 'mens' | 'womens' | null;
  isDefaultOnNewNight?: boolean;   // NEW
}

/** Update a catalog row (label, sort, or rarely its slot targeting). */
export async function updateCatalogTask(params: UpdateCatalogParams): Promise<void> {
  const { id, label, sortOrder, slotKey, slotType, rrSide } = params;
  if (!id) throw new Error('updateCatalogTask requires id');

  const updates: Record<string, any> = {};
  if (label !== undefined) updates.label = label.trim();
  if (sortOrder !== undefined) updates.sort_order = sortOrder;
  if (slotKey !== undefined) updates.slot_key = slotKey;
  if (slotType !== undefined) updates.slot_type = slotType;
  if (rrSide !== undefined) updates.rr_side = rrSide;
  if ((params as any).isDefaultOnNewNight !== undefined) {
    updates.is_default_on_new_night = (params as any).isDefaultOnNewNight;
  }

  if (Object.keys(updates).length === 0) return;

  const { error } = await supabase
    .from('slot_task_catalog')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('[shiftbuilder/data] updateCatalogTask failed:', error);
    throw new Error(`Failed to update catalog task: ${error.message}`);
  }
}

/** Delete a catalog definition. Night rows keep their denormalized label (safe). */
export async function deleteCatalogTask(id: string): Promise<void> {
  if (!id) throw new Error('deleteCatalogTask requires id');

  const { error } = await supabase
    .from('slot_task_catalog')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[shiftbuilder/data] deleteCatalogTask failed:', error);
    throw new Error(`Failed to delete catalog task: ${error.message}`);
  }
}

/** Return how many night_slot_tasks rows currently reference a catalog id (for delete guard). */
export async function getCatalogTaskUsageCount(catalogTaskId: string): Promise<number> {
  if (!catalogTaskId) return 0;

  const { count, error } = await supabase
    .from('night_slot_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('catalog_task_id', catalogTaskId);

  if (error) {
    console.error('[shiftbuilder/data] getCatalogTaskUsageCount failed:', error);
    return 0;
  }
  return count ?? 0;
}

export interface MoveTaskParams {
  nightId: string;
  fromSlotKey: string;
  fromSlotType: 'zone' | 'rr' | 'aux' | 'overlap';
  fromRrSide?: 'mens' | 'womens' | null;
  toSlotKey: string;
  toSlotType: 'zone' | 'rr' | 'aux' | 'overlap';
  toRrSide?: 'mens' | 'womens' | null;
  taskLabel: string;
}

/**
 * Move an existing task selection from one slot to another for the same night.
 * Uses the composite key to locate the row, then updates its slot targeting fields.
 * This is the persistence for "drag a task chip from one card to another".
 */
export async function moveNightSlotTask(params: MoveTaskParams): Promise<void> {
  const {
    nightId, taskLabel,
    fromSlotKey, fromSlotType, fromRrSide = null,
    toSlotKey, toSlotType, toRrSide = null,
  } = params;

  if (!nightId || !taskLabel || !fromSlotKey || !toSlotKey) {
    throw new Error('moveNightSlotTask requires nightId, taskLabel, from/to slot keys');
  }

  // Locate the row by the old composite key (label is the stable human key within a night+slot)
  const { data: existing, error: findErr } = await supabase
    .from('night_slot_tasks')
    .select('id, color, sort_order, catalog_task_id')
    .eq('night_id', nightId)
    .eq('slot_key', fromSlotKey)
    .eq('slot_type', fromSlotType)
    .eq('task_label', taskLabel)
    .maybeSingle();

  if (findErr) {
    console.error('[shiftbuilder/data] moveNightSlotTask find failed:', findErr);
    throw new Error(`Failed to locate task for move: ${findErr.message}`);
  }
  if (!existing) {
    // Already moved or never existed — treat as success (idempotent for UI)
    return;
  }

  // Update the targeting columns on the existing row (preserves id, color, sort, catalog link)
  const { error: updErr } = await supabase
    .from('night_slot_tasks')
    .update({
      slot_key: toSlotKey,
      slot_type: toSlotType,
      rr_side: toRrSide,
    })
    .eq('id', existing.id);

  if (updErr) {
    logSupabaseError('moveNightSlotTask update failed', updErr);
    throw new Error(
      `Failed to move task: ${updErr.message || 'unknown error'} (code: ${updErr.code || 'unknown'})`
    );
  }
}

/** Batch update sort_order for several catalog rows (used by drag-reorder in the hub). */
export async function updateCatalogSortOrders(updates: Array<{ id: string; sortOrder: number }>): Promise<void> {
  if (!updates.length) return;

  // Simple sequential updates (catalog is tiny; avoids needing a more complex RPC)
  for (const u of updates) {
    const { error } = await supabase
      .from('slot_task_catalog')
      .update({ sort_order: u.sortOrder })
      .eq('id', u.id);
    if (error) {
      console.error('[shiftbuilder/data] updateCatalogSortOrders partial failure on', u.id, error);
      throw new Error(`Failed to update sort order: ${error.message}`);
    }
  }
}

/**
 * Seed a night with all catalog tasks that are marked as "default on new night".
 * This is the sustainable replacement for manually copying tasks day-to-day.
 *
 * Safe to call multiple times — uses the existing unique constraint + the
 * idempotent behavior inside addNightSlotTask.
 */
export async function seedDefaultTasksForNight(nightId: string): Promise<number> {
  if (!nightId) return 0;

  const { data: defaults, error: catErr } = await supabase
    .from('slot_task_catalog')
    .select('id, slot_key, slot_type, rr_side, label, sort_order')
    .eq('is_default_on_new_night', true);

  if (catErr) {
    console.error('[shiftbuilder/data] seedDefaultTasksForNight catalog fetch failed:', catErr);
    throw new Error(`Failed to load default tasks: ${catErr.message}`);
  }

  if (!defaults || defaults.length === 0) {
    return 0;
  }

  let seeded = 0;
  for (const d of defaults) {
    try {
      await addNightSlotTask({
        nightId,
        slotKey: d.slot_key,
        slotType: d.slot_type as any,
        rrSide: d.rr_side as any,
        taskLabel: d.label,
        catalogTaskId: d.id,
        sortOrder: d.sort_order ?? 0,
      });
      seeded++;
    } catch (e) {
      console.warn('[shiftbuilder/data] seed skipped one task:', d.label, e);
    }
  }

  return seeded;
}

/**
 * Seed a night's break_assignments from the break_template table.
 * Called automatically by getOrCreateNightForDate — safe to also call
 * manually from the TasksTab "Apply defaults" button.
 * Idempotent: skips rows where (night_id, tm_id) already exists.
 */
export async function seedDefaultBreaksForNight(nightId: string): Promise<number> {
  if (!nightId) return 0;

  const { data: template, error: tErr } = await supabase
    .from('break_template')
    .select('tm_id, group_num, break_wave, slot_ref, sort_order')
    .order('group_num', { ascending: true })
    .order('sort_order', { ascending: true });

  if (tErr) {
    console.error('[shiftbuilder/data] seedDefaultBreaksForNight fetch failed:', tErr);
    throw new Error(`Failed to load break template: ${tErr.message}`);
  }

  if (!template || template.length === 0) return 0;

  // Get existing TM IDs for this night so we don't double-insert
  const { data: existing } = await supabase
    .from('break_assignments')
    .select('tm_id')
    .eq('night_id', nightId);

  const existingTmIds = new Set((existing || []).map((r: any) => r.tm_id));

  const toInsert = template
    .filter((r: any) => !existingTmIds.has(r.tm_id))
    .map((r: any) => ({
      night_id: nightId,
      tm_id: r.tm_id,
      group_num: r.group_num,
      break_wave: r.break_wave,
      slot_ref: r.slot_ref,
      sort_order: r.sort_order,
    }));

  if (toInsert.length === 0) return 0;

  const { error: iErr } = await supabase.from('break_assignments').insert(toInsert);
  if (iErr) {
    console.error('[shiftbuilder/data] seedDefaultBreaksForNight insert failed:', iErr);
    throw new Error(`Failed to seed break assignments: ${iErr.message}`);
  }

  return toInsert.length;
}

// ============================================================================
// Card Border persistence (visual attention marks on cards)
// ============================================================================
//
// Stored per-night so borders survive reloads and day switches.
// Simple key-value per slot for the current GRAVE shift.
//
// Table (run once in Supabase):
//   create table if not exists night_card_borders (
//     night_id uuid references nights(id) on delete cascade,
//     slot_key text not null,
//     color text not null,
//     updated_at timestamptz default now(),
//     primary key (night_id, slot_key)
//   );
//
// RLS: same pattern as night_slot_tasks / notes — operators can manage
// borders for nights they have access to.
//

export async function getNightCardBorders(nightId: string): Promise<Record<string, string>> {
  if (!nightId) return {};

  const { data, error } = await supabase
    .from('night_card_borders')
    .select('slot_key, color')
    .eq('night_id', nightId);

  if (error) {
    console.error('[shiftbuilder/data] getNightCardBorders error:', {
      message: error.message,
      code: (error as any).code,
      details: (error as any).details,
      hint: (error as any).hint,
    });
    return {};
  }

  const result: Record<string, string> = {};
  for (const row of data || []) {
    result[row.slot_key] = row.color;
  }
  return result;
}

export async function setNightCardBorder(
  nightId: string,
  slotKey: string,
  color: string
): Promise<void> {
  if (!nightId || !slotKey || !color) return;

  const { error } = await supabase
    .from('night_card_borders')
    .upsert(
      {
        night_id: nightId,
        slot_key: slotKey,
        color,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'night_id,slot_key' }
    );

  if (error) {
    console.error('[shiftbuilder/data] setNightCardBorder failed:', {
      message: error.message,
      code: (error as any).code,
      details: (error as any).details,
      hint: (error as any).hint,
    });
    throw new Error(`Failed to save card border: ${error.message}`);
  }
}

export async function removeNightCardBorder(nightId: string, slotKey: string): Promise<void> {
  if (!nightId || !slotKey) return;

  const { error } = await supabase
    .from('night_card_borders')
    .delete()
    .eq('night_id', nightId)
    .eq('slot_key', slotKey);

  if (error) {
    console.error('[shiftbuilder/data] removeNightCardBorder failed:', {
      message: error.message,
      code: (error as any).code,
      details: (error as any).details,
      hint: (error as any).hint,
    });
    throw new Error(`Failed to remove card border: ${error.message}`);
  }
}

// ============================================================================
// Break group persistence (break_assignments table)
// ============================================================================
//
// Schema-defined: UNIQUE (night_id, tm_id). A TM has exactly one break-group
// row per night, regardless of how many slots they happen to touch on the
// card grid. The UI's per-card breakGroup is stored on the assignment object
// keyed by slotKey, but the canonical truth is "this TM is in group N tonight".
//
// `break_wave` is constrained to 1/2/3 in DB. The current UI only exposes a
// single wave, so we default to wave=1 and let group_num carry the value the
// operator picks (1/2/3 — early/mid/late). If/when a UI for multi-wave
// scheduling lands, we can plumb that through here.
//
// `slot_ref` is informational — it records where the TM was working when
// the break group was set. We write the UI slot key (Z1, MRR1, AUX1, etc.)
// so a reload can re-attach the break to the same card.

export interface BreakAssignmentRow {
  nightId: string;
  tmId: string;
  groupNum: 0 | 1 | 2 | 3;
  breakWave: number;
  slotRef: string | null;
}

export async function getNightBreakAssignments(nightId: string): Promise<BreakAssignmentRow[]> {
  if (!nightId) return [];
  const { data, error } = await supabase
    .from('break_assignments')
    .select('night_id, tm_id, group_num, break_wave, slot_ref')
    .eq('night_id', nightId);
  if (error) {
    console.error('[shiftbuilder/data] getNightBreakAssignments error:', {
      message: (error as any).message,
      details: (error as any).details,
      hint: (error as any).hint,
      code: (error as any).code,
    });
    return [];
  }
  return (data || []).map((r: any) => ({
    nightId: r.night_id,
    tmId: r.tm_id,
    groupNum: r.group_num,
    breakWave: r.break_wave ?? 1,
    slotRef: r.slot_ref ?? null,
  }));
}

export interface UpsertBreakParams {
  nightId: string;
  tmId: string;
  groupNum: 0 | 1 | 2 | 3;
  slotRef?: string | null;
  breakWave?: number;
}

export async function upsertBreakAssignment(params: UpsertBreakParams): Promise<void> {
  const { nightId, tmId, groupNum, slotRef = null, breakWave = 1 } = params;
  if (!nightId || !tmId) throw new Error('upsertBreakAssignment requires nightId + tmId');

  // (night_id, tm_id) is unique — onConflict picks that up so updates land
  // cleanly without needing a separate path for "row exists".
  const { error } = await supabase
    .from('break_assignments')
    .upsert(
      {
        night_id: nightId,
        tm_id: tmId,
        group_num: groupNum,
        break_wave: breakWave,
        slot_ref: slotRef,
        sort_order: groupNum, // not user-facing for now; mirrors group_num so ordering is stable
        is_wave_locked: false,
      },
      { onConflict: 'night_id,tm_id' }
    );
  if (error) {
    console.error('[shiftbuilder/data] upsertBreakAssignment failed:', {
      message: (error as any).message,
      details: (error as any).details,
      hint: (error as any).hint,
      code: (error as any).code,
    });
    throw new Error(`Failed to save break group: ${(error as any).message ?? 'unknown'}`);
  }
}

export async function deleteBreakAssignment(nightId: string, tmId: string): Promise<void> {
  if (!nightId || !tmId) return;
  const { error } = await supabase
    .from('break_assignments')
    .delete()
    .eq('night_id', nightId)
    .eq('tm_id', tmId);
  if (error) {
    console.error('[shiftbuilder/data] deleteBreakAssignment failed:', error);
    throw new Error(`Failed to clear break assignment: ${(error as any).message ?? 'unknown'}`);
  }
}

// ============================================================================
// Realtime / Live Sync helpers
// ============================================================================

/**
 * Create a Supabase Realtime channel for live updates on zone_assignments for a specific night.
 * 
 * Usage in component:
 *   const channel = createNightAssignmentChannel(nightId, (payload) => { refetchAssignments(); });
 *   // later channel.unsubscribe()
 */
export function createNightAssignmentChannel(
  nightId: string,
  onChange: (payload: any) => void
) {
  const client = getSupabaseClient();

  return client
    .channel(`shiftbuilder-zone-assignments-${nightId}`)
    .on(
      'postgres_changes',
      {
        event: '*', // INSERT | UPDATE | DELETE
        schema: 'public',
        table: 'zone_assignments',
        filter: `night_id=eq.${nightId}`,
      },
      (payload) => {
        // eslint-disable-next-line no-console
        console.log('[shiftbuilder] realtime change received', payload.eventType, (payload.new as any)?.slot_key);
        onChange(payload);
      }
    )
    .subscribe((status) => {
      // eslint-disable-next-line no-console
      console.log('[shiftbuilder] realtime subscription status:', status);
    });
}

/**
 * Convenience: unsubscribe helper.
 */
export async function unsubscribeChannel(channel: any) {
  if (channel) {
    await supabase.removeChannel(channel);
  }
}

// ============================================================================
// Debug / Utility
// ============================================================================

export async function getNightSummary(nightId: string) {
  const [assignments, night] = await Promise.all([
    getNightAssignments(nightId),
    supabase.from('nights').select('*').eq('id', nightId).single(),
  ]);

  const filled = assignments.filter((a) => a.tmId).length;
  return {
    night: night.data,
    totalSlots: assignments.length,
    filled,
    unfilled: assignments.length - filled,
    assignments,
  };
}

// ============================================================================
// Engine reference data (Phase 1 weighted scoring)
// ----------------------------------------------------------------------------
// These fetchers feed the deterministic scoring layer. Each returns a compact
// shape keyed for fast lookup. Failure modes are conservative — on error we
// return an empty result rather than throwing, so the engine can fall back
// to skill-only scoring without crashing the page.
// ============================================================================

export interface TMPreferenceRow {
  tmId: string;
  stance: "prefer" | "avoid" | string;
  strength: "hard" | "soft" | string;
  target: string; // slotKey
  note: string | null;
}

export async function getTMPreferences(): Promise<TMPreferenceRow[]> {
  const { data, error } = await supabase
    .from("tm_preferences")
    .select("tm_id, stance, strength, target, note");
  if (error) {
    console.warn("[data] getTMPreferences failed:", error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    tmId: r.tm_id,
    stance: r.stance,
    strength: r.strength,
    target: r.target,
    note: r.note ?? null,
  }));
}

export interface TMPairAffinityRow {
  tmId: string;
  withTmId: string | null;
  withLabel: string | null;
  stance: "prefer" | "avoid" | string;
  strength: "hard" | "soft" | string;
  note: string | null;
}

export async function getTMPairAffinities(): Promise<TMPairAffinityRow[]> {
  const { data, error } = await supabase
    .from("tm_pair_affinities")
    .select("tm_id, with_tm_id, with_label, stance, strength, note");
  if (error) {
    console.warn("[data] getTMPairAffinities failed:", error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    tmId: r.tm_id,
    withTmId: r.with_tm_id ?? null,
    withLabel: r.with_label ?? null,
    stance: r.stance,
    strength: r.strength,
    note: r.note ?? null,
  }));
}

export interface TMAccommodationRow {
  tmId: string;
  /** physical / medical / other */
  type: string;
  /** hard / soft */
  severity: string;
  /** Optional slot or label this applies to (e.g. "no_sweeper", "Z9") */
  target: string | null;
  note: string;
  status: string;
}

export async function getTMAccommodations(): Promise<TMAccommodationRow[]> {
  const { data, error } = await supabase
    .from("tm_accommodations")
    .select("tm_id, type, severity, target, note, status")
    .eq("status", "active");
  if (error) {
    console.warn("[data] getTMAccommodations failed:", error.message);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    tmId: r.tm_id,
    type: r.type,
    severity: r.severity,
    target: r.target ?? null,
    note: r.note ?? "",
    status: r.status,
  }));
}

/**
 * Returns a map of slotId → difficulty (smallint 0-10). Slot IDs in this
 * table follow the DB convention ("zone_1", "rr_1_2", "admin", etc.), so the
 * caller is responsible for translating UI slot keys via slot-keys.ts if
 * needed. The engine layer wraps this lookup in `getSlotDifficultyByUIKey`.
 */
export async function getSlotDifficultyRaw(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("slot_difficulty")
    .select("slot_id, difficulty");
  if (error) {
    console.warn("[data] getSlotDifficultyRaw failed:", error.message);
    return new Map();
  }
  const out = new Map<string, number>();
  (data ?? []).forEach((r: any) => {
    out.set(r.slot_id, Number(r.difficulty));
  });
  return out;
}

/**
 * Returns a map of tmId → skill_score (numeric 0-10). Read once on shift load.
 */
export async function getTMSkillScores(): Promise<Map<string, number>> {
  const { data, error } = await supabase
    .from("tm_profiles")
    .select("tm_id, skill_score")
    .eq("active", true);
  if (error) {
    console.warn("[data] getTMSkillScores failed:", error.message);
    return new Map();
  }
  const out = new Map<string, number>();
  (data ?? []).forEach((r: any) => {
    if (r.skill_score !== null && r.skill_score !== undefined) {
      out.set(r.tm_id, Number(r.skill_score));
    }
  });
  return out;
}

/**
 * Returns the set of TM ids explicitly marked as scheduled to work this
 * specific night, from the `night_tm_status` table. Populated by the SUDO
 * Schedules tab when an ADP XLSX is imported.
 *
 * Status semantics:
 *   - 'present' / 'scheduled' → working tonight → included
 *   - 'off' / 'called_off' → not working → excluded
 *   - missing row → unknown; the engine treats this as "no schedule data
 *     available for this night" and falls back to the broader graveRoster.
 *
 * Returns an empty set when no rows exist, which the caller uses as a
 * signal that the filter shouldn't be applied (no schedule loaded yet).
 */
export async function getScheduledTmIdsForNight(
  nightId: string
): Promise<Set<string>> {
  if (!nightId) return new Set();

  const { data, error } = await supabase
    .from("night_tm_status")
    .select("tm_id, status")
    .eq("night_id", nightId)
    .in("status", ["present", "scheduled"]);

  if (error) {
    console.warn("[data] getScheduledTmIdsForNight failed:", error.message);
    return new Set();
  }

  return new Set((data ?? []).map((r: any) => r.tm_id));
}

/**
 * Returns the last N nights of zone_assignments for use in rotation /
 * area_diversity calculations (Phase 2 signals). The result is a map of
 * tmId → [{nightDate, slotKey}] so the planner can compute "how recently
 * was this TM in this slot". Skips the current night.
 */
export async function getRecentZoneHistory(
  beforeDate: Date,
  nights: number
): Promise<Map<string, Array<{ nightDate: string; slotKey: string }>>> {
  const cutoff = new Date(beforeDate);
  cutoff.setDate(cutoff.getDate() - nights);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const beforeIso = beforeDate.toISOString().slice(0, 10);

  const { data: nightRows, error: nightErr } = await supabase
    .from("nights")
    .select("id, night_date")
    .gte("night_date", cutoffIso)
    .lt("night_date", beforeIso);
  if (nightErr || !nightRows || nightRows.length === 0) {
    if (nightErr) console.warn("[data] getRecentZoneHistory nights failed:", nightErr.message);
    return new Map();
  }

  const nightIdToDate = new Map<string, string>();
  nightRows.forEach((n: any) => nightIdToDate.set(n.id, n.night_date));

  const { data: assignmentRows, error: assignErr } = await supabase
    .from("zone_assignments")
    .select("night_id, slot_key, tm_id")
    .in("night_id", Array.from(nightIdToDate.keys()))
    .not("tm_id", "is", null);
  if (assignErr) {
    console.warn("[data] getRecentZoneHistory assignments failed:", assignErr.message);
    return new Map();
  }

  const out = new Map<string, Array<{ nightDate: string; slotKey: string }>>();
  (assignmentRows ?? []).forEach((r: any) => {
    const nightDate = nightIdToDate.get(r.night_id) ?? "";
    if (!out.has(r.tm_id)) out.set(r.tm_id, []);
    out.get(r.tm_id)!.push({ nightDate, slotKey: r.slot_key });
  });
  return out;
}

// ============================================================================
// Zone Frequency Report — powers the Reports tab in SudoWindow
// ============================================================================

export interface ZoneFrequencyEntry {
  tmId: string;
  tmName: string;
  /** UI key (Z1…Z10) → number of times placed in that zone in the window. */
  zoneCounts: Record<string, number>;
  /** Distinct nights this TM had any zone assignment. */
  totalShifts: number;
  /** ISO date string of the most recent assignment in the window. */
  lastDate: string;
}

export interface ZoneFrequencyReport {
  byTm: ZoneFrequencyEntry[];
  dateRange: { from: string; to: string };
  /** Distinct nights that exist in the DB for the window. */
  totalNights: number;
}

/**
 * Aggregate zone placement frequency per TM for the last `days` calendar days.
 * Only slot_type='zone' rows are counted — RR, AUX, and overlaps are excluded.
 * Returns byTm sorted by totalShifts DESC.
 */
export async function getZoneFrequencyReport(days: number): Promise<ZoneFrequencyReport> {
  const client = getSupabaseClient();
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);

  const todayIso = today.toISOString().slice(0, 10);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const empty: ZoneFrequencyReport = {
    byTm: [],
    dateRange: { from: cutoffIso, to: todayIso },
    totalNights: 0,
  };

  // Step 1: Resolve night IDs in the date window.
  const { data: nightRows, error: nightErr } = await client
    .from("nights")
    .select("id, night_date")
    .gte("night_date", cutoffIso)
    .lte("night_date", todayIso);

  if (nightErr) {
    console.warn("[data] getZoneFrequencyReport nights failed:", nightErr.message);
    return empty;
  }
  if (!nightRows || nightRows.length === 0) return empty;

  const nightIdToDate = new Map<string, string>();
  (nightRows as any[]).forEach((n) => nightIdToDate.set(n.id, n.night_date));

  // Step 2: Fetch zone-only assignments (excludes rr, aux, overlap).
  const { data: assignmentRows, error: assignErr } = await client
    .from("zone_assignments")
    .select("night_id, slot_key, tm_id")
    .in("night_id", Array.from(nightIdToDate.keys()))
    .eq("slot_type", "zone")
    .not("tm_id", "is", null);

  if (assignErr) {
    console.warn("[data] getZoneFrequencyReport assignments failed:", assignErr.message);
    return { ...empty, totalNights: nightRows.length };
  }
  if (!assignmentRows || assignmentRows.length === 0) {
    return { ...empty, totalNights: nightRows.length };
  }

  // Step 3: Aggregate counts per (tmId, uiZoneKey).
  // DB key "zone_N" → UI key "ZN" — zones only, simple regex, no slot-keys import needed.
  const dbZoneToUi = (dbKey: string): string => {
    const m = dbKey.match(/^zone_(\d+)$/);
    return m ? `Z${m[1]}` : dbKey;
  };

  const tmMap = new Map<string, {
    zoneCounts: Record<string, number>;
    nightDates: Set<string>;
    lastDate: string;
  }>();

  (assignmentRows as any[]).forEach((row) => {
    const nightDate = nightIdToDate.get(row.night_id) ?? "";
    const uiKey = dbZoneToUi(row.slot_key);
    const tmId: string = row.tm_id;

    if (!tmMap.has(tmId)) {
      tmMap.set(tmId, { zoneCounts: {}, nightDates: new Set(), lastDate: "" });
    }
    const entry = tmMap.get(tmId)!;
    entry.zoneCounts[uiKey] = (entry.zoneCounts[uiKey] ?? 0) + 1;
    entry.nightDates.add(nightDate);
    if (nightDate > entry.lastDate) entry.lastDate = nightDate;
  });

  // Step 4: Batch-fetch display names.
  const tmIds = Array.from(tmMap.keys());
  const { data: profiles } = await client
    .from("tm_profiles")
    .select("tm_id, display_name, full_name")
    .in("tm_id", tmIds);

  const nameMap = new Map<string, string>();
  (profiles ?? []).forEach((p: any) => {
    nameMap.set(p.tm_id, p.display_name || p.full_name || p.tm_id);
  });

  // Step 5: Shape output, sort by totalShifts DESC.
  const byTm: ZoneFrequencyEntry[] = Array.from(tmMap.entries())
    .map(([tmId, data]) => ({
      tmId,
      tmName: nameMap.get(tmId) ?? tmId,
      zoneCounts: data.zoneCounts,
      totalShifts: data.nightDates.size,
      lastDate: data.lastDate,
    }))
    .sort((a, b) => b.totalShifts - a.totalShifts);

  return {
    byTm,
    dateRange: { from: cutoffIso, to: todayIso },
    totalNights: nightRows.length,
  };
}

// ============================================================================
// Zone Detail Report — full per-TM placement history with date arrays + DOW
// ============================================================================

export type ReportWindow = 14 | 30 | 60 | "this-week" | "last-4-weeks";

export interface ZoneDetailEntry {
  tmId: string;
  tmName: string;
  /** zone key → dates sorted newest-first */
  zoneDates: Record<string, string[]>;
  /** zone key → count (derived from zoneDates) */
  zoneCounts: Record<string, number>;
  /** total zone placements in window */
  totalAssignments: number;
  /** distinct nights with any zone assignment */
  totalNights: number;
  /** most recent assignment date (ISO) */
  lastDate: string;
  /** zone key → [Sun,Mon,Tue,Wed,Thu,Fri,Sat] counts */
  zoneDow: Record<string, number[]>;
}

export interface ZoneDetailReport {
  entries: ZoneDetailEntry[];
  dateRange: { from: string; to: string };
  totalNights: number;
}

/** Compute Fri–Thu grave week boundaries. */
function graveWeekRange(which: "this-week" | "last-4-weeks"): { from: string; to: string } {
  const today = new Date();
  const daysSinceFri = (today.getDay() + 2) % 7; // 0=Fri, 1=Sat, 2=Sun, …, 6=Thu
  const thisFri = new Date(today);
  thisFri.setDate(today.getDate() - daysSinceFri);

  if (which === "this-week") {
    const thu = new Date(thisFri);
    thu.setDate(thisFri.getDate() + 6);
    return { from: thisFri.toISOString().slice(0, 10), to: thu.toISOString().slice(0, 10) };
  }
  // last-4-weeks: 4 complete Fri–Thu weeks ending the day before this Friday
  const to = new Date(thisFri);
  to.setDate(thisFri.getDate() - 1);
  const from = new Date(to);
  from.setDate(to.getDate() - 27);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

/**
 * Rich zone placement report retaining full per-TM per-zone date history.
 * Supports rolling calendar windows (14/30/60 days) and Fri–Thu grave weeks.
 * Only slot_type='zone' rows are counted (no RR, AUX, overlaps).
 */
export async function getZoneDetailReport(reportWindow: ReportWindow): Promise<ZoneDetailReport> {
  const client = getSupabaseClient();

  let from: string, to: string;
  if (typeof reportWindow === "number") {
    const today = new Date();
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() - reportWindow);
    from = cutoff.toISOString().slice(0, 10);
    to = today.toISOString().slice(0, 10);
  } else {
    ({ from, to } = graveWeekRange(reportWindow));
  }

  const empty: ZoneDetailReport = { entries: [], dateRange: { from, to }, totalNights: 0 };

  const { data: nightRows, error: nightErr } = await client
    .from("nights")
    .select("id, night_date")
    .gte("night_date", from)
    .lte("night_date", to);

  if (nightErr || !nightRows?.length) return empty;

  const nightIdToDate = new Map<string, string>();
  (nightRows as any[]).forEach((n) => nightIdToDate.set(n.id, n.night_date));

  const { data: assignmentRows, error: assignErr } = await client
    .from("zone_assignments")
    .select("night_id, slot_key, slot_type, rr_side, tm_id")
    .in("night_id", Array.from(nightIdToDate.keys()))
    .not("slot_type", "eq", "overlap")
    .not("tm_id", "is", null);

  if (assignErr || !assignmentRows?.length) {
    return { ...empty, totalNights: nightRows.length };
  }

  const tmMap = new Map<string, {
    zoneDates: Record<string, string[]>;
    nightDates: Set<string>;
    lastDate: string;
  }>();

  for (const row of assignmentRows as any[]) {
    const d = nightIdToDate.get(row.night_id) ?? "";
    if (!d) continue;
    const z = dbToUi(row.slot_key, row.slot_type ?? "zone", row.rr_side ?? null);
    if (z.startsWith("UNK:")) continue;
    const id: string = row.tm_id;
    if (!tmMap.has(id)) tmMap.set(id, { zoneDates: {}, nightDates: new Set(), lastDate: "" });
    const e = tmMap.get(id)!;
    if (!e.zoneDates[z]) e.zoneDates[z] = [];
    e.zoneDates[z].push(d);
    e.nightDates.add(d);
    if (d > e.lastDate) e.lastDate = d;
  }

  const tmIds = Array.from(tmMap.keys());
  const { data: profiles } = await client
    .from("tm_profiles")
    .select("tm_id, display_name, full_name")
    .in("tm_id", tmIds);

  const nameMap = new Map<string, string>();
  (profiles ?? []).forEach((p: any) =>
    nameMap.set(p.tm_id, p.display_name || p.full_name || p.tm_id)
  );

  const entries: ZoneDetailEntry[] = Array.from(tmMap.entries())
    .map(([tmId, data]) => {
      const zoneCounts: Record<string, number> = {};
      const zoneDow: Record<string, number[]> = {};
      let totalAssignments = 0;

      for (const [zKey, dates] of Object.entries(data.zoneDates)) {
        dates.sort((a, b) => b.localeCompare(a)); // newest-first
        zoneCounts[zKey] = dates.length;
        totalAssignments += dates.length;
        const dow = [0, 0, 0, 0, 0, 0, 0];
        for (const d of dates) dow[new Date(d + "T12:00:00").getDay()]++;
        zoneDow[zKey] = dow;
      }

      return {
        tmId,
        tmName: nameMap.get(tmId) ?? tmId,
        zoneDates: data.zoneDates,
        zoneCounts,
        totalAssignments,
        totalNights: data.nightDates.size,
        lastDate: data.lastDate,
        zoneDow,
      };
    })
    .sort((a, b) => b.totalAssignments - a.totalAssignments);

  return { entries, dateRange: { from, to }, totalNights: nightRows.length };
}

/**
 * Placement history for a single TM across all slot types (zone, rr, aux).
 * Used by MarkerPad to show the mini history widget when a TM is assigned.
 * Returns null when no data exists in the window.
 */
export async function getTmPlacementHistory(
  tmId: string,
  days = 30
): Promise<ZoneDetailEntry | null> {
  const client = getSupabaseClient();
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - days);
  const from = cutoff.toISOString().slice(0, 10);
  const to   = today.toISOString().slice(0, 10);

  const { data: nightRows } = await client
    .from("nights")
    .select("id, night_date")
    .gte("night_date", from)
    .lte("night_date", to);

  if (!nightRows?.length) return null;

  const nightIdToDate = new Map<string, string>();
  (nightRows as any[]).forEach((n) => nightIdToDate.set(n.id, n.night_date));

  const { data: rows } = await client
    .from("zone_assignments")
    .select("night_id, slot_key, slot_type, rr_side")
    .in("night_id", Array.from(nightIdToDate.keys()))
    .eq("tm_id", tmId)
    .not("slot_type", "eq", "overlap");

  if (!rows?.length) return null;

  const zoneDates: Record<string, string[]> = {};
  const nightDates = new Set<string>();
  let lastDate = "";

  for (const row of rows as any[]) {
    const d = nightIdToDate.get(row.night_id) ?? "";
    if (!d) continue;
    const z = dbToUi(row.slot_key, row.slot_type ?? "zone", row.rr_side ?? null);
    if (z.startsWith("UNK:")) continue;
    if (!zoneDates[z]) zoneDates[z] = [];
    zoneDates[z].push(d);
    nightDates.add(d);
    if (d > lastDate) lastDate = d;
  }

  const zoneCounts: Record<string, number> = {};
  const zoneDow: Record<string, number[]> = {};
  let totalAssignments = 0;

  for (const [zKey, dates] of Object.entries(zoneDates)) {
    dates.sort((a, b) => b.localeCompare(a));
    zoneCounts[zKey] = dates.length;
    totalAssignments += dates.length;
    const dow = [0, 0, 0, 0, 0, 0, 0];
    for (const d of dates) dow[new Date(d + "T12:00:00").getDay()]++;
    zoneDow[zKey] = dow;
  }

  const { data: profile } = await client
    .from("tm_profiles")
    .select("display_name, full_name")
    .eq("tm_id", tmId)
    .single();

  return {
    tmId,
    tmName: (profile as any)?.display_name || (profile as any)?.full_name || tmId,
    zoneDates,
    zoneCounts,
    totalAssignments,
    totalNights: nightDates.size,
    lastDate,
    zoneDow,
  };
}

// ============================================================================
// Slot Defaults — per-slot default break groups and task chips
// ============================================================================
//
// slot_defaults   : one row per (slot_key, rr_side) → default_break_group (0–3)
// slot_default_tasks : N rows per (slot_key, rr_side) → task chips to seed
//
// Push operations:
//   - Push breaks → read slot_defaults, look up which TM is assigned to each
//     slot for the target night, upsert a break_assignment for that TM.
//   - Push tasks → for each slot, delete existing night_slot_tasks rows for
//     that night+slot, then insert fresh rows from slot_default_tasks.
//   - Week variants iterate over all nights in the GRAVE week (Fri–Thu) that
//     already have a row in the `nights` table.

export interface SlotDefault {
  slotKey: string;           // DB key e.g. "zone_1", "rr_1_2", "admin"
  slotType: 'zone' | 'rr' | 'aux';
  rrSide: string;            // '' for non-RR; 'mens'|'womens' for RR
  defaultBreakGroup: 0 | 1 | 2 | 3;
}

export interface SlotDefaultTask {
  id: string;
  slotKey: string;
  slotType: 'zone' | 'rr' | 'aux';
  rrSide: string;
  taskLabel: string;
  taskColor: string | null;
  isCoverage: boolean;
  sortOrder: number;
}

// ── Readers ─────────────────────────────────────────────────────────────────

export async function getSlotDefaults(): Promise<SlotDefault[]> {
  const { data, error } = await supabase
    .from('slot_defaults')
    .select('slot_key, slot_type, rr_side, default_break_group')
    .order('slot_key', { ascending: true });

  if (error) {
    console.error('[shiftbuilder/data] getSlotDefaults error:', error);
    return [];
  }

  return (data || []).map((r: any) => ({
    slotKey: r.slot_key,
    slotType: r.slot_type,
    rrSide: r.rr_side ?? '',
    defaultBreakGroup: r.default_break_group ?? 0,
  }));
}

export async function getSlotDefaultTasks(): Promise<SlotDefaultTask[]> {
  const { data, error } = await supabase
    .from('slot_default_tasks')
    .select('id, slot_key, slot_type, rr_side, task_label, task_color, is_coverage, sort_order')
    .order('sort_order', { ascending: true })
    .order('task_label', { ascending: true });

  if (error) {
    console.error('[shiftbuilder/data] getSlotDefaultTasks error:', error);
    return [];
  }

  return (data || []).map((r: any) => ({
    id: r.id,
    slotKey: r.slot_key,
    slotType: r.slot_type,
    rrSide: r.rr_side ?? '',
    taskLabel: r.task_label,
    taskColor: r.task_color ?? null,
    isCoverage: r.is_coverage ?? false,
    sortOrder: r.sort_order ?? 0,
  }));
}

// ── Writers ──────────────────────────────────────────────────────────────────

/** Upsert the break group default for a single slot. */
export async function upsertSlotDefault(params: {
  slotKey: string;
  slotType: 'zone' | 'rr' | 'aux';
  rrSide?: string;
  defaultBreakGroup: 0 | 1 | 2 | 3;
}): Promise<void> {
  const { slotKey, slotType, rrSide = '', defaultBreakGroup } = params;

  const { error } = await supabase
    .from('slot_defaults')
    .upsert(
      {
        slot_key: slotKey,
        slot_type: slotType,
        rr_side: rrSide,
        default_break_group: defaultBreakGroup,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'slot_key,rr_side' }
    );

  if (error) {
    console.error('[shiftbuilder/data] upsertSlotDefault error:', error);
    throw new Error(`Failed to save slot default: ${(error as any).message ?? 'unknown'}`);
  }
}

/** Add a task chip default for a slot. Silently dedupes on (slot_key, rr_side, task_label). */
export async function addSlotDefaultTask(params: {
  slotKey: string;
  slotType: 'zone' | 'rr' | 'aux';
  rrSide?: string;
  taskLabel: string;
  taskColor?: string | null;
  isCoverage?: boolean;
  sortOrder?: number;
}): Promise<void> {
  const {
    slotKey, slotType, rrSide = '',
    taskLabel, taskColor = null,
    isCoverage = false, sortOrder = 0,
  } = params;

  const { error } = await supabase
    .from('slot_default_tasks')
    .upsert(
      {
        slot_key: slotKey,
        slot_type: slotType,
        rr_side: rrSide,
        task_label: taskLabel,
        task_color: taskColor,
        is_coverage: isCoverage,
        sort_order: sortOrder,
      },
      { onConflict: 'slot_key,rr_side,task_label' }
    );

  if (error) {
    console.error('[shiftbuilder/data] addSlotDefaultTask error:', error);
    throw new Error(`Failed to add default task: ${(error as any).message ?? 'unknown'}`);
  }
}

/** Remove a task chip default by id. */
export async function removeSlotDefaultTask(id: string): Promise<void> {
  const { error } = await supabase
    .from('slot_default_tasks')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[shiftbuilder/data] removeSlotDefaultTask error:', error);
    throw new Error(`Failed to remove default task: ${(error as any).message ?? 'unknown'}`);
  }
}

// ── Push helpers (shared) ────────────────────────────────────────────────────

/**
 * Resolve all night IDs for the GRAVE week that contains `weekStart` (Fri).
 * Only returns nights that already exist in the DB — we never auto-create rows.
 */
async function resolveWeekNightIds(weekStart: Date): Promise<string[]> {
  // Build ISO dates Fri–Thu (7 nights)
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    dates.push(localDateIso(d));
  }

  const { data, error } = await supabase
    .from('nights')
    .select('id')
    .in('night_date', dates);

  if (error) {
    console.error('[shiftbuilder/data] resolveWeekNightIds error:', error);
    return [];
  }

  return (data || []).map((r: any) => r.id);
}

// ── Push breaks ──────────────────────────────────────────────────────────────

/**
 * For each slot that has a non-zero break default AND has a TM assigned on the
 * target night, upsert a break_assignment for that TM.
 * Slots with no TM or group=0 are skipped.
 */
export async function pushBreakDefaultsToNight(nightId: string): Promise<{ applied: number }> {
  if (!nightId) return { applied: 0 };

  const [defaults, assignments] = await Promise.all([
    getSlotDefaults(),
    // Fetch current zone_assignments for the night
    supabase
      .from('zone_assignments')
      .select('slot_key, rr_side, tm_id')
      .eq('night_id', nightId)
      .not('tm_id', 'is', null),
  ]);

  if (assignments.error) {
    console.error('[shiftbuilder/data] pushBreakDefaultsToNight fetch error:', assignments.error);
    throw new Error(`Failed to load assignments: ${(assignments.error as any).message}`);
  }

  // Build map: "slot_key|rr_side" → tm_id
  const assignMap = new Map<string, string>();
  for (const row of (assignments.data || [])) {
    const key = `${row.slot_key}|${row.rr_side ?? ''}`;
    if (row.tm_id) assignMap.set(key, row.tm_id);
  }

  let applied = 0;
  const upserts: Promise<void>[] = [];

  for (const def of defaults) {
    if (!def.defaultBreakGroup) continue; // 0 = unset, skip

    const mapKey = `${def.slotKey}|${def.rrSide}`;
    const tmId = assignMap.get(mapKey);
    if (!tmId) continue; // nobody assigned here tonight

    upserts.push(
      upsertBreakAssignment({
        nightId,
        tmId,
        groupNum: def.defaultBreakGroup,
        slotRef: def.slotKey,
      })
    );
    applied++;
  }

  await Promise.all(upserts);
  return { applied };
}

/** Push break defaults to all existing nights in the GRAVE week. */
export async function pushBreakDefaultsToWeek(
  weekStart: Date
): Promise<{ nights: number; applied: number }> {
  const nightIds = await resolveWeekNightIds(weekStart);
  let totalApplied = 0;

  for (const nightId of nightIds) {
    const { applied } = await pushBreakDefaultsToNight(nightId);
    totalApplied += applied;
  }

  return { nights: nightIds.length, applied: totalApplied };
}

// ── Push tasks ───────────────────────────────────────────────────────────────

/**
 * Replace tasks for every slot that has defaults defined.
 * For each such slot: delete existing night_slot_tasks rows, then insert fresh
 * rows from slot_default_tasks (replace semantics).
 * Slots with no defaults are left untouched.
 */
export async function pushTaskDefaultsToNight(nightId: string): Promise<{ applied: number }> {
  if (!nightId) return { applied: 0 };

  const defaults = await getSlotDefaultTasks();
  if (!defaults.length) return { applied: 0 };

  // Group by "slot_key|rr_side"
  const bySlot = new Map<string, SlotDefaultTask[]>();
  for (const t of defaults) {
    const key = `${t.slotKey}|${t.rrSide}`;
    if (!bySlot.has(key)) bySlot.set(key, []);
    bySlot.get(key)!.push(t);
  }

  let applied = 0;

  for (const [compositeKey, tasks] of bySlot.entries()) {
    const [slotKey, rrSide] = compositeKey.split('|');
    const slotType = tasks[0].slotType;

    // Delete existing tasks for this slot on this night
    const deleteQuery = supabase
      .from('night_slot_tasks')
      .delete()
      .eq('night_id', nightId)
      .eq('slot_key', slotKey);

    // RR slots have rr_side; others use empty string
    const delResult = rrSide
      ? await deleteQuery.eq('rr_side', rrSide)
      : await deleteQuery;

    if (delResult.error) {
      console.error('[shiftbuilder/data] pushTaskDefaultsToNight delete error:', delResult.error);
      continue; // best-effort: skip this slot
    }

    // Insert fresh rows
    const inserts = tasks.map((t, idx) => ({
      night_id: nightId,
      slot_key: slotKey,
      slot_type: slotType,
      rr_side: rrSide || null,
      task_label: t.taskLabel,
      catalog_task_id: null,
      sort_order: t.sortOrder ?? idx,
      color: t.taskColor ?? null,
      is_coverage: t.isCoverage,
    }));

    const { error: insErr } = await supabase
      .from('night_slot_tasks')
      .insert(inserts);

    if (insErr) {
      console.error('[shiftbuilder/data] pushTaskDefaultsToNight insert error:', insErr);
      continue;
    }

    applied += tasks.length;
  }

  return { applied };
}

/** Push task defaults to all existing nights in the GRAVE week. */
export async function pushTaskDefaultsToWeek(
  weekStart: Date
): Promise<{ nights: number; applied: number }> {
  const nightIds = await resolveWeekNightIds(weekStart);
  let totalApplied = 0;

  for (const nightId of nightIds) {
    const { applied } = await pushTaskDefaultsToNight(nightId);
    totalApplied += applied;
  }

  return { nights: nightIds.length, applied: totalApplied };
}
