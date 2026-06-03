/**
 * Graves Default Schedule — single source of truth for "who is scheduled tonight".
 * Master grid: graves_default_schedule (fri–thu booleans per band).
 * Tonight exceptions: night_on_call (picker-only).
 */

import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { addDays, daysBetween, formatLocalDateISO, startOfShiftWeek } from "./dateUtils";
import type { ScheduledTm, ScheduledTmsForNightResult } from "./schedules";

export type GravesBand = "grave" | "am_overlap" | "pm_overlap";

export type GravesDayKey = "fri" | "sat" | "sun" | "mon" | "tue" | "wed" | "thu";

export const GRAVES_DAY_KEYS: GravesDayKey[] = [
  "fri",
  "sat",
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
];

export const GRAVES_DAY_LABELS: Record<GravesDayKey, string> = {
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
};

/** Column header for the default schedule grid (AM overlap = shift night + next-day AM). */
export function gravesDayColumnLabel(dayKey: GravesDayKey, band: GravesBand): string {
  if (band !== "am_overlap") return GRAVES_DAY_LABELS[dayKey];
  const idx = GRAVES_DAY_KEYS.indexOf(dayKey);
  const nextKey = GRAVES_DAY_KEYS[(idx + 1) % GRAVES_DAY_KEYS.length];
  return `${GRAVES_DAY_LABELS[dayKey]}/${GRAVES_DAY_LABELS[nextKey]}`;
}

export type GravesDaysMap = Record<GravesDayKey, boolean>;

export const EMPTY_GRAVES_DAYS: GravesDaysMap = {
  fri: false,
  sat: false,
  sun: false,
  mon: false,
  tue: false,
  wed: false,
  thu: false,
};

export function patternToDaysMap(pattern: Array<{ isOff: boolean }>): GravesDaysMap {
  const days = { ...EMPTY_GRAVES_DAYS };
  GRAVES_DAY_KEYS.forEach((key, i) => {
    days[key] = !(pattern[i]?.isOff ?? true);
  });
  return days;
}

/** Shift week day index 0 = Friday … 6 = Thursday. */
export function dayKeyForDate(date: Date): GravesDayKey {
  const weekStart = startOfShiftWeek(date);
  const probe = new Date(date);
  probe.setHours(12, 0, 0, 0);
  weekStart.setHours(12, 0, 0, 0);
  const idx = Math.max(0, Math.min(6, daysBetween(weekStart, probe)));
  return GRAVES_DAY_KEYS[idx];
}

export function normalizeDaysMap(raw: unknown): GravesDaysMap {
  const out = { ...EMPTY_GRAVES_DAYS };
  if (!raw || typeof raw !== "object") return out;
  for (const key of GRAVES_DAY_KEYS) {
    if (key in (raw as object)) {
      out[key] = !!(raw as Record<string, boolean>)[key];
    }
  }
  return out;
}

export function isScheduledOnDay(days: GravesDaysMap, date: Date): boolean {
  return !!days[dayKeyForDate(date)];
}

export interface GravesScheduleRow {
  tmId: string;
  band: GravesBand;
  days: GravesDaysMap;
  tmName: string;
  gravePool?: string | null;
  gender?: string | null;
}

export interface ScheduledIdsForNight {
  grave: Set<string>;
  amOverlap: Set<string>;
  pmOverlap: Set<string>;
  onCall: Set<string>;
}

async function loadProfileIndex(
  supabase: NonNullable<ReturnType<typeof createAdminClientSafe>>,
): Promise<Map<string, ScheduledTm>> {
  const { data: profiles } = await supabase
    .from("tm_profiles")
    .select("id, tm_id, display_name, full_name, grave_pool, gender, active")
    .eq("active", true);

  const map = new Map<string, ScheduledTm>();
  for (const p of profiles || []) {
    const row: ScheduledTm = {
      id: p.id,
      tmId: p.tm_id,
      name: p.display_name || p.full_name || p.tm_id || p.id,
      gravePool: p.grave_pool,
      gender: p.gender,
    };
    map.set(p.id, row);
    if (p.tm_id) map.set(p.tm_id, row);
  }
  return map;
}

