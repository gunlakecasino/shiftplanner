import { flushSync } from "react-dom";
import { NATURAL_HEIGHT } from "@/app/shiftbuilder/hooks/useZoom";
import { MARGIN_VALUES, MARGIN_ZOOM } from "@/app/shiftbuilder/components/PrintCommandCenter";
import { postProcessBreaksArtboard } from "@/app/shiftbuilder/print/breaksArtboard";
import type { GoldenPrintPage } from "@/app/shiftbuilder/print/assemblePages";

export type TodayBoardView = "deployment" | "breaks";

export type PrintTodayResult =
  | { ok: true }
  | { ok: false; reason: string };

export type CaptureTodaySheetsOptions = {
  currentView: TodayBoardView;
  setCurrentView: (view: TodayBoardView) => void;
  onSlotClose?: () => void;
  /** Used for Golden page keys (`{dayIndex}-d` / `{dayIndex}-b`). */
  dayIndex: number;
};

export type CaptureTodaySheetsResult =
  | { ok: true; pages: GoldenPrintPage[] }
  | { ok: false; reason: string };

const PRINT_STYLE_ID = "__today-print-override";

/** Live board artboard — never use document.querySelector (stale export containers win). */
function findLiveTodayArtboard(): HTMLElement | null {
  const stage = document.querySelector(".print-stage-inner");
  if (stage) {
    const scoped = stage.querySelector(".print-artboard") as HTMLElement | null;
    if (scoped) return scoped;
  }
  return document.querySelector(".print-artboard") as HTMLElement | null;
}

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

function normalizeCapturedPageHtml(html: string, view: TodayBoardView): string {
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  const artboard = wrap.querySelector(".print-artboard");
  if (artboard) {
    artboard.setAttribute("data-print-view", view);
  }
  return wrap.innerHTML;
}

function isValidArtboardCapture(html: string): boolean {
  return html.includes("print-artboard") && html.length > 200;
}

function isValidBreaksCapture(html: string): boolean {
  return (
    isValidArtboardCapture(html) &&
    (html.includes("Break Sheet") || html.includes("BY BREAK WAVE")) &&
    (html.includes("sb-breaks-wave-grid") || html.includes("grid-cols-4"))
  );
}

/** Wait until React has painted the requested view into the live artboard. */
async function waitForArtboardView(
  artboard: HTMLElement,
  view: TodayBoardView,
  maxMs = 5000,
): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const text = artboard.textContent ?? "";
    if (view === "breaks") {
      const hasMarker = text.includes("Break Sheet") || text.includes("BY BREAK WAVE");
      const hasGrid = !!artboard.querySelector(".sb-breaks-wave-grid, .grid.grid-cols-4");
      if (hasMarker && hasGrid) return true;
    } else if (text.includes("ZONES") && text.includes("RESTROOMS")) {
      return true;
    }
    await nextFrames(2);
  }
  return false;
}

/**
 * Capture deployment + breaks HTML from the live `.print-artboard`.
 * Shared by browser print and Golden PDF export.
 */
