import type { DayDef } from "@/lib/shiftbuilder/dateUtils";

/** Shared nightSecondary queryFn — tasks, borders, break rows for the break sheet. */
export async function fetchNightSecondaryData(selectedDay: DayDef) {
  const {
    getNightIdForDate,
    getNightNotes,
    getNightSlotTasks,
    getNightBreakAssignments,
    getNightCardBorders,
    getRecentZoneHistory,
  } = await import("@/lib/shiftbuilder/data");

  const id = await getNightIdForDate(selectedDay.date);

  const [notesText, nightTaskRows, breakRows, nightBorderMap, recentHistory] =
    await Promise.all([
      id ? getNightNotes(id) : Promise.resolve(""),
      id ? getNightSlotTasks(id) : Promise.resolve([]),
      id ? getNightBreakAssignments(id) : Promise.resolve([]),
      id ? getNightCardBorders(id) : Promise.resolve({} as Record<string, string>),
      getRecentZoneHistory(selectedDay.date, 7),
    ]);

  return {
    notes: notesText,
    tasks: nightTaskRows,
    breakAssignments: breakRows,
    cardBorders: nightBorderMap,
    recentZoneHistory: recentHistory,
    calledOffIds: new Set<string>(),
    rawBreakRows: breakRows,
  };
}