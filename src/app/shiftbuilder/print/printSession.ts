import type { PrintConfig } from "../components/PrintCommandCenter";
import { MARGIN_VALUES, MARGIN_ZOOM } from "../components/PrintCommandCenter";
import { GOLDEN_HEIGHT_PX, GOLDEN_WIDTH_PX } from "./goldenConstants";
import { postProcessBreaksArtboard } from "./breaksArtboard";
import { postProcessOfficialDeploymentArtboard } from "./deploymentPrintLayout";

import type { GoldenPrintPage } from "./assemblePages";

export type GoldenPrintSessionMode = "print" | "export";

export type GoldenPrintSession = {
  container: HTMLDivElement;
  pages: GoldenPrintPage[];
  cleanup: () => void;
  /** Isolated iframe used for browser print (avoids sb-shiftbuilder viewport clipping). */
  printFrame?: HTMLIFrameElement | null;
};

export type GoldenRasterPrintPage = {
  dataUrl: string;
  format: "PNG" | "JPEG";
};

const STYLE_PRINT_ID = "__pcc-print-override";
const STYLE_EXPORT_ID = "__pcc-export-override";
const STYLE_GOLDEN_BUNDLE_ID = "__pcc-golden-print-bundle";

function ensureGoldenPrintBundleStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_GOLDEN_BUNDLE_ID)) return;
  const link = document.createElement("link");
  link.id = STYLE_GOLDEN_BUNDLE_ID;
  link.rel = "stylesheet";
  link.href = "/shiftbuilder-print-preview.css";
  document.head.appendChild(link);
}

function collectFontFaceCss(): string {
  let out = "";
  document.querySelectorAll("head style").forEach((node) => {
    const text = node.textContent || "";
    if (text.includes("@font-face")) out += text;
  });
  return out;
}

function getRootFontVars(): string {
  const cs = getComputedStyle(document.documentElement);
  const decls: string[] = [];
  for (const name of Array.from(cs)) {
    if (!name.startsWith("--font")) continue;
    const val = cs.getPropertyValue(name).trim();
    if (val) decls.push(`${name}:${val}`);
  }
  const ui = cs.getPropertyValue("--font-ui").trim();
  if (ui) decls.push(`--font-ui:${ui}`);
  return `:root{${decls.join(";")}}`;
}

function getAppStylesheetHrefs(): string[] {
  const hrefs = new Set<string>();
  document.querySelectorAll('link[rel="stylesheet"]').forEach((node) => {
    const href = (node as HTMLLinkElement).href;
    if (href) hrefs.add(href);
  });
  return [...hrefs];
}

async function waitForIframeAssets(doc: Document): Promise<void> {
  const links = [...doc.querySelectorAll('link[rel="stylesheet"]')] as HTMLLinkElement[];
  await Promise.all(
    links.map(
      (link) =>
        new Promise<void>((resolve) => {
          if (link.sheet) {
            resolve();
            return;
          }
          link.addEventListener("load", () => resolve(), { once: true });
          link.addEventListener("error", () => resolve(), { once: true });
          window.setTimeout(resolve, 5000);
        }),
    ),
  );
  await doc.fonts.ready;
}

function buildWrappedPagesHtml(pages: GoldenPrintPage[]): string {
  return pages
    .map(
      (p) =>
        `<div class="print-page-wrapper" data-print-key="${p.key}">${p.html}</div>`,
    )
    .join("");
}

function prepareMountedArtboards(
  container: HTMLDivElement,
  pages: GoldenPrintPage[],
): void {
  const artboards = Array.from(
    container.querySelectorAll(":scope > .print-page-wrapper > .print-artboard"),
  );
  if (artboards.length !== pages.length) {
    console.warn(
      `[shiftbuilder] Golden print session: expected ${pages.length} artboards, found ${artboards.length}`,
      { keys: pages.map((p) => p.key) },
    );
  }
  artboards.forEach((ab, i) => {
    const page = pages[i];
    if (!page) return;
    const el = ab as HTMLElement;
    el.setAttribute(
      "data-print-view",
      page.kind === "breaks" ? "breaks" : "deployment",
    );
    applyGoldenArtboardContract(el, page);
  });
}

