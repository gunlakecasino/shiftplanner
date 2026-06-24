/**
 * Types for the new static TM Default Weekly Schedule system.
 *
 * This replaces the old heavy reliance on per-night ADP imports for baseline scheduling.
 */

export interface WeeklyShift {
  startTime: string | null;   // "21:00" or null
  endTime: string | null;     // "07:00" or null
  label: string;              // "Full Grave 9p-7a", "PM Overlap 11p-7a", "OFF"
}

export type WeeklyPattern = WeeklyShift[]; // length === 7

export interface TMDefaultSchedule {
  id: string;
  tm_id: string;
  effective_from: string;     // YYYY-MM-DD
  weekly_pattern: WeeklyPattern;
  source?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

/** Payload for creating/updating a default schedule via API or Sudo */
export interface UpsertTMDefaultScheduleInput {
  tm_id: string;
  effective_from: string;
  weekly_pattern: WeeklyPattern;
  source?: string;
  notes?: string;
}

export interface TMGroup {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

export interface TMGroupMember {
  tm_id: string;
  group_id: string;
}

export interface TMOnCallSchedule {
  id: string;
  tm_id: string;
  week_start: string;           // YYYY-MM-DD (start of the grave week)
  weekly_pattern: WeeklyPattern;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertTMOnCallScheduleInput {
  tm_id: string;
  week_start: string;
  weekly_pattern: WeeklyPattern;
  is_active?: boolean;
  notes?: string;
}

/**
 * The 7-day pattern is always stored in the same order as the source CSV
 * (or as defined by the grave week convention in the app).
 *
 * Day 0 in the pattern corresponds to the first column in the imported schedule, etc.
 * We will add a system-level mapping later if we want calendar-day semantics.
 */
export const GRAVE_WEEK_PATTERN_LENGTH = 7;

/**
 * Returns true only if the shift entry represents an actual working day.
 * Explicitly treats:
 *   - missing entry
 *   - startTime: null
 *   - label === "OFF"
 * as non-working (OFF / not scheduled).
 *
 * Used by graves_default_schedule resolution and schedule preview logic.
 */
export function isWorkingShift(entry: WeeklyShift | null | undefined): boolean {
  if (!entry) return false;
  if (entry.label === "OFF") return false;
  if (!entry.startTime) return false;
  return true;
}
