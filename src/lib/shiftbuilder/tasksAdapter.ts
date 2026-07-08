// ShiftBuilder-specific glue for the portable src/lib/tasks/** core. This is the
// ONLY file in the Projects/Tasks feature allowed to know about grave-night
// semantics, ShiftBuilder departments, or TM roster concepts (T6 — the portable
// core in src/lib/tasks/** must stay free of these).

import { currentShiftDate, formatLocalDateISO } from "./dateUtils";
import type { WorkItemDepartment, WorkItemDueShift } from "@/lib/tasks/types";

/** ShiftBuilder is the GRAVE shift builder — every item it creates is graves-department. */
export const SHIFTBUILDER_DEPARTMENT: WorkItemDepartment = "graves";

/** Default due_shift for a task created from the /projects page without an explicit choice. */
export const SHIFTBUILDER_DEFAULT_DUE_SHIFT: WorkItemDueShift = "graves";

/**
 * The calendar date (YYYY-MM-DD) of "tonight" per the grave-shift rollover rule
 * (a grave shift runs 11pm->7am and is named after the day it begins; the
 * active date doesn't advance until ~8:30am — see dateUtils.currentShiftDate).
 */
export function tonightDateISO(now: Date = new Date()): string {
  return formatLocalDateISO(currentShiftDate(now));
}

/** True if a work item's due_date falls on or before tonight's grave-shift date. */
export function isDueTonightOrEarlier(dueDateISO: string | null, now: Date = new Date()): boolean {
  if (!dueDateISO) return false;
  return dueDateISO <= tonightDateISO(now);
}
