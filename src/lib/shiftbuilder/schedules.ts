/**
 * schedules.ts
 *
 * SINGLE SOURCE OF TRUTH — "Is this TM scheduled for this night, and what shift are they working?"
 *
 * This file is the **canonical authority** for all scheduling decisions in ShiftBuilder
 * and the Sudo Weekly Roster tooling. Every consumer (TM Picker, Roster Rail, eligibility
 * filtering, Command Palette, live layer, etc.) must go through this module.
 *
 * The logic is intentionally kept close to the battle-tested resolver in
 * WeeklyRosterTab.tsx so that the operator sees identical results in Sudo and in the
 * main board/picker.
 *
 * NO MORE DIVERGENCE.
 */

import { createAdminClient, createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { startOfRosterWeek, daysBetween } from "./dateUtils";
import type { WeeklyShift } from "./types/schedules";
import { isWorkingShift } from "./types/schedules";
import { createClient } from '@supabase/supabase-js';

// === DIAGNOSTIC: the five TMs the operator reports are leaking into the default picker list
// when they are marked OFF (or not in the correct group) in the Sudo Weekly Roster.
const WATCHED_NAMES_LOWER = ['alec', 'daryl', 'jason', 'nikki', 'sam', 'scott'];

/** Rich representation of a TM's effective shift (or explicit OFF) for one night. */
export type NightShift = WeeklyShift | { label: "OFF"; startTime: null; endTime: null };

export interface ScheduledTm {
  id: string;
  tmId: string | null;
  name: string;
  gravePool: string | null;
  gender: string | null;
}

export interface ScheduledTmWithRole extends ScheduledTm {
  shift: NightShift;
  isFullGrave: boolean;
  isPMOverlap: boolean;
  isAMOverlap: boolean;
}

export interface ScheduledTmsForNightResult {
  allScheduled: ScheduledTm[];
  fullGraveScheduled: ScheduledTm[];
  pmOverlapScheduled: ScheduledTm[];
  amOverlapScheduled: ScheduledTm[];
  scheduledWithRoles: ScheduledTmWithRole[];
}

/**
 * Returns the definitive shift (or OFF) a TM is working on a specific night.
 * This is the function every other part of the system should call.
 *
 * Resolution order (exactly as trusted in the Sudo Weekly Roster tab):
 * 1. tm_on_call_schedules for the exact roster week (highest priority override)
 * 2. Most recent tm_default_schedules (by effective_from <= roster week start)
 * 3. If no working entry after the above → OFF
 */
export async function getTmShiftForNight(
  tmId: string, // tm_profiles.id (UUID) — same space used by Sudo tabs
  nightDate: Date
): Promise<NightShift> {
  const supabase = createAdminClientSafe();
  if (!supabase) {
    // No service key available (common on Railway if the secret isn't attached to the right env)
    return { label: "OFF", startTime: null, endTime: null };
  }

  const night = new Date(nightDate);
  night.setHours(12, 0, 0, 0);

  const rosterWeekStart = startOfRosterWeek(night);
  const rosterWeekStartIso = rosterWeekStart.toISOString().slice(0, 10);
  const dayIndex = Math.max(0, Math.min(6, daysBetween(rosterWeekStart, night)));

  // 1. Most recent effective default
  const { data: defaults } = await supabase
    .from("tm_default_schedules")
    .select("tm_id, effective_from, weekly_pattern")
    .eq("tm_id", tmId)
    .lte("effective_from", rosterWeekStartIso)
    .order("effective_from", { ascending: false })
    .limit(1);

  const def = defaults?.[0];
  const basePattern: any[] = def?.weekly_pattern || [];

  // 2. Weekly special/override for this exact roster week (wins)
  const { data: specials } = await supabase
    .from("tm_on_call_schedules")
    .select("tm_id, week_start, weekly_pattern")
    .eq("tm_id", tmId)
    .eq("week_start", rosterWeekStartIso)
    .limit(1);

  const special = specials?.[0];
  const pattern = special?.weekly_pattern || basePattern;

  const rawEntry = pattern?.[dayIndex];

  // === WATCHED TM DIAGNOSTIC ===
  // We fetch the name only for watched TMs to keep noise low.
  let watchedName: string | null = null;
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { data: prof } = await supabase
        .from("tm_profiles")
        .select("display_name, full_name")
        .eq("id", tmId)
        .limit(1);
      const n = (prof?.[0]?.display_name || prof?.[0]?.full_name || '').toLowerCase();
      if (WATCHED_NAMES_LOWER.some(w => n.includes(w))) {
        watchedName = prof?.[0]?.display_name || prof?.[0]?.full_name || tmId;
      }
    } catch {}
  }

  if (watchedName) {
    console.log('[CANONICAL-SCHEDULE-DIAG] getTmShiftForNight', {
      name: watchedName,
      night: night.toISOString().slice(0,10),
      rosterWeekStart: rosterWeekStartIso,
      dayIndex,
      hadOnCallOverride: !!special,
      hadDefault: !!def,
      rawEntry,
      finalIsWorking: !!(rawEntry && isWorkingShift(rawEntry)),
    });
  }

  if (!rawEntry || !isWorkingShift(rawEntry)) {
    if (watchedName) console.log('[CANONICAL-SCHEDULE-DIAG] → resolved to OFF for', watchedName);
    return { label: "OFF", startTime: null, endTime: null };
  }

  const result = {
    startTime: rawEntry.startTime ?? null,
    endTime: rawEntry.endTime ?? null,
    label: rawEntry.label || "Unknown Shift",
  };
  if (watchedName) console.log('[CANONICAL-SCHEDULE-DIAG] → resolved shift for', watchedName, result);
  return result;
}

