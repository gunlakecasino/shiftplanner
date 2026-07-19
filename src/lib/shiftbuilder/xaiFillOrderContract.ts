/**
 * Authoritative fill-order contract for every xAI / Grok surface.
 * Prompts import getXaiFillOrderHardRules(); guards use the helpers below.
 */

import {
  COVERAGE_TIERS,
  DEFAULT_PLACEMENT_ORDER,
  getPlacementOrderDescription,
} from "./skills/placement-engine";
import { isOptionalDeploymentSlot } from "./placement";

const PLACEMENT_ORDER = DEFAULT_PLACEMENT_ORDER;
import type { PlacementPadInsight, PlacementFitVerdict } from "./placementPadInsightSchema";

/** Swap-lane peer families — cross-family moves (RR↔zone) are never valid. */
export type SlotSwapFamily = "rr" | "zone" | "admin" | "aux" | "overlap" | "other";

export function slotSwapFamily(slotKey: string): SlotSwapFamily {
  const k = slotKey.trim();
  if (!k) return "other";
  if (k.startsWith("MRR") || k.startsWith("WRR")) return "rr";
  if (k === "ADM" || k.toUpperCase() === "ADMIN" || k.includes("ADMIN")) return "admin";
  if (k.startsWith("Z")) return "zone";
  if (k.startsWith("TR") || k.startsWith("SP") || k.startsWith("AUX")) return "aux";
  if (k.startsWith("OL-") || k.includes("Overlap")) return "overlap";
  return "other";
}

/** Bilateral swap lanes only exist within the same family (RR↔RR, zone↔zone, etc.). */
export function areSwapLanePeers(slotA: string, slotB: string): boolean {
  const a = slotSwapFamily(slotA);
  const b = slotSwapFamily(slotB);
  if (a === "overlap" || b === "overlap" || a === "other" || b === "other") return false;
  if (a === "admin" || b === "admin") return false;
  return a === b;
}

/** Slots outside the core walk order (overlap tab, dynamic AUX) — not gated by tier-1/2 sequence. */
export function isCoreFillOrderSlot(slotKey: string): boolean {
  if (!slotKey) return false;
  if (slotKey.startsWith("OL-")) return false;
  if (slotKey.includes("Overlap")) return false;
  return (DEFAULT_PLACEMENT_ORDER as readonly string[]).includes(slotKey);
}

export function slotFillOrderIndex(
  slotKey: string,
  order: readonly string[] = PLACEMENT_ORDER,
): number {
  const idx = order.indexOf(slotKey);
  return idx === -1 ? order.length : idx;
}

export function isSlotFilled(
  slotKey: string,
  assignments: Record<string, { tmId?: string | null } | undefined>,
): boolean {
  const row = assignments[slotKey];
  const tmId = row?.tmId;
  return typeof tmId === "string" && tmId.length > 0;
}

/**
 * Core-order slots before slotKey that still have no TM tonight.
 */
export function unfilledHigherPrioritySlots(
  slotKey: string,
  assignments: Record<string, { tmId?: string | null } | undefined>,
  order: readonly string[] = PLACEMENT_ORDER,
): string[] {
  if (!isCoreFillOrderSlot(slotKey)) return [];
  const targetIdx = slotFillOrderIndex(slotKey, order);
  const missing: string[] = [];
  for (let i = 0; i < targetIdx; i++) {
    const key = order[i];
    if (!isSlotFilled(key, assignments) && !isOptionalDeploymentSlot(key)) {
      missing.push(key);
    }
  }
  return missing;
}

export type FillOrderViolation = {
  violates: boolean;
  reason?: string;
  blockingSlots?: string[];
};

export function assignViolatesFillOrder(
  slotKey: string,
  assignments: Record<string, { tmId?: string | null } | undefined>,
): FillOrderViolation {
  if (!isCoreFillOrderSlot(slotKey)) {
    return { violates: false };
  }
  const blocking = unfilledHigherPrioritySlots(slotKey, assignments);
  if (blocking.length === 0) return { violates: false };
  return {
    violates: true,
    blockingSlots: blocking,
    reason: `Cannot assign ${slotKey} before higher-priority slots are filled: ${blocking.slice(0, 6).join(", ")}${blocking.length > 6 ? "…" : ""}`,
  };
}

