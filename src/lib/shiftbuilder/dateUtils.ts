// ── Date utilities for ShiftBuilder ──────────────────────────────────────────
// The operational "shift week" runs Friday → Thursday. A shift is named after
// the night it begins (Friday's grave = Fri 11p → Sat 7a). All date logic in
// this file flows from `weekStart` (a Friday) + a day index 0..6.

export const SHIFT_WEEK_START_DOW = 5; // 0 = Sun, 5 = Fri

export function startOfShiftWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // distance back to the most recent Friday (inclusive)
  const back = (d.getDay() + 7 - SHIFT_WEEK_START_DOW) % 7;
  d.setDate(d.getDate() - back);
  return d;
}

/**
 * Roster week start (Thursday-anchored Thu→Wed for the static TM schedule patterns).
 * weekly_pattern[0] = Thursday, [1]=Friday, ..., [6]=Wednesday.
 * Used by tm_default_schedules + tm_on_call_schedules (the new 4-group roster).
 */
export function startOfRosterWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // Thursday is getDay() === 4
  const back = (d.getDay() + 7 - 4) % 7;
  d.setDate(d.getDate() - back);
  return d;
}

// === Shift-aware "today" =====================================================
// A grave shift runs 11pm → 7am and is named after the day it BEGINS. So
// Friday's grave shift runs Fri 11pm → Sat 7am. At 6:30am Saturday morning the
// operator is still finishing Friday's deployment — the picker should still
// show Friday selected, not Saturday.
//
// SHIFT_ROLLOVER_HOUR/MINUTE define when "today" advances to the next calendar
// date. Before the rollover (midnight → 8:30am), we return *yesterday's*
// calendar date as the active shift date. After the rollover, we return
// today's calendar date.
const SHIFT_ROLLOVER_HOUR = 8;
const SHIFT_ROLLOVER_MINUTE = 30;

export function currentShiftDate(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const hour = now.getHours();
  const minute = now.getMinutes();
  const beforeRollover =
    hour < SHIFT_ROLLOVER_HOUR ||
    (hour === SHIFT_ROLLOVER_HOUR && minute < SHIFT_ROLLOVER_MINUTE);
  if (beforeRollover) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/** Whole-day difference between two midnight-anchored Date values. */
export function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
export const MONTH_LONG  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
export const DAY_LONG    = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export function formatWeekLabel(start: Date): string {
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} – ${MONTH_SHORT[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

/** Per-day accent colors (cycle through the 7 nights of the operational week). */
export const SHIFT_DAY_COLORS = ["#C13A14", "#0065bf", "#4d1a8a", "#1f7a3d", "#b8860b", "#8b4513", "#2f4f4f"];

export interface DayDef {
  index: number;
  date: Date;
  short: string;
  name: string;
  dateNum: number;
  monthYear: string;
  color: string;
  meta: string;
  isToday: boolean;
}

export function buildDayDefs(weekStart: Date, today: Date): DayDef[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const name = DAY_LONG[date.getDay()];
    return {
      index: i,
      date,
      short: name.charAt(0),
      name,
      dateNum: date.getDate(),
      monthYear: `${MONTH_LONG[date.getMonth()]} ${date.getFullYear()}`,
      color: SHIFT_DAY_COLORS[i],
      meta: "11p – 7a",
      isToday: sameDay(date, today),
    };
  });
}
