import type { ZoneDetailEntry } from "@/lib/shiftbuilder/data";

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
  const dates = (h?.zoneDates?.[key] || []).filter((d: string) => d <= beforeIso);
  if (!dates.length) return "—";
  const latest = dates.sort().reverse()[0];
  if (latest === beforeIso) return "today";
  const d1 = new Date(beforeIso + "T12:00:00");
  const d2 = new Date(latest + "T12:00:00");
  const diffMs = d1.getTime() - d2.getTime();
  const days = Math.max(0, Math.floor(diffMs / (1000 * 3600 * 24)));
  return `${days}d`;
}

export function nightIsoFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
): PlacementRotationBasics {
  const spreadKeys = new Set(
    getSpreadPlacementKeys(tmHistory, nightCount, beforeIso),
  );

  const notRecentlyPlaced = matrixSlotKeys.filter((k) => !spreadKeys.has(k));

  const crossPatterns: PlacementCrossPattern[] = [];

  for (const [theirSlotKey, row] of Object.entries(assignments)) {
    if (!row?.tmId || row.tmId === currentTmId || !row.tmName) continue;

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

  const highlightGapKeys = new Set(notRecentlyPlaced);
  const highlightCrossKeys = new Set<string>();
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

  const bilateral = basics.crossPatterns.filter(
    (c) => c.tmMissingFromTheirSlot && c.otherMissingFromCurrentSlot,
  );

  const swapLines = bilateral.slice(0, 2).map((c) => {
    const their = formatPlacementUiLabel(c.theirSlotKey);
    return `${c.otherTmName} (${their}) ↔ ${tmName} (${slotLabel})`;
  });

  const partial = basics.crossPatterns.filter(
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