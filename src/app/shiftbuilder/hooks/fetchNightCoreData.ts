import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { defaultAuxDefsForNewNight } from "@/lib/shiftbuilder/auxLayout";

type NightCoreApiPayload = {
  nightId: string | null;
  assignments: Record<string, any>;
  auxDefs?: AuxDef[];
  members: any[];
  scheduledTmIdsTonight: string[];
  realRoster: any[];
  graveRoster: any[];
  gravesScheduleRoster: any[];
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
    gravesScheduleRoster: raw.gravesScheduleRoster ?? [],
    fullGraveScheduledTonight: toSet(raw.fullGraveScheduledTonight),
    pmOverlapScheduledTonight: toSet(raw.pmOverlapScheduledTonight),
    amOverlapScheduledTonight: toSet(raw.amOverlapScheduledTonight),
    rawDbAssignments: raw.rawDbAssignments,
    rawBreakRows: raw.rawBreakRows ?? [],
    slotDefaultBreaks: raw.slotDefaultBreaks,
  };
}

function emptyNightCoreResult(accessBlocked = false) {
  return {
    nightId: null,
    assignments: {} as Record<string, unknown>,
    auxDefs: defaultAuxDefsForNewNight(),
    members: [] as unknown[],
    scheduledTmIdsTonight: new Set<string>(),
    realRoster: [] as unknown[],
    graveRoster: [] as unknown[],
    gravesScheduleRoster: [] as unknown[],
    fullGraveScheduledTonight: new Set<string>(),
    pmOverlapScheduledTonight: new Set<string>(),
    amOverlapScheduledTonight: new Set<string>(),
    rawDbAssignments: [] as unknown[],
    rawBreakRows: [] as unknown[],
    slotDefaultBreaks: {} as Record<string, number>,
    accessBlocked,
  };
}

export type FetchNightCoreOptions = {
  /** When true, server rejects unpublished historical nights (403). */
  todayPolicy?: boolean;
  /** When true, treat 403 as blocked access (viewer published-only policy). */
  publishedOnlyPolicy?: boolean;
};

/**
 * Session-gated night-core load only.
 * PR 11a / KD-13: no silent anon Supabase fallback when the API fails.
 */
async function fetchNightCoreViaApi(dateStr: string, options?: FetchNightCoreOptions) {
  const policyQs = options?.todayPolicy ? "&policy=today" : "";
  // Add unique bust param to ensure browser / any intermediate layers don't serve a stale response
  // even with cache: "no-store". Server still keys on date only.
  const bust = `&_=${Date.now()}`;
  const res = await fetch(`/api/shiftbuilder/night-core?date=${dateStr}${policyQs}${bust}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 403) {
    return emptyNightCoreResult(true);
  }
  if (!res.ok) {
    throw new Error(`Night core API failed (${res.status}) for ${dateStr}`);
  }
  const raw = (await res.json()) as NightCoreApiPayload;
  return hydrateNightCoreFromBundle(raw);
}

/** Shared nightCore queryFn — used by useCurrentNight, print hydration, and week prefetch. */
export async function fetchNightCoreData(
  selectedDay: DayDef,
  options?: FetchNightCoreOptions,
) {
  const dateStr = formatLocalDateISO(selectedDay.date);

  try {
    return await fetchNightCoreViaApi(dateStr, options);
  } catch (e) {
    // Viewer/today policy: fail closed to blocked/empty rather than throwing into print paths.
    if (options?.todayPolicy || options?.publishedOnlyPolicy) {
      console.warn("[fetchNightCoreData] session API failed under policy — fail closed", e);
      return emptyNightCoreResult(options?.publishedOnlyPolicy ?? false);
    }
    console.error("[fetchNightCoreData] session API failed (no client fallback)", e);
    throw e instanceof Error ? e : new Error("Night core session API failed");
  }
}
