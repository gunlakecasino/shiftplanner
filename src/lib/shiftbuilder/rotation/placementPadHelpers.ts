import type { ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import {
  ZONE_DEFS,
  RR_DEFS,
  canonicalizeAuxSlotKeyForTrail,
  normalizeHistoryUiKey,
} from "@/lib/shiftbuilder/constants";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { isEligibleForSlot, normalizeGender, areSwapLanePeers } from "@/lib/shiftbuilder/placement";

export { canonicalizeAuxSlotKeyForTrail } from "@/lib/shiftbuilder/constants";

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

/** Nights of history used for the placement spread grid (work nights, not calendar days). */
export const PLACEMENT_SPREAD_NIGHTS = 30;

/**
 * Calendar-day lookback when fetching zone_assignments history so that
 * PLACEMENT_SPREAD_NIGHTS work nights are usually available (~5 graves/week → 90d ≈ 60+ nights).
 * Pad, chips, picker, and week cache must share this.
 */
export const PLACEMENT_HISTORY_FETCH_CALENDAR_DAYS = 90;

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
      // Stable identity so step_up / STEP / AUX-step match matrix cells labeled STEP.
      events.push({ ui: normalizePlacementIdentity(ui), d });
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
      events.push({ ui: normalizePlacementIdentity(ui), d });
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
 * Overlap seats are fungible within band: OL-PM-N / overlap_pm_N → OL-PM
 * (and AM → OL-AM). Match/display only — never rewrite stored history keys.
 */
export function placementRepeatKey(ui: string): string {
  if (!ui) return ui;
  const rr = ui.match(/^(?:M|W)?RR(\d+)$/i);
  if (rr) return `RR${rr[1]}`;
  // Fungible OL seats within AM/PM band (UI, band, and DB forms).
  const olUi = ui.match(/^OL-(PM|AM)(?:-\d+)?$/i);
  if (olUi) return `OL-${olUi[1].toUpperCase()}`;
  const olDb = ui.match(/^overlap_(pm|am)(?:_\d+)?$/i);
  if (olDb) return `OL-${olDb[1].toUpperCase()}`;
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

/**
 * Compact trail label on assignment cards (e.g. Z4, RR8M, RR8W, Z9SR, ADMIN, TSH1, OAS2, STEP).
 * Restroom sides keep M/W so prior placements are not collapsed into an ambiguous "RR8".
 *
 * Short codes: TSH / SUP / OAS (numbered), JC / STEP (single).
 *
 * IMPORTANT: `auxDefs` must be the layout from the **night of the placement**
 * (or omit it when `ui` is already a stable key like STEP / SUP1). Never pass
 * tonight's auxDefs when formatting historical AUXn keys from other nights.
 */
export function formatCardPlacementTrailLabel(
  ui: string,
  fallback?: string,
  auxDefs?: Array<{ key: string; role?: string; label?: string }>,
): string {
  if (!ui) return (fallback ?? "").replace(/\s+/g, "") || "—";

  // Flex AUXn → stable code first (only when caller provided that night's layout).
  const resolved = canonicalizeAuxSlotKeyForTrail(ui, auxDefs);

  // Fungible overlap seats — display band only (no card index). Storage stays indexed.
  const olUi = resolved.match(/^OL-(PM|AM)(?:-\d+)?$/i);
  if (olUi) return `OL-${olUi[1].toUpperCase()}`;
  const olDb = resolved.match(/^overlap_(pm|am)(?:_\d+)?$/i);
  if (olDb) return `OL-${olDb[1].toUpperCase()}`;

  // Canonical aux identity (DB → UI history keys + legacy + short codes + collapsed labels).
  if (resolved === "Z9SR" || resolved === "z9_sr") return "Z9SR";
  if (resolved === "ADM" || resolved === "ADMIN" || resolved === "admin") return "ADMIN";
  if (resolved === "JC" || resolved === "job_coach" || resolved === "JOBCOACH") return "JC";
  if (
    resolved === "STEP" ||
    resolved === "step_up" ||
    resolved === "STEPUP" ||
    resolved === "STEP_UP"
  ) {
    return "STEP";
  }

  // Already-canonical short trail codes from canonicalize / history.
  if (/^(TSH|SUP|OAS)\d+$/i.test(resolved)) return resolved.toUpperCase();
  if (resolved === "JC" || resolved === "STEP" || resolved === "ADMIN" || resolved === "Z9SR") {
    return resolved;
  }

  if (/^Z\d+$/.test(resolved)) return resolved;
  // Prefer side-explicit RR labels (matches pad matrix style: RR8M / RR8W).
  if (/^MRR\d+$/i.test(resolved)) return `RR${resolved.replace(/^MRR/i, "")}M`;
  if (/^WRR\d+$/i.test(resolved)) return `RR${resolved.replace(/^WRR/i, "")}W`;
  // Bare RR8 (legacy / side-agnostic) — keep as RR8.
  const bareRr = resolved.match(/^RR(\d+)$/i);
  if (bareRr) return `RR${bareRr[1]}`;
  // DB family keys (trash_2, support_1, oasis_1) before UI TR/SP forms.
  const trashDb = resolved.match(/^trash_(\d+)$/i);
  if (trashDb) return `TSH${trashDb[1]}`;
  const supportDb = resolved.match(/^support_(\d+)$/i);
  if (supportDb) return `SUP${supportDb[1]}`;
  const oasisDb = resolved.match(/^oasis_(\d+)$/i);
  if (oasisDb) return `OAS${oasisDb[1]}`;

  // Legacy TR/SP UI keys + short codes as trail chips.
  // NOTE: do not use startsWith("SP") — that false-positives "STEP" as support.
  const trash = resolved.match(/^(?:TR|TSH)(\d+)$/i);
  if (trash) return `TSH${trash[1]}`;
  const support = resolved.match(/^(?:SP|SUP)(\d+)$/i);
  if (support) return `SUP${support[1]}`;
  const oasis = resolved.match(/^OAS(\d+)$/i);
  if (oasis) return `OAS${oasis[1]}`;
  // Unresolved AUXn without that night's layout — keep shell id, never invent SP1.
  if (/^AUX\d+$/i.test(resolved)) return resolved.toUpperCase();
  const raw = fallback ?? resolved;
  return raw.replace(/\s+/g, "");
}

/**
 * Whether a compact trail chip refers to the same rotation area as a full slot key.
 * Handles trail labels like RR8M / RR8 / TR1 against slots MRR8 / WRR8 / TR1.
 */
export function trailLabelMatchesSlotKey(trailLabel: string, slotKey: string): boolean {
  if (!trailLabel || !slotKey) return false;
  if (placementRepeatKeysMatch(trailLabel, slotKey)) return true;

  // RR8M / RR8W → MRR8 / WRR8
  const sideRr = trailLabel.match(/^RR(\d+)([MW])$/i);
  if (sideRr) {
    const expanded = `${sideRr[2].toUpperCase() === "M" ? "MRR" : "WRR"}${sideRr[1]}`;
    if (placementRepeatKeysMatch(expanded, slotKey)) return true;
  }

  // Bare RR8 → either MRR8 or WRR8 (area-level critical)
  const bareRr = trailLabel.match(/^RR(\d+)$/i);
  if (bareRr) {
    if (placementRepeatKeysMatch(`MRR${bareRr[1]}`, slotKey)) return true;
    if (placementRepeatKeysMatch(`WRR${bareRr[1]}`, slotKey)) return true;
  }

  // TR1 / T1 / TSH1 style (legacy + short-code trails)
  const trash = trailLabel.match(/^(?:T(?:R)?|TSH)(\d+)$/i);
  if (trash) {
    if (placementRepeatKeysMatch(`TR${trash[1]}`, slotKey)) return true;
    if (placementRepeatKeysMatch(`TSH${trash[1]}`, slotKey)) return true;
  }

  // SP1 / SUP1 support short codes
  const support = trailLabel.match(/^(?:SP|SUP)(\d+)$/i);
  if (support) {
    if (placementRepeatKeysMatch(`SP${support[1]}`, slotKey)) return true;
    if (placementRepeatKeysMatch(`SUP${support[1]}`, slotKey)) return true;
  }

  // OAS1 oasis short codes
  const oasis = trailLabel.match(/^OAS(\d+)$/i);
  if (oasis && placementRepeatKeysMatch(`OAS${oasis[1]}`, slotKey)) return true;

  // Single-instance aux
  if (/^JC$/i.test(trailLabel) && /^(JC|job_coach)$/i.test(slotKey)) return true;
  if (/^STEP$/i.test(trailLabel) && /^(STEP|step_up)$/i.test(slotKey)) return true;

  return false;
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
        // Collapse AUX3 / step_up / STEP aliases so one night isn't two trail chips.
        events.push({ ui: normalizePlacementIdentity(ui), d });
      }
    }
  }

  // Prefer stable codes (STEP) over shell ids (AUX3) when both appear for same night.
  const preferStable = (a: string, b: string) => {
    const aAux = /^AUX\d+$/i.test(a);
    const bAux = /^AUX\d+$/i.test(b);
    if (aAux && !bAux) return b;
    if (bAux && !aAux) return a;
    return a;
  };

  const byNight = new Map<string, string>(); // nightDate → best ui
  for (const e of events) {
    const prev = byNight.get(e.d);
    byNight.set(e.d, prev ? preferStable(prev, e.ui) : e.ui);
  }

  // Allow multiple distinct areas same night only if both are stable non-AUX keys
  // (rare; e.g. shouldn't happen for singular ownership). Rebuild multi-key nights carefully:
  const multi: Array<{ ui: string; d: string }> = [];
  const nightKeys = new Map<string, Set<string>>();
  for (const e of events) {
    const set = nightKeys.get(e.d) ?? new Set();
    set.add(e.ui);
    nightKeys.set(e.d, set);
  }
  for (const [d, keys] of nightKeys) {
    const list = [...keys];
    const nonAux = list.filter((k) => !/^AUX\d+$/i.test(k));
    const use = nonAux.length > 0 ? nonAux : list;
    // One chip per night for aux aliases; keep all non-aux if truly multi (shouldn't).
    if (use.every((k) => !/^AUX\d+$/i.test(k)) && use.length > 1) {
      // Prefer single primary: first stable
      multi.push({ ui: use[0], d });
    } else {
      multi.push({ ui: use[0], d });
    }
  }

  const seen = new Set(multi.map((e) => `${e.d}|${e.ui}`));
  const merged = [...multi];

  if (weekEntries?.length) {
    for (const { nightDate, slotKey } of weekEntries) {
      if (!slotKey) continue;
      if (beforeIso && nightDate >= beforeIso) continue;
      const stable = normalizePlacementIdentity(slotKey);
      // Skip week AUX3 if we already have STEP (or any non-AUX) for that night.
      const already = merged.find((e) => e.d === nightDate);
      if (already) {
        if (/^AUX\d+$/i.test(stable) && !/^AUX\d+$/i.test(already.ui)) continue;
        if (!/^AUX\d+$/i.test(stable) && /^AUX\d+$/i.test(already.ui)) {
          already.ui = stable;
          continue;
        }
        if (already.ui === stable) continue;
      }
      const key = `${nightDate}|${stable}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ui: stable, d: nightDate });
    }
  }

  merged.sort((a, b) => b.d.localeCompare(a.d));
  return merged;
}

/**
 * @param auxDefsByNight  optional map nightDate → that night's auxDefs.
 *   Used only to resolve historical AUXn keys. Do not pass a single "tonight"
 *   layout for all nights — that rewrites Step Up as SP1 when shell indices differ.
 * @param tonightAuxDefs  only used when a week/history key is AUXn and no
 *   per-night layout is available for that event's date (last resort).
 */
export function buildPlacementTrailLabels(
  history: ZoneDetailEntry | null | undefined,
  beforeIso?: string,
  count = CARD_PLACEMENT_TRAIL_COUNT,
  weekEntries?: Array<{ nightDate: string; slotKey: string }>,
  tonightAuxDefs?: Array<{ key: string; role?: string; label?: string }>,
  auxDefsByNight?: Record<string, Array<{ key: string; role?: string; label?: string }>>,
): string[] {
  return collectPlacementTrailEvents(history, beforeIso, weekEntries)
    .slice(0, count)
    .map((e) => {
      // Prefer the placement night's own layout. Never fall back to tonight for
      // a different day — AUX shell indices are not stable across nights.
      const nightLayout =
        auxDefsByNight?.[e.d] ??
        (beforeIso && e.d === beforeIso ? tonightAuxDefs : undefined);
      // Only use tonight's layout when the event is for tonight itself.
      return formatCardPlacementTrailLabel(e.ui, undefined, nightLayout);
    });
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

/**
 * RR side-family only (e.g. WRR8 in trail, candidate WRR6) — not same RR number.
 * Engine soft penalty; never a hard exclude (coverage must still complete).
 */
export function isInPriorPlacementSideFamilyOnlyWindow(
  history: ZoneDetailEntry | null,
  slotKey: string,
  beforeIso?: string,
  window = PRIOR_PLACEMENT_CRITICAL_WINDOW,
  weekEntries?: Array<{ nightDate: string; slotKey: string }>,
): boolean {
  const priorPlacements = getMergedPlacementSequence(history, window, beforeIso, weekEntries);
  return priorPlacements.some(
    (ui) =>
      placementRepeatKeysConflict(slotKey, ui) &&
      !placementRepeatKeysMatch(slotKey, ui),
  );
}

/** Strict rotation conflict — same area or RR side-family (diagnostics / legacy). */
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
      // Normalize so LAST 5 shows STEP / SUP1, never raw SP1 or STEPUP.
      events.push({ ui: normalizePlacementIdentity(ui), d });
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
    if (d.role !== "blank" && d.role !== "support") {
      // Use STEP/JC/OAS1/… so history exposure matches matrix cells.
      keys.push(canonicalizeAuxSlotKeyForTrail(d.key, auxDefs));
    }
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

/**
 * Compact label for matrix cells and last-5 pills.
 * Always uses the same short-code vocabulary as card trails (STEP, SUP1, TSH1, …).
 * Never strip spaces from "STEP UP" → "STEPUP" or leave raw SP1 for support.
 *
 * `auxDefs` must be the layout of the **placement night** when `ui` is AUXn;
 * omit when `ui` is already a stable key (STEP, SP1, Z4, …).
 */
export function formatPlacementUiLabel(
  ui: string,
  fallback?: string,
  auxDefs?: Array<{ key: string; role?: string; label?: string }>,
): string {
  if (!ui && fallback) {
    return formatCardPlacementTrailLabel(
      normalizeCollapsedAuxLabel(fallback),
      undefined,
      auxDefs,
    );
  }
  // Prefer role-stable trail codes over free-text fallbacks ("STEP UP" → STEPUP).
  const fromKey = formatCardPlacementTrailLabel(ui, undefined, auxDefs);
  if (fromKey && fromKey !== "—" && !/^AUX\d+$/i.test(fromKey)) {
    return fromKey;
  }
  if (fallback?.trim()) {
    const fromFallback = formatCardPlacementTrailLabel(
      normalizeCollapsedAuxLabel(fallback),
      undefined,
      auxDefs,
    );
    if (fromFallback && fromFallback !== "—") return fromFallback;
  }
  return fromKey || (fallback ?? ui).replace(/\s+/g, "") || "—";
}

/** "STEP UP" / "STEPUP" / "Job Coach" → keys formatCardPlacementTrailLabel understands. */
function normalizeCollapsedAuxLabel(raw: string): string {
  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (compact === "STEPUP" || compact === "STEP_UP") return "STEP";
  if (compact === "JOBCOACH" || compact === "JOB_COACH") return "JC";
  if (compact === "Z9SR" || compact === "Z9SMOKINGROOM") return "Z9SR";
  if (compact === "ADMIN" || compact === "ADM") return "ADMIN";
  // SUPPORT1 / TRASH2 / OASIS1
  const numbered = compact.match(/^(SUPPORT|SUP|TRASH|TSH|OASIS|OAS)(\d+)$/i);
  if (numbered) {
    const fam = numbered[1].toUpperCase();
    const n = numbered[2];
    if (fam === "SUPPORT" || fam === "SUP") return `SUP${n}`;
    if (fam === "TRASH" || fam === "TSH") return `TSH${n}`;
    if (fam === "OASIS" || fam === "OAS") return `OAS${n}`;
  }
  return compact;
}

/**
 * Normalize a history / matrix slot identity for matching + display.
 * SP1→SUP1, step_up→STEP, STEPUP→STEP, AUXn via that night's layout when provided.
 */
export function normalizePlacementIdentity(
  ui: string,
  auxDefs?: Array<{ key: string; role?: string; label?: string }>,
): string {
  if (auxDefs?.length && /^AUX\d+$/i.test(ui)) {
    return formatCardPlacementTrailLabel(ui, undefined, auxDefs);
  }
  return normalizeHistoryUiKey(ui);
}