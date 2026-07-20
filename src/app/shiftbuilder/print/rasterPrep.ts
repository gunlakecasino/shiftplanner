import {
  GOLDEN_HEIGHT_PX,
  GOLDEN_RASTER_STAGING_LEFT_PX,
  GOLDEN_WIDTH_PX,
} from "./goldenConstants";
import type { GoldenPrintSession } from "./printSession";

/**
 * Stage export artboards off-screen at full opacity so html-to-image captures faithfully
 * without flashing pages over the Print Command Center UI.
 */
/** Kill paper chrome that html-to-image paints as a gray halo around the 1056×816 sheet. */
export function stripGoldenRasterChrome(artboard: HTMLElement): void {
  const chrome: Array<[string, string]> = [
    ["box-shadow", "none"],
    ["border", "none"],
    ["outline", "none"],
    ["border-radius", "0"],
    ["filter", "none"],
    ["contain", "none"],
    ["margin", "0"],
    ["background-color", "#ffffff"],
  ];
  for (const [prop, value] of chrome) {
    artboard.style.setProperty(prop, value, "important");
  }
}

export type GoldenRasterCaptureMount = {
  shell: HTMLElement;
  artboard: HTMLElement;
  restore: () => void;
};

/**
 * html-to-image foreignObject can paint the builder stage gray (#F8F8FA) outside the
 * artboard's painted box. Mount a hard white 1056×816 shell and capture that instead.
 */
export function mountGoldenRasterCaptureShell(artboard: HTMLElement): GoldenRasterCaptureMount {
  const parent = artboard.parentElement;
  if (!parent) {
    throw new Error("Golden raster: artboard has no parent");
  }

  const shell = document.createElement("div");
  shell.className = "sb-golden-raster-shell";
  shell.setAttribute("data-golden-raster-shell", "1");
  shell.style.cssText = [
    `width:${GOLDEN_WIDTH_PX}px`,
    `height:${GOLDEN_HEIGHT_PX}px`,
    "overflow:hidden",
    "background:#ffffff",
    "box-sizing:border-box",
    "margin:0",
    "padding:0",
    "border:none",
    "outline:none",
    "box-shadow:none",
    "position:relative",
    "display:block",
  ].join(";");

  const nextSibling = artboard.nextSibling;
  parent.insertBefore(shell, artboard);
  shell.appendChild(artboard);

  artboard.style.setProperty("width", "100%", "important");
  artboard.style.setProperty("height", "100%", "important");
  artboard.style.setProperty("max-width", "100%", "important");
  artboard.style.setProperty("min-width", "0", "important");
  stripGoldenRasterChrome(artboard);

  const restore = () => {
    if (nextSibling) {
      parent.insertBefore(artboard, nextSibling);
    } else {
      parent.appendChild(artboard);
    }
    shell.remove();
    artboard.style.removeProperty("width");
    artboard.style.removeProperty("height");
    artboard.style.removeProperty("max-width");
    artboard.style.removeProperty("min-width");
  };

  return { shell, artboard, restore };
}

/** Builder stage grays that leak into export rasters when foreignObject under-paints. */
function isStageBleedGray(r: number, g: number, b: number): boolean {
  return r === g && g === b && r >= 240 && r <= 252;
}

function isRasterBackgroundPixel(r: number, g: number, b: number): boolean {
  if (r >= 250 && g >= 250 && b >= 250) return true;
  return isStageBleedGray(r, g, b);
}

