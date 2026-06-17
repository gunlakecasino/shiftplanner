import { flushSync } from "react-dom";
import { NATURAL_HEIGHT } from "@/app/shiftbuilder/hooks/useZoom";

export type TodayBoardView = "deployment" | "breaks";

export type PrintTodayResult =
  | { ok: true }
  | { ok: false; reason: string };

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

function captureArtboardHtml(): string {
  const el = document.querySelector(".print-artboard") as HTMLElement | null;
  return el?.outerHTML ?? "";
}

function isValidArtboardCapture(html: string): boolean {
  return html.includes("print-artboard") && html.length > 200;
}

/**
 * Imperative post-processing of the captured breaks artboard clone.
 * Compensates for screen layout vs print-fixed layout on the breaks view.
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
 */
export async function printTodaySchedule(options: {
  currentView: TodayBoardView;
  setCurrentView: (view: TodayBoardView) => void;
  onSlotClose?: () => void;
}): Promise<PrintTodayResult> {
  options.onSlotClose?.();

  const liveArtboard = document.querySelector(".print-artboard") as HTMLElement | null;
  if (!liveArtboard) {
    return { ok: false, reason: "Board isn't ready to print yet" };
  }

  const originalView = options.currentView;
  const prevVisibility = liveArtboard.style.visibility;

  const restoreLiveArtboard = () => {
    liveArtboard.style.visibility = prevVisibility || "";
    flushSync(() => options.setCurrentView(originalView));
  };

  try {
    liveArtboard.style.visibility = "hidden";

    flushSync(() => options.setCurrentView("deployment"));
    await nextFrames(2);
    liveArtboard.style.visibility = "";
    const deploymentHTML = captureArtboardHtml();
    liveArtboard.style.visibility = "hidden";

    if (!isValidArtboardCapture(deploymentHTML)) {
      restoreLiveArtboard();
      return { ok: false, reason: "Couldn't capture deployment sheet" };
    }

    flushSync(() => options.setCurrentView("breaks"));
    await nextFrames(2);

    const artboardForBreaks = document.querySelector(".print-artboard") as HTMLElement | null;
    const prevHeight = artboardForBreaks?.style.height;
    const prevMinHeight = artboardForBreaks?.style.minHeight;
    const prevDisplay = artboardForBreaks?.style.display;
    const prevFlexDir = artboardForBreaks?.style.flexDirection;

    if (artboardForBreaks) {
      artboardForBreaks.style.height = `${NATURAL_HEIGHT}px`;
      artboardForBreaks.style.minHeight = `${NATURAL_HEIGHT}px`;
      artboardForBreaks.style.display = "flex";
      artboardForBreaks.style.flexDirection = "column";
    }

    artboardForBreaks?.getBoundingClientRect();
    await nextFrames(1);

    const breaksHTML = captureArtboardHtml();

    if (artboardForBreaks) {
      artboardForBreaks.style.height = prevHeight || "";
      artboardForBreaks.style.minHeight = prevMinHeight || "";
      artboardForBreaks.style.display = prevDisplay || "";
      artboardForBreaks.style.flexDirection = prevFlexDir || "";
    }

    restoreLiveArtboard();
    await nextFrames(1);

    if (!isValidArtboardCapture(breaksHTML)) {
      return { ok: false, reason: "Couldn't capture break sheet" };
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

    return { ok: true };
  } catch (e) {
    console.error("[today] dual-page print error", e);
    restoreLiveArtboard();
    document.body.classList.remove("printing-dual-mode");
    document.querySelector(".print-dual-container")?.remove();
    return { ok: false, reason: "Print failed — try again" };
  }
}