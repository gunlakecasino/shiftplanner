import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { PrintConfig, PrintDayConfig } from "../components/PrintCommandCenter";
import type { DraftAssignmentRow } from "../components/placementFitForSlot";
import { assembleGoldenPrintPages } from "./assemblePages";
import {
  capturePrintPreviewPages,
  type LiveBoardOverlaysByDay,
} from "./assemblePrintPreviewPages";

/**
 * Data-driven Golden print pages — rendered client-side (createRoot + flushSync).
 */
export async function generatePrintPreviewGoldenPages(args: {
  config: PrintConfig;
  dayDefs: DayDef[];
  activeDays: PrintDayConfig[];
  coverHTML: string | null;
  overviewHTML: string | null;
  liveOverlaysByDay?: LiveBoardOverlaysByDay;
  draftAssignments?: Record<string, DraftAssignmentRow>;
  isDraftMode?: boolean;
  onProgress?: (label: string) => void;
}): Promise<ReturnType<typeof assembleGoldenPrintPages>> {
  const captured = await capturePrintPreviewPages({
    dayDefs: args.dayDefs,
    activeDays: args.activeDays,
    config: args.config,
    liveOverlaysByDay: args.liveOverlaysByDay,
    draftAssignments: args.draftAssignments,
    isDraftMode: args.isDraftMode,
    onProgress: args.onProgress,
  });

  return assembleGoldenPrintPages({
    config: args.config,
    dayDefs: args.dayDefs,
    capturedPages: captured,
    activeDays: args.activeDays,
    coverHTML: args.coverHTML,
    overviewHTML: args.overviewHTML,
  });
}