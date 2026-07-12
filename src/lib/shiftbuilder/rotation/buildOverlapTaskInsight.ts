/**
 * Pure Phase C helper — Overlap task insights for PlacementPad OL mode.
 * Accepts preloaded pool + history; no I/O.
 * @see docs/OVERLAP_TASK_ROTATION_DESIGN.md (Phase C)
 */

import { normalizeTaskLabel } from "./overlapTaskApply";

export type OverlapInsightBand = "AM" | "PM";

export type OverlapTonightChip = {
  label: string;
  isOneOff?: boolean;
  sourceWorkItemId?: string | null;
  isCoverage?: boolean;
};

export type OverlapStandingPoolItem = {
  id: string;
  label: string;
};

/** One historical assignment of a task to a TM on a band seat. */
export type OverlapTaskHistoryRow = {
  nightDate: string;
  tmId: string;
  tmName: string;
  taskLabel: string;
  /** source_work_item_id when known, else normalizeTaskLabel(taskLabel). */
  taskKey: string;
  isOneOff?: boolean;
};

export type OverlapTaskInsightModel = {
  band: OverlapInsightBand;
  tonightChips: Array<{
    label: string;
    isOneOff?: boolean;
    sourceWorkItemId?: string | null;
  }>;
  standingPool: Array<{ id: string; label: string }>;
  /** Last ≤10 prior nights that had tonight’s primary task (same band). */
  recentForTask: Array<{ nightDate: string; tmName: string; tmId: string }>;
  /** Tasks this TM had recently (same band, within windowNights). */
  recentForTm: Array<{ nightDate: string; taskLabel: string }>;
  emptySeat: boolean;
  poolEmpty: boolean;
};

export type BuildOverlapTaskInsightInput = {
  band: OverlapInsightBand;
  /** Assigned TM id, or null/empty when seat is empty. */
  tmId?: string | null;
  tonightChips?: OverlapTonightChip[];
  standingPool?: OverlapStandingPoolItem[];
  /**
   * Prior-night events for this band only (caller may pre-filter).
   * Rows with nightDate >= tonightIso are ignored.
   */
  history?: OverlapTaskHistoryRow[];
  /** Tonight’s grave night ISO date (YYYY-MM-DD). History is exclusive of this date. */
  tonightIso: string;
  /** Max recent assignees for tonight’s task (default 10). */
  recentForTaskLimit?: number;
  /** Lookback nights for TM task list (default 30). */
  windowNights?: number;
};

const DEFAULT_TASK_LIMIT = 10;
const DEFAULT_WINDOW = 30;

/**
 * Parse band from UI (`OL-PM-0`) or DB (`overlap_pm_3`) keys.
 */
export function overlapInsightBandFromSlotKey(slotKey: string): OverlapInsightBand | null {
  const ui = String(slotKey ?? "").match(/^OL-(PM|AM)(?:-\d+)?$/i);
  if (ui) return ui[1].toUpperCase() as OverlapInsightBand;
  const db = String(slotKey ?? "").match(/^overlap_(am|pm)(?:_\d+)?$/i);
  if (db) return db[1].toUpperCase() as OverlapInsightBand;
  return null;
}

/** True when PlacementPad should use OL task-insight mode. */
export function isOverlapInsightSlotKey(slotKey: string): boolean {
  return /^OL-(PM|AM)-\d+$/i.test(String(slotKey ?? ""));
}

function poolLabelSet(pool: OverlapStandingPoolItem[]): Set<string> {
  const s = new Set<string>();
  for (const p of pool) {
    const n = normalizeTaskLabel(p.label);
    if (n) s.add(n);
  }
  return s;
}

function inferIsOneOff(
  chip: OverlapTonightChip,
  poolNorm: Set<string>,
): boolean | undefined {
  if (chip.isOneOff === true) return true;
  if (chip.isOneOff === false) return false;
  if (chip.sourceWorkItemId) return false;
  const n = normalizeTaskLabel(chip.label);
  if (!n) return undefined;
  if (poolNorm.size === 0) return undefined;
  return !poolNorm.has(n);
}

function chipTaskKeys(chip: OverlapTonightChip): Set<string> {
  const keys = new Set<string>();
  const id = String(chip.sourceWorkItemId ?? "").trim();
  if (id) keys.add(id);
  const n = normalizeTaskLabel(chip.label);
  if (n) keys.add(n);
  return keys;
}

