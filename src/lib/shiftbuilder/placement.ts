// v1.0.0 — Production Release — UI frozen & shipped June 24 2026
/**
 * Placement Module — Single Source of Truth for Assignment Order
 *
 * === DECLARED OBJECTIVE HIERARCHY (operator-ratified 2026-07-01) ============
 *
 *   coverage > rotation > preferences > skill
 *
 * Every optimizer in this system must honor this precedence:
 *   - COVERAGE: a filled required slot beats any rotation/preference/skill
 *     gain. The planner's rescue + backfill passes and the health optimizer's
 *     fallback exist to enforce this ("coverage over rotation gates").
 *   - ROTATION: among coverage-equal solutions, rotation health (prior-3
 *     criticals, week repeats, 30-night spread) outranks preferences — this is
 *     why buildHealthOptimizedDraft re-picks from the planner's Top-K by
 *     healthPoints, and why the Deep Optimize local solver weights health
 *     lexicographically above the preference band.
 *   - PREFERENCES: hard *avoid* preferences are constraints (never placed);
 *     prefer/soft signals rank below rotation but above skill.
 *   - SKILL: skill/difficulty closeness is the final tiebreaker.
 *
 * Hard rules (eligibility, locks, one-TM-per-night, Z1/Z2 manual-only) are
 * constraints at every tier, never tradeable costs.
 * ============================================================================
 *
 * This module is the **authoritative definition** of how placements must work
 * in the Coverage Planner (Phase 1).
 *
 * Usage (recommended):
 *   import { PLACEMENT_ORDER, getSlotsInPlacementOrder, runWeightedPlanner } from "@/lib/shiftbuilder/placement";
 *
 * The legacy `runCoveragePlanner` is a deprecated skeleton and should not be used
 * for any real scheduling work. All production paths now go through `runWeightedPlanner`
 * (with optional Grok-hybrid overlay).
 */

import { scoreAssignment, buildDefaultAdjacency, type ScoringContext } from "./scoring";
import { assignmentTmId } from "./tmIdentity";
// engineOverrides.ts never imports from this module (no cycle) — safe to pull
// operator-rule evaluation in here so the legacy fallback planner respects
// engine_eligibility_rules too, not just the unified engine (F1 follow-up,
// 2026-07-04). NOTE: engine/eligibility.ts must NOT be imported here — that
// module imports FROM placement.ts, so doing so would create a cycle.
import { isEligibleUnderRules } from "./engineOverrides";
import type { EligibilityRule } from "./engineConfig";

// Single source of truth for placement order now lives in the AI-modifiable skill
import {
  DEFAULT_PLACEMENT_ORDER,
  deriveTargetSlotsInOrder,
  calculateCoverageFeasibility,
  COVERAGE_TIERS,
} from "./skills/placement-engine";

// Minimal interface to avoid circular imports
export type AuxRole = "blank" | "z9sr" | "admin" | "trash" | "support";

export interface AuxDef {
  key: string;
  role: AuxRole;
  label: string;
  locations: string[];
}

// ========================================================
// AUTHORITATIVE PLACEMENT ORDER (Phase 1 - Coverage Planner)
// ========================================================
/**
 * The **strict, non-negotiable** fill order for the placement engine.
 *
 * This is the exact sequence the greedy / weighted planner and Grok-hybrid
 * layer must respect unless hard constraints make it impossible.
 *
 * - Restrooms are filled first with strict gender matching (MRR* = male, WRR* = female).
 * - Admin and high-priority zones follow in the specific sequence below.
 * - Z9SR, Trash, and Support slots have fixed positions at the end of the core list.
 * - Any extra AUX slots the operator adds must come after SP2.
 */
/**
 * Authoritative placement/fill order.
 * This now comes directly from the AI-modifiable skill layer.
 */
export const PLACEMENT_ORDER: readonly string[] = DEFAULT_PLACEMENT_ORDER;

/**
 * Optional (never auto-filled) zones. Emptied 2026-07-03: the operator ratified a
 * fill order that includes Z1 and Z2 as regular zones (…Z10 → Z2 → Z1 → Z6), so
 * they are now staffed in sequence like any other zone rather than manual-only.
 */
export const OPTIONAL_AUTO_FILL_ZONE_SLOTS = new Set<string>([]);

export function isOptionalDeploymentSlot(slotKey: string): boolean {
  return OPTIONAL_AUTO_FILL_ZONE_SLOTS.has(slotKey);
}

/**
 * Returns all slot keys in the exact order the Coverage Planner must process them.
 *
 * @param auxDefs - Currently active auxiliary/support slots (including user-added ones)
 */
export function getSlotsInPlacementOrder(auxDefs: AuxDef[] = []): string[] {
  // Delegate to the skill's derivation logic (keeps legacy and skill in sync)
  return deriveTargetSlotsInOrder(auxDefs);
}

