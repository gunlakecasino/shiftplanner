"use client";

import React, { useMemo } from "react";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { BreakGroup } from "@/lib/shiftbuilder/constants";
import { useAssignments, useAuxDefs } from "../store/useShiftBuilderStore";
import { shiftBuilderVersionLabel } from "../version";
import { buildLivePrintDaySnapshot } from "./buildLivePrintDaySnapshot";
import { PrintPreviewPage } from "./PrintPreviewPage";
import type { PrintPreviewView } from "./printPreviewTypes";

function goldenPrintPageLabel(dayIndex: number, view: PrintPreviewView): string {
  const n = view === "deployment" ? dayIndex * 2 + 1 : dayIndex * 2 + 2;
  return `— ${n} of 14 —`;
}

export type LivePrintPreviewArtboardProps = {
  selectedDay: DayDef;
  selectedDayIndex: number;
  currentView: "deployment" | "breaks";
  selectedTasks: Record<string, NightSlotTask[]>;
  amOverlapDayName: string;
  amOverlapDateNum: number;
  nextDayColor: string;
  breakGroup: BreakGroup;
  weekDayDefs: DayDef[];
};

/**
 * On-canvas print preview — renders the exact same PrintPreviewPage component
 * that export/print uses (GoldenPrintComponents + print-artboard contract).
 */
export function LivePrintPreviewArtboard({
  selectedDay,
  selectedDayIndex,
  currentView,
  selectedTasks,
  amOverlapDayName,
  amOverlapDateNum,
  nextDayColor,
  breakGroup,
  weekDayDefs,
}: LivePrintPreviewArtboardProps) {
  const assignments = useAssignments() ?? {};
  const auxDefs = useAuxDefs() ?? [];

  const view: PrintPreviewView = currentView === "breaks" ? "breaks" : "deployment";
  const activeBreakGroup: 1 | 2 | 3 =
    breakGroup === 1 || breakGroup === 2 || breakGroup === 3 ? breakGroup : 1;

  const snapshot = useMemo(
    () =>
      buildLivePrintDaySnapshot({
        dayIndex: selectedDayIndex,
        day: selectedDay,
        assignments,
        tasksBySlot: selectedTasks,
        auxDefs,
        amOverlapDayName,
        amOverlapDateNum,
        nextDayColor,
      }),
    [
      selectedDayIndex,
      selectedDay,
      assignments,
      selectedTasks,
      auxDefs,
      amOverlapDayName,
      amOverlapDateNum,
      nextDayColor,
    ],
  );

  return (
    <PrintPreviewPage
      view={view}
      snapshot={snapshot}
      pageLabel={goldenPrintPageLabel(selectedDayIndex, view)}
      versionLabel={shiftBuilderVersionLabel()}
      weekDayDefs={weekDayDefs}
      activeBreakGroup={activeBreakGroup}
    />
  );
}

export default LivePrintPreviewArtboard;