function applyGoldenArtboardContract(
  artboard: HTMLElement,
  page: GoldenPrintPage,
): void {
  artboard.style.margin = "0";
  artboard.style.boxShadow = "none";
  artboard.style.boxSizing = "border-box";
  artboard.style.width = `${GOLDEN_WIDTH_PX}px`;
  artboard.style.height = `${GOLDEN_HEIGHT_PX}px`;
  artboard.style.minHeight = `${GOLDEN_HEIGHT_PX}px`;
  artboard.style.maxHeight = `${GOLDEN_HEIGHT_PX}px`;
  artboard.style.overflow = "hidden";
  artboard.style.zoom = "1";
  artboard.style.transform = "none";
  artboard.style.display = "flex";
  artboard.style.flexDirection = "column";

  if (artboard.classList.contains("sb-graves-sheet")) return;

  if (page.kind === "breaks" && artboard.getAttribute("data-print-view") === "breaks") {
    postProcessBreaksArtboard(artboard);
  } else if (
    page.kind === "deploy" &&
    artboard.getAttribute("data-print-view") === "deployment" &&
    artboard.getAttribute("data-print-variant") !== "planning"
  ) {
    postProcessOfficialDeploymentArtboard(artboard);
  }
}

function buildIframePrintOverrides(config: PrintConfig): string {
  const marginValue = MARGIN_VALUES[config.margins];
  const zoomValue = MARGIN_ZOOM[config.margins];
  const scaledHeight = GOLDEN_HEIGHT_PX * zoomValue;
  return `
    @page { size: letter landscape; margin: ${marginValue} !important; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      height: auto !important;
      max-height: none !important;
      overflow: visible !important;
    }
    .print-dual-container {
      display: block !important;
      width: auto !important;
      height: auto !important;
      overflow: visible !important;
      background: #ffffff !important;
    }
    .print-page-wrapper {
      display: block !important;
      position: relative !important;
      width: 100% !important;
      height: ${scaledHeight}px !important;
      max-width: 100% !important;
      margin: 0 !important;
      padding: 0;
      overflow: visible !important;
      page-break-after: always;
      break-after: page;
      break-inside: avoid;
    }
    .print-page-wrapper > .print-artboard {
      width: ${GOLDEN_WIDTH_PX}px !important;
      margin: 0 auto !important;
      contain: none !important;
      zoom: ${zoomValue} !important;
      transform: none !important;
      transform-origin: top center !important;
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .print-page-wrapper:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    @media print {
      html, body {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
      }
      .print-dual-container {
        overflow: visible !important;
        height: auto !important;
      }
      .print-page-wrapper {
        display: block !important;
        position: relative !important;
        width: 100% !important;
        max-width: 100% !important;
        page-break-after: always !important;
        break-after: page !important;
        break-inside: avoid !important;
      }
      .print-page-wrapper:last-child {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      .print-page-wrapper > .print-artboard {
        width: ${GOLDEN_WIDTH_PX}px !important;
        margin: 0 auto !important;
        zoom: ${zoomValue} !important;
        transform: none !important;
        transform-origin: top center !important;
        contain: none !important;
      }
    }
  `;
}