export async function captureTodayDualSheets(
  options: CaptureTodaySheetsOptions,
): Promise<CaptureTodaySheetsResult> {
  options.onSlotClose?.();

  // Remove any prior print/export container so querySelector fallbacks stay safe.
  document.querySelector(".print-dual-container")?.remove();

  const liveArtboard = findLiveTodayArtboard();
  if (!liveArtboard) {
    return { ok: false, reason: "Board isn't ready to print yet" };
  }

  const originalView = options.currentView;
  const prevVisibility = liveArtboard.style.visibility;
  const prevPrintView = liveArtboard.getAttribute("data-print-view");

  const restoreLiveArtboard = () => {
    liveArtboard.style.visibility = prevVisibility || "";
    if (prevPrintView === null) liveArtboard.removeAttribute("data-print-view");
    else liveArtboard.setAttribute("data-print-view", prevPrintView);
    flushSync(() => options.setCurrentView(originalView));
  };

  try {
    liveArtboard.style.visibility = "hidden";

    flushSync(() => options.setCurrentView("deployment"));
    liveArtboard.setAttribute("data-print-view", "deployment");
    if (!(await waitForArtboardView(liveArtboard, "deployment"))) {
      restoreLiveArtboard();
      return { ok: false, reason: "Deployment sheet didn't finish loading" };
    }
    liveArtboard.style.visibility = "";
    const deploymentHTML = normalizeCapturedPageHtml(liveArtboard.outerHTML, "deployment");
    liveArtboard.style.visibility = "hidden";

    if (!isValidArtboardCapture(deploymentHTML)) {
      restoreLiveArtboard();
      return { ok: false, reason: "Couldn't capture deployment sheet" };
    }

    flushSync(() => options.setCurrentView("breaks"));
    liveArtboard.setAttribute("data-print-view", "breaks");
    if (!(await waitForArtboardView(liveArtboard, "breaks"))) {
      restoreLiveArtboard();
      return { ok: false, reason: "Break sheet didn't finish loading — try again" };
    }

    const prevHeight = liveArtboard.style.height;
    const prevMinHeight = liveArtboard.style.minHeight;
    const prevDisplay = liveArtboard.style.display;
    const prevFlexDir = liveArtboard.style.flexDirection;

    liveArtboard.style.height = `${NATURAL_HEIGHT}px`;
    liveArtboard.style.minHeight = `${NATURAL_HEIGHT}px`;
    liveArtboard.style.display = "flex";
    liveArtboard.style.flexDirection = "column";

    liveArtboard.getBoundingClientRect();
    await nextFrames(3);
    liveArtboard.style.visibility = "";
    const breaksHTML = normalizeCapturedPageHtml(liveArtboard.outerHTML, "breaks");
    liveArtboard.style.visibility = "hidden";

    liveArtboard.style.height = prevHeight || "";
    liveArtboard.style.minHeight = prevMinHeight || "";
    liveArtboard.style.display = prevDisplay || "";
    liveArtboard.style.flexDirection = prevFlexDir || "";

    restoreLiveArtboard();
    await nextFrames(1);

    if (!isValidBreaksCapture(breaksHTML)) {
      return { ok: false, reason: "Couldn't capture break sheet — board may still be switching views" };
    }

    const dayKey = String(options.dayIndex);
    const pages: GoldenPrintPage[] = [
      { key: `${dayKey}-d`, html: deploymentHTML, kind: "deploy" },
      { key: `${dayKey}-b`, html: breaksHTML, kind: "breaks" },
    ];

    return { ok: true, pages };
  } catch (e) {
    console.error("[today] dual-sheet capture error", e);
    restoreLiveArtboard();
    return { ok: false, reason: "Capture failed — try again" };
  }
}

function injectTodayPrintStyles(): () => void {
  const margin = MARGIN_VALUES.narrow;
  const zoom = MARGIN_ZOOM.narrow;
  const style = document.createElement("style");
  style.id = PRINT_STYLE_ID;
  style.textContent = `
    @page { size: 11in 8.5in landscape; margin: ${margin} !important; }
    @media print {
      .print-dual-container .print-artboard {
        width: 1056px !important;
        height: 816px !important;
        min-height: 816px !important;
        max-height: 816px !important;
        overflow: hidden !important;
        page-break-after: always;
        break-after: page;
        zoom: ${zoom} !important;
        transform: none !important;
        margin: 0 !important;
        box-shadow: none !important;
      }
      .print-dual-container .print-artboard:last-child {
        page-break-after: auto;
        break-after: auto;
      }
    }
  `;
  document.head.appendChild(style);
  return () => style.remove();
}

/**
 * Capture deployment + breaks from the live `.print-artboard` and print both pages.
 */
export async function printTodaySchedule(options: {
  currentView: TodayBoardView;
  setCurrentView: (view: TodayBoardView) => void;
  onSlotClose?: () => void;
  dayIndex: number;
}): Promise<PrintTodayResult> {
  const captured = await captureTodayDualSheets(options);
  if (!captured.ok) return captured;

  const container = document.createElement("div");
  container.className = "print-dual-container";
  container.innerHTML = captured.pages.map((p) => p.html).join("");
  document.body.appendChild(container);

  const artboards = container.querySelectorAll(".print-artboard");
  artboards.forEach((ab, idx) => {
    const view = idx === 0 ? "deployment" : "breaks";
    ab.setAttribute("data-print-view", view);
  });

  const breaksArtboard = artboards[1];
  if (breaksArtboard) postProcessBreaksArtboard(breaksArtboard);

  const removePrintStyles = injectTodayPrintStyles();
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
    await new Promise<void>((resolve) => {
      const finish = () => {
        window.removeEventListener("afterprint", finish);
        resolve();
      };
      window.addEventListener("afterprint", finish, { once: true });
      window.setTimeout(finish, 120_000);
      window.print();
    });
  } finally {
    hiddenBodyChildren.forEach(({ el, prevDisplay }) => {
      el.style.display = prevDisplay;
    });
    document.body.classList.remove("printing-dual-mode");
    removePrintStyles();
    container.remove();
  }

  return { ok: true };
}