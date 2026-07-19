/**
 * Shared scheduled-roster types used by graves_default_schedule resolution.
 * Scheduling authority lives in gravesDefaultSchedule.ts — not ADP / tm_default_schedules.
 */

import type { WeeklyShift } from "./types/schedules";

/** Rich representation of a TM's effective shift (or explicit OFF) for one night. */
export type NightShift = WeeklyShift | { label: "OFF"; startTime: null; endTime: null };

export interface ScheduledTm {
  id: string;
  tmId: string | null;
  name: string;
  gravePool: string | null;
  gender: string | null;
  adminTrainingStatus?: string | null;
}

export interface ScheduledTmWithRole extends ScheduledTm {
  shift: NightShift;
  isFullGrave: boolean;
  isPMOverlap: boolean;
  isAMOverlap: boolean;
}

export interface ScheduledTmsForNightResult {
  allScheduled: ScheduledTm[];
  fullGraveScheduled: ScheduledTm[];
  pmOverlapScheduled: ScheduledTm[];
  amOverlapScheduled: ScheduledTm[];
  scheduledWithRoles: ScheduledTmWithRole[];
}