// ========================================================
// COVERAGE PLANNER (Phase 1)
// ========================================================

export interface CoveragePlannerInput {
  orderedSlots: string[];
  assignments: Record<string, any>;
  roster: any[]; // full or filtered roster
  graveOnly?: boolean;
  // Future: constraints, break rules, etc.
}

export interface CoveragePlannerResult {
  proposedAssignments: Record<string, string>; // slotKey -> tmId
  unassignedPeople: any[];
  notes: string[];
  /** Per-slot Top-K candidate ranking with score breakdowns (for "Why?" mode) */
  breakdown: Record<string, SlotRanking>;
}

export interface SlotRanking {
  topCandidates: Array<{
    tmId: string;
    tmName: string;
    total: number;
    breakdown: import("./scoring").SignalBreakdown;
    excluded?: boolean;
    excludeReason?: string;
  }>;
  /** The tmId actually picked (= topCandidates[0].tmId when not pre-locked) */
  pickedTmId: string | null;
  /** Set when the slot was already filled before the engine ran (we preserve) */
  preserved: boolean;
}

/**
 * @deprecated LEGACY SKELETON — DO NOT USE for production engine runs.
 *
 * This was the original naive greedy implementation before the real
 * weighted planner + Grok-hybrid system existed (Phase 1).
 *
 * It lacks:
 *   - Weighted scoring
 *   - Pair affinity
 *   - Preference / matrix fairness signals
 *   - Top-K breakdown for the Why? panel
 *   - Proper Draft Mode support
 *
 * The single source of truth for all real engine execution is now
 * `runWeightedPlanner` (and the Grok-hybrid wrapper around it).
 *
 * This function is kept only for:
 *   - Historical reference
 *   - Possible future "very simple fallback" mode
 *   - Type compatibility in a few import sites
 *
 * If you call this, you will get poor results and no diagnostics.
 */
export function runCoveragePlanner(input: CoveragePlannerInput): CoveragePlannerResult {
  console.warn(
    "[runCoveragePlanner] DEPRECATED skeleton called. This produces low-quality output. " +
    "Use runWeightedPlanner (or the Grok-hybrid path) instead."
  );

  const { orderedSlots, assignments, roster } = input;

  const proposedAssignments: Record<string, string> = {};
  const assignedTmIds = new Set<string>();
  const notes: string[] = [];

  // Legacy naive greedy (intentionally left as-is for reference)
  for (const slotKey of orderedSlots) {
    if (assignments[slotKey]?.tmId) {
      proposedAssignments[slotKey] = assignments[slotKey].tmId;
      assignedTmIds.add(assignments[slotKey].tmId);
      continue;
    }

    const candidate = roster.find(
      (tm: any) => !assignedTmIds.has(tm.id) && isEligibleForSlot(tm, slotKey)
    );

    if (candidate) {
      proposedAssignments[slotKey] = candidate.id;
      assignedTmIds.add(candidate.id);
    } else {
      notes.push(`No eligible candidate found for ${slotKey}`);
    }
  }

  const unassignedPeople = roster.filter((tm: any) => !assignedTmIds.has(tm.id));

  return {
    proposedAssignments,
    unassignedPeople,
    notes,
    breakdown: {},
  };
}

// ========================================================
// WEIGHTED PLANNER (Phase 1)
// ========================================================

export interface WeightedPlannerInput extends CoveragePlannerInput {
  /** Pre-built context with all the reference data + active engine config. */
  scoringCtx: Omit<ScoringContext, "currentDraft" | "adjacency"> & {
    /** Optional adjacency override; defaults to buildDefaultAdjacency() */
    adjacency?: Map<string, string[]>;
  };
  /** Top K candidates to keep per slot for the breakdown surface. Default 5. */
  topK?: number;
  /**
   * When true (Run xAI Engine), only locked slots are kept from the live board.
   * Unlocked placements are re-scored so the engine can propose a full deployment.
   */
  preserveOnlyLocked?: boolean;
  /** Operator rules (engine_eligibility_rules). Empty/omitted = none (F1 fix, 2026-07-04). */
  eligibilityRules?: EligibilityRule[];
}

/** Coarse slot type used by operator rule filters. Deliberately duplicated from
 * engine/eligibility.ts's identical helper — that module imports FROM this one,
 * so this one can't import back from it without creating a cycle. */
function slotTypeForKey(slotKey: string): string {
  if (slotKey.startsWith("MRR") || slotKey.startsWith("WRR")) return "rr";
  if (slotKey.startsWith("OL-")) return "overlap";
  if (slotKey.startsWith("Z")) return "zone";
  if (isOptionalDeploymentSlot(slotKey)) return "zone";
  return "aux";
}

