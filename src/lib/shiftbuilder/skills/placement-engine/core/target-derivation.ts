import type { AuxDef } from "../../../placement";
import { isTypedAuxDef } from "../../../auxLayout";

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
// Operator-ratified fill order (2026-07-18):
//   1. All restroom obligations
//   2. Critical zones      4 → 5 → 9
//   3. Admin               required at 14+ available full-grave graves TMs
//   4. Remaining zones     2 → 3 → 1 → 7 → 8 → 10 → 6 → Z9 Smoking Room
//   5. Auxiliary default   Trash 1 → Trash 2 → Support
// RR1+2 is a single placement per side; restroom consolidation/SOS is handled by
// the coverage-plan layer, while this static order names the normal board slots.
export const ADMIN_REQUIRED_FULL_GRAVE_THRESHOLD = 14;

const RESTROOM_SLOTS = ["MRR1","MRR6","MRR7","MRR8","MRR10","WRR1","WRR6","WRR7","WRR8","WRR10"] as const;
const CRITICAL_ZONE_SLOTS = ["Z4", "Z5", "Z9"] as const;
const REMAINING_ZONE_SLOTS = ["Z2", "Z3", "Z1", "Z7", "Z8", "Z10", "Z6"] as const;

export const COVERAGE_TIERS: readonly CoverageTier[] = [
  {
    name: "Critical - Restrooms",
    slots: RESTROOM_SLOTS,
    minUniqueTMs: 10, // 5 male + 5 female, non-reusable; men's filled before women's
    description: "All restroom service positions. Strict gender matching, with RR1+2 treated as one placement per side.",
    isHardCoverage: true,
  },
  {
    name: "Critical - Zones 4/5/9",
    slots: CRITICAL_ZONE_SLOTS,
    minUniqueTMs: 3,
    description: "Critical floor zones 4, 5, and 9 after restrooms.",
    isHardCoverage: true,
  },
  {
    name: "Conditional - Admin",
    slots: ["ADM"],
    minUniqueTMs: 1,
    description: "Admin is required when at least 14 available full-grave grave-shift TMs are present and requires Admin-trained status.",
    isHardCoverage: true,
  },
  {
    name: "Remaining - Zones",
    slots: REMAINING_ZONE_SLOTS,
    minUniqueTMs: 7,
    description: "Remaining zones in fill order 2,3,1,7,8,10,6.",
    isHardCoverage: false,
  },
  {
    name: "Remaining - Z9 Smoking Room",
    slots: ["Z9SR"],
    minUniqueTMs: 1,
    description: "Zone 9 Smoking Room after Zone 6.",
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

const CORE_ZONE_SLOTS = [...CRITICAL_ZONE_SLOTS, ...REMAINING_ZONE_SLOTS] as const;

/**
 * Build coverage tiers from flex aux layout (roles on AUXn keys).
 */
export function buildCoverageTiers(auxDefs: AuxDef[] = []): CoverageTier[] {
  const typed = auxDefs.filter(isTypedAuxDef);
  const adminSlots = typed.filter((d) => d.role === "admin").map((d) => d.key);
  const z9srSlots = typed.filter((d) => d.role === "z9sr").map((d) => d.key);
  const trashSlots = typed.filter((d) => d.role === "trash").map((d) => d.key);
  // Support + Oasis + Job Coach + Step Up share the lowest-priority float tier.
  const floatSlots = typed
    .filter(
      (d) =>
        d.role === "support" ||
        d.role === "oasis" ||
        d.role === "job_coach" ||
        d.role === "step_up",
    )
    .map((d) => d.key);

  const orderedAdminSlots = adminSlots.length > 0 ? adminSlots : ["ADM"];
  const orderedZ9srSlots = z9srSlots.length > 0 ? z9srSlots : ["Z9SR"];

  return [
    COVERAGE_TIERS[0],
    {
      name: "Critical - Zones 4/5/9",
      slots: [...CRITICAL_ZONE_SLOTS],
      minUniqueTMs: 3,
      description: "Critical floor zones 4, 5, and 9 after restrooms.",
      isHardCoverage: true,
    },
    {
      name: "Conditional - Admin",
      slots: orderedAdminSlots,
      minUniqueTMs: orderedAdminSlots.length,
      description: "Admin is required at 14+ available full-grave graves TMs.",
      isHardCoverage: true,
    },
    {
      name: "Remaining - Zones",
      slots: [...REMAINING_ZONE_SLOTS],
      minUniqueTMs: 7,
      description: "Remaining zones in fill order 2,3,1,7,8,10,6.",
      isHardCoverage: false,
    },
    {
      name: "Remaining - Z9 Smoking Room",
      slots: orderedZ9srSlots,
      minUniqueTMs: orderedZ9srSlots.length,
      description: "Zone 9 Smoking Room after Zone 6.",
      isHardCoverage: false,
    },
    {
      name: "Essential Support - Trash",
      slots: trashSlots,
      minUniqueTMs: trashSlots.length,
      description: "Trash runs. Important for cleanliness and guest experience.",
      isHardCoverage: false,
    },
    {
      name: "Float / Overflow",
      slots: floatSlots,
      minUniqueTMs: 0,
      description:
        "Support / Oasis / Job Coach / Step Up — lowest priority in the strict order.",
      isHardCoverage: false,
    },
  ];
}

export function hasFlexAuxLayout(auxDefs: AuxDef[] = []): boolean {
  return auxDefs.some((d) => d.role !== undefined);
}

/**
 * Flattened authoritative order (derived from tiers for backward compatibility).
 */
export const DEFAULT_PLACEMENT_ORDER: readonly string[] = COVERAGE_TIERS.flatMap(t => t.slots);

/**
 * Returns slots in the engine's fill order.
 * When auxDefs carry roles, tiers are derived from the flex aux row.
 */
export function deriveTargetSlotsInOrder(auxDefs: AuxDef[] = []): string[] {
  if (hasFlexAuxLayout(auxDefs)) {
    return buildCoverageTiers(auxDefs).flatMap((t) => [...t.slots]);
  }

  const fixed = [...DEFAULT_PLACEMENT_ORDER];
  const extras = auxDefs
    .map((d) => d.key)
    .filter((k) => !fixed.includes(k));

  return [...fixed, ...extras];
}

/**
 * Human-readable description of the order (for Grok prompts / SKILL consumption).
 */
export function getPlacementOrderDescription(): string {
  return `DEFAULT FILL ORDER — expressed as explicit Coverage Tiers (authoritative model):

Tier 1: Critical - Restrooms (10 unique TMs required — 5 male + 5 female)
Tier 2: Critical - Zones 4, 5, and 9 (3 additional full-grave TMs)
Tier 3: Conditional - Admin (required at 14+ available full-grave graves TMs, Admin-trained only)
Tier 4: Remaining Zones - Z2, Z3, Z1, Z7, Z8, Z10, Z6
Tier 5: Z9 Smoking Room
Tier 6: Trash 1, Trash 2, then Support / Overflow

Total to clear restrooms + Z4/Z5/Z9 + Admin: **minimum 14 unique TMs**.

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
  minimumTMsRequiredForFullTopCoverage: number; // 14
  shortfall: number;
  explanation: string;
  /** Present when a gender split is supplied. Tier 1 needs ≥5 of each. */
  maleShortfall?: number;
  femaleShortfall?: number;
}

/** Full-grave gender split — Tier 1 (10 restrooms) needs 5 males AND 5 females. */
export interface GenderSplit {
  male: number;
  female: number;
}

const RR_PER_GENDER = 5;

/**
 * World-class feasibility calculator.
 *
 * F10 (2026-07-02): when a `genderSplit` is supplied, Tier 1 is only clearable
 * with ≥5 eligible males AND ≥5 eligible females — a roster of 21 full-grave men
 * can no longer be declared "possible" while the five women's restrooms are
 * unfillable. The single-arg form is retained (gender-blind) for backward
 * compatibility with existing callers.
 */
export function calculateCoverageFeasibility(
  availableUniqueTMs: number,
  genderSplit?: GenderSplit,
): CoverageFeasibility {
  const minForTier1 = COVERAGE_TIERS[0].minUniqueTMs;                    // 10
  const minForTier2 = minForTier1 + COVERAGE_TIERS[1].minUniqueTMs;     // 13
  const minForAdmin = ADMIN_REQUIRED_FULL_GRAVE_THRESHOLD;              // 14

  const maleShortfall = genderSplit ? Math.max(0, RR_PER_GENDER - genderSplit.male) : 0;
  const femaleShortfall = genderSplit ? Math.max(0, RR_PER_GENDER - genderSplit.female) : 0;
  const genderBlocksTier1 = maleShortfall > 0 || femaleShortfall > 0;
  const adminRequired = availableUniqueTMs >= ADMIN_REQUIRED_FULL_GRAVE_THRESHOLD;

  const tiersFullyCleared: string[] = [];
  const tiersPartiallyCleared: string[] = [];
  const impossibleTiers: string[] = [];

  let maxTierName: string | null = null;

  const tier1Clear = availableUniqueTMs >= minForTier1 && !genderBlocksTier1;
  const tier2Clear = availableUniqueTMs >= minForTier2 && !genderBlocksTier1;
  const adminClear = availableUniqueTMs >= minForAdmin && !genderBlocksTier1;

  if (tier2Clear) {
    tiersFullyCleared.push(COVERAGE_TIERS[0].name, COVERAGE_TIERS[1].name);
    maxTierName = COVERAGE_TIERS[1].name;
    if (adminClear) {
      tiersFullyCleared.push(COVERAGE_TIERS[2].name);
      maxTierName = COVERAGE_TIERS[2].name;
    } else if (adminRequired) {
      tiersPartiallyCleared.push(COVERAGE_TIERS[2].name);
    }
  } else if (tier1Clear) {
    tiersFullyCleared.push(COVERAGE_TIERS[0].name);
    tiersPartiallyCleared.push(COVERAGE_TIERS[1].name);
    maxTierName = COVERAGE_TIERS[0].name;
  } else {
    tiersPartiallyCleared.push(COVERAGE_TIERS[0].name);
  }

  if (!tier2Clear) {
    impossibleTiers.push(COVERAGE_TIERS[1].name);
  }
  if (adminRequired && !adminClear) {
    impossibleTiers.push(COVERAGE_TIERS[2].name);
  }

  const topTarget = adminRequired ? minForAdmin : minForTier2;
  const shortfall = Math.max(0, topTarget - availableUniqueTMs);

  let explanation = `With ${availableUniqueTMs} unique TMs available`;
  if (genderSplit) explanation += ` (${genderSplit.male}M + ${genderSplit.female}F full-grave)`;
  explanation += `:\n`;
  if (genderBlocksTier1) {
    const parts: string[] = [];
    if (femaleShortfall > 0) parts.push(`${femaleShortfall} more female TM(s) for WRRs`);
    if (maleShortfall > 0) parts.push(`${maleShortfall} more male TM(s) for MRRs`);
    explanation += `→ Tier 1 (Restrooms) cannot be cleared: ${parts.join("; ")}.`;
  } else if (shortfall > 0) {
    explanation += `→ Short ${shortfall} TMs to clear the critical board (Restrooms + Z4/Z5/Z9${adminRequired ? " + Admin" : ""}).\n`;
    explanation += `→ ${COVERAGE_TIERS[1].name} cannot be fully cleared.`;
  } else {
    explanation += adminRequired
      ? `→ Critical board plus Admin is mathematically possible.`
      : `→ Critical board is mathematically possible; Admin is not required below ${ADMIN_REQUIRED_FULL_GRAVE_THRESHOLD}.`;
  }

  return {
    availableUniqueTMs,
    maximumTierCleared: maxTierName,
    tiersFullyCleared,
    tiersPartiallyCleared,
    impossibleTiers,
    minimumTMsRequiredForFullTopCoverage: topTarget,
    shortfall: genderBlocksTier1 ? Math.max(shortfall, maleShortfall + femaleShortfall) : shortfall,
    explanation,
    maleShortfall: genderSplit ? maleShortfall : undefined,
    femaleShortfall: genderSplit ? femaleShortfall : undefined,
  };
}

/**
 * Hard minimum unique TMs required to clear each major tier of the fill order.
 * This is critical domain knowledge: you cannot reuse the same people across these blocks.
 */
export const UNIQUE_TM_REQUIREMENTS = {
  // Tier 1: All 10 Restrooms (5 MRR + 5 WRR) require distinct people with correct gender
  restrooms: 10,

  // Tier 2: Zones 4, 5, and 9 require 3 additional full-grave TMs
  criticalZones: 3,

  // Tier 3: Admin is 1 additional unique TM when the 14-person threshold is met
  admin: 1,

  // Remaining main Zones require 7 more unique TMs (full-grave)
  remainingZones: 7,

  // Total to clear the ratified critical board with conditional Admin
  topPriorityClear: 14,   // 10 RR + Z4/Z5/Z9 + ADM
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

  const criticalZonesInPrefix = order.slice(0, idx + 1).filter(s =>
    (CRITICAL_ZONE_SLOTS as readonly string[]).includes(s),
  ).length;
  const remainingZonesInPrefix = order.slice(0, idx + 1).filter(s =>
    (REMAINING_ZONE_SLOTS as readonly string[]).includes(s),
  ).length;

  let minimum = 0;

  // Restrooms must be filled with 5M + 5F distinct
  if (restroomsInPrefix > 0) {
    minimum += 10; // You basically need all 10 to "clear" the restroom block in the order
  }

  if (criticalZonesInPrefix > 0) {
    minimum += 3;
  }

  if (hasAdmin) {
    minimum += 1;
  }

  if (remainingZonesInPrefix > 0) {
    minimum += 7;
  }

  return minimum;
}

/**
 * Returns a human-readable explanation of the unique-TM constraint for a given prefix.
 * Perfect for injecting into Grok prompts and the AI Lab.
 */
export function getUniqueTMConstraintText(upToSlotKey?: string): string {
  const { restrooms, admin, criticalZones, remainingZones, topPriorityClear } = UNIQUE_TM_REQUIREMENTS;

  let text = `HARD UNIQUE-TM CONSTRAINT (non-negotiable):

- All ${restrooms} Restroom slots (5 MRR + 5 WRR) require **${restrooms} distinct TMs** with correct gender.
- Zones 4, 5, and 9 require **${criticalZones} more distinct full-grave TMs**.
- Admin requires **${admin} additional Admin-trained TM** when at least ${ADMIN_REQUIRED_FULL_GRAVE_THRESHOLD} available full-grave graves TMs are present.
- The remaining main Zone slots require **${remainingZones} more distinct full-grave TMs**.
- Therefore, clearing Restrooms + Z4/Z5/Z9 + Admin requires a **minimum of ${topPriorityClear} unique TMs**.

You cannot reuse the same people across these blocks.`;

  if (upToSlotKey) {
    const needed = calculateMinimumUniqueTMsForOrderPrefix(upToSlotKey);
    text += `\n\nTo reach ${upToSlotKey} in the fill order you need at least ${needed} unique TMs.`;
  }

  return text;
}
