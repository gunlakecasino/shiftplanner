import { supabase, getSupabaseClient } from '../supabase';
import {
  readNightIdCache,
  writeNightIdCache,
  readSlotDefaultsCache,
  writeSlotDefaultsCache,
} from './clientQueryCache';
import { dbToUi, uiToDb } from './slot-keys';
import type { BreakGroupValue } from './breakGroupResolve';
import { addDays, startOfRosterWeek, daysBetween } from './dateUtils';
import type { WeeklyShift } from './types/schedules';
import { isWorkingShift } from './types/schedules';

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

/** Bust server bundle caches so refresh/reload sees fresh placement + task data. */
async function bustNightBoardServerCache(isoDate?: string): Promise<void> {
  try {
    const { revalidateNightBoardCaches } = await import('./revalidateOpsCache');
    await revalidateNightBoardCaches(isoDate);
  } catch {
    /* server revalidate optional from browser */
  }
}

/** Session-gated mutations in browser; service role on server. */
async function runBoardMutation<T>(
  action: string,
  payload: Record<string, unknown>,
  serverFallback: () => Promise<T>,
): Promise<T> {
  if (typeof window !== 'undefined') {
    const { postOpsMutation } = await import('./opsMutationClient');
    const result = await postOpsMutation<T>(action, payload);
    await bustNightBoardServerCache(payload.date as string | undefined);
    return result;
  }
  const result = await serverFallback();
  await bustNightBoardServerCache(payload.date as string | undefined);
  return result;
}

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
  /** Break group (1/2/3) assigned to this SLOT in zone_assignments. 0 = not on breaks. */
  breakGroup?: number | null;
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
 *      For a Friday May 29 grave sheet, this includes all TMs scheduled on the
 *      Friday swing shift (PM overlaps scheduled until 1:00am).
 *   2. night_tm_status rows for the NEXT calendar day, filtered to grave_pool='AM'
 *      TMs only. Reason: AM overlap TMs are scheduled in at 5:00am on day shift
 *      THE NEXT DAY. So for a Friday May 29 grave sheet, the AM overlaps are
 *      those scheduled on Saturday May 30 day shift at 5am. Their rows live
 *      under Saturday's night_id, not Friday's.
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
      .select('tm_id, status')
      .eq('night_id', nightId),
    nextDateStr
      ? supabase.from('nights').select('id').eq('night_date', nextDateStr).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  // Only count TMs as "on schedule" if they have a working status (respects manual LOA/PTO/etc edits)
  (tonightStatusRes.data || [])
    .filter((r: any) => !r.status || ["present", "scheduled"].includes(r.status))
    .forEach((r: any) => r.tm_id && tmIdSet.add(r.tm_id));

  // AM overlap TMs are imported as next-day schedule entries
  // (only those with working status on the next day's row)
  if (tomorrowNightRes.data?.id) {
    const tomorrowNightId = tomorrowNightRes.data.id;
    const { data: nextDayStatus } = await supabase
      .from('night_tm_status')
      .select('tm_id, status')
      .eq('night_id', tomorrowNightId);

    if (nextDayStatus?.length) {
      const nextWorkingTmIds = (nextDayStatus || [])
        .filter((r: any) => !r.status || ["present", "scheduled"].includes(r.status))
        .map((r: any) => r.tm_id)
        .filter(Boolean);

      if (nextWorkingTmIds.length > 0) {
        // Only include those who are AM overlap TMs (grave_pool = 'AM')
        const { data: amProfiles } = await supabase
          .from('tm_profiles')
          .select('tm_id')
          .in('tm_id', nextWorkingTmIds)
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
 * day_num / page_num (1=Fri … 7=Thu) for the shift week.
 * Uses local DOW to stay consistent with local week-start math and localDateIso
 * (avoids UTC drift for the operator's TZ).
 */
function shiftDayNumLocal(d: Date): number {
  const dow = d.getDay(); // local: 0=Sun … 5=Fri … 6=Sat
  return ((dow + 2) % 7) + 1;
}

/**
 * Find a night by its date. Returns null if no row exists. Use this to check
 * before reading assignments — if null, the night hasn't been touched yet.
 */
export async function getNightIdForDate(date: Date): Promise<string | null> {
  const iso = localDateIso(date);
  const cached = readNightIdCache(iso);
  if (cached !== undefined) return cached;

  const { data, error } = await supabase
    .from("nights")
    .select("id")
    .eq("night_date", iso)
    .maybeSingle();

  if (error) {
    console.warn("[shiftbuilder/data] getNightIdForDate error", error);
    return null;
  }
  const id = data?.id ?? null;
  writeNightIdCache(iso, id);
  return id;
}

/**
 * Find or create the night row for `date`. Lazily creates the parent `week`
 * row if needed. Use when the operator makes their first edit on a date that
 * doesn't yet have a night row — keeps the DB empty for un-edited nights.
 *
 * Returns the night id on success, throws if the inserts fail (which should
 * be rare — schema mismatches or RLS issues).
 *
 * NOTE: weeks table is keyed by `week_ending` (Thu), not week_start. This
 * matches live schema and all other call sites (sudoActions, listSchedules, etc).
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
      .eq("week_ending", weekEndingIso)
      .maybeSingle();
    weekId = data?.id ?? null;
  }

  if (!weekId) {
    const { data: newWeek, error: wErr } = await supabase
      .from("weeks")
      .insert({
        week_ending: weekEndingIso,
        // Leave other columns (label, status, schedule_path, etc.) to defaults or triggers.
        // The table 'weeks' is keyed by week_ending (per the rest of the app and schema).
      })
      .select("id")
      .single();

    if (wErr || !newWeek) {
      throw new Error(`Failed to create week for ${weekEndingIso}: ${wErr?.message ?? "unknown"}`);
    }
    weekId = newWeek.id;
  }

  // 3. Create the night under that week.
  // Supply all NOT NULL columns that have no defaults (per schema + sudoActions ensure path).
  // day_num/page_num are 1-based within the Fri-Thu week.
  const dayNum = shiftDayNumLocal(date);
  const { data: newNight, error: nErr } = await supabase
    .from("nights")
    .insert({
      week_id: weekId,
      night_date: localDateIso(date),
      day_name: dayName,
      day_num: dayNum,
      page_num: dayNum,
      status: "draft",
      is_locked: false,
    })
    .select("id")
    .single();

  if (nErr || !newNight) {
    throw new Error(`Failed to create night for ${localDateIso(date)}: ${nErr?.message ?? "unknown"}`);
  }

  const newNightId = newNight.id;
  writeNightIdCache(localDateIso(date), newNightId);

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
    .select('night_id, slot_key, slot_type, tm_id, rr_side, is_locked, is_filled, updated_at, sort_order, break_group')
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

  // Permanent mapping hygiene:
  // If we ever load legacy UI keys (Z9, ADM, etc.), rewrite them in the DB
  // to canonical normalized keys (zone_9, admin, ...) so deletes and future
  // queries always succeed. This runs on every night load.
  const legacyRows = rows.filter((r: any) =>
    !r.slot_key.startsWith('zone_') &&
    !r.slot_key.startsWith('rr_') &&
    !r.slot_key.startsWith('overlap_') &&
    !r.slot_key.startsWith('aux_') &&
    !r.slot_key.startsWith('support_') &&
    !r.slot_key.startsWith('trash_')
  );

  // Skip normalization attempts on keys that are already in a known usable DB form.
  // This reduces noise and 400 risk during the transition.
  const safeLegacyRows = legacyRows.filter((r: any) => {
    const sk = r.slot_key;
    return !(sk === 'admin' || sk === 'z9_sr' || sk.startsWith('z9_sr'));
  });

  // Legacy slot-key normalization is fire-and-forget — never blocks the read path.
  if (safeLegacyRows.length > 0) {
    void Promise.all(safeLegacyRows.map(async (r: any) => {
      try {
        let canonical: any;
        try {
          canonical = uiToDb(r.slot_key);
        } catch {
          const sk = String(r.slot_key || '');
          canonical = {
            slot_key: sk,
            slot_type: r.slot_type || (sk.includes('overlap') ? 'overlap' : 'aux'),
            rr_side: r.rr_side ?? null,
          };
        }
        await supabase
          .from('zone_assignments')
          .update({
            slot_key: canonical.slot_key,
            slot_type: canonical.slot_type,
            rr_side: canonical.rr_side,
          })
          .eq('id', r.id);
      } catch (e) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('[shiftbuilder] Failed to normalize legacy slot key', r.slot_key, e);
        }
      }
    }));
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
    breakGroup: row.break_group ?? null,
  }));
}

/**
 * Persist a break group directly onto the zone_assignments slot row.
 * zone_assignments.break_group is the canonical UI display source.
 * (break_assignments continues to serve the break-sheet / print path.)
 */
export async function updateSlotBreakGroup(
  nightId: string,
  slotKey: string,
  rrSide: string | null,
  breakGroup: number,
  tmId: string | null = null, // when provided by caller (from optimistic UI state), allows recovery if the zone row is not yet committed
): Promise<void> {
  if (!nightId || !slotKey) return;
  const client = getSupabaseClient();

  const slotType = slotKey.startsWith('zone_') ? 'zone'
    : slotKey.startsWith('rr_')  ? 'rr'
    : 'aux';

  // Update existing assignment row only — upsert without tm_id was creating orphan
  // rows or failing silently, so break pills never persisted.
  let q = client
    .from('zone_assignments')
    .update({
      break_group: breakGroup,
      updated_at: new Date().toISOString(),
    })
    .eq('night_id', nightId)
    .eq('slot_type', slotType)
    .eq('slot_key', slotKey);

  if (rrSide) {
    q = q.eq('rr_side', rrSide);
  } else {
    q = q.is('rr_side', null);
  }

  const { data, error } = await q.select('id');
  if (error) {
    logSupabaseError('updateSlotBreakGroup failed', error);
    throw new Error(`Failed to save slot break group: ${error.message}`);
  }

  if (!data?.length) {
    if (tmId) {
      // Recovery for race between optimistic assign (UI shows name + break pill)
      // and the async zone_assignments row creation (or legacy key still in DB).
      // Since the caller saw a tmId in the assignments state, we can safely
      // ensure the row exists and then set the desired break_group.
      try {
        await upsertZoneAssignment({
          nightId,
          slotKey, // already normalized DB form from caller (e.g. "zone_4")
          tmId,
          slotType: slotType as any,
          rrSide: rrSide as any,
        });

        // Retry the break update now that the row is guaranteed to exist
        let q2 = client
          .from('zone_assignments')
          .update({
            break_group: breakGroup,
            updated_at: new Date().toISOString(),
          })
          .eq('night_id', nightId)
          .eq('slot_type', slotType)
          .eq('slot_key', slotKey);

        if (rrSide) {
          q2 = q2.eq('rr_side', rrSide);
        } else {
          q2 = q2.is('rr_side', null);
        }

        const { data: data2 } = await q2.select('id');
        if (data2?.length) {
          await bustNightBoardServerCache();
          return;
        }
      } catch (recoverErr) {
        logSupabaseError('updateSlotBreakGroup recovery (with tmId) failed', recoverErr as any);
        // fall through to the user-facing error
      }

      throw new Error(
        `Could not save break group for ${slotKey}${rrSide ? ` (${rrSide})` : ''} (TM was assigned in UI but the slot row was not ready in DB yet).`,
      );
    }

    throw new Error(
      `No assignment row for ${slotKey}${rrSide ? ` (${rrSide})` : ''} — assign a TM before setting break group`,
    );
  }

  await bustNightBoardServerCache();
}

/**
 * Apply sudo card-default break group when a TM is placed (only if slot has no explicit break yet).
 */
export async function applySlotDefaultBreakForAssignment(params: {
  nightId: string;
  dbSlotKey: string;
  rrSide: string | null;
  tmId: string;
  uiSlotRef: string;
}): Promise<BreakGroupValue | null> {
  const { nightId, dbSlotKey, rrSide, tmId, uiSlotRef } = params;
  const { buildSlotDefaultBreakMap } = await import('./breakGroupResolve');
  const map = buildSlotDefaultBreakMap(await getSlotDefaults());
  const def = map.get(`${dbSlotKey}|${rrSide ?? ''}`);
  if (def === undefined || def === 0) return null;

  await updateSlotBreakGroup(nightId, dbSlotKey, rrSide, def, tmId);
  await upsertBreakAssignment({
    nightId,
    tmId,
    groupNum: def,
    slotRef: uiSlotRef,
  });
  return def;
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
  return runBoardMutation(
    'upsert_zone_assignment',
    params as unknown as Record<string, unknown>,
    async () => {
      const { upsertZoneAssignmentServer } = await import('./opsMutations.server');
      return upsertZoneAssignmentServer(params);
    },
  );
}

/**
 * Robust delete for a zone assignment.
 * 
 * Tries the canonical DB key first.
 * If that affects 0 rows, it also tries common legacy UI keys
 * (e.g. "Z9" instead of "zone_9") to clean up old data.
 * 
 * This provides a permanent safety net during the transition away from
 * legacy slot keys in the database.
 */
export async function deleteZoneAssignment(params: {
  nightId: string;
  uiKey: string;           // UI key like "Z9", "Z9SR", "MRR1", etc.
  slotType?: string;
  rrSide?: string | null;
}) {
  return runBoardMutation(
    'delete_zone_assignment',
    params as unknown as Record<string, unknown>,
    async () => {
      const { deleteZoneAssignmentServer } = await import('./opsMutations.server');
      return deleteZoneAssignmentServer(params);
    },
  );
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
  await runBoardMutation(
    'batch_apply_draft',
    { nightId, slots },
    async () => {
      const { batchApplyDraftAssignmentsServer } = await import('./opsMutations.server');
      await batchApplyDraftAssignmentsServer(nightId, slots);
      return { ok: true };
    },
  );
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
  return runBoardMutation(
    'toggle_assignment_lock',
    params as unknown as Record<string, unknown>,
    async () => {
      const { toggleAssignmentLockServer } = await import('./opsMutations.server');
      return toggleAssignmentLockServer(params);
    },
  );
}

/**
 * Lock or unlock an entire night (the day).
 * This sets nights.is_locked and can be used to prevent further edits to the day.
 */
export async function setNightLocked(nightId: string, locked: boolean): Promise<void> {
  if (!nightId) {
    throw new Error('setNightLocked requires a nightId');
  }

  await runBoardMutation(
    'set_night_locked',
    { nightId, locked },
    async () => {
      const { setNightLockedServer } = await import('./opsMutations.server');
      await setNightLockedServer(nightId, locked);
      return { ok: true };
    },
  );
}

/**
 * Publish or unpublish a single night by id (navbar day publish).
 * Only toggles publication status — does not lock/unlock the board.
 */
export async function setNightPublished(nightId: string, published: boolean): Promise<void> {
  if (!nightId) {
    throw new Error('setNightPublished requires a nightId');
  }

  await runBoardMutation(
    'set_night_published',
    { nightId, published },
    async () => {
      const { setNightPublishedServer } = await import('./opsMutations.server');
      await setNightPublishedServer(nightId, published);
      return { ok: true };
    },
  );
}

/**
 * Returns whether the given night is locked.
 */
export async function getNightLocked(nightId: string): Promise<boolean> {
  const meta = await getNightMeta(nightId);
  return meta.isLocked;
}

/** Lock + publish status for a night row (used by /today schedule browser). */
export async function getNightMeta(
  nightId: string,
): Promise<{ isLocked: boolean; status: string | null }> {
  if (!nightId) return { isLocked: false, status: null };

  const client = getSupabaseClient();
  const { data, error } = await client
    .from('nights')
    .select('is_locked, status')
    .eq('id', nightId)
    .single();

  if (error || !data) {
    logSupabaseError('getNightMeta failed', error);
    return { isLocked: false, status: null };
  }

  return {
    isLocked: !!data.is_locked,
    status: (data as { status?: string | null }).status ?? null,
  };
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

  await bustNightBoardServerCache();
}

export async function getNightAuxLayout(nightId: string): Promise<unknown | null> {
  const { data, error } = await supabase
    .from("nights")
    .select("aux_layout")
    .eq("id", nightId)
    .maybeSingle();
  if (error) {
    console.warn("[shiftbuilder/data] getNightAuxLayout failed", error.message);
    return null;
  }
  return data?.aux_layout ?? null;
}

export async function saveNightAuxLayout(
  nightId: string,
  auxDefs: import("./placement").AuxDef[],
  isoDate?: string,
): Promise<void> {
  const res = await fetch("/api/shiftbuilder/aux-layout", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nightId, auxDefs, date: isoDate }),
  });

  if (!res.ok) {
    let message = `Failed to save aux layout (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(message);
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
  markerType?: 'highlight' | 'underline' | 'circle' | 'none' | null; // text marker style for the task label
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

  // Use * to be robust against column drift / partial migrations (e.g. marker_type).
  // Server bundle also uses * for the same reason.
  const { data, error } = await supabase
    .from('night_slot_tasks')
    .select('*')
    .eq('night_id', nightId)
    .order('sort_order', { ascending: true })
    .order('task_label', { ascending: true });

  if (error) {
    logSupabaseError('getNightSlotTasks failed', error);
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
    markerType: (r.marker_type ?? r.markerType ?? null) as any,
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

  await runBoardMutation(
    'add_night_slot_task',
    params as unknown as Record<string, unknown>,
    async () => {
      const { addNightSlotTaskServer } = await import('./opsMutations.server');
      await addNightSlotTaskServer(params);
      return { ok: true };
    },
  );
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

  await runBoardMutation(
    'remove_night_slot_task',
    params as unknown as Record<string, unknown>,
    async () => {
      const { removeNightSlotTaskServer } = await import('./opsMutations.server');
      await removeNightSlotTaskServer(params);
      return { ok: true };
    },
  );
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
  rrSide: 'mens' | 'womens' | null = null,
  markerType?: 'highlight' | 'underline' | 'circle' | 'none' | null
): Promise<void> {
  if (!nightId || !slotKey || !taskLabel) {
    throw new Error('setNightSlotTaskColor requires nightId, slotKey, taskLabel');
  }

  const payload = { nightId, slotKey, taskLabel, color, rrSide, markerType };
  await runBoardMutation(
    'update_night_slot_task_color',
    payload,
    async () => {
      const { updateNightSlotTaskColorServer } = await import('./opsMutations.server');
      await updateNightSlotTaskColorServer(
        nightId,
        slotKey,
        taskLabel,
        color,
        rrSide,
        markerType,
      );
      return { ok: true };
    },
  );
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

  const payload = { nightId, slotKey, oldLabel, newLabel: trimmed, rrSide };
  await runBoardMutation(
    'update_night_slot_task_label',
    payload,
    async () => {
      const { updateNightSlotTaskLabelServer } = await import('./opsMutations.server');
      await updateNightSlotTaskLabelServer(nightId, slotKey, oldLabel, trimmed, rrSide);
      return { ok: true };
    },
  );
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

  await bustNightBoardServerCache();
}

/**
 * Reorder tasks within a slot by updating their sort_order.
 * Used for intra-slot drag-to-sort in the builder view.
 * Assumes the provided orderedTaskLabels are the full current list for the slot (in new desired order).
 */
export async function reorderNightSlotTasks(
  nightId: string,
  slotKey: string,
  slotType: 'zone' | 'rr' | 'aux' | 'overlap',
  rrSide: 'mens' | 'womens' | null,
  orderedTaskLabels: string[]
): Promise<void> {
  if (!nightId || !slotKey || !orderedTaskLabels.length) return;

  for (let i = 0; i < orderedTaskLabels.length; i++) {
    const taskLabel = orderedTaskLabels[i];
    let q = supabase
      .from('night_slot_tasks')
      .update({ sort_order: i })
      .match({
        night_id: nightId,
        slot_key: slotKey,
        slot_type: slotType,
        task_label: taskLabel,
      });

    if (rrSide) {
      q = q.eq('rr_side', rrSide);
    } else {
      q = q.is('rr_side', null);
    }

    const { error } = await q;
    if (error) {
      logSupabaseError('reorderNightSlotTasks', error);
      throw new Error(`Failed to reorder task at position ${i}: ${error.message || 'unknown'}`);
    }
  }

  await bustNightBoardServerCache();
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

  await runBoardMutation(
    'set_night_card_border',
    { nightId, slotKey, color },
    async () => {
      const { setNightCardBorderServer } = await import('./opsMutations.server');
      await setNightCardBorderServer(nightId, slotKey, color);
      return { ok: true };
    },
  );
}

export async function removeNightCardBorder(nightId: string, slotKey: string): Promise<void> {
  if (!nightId || !slotKey) return;

  await runBoardMutation(
    'remove_night_card_border',
    { nightId, slotKey },
    async () => {
      const { removeNightCardBorderServer } = await import('./opsMutations.server');
      await removeNightCardBorderServer(nightId, slotKey);
      return { ok: true };
    },
  );
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
  groupNum: BreakGroupValue;
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
  groupNum: BreakGroupValue;
  slotRef?: string | null;
  breakWave?: number;
}

export async function upsertBreakAssignment(params: UpsertBreakParams): Promise<void> {
  const { nightId, tmId, groupNum, slotRef = null, breakWave = 1 } = params;
  if (!nightId || !tmId) throw new Error('upsertBreakAssignment requires nightId + tmId');

  await runBoardMutation(
    'upsert_break_assignment',
    params as unknown as Record<string, unknown>,
    async () => {
      const { upsertBreakAssignmentServer } = await import('./opsMutations.server');
      await upsertBreakAssignmentServer(params);
      return { ok: true };
    },
  );
}

export async function deleteBreakAssignment(nightId: string, tmId: string): Promise<void> {
  if (!nightId || !tmId) return;

  await runBoardMutation(
    'delete_break_assignment',
    { nightId, tmId },
    async () => {
      const { deleteBreakAssignmentServer } = await import('./opsMutations.server');
      await deleteBreakAssignmentServer(nightId, tmId);
      return { ok: true };
    },
  );
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

  // Always-fresh channel (unique topic) — prevents "callbacks after subscribe" on reuse.
  const channel = freshChannel(`shiftbuilder-zone-assignments-${nightId}`);

  return channel
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

/**
 * Always returns a brand-new, never-before-subscribed Supabase Realtime channel.
 * 
 * Using a unique topic suffix on every call completely eliminates the
 * "cannot add `postgres_changes` callbacks ... after `subscribe()`" error
 * that occurs when React effects, HMR, StrictMode, or rapid date changes
 * cause overlapping channel creation for the same logical topic.
 * 
 * Callers are responsible for calling removeChannel on the exact instance returned.
 * We never reuse a channel instance or rely on topic-name deduping.
 */
function freshChannel(prefix: string) {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return supabase.channel(`${prefix}-${nonce}`);
}

/**
 * Create a Supabase Realtime channel for live updates on night_tm_status for a specific night.
 * This lets schedule changes (ADP re-imports, manual status edits, LOA/PTO marks) flow live into the planner.
 */
export function createNightScheduleStatusChannel(
  nightId: string,
  onChange: (payload: any) => void
) {
  const client = getSupabaseClient();

  return client
    .channel(`shiftbuilder-night-tm-status-${nightId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'night_tm_status',
        filter: `night_id=eq.${nightId}`,
      },
      (payload) => {
        console.log('[shiftbuilder] night_tm_status realtime change', payload.eventType, payload.new);
        onChange(payload);
      }
    )
    .subscribe((status) => {
      console.log('[shiftbuilder] night_tm_status subscription status:', status);
      // Expose to OpsStatusBar (permanent prod telemetry)
      (window as any).__realtimeState =
        status === 'SUBSCRIBED' ? 'LIVE' :
        status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' ? 'OFFLINE' : 'SYNCING';
    });
}

/**
 * Create a Supabase Realtime channel for live updates on call_offs for a specific date.
 */
export function createCallOffsChannel(
  nightDateIso: string, // yyyy-mm-dd
  onChange: (payload: any) => void
) {
  const client = getSupabaseClient();

  // Always-fresh channel (unique topic) — the direct fix for the runtime error:
  // "cannot add `postgres_changes` callbacks for realtime:shiftbuilder-call-offs-... after `subscribe()`"
  const channel = freshChannel(`shiftbuilder-call-offs-${nightDateIso}`);

  return channel
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'call_offs',
        filter: `night_date=eq.${nightDateIso}`,
      },
      (payload) => {
        console.log('[shiftbuilder] call_offs realtime change', payload.eventType);
        onChange(payload);
      }
    )
    .subscribe((status) => {
      console.log('[shiftbuilder] call_offs subscription status:', status);
    });
}