export async function getScheduledIdsForNight(
  nightDate: Date,
  nightId?: string | null,
): Promise<ScheduledIdsForNight> {
  const supabase = createAdminClientSafe();
  const grave = new Set<string>();
  const amOverlap = new Set<string>();
  const pmOverlap = new Set<string>();
  const onCall = new Set<string>();

  if (!supabase) {
    return { grave, amOverlap, pmOverlap, onCall };
  }

  const dayKey = dayKeyForDate(nightDate);

  const { data: rows } = await supabase.from("graves_default_schedule").select("tm_id, band, days");

  for (const row of rows || []) {
    const days = normalizeDaysMap(row.days);
    if (!days[dayKey]) continue;
    const id = row.tm_id as string;
    if (row.band === "grave") grave.add(id);
    else if (row.band === "am_overlap") amOverlap.add(id);
    else if (row.band === "pm_overlap") pmOverlap.add(id);
  }

  if (nightId) {
    const { data: onCallRows } = await supabase
      .from("night_on_call")
      .select("tm_id")
      .eq("night_id", nightId);
    for (const r of onCallRows || []) {
      onCall.add(r.tm_id as string);
      grave.add(r.tm_id as string);
    }
  }

  return { grave, amOverlap, pmOverlap, onCall };
}

/** API-compatible shape for useCurrentNight / scheduled-roster. */
export async function getScheduledTmsFromGravesDefault(
  nightDate: Date,
  nightId?: string | null,
): Promise<ScheduledTmsForNightResult> {
  const supabase = createAdminClientSafe();
  if (!supabase) {
    return {
      allScheduled: [],
      fullGraveScheduled: [],
      pmOverlapScheduled: [],
      amOverlapScheduled: [],
      scheduledWithRoles: [],
    };
  }

  const ids = await getScheduledIdsForNight(nightDate, nightId);
  const profileIndex = await loadProfileIndex(supabase);

  const pick = (set: Set<string>): ScheduledTm[] => {
    const out: ScheduledTm[] = [];
    const seen = new Set<string>();
    for (const id of set) {
      const tm = profileIndex.get(id);
      if (!tm || seen.has(tm.id)) continue;
      seen.add(tm.id);
      out.push(tm);
    }
    return out;
  };

  const fullGraveScheduled = pick(ids.grave);
  const pmOverlapScheduled = pick(ids.pmOverlap);
  const amOverlapScheduled = pick(ids.amOverlap);

  const allIds = new Set<string>([
    ...ids.grave,
    ...ids.pmOverlap,
    ...ids.amOverlap,
  ]);
  const allScheduled = pick(allIds);

  return {
    allScheduled,
    fullGraveScheduled,
    pmOverlapScheduled,
    amOverlapScheduled,
    scheduledWithRoles: allScheduled.map((tm) => ({
      ...tm,
      shift: { label: "Scheduled", startTime: null, endTime: null },
      isFullGrave: ids.grave.has(tm.id),
      isPMOverlap: ids.pmOverlap.has(tm.id),
      isAMOverlap: ids.amOverlap.has(tm.id),
    })),
  };
}

export type GravesEligibleTm = {
  tmId: string;
  tmName: string;
  gravePool?: string | null;
};

export type GravesDefaultScheduleGrid = {
  grave: GravesScheduleRow[];
  amOverlap: GravesScheduleRow[];
  pmOverlap: GravesScheduleRow[];
  eligible: {
    grave: GravesEligibleTm[];
    amOverlap: GravesEligibleTm[];
    pmOverlap: GravesEligibleTm[];
  };
};

type ProfileRow = {
  id: string;
  display_name?: string | null;
  full_name?: string | null;
  grave_pool?: string | null;
  gender?: string | null;
};

function profileDisplayName(p: ProfileRow): string {
  return p.display_name || p.full_name || p.id;
}

function groupMemberIds(
  groups: Array<{ name: string; tm_group_members?: Array<{ tm_id: string }> }> | null,
  ...names: string[]
): Set<string> {
  const ids = new Set<string>();
  const lower = new Set(names.map((n) => n.toLowerCase()));
  for (const g of groups || []) {
    if (!lower.has((g.name || "").toLowerCase())) continue;
    for (const m of g.tm_group_members || []) {
      if (m.tm_id) ids.add(m.tm_id);
    }
  }
  return ids;
}

function isEligibleForBand(
  p: ProfileRow,
  band: GravesBand,
  amGroupIds: Set<string>,
  pmGroupIds: Set<string>,
): boolean {
  const pool = (p.grave_pool || "").toUpperCase();
  if (band === "grave") return !!p.grave_pool;
  if (band === "am_overlap") return pool === "AM" || amGroupIds.has(p.id);
  return pool === "PM" || pmGroupIds.has(p.id);
}

