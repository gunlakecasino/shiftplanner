/**
 * engine/guard.ts — the ONE draft validator (P1-5, principle N4).
 *
 * Same function guards the planner seed, the optimizer output, the AI overrides,
 * and the Apply pre-check. Hard violations (non-negotiable, N2) make a draft
 * invalid regardless of its totals:
 *   - a placement that fails the eligibility gate
 *   - the same TM in two slots one night
 *   - a locked slot whose TM changed or went missing
 *   - an optional Z1/Z2 auto-filled by a non-manual stage
 * Plus, when a `baseline` draft is supplied (the AI/optimizer input), coverage
 * may not regress — the AI can never trade a filled required slot for a
 * rotation gain (N4/D6).
 *
 * Fill-order anomalies are returned as `warnings`, not hard violations: leaving
 * a higher-priority slot open while a lower one is filled is legitimately forced
 * when the higher slot is unfillable (e.g. no eligible female for a WRR). The
 * planner enforces fill order structurally by walking PLACEMENT_ORDER; the guard
 * only surfaces avoidable-looking cases for review.
 */

import type { Draft, NightContext } from "./types";
import { canPlace } from "./eligibility";
import { assignViolatesFillOrder } from "../xaiFillOrderContract";

export interface DraftValidation {
  ok: boolean;
  hardViolations: string[];
  warnings: string[];
  perSlot: Record<string, { ok: boolean; reason?: string }>;
}

export interface ValidateOptions {
  /** Coverage may not drop below this draft's coverage (AI/optimizer input). */
  baseline?: Draft;
}

function coverageOf(draft: Draft, ctx: NightContext): number {
  let n = 0;
  for (const slotKey of Object.keys(draft)) {
    const slot = ctx.slotByKey.get(slotKey);
    if (slot && !slot.isOptional) n += 1;
  }
  return n;
}

export function validateDraft(
  draft: Draft,
  ctx: NightContext,
  opts: ValidateOptions = {},
): DraftValidation {
  const hardViolations: string[] = [];
  const warnings: string[] = [];
  const perSlot: Record<string, { ok: boolean; reason?: string }> = {};

  // 1. Eligibility per placement + double-book detection.
  const seenTm = new Map<string, string>(); // tmId -> slotKey
  for (const [slotKey, placement] of Object.entries(draft)) {
    const slot = ctx.slotByKey.get(slotKey);
    if (!slot) {
      perSlot[slotKey] = { ok: false, reason: "Unknown slot" };
      hardViolations.push(`Unknown slot ${slotKey}`);
      continue;
    }
    const tm = ctx.rosterById.get(placement.tmId);
    const verdict = tm
      ? canPlace(tm, slotKey, {
          eligibilityRules: ctx.eligibilityRules,
          scheduledTmIds: ctx.scheduledTmIds,
          knowledge: ctx.knowledge,
        })
      : { ok: false, reason: "TM not in roster" };
    perSlot[slotKey] = verdict;
    if (!verdict.ok) {
      hardViolations.push(`${slotKey}: ${placement.tmName} — ${verdict.reason}`);
    }

    const prev = seenTm.get(placement.tmId);
    if (prev) {
      hardViolations.push(
        `${placement.tmName} double-booked: ${prev} and ${slotKey}`,
      );
    } else {
      seenTm.set(placement.tmId, slotKey);
    }
  }

  // 2. Locked slots unchanged.
  for (const [slotKey, row] of Object.entries(ctx.assignments)) {
    const locked = !!(row.isLocked || row.is_locked);
    if (!locked || !row.tmId) continue;
    const placed = draft[slotKey];
    if (!placed) {
      hardViolations.push(`Locked slot ${slotKey} was left unfilled`);
    } else if (placed.tmId !== row.tmId) {
      hardViolations.push(
        `Locked slot ${slotKey} changed from ${row.tmId} to ${placed.tmId}`,
      );
    }
  }

  // 3. Optional main-entry zones (Z1/Z2) may now be filled by the engine as
  //    overflow (operator direction 2026-07-02) — no longer manual-only. They
  //    still don't count toward the coverage tier (scorecardFor ignores them),
  //    so filling them is pure bonus deployment, never a coverage claim.

  // 4. Fill-order anomalies (advisory).
  const board: Record<string, { tmId?: string | null }> = {};
  for (const [k, p] of Object.entries(draft)) board[k] = { tmId: p.tmId };
  for (const slotKey of Object.keys(draft)) {
    const v = assignViolatesFillOrder(slotKey, board);
    if (v.violates && v.reason) warnings.push(v.reason);
  }

  // 5. Coverage no-worse than baseline.
  if (opts.baseline) {
    const base = coverageOf(opts.baseline, ctx);
    const cur = coverageOf(draft, ctx);
    if (cur < base) {
      hardViolations.push(
        `Coverage regressed: ${cur} filled vs baseline ${base}`,
      );
    }
  }

  return { ok: hardViolations.length === 0, hardViolations, warnings, perSlot };
}
