import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import {
  buildPdfBlobFromRasterPages,
  rasterizeGoldenPrintPages,
  triggerPdfDownload,
  type ExportProgress,
} from "@/app/shiftbuilder/print/exportPdf";
import { tonightPrintConfig } from "@/app/shiftbuilder/print/printConfigUtils";
import {
  captureTodayDualSheets,
  type CaptureTodaySheetsOptions,
  type TodayBoardView,
} from "./printTodaySchedule";

export type ExportTodayPdfResult =
  | { ok: true; filename: string }
  | { ok: false; reason: string };

export type ExportTodaySchedulePdfOptions = {
  currentView: TodayBoardView;
  setCurrentView: (view: TodayBoardView) => void;
  onSlotClose?: () => void;
  selectedDayIndex: number;
  dayDefs: DayDef[];
  onProgress?: (p: ExportProgress) => void;
};

function dayFilename(dayIndex: number, dayDefs: DayDef[]): string {
  const def = dayDefs[dayIndex];
  if (!def) return `Graves-Day-${dayIndex}.pdf`;
  return `Graves-${def.short}-${String(def.dateNum).padStart(2, "0")}.pdf`;
}

/** Reject all-white rasters (iframe path could pass size checks with empty sheets). */
async function isRasterMostlyBlank(dataUrl: string): Promise<boolean> {
  if (dataUrl.length < 12_000) return true;

  const img = await new Promise<HTMLImageElement | null>((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve(probe);
    probe.onerror = () => resolve(null);
    probe.src = dataUrl;
  });
  if (!img) return true;

  const canvas = document.createElement("canvas");
  const sampleW = 64;
  const sampleH = 48;
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, sampleW, sampleH);
  const data = ctx.getImageData(0, 0, sampleW, sampleH).data;

  let ink = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r < 245 || g < 245 || b < 245) ink += 1;
  }

  return ink < 24;
}

/**
 * Capture deployment + breaks HTML, mount in the live DOM (same path as Print), rasterize → 2-page PDF.
 * Iframe rasterization dropped break-sheet layout; live DOM matches browser print fidelity.
 */
export async function exportTodaySchedulePdf(
  options: ExportTodaySchedulePdfOptions,
): Promise<ExportTodayPdfResult> {
  const captureOpts: CaptureTodaySheetsOptions = {
    currentView: options.currentView,
    setCurrentView: options.setCurrentView,
    onSlotClose: options.onSlotClose,
    dayIndex: options.selectedDayIndex,
  };

  document.body.classList.add("sb-print-export-busy");

  try {
    options.onProgress?.({ current: 0, total: 2, label: "Capturing sheets…" });

    const captured = await captureTodayDualSheets(captureOpts);
    if (!captured.ok) {
      return captured;
    }

    const pages = captured.pages;
    if (pages.length !== 2) {
      return { ok: false, reason: "Expected deployment + breaks sheets" };
    }

    const config = tonightPrintConfig(options.selectedDayIndex);

    const rasterPages = await rasterizeGoldenPrintPages(pages, config, (p) => {
      options.onProgress?.(p);
    });

    for (let i = 0; i < rasterPages.length; i++) {
      const page = pages[i];
      if (await isRasterMostlyBlank(rasterPages[i].dataUrl)) {
        const label = page.kind === "breaks" ? "break sheet" : "deployment sheet";
        return {
          ok: false,
          reason: `Couldn't render ${label} — try Print → Save as PDF`,
        };
      }
    }

    const filename = dayFilename(options.selectedDayIndex, options.dayDefs);
    const blob = await buildPdfBlobFromRasterPages(rasterPages, config);
    triggerPdfDownload(blob, filename);

    return { ok: true, filename };
  } catch (e) {
    console.error("[today] PDF export error", e);
    const message = e instanceof Error ? e.message : "PDF export failed — try again";
    return { ok: false, reason: message };
  } finally {
    document.body.classList.remove("sb-print-export-busy", "printing-dual-mode", "golden-export-raster");
    document.querySelector(".print-dual-container")?.remove();
    document.getElementById("__pcc-export-override")?.remove();
  }
}