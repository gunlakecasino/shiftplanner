/**
 * engine/shadow.ts — the shadow-mode comparison harness (P6-1 core).
 *
 * During the shadow period the unified pipeline runs alongside the legacy
 * planner (non-blocking, no writes) and both drafts are scored on the SAME
 * scorecard so we can prove, on real boards, that unified ≥ legacy before
 * flipping the `unified_pipeline` flag. This module is the pure comparison
 * core — it takes both drafts and a context and returns a side-by-side report
 * for the "Engine Lab" panel and the engine_run_log. Wiring it to live engine
 * runs is a thin surface change (deferred with the rest of the UI wiring); the
 * judgment it encodes is here and tested.
 */

import type { Draft, NightContext, Scorecard, SlotPlacement } from "./types";
import { scorecardFor, compareScorecards } from "./objective";
import { validateDraft } from "./guard";

/** Build a minimal Draft from a legacy slotKey→tmId map for scoring. */
export function draftFromTmMap(
  map: Record<string, string>,
  ctx: NightContext,
  stage: SlotPlacement["provenance"]["stage"] = "planner",
): Draft {
  const out: Draft = {};
  for (const [slotKey, tmId] of Object.entries(map)) {
    if (!tmId) continue;
    const tm = ctx.rosterById.get(tmId);
    out[slotKey] = {
      tmId,
      tmName: tm?.name ?? tmId,
      provenance: {
        stage,
        reason: "legacy planner",
        scorecard: { eligible: true, healthPoints: 0, isCritical: false, prefScore: 0, skillScore: 0 },
      },
    };
  }
  return out;
}

export interface SlotDiff {
  slotKey: string;
  legacyTmId: string | null;
  unifiedTmId: string | null;
}

export interface EngineComparison {
  legacy: Scorecard;
  unified: Scorecard;
  coverageDelta: number;
  healthDelta: number;
  prefDelta: number;
  skillDelta: number;
  winner: "unified" | "legacy" | "tie";
  legacyValid: boolean;
  unifiedValid: boolean;
  slotDiffs: SlotDiff[];
  summary: string;
}

/**
 * Compare a legacy draft (slotKey→tmId) against a unified draft on one context.
 * `unifiedShouldWin` (unified ≥ legacy) is the shadow-period acceptance signal.
 */
export function compareEngineDrafts(
  legacyMap: Record<string, string>,
  unifiedDraft: Draft,
  ctx: NightContext,
): EngineComparison {
  const legacyDraft = draftFromTmMap(legacyMap, ctx);
  const legacy = scorecardFor(legacyDraft, ctx);
  const unified = scorecardFor(unifiedDraft, ctx);

  const cmp = compareScorecards(unified, legacy);
  const winner = cmp > 0 ? "unified" : cmp < 0 ? "legacy" : "tie";

  const slotDiffs: SlotDiff[] = [];
  const keys = new Set([...Object.keys(legacyMap), ...Object.keys(unifiedDraft)]);
  for (const slotKey of keys) {
    const legacyTmId = legacyMap[slotKey] || null;
    const unifiedTmId = unifiedDraft[slotKey]?.tmId ?? null;
    if (legacyTmId !== unifiedTmId) slotDiffs.push({ slotKey, legacyTmId, unifiedTmId });
  }

  const legacyValid = validateDraft(legacyDraft, ctx).ok;
  const unifiedValid = validateDraft(unifiedDraft, ctx).ok;

  return {
    legacy,
    unified,
    coverageDelta: unified.coverage - legacy.coverage,
    healthDelta: Math.round((unified.healthTotal - legacy.healthTotal) * 10) / 10,
    prefDelta: Math.round((unified.prefTotal - legacy.prefTotal) * 10) / 10,
    skillDelta: Math.round((unified.skillTotal - legacy.skillTotal) * 10) / 10,
    winner,
    legacyValid,
    unifiedValid,
    slotDiffs,
    summary:
      `Unified ${winner === "unified" ? "wins" : winner === "legacy" ? "trails" : "ties"}: ` +
      `coverage ${fmt(unified.coverage - legacy.coverage)}, health ${fmt(unified.healthTotal - legacy.healthTotal)}, ` +
      `${slotDiffs.length} slot diff${slotDiffs.length === 1 ? "" : "s"}` +
      `${legacyValid ? "" : " · legacy INVALID"}${unifiedValid ? "" : " · unified INVALID"}`,
  };
}

function fmt(n: number): string {
  const r = Math.round(n * 10) / 10;
  return r > 0 ? `+${r}` : `${r}`;
}
