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

/** Representative builder workspace height before live DOM measurement settles. */
export const BUILDER_NATURAL_HEIGHT = 1000;

/** Builder fit tuning — balance "see everything" vs feeling too zoomed out on load. */
const BUILDER_CANVAS_PAD_DESKTOP = 44;
const BUILDER_CANVAS_PAD_TABLET = 56;
const BUILDER_FIT_SAFETY_DESKTOP = 0.97;
const BUILDER_FIT_SAFETY_TABLET = 0.93;
/** When height binds, allow a hair more zoom-in (bottom chrome can clip slightly). */
const BUILDER_HEIGHT_RELAX_DESKTOP = 1.12;

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
  /** Extra vertical chrome inside stageHost (e.g. week health bar slot). */
  chromeHeightPx?: number;
  /** When true, pause recomputeScale and ResizeObserver-driven refits (prevents iPad freeze during engine/publish/defaults). */
  pause?: boolean;
};

/**
 * Manages artboard zoom state and the stageHostRef used by the DndContext
 * wrapper. Accepts `rosterOpen` so it can re-fit the scale whenever the
 * floating roster panel opens/closes (the roster shift changes available width).
 *
 * When `builderFit.enabled`, the Fit target scales the full builder workspace
 * (zones + restrooms + aux) into the viewport instead of the Golden paper box.
 */
export function useZoom({
  rosterOpen,
  stageInsets,
  builderFit,
}: {
  rosterOpen: boolean;
  stageInsets: StageInsets;
  builderFit?: BuilderFitOptions;
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
        ? FLOATING_NAV_HEIGHT_PX + builderStageBottomInsetPx() + canvasPad
        : 90);

    const natW = useBuilderNatural ? DEPLOYMENT_CANVAS_MAX_WIDTH_PX : NATURAL_WIDTH;
    const natH = useBuilderNatural ? BUILDER_NATURAL_HEIGHT : NATURAL_HEIGHT;

    const byW = availW / natW;
    const byH = availH / natH;

    let fit: number;
    if (useBuilderNatural) {
      const relaxedH = byH * BUILDER_HEIGHT_RELAX_DESKTOP;
      fit = Math.min(fitCap, byW, relaxedH) * BUILDER_FIT_SAFETY_DESKTOP;
    } else {
      fit = isTabletTouchDevice()
        ? Math.min(max, byW, byH)
        : Math.min(1, byW, byH);
    }
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

  // Stable naturals to avoid tiny content deltas (single task add, etc) causing
  // visible fitScale "shrink the whole screen" jitter. Only adopt meaningfully larger.
  // Seed with builder wide size on mount so early scales aren't based on too-small initial measurement.
  const initialNat = builderFitEnabled
    ? { w: DEPLOYMENT_CANVAS_MAX_WIDTH_PX, h: BUILDER_NATURAL_HEIGHT }
    : { w: NATURAL_WIDTH, h: NATURAL_HEIGHT };
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

    if (el && el.clientWidth > 50 && el.clientHeight > 50) {
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

    if (builderFitEnabled) {
      availH -= builderChromeHeight;
    }

    const max = maxArtboardScale();
    const fitCap = builderFitEnabled ? 1 : max;
    const stable = stableNaturalRef.current;
    let naturalW = builderFitEnabled ? stable.w : NATURAL_WIDTH;
    let naturalH = builderFitEnabled ? stable.h : NATURAL_HEIGHT;

    if (builderFitEnabled) {
      const content = builderFit?.contentRef.current;
      if (content) {
        let measuredW = content.scrollWidth || content.offsetWidth;
        const measuredH = content.scrollHeight || content.offsetHeight;

        // Width floor only — early narrow layout must not shrink the fit divisor.
        measuredW = Math.max(measuredW, DEPLOYMENT_CANVAS_MAX_WIDTH_PX);

        if (measuredW > 80 && measuredW > stable.w + 20) {
          stable.w = measuredW;
        } else if (measuredW > 80 && measuredW < stable.w) {
          stable.w = measuredW;
        }
        if (measuredH > 80 && measuredH > stable.h + 20) {
          stable.h = measuredH;
        } else if (measuredH > 80 && measuredH < stable.h) {
          stable.h = measuredH;
        }
      }
      naturalW = stable.w;
      naturalH = stable.h;
    }

    const byWidth = availW / naturalW;
    const byHeight = availH / naturalH;

    const isTablet = isTabletTouchDevice();
    const heightBinder =
      builderFitEnabled && !isTablet
        ? byHeight * BUILDER_HEIGHT_RELAX_DESKTOP
        : byHeight;

    // Fit the measured builder workspace into the stage. Width usually drives;
    // height relaxation keeps load zoom closer to "comfortable" (~85–88%) instead
    // of over-shrinking when the measured scroll height includes bottom chrome.
    const next = Math.min(fitCap, max, byWidth, heightBinder);

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
  }, [stageInsets, builderFitEnabled, builderChromeHeight, builderFit?.contentRef, builderFit?.pause]);

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
  }, [recomputeScale]);

  useEffect(() => {
    const t1 = requestAnimationFrame(recomputeScale);
    const t2 = window.setTimeout(recomputeScale, 320);
    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(t2);
    };
  }, [rosterOpen, stageInsets, recomputeScale]);

  // Builder workspace: re-fit when content height changes (assignments, aux slots, etc.).
  useEffect(() => {
    if (!builderFitEnabled) return;
    const content = builderFit?.contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => {
      if (!builderFit?.pause) {
        requestAnimationFrame(recomputeScale);
      }
    });
    ro.observe(content);

    const t = window.setTimeout(recomputeScale, 120);
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [builderFitEnabled, builderFit?.contentRef, recomputeScale, builderFit?.pause]);

  const rawScale = zoomMode === "fit" ? fitScale : zoomMode;
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
    if (isTabletTouch) return;
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
  }, [isTabletTouch, setZoomMode]);

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