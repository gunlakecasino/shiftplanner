/** iPad / touch tablet — coarse pointer at tablet widths. */
export function isTabletTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse) and (min-width: 768px)").matches;
}

/** Floating roster width — compact on tablet for more artboard space. */
export function rosterPanelWidth(): number {
  return isTabletTouchDevice() ? 200 : 268;
}

/** Stage left inset when roster is open (panel width + breathing room). */
export function rosterStageLeftInset(): number {
  return rosterPanelWidth() + 12;
}

/** Pencil long-hover opens pad faster on tablet (squeeze unavailable in Safari). */
export function tabletPencilLongHoverDelay(): number {
  return isTabletTouchDevice() ? 1500 : 3500;
}