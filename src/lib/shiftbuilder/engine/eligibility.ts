/**
 * engine/eligibility.ts — the ONE hard eligibility gate (P1-2, principle N2/N3).
 *
 * Every engine stage (planner, optimizer, health preview, guard, AI tools) asks
 * `canPlace()` and nothing else. It composes, in order:
 *   1. core liturgy   — gender / grave-pool / overlap-band rules (isEligibleForSlot)
 *   2. operator rules  — engine_eligibility_rules (isEligibleUnderRules), when loaded
 *   3. schedule gate   — graves_default_schedule membership, when enabled
 *
 * The pass/fail verdict itself comes from the existing, battle-tested
 * `isEligibleForSlot` so there is exactly one implementation of the rules
 * (N3). This module adds the *first failing reason* on top for explainability
 * (N6) — reason derivation mirrors the gate's own branch order.
 *
 * Import direction is one-way (engine → placement); placement.ts must never
 * import this file, or the two form a cycle.
 */

import {
  isEligibleForSlot,
  normalizeGender,
  isOptionalDeploymentSlot,
} from "../placement";
import { isEligibleUnderRules } from "../engineOverrides";
import type { EligibilityRule } from "../engineConfig";
import type { TmModel, NightContext, SlotModel } from "./types";
import type { OpsKnowledge } from "../opsKnowledge/types";
import { accommodationBlocks } from "../opsKnowledge/apply";

export interface EligibilityVerdict {
  ok: boolean;
  /** First failing rule's human-readable reason. Undefined when ok. */
  reason?: string;
}

/** TM shape the core liturgy understands (a subset of TmModel + raw rows). */
export interface EligibilityTm {
  id?: string;
  tmId?: string;
  tm_id?: string;
  gender?: string | null;
  gravePool?: string | null;
  grave_pool?: string | null;
  isAMOverlap?: boolean;
  is_am_overlap?: boolean;
  isPMOverlap?: boolean;
  is_pm_overlap?: boolean;
  weeksInRole?: number;
}

export interface CanPlaceOptions {
  eligibilityRules?: EligibilityRule[];
  /** When non-empty, TM must be a member to be placeable. */
  scheduledTmIds?: Set<string>;
  /** Slot type hint for operator rules ("zone" | "rr" | "aux" | "overlap"). */
  slotType?: string;
  /** Supervisor Brain — hard accommodations become blocks. */
  knowledge?: OpsKnowledge;
}

function normalizeForGate(tm: EligibilityTm): Record<string, unknown> {
  return {
    id: tm.id,
    tmId: tm.tmId,
    tm_id: tm.tm_id,
    gender: tm.gender,
    gravePool: tm.gravePool ?? tm.grave_pool,
    isAMOverlap: tm.isAMOverlap ?? tm.is_am_overlap,
    isPMOverlap: tm.isPMOverlap ?? tm.is_pm_overlap,
    weeksInRole: tm.weeksInRole,
  };
}

/** Derive a human reason when the core liturgy rejects — mirrors its branches. */
function deriveLiturgyReason(gate: Record<string, unknown>, slotKey: string): string {
  const isAM = !!gate.isAMOverlap;
  const isPM = !!gate.isPMOverlap;
  const poolKind = String(gate.gravePool ?? "").toUpperCase();
  const isOverlapByPool = poolKind === "AM" || poolKind === "PM";
  const g = normalizeGender(gate.gender);

  if (slotKey.startsWith("Z")) {
    return "Zone requires a full-grave TM (overlap-band or non-grave excluded)";
  }
  if (slotKey.startsWith("OL-AM") || slotKey.includes("AM-Overlap")) {
    return "AM overlap slot requires an AM-flagged grave TM";
  }
  if (slotKey.startsWith("OL-PM") || slotKey.includes("PM-Overlap")) {
    return "PM overlap slot requires a PM-flagged grave TM";
  }
  if (slotKey.startsWith("MRR")) {
    if (g === "F") return "Men's restroom requires a male TM";
    return "Men's restroom requires a full-night grave TM (overlap excluded)";
  }
  if (slotKey.startsWith("WRR")) {
    if (g === "M") return "Women's restroom requires a female TM";
    return "Women's restroom requires a full-night grave TM (overlap excluded)";
  }
  if (isOverlapByPool || isAM || isPM) {
    return "Full-night position — AM/PM overlap TMs work partial shifts";
  }
  return "Not eligible for this slot under core rules";
}

/**
 * The single hard gate. Returns `{ ok, reason? }`.
 *
 * `slotKey` (string) is accepted directly so non-context callers (drag halos,
 * fit chips) can use it without building a NightContext.
 */
export function canPlace(
  tm: EligibilityTm,
  slotKey: string,
  opts: CanPlaceOptions = {},
): EligibilityVerdict {
  const { eligibilityRules = [], scheduledTmIds, slotType = "zone", knowledge } = opts;
  const gate = normalizeForGate(tm);

  // 1. Core liturgy (single source of pass/fail — no rules threaded here so the
  //    reason branch below can distinguish liturgy failures from operator ones).
  if (!isEligibleForSlot(gate, slotKey)) {
    return { ok: false, reason: deriveLiturgyReason(gate, slotKey) };
  }

  // 1b. Hard accommodations from the Supervisor Brain (safety-critical limits).
  if (knowledge) {
    const tmId = (tm.tm_id || tm.tmId || tm.id || "").trim();
    const acc = accommodationBlocks(knowledge, tmId, slotKey);
    if (acc.blocked) return { ok: false, reason: acc.reason };
  }

  // 2. Operator rules (engine_eligibility_rules) — the F1 fix. These were
  //    silently ignored on every live path before the unified gate existed.
  if (eligibilityRules.length > 0) {
    if (!isEligibleUnderRules(gate as any, slotKey, slotType, eligibilityRules)) {
      return { ok: false, reason: "Blocked by an operator eligibility rule" };
    }
  }

  // 3. Schedule gate — graves_default_schedule is the sole root source of truth
  //    for who is working tonight, when loaded.
  if (scheduledTmIds && scheduledTmIds.size > 0) {
    const id = (tm.tm_id || tm.tmId || tm.id || "").trim();
    if (!scheduledTmIds.has(id)) {
      return { ok: false, reason: "Not on tonight's grave schedule" };
    }
  }

  return { ok: true };
}

/** Context-bound convenience — pulls rules + schedule gate + slot type from ctx. */
export function canPlaceInContext(
  tm: TmModel,
  slot: SlotModel,
  ctx: NightContext,
): EligibilityVerdict {
  return canPlace(tm, slot.key, {
    eligibilityRules: ctx.eligibilityRules,
    scheduledTmIds: ctx.scheduledTmIds,
    slotType: slotTypeForKey(slot.key),
    knowledge: ctx.knowledge,
  });
}

/** Coarse slot type used by operator rule filters. */
export function slotTypeForKey(slotKey: string): string {
  if (slotKey.startsWith("MRR") || slotKey.startsWith("WRR")) return "rr";
  if (slotKey.startsWith("OL-")) return "overlap";
  if (slotKey.startsWith("Z")) return "zone";
  if (isOptionalDeploymentSlot(slotKey)) return "zone";
  return "aux";
}
