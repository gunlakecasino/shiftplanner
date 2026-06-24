import type { ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import { ZONE_DEFS, RR_DEFS } from "@/lib/shiftbuilder/constants";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { isEligibleForSlot, normalizeGender, areSwapLanePeers } from "@/lib/shiftbuilder/placement";

/** Minimal TM fields for swap / eligibility checks. */
export type PlacementTmProfile = {
  gender?: string | null;
  gravePool?: string | null;
  grave_pool?: string | null;
  isAMOverlap?: boolean;
  is_am_overlap?: boolean;
  isPMOverlap?: boolean;
  is_pm_overlap?: boolean;
};

function normalizeTmForEligibility(tm: PlacementTmProfile): Record<string, unknown> {
  return {
    gender: tm.gender,
    gravePool: tm.gravePool ?? tm.grave_pool,
    isAMOverlap: tm.isAMOverlap ?? tm.is_am_overlap,
    isPMOverlap: tm.isPMOverlap ?? tm.is_pm_overlap,
  };
}

/** Both TMs must be eligible for the other's slot (gender, overlap pool, etc.). */
export function canSuggestSwapBetween(
  currentTm: PlacementTmProfile | null | undefined,
  currentSlotKey: string,
  otherTm: PlacementTmProfile | null | undefined,
  otherSlotKey: string,
): boolean {
  if (!currentTm || !otherTm) return false;
  if (!areSwapLanePeers(currentSlotKey, otherSlotKey)) return false;
  const cur = normalizeTmForEligibility(currentTm);
  const other = normalizeTmForEligibility(otherTm);
  return (
    isEligibleForSlot(cur, otherSlotKey) && isEligibleForSlot(other, currentSlotKey)
  );
}

/** Nights of history used for the placement spread grid. */
export const PLACEMENT_SPREAD_NIGHTS = 30;

/** Unique slot keys the TM worked at least once in the last N grave nights (before viewed night). */
export function getSpreadPlacementKeys(
  h: ZoneDetailEntry | null,
  nightCount: number = PLACEMENT_SPREAD_NIGHTS,
  beforeIso?: string,
): string[] {
  if (!h?.zoneDates) return [];
  const events: Array<{ ui: string; d: string }> = [];
  for (const [ui, ds] of Object.entries(h.zoneDates)) {
    for (const d of ds || []) {
      if (beforeIso && d >= beforeIso) continue;
      events.push({ ui, d });
    }
  }
  events.sort((a, b) => b.d.localeCompare(a.d));

  const nightsIncluded = new Set<string>();
  const keys = new Set<string>();

  for (const e of events) {
    if (nightsIncluded.size >= nightCount && !nightsIncluded.has(e.d)) continue;
    nightsIncluded.add(e.d);
    keys.add(e.ui);
  }

  return Array.from(keys);
}

/** Times each slot was worked within the last N grave nights (same window as spread keys). */
export function getSpreadPlacementCounts(
  h: ZoneDetailEntry | null,
  nightCount: number = PLACEMENT_SPREAD_NIGHTS,
  beforeIso?: string,
): Map<string, number> {
  if (!h?.zoneDates) return new Map();
  const events: Array<{ ui: string; d: string }> = [];
  for (const [ui, ds] of Object.entries(h.zoneDates)) {
    for (const d of ds || []) {
      if (beforeIso && d >= beforeIso) continue;
      events.push({ ui, d });
    }
  }
  events.sort((a, b) => b.d.localeCompare(a.d));

  const nightsIncluded = new Set<string>();
  const counts = new Map<string, number>();

  for (const e of events) {
    if (nightsIncluded.size >= nightCount && !nightsIncluded.has(e.d)) continue;
    nightsIncluded.add(e.d);
    counts.set(e.ui, (counts.get(e.ui) ?? 0) + 1);
  }

  return counts;
}

/** Last-30 matrix legend colors (matches PlacementPad matrix legend dots). */
export const MATRIX_SPREAD_ONCE = "#34C759";
export const MATRIX_SPREAD_TWICE = "#FF9500";
export const MATRIX_SPREAD_THRICE_PLUS = "#FF3B30";
export const MATRIX_SPREAD_NONE = "#C7C7CC";

/** Last-30 spread pill accent by placement count (1=green, 2=orange, 3+=red). */
export function spreadFrequencyAccent(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return MATRIX_SPREAD_ONCE;
  if (count === 2) return MATRIX_SPREAD_TWICE;
  return MATRIX_SPREAD_THRICE_PLUS;
}

/** Most recent N placement UI keys for a TM, prior to viewed night. */
export function getRecentPlacementKeys(
  h: ZoneDetailEntry | null,
  n: number,
  beforeIso?: string,
): string[] {
  if (!h?.zoneDates) return [];
  const events: Array<{ ui: string; d: string }> = [];
  for (const [ui, ds] of Object.entries(h.zoneDates)) {
    for (const d of ds || []) {
      if (beforeIso && d >= beforeIso) continue;
      events.push({ ui, d });
    }
  }
  events.sort((a, b) => b.d.localeCompare(a.d));
  const topN = events.slice(0, n);
  const seen = new Set<string>();
  const uniques: string[] = [];
  for (const e of topN) {
    if (!seen.has(e.ui)) {
      seen.add(e.ui);
      uniques.push(e.ui);
    }
  }
  return uniques;
}

export function getDaysSinceForKey(
  h: ZoneDetailEntry | null,
  key: string,
  beforeIso: string,
): string {
  const dates = (h?.zoneDates?.[key] || []).filter((d: string) => d < beforeIso);
  if (!dates.length) return "—";
  const latest = dates.sort().reverse()[0];
  const d1 = new Date(beforeIso + "T12:00:00");
  const d2 = new Date(latest + "T12:00:00");
  const diffMs = d1.getTime() - d2.getTime();
  const days = Math.max(0, Math.floor(diffMs / (1000 * 3600 * 24)));
  return `${days}d`;
}

export function nightIsoFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Hard engine gate — last N placement events (newest first), every card type. */
export const PRIOR_PLACEMENT_CRITICAL_WINDOW = 3;

/** Soft fit trail — last N placement events, same-area only. */
export const LAST5_SOFT_TRAIL_COUNT = 5;

/**
 * Canonical repeat key for prior-N / critical-repeat checks.
 * MRR8, WRR8, and RR8 all map to RR8 (same restroom number).
 */
export function placementRepeatKey(ui: string): string {
  if (!ui) return ui;
  const rr = ui.match(/^(?:M|W)?RR(\d+)$/i);
  if (rr) return `RR${rr[1]}`;
  return ui;
}

/** Side-family key for cross-station RR rotation (all WRR* or all MRR*). */
export function placementSideFamilyRepeatKey(ui: string): string | null {
  if (!ui) return null;
  if (/^WRR\d+$/i.test(ui)) return "WRR";
  if (/^MRR\d+$/i.test(ui)) return "MRR";
  return null;
}

export function placementRepeatKeysMatch(a: string, b: string): boolean {
  return placementRepeatKey(a) === placementRepeatKey(b);
}

/**
 * True when candidate slot conflicts with a prior placement for rotation hard gates:
 * same RR number (incl. opposite side), same exact zone/aux key, or same RR side-family.
 */
export function placementRepeatKeysConflict(candidateSlot: string, priorUi: string): boolean {
  if (placementRepeatKeysMatch(candidateSlot, priorUi)) return true;
  const candFamily = placementSideFamilyRepeatKey(candidateSlot);
  const priorFamily = placementSideFamilyRepeatKey(priorUi);
  return !!(candFamily && priorFamily && candFamily === priorFamily);
}

/** Sum spread counts for all UI keys that share the same repeat area (RR sides). */
export function spreadCountForRepeatKey(
  counts: Map<string, number>,
  slotKey: string,
): number {
  const target = placementRepeatKey(slotKey);
  let total = 0;
  for (const [ui, n] of counts) {
    if (placementRepeatKey(ui) === target) total += n;
  }
  return total;
}

/** Card name trail — last N graves before tonight (newest first). */
export const CARD_PLACEMENT_TRAIL_COUNT = 3;

/** Compact trail label on assignment cards (e.g. Z4, RR8, Z9SR). */
export function formatCardPlacementTrailLabel(ui: string, fallback?: string): string {
  if (ui === "Z9SR") return "Z9SR";
  if (/^Z\d+$/.test(ui)) return ui;
  const rr = ui.match(/^[MW]RR(\d+)$/);
  if (rr) return `RR${rr[1]}`;
  if (ui.startsWith("TR")) return `T${ui.replace(/\D/g, "")}`;
  const raw = fallback ?? ui;
  return raw.replace(/\s+/g, "");
}

/** Merge DB history with in-app week plan entries (builder live layer). */
export function collectPlacementTrailEvents(
  history: ZoneDetailEntry | null | undefined,
  beforeIso?: string,
  weekEntries?: Array<{ nightDate: string; slotKey: string }>,
): Array<{ ui: string; d: string }> {
  const events: Array<{ ui: string; d: string }> = [];

  if (history?.zoneDates) {
    for (const [ui, ds] of Object.entries(history.zoneDates)) {
      for (const d of ds || []) {
        if (beforeIso && d >= beforeIso) continue;
        events.push({ ui, d });
      }
    }
  }

  const seen = new Set(events.map((e) => `${e.d}|${e.ui}`));

  if (weekEntries?.length) {
    for (const { nightDate, slotKey } of weekEntries) {
      if (!slotKey) continue;
      if (beforeIso && nightDate >= beforeIso) continue;
      const key = `${nightDate}|${slotKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({ ui: slotKey, d: nightDate });
    }
  }

  events.sort((a, b) => b.d.localeCompare(a.d));
  return events;
}

export function buildPlacementTrailLabels(
  history: ZoneDetailEntry | null | undefined,
  beforeIso?: string,
  count = CARD_PLACEMENT_TRAIL_COUNT,
  weekEntries?: Array<{ nightDate: string; slotKey: string }>,
): string[] {
  return collectPlacementTrailEvents(history, beforeIso, weekEntries)
    .slice(0, count)
    .map((e) => formatCardPlacementTrailLabel(e.ui));
}

/** Week plan entries for one TM, optionally scoped before a night (exclusive). */
export function weekEntriesForTm(
  weeklyRecentHistory:
    | Map<string, Array<{ nightDate: string; slotKey: string }>>
    | undefined,
  tmId: string,
  beforeIso?: string,
): Array<{ nightDate: string; slotKey: string }> {
  const rows = weeklyRecentHistory?.get(tmId) ?? [];
  if (!beforeIso) return rows;
  return rows.filter((r) => r.nightDate < beforeIso);
}

/**
 * Last N placement events (newest first), merging DB history with in-week plan entries.
 * Matches the TM name trail on assignment cards — one entry per slot assignment, not deduped by night.
 */
export function getMergedPlacementSequence(
  history: ZoneDetailEntry | null,
  n: number,
  beforeIso?: string,
  weekEntries?: Array<{ nightDate: string; slotKey: string }>,
): string[] {
  return collectPlacementTrailEvents(history, beforeIso, weekEntries)
    .slice(0, n)
    .map((e) => e.ui);
}

/**
 * UI / fit chips — same deployment area in the TM's last N placement events.
 * Restrooms: same RR number only (WRR8/MRR8/RR8); not cross-station WRR6 vs WRR8.
 */
export function isInPriorPlacementSameAreaWindow(
  history: ZoneDetailEntry | null,
  slotKey: string,
  beforeIso?: string,
  window = PRIOR_PLACEMENT_CRITICAL_WINDOW,
  weekEntries?: Array<{ nightDate: string; slotKey: string }>,
): boolean {
  const priorPlacements = getMergedPlacementSequence(history, window, beforeIso, weekEntries);
  return priorPlacements.some((ui) => placementRepeatKeysMatch(slotKey, ui));
}

/** Engine hard exclude — same area or RR side-family (MRR vs WRR cross-station) in last N placements. */
export function isInPriorPlacementWindow(
  history: ZoneDetailEntry | null,
  slotKey: string,
  beforeIso?: string,
  window = PRIOR_PLACEMENT_CRITICAL_WINDOW,
  weekEntries?: Array<{ nightDate: string; slotKey: string }>,
): boolean {
  const priorPlacements = getMergedPlacementSequence(history, window, beforeIso, weekEntries);
  return priorPlacements.some((ui) => placementRepeatKeysConflict(slotKey, ui));
}

/** Soft last-5 trail — same RR number or zone only (not cross-station WRR family). */
export function isInLast5SameAreaTrail(
  history: ZoneDetailEntry | null,
  slotKey: string,
  beforeIso?: string,
  weekEntries?: Array<{ nightDate: string; slotKey: string }>,
): boolean {
  return isSlotInPlacementSequence(
    getMergedPlacementSequence(history, LAST5_SOFT_TRAIL_COUNT, beforeIso, weekEntries),
    slotKey,
  );
}

export function isSlotInPlacementSequence(
  sequence: string[],
  slotKey: string,
): boolean {
  return sequence.some((ui) => placementRepeatKeysMatch(slotKey, ui));
}

/**
 * Last N placement nights, newest → oldest (most recent first).
 * Includes duplicate locations (e.g. Z1, Z1, Z1, Z4, ADM).
 */
export function getLastPlacementSequence(
  h: ZoneDetailEntry | null,
  n: number,
  beforeIso?: string,
): string[] {
  if (!h?.zoneDates) return [];
  const events: Array<{ ui: string; d: string }> = [];
  for (const [ui, ds] of Object.entries(h.zoneDates)) {
    for (const d of ds || []) {
      if (beforeIso && d >= beforeIso) continue;
      events.push({ ui, d });
    }
  }
  events.sort((a, b) => b.d.localeCompare(a.d));
  return events.slice(0, n).map((e) => e.ui);
}

/** Matrix keys shown in the placement pad spread for a given TM. */
export function buildMatrixSlotKeysForTm(
  tmId: string | undefined,
  members: Array<{ id?: string; tmId?: string; tm_id?: string; gender?: string | null }>,
  auxDefs: AuxDef[],
): string[] {
  const keys = ZONE_DEFS.map((z) => z.key);
  const rawGender =
    members.find(
      (m) => m.id === tmId || m.tmId === tmId || m.tm_id === tmId,
    )?.gender ?? null;
  const g = normalizeGender(rawGender);
  for (const d of RR_DEFS) {
    if (!g || g === "M") keys.push(`MRR${d.num}`);
    if (!g || g === "F") keys.push(`WRR${d.num}`);
  }
  for (const d of auxDefs) {
    if (d.role !== "blank" && d.role !== "support") keys.push(d.key);
  }
  return keys;
}

/** All assignable keys on the deployment artboard (for board-wide fit map). */
export function collectDeploymentSlotKeys(auxDefs: AuxDef[]): string[] {
  const keys: string[] = ZONE_DEFS.map((z) => z.key);
  for (const d of RR_DEFS) {
    keys.push(`MRR${d.num}`, `WRR${d.num}`);
  }
  for (const d of auxDefs) {
    if (d.role !== "blank") keys.push(d.key);
  }
  return keys;
}

/** Canvas fit chips — never on admin/overlap/physical RR host keys. */
export function shouldShowPlacementFitChip(slotKey: string): boolean {
  const k = slotKey.trim();
  if (!k) return false;
  const upper = k.toUpperCase();
  if (upper === "ADM" || upper === "ADMIN" || upper === "AUX_ADMIN") return false;
  if (upper.includes("ADMIN")) return false;
  if (k.startsWith("OL-") || upper.startsWith("OVERLAP")) return false;
  if (/^overlap_(am|pm)/i.test(k)) return false;
  if (/^RR\d+$/.test(k)) return false;
  return true;
}

/** Admin and overlap slots are never suggested in Swap lanes. */
export function isSwapEligibleSlotKey(slotKey: string): boolean {
  const k = slotKey.trim();
  if (!k) return false;
  const upper = k.toUpperCase();
  if (upper === "ADM" || upper === "ADMIN" || upper === "AUX_ADMIN") return false;
  if (upper.includes("ADMIN")) return false;
  if (k.startsWith("OL-") || upper.startsWith("OVERLAP")) return false;
  if (/^overlap_(am|pm)/i.test(k)) return false;
  return true;
}

export type PlacementCrossPattern = {
  otherTmName: string;
  theirSlotKey: string;
  /** This TM has not worked the other's current slot in the spread window */
  tmMissingFromTheirSlot: boolean;
  /** The other TM has not worked this TM's current slot in the spread window */
  otherMissingFromCurrentSlot: boolean;
};

export type PlacementRotationBasics = {
  notRecentlyPlaced: string[];
  crossPatterns: PlacementCrossPattern[];
  /** Slot keys to emphasize on the matrix (gaps + cross targets) */
  highlightGapKeys: Set<string>;
  highlightCrossKeys: Set<string>;
};

export type PlacementRotationDisplay = {
  gapsLine: string | null;
  swapLines: string[];
};

/**
 * Deterministic rotation / fairness gaps for the placement pad matrix.
 * Highlights where the TM has NOT been recently, and cross-patterns where
 * someone else sits on a slot this TM is due for while they are due for this TM's slot.
 */
export function computePlacementRotationBasics(
  tmHistory: ZoneDetailEntry | null,
  currentSlotKey: string,
  currentTmId: string,
  matrixSlotKeys: string[],
  assignments: Record<string, { tmId?: string; tmName?: string }>,
  otherHistories: Record<string, ZoneDetailEntry | null>,
  beforeIso: string,
  nightCount: number = PLACEMENT_SPREAD_NIGHTS,
  currentTm?: PlacementTmProfile | null,
  otherTmProfiles?: Record<string, PlacementTmProfile | null>,
): PlacementRotationBasics {
  const spreadKeys = new Set(
    getSpreadPlacementKeys(tmHistory, nightCount, beforeIso),
  );

  const notRecentlyPlaced = matrixSlotKeys.filter((k) => !spreadKeys.has(k));

  const crossPatterns: PlacementCrossPattern[] = [];
  const highlightGapKeys = new Set(notRecentlyPlaced);
  const highlightCrossKeys = new Set<string>();

  if (!isSwapEligibleSlotKey(currentSlotKey)) {
    return {
      notRecentlyPlaced,
      crossPatterns: [],
      highlightGapKeys,
      highlightCrossKeys,
    };
  }

  for (const [theirSlotKey, row] of Object.entries(assignments)) {
    if (!row?.tmId || row.tmId === currentTmId || !row.tmName) continue;
    if (!isSwapEligibleSlotKey(theirSlotKey)) continue;

    const otherTm = otherTmProfiles?.[row.tmId] ?? null;
    if (
      !canSuggestSwapBetween(currentTm, currentSlotKey, otherTm, theirSlotKey)
    ) {
      continue;
    }

    const tmMissingFromTheirSlot = !spreadKeys.has(theirSlotKey);
    const otherSpread = new Set(
      getSpreadPlacementKeys(otherHistories[row.tmId] ?? null, nightCount, beforeIso),
    );
    const otherMissingFromCurrentSlot = !otherSpread.has(currentSlotKey);

    if (tmMissingFromTheirSlot || otherMissingFromCurrentSlot) {
      crossPatterns.push({
        otherTmName: row.tmName,
        theirSlotKey,
        tmMissingFromTheirSlot,
        otherMissingFromCurrentSlot,
      });
    }
  }

  for (const c of crossPatterns) {
    if (c.tmMissingFromTheirSlot) highlightCrossKeys.add(c.theirSlotKey);
    if (c.otherMissingFromCurrentSlot) highlightGapKeys.add(currentSlotKey);
  }

  return {
    notRecentlyPlaced,
    crossPatterns,
    highlightGapKeys,
    highlightCrossKeys,
  };
}

/** Operator-facing rotation copy — always uses the TM's name, never "you". */
export function formatPlacementRotationDisplay(
  tmName: string,
  currentSlotKey: string,
  basics: PlacementRotationBasics,
  nightCount: number = PLACEMENT_SPREAD_NIGHTS,
): PlacementRotationDisplay {
  const slotLabel = formatPlacementUiLabel(currentSlotKey);
  const gaps = basics.notRecentlyPlaced;

  let gapsLine: string | null;
  if (gaps.length === 0) {
    gapsLine = `${tmName} — covered every matrix slot in the last ${nightCount} nights.`;
  } else {
    const labels = gaps.slice(0, 5).map((k) => formatPlacementUiLabel(k));
    const more = gaps.length > 5 ? ` (+${gaps.length - 5} more)` : "";
    gapsLine = `${tmName} — not in ${nightCount} nights: ${labels.join(", ")}${more}.`;
  }

  const eligibleCross = basics.crossPatterns.filter(
    (c) =>
      isSwapEligibleSlotKey(c.theirSlotKey) && isSwapEligibleSlotKey(currentSlotKey),
  );

  const bilateral = eligibleCross.filter(
    (c) => c.tmMissingFromTheirSlot && c.otherMissingFromCurrentSlot,
  );

  const swapLines = bilateral.slice(0, 2).map((c) => {
    const their = formatPlacementUiLabel(c.theirSlotKey);
    return `${c.otherTmName} (${their}) ↔ ${tmName} (${slotLabel})`;
  });

  const partial = eligibleCross.filter(
    (c) => !(c.tmMissingFromTheirSlot && c.otherMissingFromCurrentSlot),
  );
  for (const c of partial.slice(0, 2 - swapLines.length)) {
    if (swapLines.length >= 2) break;
    const their = formatPlacementUiLabel(c.theirSlotKey);
    if (c.tmMissingFromTheirSlot) {
      swapLines.push(`${tmName} not recently on ${their} — ${c.otherTmName} is there now.`);
    } else if (c.otherMissingFromCurrentSlot) {
      swapLines.push(`${c.otherTmName} not recently on ${slotLabel} — ${tmName} is there now.`);
    }
  }

  return { gapsLine, swapLines };
}

/** Single block sent to the placement analyst (deterministic ground truth). */
export function formatRotationBriefForAnalyst(
  display: PlacementRotationDisplay | null,
): string | undefined {
  if (!display) return undefined;
  const parts: string[] = [];
  if (display.gapsLine) parts.push(display.gapsLine);
  if (display.swapLines.length > 0) {
    parts.push(`Swap lanes:\n${display.swapLines.map((l) => `• ${l}`).join("\n")}`);
  }
  return parts.length ? parts.join("\n\n") : undefined;
}

/** Compact label for matrix cells and last-5 pills (no spaces). */
export function formatPlacementUiLabel(ui: string, fallback?: string): string {
  if (ui === "Z9SR") return "Z9SR";
  if (/^Z\d+$/.test(ui)) return ui;
  if (ui.startsWith("MRR")) return `RR${ui.replace("MRR", "")}M`;
  if (ui.startsWith("WRR")) return `RR${ui.replace("WRR", "")}W`;
  if (ui.startsWith("TR")) return `T${ui.replace(/\D/g, "")}`;
  const raw = fallback ?? ui;
  return raw.replace(/\s+/g, "");
}