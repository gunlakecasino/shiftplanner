"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cardPopulationClass } from "../components/state/cardPopulationTransition";

export type HydrationGuardInput = {
  /** True while the core night payload is still loading. */
  isLoading: boolean;
  /** True when assignments or a nightId are present (board has real data). */
  hasPayload: boolean;
  /** ISO day key for the selected night — resets guard on day switch. */
  dayKey: string;
};

/**
 * Minimal hydration guard for board/card surfaces.
 * Prevents showing empty card chrome while cold-loading, then enables population transition.
 *
 * Drop-in alongside existing boardColdLoading / hasBoardPayload without touching useShiftData.
 */
export function useHydrationGuard({ isLoading, hasPayload, dayKey }: HydrationGuardInput) {
  const [settled, setSettled] = useState(false);
  const settledDayRef = useRef<string | null>(null);

  useEffect(() => {
    if (settledDayRef.current !== dayKey) {
      setSettled(false);
    }
  }, [dayKey]);

  useEffect(() => {
    if (isLoading || !hasPayload) return;
    settledDayRef.current = dayKey;
    setSettled(true);
  }, [isLoading, hasPayload, dayKey]);

  const showSkeleton = !settled && (isLoading || !hasPayload);
  const ready = settled && hasPayload && !isLoading;

  const populationClass = useCallback(
    (index = 0) => (ready ? cardPopulationClass(index) : ""),
    [ready],
  );

  const reset = useCallback(() => {
    settledDayRef.current = null;
    setSettled(false);
  }, []);

  return {
    showSkeleton,
    ready,
    populationClass,
    reset,
  } as const;
}