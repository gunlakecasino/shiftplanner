/**
 * Target / Placement Order Derivation — part of the granular AI skill.
 *
 * WORLD-CLASS SYSTEMISATION:
 * The fill order is now expressed as explicit, inspectable **Coverage Tiers**.
 * Each tier declares the minimum unique TMs required to "clear" it.
 *
 * This is the single source of truth that both the deterministic engine
 * and Grok (via the AI Lab) must consult.
 *
 * Grok can read this file, understand the physical constraints, and propose
 * precise, realistic modifications.
 */

export interface CoverageTier {
  name: string;
  slots: readonly string[];
  minUniqueTMs: number;
  description: string;
  isHardCoverage: boolean; // Engine should fight extremely hard to clear this tier
}

/**
 * The authoritative tiered model of the fill order.
 * This is the data structure Grok should primarily reason about.
 */
export const COVERAGE_TIERS: readonly CoverageTier[] = [
  {
    name: "Critical - Restrooms",
    slots: ["MRR1","WRR1","MRR6","WRR6","MRR7","WRR7","MRR8","WRR8","MRR10","WRR10"],
    minUniqueTMs: 10, // 5 male + 5 female, non-reusable
    description: "All 10 restrooms. Requires strict gender matching. Highest operational and compliance priority.",
    isHardCoverage: true,
  },
  {
    name: "Core - Admin + Zones",
    slots: ["ADM", "Z9", "Z4", "Z5", "Z1", "Z2", "Z3", "Z7", "Z8", "Z10", "Z6"],
    minUniqueTMs: 11, // 1 Admin + 10 full-grave Zones (non-reusable with restrooms)
    description: "Admin + all 10 main zones. These require dedicated full-grave TMs.",
    isHardCoverage: true,
  },
  {
    name: "High Value - Smoking Room",
    slots: ["Z9SR"],
    minUniqueTMs: 1,
    description: "Zone 9 Smoking Room. High revenue / visibility area.",
    isHardCoverage: false,
  },
  {
    name: "Essential Support - Trash",
    slots: ["TR1", "TR2"],
    minUniqueTMs: 2,
    description: "Trash runs. Important for cleanliness and guest experience.",
    isHardCoverage: false,
  },
  {
    name: "Float / Overflow",
    slots: ["SP1", "SP2"],
    minUniqueTMs: 0, // Can share people from lower tiers in some cases
    description: "Support / float positions. Lowest priority in the strict order.",
    isHardCoverage: false,
  },
] as const;

/**
 * Flattened authoritative order (derived from tiers for backward compatibility).
 */
export const DEFAULT_PLACEMENT_ORDER: readonly string[] = COVERAGE_TIERS.flatMap(t => t.slots);

/**
 * Returns slots in the engine's fill order.
 * Extra auxDefs (dynamically added support slots) are always appended at the end.
 */
export function deriveTargetSlotsInOrder(auxDefs: Array<{ key: string }> = []): string[] {
  const fixed = [...DEFAULT_PLACEMENT_ORDER];
  const extras = auxDefs
    .map(d => d.key)
    .filter(k => !fixed.includes(k));

  return [...fixed, ...extras];
}

/**
 * Human-readable description of the order (for Grok prompts / SKILL consumption).
 */
export function getPlacementOrderDescription(): string {
  return `DEFAULT FILL ORDER — expressed as explicit Coverage Tiers (authoritative model):

Tier 1: Critical - Restrooms (10 unique TMs required — 5 male + 5 female)
Tier 2: Core - Admin + All Zones (11 additional unique full-grave TMs)
Tier 3: High Value - Z9SR
Tier 4: Essential Support - Trash 1 & 2
Tier 5: Float / Overflow - Support 1 & 2

Total to clear Tier 1 + Tier 2: **minimum 21 unique TMs**.

This tier model is the primary structure Grok and the engine must reason with.`;
}

/**
 * Returns the tier that contains a given slot.
 */
export function getTierForSlot(slotKey: string): CoverageTier | undefined {
  return COVERAGE_TIERS.find(tier => tier.slots.includes(slotKey));
}

/**
 * Returns all tiers up to and including the tier that contains the given slot.
 */
export function getTiersUpToSlot(slotKey: string): CoverageTier[] {
  const tier = getTierForSlot(slotKey);
  if (!tier) return [...COVERAGE_TIERS];
  const tierIndex = COVERAGE_TIERS.findIndex(t => t.name === tier.name);
  return COVERAGE_TIERS.slice(0, tierIndex + 1);
}

/**
 * World-class feasibility calculator.
 * Given available unique TMs, returns exactly what coverage is realistically possible.
 */
export interface CoverageFeasibility {
  availableUniqueTMs: number;
  maximumTierCleared: string | null;
  tiersFullyCleared: string[];
  tiersPartiallyCleared: string[];
  impossibleTiers: string[];
  minimumTMsRequiredForFullTopCoverage: number; // 21
  shortfall: number;
  explanation: string;
}