const HARD_COVERAGE_SLOTS = new Set(
  COVERAGE_TIERS.filter((t) => t.isHardCoverage).flatMap((t) => t.slots),
);

/** Full-grave TM — required for zone deployment (Z1–Z10, Z9SR). */
export function isFullGraveForPlacement(tm: any): boolean {
  const isAMOverlapAssigned = !!(tm.isAMOverlap || tm.isAMOverlapTonight);
  const isPMOverlapAssigned = !!(tm.isPMOverlap || tm.isPMOverlapTonight);
  const isFullGraveBySchedule = !!(tm.isFullGrave || tm.isFullGraveTonight);
  const gravePoolKind = String(tm.gravePool ?? "").toUpperCase();
  const isOverlapByPool = gravePoolKind === "AM" || gravePoolKind === "PM";
  const isGrave =
    !!tm.gravePool || isFullGraveBySchedule || isAMOverlapAssigned || isPMOverlapAssigned;
  return (
    isFullGraveBySchedule ||
    (isGrave && !isOverlapByPool && !isAMOverlapAssigned && !isPMOverlapAssigned)
  );
}

/** Admin + main zones (not RR / trash / support / overlap). */
export function isCoreZoneAdminSlot(slotKey: string): boolean {
  if (isOptionalDeploymentSlot(slotKey)) return false;
  if (slotKey.startsWith("MRR") || slotKey.startsWith("WRR")) return false;
  if (slotKey === "Z9SR" || slotKey.startsWith("TR") || slotKey.startsWith("SP")) return false;
  if (slotKey.startsWith("OL-") || slotKey.includes("Overlap")) return false;
  if (slotKey.startsWith("Z")) return true;
  if (slotKey === "ADM" || slotKey.toUpperCase().includes("ADMIN")) return true;
  if (/^AUX\d+$/i.test(slotKey)) return true;
  return false;
}

export function countFullGraveInRoster(roster: any[]): number {
  return roster.filter((tm) => isFullGraveForPlacement(tm)).length;
}

type ScoredPlannerCandidate = {
  tmId: string;
  tmName: string;
  total: number;
  breakdown: import("./scoring").SignalBreakdown;
  excluded: boolean;
  excludeReason: string | undefined;
};

/** Finite score for ranking hard-excluded candidates (ignores -Infinity totals). */
function effectiveCandidateScore(c: ScoredPlannerCandidate): number {
  if (!c.excluded && Number.isFinite(c.total)) return c.total;
  let sum = 0;
  for (const s of Object.values(c.breakdown ?? {})) {
    if (Number.isFinite(s.weighted)) sum += s.weighted;
  }
  return sum;
}

function isSameAreaRotationHardExclude(c: ScoredPlannerCandidate): boolean {
  return !!c.excluded && c.breakdown?.prior_placement_repeat?.raw === -1;
}

function rankCandidatesByEffectiveScore(
  list: ScoredPlannerCandidate[],
): ScoredPlannerCandidate[] {
  return [...list].sort(
    (a, b) => effectiveCandidateScore(b) - effectiveCandidateScore(a),
  );
}

/**
 * When every scorer hard-excludes, still fill core zones with the least-bad TM:
 * prefer non–same-area blocks, then highest effective score, then full-grave for zones.
 */
function pickBestCoverageRescueCandidate(
  scored: ScoredPlannerCandidate[],
  candidates: any[],
  slotKey: string,
): ScoredPlannerCandidate | null {
  if (scored.length === 0) return null;

  const eligible = scored.filter((c) => !c.excluded);
  if (eligible.length > 0) return eligible[0];

  const notSameArea = scored.filter((c) => !isSameAreaRotationHardExclude(c));
  if (notSameArea.length > 0) return rankCandidatesByEffectiveScore(notSameArea)[0];

  const ranked = rankCandidatesByEffectiveScore(scored);
  if (isCoreZoneAdminSlot(slotKey)) {
    const fullGrave = ranked.find((c) => {
      const tm = candidates.find((t) => assignmentTmId(t) === c.tmId);
      return tm && isFullGraveForPlacement(tm);
    });
    if (fullGrave) return fullGrave;
  }
  return ranked[0] ?? null;
}

/**
 * Walks PLACEMENT_ORDER. For each slot, scores all eligible candidates not
 * already used in this draft and picks the highest-scoring TM.
 *
 * Preserves filled slots as-is. Explicitly respects `isLocked` / `is_locked`
 * flags (from zone_assignments.is_locked). Locked slots are never candidates
 * for reassignment during this engine run.
 *
 * Returns a per-slot Top-K breakdown so the "Why?" panel can show the candidate ranking.
 *
 * This is the deterministic core. The Grok-hybrid path (later) wraps this
 * by feeding the same context + Top-K ranking into Grok and using its
 * judgment to override the deterministic pick on individual slots.
 */
