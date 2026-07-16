import type { QueryClient } from "@tanstack/react-query";
import {
  buildDayDefs,
  currentShiftDate,
  formatLocalDateISO,
  type DayDef,
} from "@/lib/shiftbuilder/dateUtils";
import type { ShiftBuilderPermissions } from "@/lib/auth/opsAuthTypes";
import {
  OMS_SELECTED_DATE_KEY,
  readSavedDateIso,
  resolveResumeWeekStart,
} from "@/lib/shiftbuilder/builderDateResume";
import { fetchNightCoreData } from "../hooks/fetchNightCoreData";
import { fetchNightSecondaryData } from "../hooks/fetchNightSecondaryData";
import { nightFetchOptionsForPermissions } from "./viewerNightPolicy";

export { OMS_SELECTED_DATE_KEY };

export function resolveBuilderWeekStart(): Date {
  return resolveResumeWeekStart(readSavedDateIso());
}

export function getBuilderWeekDayDefs(): DayDef[] {
  const today = currentShiftDate();
  return buildDayDefs(resolveBuilderWeekStart(), today);
}

/**
 * Seed TanStack cache for the operational week.
 * Call only after PIN auth + permissions are known — never pre-auth.
 */
export function prefetchBuilderWeek(
  queryClient: QueryClient,
  permissions?: Pick<
    ShiftBuilderPermissions,
    "canEditPublishedOnly" | "canSeeDraftData" | "canAccessSudo"
  > | null,
): () => void {
  // Fail closed: unauthenticated / unknown permissions → no night-core storm.
  if (permissions == null) return () => {};

  const dayDefs = getBuilderWeekDayDefs();
  const todayKey = formatLocalDateISO(currentShiftDate());
  const savedKey = readSavedDateIso();
  const selectedIndex = Math.max(
    0,
    dayDefs.findIndex((def) => formatLocalDateISO(def.date) === (savedKey ?? todayKey)),
  );
  const fetchOptions = nightFetchOptionsForPermissions(permissions);
  const timers: number[] = [];

  const prefetch = (def: DayDef) => {
    const dateKey = formatLocalDateISO(def.date);
    void queryClient.prefetchQuery({
      queryKey: ["nightCore", dateKey],
      queryFn: () => fetchNightCoreData(def, fetchOptions),
      staleTime: 1000 * 60 * 5,
    });
    void queryClient.prefetchQuery({
      queryKey: ["nightSecondary", dateKey],
      queryFn: () => fetchNightSecondaryData(def, fetchOptions),
      staleTime: 1000 * 60 * 5,
    });
  };

  // The selected night is the only startup-critical payload. Adjacent nights
  // warm later for quick navigation; the rest wait for hover or Week view.
  prefetch(dayDefs[selectedIndex]);
  [selectedIndex - 1, selectedIndex + 1]
    .filter((index) => index >= 0 && index < dayDefs.length)
    .forEach((index, priority) => {
      timers.push(window.setTimeout(() => prefetch(dayDefs[index]), 800 + priority * 500));
    });

  return () => timers.forEach((timer) => window.clearTimeout(timer));
}
