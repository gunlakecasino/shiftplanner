import { toJpeg, toPng } from "html-to-image";
import type { PrintPageKind } from "./assemblePages";
import { postProcessBreaksArtboard } from "./breaksArtboard";
import {
  GOLDEN_HEIGHT_PX,
  GOLDEN_RASTER_STAGING_LEFT_PX,
  GOLDEN_WIDTH_PX,
} from "./goldenConstants";
import {
  centerGoldenRasterContent,
  flattenGoldenRasterStageBleed,
  mountGoldenRasterCaptureShell,
  stripGoldenRasterChrome,
  withWhiteDocumentBackground,
} from "./rasterPrep";
import { waitForGoldenRenderSettled } from "./printSession";

type RasterResult = {
  dataUrl: string;
  format: "PNG" | "JPEG";
  width: number;
  height: number;
};

function collectFontFaceCss(): string {
  let out = "";
  document.querySelectorAll("head style").forEach((node) => {
    const text = node.textContent || "";
    if (text.includes("@font-face")) out += text;
  });
  return out;
}

/** Copy every --font-* custom property from the live app root (Next.js + globals.css). */
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

function getHtmlClassNames(): string {
  return document.documentElement.className || "";
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

function buildExportIframe(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = [
    "position:fixed",
    `left:${GOLDEN_RASTER_STAGING_LEFT_PX}px`,
    "top:0",
    `width:${GOLDEN_WIDTH_PX}px`,
    `height:${GOLDEN_HEIGHT_PX}px`,
    "border:0",
    "margin:0",
    "padding:0",
    "opacity:1",
    "visibility:visible",
    "pointer-events:none",
    "z-index:2147483647",
    "background:#ffffff",
  ].join(";");
  document.body.appendChild(iframe);
  return iframe;
}

async function measureRasterDataUrl(dataUrl: string): Promise<{ width: number; height: number }> {
  const probe = new Image();
  return new Promise((resolve, reject) => {
    probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () => reject(new Error("Export raster probe failed"));
    probe.src = dataUrl;
  });
}

const GOLDEN_RASTER_ROOT_STYLE: Partial<CSSStyleDeclaration> = {
  boxShadow: "none",
  border: "none",
  outline: "none",
  borderRadius: "0",
  filter: "none",
  contain: "none",
  margin: "0",
  overflow: "hidden",
  backgroundColor: "#ffffff",
};

async function captureArtboardPixels(
  artboard: HTMLElement,
  args: { pixelRatio: number; usePng: boolean },
): Promise<RasterResult> {
  stripGoldenRasterChrome(artboard);
  const mount = mountGoldenRasterCaptureShell(artboard);

  const captureOpts = {
    pixelRatio: args.pixelRatio,
    width: GOLDEN_WIDTH_PX,
    height: GOLDEN_HEIGHT_PX,
    cacheBust: true,
    backgroundColor: "#ffffff",
    skipFonts: false,
    style: {
      ...GOLDEN_RASTER_ROOT_STYLE,
      width: `${GOLDEN_WIDTH_PX}px`,
      height: `${GOLDEN_HEIGHT_PX}px`,
      backgroundColor: "#ffffff",
    },
  };

  let dataUrl: string;
  try {
    dataUrl = args.usePng
      ? await toPng(mount.shell, captureOpts)
      : await toJpeg(mount.shell, { ...captureOpts, quality: 0.92 });
  } finally {
    mount.restore();
  }

  const format = args.usePng ? "PNG" : "JPEG";
  dataUrl = await flattenGoldenRasterStageBleed(dataUrl, format, 0.92);
  dataUrl = await centerGoldenRasterContent(dataUrl, format, 0.92);

  const dims = await measureRasterDataUrl(dataUrl);

  if (dims.width < GOLDEN_WIDTH_PX * args.pixelRatio * 0.5) {
    throw new Error(
      `Export raster undersized (${dims.width}×${dims.height}). ` +
        "Fonts/CSS may not have loaded — try Print → Save as PDF.",
    );
  }

  return {
    dataUrl,
    format: args.usePng ? "PNG" : "JPEG",
    width: dims.width,
    height: dims.height,
  };
}

function applyArtboardContract(artboard: HTMLElement): void {
  artboard.style.width = `${GOLDEN_WIDTH_PX}px`;
  artboard.style.height = `${GOLDEN_HEIGHT_PX}px`;
  artboard.style.minHeight = `${GOLDEN_HEIGHT_PX}px`;
  artboard.style.maxHeight = `${GOLDEN_HEIGHT_PX}px`;
  artboard.style.zoom = "1";
  artboard.style.transform = "none";
  artboard.style.display = "flex";
  artboard.style.flexDirection = "column";
  artboard.style.opacity = "1";
  artboard.style.visibility = "visible";
  stripGoldenRasterChrome(artboard);
}

/**
 * Rasterize one Golden artboard from the mounted print session in the live app DOM.
 * Same CSS + font stack as browser print() — export PDF matches Print button fidelity.
 */
export async function rasterizeGoldenArtboardElement(args: {
  artboard: HTMLElement;
  kind: PrintPageKind;
  pixelRatio: number;
  usePng: boolean;
}): Promise<RasterResult> {
  if (args.kind === "breaks") {
    postProcessBreaksArtboard(args.artboard);
  }
  applyArtboardContract(args.artboard);
  args.artboard.getBoundingClientRect();

  await waitForGoldenRenderSettled();
  await new Promise<void>((r) => {
    requestAnimationFrame(() => requestAnimationFrame(() => r()));
  });

  return withWhiteDocumentBackground(() =>
    captureArtboardPixels(args.artboard, {
      pixelRatio: args.pixelRatio,
      usePng: args.usePng,
    }),
  );
}

/**
 * Rasterize serialized Golden HTML in an isolated iframe (export-debug fallback).
 * Prefer rasterizeGoldenArtboardElement when a mounted session is available.
 */
export async function rasterizeGoldenPageHtml(args: {
  pageHtml: string;
  kind: PrintPageKind;
  pixelRatio: number;
  usePng: boolean;
}): Promise<RasterResult> {
  const iframe = buildExportIframe();

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Export iframe: no contentDocument");

    const fontCss = collectFontFaceCss();
    const rootVars = getRootFontVars();
    const htmlClass = getHtmlClassNames();
    const linkTags = getAppStylesheetHrefs()
      .map((href) => `<link rel="stylesheet" href="${href}" crossorigin="anonymous" />`)
      .join("");

    doc.open();
    doc.write(
      "<!DOCTYPE html><html lang=\"en\"" +
      (htmlClass ? ` class="${htmlClass}"` : "") +
      "><head><meta charset=\"utf-8\" />" +
      `<style>${rootVars}</style>` +
      `<style>${fontCss}</style>` +
      linkTags +
      '<link rel="stylesheet" href="/shiftbuilder-print-preview.css" />' +
      "</head><body class=\"printing-dual-mode golden-export-raster\" " +
      'style="margin:0;padding:0;background:#ffffff">' +
      `<div class="print-dual-container" style="width:${GOLDEN_WIDTH_PX}px;height:${GOLDEN_HEIGHT_PX}px;background:#ffffff;overflow:hidden;margin:0;padding:0">` +
      `${args.pageHtml}</div></body></html>`,
    );
    doc.close();

    await waitForIframeAssets(doc);
    if (iframe.contentWindow) {
      await iframe.contentWindow.document.fonts.ready;
    }
    await waitForGoldenRenderSettled();

    const artboard = doc.querySelector(".print-artboard") as HTMLElement | null;
    if (!artboard) {
      throw new Error("Export iframe: .print-artboard not found in page HTML");
    }

    if (args.kind === "breaks") {
      postProcessBreaksArtboard(artboard);
    }
    applyArtboardContract(artboard);
    artboard.getBoundingClientRect();
    await new Promise<void>((r) => {
      requestAnimationFrame(() => requestAnimationFrame(() => r()));
    });

    return withWhiteDocumentBackground(() =>
      captureArtboardPixels(artboard, {
        pixelRatio: args.pixelRatio,
        usePng: args.usePng,
      }),
    );
  } finally {
    iframe.remove();
  }
}