export function runWeightedPlanner(input: WeightedPlannerInput): CoveragePlannerResult {
  const { orderedSlots, assignments, roster, scoringCtx, topK = 5, preserveOnlyLocked = false, eligibilityRules = [] } = input;

  const proposedAssignments: Record<string, string> = {};
  const breakdown: Record<string, SlotRanking> = {};
  const notes: string[] = [];

  // === World-class Coverage Feasibility (using skill tier model) ===
  const availableUnique = roster.length;
  const fullGraveCount = countFullGraveInRoster(roster);
  // F10 (2026-07-02): feed the gender split so restrooms (5M + 5F) are checked
  // per gender — 21 full-grave men no longer read as "full coverage possible".
  let fullGraveMale = 0;
  let fullGraveFemale = 0;
  for (const tm of roster) {
    if (!isFullGraveForPlacement(tm)) continue;
    const g = normalizeGender(tm.gender);
    if (g === "M") fullGraveMale += 1;
    else if (g === "F") fullGraveFemale += 1;
  }
  const feasibility = calculateCoverageFeasibility(fullGraveCount, {
    male: fullGraveMale,
    female: fullGraveFemale,
  });

  notes.push(`Coverage Feasibility: ${feasibility.explanation}`);

  if (feasibility.shortfall > 0) {
    notes.push(
      `REALITY CHECK: With only ${fullGraveCount} full-grave TMs (${availableUnique} in engine pool) it is impossible to clear Tier 1 + Tier 2. ` +
      `Restrooms fill first; remaining full-grave staff go to Admin + zones. Overlap TMs are manual-only.`
    );
  }

  // Live mutable draft for within_repeat + pair_affinity awareness.
  const currentDraft = new Map<string, string>();

  // Seed currentDraft from preserved slots so the scorer knows who's taken (pair affinity).
  for (const [slot, a] of Object.entries(assignments)) {
    const tmId = (a as any)?.tmId;
    if (!tmId) continue;
    const isLocked = !!(a as any)?.isLocked || !!(a as any)?.is_locked;
    const shouldSeed = preserveOnlyLocked ? isLocked : true;
    if (shouldSeed) currentDraft.set(slot, String(tmId));
  }

  const adjacency = scoringCtx.adjacency ?? buildDefaultAdjacency();

  for (const slotKey of orderedSlots) {
    // Preserve existing assignment if present.
    // 2026-05-30: Explicitly respect isLocked (passed through from zone_assignments.is_locked
    // in the batch path, and from live state in interactive). Locked slots are never
    // candidates for engine reassignment in this run.
    const existing = assignments[slotKey];
    const isLocked = !!(existing as any)?.isLocked || !!(existing as any)?.is_locked;

    if (existing?.tmId) {
      const shouldPreserve = preserveOnlyLocked ? isLocked : true;
      if (shouldPreserve) {
        proposedAssignments[slotKey] = existing.tmId;

        // Score the kept TM so the Why? panel isn't silent for preserved slots —
        // usually the majority of the board when the engine runs around existing
        // placements. currentDraft already holds this TM at this same slot, so
        // within_repeat won't self-exclude.
        let preservedCandidates: SlotRanking["topCandidates"] = [];
        const existingTm = roster.find(
          (tm: any) => assignmentTmId(tm) === String(existing.tmId),
        );
        if (existingTm) {
          try {
            const ctx: ScoringContext = {
              ...scoringCtx,
              currentDraft,
              adjacency,
            };
            const result = scoreAssignment(existingTm, slotKey, ctx);
            preservedCandidates = [
              {
                tmId: String(existing.tmId),
                tmName: existingTm.name || existingTm.fullName || String(existing.tmId),
                total: result.total,
                breakdown: result.breakdown,
                excluded: result.excluded,
                excludeReason: result.excludeReason,
              },
            ];
          } catch {
            /* keep empty candidates — preserved flag still explains the slot */
          }
        }

        breakdown[slotKey] = {
          topCandidates: preservedCandidates,
          pickedTmId: existing.tmId,
          preserved: true,
        };

        if (isLocked) {
          notes.push(`Locked slot ${slotKey} respected (existing TM ${existing.tmId} kept)`);
        }
        continue;
      }
    }

    if (isOptionalDeploymentSlot(slotKey)) {
      breakdown[slotKey] = {
        topCandidates: [],
        pickedTmId: null,
        preserved: false,
      };
      notes.push(`Optional zone ${slotKey} left open (manual assign only)`);
      continue;
    }

    // Build candidate set: eligible (core liturgy + operator rules) + not yet placed this run.
    const slotType = slotTypeForKey(slotKey);
    const passesOperatorRules = (tm: any) =>
      eligibilityRules.length === 0 ||
      isEligibleUnderRules(tm, slotKey, slotType, eligibilityRules);
    const usedIds = new Set(currentDraft.values());
    const candidates = roster.filter((tm: any) => {
      const id = assignmentTmId(tm);
      return id && !usedIds.has(id) && isEligibleForSlot(tm, slotKey) && passesOperatorRules(tm);
    });

    // DEBUG — log details when candidates are unexpectedly empty
    if (candidates.length === 0) {
      const eligible = roster.filter(
        (tm: any) => isEligibleForSlot(tm, slotKey) && passesOperatorRules(tm),
      );
      const notUsed = roster.filter((tm: any) => {
        const id = assignmentTmId(tm);
        return id && !usedIds.has(id);
      });
      console.warn(`[runWeightedPlanner] NO CANDIDATES for ${slotKey} — eligible=${eligible.length}  not-yet-used=${notUsed.length}  draft-size=${currentDraft.size}  roster=${roster.length}`);
      if (eligible.length > 0 && notUsed.length === 0) {
        console.warn(`  → ALL ${roster.length} TMs already placed. Used IDs:`, [...usedIds].join(", "));
      } else if (eligible.length === 0) {
        const sample = roster.slice(0, 3).map((tm: any) => `${tm.id}(pool=${tm.gravePool},gender=${tm.gender})`);
        console.warn(`  → None eligible for ${slotKey}. Sample TMs:`, sample.join(", "));
      }
      notes.push(`No eligible candidate found for ${slotKey}`);
      breakdown[slotKey] = {
        topCandidates: [],
        pickedTmId: null,
        preserved: false,
      };
      continue;
    }

    // Score each candidate.
    const ctx: ScoringContext = {
      ...scoringCtx,
      currentDraft,
      adjacency,
    };
    const scored = candidates
      .map((tm: any) => {
        const result = scoreAssignment(tm, slotKey, ctx);
        const tmId = assignmentTmId(tm);
        return {
          tmId,
          tmName: tm.name || tm.fullName || tmId,
          total: result.total,
          breakdown: result.breakdown,
          excluded: result.excluded,
          excludeReason: result.excludeReason,
        };
      })
      .sort((a, b) => {
        // Excluded candidates sink to the bottom.
        if (a.excluded && !b.excluded) return 1;
        if (!a.excluded && b.excluded) return -1;
        return b.total - a.total;
      });

    const eligibleScored = scored.filter((c) => !c.excluded);
    const top = eligibleScored.slice(0, topK);
    const picked = top[0] ?? eligibleScored[0] ?? null;

    breakdown[slotKey] = {
      topCandidates: top.length > 0 ? top : scored.slice(0, topK),
      pickedTmId: picked ? picked.tmId : null,
      preserved: false,
    };

    let finalPick = picked;

    // Core zones/admin: never leave open while unused TMs remain — prefer coverage over
    // rotation/preference gates, but always pick the highest-scored available candidate.
    if (!finalPick && isCoreZoneAdminSlot(slotKey) && scored.length > 0) {
      const rescueCandidate = pickBestCoverageRescueCandidate(
        scored,
        candidates,
        slotKey,
      );
      if (rescueCandidate?.tmId) {
        finalPick = rescueCandidate;
        notes.push(
          `Core zone coverage: ${slotKey} ← ${finalPick.tmName} (best-scored available TM; rotation gates relaxed)`,
        );
      }
    }

    if (finalPick) {
      proposedAssignments[slotKey] = finalPick.tmId;
      currentDraft.set(slotKey, finalPick.tmId);
      if (!picked || finalPick.tmId !== picked.tmId) {
        const others = scored.filter((c) => c.tmId !== finalPick!.tmId);
        breakdown[slotKey] = {
          topCandidates: [finalPick, ...others].slice(0, topK),
          pickedTmId: finalPick.tmId,
          preserved: false,
        };
      }
    } else {
      const isHardCoverage = HARD_COVERAGE_SLOTS.has(slotKey);

      if (isHardCoverage) {
        notes.push(
          `High-priority slot ${slotKey} left unfilled — all ${scored.length} eligible TM(s) blocked by rotation or preference gates`,
        );
      } else {
        notes.push(`No non-excluded candidate for ${slotKey}`);
      }
    }
  }

  // Backfill pass: if any slots were left unfilled but there are still eligible
  // unused TMs, assign them anyway (in fill order). This ensures the engine places
  // as many TMs as possible and does not leave zones empty when available (eligible)
  // TMs remain. Hard eligibility (full-grave, gender for RR, overlap rules) is still
  // respected — and candidates are ranked through the same scorer + rescue ladder as
  // the main loop. The previous version took `cands[0]` raw, which handed every
  // leftover slot to whoever happened to sort first in the roster, ignoring rotation
  // and preferences entirely.
  const unfilledAfterMain = orderedSlots.filter((k) => !proposedAssignments[k]);
  for (const slotKey of unfilledAfterMain) {
    if (proposedAssignments[slotKey]) continue;
    // Respect the same "manual assign only" contract as the main loop above —
    // otherwise this greedy pass silently auto-fills Z1/Z2 on every engine run.
    if (isOptionalDeploymentSlot(slotKey)) continue;
    const stillUsed = new Set(currentDraft.values());
    const cands = roster.filter((tm: any) => {
      const id = assignmentTmId(tm);
      return id && !stillUsed.has(id) && isEligibleForSlot(tm, slotKey);
    });
    if (cands.length === 0) continue;

    const ctx: ScoringContext = { ...scoringCtx, currentDraft, adjacency };
    const scored: ScoredPlannerCandidate[] = cands.map((tm: any) => {
      const result = scoreAssignment(tm, slotKey, ctx);
      const tmId = assignmentTmId(tm);
      return {
        tmId,
        tmName: tm.name || tm.fullName || tmId,
        total: result.total,
        breakdown: result.breakdown,
        excluded: result.excluded,
        excludeReason: result.excludeReason,
      };
    });
    const best =
      pickBestCoverageRescueCandidate(rankCandidatesByEffectiveScore(scored), cands, slotKey);
    if (!best) continue;

    proposedAssignments[slotKey] = best.tmId;
    currentDraft.set(slotKey, best.tmId);
    if (!breakdown[slotKey] || !breakdown[slotKey].pickedTmId) {
      breakdown[slotKey] = {
        topCandidates: rankCandidatesByEffectiveScore(scored).slice(0, topK),
        pickedTmId: best.tmId,
        preserved: false,
      };
    }
    notes.push(
      `Backfill: ${slotKey} ← ${best.tmName} (best-scored remaining eligible TM)`,
    );
  }

  const usedIds = new Set(currentDraft.values());
  const unassignedPeople = roster.filter((tm: any) => {
    const id = assignmentTmId(tm);
    return id && !usedIds.has(id);
  });

  return { proposedAssignments, unassignedPeople, notes, breakdown };
}