/**
 * Batch version — the **only** recommended way to answer "who is scheduled tonight?"
 * for the TM Picker, Roster Rail, eligibility pools, etc.
 *
 * This replaces every previous call to getScheduledTmIdsForNightFromNewRoster
 * and getNightRosterClassification.
 */
export async function getScheduledTmsForNight(
  nightDate: Date
): Promise<ScheduledTmsForNightResult> {
  const supabase = createAdminClientSafe();
  if (!supabase) {
    // Fallback: read the weekly roster tables directly with anon key.
    // This makes the TM Picker see scheduled TMs exactly as configured in the Sudo Weekly Roster tab.
    const anonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!anonUrl || !anonKey) {
      return { allScheduled: [], fullGraveScheduled: [], pmOverlapScheduled: [], amOverlapScheduled: [], scheduledWithRoles: [] };
    }
    const anon = createClient(anonUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

    const night = new Date(nightDate);
    night.setHours(12, 0, 0, 0);
    const rosterWeekStart = startOfRosterWeek(night);
    const rosterWeekStartIso = rosterWeekStart.toISOString().slice(0, 10);
    const dayIndex = Math.max(0, Math.min(6, daysBetween(rosterWeekStart, night)));

    const { data: weekOnCall } = await anon.from("tm_on_call_schedules").select("tm_id, weekly_pattern").eq("week_start", rosterWeekStartIso);
    const { data: defaultsForWeek } = await anon.from("tm_default_schedules").select("tm_id, effective_from, weekly_pattern").lte("effective_from", rosterWeekStartIso).order("effective_from", { ascending: false });

    const effectiveByTm: Record<string, any[]> = {};
    (defaultsForWeek || []).forEach((d: any) => { if (!effectiveByTm[d.tm_id]) effectiveByTm[d.tm_id] = d.weekly_pattern || []; });
    (weekOnCall || []).forEach((s: any) => { effectiveByTm[s.tm_id] = s.weekly_pattern || []; });

    // Build from the raw weekly roster data.
    // To make "scheduled but unassigned" work well for the picker even with partial data,
    // we include any TM that has a weekly special containing a "Full Grave" (or equivalent) pattern
    // into the grave partition for the whole week. Same idea for overlaps.
    const graveFromRoster = new Set<string>();
    const pmFromRoster = new Set<string>();
    const amFromRoster = new Set<string>();

    Object.entries(effectiveByTm).forEach(([tmId, pattern]) => {
      const labels = (pattern || []).map((p: any) => (p?.label || "").toLowerCase()).join(" ");
      const hasWorking = (pattern || []).some((p: any) => isWorkingShift(p));

      if (!hasWorking) return;

      if (labels.includes("full grave") || labels.includes("grave")) {
        graveFromRoster.add(tmId);
      }
      if (labels.includes("pm overlap")) {
        pmFromRoster.add(tmId);
      }
      if (labels.includes("am overlap")) {
        amFromRoster.add(tmId);
      }
    });

    const allFromRoster = [...new Set([...graveFromRoster, ...pmFromRoster, ...amFromRoster])].map(id => ({ id } as any));

    return {
      allScheduled: allFromRoster,
      fullGraveScheduled: [...graveFromRoster].map(id => ({ id } as any)),
      pmOverlapScheduled: [...pmFromRoster].map(id => ({ id } as any)),
      amOverlapScheduled: [...amFromRoster].map(id => ({ id } as any)),
      scheduledWithRoles: [],
    };
  }

  const night = new Date(nightDate);
  night.setHours(12, 0, 0, 0);

  const rosterWeekStart = startOfRosterWeek(night);
  const rosterWeekStartIso = rosterWeekStart.toISOString().slice(0, 10);

  // We start broad (all active TMs) and let the per-TM resolver decide.
  // This is the safest way to guarantee we never miss a rescheduled TM.
  const { data: activeTms } = await supabase
    .from("tm_profiles")
    .select("id, tm_id, display_name, full_name, grave_pool, gender, active")
    .eq("active", true);

  if (!activeTms) {
    return {
      allScheduled: [],
      fullGraveScheduled: [],
      pmOverlapScheduled: [],
      amOverlapScheduled: [],
      scheduledWithRoles: [],
    };
  }

  // Load current group membership so we can classify "grave / overlap" people
  // using authoritative groups (not only fragile label matching on the shift).
  // This makes "assign grave pattern in Weekly Roster" reliably surface the TM
  // in the main board's grave card default picker lists.
  const { data: groupData } = await supabase
    .from("tm_groups")
    .select(`
      name,
      tm_group_members (tm_id)
    `);

  const graveMemberIds = new Set<string>();
  const pmOverlapMemberIds = new Set<string>();
  const amOverlapMemberIds = new Set<string>();

  (groupData || []).forEach((g: any) => {
    const name = (g.name || "").toLowerCase();
    const members = (g.tm_group_members || []).map((m: any) => m.tm_id);
    if (name.includes("grave")) members.forEach((id: string) => graveMemberIds.add(id));
    if (name.includes("pm overlap") || name.includes("pm_overlaps")) members.forEach((id: string) => pmOverlapMemberIds.add(id));
    if (name.includes("am overlap") || name.includes("am_overlaps")) members.forEach((id: string) => amOverlapMemberIds.add(id));
  });

  const results = await Promise.all(
    activeTms.map(async (tm: any) => {
      const shift = await getTmShiftForNight(tm.id, night);
      const isScheduled = shift.label !== "OFF";
      const labelLower = shift.label.toLowerCase();

      const scheduledTm: ScheduledTm = {
        id: tm.id,
        tmId: tm.tm_id,
        name: tm.display_name || tm.full_name,
        gravePool: tm.grave_pool,
        gender: tm.gender,
      };

      return {
        tm: scheduledTm,
        shift,
        isScheduled,
        isFullGrave: isScheduled && (
          labelLower.includes("full grave") || 
          graveMemberIds.has(tm.id) || 
          graveMemberIds.has(tm.tm_id)
        ),
        isPMOverlap: isScheduled && (
          labelLower.includes("pm overlap") || 
          pmOverlapMemberIds.has(tm.id) || 
          pmOverlapMemberIds.has(tm.tm_id)
        ),
        isAMOverlap: isScheduled && (
          labelLower.includes("am overlap") || 
          amOverlapMemberIds.has(tm.id) || 
          amOverlapMemberIds.has(tm.tm_id)
        ),
      };
    })
  );

  const scheduled = results.filter((r) => r.isScheduled);

  // === WATCHED TM + PARTITION DIAGNOSTIC (the key data that feeds the picker default list) ===
  if (process.env.NODE_ENV !== 'production') {
    const watchedResults = results.filter((r) => {
      const n = (r.tm.name || '').toLowerCase();
      return WATCHED_NAMES_LOWER.some(w => n.includes(w));
    });

    if (watchedResults.length > 0) {
      console.group('[CANONICAL-SCHEDULE-DIAG] getScheduledTmsForNight watched TMs');
      console.log('Night:', night.toISOString().slice(0,10));
      watchedResults.forEach(r => {
        console.log({
          name: r.tm.name,
          tmId: r.tm.id,
          legacyTmId: r.tm.tmId,
          isScheduled: r.isScheduled,
          shiftLabel: r.shift.label,
          gravePoolFromProfile: r.tm.gravePool,
          inGraveGroup: graveMemberIds.has(r.tm.id) || (!!r.tm.tmId && graveMemberIds.has(r.tm.tmId)),
          inPMGroup: pmOverlapMemberIds.has(r.tm.id) || (!!r.tm.tmId && pmOverlapMemberIds.has(r.tm.tmId)),
          inAMGroup: amOverlapMemberIds.has(r.tm.id) || (!!r.tm.tmId && amOverlapMemberIds.has(r.tm.tmId)),
          landedInFullGrave: r.isFullGrave,
          landedInPMOverlap: r.isPMOverlap,
          landedInAMOverlap: r.isAMOverlap,
        });
      });
      console.log('Total fullGraveScheduled count:', scheduled.filter(r => r.isFullGrave).length);
      console.groupEnd();
    }
  }

  return {
    allScheduled: scheduled.map((r) => r.tm),
    fullGraveScheduled: scheduled.filter((r) => r.isFullGrave).map((r) => r.tm),
    pmOverlapScheduled: scheduled.filter((r) => r.isPMOverlap).map((r) => r.tm),
    amOverlapScheduled: scheduled.filter((r) => r.isAMOverlap).map((r) => r.tm),
    scheduledWithRoles: scheduled.map((r) => ({
      ...r.tm,
      shift: r.shift,
      isFullGrave: r.isFullGrave,
      isPMOverlap: r.isPMOverlap,
      isAMOverlap: r.isAMOverlap,
    })),
  };
}

/**
 * Convenience helper for any remaining legacy call sites that only need a Set of IDs.
 * Prefer the rich `getScheduledTmsForNight` whenever possible.
 */
export async function getScheduledTmIdsForNight(nightDate: Date): Promise<Set<string>> {
  const data = await getScheduledTmsForNight(nightDate);
  return new Set(data.allScheduled.map((t) => t.id));
}