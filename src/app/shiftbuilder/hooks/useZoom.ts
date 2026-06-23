"use client";

import { useState, useRef, useCallback, useEffect, type RefObject } from "react";
import {
  DEPLOYMENT_CANVAS_MAX_WIDTH_PX,
  FLOATING_NAV_HEIGHT_PX,
} from "@/lib/shiftbuilder/canvasLayout";
import { builderStageBottomInsetPx } from "../components/canvasPillGlass";
import { isTabletTouchDevice, rosterPanelWidth } from "@/lib/shiftbuilder/tabletDevice";

export type ZoomMode = "fit" | number;

// The artboard is locked at 1056×816 (the print contract).
export const NATURAL_WIDTH = 1056;
export const NATURAL_HEIGHT = 816;

/** Fallback builder height before live DOM measurement settles (Golden contract). */
export const BUILDER_NATURAL_HEIGHT = 816;

/** Builder fit tuning — small gutter so the board can use nearly the full stage. */
const BUILDER_CANVAS_PAD_DESKTOP = 12;
const BUILDER_CANVAS_PAD_TABLET = 16;
const BUILDER_FIT_SAFETY_DESKTOP = 0.98;
const BUILDER_FIT_SAFETY_TABLET = 0.95;
/** Ignore sub-pixel content jitter when adopting new builder naturals. */
const BUILDER_NATURAL_HYSTERESIS_PX = 12;

export { isTabletTouchDevice };

export function maxArtboardScale(): number {
  if (isTabletTouchDevice()) return 1.5;
  if (typeof window === "undefined") return 1.5;
  // Adaptability: on larger desktop displays, permit higher zoom for detailed
  // inspection while still respecting the Golden artboard contract.
  const w = window.innerWidth;
  const factor = Math.min(2.0, Math.max(1.0, w / 900));
  return factor;
}

export const TABLET_ZOOM_STEPS = [0.25, 0.4, 0.5, 0.6, 0.75, 0.85, 1, 1.1, 1.15, 1.25, 1.35, 1.5] as const;
export const DESKTOP_ZOOM_STEPS = [0.25, 0.4, 0.5, 0.6, 0.75, 0.85, 1, 1.1, 1.25, 1.5] as const;

export function zoomStepsForDevice(): readonly number[] {
  return isTabletTouchDevice() ? TABLET_ZOOM_STEPS : DESKTOP_ZOOM_STEPS;
}

export type StageInsets = { top: number; right: number; bottom: number; left: number };

export type BuilderFitOptions = {
  /** When true, fit scale is derived from measured builder-workspace content (not Golden 1056×816). */
  enabled: boolean;
  contentRef: RefObject<HTMLDivElement | null>;
  /** Live scale viewport (fluid area above pinned footer) — preferred for availW/H. */
  fitViewportRef?: RefObject<HTMLDivElement | null>;
  /** Extra vertical chrome inside stageHost when fitViewportRef is not used. */
  chromeHeightPx?: number;
  /** When true, pause recomputeScale and ResizeObserver-driven refits (prevents iPad freeze during engine/publish/defaults). */
  pause?: boolean;
  /** When this value changes (e.g. day/view), reset cached naturals so fit can shrink as well as grow. */
  resetToken?: string | number;
  /** Live builder canvas: always stay in fit mode (window resize + content changes re-fit automatically). */
  autoFitLock?: boolean;
};

/**
 * Manages artboard zoom state and the stageHostRef used by the DndContext
 * wrapper. Accepts `rosterOpen` so it can re-fit the scale whenever the
 * floating roster panel opens/closes (the roster shift changes available width).
 *
 * When `builderFit.enabled`, the Fit target scales the full builder workspace
 * (zones + restrooms + aux) into the viewport instead of the Golden paper box.
 */
export type ArtboardNaturalSize = { w: number; h: number };