/** Shift captured pixels so sheet content is centered in the 1056×816 raster. */
export async function centerGoldenRasterContent(
  dataUrl: string,
  format: "PNG" | "JPEG",
  quality = 0.92,
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const probe = new Image();
    probe.onload = () => resolve(probe);
    probe.onerror = () => reject(new Error("Golden raster center probe failed"));
    probe.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0);
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  let left = w;
  let right = -1;
  let top = h;
  let bottom = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (isRasterBackgroundPixel(d[i], d[i + 1], d[i + 2])) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  if (right < left || bottom < top) return dataUrl;

  const contentW = right - left + 1;
  const contentH = bottom - top + 1;

  // Full Golden sheets paint nearly edge-to-edge. Centering a near-full bbox
  // from a 1–2px asymmetric margin can shift content and clip the opposite edge.
  // Only re-center when the capture is clearly letterboxed.
  const fillX = contentW / w;
  const fillY = contentH / h;
  if (fillX >= 0.94 && fillY >= 0.94) return dataUrl;

  const shiftX = Math.round((w - contentW) / 2 - left);
  const shiftY = Math.round((h - contentH) / 2 - top);

  if (shiftX === 0 && shiftY === 0) return dataUrl;
  // Avoid tiny jitter from anti-aliased edge pixels.
  if (Math.abs(shiftX) <= 2 && Math.abs(shiftY) <= 2) return dataUrl;

  const centered = document.createElement("canvas");
  centered.width = w;
  centered.height = h;
  const cctx = centered.getContext("2d");
  if (!cctx) return dataUrl;

  cctx.fillStyle = "#ffffff";
  cctx.fillRect(0, 0, w, h);
  cctx.drawImage(img, shiftX, shiftY);

  return format === "PNG"
    ? centered.toDataURL("image/png")
    : centered.toDataURL("image/jpeg", quality);
}

/** Flatten stage-gray bleed strips on the right/bottom of a captured Golden page. */
export async function flattenGoldenRasterStageBleed(
  dataUrl: string,
  format: "PNG" | "JPEG",
  quality = 0.92,
): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const probe = new Image();
    probe.onload = () => resolve(probe);
    probe.onerror = () => reject(new Error("Golden raster bleed probe failed"));
    probe.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);

  const w = canvas.width;
  const h = canvas.height;
  const rightStripStart = Math.floor(w * 0.9);
  const bottomStripStart = Math.floor(h * 0.9);
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inRightBleed = x >= rightStripStart;
      const inBottomBleed = y >= bottomStripStart;
      if (!inRightBleed && !inBottomBleed) continue;
      const i = (y * w + x) * 4;
      if (!isStageBleedGray(d[i], d[i + 1], d[i + 2])) continue;
      d[i] = 255;
      d[i + 1] = 255;
      d[i + 2] = 255;
      d[i + 3] = 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return format === "PNG"
    ? canvas.toDataURL("image/png")
    : canvas.toDataURL("image/jpeg", quality);
}

export async function withWhiteDocumentBackground<T>(fn: () => Promise<T>): Promise<T> {
  const html = document.documentElement;
  const body = document.body;
  const prev = {
    htmlBg: html.style.backgroundColor,
    bodyBg: body.style.backgroundColor,
  };
  html.style.backgroundColor = "#ffffff";
  body.style.backgroundColor = "#ffffff";
  try {
    return await fn();
  } finally {
    html.style.backgroundColor = prev.htmlBg;
    body.style.backgroundColor = prev.bodyBg;
  }
}

export function prepareExportSessionForRaster(session: GoldenPrintSession): void {
  if (typeof document !== "undefined") {
    // Keep export CSS active while html-to-image clones computed styles.
    document.body.classList.add("golden-export-raster", "printing-dual-mode");
  }

  const container = session.container;
  container.classList.remove("golden-export-raster");
  container.style.cssText = [
    "position:fixed",
    `left:${GOLDEN_RASTER_STAGING_LEFT_PX}px`,
    "top:0",
    "display:block",
    "opacity:1",
    "visibility:visible",
    "pointer-events:none",
    "z-index:-1",
    `width:${GOLDEN_WIDTH_PX}px`,
    `height:${GOLDEN_HEIGHT_PX}px`,
    "overflow:hidden",
    "background:#ffffff",
  ].join(";");

  container.querySelectorAll<HTMLElement>(".print-artboard").forEach((ab) => {
    ab.style.opacity = "1";
    ab.style.visibility = "visible";
    stripGoldenRasterChrome(ab);
  });
}

