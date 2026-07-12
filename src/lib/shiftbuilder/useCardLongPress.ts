"use client";

import { useCallback, useRef } from "react";
import { isCoarsePointerDevice } from "@/lib/shiftbuilder/tabletDevice";
import { tabletHaptic } from "@/lib/shiftbuilder/tabletHaptic";

/** Desktop / mouse — short hold. */
export const LONG_PRESS_MS_FINE = 480;
/**
 * Finger: longer than drag activation distance travel, and clear of accidental
 * taps. Drag uses ~12px coarse distance; 600ms leaves room to start a drag
 * without firing kiosk long-press.
 */
export const LONG_PRESS_MS_COARSE = 600;
/** Cancel if the finger moves more than this before fire. */
export const LONG_PRESS_MOVE_TOLERANCE_PX = 10;
/** @deprecated use LONG_PRESS_MOVE_TOLERANCE_PX */
const MOVE_TOLERANCE_PX = LONG_PRESS_MOVE_TOLERANCE_PX;

type LongPressHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
};

/**
 * Long-press for Today kiosk menus.
 * - Cancels on move past tolerance (lets DnD win)
 * - Uses pointer capture so move/up stay on the card
 * - Suppresses iOS callout / context menu
 * - Haptic tick when it fires (if available)
 */
export function useCardLongPress(
  enabled: boolean,
  onLongPress: (anchor: { x: number; y: number }) => void,
): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);

  const clear = useCallback((target?: EventTarget | null) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (
      pointerIdRef.current != null &&
      target &&
      typeof (target as HTMLElement).releasePointerCapture === "function"
    ) {
      try {
        (target as HTMLElement).releasePointerCapture(pointerIdRef.current);
      } catch {
        /* already released */
      }
    }
    pointerIdRef.current = null;
    originRef.current = null;
    firedRef.current = false;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || e.button !== 0) return;
      // Ignore multi-touch (pinch / second finger).
      if (e.isPrimary === false) return;

      clear(e.currentTarget);
      originRef.current = { x: e.clientX, y: e.clientY };
      pointerIdRef.current = e.pointerId;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* Safari edge cases */
      }

      const delay = isCoarsePointerDevice() ? LONG_PRESS_MS_COARSE : LONG_PRESS_MS_FINE;
      const x0 = e.clientX;
      const y0 = e.clientY;
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        tabletHaptic(12);
        onLongPress({ x: x0, y: y0 });
      }, delay);
    },
    [enabled, clear, onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const origin = originRef.current;
      if (!origin || firedRef.current) return;
      const dx = e.clientX - origin.x;
      const dy = e.clientY - origin.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) {
        clear(e.currentTarget);
      }
    },
    [clear],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      // If long-press already fired, swallow the synthetic click that follows.
      if (firedRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
      clear(e.currentTarget);
    },
    [clear],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      clear(e.currentTarget);
    },
    [clear],
  );

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return;
      // Suppress iOS callout / desktop context menu on kiosk cards.
      e.preventDefault();
    },
    [enabled],
  );

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onContextMenu,
  };
}
