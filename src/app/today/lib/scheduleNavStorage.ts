import { parseLocalDateISO, formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";

const STORAGE_KEY = "oms_today_selected_date";

export function readSavedScheduleDate(): Date | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("oms_selected_date");
    if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
    const parsed = parseLocalDateISO(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
}

export function writeSavedScheduleDate(date: Date): void {
  if (typeof window === "undefined") return;
  try {
    const iso = formatLocalDateISO(date);
    localStorage.setItem(STORAGE_KEY, iso);
    localStorage.setItem("oms_selected_date", iso);
  } catch {}
}