function injectSessionStyles(config: PrintConfig, mode: GoldenPrintSessionMode): HTMLStyleElement {
  const marginValue = MARGIN_VALUES[config.margins];
  const zoomValue = MARGIN_ZOOM[config.margins];
  const style = document.createElement("style");
  style.id = mode === "print" ? STYLE_PRINT_ID : STYLE_EXPORT_ID;

  const zoomRule =
    mode === "export"
      ? ""
      : `@media print {
    .print-dual-container .print-page-wrapper > .print-artboard { zoom: ${zoomValue} !important; }
  }`;

  const exportRasterChrome =
    mode === "export"
      ? `
    body.printing-dual-mode .print-dual-container,
    body.golden-export-raster .print-dual-container,
    body.printing-dual-mode .print-dual-container .print-artboard,
    body.golden-export-raster .print-dual-container .print-artboard {
      box-shadow: none !important;
      border: none !important;
      outline: none !important;
      border-radius: 0 !important;
      filter: none !important;
      contain: none !important;
      background: #ffffff !important;
    }
  `
      : "";

  style.textContent = `
    @page { size: letter landscape; margin: ${marginValue} !important; }
    ${zoomRule}
    ${exportRasterChrome}
    @media print {
      html.sb-shiftbuilder,
      body.sb-shiftbuilder,
      html.printing-dual-mode,
      body.printing-dual-mode {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        position: static !important;
      }
      .sb-builder-shell.sb-shiftbuilder {
        height: auto !important;
        max-height: none !important;
        overflow: visible !important;
        position: static !important;
      }
    }
    body.printing-dual-mode .print-dual-container .print-page-wrapper {
      page-break-after: always;
      break-after: page;
      break-inside: avoid;
    }
    body.printing-dual-mode .print-dual-container .print-page-wrapper:last-child {
      page-break-after: auto;
      break-after: auto;
    }
  `;
  document.head.appendChild(style);
  return style;
}

function buildPrintIframe(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("title", "SheetBuilder print");
  iframe.style.cssText = [
    "position:fixed",
    "left:-10960px",
    "top:0",
    `width:${GOLDEN_WIDTH_PX}px`,
    `height:${GOLDEN_HEIGHT_PX}px`,
    "border:0",
    "margin:0",
    "padding:0",
    "opacity:1",
    "visibility:visible",
    "pointer-events:none",
    "z-index:-1",
    "background:#ffffff",
  ].join(";");
  document.body.appendChild(iframe);
  return iframe;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Mount already-rasterized sheets for browser print. The print DOM deliberately
 * uses only physical dimensions, absolute positioning, and legacy page-break
 * properties so Safari/iPadOS and older Microsoft print engines do not need to
 * reproduce the application's grid/flex layout.
 */
export async function mountGoldenRasterPrintSession(
  pages: GoldenPrintPage[],
  rasterPages: GoldenRasterPrintPage[],
  config: PrintConfig,
): Promise<GoldenPrintSession> {
  if (rasterPages.length !== pages.length) {
    throw new Error(
      `Raster print: expected ${pages.length} images, found ${rasterPages.length}`,
    );
  }

  const marginIn = marginInches(config.margins);
  const contentWidthIn = 11 - marginIn * 2;
  const contentHeightIn = 8.5 - marginIn * 2;
  const fit = Math.min(contentWidthIn / 11, contentHeightIn / 8.5);
  const imageWidthIn = 11 * fit;
  const imageHeightIn = 8.5 * fit;
  const leftIn = (contentWidthIn - imageWidthIn) / 2;
  const topIn = (contentHeightIn - imageHeightIn) / 2;

  const printCss = `
    @page { size: letter landscape; margin: ${marginIn}in; }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      height: auto !important;
      overflow: visible !important;
    }
    .sb-raster-print-container {
      display: block !important;
      width: ${contentWidthIn}in !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
    }
    .sb-raster-print-page {
      position: relative !important;
      display: block !important;
      width: ${contentWidthIn}in !important;
      height: ${contentHeightIn}in !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      background: #ffffff !important;
      page-break-inside: avoid !important;
      page-break-after: always !important;
      break-inside: avoid-page !important;
      break-after: page !important;
    }
    .sb-raster-print-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .sb-raster-print-page > img {
      position: absolute !important;
      display: block !important;
      left: ${leftIn}in !important;
      top: ${topIn}in !important;
      width: ${imageWidthIn}in !important;
      height: ${imageHeightIn}in !important;
      max-width: none !important;
      border: 0 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
  `;
  const pagesHtml = rasterPages
    .map(
      (page, index) =>
        `<div class="sb-raster-print-page"><img src="${escapeAttribute(page.dataUrl)}" alt="Graves zone sheet ${index + 1}" /></div>`,
    )
    .join("");

  const iframe = buildPrintIframe();
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("Raster print iframe: no contentDocument");
  }
  doc.open();
  doc.write(
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />' +
    `<style id="${STYLE_PRINT_ID}">${printCss}</style>` +
    '</head><body><div class="sb-raster-print-container">' +
    pagesHtml +
    '</div></body></html>',
  );
  doc.close();

  const container = doc.querySelector(".sb-raster-print-container") as HTMLDivElement | null;
  if (!container) {
    iframe.remove();
    throw new Error("Raster print iframe: container missing");
  }

  const images = Array.from(container.querySelectorAll("img"));
  try {
    await Promise.all(
      images.map(async (img) => {
        if (img.complete && img.naturalWidth > 0) return;
        if (typeof img.decode === "function") {
          await img.decode();
          return;
        }
        await new Promise<void>((resolve, reject) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener(
            "error",
            () => reject(new Error("Raster print image failed to load")),
            { once: true },
          );
        });
      }),
    );
    await waitForGoldenRenderSettled();
  } catch (error) {
    iframe.remove();
    throw error;
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
  };

  return { container, pages, cleanup, printFrame: iframe };
}

