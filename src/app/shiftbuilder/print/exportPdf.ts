import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { getFontEmbedCSS } from "html-to-image";
import type { PrintConfig } from "../components/PrintCommandCenter";
import type { GoldenPrintPage } from "./assemblePages";
import { goldenRasterScaleForClient, prepareExportSessionForRaster } from "./rasterPrep";
import { rasterizeGoldenArtboardElement } from "./goldenExportDocument";
import {
  getPrintImagePlacementPt,
  mountGoldenPrintSession,
  type GoldenPrintSession,
  waitForGoldenRenderSettled,
} from "./printSession";
import { GOLDEN_HEIGHT_PX, GOLDEN_WIDTH_PX } from "./goldenConstants";

export type ExportProgress = {
  current: number;
  total: number;
  label: string;
};

export type GoldenRasterPage = { dataUrl: string; format: "PNG" | "JPEG" };

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Match browser print: fit the full Golden page inside the selected margins. */
export function getGoldenPdfPlacement(config: PrintConfig): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return getPrintImagePlacementPt(config);
}

export function triggerPdfDownload(blob: Blob, filename: string): void {
  const legacyNavigator = navigator as Navigator & {
    msSaveOrOpenBlob?: (data: Blob, defaultName?: string) => boolean;
  };
  if (typeof legacyNavigator.msSaveOrOpenBlob === "function") {
    legacyNavigator.msSaveOrOpenBlob(blob, filename);
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.rel = "noopener";
  if (typeof a.download === "string") {
    a.download = filename;
  } else {
    a.setAttribute("target", "_blank");
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
  // WebKit resolves blob URLs after the synthetic click returns. Immediate
  // revocation produces blank/corrupt documents in Safari and iPadOS.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function dayFilename(
  dayIndex: number,
  dayDefs: DayDef[],
  printVariant: PrintConfig["printVariant"] = "official",
): string {
  const def = dayDefs[dayIndex];
  if (!def) return `Graves-Day-${dayIndex}.pdf`;
  const base = `Graves-${def.short}-${String(def.dateNum).padStart(2, "0")}`;
  return printVariant === "planning" ? `${base}-Planning.pdf` : `${base}.pdf`;
}

/** Build a landscape-letter PDF from pre-rasterized Golden pages (exact page count). */
export async function buildPdfBlobFromRasterPages(
  rasterPages: GoldenRasterPage[],
  config: PrintConfig,
): Promise<Blob> {
  const placement = getGoldenPdfPlacement(config);
  const { default: jsPDF } = await import("jspdf");
  const pdf = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "letter",
    compress: true,
    precision: 16,
  });
  rasterPages.forEach((page, idx) => {
    if (idx > 0) pdf.addPage();
    pdf.addImage(
      page.dataUrl,
      page.format,
      placement.x,
      placement.y,
      placement.width,
      placement.height,
    );
  });
  return pdf.output("blob");
}

