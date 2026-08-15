/**
 * Pure unit tests for Golden PDF export placement + page assembly.
 * (No DOM / html-to-image — those run via /shiftbuilder/dev/export-debug.)
 */
import { describe, expect, it } from "vitest";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import type { PrintConfig } from "@/app/shiftbuilder/components/PrintCommandCenter";
import { MARGIN_ZOOM } from "@/app/shiftbuilder/components/PrintCommandCenter";
import { assembleGoldenPrintPages } from "@/app/shiftbuilder/print/assemblePages";
import { LETTER_LANDSCAPE_PT } from "@/app/shiftbuilder/print/goldenConstants";
import {
  getPrintImagePlacementPt,
  getPrintZoom,
} from "@/app/shiftbuilder/print/printSession";
import {
  goldenRasterScale,
  goldenRasterScaleForClient,
} from "@/app/shiftbuilder/print/rasterPrep";
import { buildPdfBlobFromRasterPages } from "@/app/shiftbuilder/print/exportPdf";
import {
  editableTmPdfFieldName,
  mapEditableTmFieldToPdf,
  type EditablePdfTmField,
} from "@/app/shiftbuilder/print/editablePdfFields";

const baseConfig = (over: Partial<PrintConfig> = {}): PrintConfig => ({
  days: Array.from({ length: 7 }, (_, i) => ({
    dayIndex: i,
    printDeploy: i === 0,
    printBreaks: i === 0,
    inOverview: false,
  })),
  pageOrder: "paired",
  margins: "narrow",
  includeOverview: false,
  overviewPosition: "last",
  includeCoverPage: false,
  coverPagePosition: "first",
  customQueueOrder: null,
  printVariant: "official",
  includeShiftNotes: true,
  planningBlankSlate: false,
  includeTimestamp: true,
  editableTmNames: false,
  ...over,
});

const dayDefs = Array.from({ length: 7 }, (_, i) => ({
  index: i,
  name: `Day${i}`,
  short: `D${i}`,
  dateNum: 10 + i,
  monthYear: "Jul 2026",
  color: "#000",
  date: new Date(2026, 6, 10 + i),
  isToday: false,
})) as DayDef[];

describe("Golden PDF placement (undistorted inside browser margins)", () => {
  it("centers narrow-margin zoomed sheet inside landscape letter", () => {
    const p = getPrintImagePlacementPt(baseConfig({ margins: "narrow" }));
    expect(p.width).toBeGreaterThan(0);
    expect(p.height).toBeGreaterThan(0);
    expect(p.x + p.width).toBeLessThanOrEqual(LETTER_LANDSCAPE_PT.width + 0.01);
    expect(p.y + p.height).toBeLessThanOrEqual(LETTER_LANDSCAPE_PT.height + 0.01);
    expect(p.x).toBeCloseTo((LETTER_LANDSCAPE_PT.width - p.width) / 2, 1);
    expect(p.y).toBeCloseTo((LETTER_LANDSCAPE_PT.height - p.height) / 2, 1);
  });

  it("none margin fills letter edge-to-edge", () => {
    const p = getPrintImagePlacementPt(baseConfig({ margins: "none" }));
    expect(p.x).toBeCloseTo(0, 5);
    expect(p.y).toBeCloseTo(0, 5);
    expect(p.width).toBeCloseTo(LETTER_LANDSCAPE_PT.width, 5);
    expect(p.height).toBeCloseTo(LETTER_LANDSCAPE_PT.height, 5);
  });

  it("wide margin leaves larger inset than narrow", () => {
    const narrow = getPrintImagePlacementPt(baseConfig({ margins: "narrow" }));
    const wide = getPrintImagePlacementPt(baseConfig({ margins: "wide" }));
    expect(wide.x).toBeGreaterThan(narrow.x);
    expect(wide.width).toBeLessThan(narrow.width);
    expect(getPrintZoom(baseConfig({ margins: "wide" }))).toBe(MARGIN_ZOOM.wide);
  });

  it("preserves the landscape-letter aspect ratio for every margin setting", () => {
    for (const margins of ["none", "narrow", "normal", "wide"] as const) {
      const p = getPrintImagePlacementPt(baseConfig({ margins }));
      expect(p.width / p.height).toBeCloseTo(
        LETTER_LANDSCAPE_PT.width / LETTER_LANDSCAPE_PT.height,
        8,
      );
    }
  });
});

