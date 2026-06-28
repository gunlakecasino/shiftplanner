/** Coarse-pointer tablet media query — iPad Safari, etc. */
export const TABLET_TOUCH_MQ = "(pointer: coarse) and (min-width: 768px)";

/** Compact nav (icon-only Builder/Preview) up through iPad Pro 13″ landscape (1376px). */
export const TABLET_COMPACT_NAV_MAX_WIDTH_PX = 1400;

export const TABLET_COMPACT_NAV_MQ = `${TABLET_TOUCH_MQ} and (max-width: ${TABLET_COMPACT_NAV_MAX_WIDTH_PX}px)`;

/** iPad / touch tablet — coarse pointer at tablet widths. */
export function isTabletTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia(TABLET_TOUCH_MQ).matches;
}

/** Floating roster width — compact "module" so it doesn't cover half the board on iPad or MacBook. */
export function rosterPanelWidth(): number {
  return isTabletTouchDevice() ? 192 : 232;
}

/** Stage left inset when roster is open (panel width + breathing room). */
export function rosterStageLeftInset(): number {
  return rosterPanelWidth() + 16;
}

/** Pencil long-hover opens pad faster on tablet (squeeze unavailable in Safari). */
export function tabletPencilLongHoverDelay(): number {
  return isTabletTouchDevice() ? 1500 : 3500;
}

/** Right-side Placement Dock width on iPad (inspector panel). */
export const PLACEMENT_DOCK_WIDTH_PX = 380;

export function placementDockStageRightInset(): number {
  return isTabletTouchDevice() ? PLACEMENT_DOCK_WIDTH_PX + 8 : 0;
}