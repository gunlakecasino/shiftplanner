"use client";

import * as React from "react";

/**
 * useDragScroll
 *
 * Premium horizontal drag-to-scroll hook with momentum.
 * Designed for compact chrome elements (tab bars, date selectors, pill strips)
 * where native touch scrolling + mouse drag + inertia feels physical and calm.
 *
 * - Pointer events (mouse + touch + pen)
 * - Pointer capture for reliable tracking even when pointer leaves the element
 * - Velocity-based momentum with exponential decay (tuned for small strips)
 * - Configurable drag threshold (prevents tiny movements from triggering "drag" mode)
 * - Returns isDragging for cursor + visual feedback
 * - Click suppression helper so buttons inside don't fire on drag release
 *
 * Usage:
 *   const { ref, isDragging, dragProps, wasDraggingRef } = useDragScroll<HTMLDivElement>({
 *     momentum: true,
 *     threshold: 6,
 *     decay: 0.94,
 *   });
 *
 *   <div ref={ref} {...dragProps} className={isDragging ? "cursor-grabbing" : "cursor-grab"}>
 *     {children with buttons that check wasDraggingRef.current in onClick}
 *   </div>
 */
export interface UseDragScrollOptions {
  /** Enable velocity-based momentum after release (default: true) */
  momentum?: boolean;
  /** Minimum pixels of movement before we consider it a drag (prevents click interference) */
  threshold?: number;
  /** Momentum decay factor per frame (0.88 = faster stop, 0.96 = longer glide). Default 0.935 */
  decay?: number;
  /** Optional multiplier for how "fast" the momentum feels */
  velocityScale?: number;
}

export interface UseDragScrollReturn<T extends HTMLElement = HTMLDivElement> {
  /** Attach to the scrollable container (can be null until mounted) */
  ref: React.RefObject<T | null>;
  /** True while actively dragging (use for cursor-grabbing etc.) */
  isDragging: boolean;
  /** Spread these onto the container for pointer handling */
  dragProps: {
    onPointerDown: (e: React.PointerEvent<T>) => void;
    onPointerMove?: (e: React.PointerEvent<T>) => void; // internal
    onPointerUp?: (e: React.PointerEvent<T>) => void;
    onPointerLeave?: (e: React.PointerEvent<T>) => void;
  };
  /**
   * Ref you can read synchronously inside child onClick handlers:
   *   if (wasDraggingRef.current) { wasDraggingRef.current = false; return; }
   *   doSelection();
   */
  wasDraggingRef: React.MutableRefObject<boolean>;
}

export function useDragScroll<T extends HTMLElement = HTMLDivElement>(
  options: UseDragScrollOptions = {}
): UseDragScrollReturn<T> {
  const {
    momentum = true,
    threshold = 5,
    decay = 0.935,
    velocityScale = 1.0,
  } = options;

  const ref = React.useRef<T>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  // These live outside render for performance + to be readable from child clicks
  const startXRef = React.useRef(0);
  const startScrollLeftRef = React.useRef(0);
  const lastXRef = React.useRef(0);
  const lastTimeRef = React.useRef(0);
  const velocityRef = React.useRef(0);
  const wasDraggingRef = React.useRef(false);
  const rafRef = React.useRef<number | null>(null);
  const pointerIdRef = React.useRef<number | null>(null);

  const cancelMomentum = React.useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Apply momentum with velocity decay (S-tier friendly — just mutates scrollLeft)
  const startMomentum = React.useCallback(() => {
    if (!momentum) return;
    cancelMomentum();

    const el = ref.current;
    if (!el) return;

    let vel = velocityRef.current * velocityScale;

    const tick = () => {
      if (Math.abs(vel) < 0.35) {
        rafRef.current = null;
        return;
      }
      el.scrollLeft -= vel;
      vel *= decay;
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [momentum, decay, velocityScale, cancelMomentum]);

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<T>) => {
      const el = ref.current;
      if (!el) return;

      // Only primary button / touch
      if (e.button !== 0 && e.pointerType === "mouse") return;

      cancelMomentum();

      // Capture the pointer so we keep receiving events even if it leaves the strip
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}

      pointerIdRef.current = e.pointerId;

      startXRef.current = e.clientX;
      startScrollLeftRef.current = el.scrollLeft;
      lastXRef.current = e.clientX;
      lastTimeRef.current = performance.now();
      velocityRef.current = 0;
      wasDraggingRef.current = false;

      setIsDragging(true);
    },
    [cancelMomentum]
  );

  const handlePointerMove = React.useCallback(
    (e: React.PointerEvent<T>) => {
      const el = ref.current;
      if (!el || pointerIdRef.current === null) return;

      const deltaX = e.clientX - startXRef.current;
      const now = performance.now();
      const dt = Math.max(1, now - lastTimeRef.current);

      // Only start the "dragging" behavior after threshold
      if (!wasDraggingRef.current && Math.abs(deltaX) > threshold) {
        wasDraggingRef.current = true;
      }

      if (wasDraggingRef.current) {
        // Direct scroll manipulation — unavoidable for real scroll containers
        el.scrollLeft = startScrollLeftRef.current - deltaX;

        // Compute instantaneous velocity (px per ms)
        const instVel = ((lastXRef.current - e.clientX) / dt) * 16; // normalize toward 60fps feel
        velocityRef.current = velocityRef.current * 0.6 + instVel * 0.4; // light smoothing

        lastXRef.current = e.clientX;
        lastTimeRef.current = now;
      }
    },
    [threshold]
  );

  const handlePointerUp = React.useCallback(
    (e: React.PointerEvent<T>) => {
      const el = ref.current;
      if (!el) return;

      // Release capture
      try {
        if (pointerIdRef.current !== null) {
          (e.currentTarget as HTMLElement).releasePointerCapture(pointerIdRef.current);
        }
      } catch {}

      pointerIdRef.current = null;

      const wasDrag = wasDraggingRef.current;

      setIsDragging(false);

      if (wasDrag && momentum) {
        // Kick off the glide
        startMomentum();
      }

      // The wasDraggingRef stays true briefly so child click handlers can see it.
      // Child onClick should do:
      //   if (wasDraggingRef.current) { wasDraggingRef.current = false; return; }
      // We clear it on the next frame so normal clicks still work.
      if (wasDrag) {
        requestAnimationFrame(() => {
          wasDraggingRef.current = false;
        });
      }
    },
    [momentum, startMomentum]
  );

  const handlePointerLeave = React.useCallback(
    (e: React.PointerEvent<T>) => {
      // Treat leave like up for safety (especially with capture)
      if (pointerIdRef.current !== null) {
        handlePointerUp(e);
      }
    },
    [handlePointerUp]
  );

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      cancelMomentum();
    };
  }, [cancelMomentum]);

  const dragProps = React.useMemo(
    () => ({
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerLeave: handlePointerLeave,
    }),
    [handlePointerDown, handlePointerMove, handlePointerUp, handlePointerLeave]
  );

  return {
    ref,
    isDragging,
    dragProps,
    wasDraggingRef,
  };
}