/**
 * Determines if a team member is eligible for a given slot type,
 * following the GLCR rules:
 *
 * - Main Zone Deployment slots (Z1–Z10 and Z9SR): only **full-grave** TMs,
 *   i.e. gravePool && !isAMOverlap && !isPMOverlap. Overlap TMs cover
 *   partial shifts (10pm–3am or 3am–7am) and cannot hold a zone for the
 *   full 11pm–7am window.
 * - AM Overlap slots (OL-AM-*, *AM-Overlap*): only grave TMs flagged as AM overlap.
 * - PM Overlap slots (OL-PM-*, *PM-Overlap*): only grave TMs flagged as PM overlap.
 * - Restrooms (MRR-x / WRR-x), Admin, Trash, Support, AUX: full-night positions.
 *   AM/PM overlap TMs are excluded because they work partial shifts and cannot
 *   cover a full-night restroom or admin assignment. Full-grave TMs are eligible.
 *   NOTE: Men's (MRR-x) vs Women's (WRR-x) assignment requires a gender/section
 *   field on tm_profiles — currently not present; operator must swap M/W manually.
 * - Breaks are ignored for placement decisions.
 */
export function normalizeGender(val: any): 'M' | 'F' | '' {
  const s = String(val || '').toUpperCase().trim();
  if (!s) return '';
  if (s === 'F' || s === 'FEMALE' || s === 'WOMAN' || s === 'WOMEN' || s.startsWith('F')) return 'F';
  if (s === 'M' || s === 'MALE' || s === 'MAN' || s === 'MEN' || s.startsWith('M')) return 'M';
  return '';
}