/** Swap = bilateral only; both slots must have a TM tonight. */
export function swapViolatesOccupancy(
  fromSlot: string,
  toSlot: string,
  assignments: Record<string, { tmId?: string | null } | undefined>,
): FillOrderViolation {
  if (!isSlotFilled(fromSlot, assignments)) {
    return {
      violates: true,
      reason: `Cannot swap from empty slot ${fromSlot}`,
    };
  }
  if (!isSlotFilled(toSlot, assignments)) {
    return {
      violates: true,
      reason: `Cannot swap into empty slot ${toSlot} — assign a TM instead (swap requires two occupants)`,
    };
  }
  return { violates: false };
}

export function swapViolatesCrossTierFamily(
  fromSlot: string,
  toSlot: string,
): FillOrderViolation {
  if (areSwapLanePeers(fromSlot, toSlot)) {
    return { violates: false };
  }
  const from = slotSwapFamily(fromSlot);
  const to = slotSwapFamily(toSlot);
  if (from === "rr" && to === "zone") {
    return {
      violates: true,
      reason: `Cannot move or swap from restroom ${fromSlot} to zone ${toSlot} — restrooms stay in the RR chain; rotation is RR↔RR or zone↔zone only`,
    };
  }
  if (from === "zone" && to === "rr") {
    return {
      violates: true,
      reason: `Cannot move or swap from zone ${fromSlot} to restroom ${toSlot} — cross-tier rotation is forbidden`,
    };
  }
  return {
    violates: true,
    reason: `Cannot swap ${fromSlot} (${from}) with ${toSlot} (${to}) — not the same swap lane family`,
  };
}

export function swapViolatesFillOrder(
  fromSlot: string,
  toSlot: string,
  assignments: Record<string, { tmId?: string | null } | undefined>,
): FillOrderViolation {
  const crossTier = swapViolatesCrossTierFamily(fromSlot, toSlot);
  if (crossTier.violates) return crossTier;

  const occupancy = swapViolatesOccupancy(fromSlot, toSlot, assignments);
  if (occupancy.violates) return occupancy;

  const toCheck = assignViolatesFillOrder(toSlot, assignments);
  if (toCheck.violates) return toCheck;

  // Pulling a TM off an early core slot while higher-priority slots remain empty is forbidden.
  if (isCoreFillOrderSlot(fromSlot) && isSlotFilled(fromSlot, assignments)) {
    const order = PLACEMENT_ORDER;
    const fromIdx = slotFillOrderIndex(fromSlot, order);
    for (let i = 0; i < fromIdx; i++) {
      const key = order[i];
      if (!isSlotFilled(key, assignments)) {
        return {
          violates: true,
          blockingSlots: [key],
          reason: `Cannot move someone off ${fromSlot} while higher-priority ${key} is still empty`,
        };
      }
    }
  }

  return { violates: false };
}

/**
 * Compact, non-negotiable rules block for all xAI system prompts.
 */
export function getXaiFillOrderHardRules(): string {
  const orderJson = JSON.stringify([...PLACEMENT_ORDER]);
  const tierLines = COVERAGE_TIERS.map(
    (t, i) =>
      `  Tier ${i + 1} — ${t.name} (${t.isHardCoverage ? "HARD" : "soft"}): ${t.slots.join(", ")} · minUniqueTMs=${t.minUniqueTMs}`,
  ).join("\n");

  return `XAI FILL ORDER — CONSTITUTION (NON-NEGOTIABLE)

The engine walks slots in exactly this JSON array (index 0 = fill first):
${orderJson}

${getPlacementOrderDescription()}

Tier breakdown (same order, do not reorder):
${tierLines}

HARD RULES FOR EVERY SUGGESTION (assign, swap, ranked pick, watchout, narrative):
1. NEVER recommend filling a core-order slot while any earlier slot in the array above is still empty tonight — unless you explicitly state headcount, gender split, or Admin training makes the earlier slot impossible. The critical board is restrooms + Z4/Z5/Z9, plus Admin at 14+ available full-grave graves TMs.
2. NEVER recommend moving a TM off restrooms, ADM, or zones to support/trash/AUX while higher-priority core slots remain empty.
3. NEVER tell the operator to "fill Z* first" or skip ahead of the restroom chain or ADM when those slots are open.
4. Overlap slots (OL-AM-*, OL-PM-*) are NOT in this walk order; do not treat them as higher priority than restrooms/zones.
5. Rotation, affinity, and fairness may change WHO — never WHICH SLOT should be filled first.
6. If this slot is late in the order, you may say coverage is acceptable only after earlier tiers are filled or documented impossible.

Violations are stripped by the server guard before the operator sees them.`;
}