/**
 * Realtime channel for changes to tm_default_schedules.
 * Any change to a TM's default can affect who is considered "scheduled" on future days.
 * When this fires, the caller should re-fetch getScheduledTmIdsForNightFromNewRoster.
 */
export function createTMDefaultSchedulesChannel(
  onChange: (payload: any) => void
) {
  const client = getSupabaseClient();

  // Unique topic per creation so rapid effect re-runs / HMR never collide.
  return freshChannel('shiftbuilder-tm-default-schedules')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tm_default_schedules',
      },
      (payload) => {
        console.log('[shiftbuilder] tm_default_schedules realtime change', payload.eventType);
        onChange(payload);
      }
    )
    .subscribe((status) => {
      console.log('[shiftbuilder] tm_default_schedules subscription status:', status);
    });
}

/**
 * Realtime channel for changes to tm_on_call_schedules (the weekly specials / overrides).
 * Critical for live reflection when user marks someone OFF or adds a special in Sudo Weekly Roster.
 */
export function createTMOnCallSchedulesChannel(
  onChange: (payload: any) => void
) {
  const client = getSupabaseClient();

  // Unique topic per creation so rapid effect re-runs / HMR never collide.
  return freshChannel('shiftbuilder-tm-on-call-schedules')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tm_on_call_schedules',
      },
      (payload) => {
        console.log('[shiftbuilder] tm_on_call_schedules realtime change', payload.eventType);
        onChange(payload);
      }
    )
    .subscribe((status) => {
      console.log('[shiftbuilder] tm_on_call_schedules subscription status:', status);
    });
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
  nightId: string,
  shiftDate?: string
): Promise<Set<string>> {
  if (!nightId) return new Set();

  const tmIdSet = new Set<string>();

  // Current night: only TMs with working status
  const { data: tonightData, error: tonightErr } = await supabase
    .from("night_tm_status")
    .select("tm_id, status")
    .eq("night_id", nightId)
    .in("status", ["present", "scheduled"]);

  if (tonightErr) {
    console.warn("[data] getScheduledTmIdsForNight (tonight) failed:", tonightErr.message);
  } else {
    (tonightData ?? []).forEach((r: any) => r.tm_id && tmIdSet.add(r.tm_id));
  }

  // AM overlaps from next calendar day (if shiftDate provided)
  if (shiftDate) {
    const shiftDateObj = new Date(`${shiftDate}T12:00:00Z`);
    if (!isNaN(shiftDateObj.getTime())) {
      const nextDateStr = new Date(shiftDateObj);
      nextDateStr.setUTCDate(nextDateStr.getUTCDate() + 1);
      const nextIso = nextDateStr.toISOString().slice(0, 10);

      const { data: nextNight } = await supabase
        .from('nights')
        .select('id')
        .eq('night_date', nextIso)
        .maybeSingle();

      if (nextNight?.id) {
        const { data: nextDayRows } = await supabase
          .from("night_tm_status")
          .select("tm_id, status")
          .eq("night_id", nextNight.id)
          .in("status", ["present", "scheduled"]);

        const nextTmIds = (nextDayRows ?? []).map((r: any) => r.tm_id).filter(Boolean);

        if (nextTmIds.length > 0) {
          const { data: amProfiles } = await supabase
            .from('tm_profiles')
            .select('tm_id')
            .in('tm_id', nextTmIds)
            .eq('grave_pool', 'AM')
            .eq('active', true);

          (amProfiles ?? []).forEach((r: any) => r.tm_id && tmIdSet.add(r.tm_id));
        }
      }
    }
  }

  return tmIdSet;
}

