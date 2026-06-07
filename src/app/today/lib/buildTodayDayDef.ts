import {
  buildDayDefs,
  currentShiftDate,
  sameDay,
  startOfShiftWeek,
  type DayDef,
} from "@/lib/shiftbuilder/dateUtils";

/** Resolve tonight's DayDef from the current shift calendar. */
export function buildTodayDayDef(): DayDef {
  const today = currentShiftDate();
  const weekStart = startOfShiftWeek(today);
  const defs = buildDayDefs(weekStart, today);
  return defs.find((d) => sameDay(d.date, today)) ?? defs[0];
}