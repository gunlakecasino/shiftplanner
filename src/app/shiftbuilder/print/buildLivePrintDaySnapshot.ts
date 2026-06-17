import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { computeBreakCounts } from "./buildPrintDaySnapshot";
import type { PrintDaySnapshot } from "./printPreviewTypes";

export type BuildLivePrintDaySnapshotArgs = {
  dayIndex: number;
  day: DayDef;
  assignments: Record<
    string,
    { tmId?: string; tmName?: string; breakGroup?: number; isLocked?: boolean }
  >;
  tasksBySlot: Record<string, NightSlotTask[]>;
  auxDefs: AuxDef[];
  amOverlapDayName: string;
  amOverlapDateNum: number;
  nextDayColor: string;
};

/** Build the same PrintDaySnapshot shape export uses, from live board state. */
export function buildLivePrintDaySnapshot(
  args: BuildLivePrintDaySnapshotArgs,
): PrintDaySnapshot {
  return {
    dayIndex: args.dayIndex,
    day: args.day,
    assignments: args.assignments,
    tasksBySlot: args.tasksBySlot,
    auxDefs: args.auxDefs,
    amOverlapDayName: args.amOverlapDayName,
    amOverlapDateNum: args.amOverlapDateNum,
    nextDayColor: args.nextDayColor,
    breakCounts: computeBreakCounts(args.assignments),
  };
}