/**
 * NEW SYSTEM (2026-06): Compute scheduled TMs for a night strictly from the
 * static group-based roster (tm_groups + tm_default_schedules + weekly specials).
 *
 * This is the path to fully removing the old ADP / night_tm_status baseline.
 *
 * Day-specific filtering via weekly_pattern[dayIndex] + isWorkingShift is active.
 * The result Set is the source of truth for MarkerPad TM picker "Scheduled" lists
 * and roster filtering on the board.
 */
export interface ScheduledTmNightInfo {
  legacyId: string;
  effectiveDayEntry: WeeklyShift | undefined;
  isFullGraveTonight: boolean;
  isPMOverlapTonight: boolean;
  isAMOverlapTonight: boolean;
  groupName?: string;
}

/**
 * @deprecated
 * Use the canonical `getScheduledTmsForNight` / `getTmShiftForNight` from `./schedules.ts` instead.
 * This function (and getNightRosterClassification) has had repeated subtle divergences
 * from the Sudo Weekly Roster tab's resolver. It is no longer used by the picker or main board.
 */
export async function getScheduledTmIdsForNightFromNewRoster(
  nightDate: string
): Promise<Set<string>> {
  const result = new Set<string>();

  try {
    // 1. Parse the night and compute the *roster* week (Thu-anchored Thu→Wed)
    //    so dayIndex aligns with weekly_pattern[0]=Thu ... [6]=Wed stored in the DB.
    const night = new Date(nightDate + 'T12:00:00'); // local noon avoids TZ day shifts
    if (isNaN(night.getTime())) return result;

    const rosterWeekStart = startOfRosterWeek(night);
    const rosterWeekStartIso = localDateIso(rosterWeekStart);

    // Day index into the roster pattern array (0=Thu, 1=Fri, ..., 6=Wed)
    const dayIndex = Math.max(0, Math.min(6, daysBetween(rosterWeekStart, night)));

    // 2. Load the 4 core groups
    const { data: groups } = await supabase
      .from('tm_groups')
      .select('id, name')
      .in('name', ['Grave', 'On Call', 'AM Overlaps', 'PM Overlaps']);

    if (!groups || groups.length === 0) return result;

    const groupIds = groups.map((g: any) => g.id);

    // 3. Load active members of those groups (uuids)
    const { data: members } = await supabase
      .from('tm_group_members')
      .select('tm_id')
      .in('group_id', groupIds);

    const groupMemberUuids = new Set<string>(
      (members ?? []).map((m: any) => m.tm_id).filter(Boolean)
    );

    // 4. Also discover any TMs that have an explicit weekly special/override for this week
    //    (this supports the "Add or edit for any active TM" flow in Weekly Roster,
    //     and makes markings done there actually affect the board picker).
    const { data: weekSpecialsForDiscovery } = await supabase
      .from('tm_on_call_schedules')
      .select('tm_id')
      .eq('week_start', rosterWeekStartIso);

    const specialTmUuids = new Set<string>(
      (weekSpecialsForDiscovery ?? []).map((s: any) => s.tm_id).filter(Boolean)
    );

    // Combined set: anyone in the 4 groups OR anyone who has a special this week
    const relevantUuids = new Set<string>([...groupMemberUuids, ...specialTmUuids]);

    if (relevantUuids.size === 0) return result;

    const relevantUuidArray = Array.from(relevantUuids);

    // Opt-in diagnostic flag (hoisted so the per-TM watched logging below can use it)
    const __DEBUG_MARKER_PICKER__ =
      (typeof window !== 'undefined' &&
        (window.localStorage?.getItem('__DEBUG_MARKER_PICKER__') === '1' ||
          window.location?.search?.includes('debug=picker')));

    // 5. Load most recent default for the relevant TMs
    const { data: defaults } = await supabase
      .from('tm_default_schedules')
      .select('tm_id, effective_from, weekly_pattern')
      .in('tm_id', relevantUuidArray)
      .lte('effective_from', rosterWeekStartIso)
      .order('effective_from', { ascending: false });

    const defaultPatternByUuid = new Map<string, any[]>();
    (defaults ?? []).forEach((row: any) => {
      if (!defaultPatternByUuid.has(row.tm_id)) {
        const normalized = (row.weekly_pattern || []).map((d: any) => {
          if (!d.startTime) {
            return { ...d, startTime: null, endTime: null, label: "OFF" };
          }
          return d;
        });
        defaultPatternByUuid.set(row.tm_id, normalized);
      }
    });

    // 6. Load the actual specials for this week (now for the broader set)
    const { data: weeklySpecials } = await supabase
      .from('tm_on_call_schedules')
      .select('tm_id, week_start, weekly_pattern')
      .eq('week_start', rosterWeekStartIso)
      .in('tm_id', relevantUuidArray);

    const weeklyPatternByUuid = new Map<string, any[]>();
    (weeklySpecials ?? []).forEach((row: any) => {
      const normalized = (row.weekly_pattern || []).map((d: any) => {
        if (!d.startTime) {
          return { ...d, startTime: null, endTime: null, label: "OFF" };
        }
        return d;
      });
      weeklyPatternByUuid.set(row.tm_id, normalized);
    });

    // 7. Map uuid → legacy tm_id for the relevant TMs and test the day
    const { data: profiles } = await supabase
      .from('tm_profiles')
      .select('id, tm_id, display_name')
      .in('id', relevantUuidArray)
      .eq('active', true);

    const uuidToLegacyId = new Map<string, string>();
    (profiles ?? []).forEach((p: any) => {
      if (p.tm_id) uuidToLegacyId.set(p.id, p.tm_id);
    });

    for (const uuid of relevantUuidArray) {
      const legacyId = uuidToLegacyId.get(uuid);
      if (!legacyId) continue;

      // Weekly special (this week) wins over the rolling default
      const pattern = weeklyPatternByUuid.get(uuid) || defaultPatternByUuid.get(uuid) || [];
      const dayEntry = pattern[dayIndex] as WeeklyShift | undefined;

      // Strict check: must have real startTime AND not be explicitly marked OFF.
      // This prevents TMs who were explicitly set to OFF in Weekly Defaults
      // (or current week specials) from appearing in the board picker.
      const willInclude = isWorkingShift(dayEntry);
      if (willInclude) {
        // Real scheduled working shift that day per the static roster
        result.add(legacyId);
      }

      // Targeted opt-in diagnostic for the specific names still appearing in pickers
      // (set localStorage __DEBUG_MARKER_PICKER__ = '1' or add ?debug=picker).
      // This shows exactly why a watched TM was included (or not) on a given night.
      if (__DEBUG_MARKER_PICKER__ && typeof console !== 'undefined') {
        const __WATCHED__ = ['alec', 'daryl', 'jason', 'nikki', 'sam'];
        const disp = (profiles ?? []).find((p: any) => p.id === uuid)?.display_name?.toLowerCase() || '';
        const legLower = legacyId.toLowerCase();
        if (__WATCHED__.some(w => disp.includes(w) || legLower.includes(w))) {
          console.log(`[MARKER-PICKER-DEBUG] WATCHED ${profiles?.find((p: any) => p.id === uuid)?.display_name || legacyId} day ${nightDate} (dayIndex ${dayIndex}):`, {
            source: weeklyPatternByUuid.has(uuid) ? 'weeklySpecial' : (defaultPatternByUuid.has(uuid) ? 'default' : 'none'),
            dayEntry,
            isWorkingShift: willInclude,
            label: dayEntry?.label,
            startTime: dayEntry?.startTime,
          });
        }
      }
    }

    // Minimal opt-in size log
    // Legacy debug removed — canonical schedules.ts is now the only source for picker lists.
  } catch (e) {
    console.warn('[data] getScheduledTmIdsForNightFromNewRoster failed:', e);
  }

  return result;
}