export function isEligibleForSlot(tm: any, slotKey: string, eligibilityRules: any[] = []): boolean {
  // 2026-05-28: First check custom rules from the resolved engine config (engine_eligibility_rules table).
  // This is the injection point for operator-defined hard excludes / restrictions.
  // The helper lives in engineOverrides.ts so it can evolve independently of the core liturgy.
  if (eligibilityRules.length > 0) {
    const { isEligibleUnderRules } = require("./engineOverrides"); // dynamic to avoid circular during rollout
    if (!isEligibleUnderRules(tm, slotKey, "zone", eligibilityRules)) {
      return false;
    }
  }

  const isAMOverlapAssigned = !!(tm.isAMOverlap || tm.isAMOverlapTonight);
  const isPMOverlapAssigned = !!(tm.isPMOverlap || tm.isPMOverlapTonight);
  const isFullGraveBySchedule = !!(tm.isFullGrave || tm.isFullGraveTonight);

  // `gravePool` on tm_profiles is a string enum, NOT a boolean. Common
  // values include "AM", "PM", "Full" (and truthy fallbacks). A TM whose
  // gravePool is "AM" or "PM" is an overlap-type grave employee — they
  // cover a partial shift and cannot hold a full-zone slot, regardless of
  // whether they happen to be assigned to an OL-AM/PM slot tonight.
  const gravePoolKind = String(tm.gravePool ?? "").toUpperCase();
  const isOverlapByPool = gravePoolKind === "AM" || gravePoolKind === "PM";
  const isGrave =
    !!tm.gravePool || isFullGraveBySchedule || isAMOverlapAssigned || isPMOverlapAssigned;
  const isFullGrave =
    isFullGraveBySchedule ||
    (isGrave && !isOverlapByPool && !isAMOverlapAssigned && !isPMOverlapAssigned);

  // Main Zone Deployment + Z9 Smoking Room — strict full-grave only
  if (slotKey.startsWith("Z")) {
    return isFullGrave;
  }

  // Overlap Tab AM — accept TMs flagged as AM by either signal
  if (slotKey.startsWith("OL-AM") || slotKey.includes("AM-Overlap")) {
    return isGrave && (isAMOverlapAssigned || gravePoolKind === "AM");
  }

  // Overlap Tab PM — accept TMs flagged as PM by either signal
  if (slotKey.startsWith("OL-PM") || slotKey.includes("PM-Overlap")) {
    return isGrave && (isPMOverlapAssigned || gravePoolKind === "PM");
  }

  // Men's Restrooms — full-night grave shift, male TMs only
  if (slotKey.startsWith("MRR")) {
    if (!isGrave) return false;
    if (isOverlapByPool || isAMOverlapAssigned || isPMOverlapAssigned) return false;
    const g = normalizeGender(tm.gender);
    if (g === 'F') return false;
    return true;
  }

  // Women's Restrooms — full-night grave shift, female TMs only
  if (slotKey.startsWith("WRR")) {
    if (!isGrave) return false;
    if (isOverlapByPool || isAMOverlapAssigned || isPMOverlapAssigned) return false;
    const g = normalizeGender(tm.gender);
    if (g === 'M') return false;
    return true;
  }

  // Admin, Trash, Support, AUX — full-night positions, no gender restriction.
  // AM/PM overlap TMs work partial shifts (10pm–3am or 3am–7am) and cannot
  // hold a full-night restroom or admin slot. Only full-grave TMs (or non-grave
  // active TMs on the roster) are eligible here.
  if (
    slotKey === "ADM" ||
    slotKey.startsWith("TR") ||
    slotKey.startsWith("AUX") ||
    slotKey.startsWith("SP")
  ) {
    // Exclude AM/PM overlap TMs — they cannot cover a full-night position
    if (isOverlapByPool || isAMOverlapAssigned || isPMOverlapAssigned) return false;
    return true;
  }

  return true;
}

