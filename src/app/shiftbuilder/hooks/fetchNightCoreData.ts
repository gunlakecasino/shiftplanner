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
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import {
  resolveAuxLayout,
  remapAssignmentsToAuxKeys,
  defaultAuxDefsForNewNight,
} from "@/lib/shiftbuilder/auxLayout";
type NightCoreApiPayload = {
  nightId: string | null;
  assignments: Record<string, any>;
  auxDefs?: AuxDef[];
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
    auxDefs: raw.auxDefs ?? defaultAuxDefsForNewNight(),
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

function emptyNightCoreResult() {
  return {
    nightId: null,
    assignments: {} as Record<string, unknown>,
    auxDefs: defaultAuxDefsForNewNight(),
    members: [] as unknown[],
    scheduledTmIdsTonight: new Set<string>(),
    realRoster: [] as unknown[],
    graveRoster: [] as unknown[],
    fullGraveScheduledTonight: new Set<string>(),
    pmOverlapScheduledTonight: new Set<string>(),
    amOverlapScheduledTonight: new Set<string>(),
    rawDbAssignments: [] as unknown[],
    rawBreakRows: [] as unknown[],
    slotDefaultBreaks: {} as Record<string, number>,
  };
}

export type FetchNightCoreOptions = {
  /** When true, server rejects unpublished historical nights (403). */
  todayPolicy?: boolean;
};

/** Primary path: one browser → Next server hop with parallel Supabase on the server. */
async function fetchNightCoreViaApi(dateStr: string, options?: FetchNightCoreOptions) {
  const policyQs = options?.todayPolicy ? "&policy=today" : "";
  // Add unique bust param to ensure browser / any intermediate layers don't serve a stale response
  // even with cache: "no-store". Server still keys on date only.
  const bust = `&_=${Date.now()}`;
  const res = await fetch(`/api/shiftbuilder/night-core?date=${dateStr}${policyQs}${bust}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 403 && options?.todayPolicy) {
    return emptyNightCoreResult();
  }
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
    fetch(`/api/shiftbuilder/scheduled-roster?date=${dateStr}&_=${Date.now()}`).catch(() => null),
  ]);

  const [dbAssignments, weekOnScheduleSet] = await Promise.all([
    id ? getNightAssignments(id) : Promise.resolve([]),
    id ? getOnScheduleTmIdsForNight(id, dateStr) : Promise.resolve(new Set<string>()),
  ]);

  const defaultBreakMap = buildSlotDefaultBreakMap(slotDefaults as any);
  const legacyAssignments = enrichAssignmentsWithBreakGroups(dbAssignments as any[], defaultBreakMap);

  let storedAuxLayout: unknown = null;
  if (id) {
    const { getNightAuxLayout } = await import("@/lib/shiftbuilder/data");
    storedAuxLayout = await getNightAuxLayout(id);
  }
  const auxDefs = id
    ? resolveAuxLayout(storedAuxLayout, dbAssignments as any[])
    : defaultAuxDefsForNewNight();
  const assignments = remapAssignmentsToAuxKeys(legacyAssignments, auxDefs);

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
    auxDefs,
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
export async function fetchNightCoreData(
  selectedDay: DayDef,
  options?: FetchNightCoreOptions,
) {
  const dateStr = formatLocalDateISO(selectedDay.date);

  try {
    const viaApi = await fetchNightCoreViaApi(dateStr, options);
    if (viaApi) return viaApi;
  } catch (e) {
    console.warn("[fetchNightCoreData] API path failed, using fallback", e);
  }

  if (options?.todayPolicy) {
    return emptyNightCoreResult();
  }

  return fetchNightCoreClientFallback(selectedDay);
}