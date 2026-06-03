"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type ZoomMode = "fit" | 0.5 | 0.75 | 1 | 1.15 | 1.25;

// The artboard is locked at 1056×816 (the print contract).
export const NATURAL_WIDTH = 1056;
export const NATURAL_HEIGHT = 816;

/** iPad / touch tablet — allow slightly above 100% so the board fills readable width. */
export function isTabletTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse) and (min-width: 768px)").matches;
}

export function maxArtboardScale(): number {
  return isTabletTouchDevice() ? 1.25 : 1;
}

export function zoomStepsForDevice(): Exclude<ZoomMode, "fit">[] {
  return isTabletTouchDevice()
    ? [0.5, 0.75, 1, 1.15, 1.25]
    : [0.5, 0.75, 1];
}

/**
 * Manages artboard zoom state and the stageHostRef used by the DndContext
 * wrapper. Accepts `rosterOpen` so it can re-fit the scale whenever the
 * floating roster panel opens/closes (the roster shift changes available width).
 */
export function useZoom({ rosterOpen }: { rosterOpen: boolean }) {
  const [isTabletTouch, setIsTabletTouch] = useState(isTabletTouchDevice);
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit");
  const [fitScale, setFitScale] = useState(() => {
    if (typeof window === "undefined") return 0.85;
    const w = window.innerWidth - 268 - 80;
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
    let availW = 0;
    let availH = 0;

    if (el && el.clientWidth > 50 && el.clientHeight > 50) {
      availW = el.clientWidth - 24;
      availH = el.clientHeight - 24;
    } else {
      availW = window.innerWidth - 268 - 80;
      availH = window.innerHeight - 90;
    }

    const max = maxArtboardScale();
    const byWidth = availW / NATURAL_WIDTH;
    const byHeight = availH / NATURAL_HEIGHT;
    const tablet = isTabletTouchDevice();

    // Tablet may upscale to max (1.25) when the viewport allows; always fit both axes
    // so the scaled artboard does not paint outside the stage (CSS transform overflow).
    // Desktop: never upscale past 100% — keeps card typography crisp.
    const next = tablet
      ? Math.min(max, byWidth, byHeight)
      : Math.min(1, byWidth, byHeight);

    setFitScale(Math.max(0.25, next));
  }, []);

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

    return () => {
      mq.removeEventListener("change", onMq);
      cancelAnimationFrame(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("resize", onResize);
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
  }, [rosterOpen, recomputeScale]);

  const rawScale = zoomMode === "fit" ? fitScale : zoomMode;
  const scale = Math.min(rawScale, maxArtboardScale());

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