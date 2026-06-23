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

/** Write the current viewport height to the document root for CSS + inline fallbacks. */
export function syncShiftBuilderViewportHeight(): number {
  if (typeof document === "undefined") return 0;
  const h = readViewportHeight();
  const px = `${h}px`;
  const root = document.documentElement;
  root.style.setProperty(VIEWPORT_HEIGHT_CSS_VAR, px);
  root.style.height = px;
  document.body.style.height = px;
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