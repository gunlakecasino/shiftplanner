"use client";

import React from "react";
import { addDays } from "@/lib/shiftbuilder/dateUtils";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";

/**
 * useDayNavigation
 *
 * Extracted for Phase 2 decomposition.
 * Handles seamless GRAVE week boundary crossing for day/week nav.
 * Uses the ultra-responsive changeDay (wrapped in startTransition).
 */
export interface UseDayNavigationParams {
  selectedDayIndex: number;
  weekStart: Date;
  setWeekStart: (d: Date) => void;
  changeDay: (idx: number) => void;
}

export function useDayNavigation({
  selectedDayIndex,
  weekStart,
  setWeekStart,
  changeDay,
}: UseDayNavigationParams) {
  const goPrevDay = React.useCallback(() => {
    if (selectedDayIndex > 0) {
      changeDay(selectedDayIndex - 1);
    } else {
      const prevWeek = addDays(weekStart, -7);
      setWeekStart(prevWeek);
      changeDay(6);
    }
  }, [selectedDayIndex, weekStart, setWeekStart, changeDay]);

  const goNextDay = React.useCallback(() => {
    if (selectedDayIndex < 6) {
      changeDay(selectedDayIndex + 1);
    } else {
      const nextWeek = addDays(weekStart, 7);
      setWeekStart(nextWeek);
      changeDay(0);
    }
  }, [selectedDayIndex, weekStart, setWeekStart, changeDay]);

  const goPrevWeek = React.useCallback(() => {
    const prevWeek = addDays(weekStart, -7);
    setWeekStart(prevWeek);
    changeDay(Math.min(selectedDayIndex, 6));
  }, [weekStart, setWeekStart, changeDay, selectedDayIndex]);

  const goNextWeek = React.useCallback(() => {
    const nextWeek = addDays(weekStart, 7);
    setWeekStart(nextWeek);
    changeDay(Math.min(selectedDayIndex, 6));
  }, [weekStart, setWeekStart, changeDay, selectedDayIndex]);

  return {
    goPrevDay,
    goNextDay,
    goPrevWeek,
    goNextWeek,
  };
}