/**
 * Browser print in an isolated iframe so sb-shiftbuilder (100vh + overflow:hidden)
 * on the live app body cannot clip sheets after the first page.
 */
async function mountGoldenBrowserPrintSession(
  pages: GoldenPrintPage[],
  config: PrintConfig,
): Promise<GoldenPrintSession> {
  const iframe = buildPrintIframe();
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    throw new Error("Print iframe: no contentDocument");
  }

  const fontCss = collectFontFaceCss();
  const rootVars = getRootFontVars();
  const linkTags = getAppStylesheetHrefs()
    .map((href) => `<link rel="stylesheet" href="${href}" crossorigin="anonymous" />`)
    .join("");
  const pagesHtml = buildWrappedPagesHtml(pages);
  const printOverrides = buildIframePrintOverrides(config);

  doc.open();
  doc.write(
    '<!DOCTYPE html><html lang="en" class="printing-dual-mode"><head><meta charset="utf-8" />' +
    `<style>${rootVars}</style>` +
    `<style>${fontCss}</style>` +
    `<style id="${STYLE_PRINT_ID}">${printOverrides}</style>` +
    linkTags +
    '<link rel="stylesheet" href="/shiftbuilder-print-preview.css" />' +
    '</head><body class="printing-dual-mode" style="margin:0;padding:0;background:#ffffff">' +
    `<div class="print-dual-container">${pagesHtml}</div></body></html>`,
  );
  doc.close();

  await waitForIframeAssets(doc);
  if (iframe.contentWindow) {
    await iframe.contentWindow.document.fonts.ready;
  }
  await waitForGoldenRenderSettled();

  const container = doc.querySelector(".print-dual-container") as HTMLDivElement | null;
  if (!container) {
    iframe.remove();
    throw new Error("Print iframe: .print-dual-container missing");
  }

  prepareMountedArtboards(container, pages);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    iframe.remove();
    doc.getElementById(STYLE_PRINT_ID)?.remove();
  };

  return { container, pages, cleanup, printFrame: iframe };
}

