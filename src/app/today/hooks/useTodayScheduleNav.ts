"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  buildDayDefs,
  buildNavDayStrip,
  currentShiftDate,
  daysBetween,
  formatLocalDateISO,
  navIdForWeekDay,
  startOfShiftWeek,
  type DayDef,
  type NavDayStripItem,
} from "@/lib/shiftbuilder/dateUtils";
import { fetchNightCoreData } from "@/app/shiftbuilder/hooks/fetchNightCoreData";
import { readSavedScheduleDate, writeSavedScheduleDate } from "../lib/scheduleNavStorage";

export type TodayBoardView = "deployment" | "breaks";

function dayDefFromDate(date: Date, today: Date): DayDef {
  const weekStart = startOfShiftWeek(date);
  const defs = buildDayDefs(weekStart, today);
  const idx = Math.max(0, Math.min(6, daysBetween(weekStart, date)));
  return defs[idx] ?? defs[0];
}

export function useTodayScheduleNav() {
  const queryClient = useQueryClient();
  const [todayDate] = useState(() => currentShiftDate());

  const [weekStart, setWeekStart] = useState<Date>(() => {
    const saved = readSavedScheduleDate();
    return startOfShiftWeek(saved ?? currentShiftDate());
  });

  const [selectedDayIndex, setSelectedDayIndex] = useState(() => {
    const saved = readSavedScheduleDate();
    if (!saved) {
      const today = currentShiftDate();
      const ws = startOfShiftWeek(today);
      return Math.max(0, Math.min(6, daysBetween(ws, today)));
    }
    const ws = startOfShiftWeek(saved);
    return Math.max(0, Math.min(6, daysBetween(ws, saved)));
  });

  const [currentView, setCurrentView] = useState<TodayBoardView>("deployment");

  const dayDefs = useMemo(
    () => buildDayDefs(weekStart, todayDate),
    [weekStart, todayDate],
  );

  const navStrip = useMemo(
    () => buildNavDayStrip(weekStart, todayDate),
    [weekStart, todayDate],
  );

  const selectedDay = dayDefs[selectedDayIndex] ?? dayDefs[0];
  const selectedNavId = navIdForWeekDay(selectedDayIndex);

  useEffect(() => {
    if (selectedDay?.date) {
      writeSavedScheduleDate(selectedDay.date);
    }
  }, [selectedDay?.date]);

  const prefetchNight = useCallback(
    (date: Date) => {
      const dateKey = formatLocalDateISO(date);
      const dayDef = dayDefFromDate(date, todayDate);
      void queryClient.prefetchQuery({
        queryKey: ["nightCore", dateKey],
        queryFn: () => fetchNightCoreData(dayDef),
        staleTime: 1000 * 60 * 5,
      });
    },
    [queryClient, todayDate],
  );

  const goToday = useCallback(() => {
    const today = currentShiftDate();
    const newWeek = startOfShiftWeek(today);
    const idx = Math.max(0, Math.min(6, daysBetween(newWeek, today)));
    setWeekStart(newWeek);
    setSelectedDayIndex(idx);
  }, []);

  const goPrevWeek = useCallback(() => {
    const prevWeek = addDays(weekStart, -7);
    buildDayDefs(prevWeek, todayDate).forEach((d, i) => {
      setTimeout(() => prefetchNight(d.date), 40 * i);
    });
    setWeekStart(prevWeek);
    setSelectedDayIndex(0);
  }, [weekStart, todayDate, prefetchNight]);

  const goNextWeek = useCallback(() => {
    const nextWeek = addDays(weekStart, 7);
    buildDayDefs(nextWeek, todayDate).forEach((d, i) => {
      setTimeout(() => prefetchNight(d.date), 40 * i);
    });
    setWeekStart(nextWeek);
    setSelectedDayIndex(0);
  }, [weekStart, todayDate, prefetchNight]);

  const selectNavDay = useCallback(
    (navId: number) => {
      const item = navStrip.find((d) => d.navId === navId);
      if (!item) return;

      if (item.bridge === "prev-week-last") {
        setWeekStart(addDays(weekStart, -7));
        setSelectedDayIndex(6);
        return;
      }
      if (item.bridge === "next-week-first") {
        setWeekStart(addDays(weekStart, 7));
        setSelectedDayIndex(0);
        return;
      }
      if (item.weekIndex != null && item.weekIndex !== selectedDayIndex) {
        setSelectedDayIndex(item.weekIndex);
      }
    },
    [navStrip, weekStart, selectedDayIndex],
  );

  const jumpToDate = useCallback(
    (date: Date) => {
      const newWeek = startOfShiftWeek(date);
      const idx = Math.max(0, Math.min(6, daysBetween(newWeek, date)));
      prefetchNight(date);
      setWeekStart(newWeek);
      setSelectedDayIndex(idx);
    },
    [prefetchNight],
  );

  return {
    todayDate,
    weekStart,
    dayDefs,
    navStrip,
    selectedDay,
    selectedDayIndex,
    selectedNavId,
    currentView,
    setCurrentView,
    goToday,
    goPrevWeek,
    goNextWeek,
    selectNavDay,
    jumpToDate,
    prefetchNight,
  };
}

export type { NavDayStripItem };