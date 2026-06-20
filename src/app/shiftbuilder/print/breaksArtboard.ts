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
    ".sb-breaks-wave-grid, .grid.grid-cols-4",
  ) as HTMLElement | null;
  if (waveGrid) {
    waveGrid.classList.add("sb-breaks-wave-grid");
    waveGrid.style.display = "grid";
    waveGrid.style.width = "100%";
    waveGrid.style.maxWidth = "100%";
    waveGrid.style.flex = "1 1 0%";
    waveGrid.style.minHeight = "0";
    waveGrid.style.overflow = "hidden";
    waveGrid.style.alignContent = "stretch";
    waveGrid.style.gridTemplateColumns = "repeat(4, minmax(0, 1fr))";
  }

  waveGrid?.querySelectorAll<HTMLElement>(":scope > div").forEach((col) => {
    col.style.height = "100%";
    col.style.minHeight = "0";
    col.style.display = "flex";
    col.style.flexDirection = "column";
  });

  const overlaps = el.querySelector(".overlaps-section") as HTMLElement | null;
  if (overlaps) {
    overlaps.style.flexShrink = "0";
    overlaps.style.marginTop = "auto";
  }
}