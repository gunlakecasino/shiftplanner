import type { QueryClient } from "@tanstack/react-query";
import {
  buildDayDefs,
  currentShiftDate,
  formatLocalDateISO,
  parseLocalDateISO,
  startOfShiftWeek,
  type DayDef,
} from "@/lib/shiftbuilder/dateUtils";
import type { ShiftBuilderPermissions } from "@/lib/auth/opsAuthTypes";
import { fetchNightCoreData } from "../hooks/fetchNightCoreData";
import { fetchNightSecondaryData } from "../hooks/fetchNightSecondaryData";
import { nightFetchOptionsForPermissions } from "./viewerNightPolicy";

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
export function prefetchBuilderWeek(
  queryClient: QueryClient,
  permissions?: Pick<
    ShiftBuilderPermissions,
    "canEditPublishedOnly" | "canSeeDraftData" | "canAccessSudo"
  > | null,
): void {
  const dayDefs = getBuilderWeekDayDefs();
  const todayKey = formatLocalDateISO(currentShiftDate());
  const fetchOptions = nightFetchOptionsForPermissions(permissions);

  dayDefs.forEach((def, i) => {
    const dateKey = formatLocalDateISO(def.date);
    const delay = dateKey === todayKey ? 0 : 20 + i * 25;

    window.setTimeout(() => {
      queryClient.prefetchQuery({
        queryKey: ["nightCore", dateKey],
        queryFn: () => fetchNightCoreData(def, fetchOptions),
        staleTime: 1000 * 60 * 5,
      });
      queryClient.prefetchQuery({
        queryKey: ["nightSecondary", dateKey],
        queryFn: () => fetchNightSecondaryData(def, fetchOptions),
        staleTime: 1000 * 60 * 5,
      });
    }, delay);
  });
}