/** Strip builder/capture inline styles that break Golden 1056×816 fidelity. */
export function prepareArtboardForRaster(artboard: HTMLElement, _printZoom = 1): void {
  artboard.classList.remove("builder-workspace", "sb-builder-compact");
  artboard.classList.add("print-artboard");

  const isGoldenArtboard = artboard.classList.contains("print-artboard");
  if (!isGoldenArtboard) {
    artboard.style.cssText = [
      `width:${GOLDEN_WIDTH_PX}px`,
      `height:${GOLDEN_HEIGHT_PX}px`,
      `min-height:${GOLDEN_HEIGHT_PX}px`,
      `max-height:${GOLDEN_HEIGHT_PX}px`,
      `max-width:${GOLDEN_WIDTH_PX}px`,
      "overflow:hidden",
      "box-sizing:border-box",
      "margin:0",
      "padding:18px 24px 14px",
      "box-shadow:none",
      "border-radius:2px",
      "background:#ffffff",
      "zoom:1",
      "transform:none",
      "position:relative",
      "display:flex",
      "flex-direction:column",
      "opacity:1",
    ].join(";");
  } else {
    artboard.style.width = `${GOLDEN_WIDTH_PX}px`;
    artboard.style.height = `${GOLDEN_HEIGHT_PX}px`;
    artboard.style.minHeight = `${GOLDEN_HEIGHT_PX}px`;
    artboard.style.maxHeight = `${GOLDEN_HEIGHT_PX}px`;
    // Capture at native Golden size; margin zoom is applied when placing in PDF (matches browser print).
    artboard.style.zoom = "1";
    artboard.style.transform = "none";
    artboard.style.margin = "0";
    artboard.style.boxShadow = "none";
    artboard.style.opacity = "1";
    artboard.style.visibility = "visible";
  }

  // Builder capture can leave scroll/auto heights on the content shell.
  artboard.querySelectorAll<HTMLElement>("[class*='overflow-y-auto']").forEach((el) => {
    el.classList.remove("overflow-y-auto", "pb-8");
    el.style.overflow = "hidden";
    el.style.overflowX = "hidden";
    el.style.flex = "1 1 0%";
    el.style.minHeight = "0";
    el.style.maxWidth = "100%";
    el.style.width = "100%";
  });

  artboard.querySelectorAll<HTMLElement>(".grid, .flex").forEach((el) => {
    el.style.maxWidth = "100%";
    el.style.minWidth = "0";
  });

  artboard.querySelectorAll<HTMLElement>("*").forEach((el) => {
    const t = el.style.transform;
    if (t && t !== "none") el.style.transform = "none";
    if (el.style.zoom && el.style.zoom !== "1" && el !== artboard) el.style.zoom = "1";
  });

}

export function goldenRasterScale(pageCount: number): number {
  if (pageCount <= 4) return 2;
  if (pageCount <= 12) return 1.75;
  return 1.5;
}

/** Keep memory-bound print engines responsive without lowering desktop Chromium output. */
export function goldenRasterScaleForClient(
  pageCount: number,
  userAgent: string,
  maxTouchPoints = 0,
): number {
  const base = goldenRasterScale(pageCount);
  const safari = /Safari/i.test(userAgent) && !/(Chrome|Chromium|CriOS|Edg|OPR)/i.test(userAgent);
  const ios = /(iPad|iPhone|iPod)/i.test(userAgent);
  const desktopModeIpad = /Macintosh/i.test(userAgent) && maxTouchPoints > 1;
  const legacyMicrosoft = /(MSIE|Trident)/i.test(userAgent);
  return safari || ios || desktopModeIpad || legacyMicrosoft ? Math.min(base, 1.5) : base;
}

const RASTER_SKIP_PROPS = new Set([
  "animation",
  "animation-delay",
  "animation-direction",
  "animation-duration",
  "animation-fill-mode",
  "animation-iteration-count",
  "animation-name",
  "animation-play-state",
  "animation-timing-function",
  "transition",
  "transition-delay",
  "transition-duration",
  "transition-property",
  "transition-timing-function",
  "cursor",
  "pointer-events",
  "user-select",
  "touch-action",
  "caret-color",
  "app-region",
  "-webkit-app-region",
  "view-transition-name",
  "contain",
  "content-visibility",
  "will-change",
]);

const RASTER_SKIP_VALUES = new Set([
  "",
  "initial",
  "inherit",
  "unset",
  "revert",
  "revert-layer",
  "auto",
  "normal",
  "none",
]);

