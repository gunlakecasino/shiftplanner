"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { isTabletTouchDevice } from "@/lib/shiftbuilder/tabletDevice";

export type ZoomMode = "fit" | 0.5 | 0.75 | 1 | 1.15 | 1.25;

// The artboard is locked at 1056×816 (the print contract).
export const NATURAL_WIDTH = 1056;
export const NATURAL_HEIGHT = 816;

export { isTabletTouchDevice };

export function maxArtboardScale(): number {
  return isTabletTouchDevice() ? 1.25 : 1;
}

export function zoomStepsForDevice(): Exclude<ZoomMode, "fit">[] {
  return isTabletTouchDevice()
    ? [0.5, 0.75, 1, 1.15, 1.25]
    : [0.5, 0.75, 1];
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