// ========================================================
// PROMPT / GROK SUPPORT (Authoritative Rules as Text)
// ========================================================

/**
 * Returns the exact PLACEMENT_ORDER as a human-readable string
 * suitable for injection into LLM system prompts.
 */
/**
 * Re-export for prompts and guards — single xAI constitution block.
 */
export {
  getXaiFillOrderHardRules,
  getXaiSwapHardRules,
  assignViolatesFillOrder,
  swapViolatesFillOrder,
  swapViolatesOccupancy,
  swapViolatesCrossTierFamily,
  areSwapLanePeers,
  slotSwapFamily,
  textSuggestsCrossTierMove,
  sanitizePlacementPadInsight,
  formatFillOrderBoardContext,
} from "./xaiFillOrderContract";

export function getPlacementOrderText(): string {
  return `AUTHORITATIVE PLACEMENT / FILL ORDER (strict, non-negotiable unless impossible due to hard constraints):

1. Men's Restrooms (male TMs only): MRR1 → MRR7 → MRR8 → MRR10 → MRR6
2. Women's Restrooms (female TMs only): WRR1 → WRR7 → WRR8 → WRR10 → WRR6
3. Zones: Z9 → Z3 → Z4 → Z5 → Z7 → Z8 → Z10 → Z2 → Z1 → Z6
4. Auxiliary: Admin (ADM) → Zone 9 Smoking Room (Z9SR)

Then, if present in the layout: Trash (TR1, TR2), Support (SP1, SP2), and any operator-added AUX after those.

Notes:
- Men's restrooms fill completely before women's restrooms.
- Z1 and Z2 are regular zones near the end of the zone order (Z2 before Z1); Z6 is the lowest-priority zone.
- Admin fills AFTER all 10 zones. On a short roster, a zone fills before Admin.

HARD UNIQUE-TM LIMIT (non-negotiable physical reality):
- All 10 Restrooms require 5 male + 5 female = **10 distinct TMs**.
- All 10 Zones require **10 more distinct full-grave TMs**.
- Admin + Z9SR require more beyond that.

You cannot reuse the same people. If the roster is short, lower-priority slots (Z6, then Admin, then Z9SR) are left open first.

The engine and the AI MUST fill slots in exactly this order. Never fill a lower-priority slot while a higher-priority one is fillable. Clearly call out impossibility when headcount is insufficient.`;
}

