/**
 * Pure helpers for Apply Overlap Tasks (PR2–PR4).
 * Fair history-aware assign: overlapTaskFairness.ts + OVERLAP_FAIR_APPLY.
 */

export type OverlapBand = "AM" | "PM";

export type OverlapPoolTask = {
  id: string;
  label: string;
  color?: string | null;
  band: OverlapBand;
};

export type OverlapStaffedSeat = {
  dbSlotKey: string;
  tmId: string;
};

export type ExistingSlotTask = {
  taskLabel: string;
  sortOrder?: number | null;
  taskColor?: string | null;
  isCoverage?: boolean | null;
  /** Template id when chip came from standing apply (PR3). */
  sourceWorkItemId?: string | null;
  /** Manual/one-off chip (PR4); always preserved on standing-only replace. */
  isOneOff?: boolean | null;
};

export type MergedSlotTask = {
  taskLabel: string;
  sortOrder: number;
  taskColor: string | null;
  isCoverage: boolean;
  sourceWorkItemId: string | null;
  isOneOff: boolean;
};

/** Trim + lowercase for standing-pool membership / dedupe. */
export function normalizeTaskLabel(label: string | null | undefined): string {
  return String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Parse band from DB or unindexed overlap keys.
 * Accepts: overlap_am_0, overlap_pm_3, overlap_am, overlap_pm (case-insensitive).
 */
export function overlapBandFromSlotKey(slotKey: string): OverlapBand | null {
  const m = String(slotKey ?? "").match(/^overlap_(am|pm)(?:_\d+)?$/i);
  if (!m) return null;
  return m[1].toLowerCase() === "am" ? "AM" : "PM";
}

/** True for any overlap_* key we treat as pool config or OL card. */
export function isOverlapSlotKey(slotKey: string): boolean {
  return overlapBandFromSlotKey(slotKey) != null;
}

/**
 * Dedupe pool rows: by id first, then by normalizeTaskLabel(title).
 * Preserves first-seen order.
 */
export function dedupeOverlapPoolTasks(
  tasks: Array<{ id: string; label: string; color?: string | null; band: OverlapBand }>,
): OverlapPoolTask[] {
  const seenIds = new Set<string>();
  const seenLabels = new Set<string>();
  const out: OverlapPoolTask[] = [];
  for (const t of tasks) {
    const id = String(t.id ?? "").trim();
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
    }
    const norm = normalizeTaskLabel(t.label);
    if (!norm) continue;
    if (seenLabels.has(norm)) continue;
    seenLabels.add(norm);
    out.push({
      id: id || `label:${norm}`,
      label: String(t.label ?? "").trim(),
      color: t.color ?? null,
      band: t.band,
    });
  }
  return out;
}

/** Deterministic PRNG (mulberry32) — local copy for seeded apply. */
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
  const out = [...items];
  const rand = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Stable numeric seed from night id (or any string). */