export function calculateCoverageFeasibility(availableUniqueTMs: number): CoverageFeasibility {
  const minForTier1 = COVERAGE_TIERS[0].minUniqueTMs;                    // 10
  const minForTier2 = minForTier1 + COVERAGE_TIERS[1].minUniqueTMs;     // 21

  const tiersFullyCleared: string[] = [];
  const tiersPartiallyCleared: string[] = [];
  const impossibleTiers: string[] = [];

  let maxTierName: string | null = null;

  if (availableUniqueTMs >= minForTier2) {
    tiersFullyCleared.push(COVERAGE_TIERS[0].name, COVERAGE_TIERS[1].name);
    maxTierName = COVERAGE_TIERS[1].name;
  } else if (availableUniqueTMs >= minForTier1) {
    tiersFullyCleared.push(COVERAGE_TIERS[0].name);
    tiersPartiallyCleared.push(COVERAGE_TIERS[1].name);
    maxTierName = COVERAGE_TIERS[0].name;
  } else {
    tiersPartiallyCleared.push(COVERAGE_TIERS[0].name);
  }

  // Higher tiers become impossible if we couldn't clear the core
  if (availableUniqueTMs < minForTier2) {
    impossibleTiers.push(COVERAGE_TIERS[1].name);
  }

  const shortfall = Math.max(0, minForTier2 - availableUniqueTMs);

  let explanation = `With ${availableUniqueTMs} unique TMs available:\n`;
  if (shortfall > 0) {
    explanation += `→ Short ${shortfall} TMs to clear Tier 1 + Tier 2 (Restrooms + Zones + Admin).\n`;
    explanation += `→ ${COVERAGE_TIERS[1].name} cannot be fully cleared.`;
  } else {
    explanation += `→ Full Tier 1 + Tier 2 coverage is mathematically possible.`;
  }

  return {
    availableUniqueTMs,
    maximumTierCleared: maxTierName,
    tiersFullyCleared,
    tiersPartiallyCleared,
    impossibleTiers,
    minimumTMsRequiredForFullTopCoverage: minForTier2,
    shortfall,
    explanation,
  };
}

/**
 * Hard minimum unique TMs required to clear each major tier of the fill order.
 * This is critical domain knowledge: you cannot reuse the same people across these blocks.
 */
export const UNIQUE_TM_REQUIREMENTS = {
  // Tier 1: All 10 Restrooms (5 MRR + 5 WRR) require distinct people with correct gender
  restrooms: 10,

  // Tier 2: Admin is 1 additional unique TM
  admin: 1,

  // Tier 3: All 10 main Zones require 10 more unique TMs (full-grave)
  zones: 10,

  // Total to clear the absolute top of the order (Restrooms + Admin + Zones 1-10)
  topPriorityClear: 21,   // 10 RR + 1 ADM + 10 Zones
};

/**
 * Calculates the minimum number of unique TMs required to fill everything
 * up to (and including) a given slot in the priority order.
 *
 * This is the key function that prevents impossible "fill the order" expectations
 * when headcount is too low.
 */
export function calculateMinimumUniqueTMsForOrderPrefix(upToSlotKey: string): number {
  const order = [...DEFAULT_PLACEMENT_ORDER];
  const idx = order.indexOf(upToSlotKey);

  if (idx === -1) {
    // Slot not in core order (extra AUX) — it comes after everything
    return UNIQUE_TM_REQUIREMENTS.topPriorityClear;
  }

  // Count how many restroom slots are in the prefix
  const restroomsInPrefix = order.slice(0, idx + 1).filter(s => s.startsWith('MRR') || s.startsWith('WRR')).length;

  // Count admin
  const hasAdmin = order.slice(0, idx + 1).includes('ADM');

  // Count zones
  const zonesInPrefix = order.slice(0, idx + 1).filter(s => /^Z\d+$/.test(s)).length;

  let minimum = 0;

  // Restrooms must be filled with 5M + 5F distinct
  if (restroomsInPrefix > 0) {
    minimum += 10; // You basically need all 10 to "clear" the restroom block in the order
  }

  if (hasAdmin) {
    minimum += 1;
  }

  if (zonesInPrefix > 0) {
    minimum += 10; // All 10 zones need distinct full-grave TMs
  }

  return minimum;
}

/**
 * Returns a human-readable explanation of the unique-TM constraint for a given prefix.
 * Perfect for injecting into Grok prompts and the AI Lab.
 */
export function getUniqueTMConstraintText(upToSlotKey?: string): string {
  const { restrooms, admin, zones, topPriorityClear } = UNIQUE_TM_REQUIREMENTS;

  let text = `HARD UNIQUE-TM CONSTRAINT (non-negotiable):

- All 10 Restroom slots (5 MRR + 5 WRR) require **10 distinct TMs** with correct gender.
- Admin requires **1 additional unique TM**.
- All 10 main Zone slots require **10 more distinct full-grave TMs**.
- Therefore, clearing Restrooms + Admin + Zones 1-10 requires a **minimum of 21 unique TMs**.

You cannot reuse the same people across these blocks.`;

  if (upToSlotKey) {
    const needed = calculateMinimumUniqueTMsForOrderPrefix(upToSlotKey);
    text += `\n\nTo reach ${upToSlotKey} in the fill order you need at least ${needed} unique TMs.`;
  }

  return text;
}
