import type { PrintConfig } from "../components/PrintCommandCenter";
import { MARGIN_VALUES, MARGIN_ZOOM } from "../components/PrintCommandCenter";
import { GOLDEN_HEIGHT_PX, GOLDEN_WIDTH_PX } from "./goldenConstants";
import { postProcessBreaksArtboard } from "./breaksArtboard";

import type { GoldenPrintPage } from "./assemblePages";

export type GoldenPrintSessionMode = "print" | "export";

export type GoldenPrintSession = {
  container: HTMLDivElement;
  pages: GoldenPrintPage[];
  cleanup: () => void;
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

function applyGoldenArtboardContract(
  artboard: HTMLElement,
  page: GoldenPrintPage,
  _config: PrintConfig,
  _mode: GoldenPrintSessionMode,
): void {
  artboard.style.margin = "0";
  artboard.style.boxShadow = "none";
  artboard.style.boxSizing = "border-box";
  artboard.style.width = `${GOLDEN_WIDTH_PX}px`;
  artboard.style.height = `${GOLDEN_HEIGHT_PX}px`;
  artboard.style.minHeight = `${GOLDEN_HEIGHT_PX}px`;
  artboard.style.maxHeight = `${GOLDEN_HEIGHT_PX}px`;
  artboard.style.overflow = "hidden";
  // Browser print applies margin zoom via @media print. Export captures at 1:1 then scales in PDF.
  artboard.style.zoom = "1";
  artboard.style.transform = "none";
  artboard.style.display = "flex";
  artboard.style.flexDirection = "column";

  if (page.kind === "breaks" && artboard.getAttribute("data-print-view") === "breaks") {
    postProcessBreaksArtboard(artboard);
  }
}

function injectSessionStyles(config: PrintConfig, mode: GoldenPrintSessionMode): HTMLStyleElement {
  const marginValue = MARGIN_VALUES[config.margins];
  const zoomValue = MARGIN_ZOOM[config.margins];
  const style = document.createElement("style");
  style.id = mode === "print" ? STYLE_PRINT_ID : STYLE_EXPORT_ID;

  // Browser print applies margin zoom in @media print only. Export captures 1:1 and scales in PDF.
  const zoomRule =
    mode === "export"
      ? ""
      : `@media print { .print-dual-container .print-artboard { zoom: ${zoomValue} !important; } }`;

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
    @page { size: 11in 8.5in landscape; margin: ${marginValue} !important; }
    ${zoomRule}
    ${exportRasterChrome}
  `;
  document.head.appendChild(style);
  return style;
}

/**
 * Mount a Golden print session: one .print-dual-container with prepared artboards.
 * Print and export share this path so layout is identical.
 */
export function mountGoldenPrintSession(
  pages: GoldenPrintPage[],
  config: PrintConfig,
  mode: GoldenPrintSessionMode,
): GoldenPrintSession {
  ensureGoldenPrintBundleStyles();

  const container = document.createElement("div");
  container.className = "print-dual-container";
  container.innerHTML = pages.map((p) => p.html).join("");
  document.body.appendChild(container);

  const artboards = Array.from(container.querySelectorAll(".print-artboard"));
  artboards.forEach((ab, i) => {
    const page = pages[i];
    if (page) applyGoldenArtboardContract(ab as HTMLElement, page, config, mode);
  });

  const styleEl = injectSessionStyles(config, mode);

  if (mode === "export") {
    container.classList.add("golden-export-raster");
  }

  document.body.classList.add("printing-dual-mode");
  if (mode === "export") {
    document.body.classList.add("golden-export-raster");
  }

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
    document.body.classList.remove("printing-dual-mode", "golden-export-raster");
    container.remove();
    styleEl.remove();
  };

  return { container, pages, cleanup };
}

/**
 * Open the system print dialog with Golden pages mounted.
 * Cleanup is deferred until afterprint — Safari (and some Chromium builds) return from
 * window.print() before the preview renders; immediate teardown showed the live app UI.
 */
export function runBrowserPrint(session: GoldenPrintSession): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(fallbackTimer);
      session.cleanup();
      resolve();
    };

    window.addEventListener("afterprint", finish, { once: true });
    const fallbackTimer = window.setTimeout(finish, 120_000);

    window.print();
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