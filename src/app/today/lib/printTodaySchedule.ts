import { flushSync } from "react-dom";

export type TodayBoardView = "deployment" | "breaks";

function nextFrames(n: number): Promise<void> {
  return new Promise((resolve) => {
    let count = 0;
    const tick = () => {
      count += 1;
      if (count >= n) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Imperative post-processing of the captured breaks artboard clone.
 * These style overrides compensate for the fact that the live component tree
 * is laid out for screen (with dynamic heights, scroll areas, etc.) and needs
 * to be forced into a print-friendly fixed layout for the dual-page capture.
 *
 * WARNING: This is tightly coupled to the current JSX structure inside the
 * breaks view of ShiftBuilderBoard / wave rendering. Update in lockstep.
 */
function postProcessBreaksArtboard(breaksArtboard: Element) {
  const contentArea = breaksArtboard.querySelector(
    ".flex-1.min-h-0.overflow-hidden.flex.flex-col",
  ) as HTMLElement | null;
  if (contentArea) {
    contentArea.style.display = "flex";
    contentArea.style.flexDirection = "column";
    contentArea.style.flex = "1 1 0%";
    contentArea.style.minHeight = "0";
    contentArea.style.overflow = "hidden";
  }

  const waveGrid = contentArea?.firstElementChild as HTMLElement | null;
  if (waveGrid && waveGrid !== contentArea?.querySelector(".overlaps-section")) {
    waveGrid.style.flex = "1 1 0%";
    waveGrid.style.minHeight = "0";
    waveGrid.style.overflow = "hidden";
    waveGrid.style.alignContent = "start";
  }

  const overlaps = breaksArtboard.querySelector(".overlaps-section") as HTMLElement | null;
  if (overlaps) {
    overlaps.style.flexShrink = "0";
    overlaps.style.marginTop = "0";
  }
}

/**
 * Capture deployment + breaks from the live `.print-artboard` and print both pages.
 * Mirrors ShiftBuilder's dual-page print path for a single already-loaded night.
 *
 * PRODUCTION NOTES / HARDENING TARGETS:
 * - Heavy reliance on live DOM structure (class names like ".print-artboard",
 *   ".flex-1.min-h-0.overflow-hidden.flex.flex-col", ".overlaps-section").
 *   Any refactor of ShiftBuilderBoard / breaks rendering can break the capture.
 * - Uses flushSync + rAF sequencing to let React commit view toggles before
 *   reading outerHTML. Fragile but required for snapshotting the same mounted tree
 *   in two states.
 * - Temporarily mutates inline styles on the live artboard and the cloned breaks
 *   one, then restores. postProcessBreaksArtboard does additional imperative fixes.
 * - Falls back to plain window.print() if no artboard or capture fails.
 * - The 816px forced height for breaks is tied to the sacred artboard contract.
 */
export async function printTodaySchedule(options: {
  currentView: TodayBoardView;
  setCurrentView: (view: TodayBoardView) => void;
  onSlotClose?: () => void;
}): Promise<void> {
  options.onSlotClose?.();

  const liveArtboard = document.querySelector(".print-artboard") as HTMLElement | null;
  if (!liveArtboard) {
    window.print();
    return;
  }

  const originalView = options.currentView;

  try {
    liveArtboard.style.visibility = "hidden";

    flushSync(() => options.setCurrentView("deployment"));
    await nextFrames(2);
    liveArtboard.style.visibility = "";
    const deploymentHTML =
      (document.querySelector(".print-artboard") as HTMLElement | null)?.outerHTML ?? "";
    liveArtboard.style.visibility = "hidden";

    flushSync(() => options.setCurrentView("breaks"));
    await nextFrames(2);

    const artboardForBreaks = document.querySelector(".print-artboard") as HTMLElement | null;
    const prevHeight = artboardForBreaks?.style.height;
    const prevMinHeight = artboardForBreaks?.style.minHeight;
    const prevDisplay = artboardForBreaks?.style.display;
    const prevFlexDir = artboardForBreaks?.style.flexDirection;

    if (artboardForBreaks) {
      artboardForBreaks.style.height = "816px";
      artboardForBreaks.style.minHeight = "816px";
      artboardForBreaks.style.display = "flex";
      artboardForBreaks.style.flexDirection = "column";
    }

    artboardForBreaks?.getBoundingClientRect();
    await nextFrames(1);

    const breaksHTML =
      (document.querySelector(".print-artboard") as HTMLElement | null)?.outerHTML ?? "";

    if (artboardForBreaks) {
      artboardForBreaks.style.height = prevHeight || "";
      artboardForBreaks.style.minHeight = prevMinHeight || "";
      artboardForBreaks.style.display = prevDisplay || "";
      artboardForBreaks.style.flexDirection = prevFlexDir || "";
    }

    flushSync(() => options.setCurrentView(originalView));
    await nextFrames(1);
    liveArtboard.style.visibility = "";

    if (!deploymentHTML || !breaksHTML) {
      console.warn("[today] dual-page print failed to capture views; falling back");
      window.print();
      return;
    }

    const container = document.createElement("div");
    container.className = "print-dual-container";
    container.innerHTML = deploymentHTML + breaksHTML;
    document.body.appendChild(container);

    const breaksArtboard = container.querySelectorAll(".print-artboard")[1];
    if (breaksArtboard) postProcessBreaksArtboard(breaksArtboard);

    document.body.classList.add("printing-dual-mode");

    const hiddenBodyChildren: { el: HTMLElement; prevDisplay: string }[] = [];
    Array.from(document.body.children).forEach((child) => {
      const el = child as HTMLElement;
      if (el !== container && el.tagName !== "SCRIPT" && el.tagName !== "STYLE") {
        hiddenBodyChildren.push({ el, prevDisplay: el.style.display });
        el.style.display = "none";
      }
    });

    try {
      window.print();
    } finally {
      hiddenBodyChildren.forEach(({ el, prevDisplay }) => {
        el.style.display = prevDisplay;
      });
      document.body.classList.remove("printing-dual-mode");
      container.remove();
    }
  } catch (e) {
    console.error("[today] dual-page print error", e);
    document.body.classList.remove("printing-dual-mode");
    document.querySelector(".print-dual-container")?.remove();
  }
}