export async function getGravesDefaultScheduleGrid(): Promise<GravesDefaultScheduleGrid> {
  const emptyEligible = { grave: [], amOverlap: [], pmOverlap: [] };
  const supabase = createAdminClientSafe();
  if (!supabase) {
    return { grave: [], amOverlap: [], pmOverlap: [], eligible: emptyEligible };
  }

  const [{ data: profiles }, { data: groups }, { data: scheduleRows }] = await Promise.all([
    supabase
      .from("tm_profiles")
      .select("id, tm_id, display_name, full_name, grave_pool, gender, active")
      .eq("active", true)
      .order("display_name"),
    supabase.from("tm_groups").select("id, name, tm_group_members (tm_id)"),
    supabase.from("graves_default_schedule").select("tm_id, band, days"),
  ]);

  const amGroupIds = groupMemberIds(groups, "AM Overlaps", "AM Overlap");
  const pmGroupIds = groupMemberIds(groups, "PM Overlaps", "PM Overlap");

  const profileById = new Map<string, ProfileRow>();
  for (const p of (profiles || []) as ProfileRow[]) {
    profileById.set(p.id, p);
  }

  const scheduledByBand: Record<GravesBand, Map<string, GravesDaysMap>> = {
    grave: new Map(),
    am_overlap: new Map(),
    pm_overlap: new Map(),
  };

  for (const r of scheduleRows || []) {
    const band = r.band as GravesBand;
    if (!scheduledByBand[band]) continue;
    scheduledByBand[band].set(r.tm_id as string, normalizeDaysMap(r.days));
  }

  const buildSection = (band: GravesBand): GravesScheduleRow[] => {
    const rows: GravesScheduleRow[] = [];
    for (const [tmId, days] of scheduledByBand[band]) {
      const p = profileById.get(tmId);
      if (!p) continue;
      rows.push({
        tmId,
        band,
        days,
        tmName: profileDisplayName(p),
        gravePool: p.grave_pool,
        gender: p.gender,
      });
    }
    rows.sort((a, b) => a.tmName.localeCompare(b.tmName));
    return rows;
  };

  const buildEligible = (band: GravesBand): GravesEligibleTm[] => {
    const scheduled = scheduledByBand[band];
    const out: GravesEligibleTm[] = [];
    for (const p of (profiles || []) as ProfileRow[]) {
      if (scheduled.has(p.id)) continue;
      if (!isEligibleForBand(p, band, amGroupIds, pmGroupIds)) continue;
      out.push({
        tmId: p.id,
        tmName: profileDisplayName(p),
        gravePool: p.grave_pool,
      });
    }
    out.sort((a, b) => a.tmName.localeCompare(b.tmName));
    return out;
  };

  return {
    grave: buildSection("grave"),
    amOverlap: buildSection("am_overlap"),
    pmOverlap: buildSection("pm_overlap"),
    eligible: {
      grave: buildEligible("grave"),
      amOverlap: buildEligible("am_overlap"),
      pmOverlap: buildEligible("pm_overlap"),
    },
  };
}

export async function upsertGravesDefaultScheduleRows(
  updates: Array<{ tmId: string; band: GravesBand; days: GravesDaysMap }>,
): Promise<void> {
  const supabase = createAdminClientSafe();
  if (!supabase || !updates.length) return;

  const payload = updates.map((u) => ({
    tm_id: u.tmId,
    band: u.band,
    days: u.days,
  }));

  const { error } = await supabase
    .from("graves_default_schedule")
    .upsert(payload, { onConflict: "tm_id,band" });

  if (error) throw new Error(error.message);
}

export async function addGravesDefaultScheduleMember(
  tmId: string,
  band: GravesBand,
): Promise<void> {
  await upsertGravesDefaultScheduleRows([
    { tmId, band, days: { ...EMPTY_GRAVES_DAYS } },
  ]);
}

export async function removeGravesDefaultScheduleMember(
  tmId: string,
  band: GravesBand,
): Promise<void> {
  const supabase = createAdminClientSafe();
  if (!supabase) return;

  const { error } = await supabase
    .from("graves_default_schedule")
    .delete()
    .eq("tm_id", tmId)
    .eq("band", band);

  if (error) throw new Error(error.message);
}