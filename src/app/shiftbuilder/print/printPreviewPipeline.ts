import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { PrintConfig, PrintDayConfig } from "../components/PrintCommandCenter";
import { assembleGoldenPrintPages } from "./assemblePages";
import { capturePrintPreviewPages } from "./assemblePrintPreviewPages";

/**
 * Data-driven Golden print pages — rendered client-side (createRoot + flushSync).
 */
export async function generatePrintPreviewGoldenPages(args: {
  config: PrintConfig;
  dayDefs: DayDef[];
  activeDays: PrintDayConfig[];
  coverHTML: string | null;
  overviewHTML: string | null;
  onProgress?: (label: string) => void;
}): Promise<ReturnType<typeof assembleGoldenPrintPages>> {
  const captured = await capturePrintPreviewPages({
    dayDefs: args.dayDefs,
    activeDays: args.activeDays,
    onProgress: args.onProgress,
  });

  return assembleGoldenPrintPages({
    config: args.config,
    capturedPages: captured,
    activeDays: args.activeDays,
    coverHTML: args.coverHTML,
    overviewHTML: args.overviewHTML,
  });
}