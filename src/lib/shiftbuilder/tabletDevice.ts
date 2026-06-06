/** iPad / touch tablet — coarse pointer at tablet widths. */
export function isTabletTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse) and (min-width: 768px)").matches;
}

/** Pencil long-hover opens pad faster on tablet (squeeze unavailable in Safari). */
export function tabletPencilLongHoverDelay(): number {
  return isTabletTouchDevice() ? 1500 : 3500;
}