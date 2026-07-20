"use client";

import React, { useEffect, useRef } from "react";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { ActiveBreakGroupFilter } from "@/lib/shiftbuilder/constants";
import { postProcessBreaksArtboard } from "./breaksArtboard";
import { postProcessOfficialDeploymentArtboard } from "./deploymentPrintLayout";
import { PrintPreviewPage } from "./PrintPreviewPage";
import type { PrintDaySnapshot, PrintPreviewView, PrintVariant } from "./printPreviewTypes";

export type PrintPreviewFocus = "duplex" | "deployment" | "breaks";

export type LivePrintPreviewArtboardProps = {
  view: PrintPreviewView;
  snapshot: PrintDaySnapshot;
  breakGroup: ActiveBreakGroupFilter;
  weekDayDefs: DayDef[];
  printVariant?: PrintVariant;
  includeShiftNotes?: boolean;
  planningBlankSlate?: boolean;
  includeTimestamp?: boolean;
};

/**
 * On-canvas print preview — one Golden sheet. Snapshot is loaded once per night
 * by PrintPreviewStage (Supabase-backed, same as export/print).
 */
export function LivePrintPreviewArtboard({
  view,
  snapshot,
  breakGroup,
  weekDayDefs,
  printVariant = "official",
  includeShiftNotes = true,
  planningBlankSlate = false,
  includeTimestamp = true,
}: LivePrintPreviewArtboardProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  const activeBreakGroup: 1 | 2 | 3 | 4 =
    breakGroup === 1 || breakGroup === 2 || breakGroup === 3 || breakGroup === 4
      ? breakGroup
      : 1;

  useEffect(() => {
    if (!hostRef.current) return;
    let cancelled = false;
    const run = () => {
      if (cancelled || !hostRef.current) return;
      const artboard = hostRef.current.querySelector(".print-artboard");
      if (!artboard) return;
      if (artboard.classList.contains("sb-graves-sheet")) return;
      if (view === "breaks") {
        postProcessBreaksArtboard(artboard);
      } else if (printVariant === "official") {
        postProcessOfficialDeploymentArtboard(artboard);
      }
    };
    requestAnimationFrame(() => requestAnimationFrame(run));
    return () => {
      cancelled = true;
    };
  }, [view, snapshot, printVariant]);

  return (
    <div ref={hostRef}>
      <PrintPreviewPage
        view={view}
        snapshot={snapshot}
        weekDayDefs={weekDayDefs}
        activeBreakGroup={activeBreakGroup}
        printVariant={printVariant}
        includeShiftNotes={includeShiftNotes}
        planningBlankSlate={planningBlankSlate}
        printedAt={new Date().toISOString()}
        includeTimestamp={includeTimestamp}
      />
    </div>
  );
}

export default LivePrintPreviewArtboard;