/**
 * Returns the effective WeeklyShift for a specific TM on a specific night,
 * using the exact same logic as getScheduledTmIdsForNightFromNewRoster
 * (weekly special wins over default).
 *
 * This is the "different way" to get reliable role information for the picker
 * without relying on pre-enriched roster rows.
 */
export async function getTmEffectivePatternForNight(
  legacyTmId: string,
  nightDate: string
): Promise<WeeklyShift | undefined> {
  try {
    const night = new Date(nightDate + 'T12:00:00');
    if (isNaN(night.getTime())) return undefined;

    const rosterWeekStart = startOfRosterWeek(night);
    const rosterWeekStartIso = localDateIso(rosterWeekStart);
    const dayIndex = Math.max(0, Math.min(6, daysBetween(rosterWeekStart, night)));

    // Find the uuid for this legacy id
    const { data: prof } = await supabase
      .from('tm_profiles')
      .select('id')
      .eq('tm_id', legacyTmId)
      .eq('active', true)
      .single();

    if (!prof) return undefined;
    const uuid = prof.id;

    // Check for weekly special this week
    const { data: special } = await supabase
      .from('tm_on_call_schedules')
      .select('weekly_pattern')
      .eq('tm_id', uuid)
      .eq('week_start', rosterWeekStartIso)
      .maybeSingle();

    let pattern: any[] | undefined;
    if (special?.weekly_pattern) {
      pattern = special.weekly_pattern;
    } else {
      // Fall back to most recent default
      const { data: def } = await supabase
        .from('tm_default_schedules')
        .select('weekly_pattern')
        .eq('tm_id', uuid)
        .lte('effective_from', rosterWeekStartIso)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();
      pattern = def?.weekly_pattern;
    }

    if (!pattern || !Array.isArray(pattern)) return undefined;

    return pattern[dayIndex] as WeeklyShift | undefined;
  } catch (e) {
    console.warn('[data] getTmEffectivePatternForNight failed for', legacyTmId, nightDate, e);
    return undefined;
  }
}

