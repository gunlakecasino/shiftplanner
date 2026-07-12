/** Coarse-pointer tablet media query — full-width iPad Safari, etc. */
export const TABLET_TOUCH_MQ = "(pointer: coarse) and (min-width: 768px)";

/** Any finger/pencil surface (includes iPad Split View / Stage Manager < 768px). */
export const COARSE_POINTER_MQ = "(pointer: coarse)";

/** Compact nav (icon-only Builder/Preview) up through iPad Pro 13″ landscape (1376px). */
export const TABLET_COMPACT_NAV_MAX_WIDTH_PX = 1400;

export const TABLET_COMPACT_NAV_MQ = `${TABLET_TOUCH_MQ} and (max-width: ${TABLET_COMPACT_NAV_MAX_WIDTH_PX}px)`;

/**
 * True for any coarse pointer (finger / Apple Pencil).
 * Use for interaction mode: single-tap pads, larger drag distance, haptics.
 * Does NOT require min-width — Split View iPad is often < 768 CSS px.
 */
export function isCoarsePointerDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia(COARSE_POINTER_MQ).matches) return true;
    // Hybrid / older: no hover + fine pointer still often means touch-primary.
    if (window.matchMedia("(hover: none)").matches && "ontouchstart" in window) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Layout tablet: coarse pointer at tablet widths (full-screen iPad, not phone).
 * Use for panel widths, dock chrome, default roster collapsed, etc.
 */
export function isTabletTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia(TABLET_TOUCH_MQ).matches;
  } catch {
    return false;
  }
}

/**
 * iPad / finger: single tap opens placement & tasks pads.
 * Desktop mouse: double-click (see CardTaskZone.padUsesSingleTap).
 * Uses coarse pointer (not min-width 768) so Split View still single-taps.
 */
export function padUsesSingleTap(): boolean {
  return isCoarsePointerDevice();
}

/** Floating roster width — compact on tablet for more artboard space. */
export function rosterPanelWidth(): number {
  return isTabletTouchDevice() || isCoarsePointerDevice() ? 200 : 268;
}

/** Stage left inset when roster is open (panel width + breathing room). */
export function rosterStageLeftInset(): number {
  return rosterPanelWidth() + 12;
}

/** Pencil long-hover opens pad faster on tablet (squeeze unavailable in Safari). */
export function tabletPencilLongHoverDelay(): number {
  return isCoarsePointerDevice() ? 1500 : 3500;
}

/** Right-side Placement Dock width on iPad (inspector panel). */
export const PLACEMENT_DOCK_WIDTH_PX = 380;

export function placementDockStageRightInset(): number {
  return isTabletTouchDevice() || isCoarsePointerDevice()
    ? PLACEMENT_DOCK_WIDTH_PX + 8
    : 0;
}
