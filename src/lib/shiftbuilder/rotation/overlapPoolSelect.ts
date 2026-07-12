/**
 * Overlap pool selection for Apply Overlap Tasks (Phase D).
 *
 * Pipeline:
 *   full band pool → day-of-week filter → priority cut (n = seats) → fair/random assign
 *
 * AM and PM are always separate (caller filters by band first).
 * @see docs/OVERLAP_TASK_ROTATION_DESIGN.md Phase D
 */

export type OverlapPoolPriority = "low" | "normal" | "high" | "urgent";

/** Higher = more important. Unknown → normal. */
export const PRIORITY_RANK: Record<string, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
};

export function priorityRank(priority: string | null | undefined): number {
  const key = String(priority ?? "normal")
    .trim()
    .toLowerCase();
  return PRIORITY_RANK[key] ?? PRIORITY_RANK.normal;
}

/**
 * Standing pool task with selection metadata.
 * recurrenceDays: 0=Sun … 6=Sat (America/Detroit). null/[] = every night.
 * poolSortOrder: lower = more important within the same priority (null = last).
 */
export type SelectablePoolTask = {
  id: string;
  label: string;
  color?: string | null;
  band: "AM" | "PM";
  priority?: string | null;
  /** Weekday numbers 0(Sun)–6(Sat). Empty/null = eligible every night. */
  recurrenceDays?: number[] | null;
  /** Lower = more important within priority tier. */
  poolSortOrder?: number | null;
};

export type PoolSelectDebug = {
  eligible: Array<{ id: string; label: string; priority: string }>;
  selected: Array<{ id: string; label: string; priority: string }>;
  skippedStaffing: Array<{ id: string; label: string; priority: string }>;
  skippedDay: Array<{ id: string; label: string }>;
  n: number;
  weekday: number;
};

/**
 * Calendar weekday 0=Sun … 6=Sat in IANA zone (default America/Detroit).
 * Matches fair-assign weekday math.
 */
