import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { PrintConfig, PrintDayConfig } from "../components/PrintCommandCenter";
import { shiftBuilderVersionLabel } from "../version";
import { buildPrintDaySnapshot } from "./buildPrintDaySnapshot";
import { renderPrintPreviewHtml } from "./renderPrintPreviewHtml";
import { assembleGoldenPrintPages, type GoldenPrintPage } from "./assemblePages";

export type PrintPreviewCaptured = Map<number, { deployHTML?: string; breaksHTML?: string }>;

function pageLabel(dayIndex: number, view: "deployment" | "breaks"): string {
  const n = view === "deployment" ? dayIndex * 2 + 1 : dayIndex * 2 + 2;
  return `— ${n} of 14 —`;
}

export async function capturePrintPreviewPages(args: {
  dayDefs: DayDef[];
  activeDays: PrintDayConfig[];
  onProgress?: (label: string) => void;
}): Promise<PrintPreviewCaptured> {
  const { dayDefs, activeDays, onProgress } = args;
  const dayIndices = [...new Set(activeDays.map((d) => d.dayIndex))].sort((a, b) => a - b);
  const captured: PrintPreviewCaptured = new Map();
  const versionLabel = shiftBuilderVersionLabel();

  for (const dayIdx of dayIndices) {
    const def = dayDefs[dayIdx];
    if (!def) continue;
    const dayConf = activeDays.find((d) => d.dayIndex === dayIdx);
    if (!dayConf) continue;

    onProgress?.(`Loading ${def.name}…`);
    const snapshot = await buildPrintDaySnapshot(def, dayIdx);
    const entry: { deployHTML?: string; breaksHTML?: string } = {};

    if (dayConf.printDeploy) {
      onProgress?.(`Rendering ${def.name} deploy…`);
      entry.deployHTML = renderPrintPreviewHtml({
        view: "deployment",
        snapshot,
        pageLabel: pageLabel(dayIdx, "deployment"),
        versionLabel,
        weekDayDefs: dayDefs,
      });
    }
    if (dayConf.printBreaks) {
      onProgress?.(`Rendering ${def.name} breaks…`);
      entry.breaksHTML = renderPrintPreviewHtml({
        view: "breaks",
        snapshot,
        pageLabel: pageLabel(dayIdx, "breaks"),
        versionLabel,
        weekDayDefs: dayDefs,
      });
    }

    captured.set(dayIdx, entry);
  }

  return captured;
}

export function mergePrintPreviewIntoGoldenPages(
  config: PrintConfig,
  captured: PrintPreviewCaptured,
  activeDays: PrintDayConfig[],
  coverHTML: string | null,
  overviewHTML: string | null,
): GoldenPrintPage[] {
  return assembleGoldenPrintPages({
    config,
    capturedPages: captured,
    activeDays,
    coverHTML,
    overviewHTML,
  });
}