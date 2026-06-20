"use client";

import { useCallback, useRef } from "react";

const LONG_PRESS_MS = 480;
const MOVE_TOLERANCE_PX = 12;

type LongPressHandlers = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
};

export function useCardLongPress(
  enabled: boolean,
  onLongPress: (anchor: { x: number; y: number }) => void,
): LongPressHandlers {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef(false);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    originRef.current = null;
    firedRef.current = false;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!enabled || e.button !== 0) return;
      clear();
      originRef.current = { x: e.clientX, y: e.clientY };
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        onLongPress({ x: e.clientX, y: e.clientY });
      }, LONG_PRESS_MS);
    },
    [enabled, clear, onLongPress],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const origin = originRef.current;
    if (!origin || firedRef.current) return;
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) clear();
  }, [clear]);

  const onPointerUp = useCallback(() => clear(), [clear]);
  const onPointerCancel = useCallback(() => clear(), [clear]);

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel };
}