/**
 * Swap vs assign — every xAI surface must treat these as different operations.
 */
export function getXaiSwapHardRules(): string {
  return `XAI SWAP vs ASSIGN (NON-NEGOTIABLE)

- **swap** = bilateral exchange ONLY. Both slots must already have a TM assigned tonight (fromSlot AND toSlot occupied).
- NEVER suggest swapping, moving, sliding, or placing someone into an **empty**, **open**, **unassigned**, or **vacant** slot.
- Empty / unassigned slot → use **assign** (Command Palette) or **rankedAssignees** / fitSummary on the placement pad — \`swapRecommendations\` MUST be [].
- Deterministic rotation "Swap lanes" use ↔ between two named occupants. Refine those; do not invent one-sided moves into gaps.
- "Move X to open Z4" or "swap into empty WRR6" is forbidden — say "assign X to Z4" instead if Z4 is empty.
- needs_swap verdict requires a real bilateral lane (two people, two filled slots), not a move into a gap.
- **NEVER** restroom ↔ zone (e.g. "move from MRR/WRR to Z3" or "pull off RR for zone rotation"). RR swaps stay RR↔RR; zone swaps stay zone↔zone.
- Viewing zone Z3: do NOT suggest moving someone off a restroom onto Z3 — assign an unassigned grave TM to Z3 instead.

Server guard rejects swap actions targeting empty slots and cross-tier moves before the operator sees them.`;
}

const MOVE_VERB_RE =
  /\b(move|swap|shift|slide|pull|send|place|put|transfer|reassign|switch)\b/i;
const RR_HINT_RE =
  /\b(mrr|wrr|restroom|restrooms|mens\s*rr|womens\s*rr|rr\d+m|rr\d+w)\b/i;
const ZONE_HINT_RE = /\b(z\d{1,2}|z9sr|zone\s*\d|zone\s*\d{1,2})\b/i;

/** Narrative / swap line illegally mixes restroom chain with zones. */
export function textSuggestsCrossTierMove(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (!MOVE_VERB_RE.test(lower) && !lower.includes("↔")) return false;

  const hasRr = RR_HINT_RE.test(lower);
  const hasZone = ZONE_HINT_RE.test(lower);
  if (hasRr && hasZone) return true;

  // Slot keys from different families embedded in a move suggestion
  const slotKeys = t.match(/\b(MRR\d+|WRR\d+|Z\d{1,2}|Z9SR)\b/gi) ?? [];
  if (slotKeys.length >= 2) {
    const families = new Set(slotKeys.map((k) => slotSwapFamily(k)));
    if (families.has("rr") && families.has("zone")) return true;
  }
  return false;
}

const SWAP_INTO_EMPTY_RE =
  /\b(empty|unassigned|vacant|open\s+slot|open\s+position|unfilled|no\s+one\s+on|nobody\s+on)\b/i;
const BETTER_ROTATION_ON_RE = /better rotation on\s+([A-Za-z0-9]+)/i;
const SWAP_ONE_SIDED_RE =
  /\b(swap|move|slide|shift|put|place|send).{0,40}\b(into|to|onto)\b/i;

/** True when free-text swap advice illegally targets an empty slot. */
export function swapSummaryTargetsEmptySlot(
  summary: string,
  emptySlotKeys: string[] = [],
): boolean {
  const text = summary.trim();
  if (!text) return false;
  if (SWAP_INTO_EMPTY_RE.test(text)) return true;
  if (!SWAP_ONE_SIDED_RE.test(text) && !text.includes("↔")) return false;

  const lower = text.toLowerCase();
  for (const key of emptySlotKeys) {
    if (!key) continue;
    const k = key.toLowerCase();
    if (lower.includes(k) && SWAP_ONE_SIDED_RE.test(lower)) return true;
  }
  return false;
}