function mountGoldenExportDomSession(
  pages: GoldenPrintPage[],
  config: PrintConfig,
): GoldenPrintSession {
  ensureGoldenPrintBundleStyles();

  const container = document.createElement("div");
  container.className = "print-dual-container";
  container.innerHTML = buildWrappedPagesHtml(pages);
  document.body.appendChild(container);

  prepareMountedArtboards(container, pages);

  const styleEl = injectSessionStyles(config, "export");
  container.classList.add("golden-export-raster");

  document.documentElement.style.backgroundColor = "#ffffff";
  document.body.style.backgroundColor = "#ffffff";
  document.documentElement.classList.add("printing-dual-mode");
  document.body.classList.add("printing-dual-mode", "golden-export-raster");

  const hiddenBodyChildren: { el: HTMLElement; prevDisplay: string }[] = [];
  Array.from(document.body.children).forEach((child) => {
    const el = child as HTMLElement;
    if (el !== container && el.tagName !== "SCRIPT" && el.tagName !== "STYLE") {
      hiddenBodyChildren.push({ el, prevDisplay: el.style.display });
      el.style.display = "none";
    }
  });

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    hiddenBodyChildren.forEach(({ el, prevDisplay }) => {
      el.style.display = prevDisplay;
    });
    document.documentElement.classList.remove("printing-dual-mode");
    document.body.classList.remove("printing-dual-mode", "golden-export-raster");
    document.documentElement.style.removeProperty("background-color");
    document.body.style.removeProperty("background-color");
    container.remove();
    styleEl.remove();
  };

  return { container, pages, cleanup, printFrame: null };
}

/**
 * Mount a Golden print session.
 * Print uses an isolated iframe; export rasterizes from the live DOM.
 */
export async function mountGoldenPrintSession(
  pages: GoldenPrintPage[],
  config: PrintConfig,
  mode: GoldenPrintSessionMode,
): Promise<GoldenPrintSession> {
  if (mode === "print") {
    return mountGoldenBrowserPrintSession(pages, config);
  }
  return mountGoldenExportDomSession(pages, config);
}

/**
 * Open the system print dialog with Golden pages mounted.
 * Cleanup is deferred until afterprint.
 */
export function runBrowserPrint(session: GoldenPrintSession): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallbackTimer);
      session.cleanup();
      resolve();
    };

    const printWindow = session.printFrame?.contentWindow ?? window;
    printWindow.addEventListener("afterprint", finish, { once: true });
    window.addEventListener("afterprint", finish, { once: true });
    const fallbackTimer = window.setTimeout(finish, 120_000);

    document.body.classList.remove("sb-print-export-busy");

    try {
      printWindow.focus();
      printWindow.print();
    } catch (error) {
      window.clearTimeout(fallbackTimer);
      session.cleanup();
      reject(error);
    }
  });
}

export async function waitForGoldenRenderSettled(): Promise<void> {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function getPrintZoom(config: PrintConfig): number {
  return MARGIN_ZOOM[config.margins];
}

function marginInches(margins: PrintConfig["margins"]): number {
  const raw = MARGIN_VALUES[margins];
  if (raw === "0in") return 0;
  return parseFloat(raw);
}

/** Printable content box in pt — matches @page margin insets on landscape letter. */
export function getPrintContentBoxPt(config: PrintConfig): {
  width: number;
  height: number;
  marginX: number;
  marginY: number;
} {
  const marginPt = marginInches(config.margins) * 72;
  const letterW = 792;
  const letterH = 612;
  return {
    width: letterW - 2 * marginPt,
    height: letterH - 2 * marginPt,
    marginX: marginPt,
    marginY: marginPt,
  };
}

/** Fit an undistorted landscape-letter sheet inside the selected page margins. */
export function getPrintImagePlacementPt(config: PrintConfig): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const letterW = 792;
  const letterH = 612;
  const { width: boxW, height: boxH, marginX, marginY } = getPrintContentBoxPt(config);
  const fit = Math.min(boxW / letterW, boxH / letterH);
  const width = letterW * fit;
  const height = letterH * fit;
  return {
    x: marginX + (boxW - width) / 2,
    y: marginY + (boxH - height) / 2,
    width,
    height,
  };
}