export function weekdayFromIsoDate(
  isoDate: string,
  timeZone = "America/Detroit",
): number {
  const d = new Date(`${String(isoDate).slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return 0;
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
  const w = fmt.format(d);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[w] ?? 0;
}

/** Normalize recurrence_days from DB (jsonb number[] or string[]). */
export function normalizeRecurrenceDays(
  raw: unknown,
): number[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const days: number[] = [];
  for (const x of raw) {
    const n = typeof x === "number" ? x : Number.parseInt(String(x), 10);
    if (Number.isInteger(n) && n >= 0 && n <= 6) days.push(n);
  }
  return days.length ? [...new Set(days)].sort((a, b) => a - b) : null;
}

/**
 * True if task runs on this weekday.
 * null / empty recurrenceDays → every night.
 */
export function isEligibleOnWeekday(
  recurrenceDays: number[] | null | undefined,
  weekday: number,
): boolean {
  if (recurrenceDays == null || recurrenceDays.length === 0) return true;
  return recurrenceDays.includes(weekday);
}

export function filterPoolByDay(
  pool: SelectablePoolTask[],
  tonightIso: string,
  timeZone = "America/Detroit",
): { eligible: SelectablePoolTask[]; skippedDay: SelectablePoolTask[] } {
  const wd = weekdayFromIsoDate(tonightIso, timeZone);
  const eligible: SelectablePoolTask[] = [];
  const skippedDay: SelectablePoolTask[] = [];
  for (const t of pool) {
    if (isEligibleOnWeekday(t.recurrenceDays, wd)) eligible.push(t);
    else skippedDay.push(t);
  }
  return { eligible, skippedDay };
}

/**
 * Sort key for staffing cut (stable when seedOrder provided).
 * Higher priority first; lower poolSortOrder first; higher due first; seed order last.
 */
export function compareForStaffingCut(
  a: SelectablePoolTask,
  b: SelectablePoolTask,
  opts?: {
    dueByTaskId?: Map<string, number>;
    seedOrder?: Map<string, number>;
  },
): number {
  const pr = priorityRank(b.priority) - priorityRank(a.priority);
  if (pr !== 0) return pr;

  const sa = a.poolSortOrder;
  const sb = b.poolSortOrder;
  const aOrd = sa == null || !Number.isFinite(sa) ? 1e9 : sa;
  const bOrd = sb == null || !Number.isFinite(sb) ? 1e9 : sb;
  if (aOrd !== bOrd) return aOrd - bOrd;

  const dueMap = opts?.dueByTaskId;
  if (dueMap) {
    const da = dueMap.get(a.id) ?? -1;
    const db = dueMap.get(b.id) ?? -1;
    if (db !== da) return db - da; // higher due preferred
  }

  const order = opts?.seedOrder;
  if (order) {
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  }
  return a.id.localeCompare(b.id);
}

/**
 * Cut eligible pool to n seats: keep most important tasks, drop the rest.
 * n = staffed seat count for the band.
 */
export function cutPoolForStaffing(
  eligible: SelectablePoolTask[],
  n: number,
  opts?: {
    dueByTaskId?: Map<string, number>;
    seedOrder?: Map<string, number>;
  },
): { selected: SelectablePoolTask[]; skippedStaffing: SelectablePoolTask[] } {
  if (n <= 0 || !eligible.length) {
    return { selected: [], skippedStaffing: [...eligible] };
  }
  const ranked = [...eligible].sort((a, b) => compareForStaffingCut(a, b, opts));
  if (ranked.length <= n) {
    return { selected: ranked, skippedStaffing: [] };
  }
  return {
    selected: ranked.slice(0, n),
    skippedStaffing: ranked.slice(n),
  };
}

/**
 * Full select pipeline for one band:
 * day filter → staffing cut → { selected, debug }.
 */
export function selectOverlapPoolForNight(
  pool: SelectablePoolTask[],
  seatsCount: number,
  tonightIso: string,
  opts?: {
    timeZone?: string;
    dueByTaskId?: Map<string, number>;
    seedOrder?: Map<string, number>;
  },
): {
  selected: SelectablePoolTask[];
  debug: PoolSelectDebug;
} {
  const timeZone = opts?.timeZone ?? "America/Detroit";
  const weekday = weekdayFromIsoDate(tonightIso, timeZone);
  const { eligible, skippedDay } = filterPoolByDay(pool, tonightIso, timeZone);
  const n = Math.min(Math.max(0, seatsCount), eligible.length);
  const { selected, skippedStaffing } = cutPoolForStaffing(eligible, n, {
    dueByTaskId: opts?.dueByTaskId,
    seedOrder: opts?.seedOrder,
  });

  const brief = (t: SelectablePoolTask) => ({
    id: t.id,
    label: t.label,
    priority: String(t.priority ?? "normal"),
  });

  return {
    selected,
    debug: {
      eligible: eligible.map(brief),
      selected: selected.map(brief),
      skippedStaffing: skippedStaffing.map(brief),
      skippedDay: skippedDay.map((t) => ({ id: t.id, label: t.label })),
      n,
      weekday,
    },
  };
}

/** Human weekday short labels for UI (index = JS Sun=0). */
export const WEEKDAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"] as const;
export const WEEKDAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

export const PRIORITY_CYCLE: OverlapPoolPriority[] = [
  "urgent",
  "high",
  "normal",
  "low",
];

export function nextPriority(
  current: string | null | undefined,
): OverlapPoolPriority {
  const cur = String(current ?? "normal").toLowerCase() as OverlapPoolPriority;
  const i = PRIORITY_CYCLE.indexOf(cur);
  if (i < 0) return "high";
  return PRIORITY_CYCLE[(i + 1) % PRIORITY_CYCLE.length];
}

/** Format recurrence for compact chip title. Empty = every night. */
export function formatRecurrenceDaysLabel(
  days: number[] | null | undefined,
): string {
  const n = normalizeRecurrenceDays(days);
  if (!n || n.length === 0) return "Every night";
  if (n.length === 7) return "Every night";
  return n.map((d) => WEEKDAY_LABELS[d] ?? "?").join("·");
}