function eventMatchesChip(event: OverlapTaskHistoryRow, chip: OverlapTonightChip): boolean {
  const keys = chipTaskKeys(chip);
  if (keys.has(String(event.taskKey ?? "").trim())) return true;
  const n = normalizeTaskLabel(event.taskLabel);
  if (n && keys.has(n)) return true;
  return false;
}

/**
 * Build deterministic OL task insight model from preloaded data.
 */
export function buildOverlapTaskInsight(
  input: BuildOverlapTaskInsightInput,
): OverlapTaskInsightModel {
  const band = input.band;
  const tonightIso = String(input.tonightIso ?? "").slice(0, 10);
  const taskLimit = input.recentForTaskLimit ?? DEFAULT_TASK_LIMIT;
  const windowNights = input.windowNights ?? DEFAULT_WINDOW;

  const standingPool = (input.standingPool ?? [])
    .map((p) => ({
      id: String(p.id ?? "").trim(),
      label: String(p.label ?? "").trim(),
    }))
    .filter((p) => p.label);

  const poolNorm = poolLabelSet(standingPool);
  const poolEmpty = standingPool.length === 0;

  const tmId = String(input.tmId ?? "").trim() || null;
  const emptySeat = !tmId;

  const rawChips = input.tonightChips ?? [];
  const tonightChips = rawChips
    .filter((c) => !c.isCoverage)
    .map((c) => {
      const label = String(c.label ?? "").trim();
      const sourceWorkItemId =
        c.sourceWorkItemId != null && String(c.sourceWorkItemId).trim()
          ? String(c.sourceWorkItemId).trim()
          : null;
      const isOneOff = inferIsOneOff(c, poolNorm);
      return {
        label,
        ...(isOneOff !== undefined ? { isOneOff } : {}),
        ...(sourceWorkItemId ? { sourceWorkItemId } : { sourceWorkItemId: null }),
      };
    })
    .filter((c) => c.label);

  const history = (input.history ?? []).filter((e) => {
    const nd = String(e.nightDate ?? "").slice(0, 10);
    if (!nd || !tonightIso) return false;
    if (nd >= tonightIso) return false;
    return true;
  });

  // Newest first for stable presentation
  const sorted = [...history].sort((a, b) =>
    String(b.nightDate).localeCompare(String(a.nightDate)),
  );

  // Primary tonight task = first non-coverage chip
  const primaryChip = tonightChips[0]
    ? {
        label: tonightChips[0].label,
        sourceWorkItemId: tonightChips[0].sourceWorkItemId,
        isOneOff: tonightChips[0].isOneOff,
      }
    : null;

  const recentForTask: OverlapTaskInsightModel["recentForTask"] = [];
  if (primaryChip) {
    const seenNights = new Set<string>();
    for (const ev of sorted) {
      if (!eventMatchesChip(ev, primaryChip)) continue;
      const nd = String(ev.nightDate).slice(0, 10);
      // One row per night (first = newest assignee if multiple — rare)
      if (seenNights.has(nd)) continue;
      seenNights.add(nd);
      recentForTask.push({
        nightDate: nd,
        tmId: String(ev.tmId ?? ""),
        tmName: String(ev.tmName ?? ev.tmId ?? "").trim() || String(ev.tmId ?? ""),
      });
      if (recentForTask.length >= taskLimit) break;
    }
  }

  const recentForTm: OverlapTaskInsightModel["recentForTm"] = [];
  if (tmId) {
    // Collect distinct night dates (newest first) within window, then list tasks
    const nightDates: string[] = [];
    const nightSet = new Set<string>();
    for (const ev of sorted) {
      if (String(ev.tmId) !== tmId) continue;
      const nd = String(ev.nightDate).slice(0, 10);
      if (nightSet.has(nd)) continue;
      nightSet.add(nd);
      nightDates.push(nd);
      if (nightDates.length >= windowNights) break;
    }
    const allowedNights = new Set(nightDates);
    const seenPair = new Set<string>();
    for (const ev of sorted) {
      if (String(ev.tmId) !== tmId) continue;
      const nd = String(ev.nightDate).slice(0, 10);
      if (!allowedNights.has(nd)) continue;
      const label = String(ev.taskLabel ?? "").trim();
      if (!label) continue;
      const pair = `${nd}|${normalizeTaskLabel(label)}`;
      if (seenPair.has(pair)) continue;
      seenPair.add(pair);
      recentForTm.push({ nightDate: nd, taskLabel: label });
    }
  }

  return {
    band,
    tonightChips,
    standingPool,
    recentForTask,
    recentForTm,
    emptySeat,
    poolEmpty,
  };
}
