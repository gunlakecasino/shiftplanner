import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { PrintConfig, PrintDayConfig } from "../components/PrintCommandCenter";
import {
  applyCustomQueueOrder,
  buildPrintQueue,
} from "./printConfigUtils";
import { shiftBuilderVersionLabel } from "../version";
import { buildPrintDaySnapshot } from "./buildPrintDaySnapshot";
import {
  applyDraftToPrintSnapshot,
  applyLiveBoardToPrintSnapshot,
  type LiveBoardOverlay,
} from "./mergePrintSnapshot";
import { pageLabelForQueueId } from "./printPageLabels";
import { renderPrintPreviewHtml } from "./renderPrintPreviewHtml";
import { assembleGoldenPrintPages, type GoldenPrintPage } from "./assemblePages";
import type { DraftAssignmentRow } from "../components/placementFitForSlot";

export type PrintPreviewCaptured = Map<number, { deployHTML?: string; breaksHTML?: string }>;

export type LiveBoardOverlaysByDay = Map<number, LiveBoardOverlay>;

export async function capturePrintPreviewPages(args: {
  dayDefs: DayDef[];
  activeDays: PrintDayConfig[];
  config: PrintConfig;
  /** Unsaved builder state for nights being printed (keyed by dayIndex). */
  liveOverlaysByDay?: LiveBoardOverlaysByDay;
  /** Optional draft overlay for the active night print. */
  draftAssignments?: Record<string, DraftAssignmentRow>;
  isDraftMode?: boolean;
  onProgress?: (label: string) => void;
}): Promise<PrintPreviewCaptured> {
  const {
    dayDefs,
    activeDays,
    config,
    liveOverlaysByDay,
    draftAssignments,
    isDraftMode,
    onProgress,
  } = args;
  const dayIndices = [...new Set(activeDays.map((d) => d.dayIndex))].sort((a, b) => a - b);
  const captured: PrintPreviewCaptured = new Map();
  const versionLabel = shiftBuilderVersionLabel();

  const printVariant = config.printVariant ?? "official";
  const includeShiftNotes = config.includeShiftNotes !== false;
  const planningBlankSlate = config.planningBlankSlate === true;

  const queueIds = applyCustomQueueOrder(
    buildPrintQueue(
      config.days,
      config.pageOrder,
      dayDefs,
      config.includeOverview,
      config.overviewPosition,
      config.includeCoverPage,
      config.coverPagePosition,
      printVariant,
    ),
    config.customQueueOrder ?? null,
  ).map((item) => item.id);

  for (const dayIdx of dayIndices) {
    const def = dayDefs[dayIdx];
    if (!def) continue;
    const dayConf = config.days.find((d) => d.dayIndex === dayIdx);
    if (!dayConf) continue;

    onProgress?.(`Loading ${def.name}…`);
    let snapshot = await buildPrintDaySnapshot(def, dayIdx);
    const liveOverlay = liveOverlaysByDay?.get(dayIdx);
    if (liveOverlay) {
      snapshot = applyLiveBoardToPrintSnapshot(snapshot, liveOverlay);
    }
    if (
      isDraftMode &&
      draftAssignments &&
      Object.keys(draftAssignments).length > 0
    ) {
      snapshot = applyDraftToPrintSnapshot(snapshot, draftAssignments);
    }
    const entry: { deployHTML?: string; breaksHTML?: string } = {};

    if (dayConf.printDeploy) {
      onProgress?.(`Rendering ${def.name} deploy…`);
      entry.deployHTML = renderPrintPreviewHtml({
        view: "deployment",
        snapshot,
        pageLabel: pageLabelForQueueId(queueIds, `${dayIdx}-d`),
        versionLabel,
        weekDayDefs: dayDefs,
        printVariant,
        includeShiftNotes,
        planningBlankSlate,
      });
    }
    if (dayConf.printBreaks) {
      onProgress?.(`Rendering ${def.name} breaks…`);
      entry.breaksHTML = renderPrintPreviewHtml({
        view: "breaks",
        snapshot,
        pageLabel: pageLabelForQueueId(queueIds, `${dayIdx}-b`),
        versionLabel,
        weekDayDefs: dayDefs,
        printVariant,
        includeShiftNotes,
        planningBlankSlate,
      });
    }

    captured.set(dayIdx, entry);
  }

  return captured;
}

export function mergePrintPreviewIntoGoldenPages(
  config: PrintConfig,
  dayDefs: DayDef[],
  captured: PrintPreviewCaptured,
  activeDays: PrintDayConfig[],
  coverHTML: string | null,
  overviewHTML: string | null,
): GoldenPrintPage[] {
  return assembleGoldenPrintPages({
    config,
    dayDefs,
    capturedPages: captured,
    activeDays,
    coverHTML,
    overviewHTML,
  });
}