"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { beginDayCardContentVeil } from "../components/state/dayCardContentVeil";

/**
 * Drop-in hook: fires the board transition when `dayKey` changes (not on first mount).
 * Pair with ISO date keys from formatLocalDateISO(selectedDay.date).
 */
export function useDaySwitchTransition(dayKey: string, enabled = true): void {
  const reducedMotion = useReducedMotion();
  const prevKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (!mountedRef.current) {
      mountedRef.current = true;
      prevKeyRef.current = dayKey;
      return;
    }
    if (prevKeyRef.current === dayKey) return;
    prevKeyRef.current = dayKey;
    if (reducedMotion) return;
    beginDayCardContentVeil({ source: "day-key", targetDayKey: dayKey });
  }, [dayKey, enabled, reducedMotion]);
}