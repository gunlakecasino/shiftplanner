"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addDays,
  buildDayDefs,
  buildNavDayStrip,
  currentShiftDate,
  daysBetween,
  formatLocalDateISO,
  navIdForWeekDay,
  sameDay,
  startOfShiftWeek,
  type DayDef,
  type NavDayStripItem,
} from "@/lib/shiftbuilder/dateUtils";
import { fetchNightCoreData } from "@/app/shiftbuilder/hooks/fetchNightCoreData";
import { fetchPublishedDates } from "../lib/publishedDates";
import { readSavedScheduleDate, writeSavedScheduleDate } from "../lib/scheduleNavStorage";

export type TodayBoardView = "deployment" | "breaks";

function dayDefFromDate(date: Date, today: Date): DayDef {
  const weekStart = startOfShiftWeek(date);
  const defs = buildDayDefs(weekStart, today);
  const idx = Math.max(0, Math.min(6, daysBetween(weekStart, date)));
  return defs[idx] ?? defs[0];
}

/** Keeps grave-shift "today" fresh across midnight and the 8:30am rollover. */
function useShiftTodayDate(): Date {
  const [todayDate, setTodayDate] = useState(() => currentShiftDate());

  useEffect(() => {
    const sync = () => {
      const next = currentShiftDate();
      setTodayDate((prev) => (sameDay(prev, next) ? prev : next));
    };
    sync();
    const interval = window.setInterval(sync, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return todayDate;
}

export function useTodayScheduleNav() {
  const queryClient = useQueryClient();
  const todayDate = useShiftTodayDate();

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

  const stripPublishRange = useMemo(() => {
    if (navStrip.length === 0) return null;
    let min = navStrip[0].date.getTime();
    let max = min;
    for (const item of navStrip) {
      const t = item.date.getTime();
      if (t < min) min = t;
      if (t > max) max = t;
    }
    return {
      from: formatLocalDateISO(new Date(min)),
      to: formatLocalDateISO(new Date(max)),
    };
  }, [navStrip]);

  const {
    data: publishedStripDates,
    isFetching: publishedStripDatesFetching,
  } = useQuery({
    queryKey: ["todayPublishedDates", stripPublishRange?.from, stripPublishRange?.to],
    queryFn: () => fetchPublishedDates(stripPublishRange!.from, stripPublishRange!.to),
    enabled: !!stripPublishRange,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

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
      const isTonight = sameDay(date, todayDate);
      if (!isTonight) {
        if (!publishedStripDates) return;
        if (!publishedStripDates.has(dateKey)) return;
      }
      const dayDef = dayDefFromDate(date, todayDate);
      void queryClient.prefetchQuery({
        queryKey: ["nightCore", dateKey],
        queryFn: () => fetchNightCoreData(dayDef),
        staleTime: 1000 * 60 * 5,
      });
    },
    [queryClient, todayDate, publishedStripDates],
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
    publishedStripDates,
    publishedStripDatesFetching,
  };
}

export type { NavDayStripItem };