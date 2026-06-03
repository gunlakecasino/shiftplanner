import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import {
  buildSlotDefaultBreakMap,
  enrichAssignmentsWithBreakGroups,
  slotDefaultBreakMapToRecord,
} from "@/lib/shiftbuilder/breakGroupResolve";

/** Shared nightCore queryFn — used by useCurrentNight and print hydration. */
export async function fetchNightCoreData(selectedDay: DayDef) {
  const {
    getNightIdForDate,
    getTeamMembersForNight,
    getNightAssignments,
    getGraveAvailableTeamMembers,
    getOnScheduleTmIdsForNight,
    getActiveTeamMembers,
    getSlotDefaults,
  } = await import("@/lib/shiftbuilder/data");

  const id = await getNightIdForDate(selectedDay.date);

  const [members, dbAssignments, graveMembers, weekOnScheduleSet, slotDefaults] =
    await Promise.all([
      id
        ? getTeamMembersForNight(id)
        : getActiveTeamMembers().then((all) =>
            all.map((tm) => ({ ...tm, isOnSchedule: false })),
          ),
      id ? getNightAssignments(id) : Promise.resolve([]),
      getGraveAvailableTeamMembers(),
      id
        ? getOnScheduleTmIdsForNight(id, formatLocalDateISO(selectedDay.date))
        : Promise.resolve(new Set<string>()),
      getSlotDefaults(),
    ]);

  const defaultBreakMap = buildSlotDefaultBreakMap(slotDefaults);
  const assignments = enrichAssignmentsWithBreakGroups(
    dbAssignments as any[],
    defaultBreakMap,
  );

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
    scheduledWithRoles: [] as any[],
  };

  try {
    const dateStr = formatLocalDateISO(selectedDay.date);
    const rosterUrl = id
      ? `/api/shiftbuilder/scheduled-roster?date=${dateStr}&night_id=${id}`
      : `/api/shiftbuilder/scheduled-roster?date=${dateStr}`;
    const res = await fetch(rosterUrl, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      canonicalScheduled = {
        allScheduled: data.allScheduled || [],
        fullGraveScheduled: data.fullGraveScheduled || [],
        pmOverlapScheduled: data.pmOverlapScheduled || [],
        amOverlapScheduled: data.amOverlapScheduled || [],
        scheduledWithRoles: data.scheduledWithRoles || [],
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

  const enrichedRealRoster = (members || []).map((m: any) => ({
    ...m,
    isPMOverlapTonight: pmOverlapScheduledTonight.has(m.id),
    isAMOverlapTonight: amOverlapScheduledTonight.has(m.id),
    isFullGraveTonight: fullGraveScheduledTonight.has(m.id),
  }));

  const enrichedGraveRoster = graveRoster.map((m: any) => ({
    ...m,
    isPMOverlapTonight: pmOverlapScheduledTonight.has(m.id),
    isAMOverlapTonight: amOverlapScheduledTonight.has(m.id),
    isFullGraveTonight: fullGraveScheduledTonight.has(m.id),
  }));

  const scheduledTmIdsTonight: Set<string> = new Set(
    canonicalScheduled.allScheduled.map(scheduledId),
  );

  return {
    nightId: id,
    assignments,
    members,
    scheduledTmIdsTonight,
    realRoster: enrichedRealRoster,
    graveRoster: enrichedGraveRoster,
    fullGraveScheduledTonight,
    pmOverlapScheduledTonight,
    amOverlapScheduledTonight,
    rawDbAssignments: dbAssignments,
    rawBreakRows: [] as any[],
    slotDefaultBreaks: slotDefaultBreakMapToRecord(defaultBreakMap),
  };
}