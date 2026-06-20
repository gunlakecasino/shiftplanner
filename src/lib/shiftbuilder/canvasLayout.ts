/** Shared artboard / floating-nav layout constants (builder + deployment board). */

// On the main builder view we want the floating pill navbar to hug the very top
// of the viewport (no extra "page header" chrome above it) and shift the entire
// canvas content up so maximum content fits on screen.
export const FLOATING_NAV_TOP_PX = 0;          // was 8 – now tight for builder
export const FLOATING_NAV_HEIGHT_PX = 50;

/** Floating nav is ~15% narrower than the deployment canvas below it. */
export const FLOATING_NAV_WIDTH_SCALE = 0.85;

/** Centered column max width — matches Golden 5-col comfort (~290px zone/rr + wider aux sidebar at 165px). */
export const DEPLOYMENT_CANVAS_MAX_WIDTH_PX = 1581;

/** Max width of the centered floating nav pill (builder + preview). */
export const FLOATING_NAV_MAX_WIDTH_PX = Math.round(
  DEPLOYMENT_CANVAS_MAX_WIDTH_PX * FLOATING_NAV_WIDTH_SCALE,
);

/** Fallback nav cap when no canvas width is passed (non-builder routes). */
export const FLOATING_NAV_FALLBACK_MAX_WIDTH_PX = Math.round(900 * FLOATING_NAV_WIDTH_SCALE);

/** Horizontal margin from viewport edges (24px per side). */
export const FLOATING_NAV_VIEWPORT_GUTTER_PX = 48;

/**
 * CSS width for the centered floating nav pill.
 * Scales the viewport term by FLOATING_NAV_WIDTH_SCALE so the bar is visibly
 * narrower than the deployment canvas (not only capped on ultra-wide monitors).
 */
export function floatingNavWidthCss(capPx: number = FLOATING_NAV_MAX_WIDTH_PX): string {
  return `min(calc((100vw - ${FLOATING_NAV_VIEWPORT_GUTTER_PX}px) * ${FLOATING_NAV_WIDTH_SCALE}), ${capPx}px)`;
}

/** @deprecated Use DEPLOYMENT_CANVAS_MAX_WIDTH_PX */
export const BUILDER_CANVAS_MAX_WIDTH_PX = DEPLOYMENT_CANVAS_MAX_WIDTH_PX;