"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { ZoomMode } from "./useZoom";

function touchDistance(touches: TouchList): number {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function touchMidpoint(touches: TouchList): { x: number; y: number } {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Keep the pinch focal point stable when scale changes. */
function anchorScrollToMidpoint(
  el: HTMLDivElement,
  mid: { x: number; y: number },
  prevScale: number,
  nextScale: number,
) {
  if (Math.abs(nextScale - prevScale) < 0.0005) return;
  const rect = el.getBoundingClientRect();
  const ratio = nextScale / prevScale;
  const offsetX = mid.x - rect.left;
  const offsetY = mid.y - rect.top;
  el.scrollLeft = (el.scrollLeft + offsetX) * ratio - offsetX;
  el.scrollTop = (el.scrollTop + offsetY) * ratio - offsetY;
}

type GestureState =
  | { mode: "idle" }
  | {
      mode: "pinch";
      startDist: number;
      startScale: number;
      lastMidX: number;
      lastMidY: number;
    };

/**
 * Tablet stage gestures: two-finger pinch zoom (fit → maxScale), pan when zoomed,
 * double-tap empty stage to reset fit.
 */
export function useStagePinchPan({
  enabled,
  stageHostRef,
  scale,
  fitScale,
  maxScale,
  minScale = 0.35,
  setZoomMode,
  onFit,
}: {
  enabled: boolean;
  stageHostRef: RefObject<HTMLDivElement | null>;
  scale: number;
  fitScale: number;
  maxScale: number;
  minScale?: number;
  setZoomMode: (mode: ZoomMode) => void;
  onFit?: () => void;
}) {
  const scaleRef = useRef(scale);
  const fitRef = useRef(fitScale);
  const gestureRef = useRef<GestureState>({ mode: "idle" });
  const lastTapRef = useRef(0);

  useEffect(() => {
    scaleRef.current = scale;
  }, [scale]);

  useEffect(() => {
    fitRef.current = fitScale;
  }, [fitScale]);

  useEffect(() => {
    if (!enabled) return;
    const el = stageHostRef.current;
    if (!el) return;

    const commitScale = (next: number) => {
      const fit = fitRef.current;
      if (Math.abs(next - fit) < 0.02) {
        setZoomMode("fit");
        onFit?.();
        return;
      }
      setZoomMode(Math.round(next * 1000) / 1000);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      const mid = touchMidpoint(e.touches);
      gestureRef.current = {
        mode: "pinch",
        startDist: touchDistance(e.touches),
        startScale: scaleRef.current,
        lastMidX: mid.x,
        lastMidY: mid.y,
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      const g = gestureRef.current;
      if (g.mode !== "pinch" || e.touches.length !== 2) return;

      e.preventDefault();

      const dist = touchDistance(e.touches);
      if (g.startDist < 8) return;

      const ratio = dist / g.startDist;
      const prevScale = scaleRef.current;
      const nextScale = clamp(g.startScale * ratio, minScale, maxScale);
      const mid = touchMidpoint(e.touches);

      anchorScrollToMidpoint(el, mid, prevScale, nextScale);

      const dx = mid.x - g.lastMidX;
      const dy = mid.y - g.lastMidY;
      el.scrollLeft -= dx;
      el.scrollTop -= dy;

      scaleRef.current = nextScale;
      setZoomMode(nextScale);
      gestureRef.current = { ...g, lastMidX: mid.x, lastMidY: mid.y };
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length >= 2) return;

      const g = gestureRef.current;
      if (g.mode === "pinch") {
        gestureRef.current = { mode: "idle" };
        commitScale(scaleRef.current);
        return;
      }

      if (e.changedTouches.length !== 1) return;
      const target = e.target as HTMLElement;
      if (target.closest("[data-slot-key], .placement-pad, button, input, a")) return;

      const now = Date.now();
      if (now - lastTapRef.current < 320) {
        setZoomMode("fit");
        onFit?.();
        el.scrollTo({ left: 0, top: 0, behavior: "smooth" });
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, stageHostRef, maxScale, minScale, setZoomMode, onFit]);
}