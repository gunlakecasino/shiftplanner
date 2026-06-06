"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { isTabletTouchDevice, rosterPanelWidth } from "@/lib/shiftbuilder/tabletDevice";

export type ZoomMode = "fit" | number;

// The artboard is locked at 1056×816 (the print contract).
export const NATURAL_WIDTH = 1056;
export const NATURAL_HEIGHT = 816;

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

/**
 * Manages artboard zoom state and the stageHostRef used by the DndContext
 * wrapper. Accepts `rosterOpen` so it can re-fit the scale whenever the
 * floating roster panel opens/closes (the roster shift changes available width).
 */
export function useZoom({
  rosterOpen,
  stageInsets,
}: {
  rosterOpen: boolean;
  stageInsets: StageInsets;
}) {
  const [isTabletTouch, setIsTabletTouch] = useState(isTabletTouchDevice);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit");
  const [fitScale, setFitScale] = useState(() => {
    if (typeof window === "undefined") return 0.85;
    const w = window.innerWidth - rosterPanelWidth() - 80;
    const h = window.innerHeight - 90;
    const max = maxArtboardScale();
    const byW = w / NATURAL_WIDTH;
    const byH = h / NATURAL_HEIGHT;
    const fit = isTabletTouchDevice()
      ? Math.min(max, byW, byH)
      : Math.min(1, byW, byH);
    return Math.max(0.35, fit);
  });
  const stageHostRef = useRef<HTMLDivElement>(null);

  const recomputeScale = useCallback(() => {
    const el = stageHostRef.current;
    const insets = stageInsets;
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const vpW = vv?.width ?? window.innerWidth;
    const vpH = vv?.height ?? window.innerHeight;
    let availW = 0;
    let availH = 0;

    if (el && el.clientWidth > 50 && el.clientHeight > 50) {
      // clientWidth/Height include padding; subtract stage chrome insets + breathing room.
      availW = el.clientWidth - insets.left - insets.right - 12;
      availH = el.clientHeight - insets.top - insets.bottom - 12;
    } else {
      availW = vpW - insets.left - insets.right - 24;
      availH = vpH - insets.top - insets.bottom - 24;
    }

    const max = maxArtboardScale();
    const byWidth = availW / NATURAL_WIDTH;
    const byHeight = availH / NATURAL_HEIGHT;

    // Fit both axes so the full Golden artboard stays visible without scroll or upscale past max.
    const next = Math.min(max, byWidth, byHeight);

    setFitScale(Math.max(0.25, next));
  }, [stageInsets]);

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

    const onResize = () => recomputeScale();
    window.addEventListener("resize", onResize);
    const vv = window.visualViewport;
    if (vv) vv.addEventListener("resize", onResize);

    return () => {
      mq.removeEventListener("change", onMq);
      cancelAnimationFrame(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("resize", onResize);
      if (vv) vv.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
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

  const rawScale = zoomMode === "fit" ? fitScale : zoomMode;
  const scale = Math.min(rawScale, maxArtboardScale());

  // Refs for wheel handler to always see latest values without stale closures
  const zoomModeRef = useRef(zoomMode);
  const fitScaleRef = useRef(fitScale);
  const stepsRef = useRef(zoomStepsForDevice());

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