function shouldInlineComputedProp(prop: string, value: string): boolean {
  if (RASTER_SKIP_PROPS.has(prop)) return false;
  if (RASTER_SKIP_VALUES.has(value)) return false;
  if (value === "rgba(0, 0, 0, 0)" && prop.includes("color")) return false;
  if (value === "transparent" && prop.includes("color")) return false;
  return true;
}

function camelCaseProp(prop: string): string {
  return prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Copy fully-resolved computed styles onto the live DOM before html2canvas runs.
 * WYSIWYG: what you see in the unveiled export session is what gets rasterized.
 */
export function inlineLiveDomForRaster(root: HTMLElement): void {
  const view = root.ownerDocument.defaultView;
  if (!view) return;

  const nodes: HTMLElement[] = [root];
  root.querySelectorAll<HTMLElement>("*").forEach((n) => nodes.push(n));

  for (const el of nodes) {
    const cs = view.getComputedStyle(el);
    for (let i = 0; i < cs.length; i++) {
      const prop = cs[i];
      const raw = cs.getPropertyValue(prop);
      if (!shouldInlineComputedProp(prop, raw)) continue;

      const camel = camelCaseProp(prop);
      let val: string | null = raw;
      if (COLOR_PAINT_PROPS.has(camel) || UNSAFE_COLOR_RE.test(raw)) {
        val = normalizePaintValue(camel, raw, view);
      } else if (UNSAFE_COLOR_RE.test(raw)) {
        val = null;
      }
      if (!val) continue;

      try {
        el.style.setProperty(prop, val, cs.getPropertyPriority(prop));
      } catch {
        /* ignore unsupported */
      }
    }
  }

  root.style.opacity = "1";
  root.style.visibility = "visible";
}

/** Minimal clone prep — live DOM is already fully inlined; do not strip stylesheets. */
export function prepareRasterCloneDocument(doc: Document, clonedRoot: HTMLElement): void {
  clonedRoot.style.opacity = "1";
  clonedRoot.style.visibility = "visible";

  const html = doc.documentElement;
  const body = doc.body;
  html.style.backgroundColor = "#ffffff";
  html.style.opacity = "1";
  body.style.backgroundColor = "#ffffff";
  body.style.color = "#111111";
  body.style.margin = "0";
  body.style.padding = "0";
  body.style.opacity = "1";
  body.style.visibility = "visible";
}

const COLOR_PAINT_PROPS = new Set([
  "color",
  "backgroundColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
]);

const UNSAFE_COLOR_RE = /color-mix|oklch\(|oklab\(|lab\(|lch\(|color\(|rgb\(from/i;

const RASTER_INLINE_PROPS = [
  "display",
  "position",
  "boxSizing",
  "flex",
  "flexDirection",
  "flexWrap",
  "flexGrow",
  "flexShrink",
  "alignItems",
  "justifyContent",
  "alignContent",
  "gap",
  "gridTemplateColumns",
  "gridTemplateRows",
  "gridAutoRows",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "overflow",
  "overflowX",
  "overflowY",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "lineHeight",
  "letterSpacing",
  "textAlign",
  "textTransform",
  "whiteSpace",
  "textOverflow",
  "webkitLineClamp",
  "webkitBoxOrient",
  "fontVariantNumeric",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderTopStyle",
  "borderRightStyle",
  "borderBottomStyle",
  "borderLeftStyle",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "borderRadius",
  "color",
  "backgroundColor",
  "opacity",
  "boxShadow",
  "zIndex",
] as const;

function cssPropName(prop: string): string {
  return prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

/** Normalize any browser-resolved color to hex/rgb html2canvas understands. */
export function toRasterSafeColor(value: string, view?: Window | null): string | null {
  if (!value || value === "transparent" || value === "currentcolor") return value;
  if (!UNSAFE_COLOR_RE.test(value) && /^(#[0-9a-f]{3,8}|rgb|rgba|hsl|hsla)/i.test(value.trim())) {
    return value;
  }
  const win = view ?? (typeof window !== "undefined" ? window : null);
  if (!win) return null;
  try {
    const canvas = win.document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000000";
    ctx.fillStyle = value;
    return ctx.fillStyle;
  } catch {
    return null;
  }
}

function normalizePaintValue(prop: string, value: string, view: Window): string | null {
  if (!value) return null;
  if (prop === "boxShadow" && UNSAFE_COLOR_RE.test(value)) {
    const probe = view.document.createElement("div");
    probe.style.boxShadow = value;
    return view.getComputedStyle(probe).boxShadow || null;
  }
  if (COLOR_PAINT_PROPS.has(prop) || UNSAFE_COLOR_RE.test(value)) {
    return toRasterSafeColor(value, view);
  }
  if (UNSAFE_COLOR_RE.test(value)) return null;
  return value;
}

function setInlineStyle(el: HTMLElement, prop: string, value: string): void {
  if (!value) return;
  try {
    el.style.setProperty(cssPropName(prop), value);
  } catch {
    /* ignore */
  }
}

/** Remove stylesheets and scrub @supports blocks that reference modern color syntax. */
export function sanitizeCloneStylesheets(doc: Document): void {
  doc.querySelectorAll('link[rel="stylesheet"]').forEach((node) => node.remove());
  doc.querySelectorAll("style").forEach((node) => {
    const text = node.textContent;
    if (!text) {
      node.remove();
      return;
    }
    if (
      !text.includes("color-mix")
      && !text.includes("oklch(")
      && !text.includes("oklab(")
      && !text.includes("lab(")
      && !text.includes("color(")
    ) {
      return;
    }
    node.textContent = text
      .replace(/color-mix\([^)]*\)/g, "#e5e5e7")
      .replace(/oklch\([^)]*\)/g, "#6b7280")
      .replace(/oklab\([^)]*\)/g, "#6b7280")
      .replace(/lab\([^)]*\)/g, "#6b7280")
      .replace(/color\([^)]*\)/g, "#6b7280")
      .replace(/rgb\(from[^)]*\)/g, "rgb(128, 128, 128)");
  });
}

/**
 * After paint is frozen inline, drop all external CSS so html2canvas never parses Tailwind/shadcn tokens.
 */
export function stripCloneDocumentStyles(doc: Document): void {
  sanitizeCloneStylesheets(doc);
  doc.querySelectorAll("style").forEach((node) => node.remove());
  const html = doc.documentElement;
  const body = doc.body;
  html.style.backgroundColor = "#ffffff";
  html.style.color = "#111111";
  body.style.backgroundColor = "#ffffff";
  body.style.color = "#111111";
  body.style.margin = "0";
  body.style.padding = "0";
}

/**
 * html2canvas cannot parse modern CSS color functions (color-mix, oklch, color(), etc.).
 * Copy resolved computed styles from the live artboard onto the iframe clone, then strip stylesheets.
 */
export function freezeResolvedPaintStyles(sourceRoot: HTMLElement, targetRoot: HTMLElement): void {
  const view = sourceRoot.ownerDocument.defaultView;
  if (!view) return;

  const queue: Array<{ source: HTMLElement; target: HTMLElement }> = [{ source: sourceRoot, target: targetRoot }];

  while (queue.length > 0) {
    const { source, target } = queue.shift()!;
    const cs = view.getComputedStyle(source);

    for (const prop of RASTER_INLINE_PROPS) {
      const raw = cs[prop];
      if (!raw || raw === "none" || raw === "auto" || raw === "normal") continue;
      if (raw === "rgba(0, 0, 0, 0)" && prop.toLowerCase().includes("color")) continue;

      const val = normalizePaintValue(prop, raw, view);
      if (!val) continue;
      setInlineStyle(target, prop, val);
    }

    const childCount = Math.min(source.children.length, target.children.length);
    for (let i = 0; i < childCount; i++) {
      queue.push({
        source: source.children[i] as HTMLElement,
        target: target.children[i] as HTMLElement,
      });
    }
  }

  targetRoot.querySelectorAll<HTMLElement>("[class]").forEach((el) => {
    el.removeAttribute("class");
  });

  targetRoot.style.opacity = "1";
  targetRoot.style.visibility = "visible";
  const doc = targetRoot.ownerDocument;
  if (doc?.body) {
    doc.body.style.opacity = "1";
    doc.body.style.visibility = "visible";
    doc.body.style.backgroundColor = "#ffffff";
  }
  if (doc?.documentElement) {
    doc.documentElement.style.opacity = "1";
    doc.documentElement.style.backgroundColor = "#ffffff";
  }
}
