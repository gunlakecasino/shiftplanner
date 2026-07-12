/**
 * Stable viewport height for the fixed fullscreen ShiftBuilder shell.
 *
 * `100vh` and even `window.innerHeight` can lie on Safari/iPad/Chrome mobile when
 * toolbars animate — cards at the bottom get clipped because the shell is taller
 * than the visible area and overflow is hidden everywhere.
 *
 * Prefer `visualViewport.height` and expose it as `--sb-viewport-height` so CSS
 * and JS agree on the same pixel height.
 */

export const VIEWPORT_HEIGHT_CSS_VAR = "--sb-viewport-height";

/** Dispatched after each viewport height sync — board card equalization listens. */
export const VIEWPORT_SYNC_EVENT = "sb-viewport-sync";

/** Visible viewport height in CSS pixels (excludes dynamic browser chrome). */
export function readViewportHeight(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (vv && vv.height > 50) return Math.round(vv.height);
  return window.innerHeight;
}

/** Visible viewport width in CSS pixels (Split View / Stage Manager / Safari chrome). */
export function readViewportWidth(): number {
  if (typeof window === "undefined") return 0;
  const vv = window.visualViewport;
  if (vv && vv.width > 50) return Math.round(vv.width);
  return window.innerWidth;
}

/**
 * iOS Safari: when the visual viewport pans (keyboard, toolbar), fixed-position
 * coords need the visualViewport offset so popovers don't sit under chrome.
 */
export function readVisualViewportOffset(): { top: number; left: number } {
  if (typeof window === "undefined") return { top: 0, left: 0 };
  const vv = window.visualViewport;
  if (!vv) return { top: 0, left: 0 };
  return {
    top: Math.round(vv.offsetTop || 0),
    left: Math.round(vv.offsetLeft || 0),
  };
}

export type FixedPopoverPlacement = {
  top: number;
  left: number;
  maxHeight?: number;
  /** true when menu was flipped above the anchor */
  flippedUp?: boolean;
};

/**
 * Place a fixed-position popover relative to an anchor rect so it stays fully
 * visible on iPad Safari (visualViewport, safe-area, flip above when needed).
 */
export function placeFixedPopover(
  anchor: DOMRect,
  menuW: number,
  menuH: number,
  opts?: {
    gap?: number;
    pad?: number;
    preferBelow?: boolean;
    /** Prefer left of anchor (e.g. pad flyouts on right-edge cards). */
    preferLeft?: boolean;
  },
): FixedPopoverPlacement {
  const gap = opts?.gap ?? 4;
  const pad = opts?.pad ?? 8;
  const preferBelow = opts?.preferBelow !== false;
  const vw = readViewportWidth();
  const vh = readViewportHeight();
  const { top: vOffTop, left: vOffLeft } = readVisualViewportOffset();

  // Safe areas (home indicator / Face ID) — env() works in CSS; approximate via CSS vars if set.
  let safeTop = 0;
  let safeBottom = 0;
  let safeLeft = 0;
  let safeRight = 0;
  if (typeof getComputedStyle !== "undefined" && typeof document !== "undefined") {
    const cs = getComputedStyle(document.documentElement);
    const parse = (v: string) => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    };
    // Not always available as computed on html; fall back to 0.
    safeTop = parse(cs.getPropertyValue("--sb-safe-top")) || 0;
    safeBottom = parse(cs.getPropertyValue("--sb-safe-bottom")) || 0;
    safeLeft = parse(cs.getPropertyValue("--sb-safe-left")) || 0;
    safeRight = parse(cs.getPropertyValue("--sb-safe-right")) || 0;
  }

  const minTop = pad + safeTop + vOffTop;
  const maxBottom = vOffTop + vh - pad - safeBottom;
  const minLeft = pad + safeLeft + vOffLeft;
  const maxRight = vOffLeft + vw - pad - safeRight;

  const availH = Math.max(120, maxBottom - minTop);
  const clampedMenuH = Math.min(menuH, availH);

  const spaceBelow = maxBottom - (anchor.bottom + gap);
  const spaceAbove = anchor.top - gap - minTop;
  const openUp =
    preferBelow
      ? spaceBelow < clampedMenuH && spaceAbove > spaceBelow
      : spaceAbove >= clampedMenuH || spaceAbove > spaceBelow;

  let top = openUp ? anchor.top - clampedMenuH - gap : anchor.bottom + gap;
  top = Math.max(minTop, Math.min(top, maxBottom - clampedMenuH));

  let left: number;
  if (opts?.preferLeft) {
    left = anchor.left - menuW - gap;
    if (left < minLeft) left = anchor.right + gap;
  } else {
    left = anchor.left;
    if (left + menuW > maxRight) left = anchor.right - menuW;
  }
  left = Math.max(minLeft, Math.min(left, maxRight - menuW));

  return {
    top,
    left,
    maxHeight: clampedMenuH,
    flippedUp: openUp,
  };
}

/** Write the current viewport height to the document root for CSS + inline fallbacks. */
export function syncShiftBuilderViewportHeight(): number {
  if (typeof document === "undefined") return 0;
  const h = readViewportHeight();
  const px = `${h}px`;
  const root = document.documentElement;
  root.style.setProperty(VIEWPORT_HEIGHT_CSS_VAR, px);
  root.style.height = px;
  document.body.style.height = px;
  // Publish safe-area for JS popover placement (CSS env() is not readable as numbers easily).
  // Probe via temporary element.
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;" +
      "padding-top:env(safe-area-inset-top);" +
      "padding-right:env(safe-area-inset-right);" +
      "padding-bottom:env(safe-area-inset-bottom);" +
      "padding-left:env(safe-area-inset-left);";
    document.body.appendChild(probe);
    const s = getComputedStyle(probe);
    root.style.setProperty("--sb-safe-top", s.paddingTop || "0px");
    root.style.setProperty("--sb-safe-right", s.paddingRight || "0px");
    root.style.setProperty("--sb-safe-bottom", s.paddingBottom || "0px");
    root.style.setProperty("--sb-safe-left", s.paddingLeft || "0px");
    document.body.removeChild(probe);
  } catch {
    /* ignore */
  }
  return h;
}

export type ViewportLockOptions = {
  /** Called after each sync (e.g. re-fit scale, re-equalize card rows). */
  onSync?: () => void;
};

/**
 * Keep `--sb-viewport-height` in sync until cleanup runs.
 * Listens to resize, orientationchange, and visualViewport resize/scroll.
 */
export function installShiftBuilderViewportLock(
  options: ViewportLockOptions = {},
): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => {};
  }

  let raf = 0;
  const apply = () => {
    syncShiftBuilderViewportHeight();
    options.onSync?.();
    window.dispatchEvent(new Event(VIEWPORT_SYNC_EVENT));
  };
  const schedule = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(apply);
  };

  apply();

  window.addEventListener("resize", schedule);
  window.addEventListener("orientationchange", schedule);

  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener("resize", schedule);
    vv.addEventListener("scroll", schedule);
  }

  return () => {
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener("resize", schedule);
    window.removeEventListener("orientationchange", schedule);
    if (vv) {
      vv.removeEventListener("resize", schedule);
      vv.removeEventListener("scroll", schedule);
    }
    const root = document.documentElement;
    root.style.removeProperty(VIEWPORT_HEIGHT_CSS_VAR);
    root.style.height = "";
    document.body.style.height = "";
  };
}