/** Mount captured Golden HTML in the live app DOM and rasterize one sheet at a time. */
export async function rasterizeGoldenPrintPages(
  pages: GoldenPrintPage[],
  config: PrintConfig,
  onProgress?: (p: ExportProgress) => void,
): Promise<GoldenRasterPage[]> {
  const session = await mountGoldenPrintSession(pages, config, "export");

  try {
    prepareExportSessionForRaster(session);
    await waitForGoldenRenderSettled();

    const artboards = Array.from(
      session.container.querySelectorAll(
        ":scope > .print-page-wrapper > .print-artboard",
      ),
    ) as HTMLElement[];

    if (artboards.length !== pages.length) {
      throw new Error(
        `Golden export: expected ${pages.length} artboards, found ${artboards.length}`,
      );
    }

    const pixelRatio = goldenRasterScaleForClient(
      pages.length,
      navigator.userAgent,
      navigator.maxTouchPoints,
    );
    const usePng = pages.length <= 8;
    const out: GoldenRasterPage[] = [];
    const fontEmbedCss = await withTimeout(
      getFontEmbedCSS(artboards[0], {
        cacheBust: false,
        preferredFontFormat: "woff2",
      }),
      15_000,
      "Print fonts took too long to prepare. Please retry.",
    );

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      onProgress?.({
        current: i + 1,
        total: pages.length,
        label: `Rendering sheet ${i + 1} of ${pages.length}…`,
      });

      artboards.forEach((ab, j) => {
        ab.style.display = j === i ? "flex" : "none";
        ab.style.visibility = j === i ? "visible" : "hidden";
      });
      session.container.style.height = `${GOLDEN_HEIGHT_PX}px`;
      // Force a layout + paint pass for the newly-shown artboard before capture.
      artboards[i].getBoundingClientRect();
      await waitForGoldenRenderSettled();

      const raster = await withTimeout(
        rasterizeGoldenArtboardElement({
          artboard: artboards[i],
          kind: page.kind,
          pixelRatio,
          usePng,
          fontEmbedCss,
        }),
        30_000,
        `Sheet ${i + 1} took too long to render. Please retry.`,
      );

      if (typeof window !== "undefined") {
        console.info("[shiftbuilder export]", {
          page: i + 1,
          key: page.key,
          kind: page.kind,
          rasterPx: `${raster.width}×${raster.height}`,
          goldenPx: `${GOLDEN_WIDTH_PX}×${GOLDEN_HEIGHT_PX}`,
          pixelRatio,
          source: "live-dom",
        });
      }

      out.push({ dataUrl: raster.dataUrl, format: raster.format });
    }

    return out;
  } finally {
    session.cleanup();
  }
}

export type ExportGoldenPdfResult = {
  filename: string;
  usedZip: boolean;
};

/**
 * Mount Golden pages in the live app DOM (same path as Print) → rasterize → PDF/ZIP.
 */
export async function exportGoldenPdf(args: {
  session?: GoldenPrintSession;
  pages?: GoldenPrintPage[];
  config: PrintConfig;
  dayDefs: DayDef[];
  onProgress?: (p: ExportProgress) => void;
}): Promise<ExportGoldenPdfResult> {
  const pages = args.pages ?? args.session?.pages ?? [];

  if (pages.length === 0) {
    throw new Error("Nothing to export");
  }

  const rasterPages = await rasterizeGoldenPrintPages(pages, args.config, args.onProgress);
  const buildBlob = (slices: GoldenRasterPage[]) =>
    buildPdfBlobFromRasterPages(slices, args.config);

  const activeDayConfigs = args.config.days.filter((d) => d.printDeploy || d.printBreaks);
  const uniqueDayIndices = [...new Set(activeDayConfigs.map((d) => d.dayIndex))];
  const useZip = uniqueDayIndices.length > 1;
  const coverIdx = pages.findIndex((p) => p.key === "__cover");
  const overviewIdx = pages.findIndex((p) => p.key === "__overview");

  if (useZip) {
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    for (const dayIdx of uniqueDayIndices.sort((a, b) => a - b)) {
      const indices = pages
        .map((p, idx) => ({ p, idx }))
        .filter(({ p }) => p.key === `${dayIdx}-d` || p.key === `${dayIdx}-b`)
        .map(({ idx }) => idx);
      if (indices.length === 0) continue;
      zip.file(
        dayFilename(dayIdx, args.dayDefs, args.config.printVariant),
        await buildBlob(indices.map((i) => rasterPages[i])),
      );
    }
    if (coverIdx >= 0) {
      zip.file("Graves-Cover.pdf", await buildBlob([rasterPages[coverIdx]]));
    }
    if (overviewIdx >= 0) {
      zip.file("Graves-Overview.pdf", await buildBlob([rasterPages[overviewIdx]]));
    }

    const zipBlob = await zip.generateAsync({ type: "blob" });
    triggerPdfDownload(zipBlob, "Graves-Schedule-Export.zip");
    return { filename: "Graves-Schedule-Export.zip", usedZip: true };
  }

  const blob = await buildBlob(rasterPages);
  let filename = "Graves-Export.pdf";
  if (uniqueDayIndices.length === 1) {
    filename = dayFilename(uniqueDayIndices[0], args.dayDefs, args.config.printVariant);
  } else if (coverIdx >= 0 || overviewIdx >= 0) {
    filename = "Graves-Schedule-Export.pdf";
  }
  triggerPdfDownload(blob, filename);
  return { filename, usedZip: false };
}