/**
 * Night-specific overlap classification derived from the exact same
 * Weekly Roster source of truth (tm_groups + tm_group_members + the
 * scheduled computation for the night).
 *
 * Returns sets in the **legacy tm_id space** (the same values that end up
 * in the `id` field of roster rows and in the scheduled set).
 *
 * This fixes the previous enrichment that was comparing UUIDs from
 * tm_group_members against legacy ids from the scheduled set.
 */
/**
 * @deprecated
 * Use `getScheduledTmsForNight` from `./schedules.ts` instead. This classification logic
 * was a workaround on top of the old batch scheduled set and is no longer the source of truth.
 */
export async function getNightRosterClassification(nightDate: string): Promise<{
  pmOverlapScheduled: Set<string>;
  amOverlapScheduled: Set<string>;
  fullGraveScheduled: Set<string>;   // NEW: Grave group members with effective Full Grave pattern for the night
}> {
  const pm = new Set<string>();
  const am = new Set<string>();
  const fullGrave = new Set<string>();

  try {
    const scheduled = await getScheduledTmIdsForNightFromNewRoster(nightDate);
    if (scheduled.size === 0) {
      return { pmOverlapScheduled: pm, amOverlapScheduled: am, fullGraveScheduled: fullGrave };
    }

    const night = new Date(nightDate + 'T12:00:00');
    if (isNaN(night.getTime())) return { pmOverlapScheduled: pm, amOverlapScheduled: am, fullGraveScheduled: fullGrave };

    const rosterWeekStart = startOfRosterWeek(night);
    const rosterWeekStartIso = localDateIso(rosterWeekStart);
    const dayIndex = Math.max(0, Math.min(6, daysBetween(rosterWeekStart, night)));

    // Load the dynamic groups we care about for nightly role classification (Grave + the two overlap groups)
    const { data: relevantGroups } = await supabase
      .from('tm_groups')
      .select('id, name')
      .in('name', ['Grave', 'PM Overlaps', 'AM Overlaps']);

    const groupMap = new Map<string, string>();
    (relevantGroups || []).forEach((g: any) => groupMap.set(g.name, g.id));

    const graveGroupId = groupMap.get('Grave');
    const pmGroupId = groupMap.get('PM Overlaps');
    const amGroupId = groupMap.get('AM Overlaps');

    const allRelevantUuids = new Set<string>();

    if (graveGroupId) {
      const { data: graveMembers } = await supabase
        .from('tm_group_members')
        .select('tm_id')
        .eq('group_id', graveGroupId);
      (graveMembers || []).forEach((m: any) => m.tm_id && allRelevantUuids.add(m.tm_id));
    }
    if (pmGroupId) {
      const { data: pmMembers } = await supabase
        .from('tm_group_members')
        .select('tm_id')
        .eq('group_id', pmGroupId);
      (pmMembers || []).forEach((m: any) => m.tm_id && allRelevantUuids.add(m.tm_id));
    }
    if (amGroupId) {
      const { data: amMembers } = await supabase
        .from('tm_group_members')
        .select('tm_id')
        .eq('group_id', amGroupId);
      (amMembers || []).forEach((m: any) => m.tm_id && allRelevantUuids.add(m.tm_id));
    }

    if (allRelevantUuids.size === 0) {
      return { pmOverlapScheduled: pm, amOverlapScheduled: am, fullGraveScheduled: fullGrave };
    }

    // Translate relevant member UUIDs → legacy tm_ids (same translation the main roster function uses)
    const { data: profiles } = await supabase
      .from('tm_profiles')
      .select('id, tm_id')
      .in('id', Array.from(allRelevantUuids))
      .eq('active', true);

    const uuidToLegacy = new Map<string, string>();
    (profiles || []).forEach((p: any) => {
      if (p.tm_id) uuidToLegacy.set(p.id, p.tm_id);
    });

    // Now classify in the legacy space that the scheduled set and roster rows use
    if (graveGroupId) {
      const { data: graveMembers } = await supabase
        .from('tm_group_members')
        .select('tm_id')
        .eq('group_id', graveGroupId);
      (graveMembers || []).forEach((m: any) => {
        const uuid = m.tm_id;
        const legacy = uuidToLegacy.get(uuid);
        if (legacy && scheduled.has(legacy)) {
          // Grave group + scheduled is a strong signal; the pattern-based logic below will refine "Full Grave" vs overlap.
          // For now we include them as candidates; the effective pattern label decides the final flag.
          fullGrave.add(legacy); // provisional — pattern logic below will filter
        }
      });
    }

    if (pmGroupId) {
      const { data: pmMembers } = await supabase
        .from('tm_group_members')
        .select('tm_id')
        .eq('group_id', pmGroupId);
      (pmMembers || []).forEach((m: any) => {
        const uuid = m.tm_id;
        const legacy = uuidToLegacy.get(uuid);
        if (legacy && scheduled.has(legacy)) pm.add(legacy);
      });
    }

    if (amGroupId) {
      const { data: amMembers } = await supabase
        .from('tm_group_members')
        .select('tm_id')
        .eq('group_id', amGroupId);
      (amMembers || []).forEach((m: any) => {
        const uuid = m.tm_id;
        const legacy = uuidToLegacy.get(uuid);
        if (legacy && scheduled.has(legacy)) am.add(legacy);
      });
    }

    // Fallback / complementary classification from effective patterns for the night.
    // This ensures TMs scheduled as overlap via weekly specials (even if not in the static overlap groups)
    // are correctly marked for OL slots and excluded from Z* full-night slots.
    // We re-use the same "effective pattern for the day" logic as the main scheduled function.
    try {
      // Load weekly specials and defaults for the week (same as the scheduled function does internally)
      const { data: weekSpecials } = await supabase
        .from('tm_on_call_schedules')
        .select('tm_id, weekly_pattern')
        .eq('week_start', rosterWeekStartIso);

      const weeklyPatternByUuid = new Map<string, any[]>();
      (weekSpecials || []).forEach((row: any) => {
        weeklyPatternByUuid.set(row.tm_id, row.weekly_pattern || []);
      });

      const { data: defaults } = await supabase
        .from('tm_default_schedules')
        .select('tm_id, effective_from, weekly_pattern')
        .lte('effective_from', rosterWeekStartIso)
        .order('effective_from', { ascending: false });

      const defaultPatternByUuid = new Map<string, any[]>();
      (defaults || []).forEach((row: any) => {
        if (!defaultPatternByUuid.has(row.tm_id)) {
          defaultPatternByUuid.set(row.tm_id, row.weekly_pattern || []);
        }
      });

      // For every TM already in the scheduled set, determine their effective pattern and label for the day
      for (const legacyId of scheduled) {
        // We need the uuid for the TM to look up patterns. We don't have it here easily.
        // Instead, we look at all TMs that have patterns this week and see if their effective label for the day is overlap.
        // Simpler approach for this diagnostic/fix pass: check the patterns we already loaded.
      }

      // More direct: iterate the patterns we loaded and see who has overlap on this dayIndex
      const allPatternTms = new Set([...weeklyPatternByUuid.keys(), ...defaultPatternByUuid.keys()]);

      for (const uuid of allPatternTms) {
        const pattern = weeklyPatternByUuid.get(uuid) || defaultPatternByUuid.get(uuid) || [];
        const dayEntry = pattern[dayIndex];  // dayIndex computed above
        if (isWorkingShift(dayEntry)) {
          const label = (dayEntry?.label || '').toLowerCase();
          if (label.includes('pm overlap') || label.includes('am overlap')) {
            // We need the legacy id for this uuid
            // Load it on demand for the ones that matter (small set)
            const { data: prof } = await supabase
              .from('tm_profiles')
              .select('tm_id')
              .eq('id', uuid)
              .single();
            const leg = prof?.tm_id;
            if (leg && scheduled.has(leg)) {
              if (label.includes('pm overlap')) pm.add(leg);
              if (label.includes('am overlap')) am.add(leg);
            }
          }
        }
      }
    } catch (e) {
      console.warn('[data] pattern-based overlap classification in getNightRosterClassification failed (non-fatal):', e);
    }
  } catch (e) {
    console.warn('[data] getNightRosterClassification failed:', e);
  }

  // === TEMP DIAGNOSTIC for the watched names the operator is debugging ===
  const __WATCHED_NAMES__ = ['alec', 'daryl', 'jason', 'nikki', 'sam'];
  if (typeof console !== 'undefined') {
    const watchedInPM = Array.from(pm).filter(id => __WATCHED_NAMES__.some(w => id.toLowerCase().includes(w)));
    const watchedInAM = Array.from(am).filter(id => __WATCHED_NAMES__.some(w => id.toLowerCase().includes(w)));
    const watchedInFullGrave = Array.from(fullGrave).filter(id => __WATCHED_NAMES__.some(w => id.toLowerCase().includes(w)));
    // Legacy watched-name debug removed. The canonical getScheduledTmsForNight in schedules.ts is the only authority.
  }

  return { pmOverlapScheduled: pm, amOverlapScheduled: am, fullGraveScheduled: fullGrave };
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
  const { formatLocalDateISO } = await import('./dateUtils');
  const cutoff = new Date(beforeDate);
  cutoff.setDate(cutoff.getDate() - nights);
  const cutoffIso = formatLocalDateISO(cutoff);
  const beforeIso = formatLocalDateISO(beforeDate);

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
// slot_defaults   : one row per (slot_key, rr_side) → default_break_group (0–4)
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
  defaultBreakGroup: BreakGroupValue;
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
  const cached = readSlotDefaultsCache<SlotDefault>();
  if (cached) return cached;

  const { data, error } = await supabase
    .from('slot_defaults')
    .select('slot_key, slot_type, rr_side, default_break_group')
    .order('slot_key', { ascending: true });

  if (error) {
    console.error('[shiftbuilder/data] getSlotDefaults error:', error);
    return [];
  }

  const rows = (data || []).map((r: any) => ({
    slotKey: r.slot_key,
    slotType: r.slot_type,
    rrSide: r.rr_side ?? '',
    defaultBreakGroup: r.default_break_group ?? 0,
  }));
  writeSlotDefaultsCache(rows);
  return rows;
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

/** Upsert many slot default rows (e.g. GRAVE break group map). */
export async function bulkUpsertSlotDefaults(rows: SlotDefault[]): Promise<void> {
  if (!rows.length) return;

  const payload = rows.map((r) => ({
    slot_key: r.slotKey,
    slot_type: r.slotType,
    rr_side: r.rrSide ?? "",
    default_break_group: r.defaultBreakGroup,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("slot_defaults")
    .upsert(payload, { onConflict: "slot_key,rr_side" });

  if (error) {
    console.error("[shiftbuilder/data] bulkUpsertSlotDefaults error:", error);
    throw new Error(`Failed to save slot defaults: ${(error as any).message ?? "unknown"}`);
  }

  writeSlotDefaultsCache(rows);
}

/** Seed the canonical GRAVE break-group map into slot_defaults. */
export async function seedGraveBreakGroupDefaults(): Promise<{ count: number }> {
  const { graveBreakGroupSlotDefaults } = await import("./graveBreakGroupDefaults");
  const rows = graveBreakGroupSlotDefaults();
  await bulkUpsertSlotDefaults(rows);
  try {
    const { revalidateSlotDefaultsCache } = await import("./revalidateOpsCache");
    await revalidateSlotDefaultsCache();
  } catch {
    /* server revalidate optional from browser */
  }
  await bustNightBoardServerCache();
  return { count: rows.length };
}

/** Upsert the break group default for a single slot. */
export async function upsertSlotDefault(params: {
  slotKey: string;
  slotType: 'zone' | 'rr' | 'aux';
  rrSide?: string;
  defaultBreakGroup: BreakGroupValue;
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

  const { buildSlotDefaultBreakMap } = await import('./breakGroupResolve');

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

  const breakMap = buildSlotDefaultBreakMap(defaults);

  let applied = 0;
  const upsertJobs: Array<() => Promise<void>> = [];

  for (const [mapKey, groupNum] of breakMap) {
    if (!groupNum) continue; // 0 = unset, skip

    const tmId = assignMap.get(mapKey);
    if (!tmId) continue; // nobody assigned here tonight

    const sep = mapKey.lastIndexOf('|');
    const slotKey = mapKey.slice(0, sep);
    const rrSide = mapKey.slice(sep + 1);

    upsertJobs.push(() =>
      upsertBreakAssignment({
        nightId,
        tmId,
        groupNum,
        slotRef: slotKey,
      }),
    );
    upsertJobs.push(() =>
      updateSlotBreakGroup(nightId, slotKey, rrSide || null, groupNum, tmId),
    );
    applied++;
  }

  const { yieldToMain } = await import('./yieldToMain');
  const CHUNK = 8;
  for (let i = 0; i < upsertJobs.length; i += CHUNK) {
    const slice = upsertJobs.slice(i, i + CHUNK);
    await Promise.all(slice.map((job) => job()));
    if (i + CHUNK < upsertJobs.length) await yieldToMain();
  }

  await bustNightBoardServerCache();
  return { applied };
}

/** Push break defaults to all existing nights in the GRAVE week. */
export async function pushBreakDefaultsToWeek(
  weekStart: Date
): Promise<{ nights: number; applied: number }> {
  const nightIds = await resolveWeekNightIds(weekStart);
  let totalApplied = 0;
  const { yieldToMain } = await import('./yieldToMain');

  for (let i = 0; i < nightIds.length; i++) {
    const { applied } = await pushBreakDefaultsToNight(nightIds[i]);
    totalApplied += applied;
    if (i + 1 < nightIds.length) await yieldToMain();
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
  const slotEntries = [...bySlot.entries()];
  const { yieldToMain } = await import('./yieldToMain');
  const CHUNK = 5;

  const replaceSlotTasks = async (compositeKey: string, tasks: SlotDefaultTask[]) => {
    const [slotKey, rrSide] = compositeKey.split('|');
    const slotType = tasks[0].slotType;
    const mappedTasks = tasks.map((t, idx) => ({
      taskLabel: t.taskLabel,
      sortOrder: t.sortOrder ?? idx,
      taskColor: t.taskColor ?? null,
      isCoverage: t.isCoverage,
    }));

    try {
      const result = await runBoardMutation(
        'replace_night_slot_tasks_for_slot',
        {
          nightId,
          slotKey,
          rrSide: rrSide || null,
          slotType,
          tasks: mappedTasks,
        },
        async () => {
          const { replaceNightSlotTasksForSlotServer } = await import('./opsMutations.server');
          const count = await replaceNightSlotTasksForSlotServer({
            nightId,
            slotKey,
            rrSide: rrSide || null,
            slotType,
            tasks: mappedTasks,
          });
          return { ok: true, applied: count };
        },
      );
      return (result as { applied?: number }).applied ?? mappedTasks.length;
    } catch (err) {
      console.error('[shiftbuilder/data] pushTaskDefaultsToNight replace error:', err);
      return 0;
    }
  };

  for (let i = 0; i < slotEntries.length; i += CHUNK) {
    const slice = slotEntries.slice(i, i + CHUNK);
    const counts = await Promise.all(
      slice.map(([compositeKey, tasks]) => replaceSlotTasks(compositeKey, tasks)),
    );
    applied += counts.reduce((sum, n) => sum + n, 0);
    if (i + CHUNK < slotEntries.length) await yieldToMain();
  }

  return { applied };
}

/** Push task defaults to all existing nights in the GRAVE week. */
export async function pushTaskDefaultsToWeek(
  weekStart: Date
): Promise<{ nights: number; applied: number }> {
  const nightIds = await resolveWeekNightIds(weekStart);
  let totalApplied = 0;

  const { yieldToMain } = await import('./yieldToMain');
  for (let i = 0; i < nightIds.length; i++) {
    const { applied } = await pushTaskDefaultsToNight(nightIds[i]);
    totalApplied += applied;
    if (i + 1 < nightIds.length) await yieldToMain();
  }

  return { nights: nightIds.length, applied: totalApplied };
}

/** Sweeper tasks excluded when copying prior-week same-day tasks (day-specific). */
export const SWEEPER_TASK_LABELS_EXCLUDED_FROM_COPY = [
  'Sweep 9/10/SR',
  'Sweeper 5 / 8 / HL',
  'Sweep 5/8/HL',
] as const;

export type CopyPriorWeekTasksResult = {
  sourceNightId: string;
  targetNightId: string;
  sourceDateIso: string;
  copied: number;
  excludedSweepers: number;
  replacedExisting: number;
};

/**
 * Copy all slot tasks from `sourceDate` onto `targetDate`.
 * Replace semantics: clears target night's tasks first, then inserts the source set.
 * Sweeper labels are skipped (they vary night-to-night).
 */
export async function copyNightSlotTasksFromSourceDate(
  sourceDate: Date,
  targetDate: Date,
  targetDayName: string,
  sourceDescription: string,
): Promise<CopyPriorWeekTasksResult> {
  const sourceDateIso = localDateIso(sourceDate);
  const targetDateIso = localDateIso(targetDate);

  const sourceNightId = await getNightIdForDate(sourceDate);
  if (!sourceNightId) {
    throw new Error(`No night found for ${sourceDescription} (${sourceDateIso})`);
  }

  const sourceTasks = await getNightSlotTasks(sourceNightId);
  const sweeperSet = new Set<string>(SWEEPER_TASK_LABELS_EXCLUDED_FROM_COPY);
  const toCopy = sourceTasks.filter((t) => !sweeperSet.has(t.taskLabel));
  const excludedSweepers = sourceTasks.length - toCopy.length;

  if (!toCopy.length) {
    throw new Error(`No copyable tasks for ${sourceDescription} (${sourceDateIso})`);
  }

  const targetNightId = await getOrCreateNightForDate(targetDate, targetDayName);

  const existingTasks = await getNightSlotTasks(targetNightId);
  const existingCount = existingTasks.length;

  const tasks = toCopy.map((t) => ({
    slotKey: t.slotKey,
    slotType: t.slotType,
    rrSide: t.rrSide,
    taskLabel: t.taskLabel,
    catalogTaskId: t.catalogTaskId,
    sortOrder: t.sortOrder,
    color: t.color,
    isCoverage: t.isCoverage,
  }));

  await runBoardMutation(
    'replace_all_night_slot_tasks',
    { nightId: targetNightId, tasks, date: targetDateIso },
    async () => {
      const { replaceAllNightSlotTasksServer } = await import('./opsMutations.server');
      await replaceAllNightSlotTasksServer(targetNightId, tasks);
      return { ok: true };
    },
  );

  return {
    sourceNightId,
    targetNightId,
    sourceDateIso,
    copied: toCopy.length,
    excludedSweepers,
    replacedExisting: existingCount ?? 0,
  };
}

/** Copy tasks from the same grave weekday one week earlier. */
export async function copyNightSlotTasksFromPriorWeekSameDay(
  targetDate: Date,
  targetDayName: string,
): Promise<CopyPriorWeekTasksResult> {
  const priorDate = addDays(targetDate, -7);
  return copyNightSlotTasksFromSourceDate(
    priorDate,
    targetDate,
    targetDayName,
    `last week's ${targetDayName}`,
  );
}

/** Copy tasks from the previous calendar day. */
export async function copyNightSlotTasksFromYesterday(
  targetDate: Date,
  targetDayName: string,
): Promise<CopyPriorWeekTasksResult> {
  const yesterday = addDays(targetDate, -1);
  return copyNightSlotTasksFromSourceDate(
    yesterday,
    targetDate,
    targetDayName,
    'yesterday',
  );
}

// =============================================================================
// 2026-05-28 Phase 1: TM Placement History + Zone Matrix helpers
// These feed the new fairness signals in scoring.ts and are the write path
// from successful Draft applies (see applyDraft in ShiftBuilderClient).
// All functions are TanStack-cache friendly and respect the live-state layer.
// =============================================================================

export interface TmZoneMatrixRow {
  tmId: string;
  zoneKey: string;
  lastPlacedAt: string | null;
  count4w: number;
  count8w: number;
  countLifetime: number;
}

export interface TmPlacementHistoryRow {
  tmId: string;
  nightId: string;
  slotKey: string;
  slotType: string;
  placedAt: string;
  weekStart: string | null;
}

/**
 * Returns the current zone matrix for a TM (or all TMs if no tmId).
 * Used by scoring for area_diversity / rotation signals.
 */
export async function getTmZoneMatrix(tmId?: string): Promise<Map<string, Map<string, TmZoneMatrixRow>>> {
  let q = supabase
    .from("tm_zone_matrix")
    .select("tm_id, zone_key, last_placed_at, count_4w, count_8w, count_lifetime");

  if (tmId) q = q.eq("tm_id", tmId);

  const { data, error } = await q;

  if (error) {
    console.warn("[data] getTmZoneMatrix failed", error);
    return new Map();
  }

  const out = new Map<string, Map<string, TmZoneMatrixRow>>();
  (data || []).forEach((row: any) => {
    if (!out.has(row.tm_id)) out.set(row.tm_id, new Map());
    out.get(row.tm_id)!.set(row.zone_key, {
      tmId: row.tm_id,
      zoneKey: row.zone_key,
      lastPlacedAt: row.last_placed_at,
      count4w: row.count_4w ?? 0,
      count8w: row.count_8w ?? 0,
      countLifetime: row.count_lifetime ?? 0,
    });
  });
  return out;
}

/**
 * Refreshes (or creates) the zone matrix rows for a TM from placement history.
 * Called after a successful Draft apply for the affected TMs.
 * This is the bridge between committed assignments and the fast fairness signals.
 */
export async function refreshTmZoneMatrix(tmId: string, lookbackWeeks = 12): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (lookbackWeeks * 7));

  const { data: history, error } = await supabase
    .from("tm_placement_history")
    .select("slot_key, placed_at, week_start")
    .eq("tm_id", tmId)
    .gte("placed_at", cutoff.toISOString())
    .order("placed_at", { ascending: false });

  if (error || !history) {
    console.warn("[data] refreshTmZoneMatrix history fetch failed", error);
    return;
  }

  const now = new Date();
  const fourWeeksAgo = new Date(now.getTime() - 28 * 86400 * 1000);
  const eightWeeksAgo = new Date(now.getTime() - 56 * 86400 * 1000);

  const zoneCounts = new Map<string, { last: string | null; c4: number; c8: number; life: number }>();

  history.forEach((h: any) => {
    // Only real zones count for area/rotation fairness
    if (!/^Z\d+$/.test(h.slot_key) && h.slot_key !== "Z9SR") return;

    const z = h.slot_key;
    const placed = new Date(h.placed_at);
    if (!zoneCounts.has(z)) {
      zoneCounts.set(z, { last: null, c4: 0, c8: 0, life: 0 });
    }
    const rec = zoneCounts.get(z)!;
    rec.life += 1;
    if (placed >= fourWeeksAgo) rec.c4 += 1;
    if (placed >= eightWeeksAgo) rec.c8 += 1;
    if (!rec.last || placed > new Date(rec.last)) rec.last = h.placed_at;
  });

  // Upsert into tm_zone_matrix
  const upserts = Array.from(zoneCounts.entries()).map(([zoneKey, rec]) => ({
    tm_id: tmId,
    zone_key: zoneKey,
    last_placed_at: rec.last,
    count_4w: rec.c4,
    count_8w: rec.c8,
    count_lifetime: rec.life,
    updated_at: now.toISOString(),
  }));

  if (upserts.length > 0) {
    const { error: upErr } = await supabase
      .from("tm_zone_matrix")
      .upsert(upserts, { onConflict: "tm_id,zone_key" });

    if (upErr) console.warn("[data] tm_zone_matrix upsert failed", upErr);
  }
}

/**
 * Records a committed placement into history (called from applyDraft after successful DB write).
 * This is the only writer path for tm_placement_history.
 */
export async function recordPlacementHistory(
  tmId: string,
  nightId: string,
  slotKey: string,
  slotType: string,
  rrSide: string | null = null,
  weekStart: string | null = null
): Promise<void> {
  const { error } = await supabase.from("tm_placement_history").insert({
    tm_id: tmId,
    night_id: nightId,
    slot_key: slotKey,
    slot_type: slotType,
    rr_side: rrSide,
    week_start: weekStart,
    is_committed: true,
  });

  if (error) {
    console.warn("[data] recordPlacementHistory failed", error);
  }
}
