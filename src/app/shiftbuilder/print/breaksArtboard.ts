/**
 * Post-process a breaks .print-artboard so wave columns fill available space
 * and Overlaps stays pinned above the footer (Golden contract).
 */
export function postProcessBreaksArtboard(artboard: Element): void {
  const el = artboard as HTMLElement;

  const contentShell = el.querySelector(
    ".flex.flex-col.w-full.flex-1",
  ) as HTMLElement | null;
  if (contentShell) {
    contentShell.style.display = "flex";
    contentShell.style.flexDirection = "column";
    contentShell.style.flex = "1 1 0%";
    contentShell.style.minHeight = "0";
    contentShell.style.overflow = "hidden";
  }

  const waveGrid = el.querySelector(
    ".grid.grid-cols-3",
  ) as HTMLElement | null;
  if (waveGrid) {
    waveGrid.style.flex = "1 1 0%";
    waveGrid.style.minHeight = "0";
    waveGrid.style.overflow = "hidden";
  }

  const overlaps = el.querySelector(".overlaps-section") as HTMLElement | null;
  if (overlaps) {
    overlaps.style.flexShrink = "0";
    overlaps.style.marginTop = "auto";
  }
}