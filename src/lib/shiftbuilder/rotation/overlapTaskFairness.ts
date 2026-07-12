/**
 * Overlap task-fair assignment (Phase B / PR3).
 * Seats are fungible within AM/PM; fairness is over standing pool tasks.
 * @see docs/OVERLAP_TASK_ROTATION_DESIGN.md
 */

export type OverlapBand = "AM" | "PM";

export type PoolTask = {
  templateId: string;
  label: string;
  color?: string | null;
};

export type StaffedSeat = {
  dbSlotKey: string;
  tmId: string;
  tmName?: string;
};

export type TaskHistoryEvent = {
  nightDate: string;
  band: OverlapBand;
  tmId: string;
  taskKey: string;
  isOneOff: boolean;
  /** Display label (Phase C insights); fair assign ignores this. */
  taskLabel?: string;
};

export type FairAssignOptions = {
  windowNights: number;
  sameWeekdayPenalty: number;
  oneOffWeight: number;
  seed: number;
  chipsPerSeat: 1;
  /** IANA timezone for weekday math (default America/Detroit). */
  timeZone: string;
};

export type FairAssignResult = {
  assignments: Array<{ seat: StaffedSeat; task: PoolTask }>;
  debug: {
    taskGlobalDue: Array<{ taskKey: string; due: number }>;
    pairScores: Array<{ taskKey: string; tmId: string; score: number }>;
    mode: "fair" | "random_fallback";
  };
};

export const DEFAULT_FAIR_OPTIONS: FairAssignOptions = {
  windowNights: 30,
  sameWeekdayPenalty: 3,
  oneOffWeight: 0,
  seed: 1,
  chipsPerSeat: 1,
  timeZone: "America/Detroit",
};

/** Mulberry32 PRNG — local copy (pools.ts mulberry32 is private). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function hashSeed(...parts: string[]): number {
  let h = 2166136261;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Calendar day distance between two ISO dates (YYYY-MM-DD), absolute. */
export function dateDiffCalendarDays(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T12:00:00Z`);
  const b = Date.parse(`${bIso}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.abs(Math.round((a - b) / 86_400_000));
}