describe("editable TM PDF fields", () => {
  const field: EditablePdfTmField = {
    slotKey: "Z10",
    value: "Taylor Example",
    xPx: 105.6,
    yPx: 81.6,
    widthPx: 211.2,
    heightPx: 40.8,
    fontSizePx: 16,
    color: "#111111",
    textAlign: "left",
  };

  it("maps Golden artboard rectangles into the placed PDF image", () => {
    const mapped = mapEditableTmFieldToPdf(field, {
      x: 18,
      y: 18,
      width: 756,
      height: 584,
    });
    expect(mapped.x).toBeCloseTo(93.6, 5);
    expect(mapped.y).toBeCloseTo(76.4, 5);
    expect(mapped.width).toBeCloseTo(151.2, 5);
    expect(mapped.height).toBeCloseTo(29.2, 5);
    expect(mapped.fontSize).toBeCloseTo(11.45, 2);
  });

  it("creates stable, PDF-safe field names per page and occurrence", () => {
    expect(editableTmPdfFieldName(0, 0, "Z10")).toBe("tm_1_Z10_1");
    expect(editableTmPdfFieldName(1, 2, "OL PM/1")).toBe(
      "tm_2_OL_PM_1_3",
    );
  });

  it("emits real AcroForm fields with prefilled TM values", async () => {
    const { default: sharp } = await import("sharp");
    const png = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 3,
        background: "#ffffff",
      },
    })
      .png()
      .toBuffer();
    const onePixelPng = `data:image/png;base64,${png.toString("base64")}`;
    const blob = await buildPdfBlobFromRasterPages(
      [
        {
          dataUrl: onePixelPng,
          format: "PNG",
          editableTmFields: [field],
        },
      ],
      baseConfig({ margins: "none", editableTmNames: true }),
    );
    const pdfText = Buffer.from(await blob.arrayBuffer()).toString("latin1");
    expect(pdfText).toContain("/AcroForm");
    expect(pdfText).toContain("/DR 2 0 R");
    expect(pdfText).toMatch(/\/DA \(\/F\d+ [\d.]+ Tf 0 g\)/);
    expect(pdfText).toContain("(tm_1_Z10_1)");
    expect(pdfText).toContain("(Taylor Example)");
  });
});

describe("assembleGoldenPrintPages", () => {
  it("emits deploy then breaks in paired order", () => {
    const config = baseConfig();
    const pages = assembleGoldenPrintPages({
      config,
      dayDefs,
      capturedPages: new Map([
        [
          0,
          {
            deployHTML: '<div class="print-artboard">D</div>',
            breaksHTML: '<div class="print-artboard">B</div>',
          },
        ],
      ]),
      activeDays: config.days.filter((d) => d.printDeploy || d.printBreaks),
      coverHTML: null,
      overviewHTML: null,
    });
    expect(pages.map((p) => p.key)).toEqual(["0-d", "0-b"]);
    expect(pages.map((p) => p.kind)).toEqual(["deploy", "breaks"]);
  });

  it("omits cover/overview when HTML is null", () => {
    const config = baseConfig({ includeCoverPage: true, includeOverview: true });
    const pages = assembleGoldenPrintPages({
      config,
      dayDefs,
      capturedPages: new Map([
        [0, { deployHTML: '<div class="print-artboard">D</div>' }],
      ]),
      activeDays: [
        { dayIndex: 0, printDeploy: true, printBreaks: false, inOverview: false },
      ],
      coverHTML: null,
      overviewHTML: null,
    });
    expect(pages.map((p) => p.key)).toEqual(["0-d"]);
  });
});

describe("goldenRasterScale", () => {
  it("steps down DPI for long jobs", () => {
    expect(goldenRasterScale(2)).toBe(2);
    expect(goldenRasterScale(8)).toBe(1.75);
    expect(goldenRasterScale(14)).toBe(1.5);
  });

  it("caps Safari and iPad raster work while preserving desktop Chromium quality", () => {
    const safari = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.5 Safari/605.1.15";
    const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";
    const ipadDesktop = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.5 Safari/605.1.15";
    expect(goldenRasterScaleForClient(2, safari)).toBe(1.5);
    expect(goldenRasterScaleForClient(2, ipadDesktop, 5)).toBe(1.5);
    expect(goldenRasterScaleForClient(2, chrome)).toBe(2);
  });
});
