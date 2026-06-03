"use client";

import { useState, useRef, useCallback, useEffect } from "react";

/** Never upscale past 1 — keeps zone cards at designed density (no blown-up text). */
export type ZoomMode = "fit" | 0.5 | 0.75 | 1;

// The artboard is locked at 1056×816 (the print contract).
export const NATURAL_WIDTH = 1056;
export const NATURAL_HEIGHT = 816;

/**
 * Manages artboard zoom state and the stageHostRef used by the DndContext
 * wrapper. Accepts `rosterOpen` so it can re-fit the scale whenever the
 * floating roster panel opens/closes (the roster shift changes available width).
 */
export function useZoom({ rosterOpen }: { rosterOpen: boolean }) {
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit");
  // Start with a safe, viewport-derived value so the artboard is always visible
  // at a usable size on first paint, even before any measurement effects run.
  const [fitScale, setFitScale] = useState(() => {
    if (typeof window === "undefined") return 0.85;
    const w = window.innerWidth - 268 - 80;
    const h = window.innerHeight - 90;
    return Math.max(0.35, Math.min(1, Math.min(w / NATURAL_WIDTH, h / NATURAL_HEIGHT)));
  });
  const stageHostRef = useRef<HTMLDivElement>(null);

  // Robust scale computer: prefers measuring the actual stage host, falls back
  // to viewport math so the artboard is *never* invisible/tiny after async loads.
  const recomputeScale = useCallback(() => {
    const el = stageHostRef.current;
    let availW = 0;
    let availH = 0;

    if (el && el.clientWidth > 50 && el.clientHeight > 50) {
      availW = el.clientWidth - 24;
      availH = el.clientHeight - 24;
    } else {
      // Fallback: estimate from window (header ~48px + outer paddings + safe margin)
      availW = window.innerWidth - 268 - 80; // 268 = fixed roster rail + gaps
      availH = window.innerHeight - 90;       // header + top/bottom chrome
    }

    const next = Math.min(1, availW / NATURAL_WIDTH, availH / NATURAL_HEIGHT);
    setFitScale(Math.max(0.25, next));
  }, []);

  useEffect(() => {
    // Multiple attempts to catch the layout after the full shell (header + flex-1)
    // has settled. Guarantees the 1056×816 paper is visible even if the first
    // measurement happens before the viewport sizes are final.
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
      cancelAnimationFrame(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
    };
  }, [recomputeScale]);

  // Re-fit whenever the floating roster opens/closes — the roster shift changes
  // available width. Run after the CSS transition completes (280ms + buffer).
  useEffect(() => {
    const t1 = requestAnimationFrame(recomputeScale);
    const t2 = window.setTimeout(recomputeScale, 320);
    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(t2);
    };
  }, [rosterOpen, recomputeScale]);

  const rawScale = zoomMode === "fit" ? fitScale : zoomMode;
  const scale = Math.min(rawScale, 1);

  return { zoomMode, setZoomMode, fitScale, stageHostRef, scale, recomputeScale };
}
