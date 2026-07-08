"use client";

import React, { useMemo } from "react";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { ActiveBreakGroupFilter } from "@/lib/shiftbuilder/constants";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import type { DraftAssignmentRow } from "../components/placementFitForSlot";
import type { LiveBoardOverlay } from "./mergePrintSnapshot";
import {
  LivePrintPreviewArtboard,
  type PrintPreviewFocus,
} from "./LivePrintPreviewArtboard";
import {
  PrintPreviewScaledSheet,
  printPreviewStageHeight,
  printPreviewStageWidth,
} from "./PrintPreviewScaledSheet";
import {
  duplexNightPageLabel,
  pageLabelForQueueId,
  singleSheetPageLabel,
} from "./printPageLabels";
import type { PrintPreviewView, PrintVariant } from "./printPreviewTypes";
import { usePrintPreviewSnapshot } from "./usePrintPreviewSnapshot";

const SHEET_LABELS: Record<PrintPreviewView, { duplex: string; single: string }> = {
  deployment: { duplex: "FRONT — DEPLOYMENT", single: "DEPLOYMENT" },
  breaks: { duplex: "BACK — BREAKS", single: "BREAKS" },
};

export type PrintPreviewStageProps = {
  selectedDay: DayDef;
  selectedDayIndex: number;
  focus: PrintPreviewFocus;
  breakGroup: ActiveBreakGroupFilter;
  weekDayDefs: DayDef[];
  isDraftMode: boolean;
  draftAssignments: Record<string, DraftAssignmentRow>;
  /** Live board state for the active night (custom aux, optimistic assignments, tasks). */
  liveAssignments?: Record<
    string,
    { tmId?: string; tmName?: string; breakGroup?: number; isLocked?: boolean }
  >;
  liveAuxDefs?: AuxDef[];
  liveTasksBySlot?: Record<string, NightSlotTask[]>;
  /** Optional queue context when opened from Print Command Center eye icon. */
  queuePageId?: string | null;
  queueIds?: string[] | null;
  printVariant?: PrintVariant;
  includeShiftNotes?: boolean;
  planningBlankSlate?: boolean;
  includeTimestamp?: boolean;
  liveNotes?: string;
};

function viewsForFocus(focus: PrintPreviewFocus): PrintPreviewView[] {
  if (focus === "duplex") return ["deployment", "breaks"];
  return [focus === "breaks" ? "breaks" : "deployment"];
}

function pageLabelForView(
  view: PrintPreviewView,
  focus: PrintPreviewFocus,
  selectedDayIndex: number,
  queuePageId: string | null | undefined,
  queueIds: string[] | null | undefined,
): string {
  if (queueIds?.length) {
    const id =
      focus === "duplex"
        ? view === "deployment"
          ? `${selectedDayIndex}-d`
          : `${selectedDayIndex}-b`
        : queuePageId ??
          (view === "deployment" ? `${selectedDayIndex}-d` : `${selectedDayIndex}-b`);
    if (queueIds.includes(id)) {
      return pageLabelForQueueId(queueIds, id);
    }
  }
  if (focus === "duplex") return duplexNightPageLabel(view);
  return singleSheetPageLabel();
}

export function PrintPreviewStage({
  selectedDay,
  selectedDayIndex,
  focus,
  breakGroup,
  weekDayDefs,
  isDraftMode,
  draftAssignments,
  liveAssignments,
  liveAuxDefs,
  liveTasksBySlot,
  queuePageId,
  queueIds,
  printVariant = "official",
  includeShiftNotes = true,
  planningBlankSlate = false,
  includeTimestamp = true,
  liveNotes,
}: PrintPreviewStageProps) {
  const views = useMemo(() => viewsForFocus(focus), [focus]);
  const stageW = printPreviewStageWidth(views.length === 2 ? 2 : 1);
  const stageH = printPreviewStageHeight();

  const liveBoard = useMemo((): LiveBoardOverlay | null => {
    if (
      liveAssignments == null ||
      liveAuxDefs == null ||
      liveTasksBySlot == null
    ) {
      return null;
    }
    return {
      assignments: liveAssignments,
      auxDefs: liveAuxDefs,
      tasksBySlot: liveTasksBySlot,
      ...(liveNotes !== undefined ? { notes: liveNotes } : {}),
    };
  }, [liveAssignments, liveAuxDefs, liveTasksBySlot, liveNotes]);

  const { snapshot, loading, error } = usePrintPreviewSnapshot({
    day: selectedDay,
    dayIndex: selectedDayIndex,
    enabled: true,
    isDraftMode,
    draftAssignments,
    liveBoard,
  });

  if (loading || !snapshot) {
    return (
      <div
        style={{
          width: stageW,
          minHeight: stageH,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 8,
          margin: "0 auto",
        }}
      >
        <div
          className="print-artboard flex items-center justify-center text-sm text-[#6B7280]"
          style={{ width: 1056, height: 816 }}
        >
          {error ? `Preview failed: ${error}` : "Loading print preview…"}
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: stageW,
        minHeight: stageH,
        display: "flex",
        gap: 20,
        justifyContent: "center",
        alignItems: "flex-start",
        paddingTop: 8,
        margin: "0 auto",
      }}
    >
      {views.map((view) => {
        const chrome = SHEET_LABELS[view];
        const sheetChromeLabel = focus === "duplex" ? chrome.duplex : chrome.single;

        return (
          <PrintPreviewScaledSheet key={view} label={sheetChromeLabel}>
            <LivePrintPreviewArtboard
              view={view}
              snapshot={snapshot}
              breakGroup={breakGroup}
              weekDayDefs={weekDayDefs}
              printVariant={printVariant}
              includeShiftNotes={includeShiftNotes}
              planningBlankSlate={planningBlankSlate}
              includeTimestamp={includeTimestamp}
            />
          </PrintPreviewScaledSheet>
        );
      })}
    </div>
  );
}

export default PrintPreviewStage;