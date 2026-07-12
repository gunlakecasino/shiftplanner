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
): void {
  // Fail closed: unauthenticated / unknown permissions → no night-core storm.
  if (permissions == null) return;

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
