/** Shared artboard / floating-nav layout constants (builder + deployment board). */

// On the main builder view we want the floating pill navbar to hug the very top
// of the viewport (no extra "page header" chrome above it) and shift the entire
// canvas content up so maximum content fits on screen.
export const FLOATING_NAV_TOP_PX = 0;          // was 8 – now tight for builder
export const FLOATING_NAV_HEIGHT_PX = 56;

/** Centered column max width — matches Golden 5-col comfort (~290px zone/rr + wider aux sidebar at 165px). */
export const DEPLOYMENT_CANVAS_MAX_WIDTH_PX = 1581;

/** @deprecated Use DEPLOYMENT_CANVAS_MAX_WIDTH_PX */
export const BUILDER_CANVAS_MAX_WIDTH_PX = DEPLOYMENT_CANVAS_MAX_WIDTH_PX;