export function useZoom({
  rosterOpen,
  stageInsets,
  builderFit,
  artboardSize,
}: {
  rosterOpen: boolean;
  stageInsets: StageInsets;
  builderFit?: BuilderFitOptions;
  /** Override Golden 1056×816 for modes like duplex print preview (992×399). */
  artboardSize?: ArtboardNaturalSize;
}) {
  const [isTabletTouch, setIsTabletTouch] = useState(isTabletTouchDevice);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit");
  const [fitScale, setFitScale] = useState(() => {
    if (typeof window === "undefined") return 0.85;

    const useBuilderNatural = builderFit?.enabled ?? false;
    const max = maxArtboardScale();
    const fitCap = useBuilderNatural ? 1 : max;

    // Mirror stage chrome so the very first paint is already close to the final fit.
    const rosterInset = rosterOpen ? rosterPanelWidth() + 12 : 0;
    const canvasPad = useBuilderNatural ? BUILDER_CANVAS_PAD_DESKTOP : 40;
    const availW =
      window.innerWidth -
      rosterInset -
      (useBuilderNatural ? 16 + 24 + canvasPad : 80);
    const availH =
      window.innerHeight -
      (useBuilderNatural
        ? FLOATING_NAV_HEIGHT_PX +
          builderStageBottomInsetPx() +
          canvasPad +
          (builderFit?.chromeHeightPx ?? 0)
        : 90);

    const natW = useBuilderNatural
      ? DEPLOYMENT_CANVAS_MAX_WIDTH_PX
      : (artboardSize?.w ?? NATURAL_WIDTH);
    const natH = useBuilderNatural
      ? BUILDER_NATURAL_HEIGHT
      : (artboardSize?.h ?? NATURAL_HEIGHT);

    const byW = availW / natW;
    const byH = availH / natH;

    const fit = useBuilderNatural
      ? Math.min(fitCap, byW, byH) * BUILDER_FIT_SAFETY_DESKTOP
      : isTabletTouchDevice()
        ? Math.min(max, byW, byH)
        : Math.min(1, byW, byH);
    return Math.max(useBuilderNatural ? 0.45 : 0.35, fit);
  });
  const stageHostRef = useRef<HTMLDivElement>(null);

  // Live refs (hoisted before any callbacks/effects) so recomputeScale + wheel handlers
  // can read latest without adding to deps or causing cb churn. Initial values from
  // mount state; kept in sync by the effects below.
  const zoomModeRef = useRef<ZoomMode>(zoomMode);
  const fitScaleRef = useRef<number>(fitScale);
  const stepsRef = useRef<readonly number[]>(zoomStepsForDevice());

  const builderFitEnabled = builderFit?.enabled ?? false;
  const builderChromeHeight = builderFit?.chromeHeightPx ?? 0;
  const builderAutoFitLock = builderFit?.autoFitLock ?? false;

  // Stable naturals with hysteresis — adopt width/height changes in either direction
  // so the board always fits the window without micro-jitter from single task adds.
  const initialNat = builderFitEnabled
    ? { w: DEPLOYMENT_CANVAS_MAX_WIDTH_PX, h: BUILDER_NATURAL_HEIGHT }
    : { w: artboardSize?.w ?? NATURAL_WIDTH, h: artboardSize?.h ?? NATURAL_HEIGHT };
  const stableNaturalRef = useRef(initialNat);

  // Intricate debounce to avoid thrashing on rapid window resizes while staying very responsive.
  const recomputeScale = useCallback(() => {
    if (builderFit?.pause) return; // don't thrash scale during heavy updates (iPad freeze fix)
    const el = stageHostRef.current;
    const insets = stageInsets;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    // Prefer visualViewport on iPad/Safari — it correctly reports the visible area excluding dynamic toolbars.
    const vpW = (vv && vv.width > 50) ? vv.width : window.innerWidth;
    const vpH = (vv && vv.height > 50) ? vv.height : window.innerHeight;
    let availW = 0;
    let availH = 0;

    const fitViewport = builderFit?.fitViewportRef?.current;
    if (fitViewport && fitViewport.clientWidth > 50 && fitViewport.clientHeight > 50) {
      const isTablet = isTabletTouchDevice();
      const canvasPad = isTablet ? BUILDER_CANVAS_PAD_TABLET : BUILDER_CANVAS_PAD_DESKTOP;
      availW = Math.max(0, fitViewport.clientWidth - canvasPad);
      availH = Math.max(0, fitViewport.clientHeight - canvasPad);
    } else if (el && el.clientWidth > 50 && el.clientHeight > 50) {
      const isTablet = isTabletTouchDevice();
      const canvasPad = builderFitEnabled
        ? (isTablet ? BUILDER_CANVAS_PAD_TABLET : BUILDER_CANVAS_PAD_DESKTOP)
        : 24;
      // clientWidth/Height include padding — subtract it to get the content box.
      const contentBox = stageContentBox(el);
      availW = contentBox.w - canvasPad;
      availH = contentBox.h - canvasPad;
    } else {
      // Fallback (early mount etc). Full calculation using visualViewport + insets.
      availW = vpW - insets.left - insets.right - (builderFitEnabled ? 72 : 40);
      availH = vpH - insets.top - insets.bottom - (builderFitEnabled ? 72 : 40);
    }

    if (builderFitEnabled && !fitViewport) {
      availH -= builderChromeHeight;
    }

    const max = maxArtboardScale();
    const fitCap = builderFitEnabled ? 1 : max;
    const stable = stableNaturalRef.current;
    let naturalW = builderFitEnabled ? stable.w : (artboardSize?.w ?? NATURAL_WIDTH);
    let naturalH = builderFitEnabled ? stable.h : (artboardSize?.h ?? NATURAL_HEIGHT);

    if (builderFitEnabled) {
      const content = builderFit?.contentRef.current;
      if (content) {
        const measured = measureBuilderFitNaturals(content);
        if (measured.w > 80 && Math.abs(measured.w - stable.w) > BUILDER_NATURAL_HYSTERESIS_PX) {
          stable.w = measured.w;
        }
        if (measured.h > 80 && Math.abs(measured.h - stable.h) > BUILDER_NATURAL_HYSTERESIS_PX) {
          stable.h = measured.h;
        }
      }
      naturalW = stable.w;
      naturalH = stable.h;
    }

    const byWidth = availW / naturalW;
    const byHeight = availH / naturalH;

    // Fit the measured builder workspace into the stage — strict width + height bind
    // so deployment + breaks + restrooms always stay inside the visible window.
    const next = Math.min(fitCap, max, byWidth, byHeight);

    const isTablet = isTabletTouchDevice();
    const safety = builderFitEnabled
      ? (isTablet ? BUILDER_FIT_SAFETY_TABLET : BUILDER_FIT_SAFETY_DESKTOP)
      : 0.97;
    const proposed = Math.max(builderFitEnabled ? 0.55 : 0.25, next * safety);
    // Epsilon guard + ref check: DOM measurements, RO callbacks, and initial layout
    // thrash (content height changes as assignments/aux mount) can produce micro
    // deltas (0.000x) or same-value recomputes. Unconditional setFitScale was the
    // direct cause of "Maximum update depth exceeded" in recomputeScale.
    const current = fitScaleRef.current;
    if (current == null || Math.abs(current - proposed) > 0.001) {
      setFitScale(proposed);
    }
  }, [
    stageInsets,
    builderFitEnabled,
    builderChromeHeight,
    builderFit?.contentRef,
    builderFit?.fitViewportRef,
    builderFit?.pause,
    artboardSize?.w,
    artboardSize?.h,
  ]);

  useEffect(() => {
    if (!builderFitEnabled || builderFit?.resetToken == null) return;
    stableNaturalRef.current = {
      w: DEPLOYMENT_CANVAS_MAX_WIDTH_PX,
      h: BUILDER_NATURAL_HEIGHT,
    };
    setZoomMode("fit");
    const t1 = requestAnimationFrame(recomputeScale);
    const t2 = window.setTimeout(recomputeScale, 80);
    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(t2);
    };
  }, [builderFitEnabled, builderFit?.resetToken, recomputeScale, setZoomMode]);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse) and (min-width: 768px)");
    const onMq = () => setIsTabletTouch(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);

    const t1 = requestAnimationFrame(recomputeScale);
    const t2 = window.setTimeout(recomputeScale, 80);
    const t3 = window.setTimeout(recomputeScale, 220);

    const ro = stageHostRef.current
      ? new ResizeObserver(recomputeScale)
      : null;
    if (ro && stageHostRef.current) ro.observe(stageHostRef.current);

    // Intricate responsive resize: RAF for smooth, plus light debounce + orientation for mobile.
    // Especially important on iPad/Safari where visualViewport changes with toolbars, split-view, keyboard.
    let resizeTimer: number | null = null;
    const onResize = () => {
      if (builderAutoFitLock) {
        setZoomMode("fit");
      }
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        requestAnimationFrame(recomputeScale);
      }, 32);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", () => requestAnimationFrame(recomputeScale));

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", onResize);
      // Some Safari versions also need this for iPad toolbar collapse
      vv.addEventListener("scroll", () => requestAnimationFrame(recomputeScale));
    }

    return () => {
      mq.removeEventListener("change", onMq);
      cancelAnimationFrame(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", recomputeScale);
      if (vv) {
        vv.removeEventListener("resize", onResize);
        vv.removeEventListener("scroll", recomputeScale);  // note: recomputeScale is stable via ref in practice
      }
      if (ro) ro.disconnect();
      if (resizeTimer) window.clearTimeout(resizeTimer);
    };
  }, [recomputeScale, builderAutoFitLock, setZoomMode]);

  useEffect(() => {
    const t1 = requestAnimationFrame(recomputeScale);
    const t2 = window.setTimeout(recomputeScale, 320);
    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(t2);
    };
  }, [rosterOpen, stageInsets, recomputeScale, artboardSize?.w, artboardSize?.h]);

  // Builder workspace: re-fit whenever measured content size changes meaningfully.
  useEffect(() => {
    if (!builderFitEnabled) return;
    const content = builderFit?.contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;

    const lastContent = { w: 0, h: 0 };
    const ro = new ResizeObserver(() => {
      if (builderFit?.pause) return;
      const w = content.scrollWidth || content.offsetWidth || 0;
      const h = content.scrollHeight || content.offsetHeight || 0;
      const changed =
        Math.abs(w - lastContent.w) > BUILDER_NATURAL_HYSTERESIS_PX ||
        Math.abs(h - lastContent.h) > BUILDER_NATURAL_HYSTERESIS_PX;
      lastContent.w = w;
      lastContent.h = h;
      if (changed) {
        if (builderAutoFitLock) {
          setZoomMode("fit");
        }
        requestAnimationFrame(recomputeScale);
      }
    });
    ro.observe(content);

    const t = window.setTimeout(recomputeScale, 120);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [
    builderFitEnabled,
    builderFit?.contentRef,
    recomputeScale,
    builderFit?.pause,
    builderAutoFitLock,
    setZoomMode,
  ]);

  const rawScale =
    builderAutoFitLock || zoomMode === "fit" ? fitScale : zoomMode;
  const scale = Math.min(rawScale, maxArtboardScale());

  // Ref sync effects (refs were hoisted at top of hook for early cb access).
  // These keep the .current values fresh after any state-driven re-render.
  useEffect(() => {
    zoomModeRef.current = zoomMode;
  }, [zoomMode]);
  useEffect(() => {
    fitScaleRef.current = fitScale;
  }, [fitScale]);
  useEffect(() => {
    stepsRef.current = zoomStepsForDevice();
  }, [isTabletTouch]);

  // Desktop mouse wheel zoom (ctrl/meta + wheel) for extra adaptability.
  // Gives fine-grained control in addition to the +/- buttons and discrete steps.
  // Tablet uses pinch via useStagePinchPan instead.
  useEffect(() => {
    if (isTabletTouch || builderAutoFitLock) return;
    const el = stageHostRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();

      const currentScale = zoomModeRef.current === "fit" ? fitScaleRef.current : (zoomModeRef.current as number);
      const dir = e.deltaY < 0 ? 1 : -1;
      const delta = dir * 0.08; // ~8% per wheel tick for responsive feel
      let next = clamp(currentScale + delta, 0.25, maxArtboardScale());

      // Prefer snapping to a nearby discrete step for "variations" consistency
      const steps = stepsRef.current;
      const snapped = steps.reduce((best, s) =>
        Math.abs(s - next) < Math.abs(best - next) ? s : best, steps[0]
      );
      if (Math.abs(snapped - next) < 0.06) {
        next = snapped;
      }

      setZoomMode(next);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isTabletTouch, builderAutoFitLock, setZoomMode]);

  return {
    zoomMode,
    setZoomMode,
    fitScale,
    stageHostRef,
    scale,
    recomputeScale,
    maxScale: maxArtboardScale(),
    zoomSteps: zoomStepsForDevice(),
    isTabletTouch,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * Intrinsic builder board size at scale 1. Avoids scrollHeight on the scale wrapper
 * (which inflates when the sidebar grid uses height:100% / fr rows).
 */
export function measureBuilderFitNaturals(root: HTMLElement): { w: number; h: number } {
  const workspace = root.querySelector<HTMLElement>(".builder-workspace");
  if (!workspace) {
    return {
      w: Math.min(DEPLOYMENT_CANVAS_MAX_WIDTH_PX, root.offsetWidth || DEPLOYMENT_CANVAS_MAX_WIDTH_PX),
      h: Math.max(root.offsetHeight, 320),
    };
  }

  const sidebar = workspace.querySelector<HTMLElement>(".sb-with-aux-sidebar");
  const header = workspace.querySelector<HTMLElement>(".sheet-header");
  const headerH = header?.offsetHeight ?? 0;
  let bodyH = 0;

  if (sidebar) {
    const prevHeight = sidebar.style.height;
    const prevMinH = sidebar.style.minHeight;
    sidebar.style.height = "auto";
    sidebar.style.minHeight = "0";
    bodyH = sidebar.offsetHeight;
    sidebar.style.height = prevHeight;
    sidebar.style.minHeight = prevMinH;
  } else {
    bodyH = Math.max(0, workspace.offsetHeight - headerH);
  }

  const w = Math.min(
    DEPLOYMENT_CANVAS_MAX_WIDTH_PX,
    Math.max(workspace.offsetWidth, root.offsetWidth),
  );

  return {
    w: Math.max(320, w),
    h: Math.max(320, headerH + bodyH),
  };
}

/** Content box inside a padded stage host (client* includes padding). */
function stageContentBox(el: HTMLElement): { w: number; h: number } {
  const cs = getComputedStyle(el);
  const padL = parseFloat(cs.paddingLeft) || 0;
  const padR = parseFloat(cs.paddingRight) || 0;
  const padT = parseFloat(cs.paddingTop) || 0;
  const padB = parseFloat(cs.paddingBottom) || 0;
  return {
    w: Math.max(0, el.clientWidth - padL - padR),
    h: Math.max(0, el.clientHeight - padT - padB),
  };
}