/** Instant/xAI copy that names an empty slot as a rotation improvement target. */
export function fitSummaryTargetsEmptyGap(
  text: string,
  emptySlotKeys: string[],
): boolean {
  const m = text.match(BETTER_ROTATION_ON_RE);
  if (!m) return false;
  const cited = m[1].toUpperCase();
  return emptySlotKeys.some((k) => k.toUpperCase() === cited);
}

function scrubIllegalSuggestionText(
  text: string,
  padSlotKey: string,
  emptySlotKeys: string[],
): { text: string; changed: boolean } {
  if (
    textSuggestsCrossTierMove(text) ||
    swapSummaryTargetsEmptySlot(text, emptySlotKeys) ||
    fitSummaryTargetsEmptyGap(text, emptySlotKeys)
  ) {
    return { text: "", changed: true };
  }
  if (slotSwapFamily(padSlotKey) === "zone" && RR_HINT_RE.test(text) && MOVE_VERB_RE.test(text)) {
    return { text: "", changed: true };
  }
  return { text, changed: false };
}

export function formatFillOrderBoardContext(
  slotKey: string,
  assignments: Record<string, { tmId?: string | null } | undefined>,
): string {
  if (!isCoreFillOrderSlot(slotKey)) {
    return `Fill-order: ${slotKey} is outside the core engine walk (overlap/AUX). Core sequence still applies to restrooms → ADM → zones → Z9SR → TR → SP.`;
  }
  const idx = slotFillOrderIndex(slotKey);
  const total = PLACEMENT_ORDER.length;
  const blocking = unfilledHigherPrioritySlots(slotKey, assignments);
  if (blocking.length === 0) {
    return `Fill-order position: ${idx + 1}/${total} (${slotKey}). All higher-priority core slots are filled — OK to judge rotation/fit for this slot.`;
  }
  return `Fill-order position: ${idx + 1}/${total} (${slotKey}). BLOCKED: fill these first — ${blocking.join(", ")}. Do NOT suggest deferring them to fill ${slotKey}.`;
}

export type SanitizePlacementPadOptions = {
  emptySlotKeys?: string[];
  /** Current pad slot has no assignee — swaps are never valid. */
  slotUnassigned?: boolean;
};

