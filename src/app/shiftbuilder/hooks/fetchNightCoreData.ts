import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import {
  buildSlotDefaultBreakMap,
  enrichAssignmentsWithBreakGroups,
  slotDefaultBreakMapToRecord,
} from "@/lib/shiftbuilder/breakGroupResolve";
import {
  getCachedActiveTeamMembers,
  getCachedGraveAvailableTeamMembers,
  getCachedSlotDefaults,
} from "@/lib/shiftbuilder/data.server";
type NightCoreApiPayload = {
  nightId: string | null;
  assignments: Record<string, any>;
  members: any[];
  scheduledTmIdsTonight: string[];
  realRoster: any[];
  graveRoster: any[];
  fullGraveScheduledTonight: string[];
  pmOverlapScheduledTonight: string[];
  amOverlapScheduledTonight: string[];
  rawDbAssignments: any[];
  rawBreakRows?: any[];
  slotDefaultBreaks: Record<string, number>;
};

function toSet(values: string[] | Set<string> | undefined | null): Set<string> {
  if (!values) return new Set();
  if (values instanceof Set) return values;
  return new Set(values);
}

function hydrateNightCoreFromBundle(raw: NightCoreApiPayload) {
  return {
    nightId: raw.nightId,
    assignments: raw.assignments,
    members: raw.members,
    scheduledTmIdsTonight: toSet(raw.scheduledTmIdsTonight as string[]),
    realRoster: raw.realRoster,
    graveRoster: raw.graveRoster,
    fullGraveScheduledTonight: toSet(raw.fullGraveScheduledTonight),
    pmOverlapScheduledTonight: toSet(raw.pmOverlapScheduledTonight),
    amOverlapScheduledTonight: toSet(raw.amOverlapScheduledTonight),
    rawDbAssignments: raw.rawDbAssignments,
    rawBreakRows: raw.rawBreakRows ?? [],
    slotDefaultBreaks: raw.slotDefaultBreaks,
  };
}

/** Primary path: one browser → Next server hop with parallel Supabase on the server. */
async function fetchNightCoreViaApi(dateStr: string) {
  const res = await fetch(`/api/shiftbuilder/night-core?date=${dateStr}`, {
    credentials: "same-origin",
  });
  if (!res.ok) return null;
  const raw = (await res.json()) as NightCoreApiPayload;
  return hydrateNightCoreFromBundle(raw);
}

/** Fallback when API unavailable — parallel client/server mix. */
async function fetchNightCoreClientFallback(selectedDay: DayDef) {
  const {
    getNightIdForDate,
    getNightAssignments,
    getOnScheduleTmIdsForNight,
  } = await import("@/lib/shiftbuilder/data");

  const dateStr = formatLocalDateISO(selectedDay.date);

  const [id, graveMembers, slotDefaults, allMembers, rosterResponse] = await Promise.all([
    getNightIdForDate(selectedDay.date),
    getCachedGraveAvailableTeamMembers(),
    getCachedSlotDefaults(),
    getCachedActiveTeamMembers(),
    fetch(`/api/shiftbuilder/scheduled-roster?date=${dateStr}`).catch(() => null),
  ]);

  const [dbAssignments, weekOnScheduleSet] = await Promise.all([
    id ? getNightAssignments(id) : Promise.resolve([]),
    id ? getOnScheduleTmIdsForNight(id, dateStr) : Promise.resolve(new Set<string>()),
  ]);

  const defaultBreakMap = buildSlotDefaultBreakMap(slotDefaults as any);
  const assignments = enrichAssignmentsWithBreakGroups(dbAssignments as any[], defaultBreakMap);

  const members = allMembers.map((tm) => ({
    ...tm,
    isOnSchedule: weekOnScheduleSet.has(tm.id),
  }));

  const graveRoster = graveMembers.map((m: any) => ({
    ...m,
    isOnWeek: weekOnScheduleSet.has(m.id),
    isPMOverlap: m.gravePool === "PM",
    isAMOverlap: m.gravePool === "AM",
  }));

  let canonicalScheduled = {
    allScheduled: [] as any[],
    fullGraveScheduled: [] as any[],
    pmOverlapScheduled: [] as any[],
    amOverlapScheduled: [] as any[],
  };

  try {
    if (rosterResponse?.ok) {
      const data = await rosterResponse.json();
      canonicalScheduled = {
        allScheduled: data.allScheduled || [],
        fullGraveScheduled: data.fullGraveScheduled || [],
        pmOverlapScheduled: data.pmOverlapScheduled || [],
        amOverlapScheduled: data.amOverlapScheduled || [],
      };
    }
  } catch (e) {
    console.error("[fetchNightCoreData] scheduled-roster failed", e);
  }

  const scheduledId = (t: any) => t.tmId || t.tm_id || t.id;
  const fullGraveScheduledTonight = new Set(
    canonicalScheduled.fullGraveScheduled.map(scheduledId),
  );
  const pmOverlapScheduledTonight = new Set(
    canonicalScheduled.pmOverlapScheduled.map(scheduledId),
  );
  const amOverlapScheduledTonight = new Set(
    canonicalScheduled.amOverlapScheduled.map(scheduledId),
  );

  const enrich = (list: any[]) =>
    list.map((m: any) => ({
      ...m,
      isPMOverlapTonight: pmOverlapScheduledTonight.has(m.id),
      isAMOverlapTonight: amOverlapScheduledTonight.has(m.id),
      isFullGraveTonight: fullGraveScheduledTonight.has(m.id),
    }));

  return {
    nightId: id,
    assignments,
    members,
    scheduledTmIdsTonight: new Set(canonicalScheduled.allScheduled.map(scheduledId)),
    realRoster: enrich(members),
    graveRoster: enrich(graveRoster),
    fullGraveScheduledTonight,
    pmOverlapScheduledTonight,
    amOverlapScheduledTonight,
    rawDbAssignments: dbAssignments,
    rawBreakRows: [] as any[],
    slotDefaultBreaks: slotDefaultBreakMapToRecord(defaultBreakMap),
  };
}

/** Shared nightCore queryFn — used by useCurrentNight, print hydration, and week prefetch. */
export async function fetchNightCoreData(selectedDay: DayDef) {
  const dateStr = formatLocalDateISO(selectedDay.date);

  try {
    const viaApi = await fetchNightCoreViaApi(dateStr);
    if (viaApi) return viaApi;
  } catch (e) {
    console.warn("[fetchNightCoreData] API path failed, using fallback", e);
  }

  return fetchNightCoreClientFallback(selectedDay);
}