/**
 * Shared resume policy for oms_selected_date — board init + week prefetch must agree.
 *
 * Floor iPads stick localStorage across shifts. Ancient weeks must not pin forever;
 * same shift week (or last 7 calendar days) may restore.
 */

import {
  currentShiftDate,
  daysBetween,
  formatLocalDateISO,
  parseLocalDateISO,
  startOfShiftWeek,
  sameDay,
} from "./dateUtils";

export const OMS_SELECTED_DATE_KEY = "oms_selected_date";

/** Max calendar days outside the current shift week that still restore a saved day. */
export const RESUME_STALE_DAYS = 7;

/**
 * Resolve which grave date to open.
 * @param savedIso localStorage ISO or null
 * @param now inject for tests
 */
export function resolveResumeShiftDate(
  savedIso: string | null | undefined,
  now: Date = new Date(),
): Date {
  const today = currentShiftDate(now);
  if (!savedIso || !/^\d{4}-\d{2}-\d{2}$/.test(savedIso.trim())) {
    return today;
  }
  const saved = parseLocalDateISO(savedIso.trim());
  if (Number.isNaN(saved.getTime())) return today;

  const todayWeek = startOfShiftWeek(today);
  const savedWeek = startOfShiftWeek(saved);
  if (sameDay(todayWeek, savedWeek)) return saved;

  const delta = Math.abs(daysBetween(saved, today));
  if (delta <= RESUME_STALE_DAYS) return saved;

  return today;
}

export function resolveResumeWeekStart(
  savedIso: string | null | undefined,
  now: Date = new Date(),
): Date {
  return startOfShiftWeek(resolveResumeShiftDate(savedIso, now));
}

export function readSavedDateIso(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(OMS_SELECTED_DATE_KEY);
  } catch {
    return null;
  }
}

export function writeSavedDateIso(date: Date): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OMS_SELECTED_DATE_KEY, formatLocalDateISO(date));
  } catch {
    /* ignore quota */
  }
}