/** Post-process structured pad output — drop illegal swap / fill-order lines. */
export function sanitizePlacementPadInsight(
  insight: PlacementPadInsight,
  slotKey: string,
  assignments: Record<string, { tmId?: string | null } | undefined>,
  opts: SanitizePlacementPadOptions = {},
): { insight: PlacementPadInsight; stripped: string[] } {
  const stripped: string[] = [];
  const blocking = unfilledHigherPrioritySlots(slotKey, assignments);
  const emptySlots =
    opts.emptySlotKeys ??
    Object.keys(assignments).filter((k) => !isSlotFilled(k, assignments));
  const slotUnassigned =
    opts.slotUnassigned ?? !isSlotFilled(slotKey, assignments);

  let swapRecommendations = insight.swapRecommendations;

  if (slotUnassigned && swapRecommendations.length > 0) {
    for (const s of swapRecommendations) stripped.push(s.summary);
    swapRecommendations = [];
  }

  const filteredOccupancy = swapRecommendations.filter((s) => {
    if (
      swapSummaryTargetsEmptySlot(s.summary, emptySlots) ||
      textSuggestsCrossTierMove(s.summary)
    ) {
      stripped.push(s.summary);
      return false;
    }
    return true;
  });
  if (filteredOccupancy.length !== swapRecommendations.length) {
    swapRecommendations = filteredOccupancy;
  }

  if (blocking.length > 0) {
    const filtered = swapRecommendations.filter((s) => {
      const lower = s.summary.toLowerCase();
      const suggestsSkip =
        /\b(fill|staff|place|put).*(z\d|zone|tr\d|sp\d|trash|support)\b/i.test(lower) &&
        !/\b(mrr|wrr|restroom|adm|admin)\b/i.test(lower);
      const suggestsLateSlot = PLACEMENT_ORDER.slice(slotFillOrderIndex(slotKey) + 1).some(
        (k) => lower.includes(k.toLowerCase()),
      );
      if (suggestsSkip || suggestsLateSlot) {
        stripped.push(s.summary);
        return false;
      }
      return true;
    });
    if (filtered.length !== swapRecommendations.length) {
      swapRecommendations = filtered;
    }
  }

  let watchouts = insight.watchouts.filter((w) => {
    if (textSuggestsCrossTierMove(w) || swapSummaryTargetsEmptySlot(w, emptySlots)) {
      stripped.push(w);
      return false;
    }
    return true;
  });

  if (blocking.length > 0 && !watchouts.some((w) => w.includes("fill-order") || w.includes("Fill order"))) {
    watchouts.unshift(
      `Fill order: ${blocking.slice(0, 5).join(", ")} must be covered before ${slotKey} (engine constitution).`,
    );
  }

  let fitSummary = insight.fitSummary;
  let headline = insight.headline;
  let whyTonight = insight.whyTonight;
  let rotationNote = insight.rotationNote;
  let neighborDynamics = insight.neighborDynamics;
  let fitVerdict: PlacementFitVerdict = insight.fitVerdict;
  let verdictOverrideReason = insight.verdictOverrideReason;

  const scrubField = (value: string | undefined): string | undefined => {
    if (!value?.trim()) return value;
    const { text, changed } = scrubIllegalSuggestionText(value, slotKey, emptySlots);
    if (changed) stripped.push(value.slice(0, 120));
    return text;
  };

  fitSummary = scrubField(fitSummary) ?? fitSummary;
  headline = scrubField(headline) ?? headline;
  whyTonight = scrubField(whyTonight) ?? whyTonight;
  rotationNote = scrubField(rotationNote);
  neighborDynamics = scrubField(neighborDynamics);

  const narrativeGutted =
    stripped.length > 0 &&
    (!whyTonight?.trim() || !fitSummary?.trim()) &&
    (insight.whyTonight || insight.fitSummary);

  if (narrativeGutted) {
    if (slotUnassigned) {
      fitSummary = `Assign ${slotKey} per fill order — do not pull from restrooms or other tiers.`;
      whyTonight =
        "Slot is open. Pick an eligible full-grave TM already on the board or roster; restrooms stay in the RR chain until complete.";
    } else if (slotSwapFamily(slotKey) === "zone") {
      fitSummary = `Hold ${slotKey} coverage — do not pull TMs off restrooms for zone rotation.`;
      whyTonight =
        "Restroom chain and fill order come first. Zone rotation is zone↔zone only when both slots are occupied; assign gaps instead of RR→zone moves.";
    } else {
      fitSummary = fitSummary?.trim()
        ? fitSummary
        : "Placement acceptable under fill-order and swap-lane rules.";
      whyTonight = whyTonight?.trim()
        ? whyTonight
        : "Cross-tier RR↔zone moves are not valid; keep swaps within the same lane family.";
    }
    if (fitVerdict === "needs_swap") {
      fitVerdict = "acceptable";
      verdictOverrideReason =
        verdictOverrideReason ??
        "Removed illegal RR↔zone or empty-target swap suggestion (constitution).";
    }
  } else if (
    (fitVerdict === "needs_swap" &&
      (textSuggestsCrossTierMove(insight.fitSummary) ||
        textSuggestsCrossTierMove(insight.whyTonight))) ||
    stripped.length > 0
  ) {
    if (fitVerdict === "needs_swap") {
      fitVerdict = "acceptable";
      verdictOverrideReason =
        verdictOverrideReason ??
        "Swap suggestion violated fill-order or cross-tier rules.";
    }
  }

  const changed =
    stripped.length > 0 ||
    swapRecommendations !== insight.swapRecommendations ||
    watchouts.length !== insight.watchouts.length ||
    fitSummary !== insight.fitSummary ||
    headline !== insight.headline ||
    whyTonight !== insight.whyTonight ||
    fitVerdict !== insight.fitVerdict;

  if (!changed) {
    return { insight, stripped };
  }

  return {
    insight: {
      ...insight,
      swapRecommendations,
      watchouts,
      fitSummary,
      headline,
      whyTonight,
      rotationNote,
      neighborDynamics,
      fitVerdict,
      verdictOverrideReason,
    },
    stripped,
  };
}