export function weekdayInZone(isoDate: string, timeZone: string): number {
  // 0=Sun … 6=Sat in the given IANA zone
  const d = new Date(`${isoDate}T12:00:00Z`);
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

export function normalizeTaskLabel(label: string): string {
  return (label || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function pairBase(
  taskKey: string,
  tmId: string,
  events: TaskHistoryEvent[],
  tonightIso: string,
  W: number,
): number {
  const relevant = events.filter((e) => e.taskKey === taskKey && e.tmId === tmId);
  if (!relevant.length) return W + 1;
  let min = Infinity;
  for (const e of relevant) {
    const d = dateDiffCalendarDays(tonightIso, e.nightDate);
    if (d < min) min = d;
  }
  return min;
}

function hasSameWeekdayHistory(
  taskKey: string,
  tmId: string,
  events: TaskHistoryEvent[],
  tonightIso: string,
  timeZone: string,
): boolean {
  const tonightWd = weekdayInZone(tonightIso, timeZone);
  return events.some(
    (e) =>
      e.taskKey === taskKey &&
      e.tmId === tmId &&
      weekdayInZone(e.nightDate, timeZone) === tonightWd,
  );
}

function pairScore(
  taskKey: string,
  tmId: string,
  events: TaskHistoryEvent[],
  tonightIso: string,
  opts: FairAssignOptions,
): number {
  const base = pairBase(taskKey, tmId, events, tonightIso, opts.windowNights);
  const penalty = hasSameWeekdayHistory(
    taskKey,
    tmId,
    events,
    tonightIso,
    opts.timeZone,
  )
    ? opts.sameWeekdayPenalty
    : 0;
  return base - penalty;
}

/**
 * Fair assign: higher pairScore preferred; same-weekday history is penalized.
 * n = min(pool, seats); extra seats get no standing chip.
 */
export function fairAssignOverlapTasks(
  pool: PoolTask[],
  seats: StaffedSeat[],
  history: TaskHistoryEvent[],
  band: OverlapBand,
  tonightIso: string,
  opts?: Partial<FairAssignOptions>,
): FairAssignResult {
  const o: FairAssignOptions = { ...DEFAULT_FAIR_OPTIONS, ...opts };
  const empty: FairAssignResult = {
    assignments: [],
    debug: { taskGlobalDue: [], pairScores: [], mode: "fair" },
  };
  if (!pool.length || !seats.length) return empty;

  const events = history.filter((e) => {
    if (e.band !== band) return false;
    if (e.nightDate >= tonightIso) return false;
    if (o.oneOffWeight === 0 && e.isOneOff) return false;
    return true;
  });

  const n = Math.min(pool.length, seats.length);
  const W = o.windowNights;

  const taskGlobalDue = pool.map((t) => {
    const key = t.templateId;
    let due = W + 1;
    for (const seat of seats) {
      const b = pairBase(key, seat.tmId, events, tonightIso, W);
      if (b < due) due = b;
    }
    // Also consider history TMs not in seats for global due
    const tmIds = new Set(events.filter((e) => e.taskKey === key).map((e) => e.tmId));
    for (const tmId of tmIds) {
      const b = pairBase(key, tmId, events, tonightIso, W);
      if (b < due) due = b;
    }
    return { taskKey: key, due, task: t };
  });

  const shuffledPool = seededShuffle(pool, o.seed);
  const orderIndex = new Map(shuffledPool.map((t, i) => [t.templateId, i]));

  const ranked = [...taskGlobalDue].sort((a, b) => {
    if (b.due !== a.due) return b.due - a.due;
    return (orderIndex.get(a.taskKey) ?? 0) - (orderIndex.get(b.taskKey) ?? 0);
  });

  const selected = ranked.slice(0, n).map((r) => r.task);
  const freeSeats = [...seats];
  const remainingTasks = [...selected];
  const assignments: Array<{ seat: StaffedSeat; task: PoolTask }> = [];
  const pairScores: Array<{ taskKey: string; tmId: string; score: number }> = [];

  while (remainingTasks.length && freeSeats.length) {
    let best: {
      ti: number;
      si: number;
      score: number;
      tie: number;
    } | null = null;

    for (let ti = 0; ti < remainingTasks.length; ti++) {
      const task = remainingTasks[ti];
      for (let si = 0; si < freeSeats.length; si++) {
        const seat = freeSeats[si];
        const score = pairScore(task.templateId, seat.tmId, events, tonightIso, o);
        pairScores.push({ taskKey: task.templateId, tmId: seat.tmId, score });
        const tie = hashSeed(String(o.seed), task.templateId, seat.tmId);
        if (
          !best ||
          score > best.score ||
          (score === best.score && tie < best.tie)
        ) {
          best = { ti, si, score, tie };
        }
      }
    }
    if (!best) break;
    const task = remainingTasks.splice(best.ti, 1)[0];
    const seat = freeSeats.splice(best.si, 1)[0];
    assignments.push({ seat, task });
  }

  return {
    assignments,
    debug: {
      taskGlobalDue: ranked.map((r) => ({ taskKey: r.taskKey, due: r.due })),
      pairScores,
      mode: "fair",
    },
  };
}

/** Seeded random 1:1 fallback (staffed only; n = min). */
export function randomAssignOverlapTasks(
  pool: PoolTask[],
  seats: StaffedSeat[],
  seed: number,
): FairAssignResult {
  if (!pool.length || !seats.length) {
    return {
      assignments: [],
      debug: { taskGlobalDue: [], pairScores: [], mode: "random_fallback" },
    };
  }
  const n = Math.min(pool.length, seats.length);
  const shuffledTasks = seededShuffle(pool, seed).slice(0, n);
  const shuffledSeats = seededShuffle(seats, seed ^ 0x9e3779b9).slice(0, n);
  const assignments = shuffledTasks.map((task, i) => ({
    seat: shuffledSeats[i],
    task,
  }));
  return {
    assignments,
    debug: { taskGlobalDue: [], pairScores: [], mode: "random_fallback" },
  };
}
