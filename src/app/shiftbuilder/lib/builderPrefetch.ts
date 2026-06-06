import type { QueryClient } from "@tanstack/react-query";
import {
  buildDayDefs,
  currentShiftDate,
  formatLocalDateISO,
  parseLocalDateISO,
  startOfShiftWeek,
  type DayDef,
} from "@/lib/shiftbuilder/dateUtils";
import { fetchNightCoreData } from "../hooks/fetchNightCoreData";
import { fetchNightSecondaryData } from "../hooks/fetchNightSecondaryData";

export const OMS_SELECTED_DATE_KEY = "oms_selected_date";

export function resolveBuilderWeekStart(): Date {
  const today = currentShiftDate();
  if (typeof window === "undefined") return startOfShiftWeek(today);

  try {
    const saved = localStorage.getItem(OMS_SELECTED_DATE_KEY);
    if (saved) {
      const d = parseLocalDateISO(saved);
      if (!isNaN(d.getTime())) return startOfShiftWeek(d);
    }
  } catch {
    /* ignore */
  }
  return startOfShiftWeek(today);
}

export function getBuilderWeekDayDefs(): DayDef[] {
  const today = currentShiftDate();
  return buildDayDefs(resolveBuilderWeekStart(), today);
}

/**
 * Seed TanStack cache for the operational week.
 * Safe to call during PIN gate, dynamic import shell, or post-auth.
 */
export function prefetchBuilderWeek(queryClient: QueryClient): void {
  const dayDefs = getBuilderWeekDayDefs();
  const todayKey = formatLocalDateISO(currentShiftDate());

  dayDefs.forEach((def, i) => {
    const dateKey = formatLocalDateISO(def.date);
    const delay = dateKey === todayKey ? 0 : 20 + i * 25;

    window.setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["nightCore", dateKey],
        queryFn: () => fetchNightCoreData(def),
        staleTime: 1000 * 60 * 5,
      });
      queryClient.prefetchQuery({
        queryKey: ["nightSecondary", dateKey],
        queryFn: () => fetchNightSecondaryData(def),
        staleTime: 1000 * 60 * 5,
      });
    }, delay);
  });
}