/**
 * Returns a precise, copy-pasteable description of the eligibility rules
 * for injection into LLM system prompts. This is the single source of truth.
 */
export function getEligibilityRulesText(): string {
  return `STRICT ELIGIBILITY RULES (Grok and all engines MUST obey):

- Main Zone Deployment slots (any slotKey starting with "Z", INCLUDING the fixed Z9SR) require a FULL-GRAVE team member. A TM is full-grave when ALL of the following hold: (a) gravePool is truthy, (b) gravePool is NOT the string "AM" or "PM" (those values mark the TM as an overlap-type employee, e.g. "Full" vs "AM" vs "PM"), AND (c) the per-night isAMOverlap and isPMOverlap flags are both false. Overlap TMs cover partial shifts (10pm–3am or 3am–7am) and cannot hold a zone for the full 11pm–7am window.
- AM Overlap slots (slotKeys starting with "OL-AM" or containing "AM-Overlap") require gravePool AND isAMOverlap.
- PM Overlap slots (slotKeys starting with "OL-PM" or containing "PM-Overlap") require gravePool AND isPMOverlap.
- Restrooms (MRR*/WRR*), ADM, Trash (TR*), and all Support/Overflow/AUX slots are full-night positions. Full-grave TMs are eligible. AM/PM overlap TMs (gravePool = "AM" or "PM", or isAMOverlap/isPMOverlap = true) are NOT eligible — they work partial shifts and cannot cover a full-night RR or Admin assignment. Non-grave active TMs are eligible for these slots.
- Breaks / break groups are IGNORED for all placement and suggestion decisions.
- Locked slots must be respected (do not suggest changes to locked assignments unless explicitly asked to propose unlocks).
- Always prefer minimal disruption and respect the current draft or live board state when provided.

These rules are non-negotiable. Any suggestion that would violate them must be rejected by the server guard before being shown to the operator.`;
}

// =====================================================================
// ENGINE TELEMETRY & DIAGNOSTICS (added 2026-05-30)
// =====================================================================

export interface EngineRunTelemetry {
  mode: 'interactive-draft' | 'batch-night' | 'batch-week';
  dayName?: string;
  nightDate?: string;
  durationMs?: number;
  rosterSize: number;
  slotsProcessed: number;
  preservedSlots: number;
  filledSlots: number;
  unfilledSlots: number;
  usedGrok: boolean;
  grokPicksApplied: number;
  matrixPreloaded: boolean;
  warnings: string[];
  topUnfilledSlots: string[];
  /** The placement method that was active for this run (from engine_config) */
  placementMethod?: "greedy" | "weighted" | "grok-hybrid";
}

/**
 * Structured logging for every engine run (interactive + batch).
 * Call this after runWeightedPlanner + any Grok merge step.
 *
 * This gives operators and future agents much better visibility than
 * the scattered console.warns that existed before.
 */
export function logEngineRunSummary(telemetry: EngineRunTelemetry) {
  const {
    mode,
    dayName,
    nightDate,
    durationMs,
    rosterSize,
    slotsProcessed,
    preservedSlots,
    filledSlots,
    unfilledSlots,
    usedGrok,
    grokPicksApplied,
    matrixPreloaded,
    warnings,
    topUnfilledSlots,
    placementMethod,
  } = telemetry;

  const methodLabel = placementMethod ? `method=${placementMethod}` : '';
  const label = `[EngineRun:${mode}] ${dayName || ''} ${nightDate || ''}`.trim();

  console.groupCollapsed(
    `%c${label}  |  ${methodLabel}  filled=${filledSlots}  unfilled=${unfilledSlots}  preserved=${preservedSlots}  grok=${usedGrok ? grokPicksApplied : 'off'}  matrix=${matrixPreloaded ? 'preloaded' : 'missing'}`,
    'color:#64748b;font-size:11px'
  );

  if (durationMs) {
    console.log(`Duration: ${durationMs}ms`);
  }
  console.log(`Roster size: ${rosterSize}  |  Slots in order: ${slotsProcessed}`);

  if (unfilledSlots > 0) {
    console.warn(`Unfilled slots: ${topUnfilledSlots.join(', ')}${unfilledSlots > topUnfilledSlots.length ? ` (+${unfilledSlots - topUnfilledSlots.length} more)` : ''}`);
  }

  if (warnings.length > 0) {
    console.warn('Warnings:', warnings);
  }

  console.groupEnd();
}
