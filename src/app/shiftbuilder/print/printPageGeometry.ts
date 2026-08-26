import { GOLDEN_HEIGHT_PX, GOLDEN_WIDTH_PX } from "./goldenConstants";
import {
  PLANNER_NOTES_FLOOR_PX,
  PLANNER_NOTES_PREF_PX,
  PORTRAIT_HEIGHT_PX,
  PORTRAIT_WIDTH_PX,
} from "./portraitConstants";

export type PrintSheetOrientation = "landscape" | "portrait";

export function printPageOrientation(kind: string): PrintSheetOrientation {
  return kind === "planner" ? "portrait" : "landscape";
}

export function printArtboardSizePx(kind: string): { width: number; height: number } {
  if (kind === "planner") {
    return { width: PORTRAIT_WIDTH_PX, height: PORTRAIT_HEIGHT_PX };
  }
  return { width: GOLDEN_WIDTH_PX, height: GOLDEN_HEIGHT_PX };
}

export type PlannerRosterDensity = "roomy" | "pack" | "dense";

/** Named people on the left rail (write-in hairlines do not count). */
export function plannerRosterNameCount(
  groups: ReadonlyArray<{ rows: ReadonlyArray<unknown> }>,
): number {
  return groups.reduce((sum, group) => sum + group.rows.length, 0);
}

/**
 * Row/gap tightening for a long TM rail. Names stay 11px; we shrink
 * padding and group write-ins before touching type.
 */
export function plannerRosterDensity(nameCount: number): PlannerRosterDensity {
  if (nameCount >= 22) return "dense";
  if (nameCount >= 16) return "pack";
  return "roomy";
}

/** Extra blank name lines under each band. Dense nights keep leftover in the ruled filler. */
export function plannerRosterWriteinLines(nameCount: number): number {
  if (nameCount >= 22) return 0;
  if (nameCount >= 16) return 1;
  return 2;
}

/**
 * Ruled notes height. Preferred when the rail is short; yields so a
 * full-grave + overlap roster stays on one Letter page.
 */
export function plannerNotesBandPx(nameCount: number): number {
  const over = Math.max(0, nameCount - 12);
  return Math.max(PLANNER_NOTES_FLOOR_PX, PLANNER_NOTES_PREF_PX - over * 8);
}