export function hashStringSeed(input: string): number {
  let h = 2166136261;
  const s = String(input ?? "");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Random 1:1 assign: n = min(pool, seats); shuffle pool and seats; zip first n.
 * Extra seats get no standing chip; extra pool tasks unassigned.
 */
export function randomAssignPoolToSeats(
  pool: OverlapPoolTask[],
  seats: OverlapStaffedSeat[],
  seed: number,
): Array<{ seat: OverlapStaffedSeat; task: OverlapPoolTask }> {
  if (!pool.length || !seats.length) return [];
  const shuffledPool = seededShuffle(pool, seed);
  const shuffledSeats = seededShuffle(seats, seed ^ 0x9e3779b9);
  const n = Math.min(shuffledPool.length, shuffledSeats.length);
  const out: Array<{ seat: OverlapStaffedSeat; task: OverlapPoolTask }> = [];
  for (let i = 0; i < n; i++) {
    out.push({ seat: shuffledSeats[i], task: shuffledPool[i] });
  }
  return out;
}

/**
 * True if this non-coverage chip is a standing pool member (replace candidate).
 * Priority: source_work_item_id ∈ pool ids, else normalized label ∈ pool labels.
 * One-offs are never standing (caller should skip before calling).
 */
export function isStandingPoolMember(
  row: Pick<ExistingSlotTask, "taskLabel" | "sourceWorkItemId" | "isOneOff">,
  standingPoolLabels: Set<string>,
  standingPoolIds?: Set<string> | null,
): boolean {
  if (row.isOneOff) return false;
  const src = String(row.sourceWorkItemId ?? "").trim();
  if (src && standingPoolIds?.has(src)) return true;
  const norm = normalizeTaskLabel(row.taskLabel);
  return !!norm && standingPoolLabels.has(norm);
}

/**
 * Standing-only merge: keep coverage + one-offs + non-pool manuals; replace standing.
 * `newStanding` are the chips Apply wants on the card (typically 0–1 for v1).
 * Existing rows identified as standing (id ∈ pool or label ∈ pool) are dropped.
 * Rows with is_one_off=true are always preserved.
 */
export function mergeStandingOnlyTasks(params: {
  existing: ExistingSlotTask[];
  newStanding: Array<{
    taskLabel: string;
    sortOrder?: number;
    taskColor?: string | null;
    isCoverage?: boolean;
    sourceWorkItemId?: string | null;
    isOneOff?: boolean;
  }>;
  standingPoolLabels: Iterable<string>;
  /** Template ids for the current band pool (PR3+ identity). */
  standingPoolIds?: Iterable<string>;
  preserveCoverage?: boolean;
}): MergedSlotTask[] {
  const poolSet = new Set(
    [...params.standingPoolLabels].map((l) => normalizeTaskLabel(l)).filter(Boolean),
  );
  const poolIds = new Set(
    [...(params.standingPoolIds ?? [])].map((id) => String(id ?? "").trim()).filter(Boolean),
  );
  const preserveCoverage = params.preserveCoverage !== false;

  const manuals: MergedSlotTask[] = [];
  const coverage: MergedSlotTask[] = [];

  for (const row of params.existing) {
    const label = String(row.taskLabel ?? "").trim();
    if (!label) continue;
    const isCov = !!row.isCoverage;
    if (isCov) {
      if (preserveCoverage) {
        coverage.push({
          taskLabel: label,
          sortOrder: row.sortOrder ?? 0,
          taskColor: row.taskColor ?? null,
          isCoverage: true,
          sourceWorkItemId: row.sourceWorkItemId ?? null,
          isOneOff: false,
        });
      }
      continue;
    }
    // K14: one-offs always survive standing replace
    if (row.isOneOff) {
      manuals.push({
        taskLabel: label,
        sortOrder: row.sortOrder ?? 0,
        taskColor: row.taskColor ?? null,
        isCoverage: false,
        sourceWorkItemId: row.sourceWorkItemId ?? null,
        isOneOff: true,
      });
      continue;
    }
    if (isStandingPoolMember(row, poolSet, poolIds)) continue; // standing → replace
    manuals.push({
      taskLabel: label,
      sortOrder: row.sortOrder ?? 0,
      taskColor: row.taskColor ?? null,
      isCoverage: false,
      sourceWorkItemId: row.sourceWorkItemId ?? null,
      isOneOff: false,
    });
  }

  const standing = params.newStanding
    .map((t, idx) => ({
      taskLabel: String(t.taskLabel ?? "").trim(),
      sortOrder: t.sortOrder ?? idx,
      taskColor: t.taskColor ?? null,
      isCoverage: false,
      sourceWorkItemId: t.sourceWorkItemId ?? null,
      // Standing apply chips are never one-offs (K14)
      isOneOff: t.isOneOff === true ? true : false,
    }))
    .filter((t) => t.taskLabel)
    .map((t) => ({
      ...t,
      // Force standing path defaults unless caller marked one-off explicitly
      isOneOff: t.isOneOff === true,
    }));

  const merged = [...standing, ...manuals, ...coverage];
  return merged.map((t, idx) => ({ ...t, sortOrder: idx }));
}

/** Collect normalized standing labels for a band from pool tasks. */
export function standingPoolLabelSet(pool: OverlapPoolTask[]): Set<string> {
  const s = new Set<string>();
  for (const t of pool) {
    const n = normalizeTaskLabel(t.label);
    if (n) s.add(n);
  }
  return s;
}

/** Collect template ids for a band pool. */
export function standingPoolIdSet(pool: OverlapPoolTask[]): Set<string> {
  const s = new Set<string>();
  for (const t of pool) {
    const id = String(t.id ?? "").trim();
    if (id && !id.startsWith("label:")) s.add(id);
  }
  return s;
}
