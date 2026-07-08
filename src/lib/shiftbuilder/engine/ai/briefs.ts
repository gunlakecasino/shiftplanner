/**
 * engine/ai/briefs.ts — the ONE AI context pack (P4-2).
 *
 * Every number in the brief comes from the same primitives the scorecard uses
 * (health model, objective), so the AI reasons against — and is asked to beat —
 * the exact figures the operator sees. The AI improves WHO fills a slot, never
 * which slots fill first.
 *
 * In the client run path the AI has no live tools, so the brief must carry
 * everything it needs to reason about rotation: each placed TM's recent trail,
 * this-week repeats, 30-night spread, and the fresher alternatives available for
 * each slot. That richness is what turns "propose overrides" into genuinely
 * better rotation.
 */

import type { NightContext, NightRunResult } from "../types";
import { getPlacementOrderText, getEligibilityRulesText } from "../../placement";
import { feasibilityNote } from "../feasibility";
import { rotationHealthPoints } from "../health/model";
import {
  dossierBriefLine,
  policiesBriefBlock,
  chemistryWarnings,
} from "../../opsKnowledge/apply";
import { feedbackBriefBlock, type AiFeedbackExample } from "../../opsKnowledge/feedback";

export const AI_SYSTEM_PROMPT = [
  "You are the rotation-fairness judgment layer of a grave-shift placement engine.",
  "A deterministic optimizer has already produced a legal, coverage-first draft; coverage and the fill order are already correct.",
  "YOUR PRIMARY GOAL: improve rotation fairness — move team members OFF areas they've worked recently (critical repeats, high 30-night spread, this-week repeats) and ONTO areas that are fresh for them, so the whole board spreads people evenly over time.",
  "You do this ONLY by proposing slot-level overrides (place a specific TM on a specific slot).",
  "A single override that displaces someone is fine; to swap two TMs, propose BOTH overrides so coverage is preserved.",
  "HARD RULES (never violate): full-grave eligibility, restroom gender (MRR=male, WRR=female), one TM per night, locked slots, the fill order, HARD accommodations, HARD chemistry (keep-apart), and HARD supervisor policies. Every override is re-validated by a guard; anything illegal or coverage-reducing is dropped — so only propose genuine, legal improvements.",
  "Think like an Ops Supervisor, not just a rotation solver: weigh each TM's capability for the slot, their accommodations and reliability, development goals, chemistry, and the supervisor's policies — the SUPERVISOR: notes on each placement and the POLICIES/CHEMISTRY sections carry that judgment.",
  "Prefer the smallest set of high-impact overrides. If the board is already well-placed, return an empty overrides array.",
  "In each rationale, name the concrete reason (rotation freshness, capability fit, honoring a limit, a policy, or chemistry).",
].join(" ");

export function buildNightBrief(
  ctx: NightContext,
  result: NightRunResult,
  feedback: AiFeedbackExample[] = [],
): string {
  const lines: string[] = [];
  lines.push("=== FILL ORDER (already satisfied — do not reorder) ===");
  lines.push(getPlacementOrderText());
  lines.push("");
  lines.push("=== ELIGIBILITY (non-negotiable) ===");
  lines.push(getEligibilityRulesText());
  lines.push("");

  // Few-shot: how the supervisor has judged the AI's past calls. This is the
  // learned voice — mimic the endorsed patterns, avoid the rejected ones.
  const fbLines = feedbackBriefBlock(feedback);
  if (fbLines.length) {
    lines.push("=== LEARNED FROM THE SUPERVISOR (few-shot — weigh heavily) ===");
    lines.push(...fbLines);
    lines.push("");
  }
  lines.push("=== FEASIBILITY ===");
  lines.push(feasibilityNote(ctx));
  lines.push("");

  // Supervisor policies (rules-of-thumb). Honor HARD ones like constraints.
  const policyLines = policiesBriefBlock(ctx.knowledge);
  if (policyLines.length) {
    lines.push("=== SUPERVISOR POLICIES (rules-of-thumb — honor HARD like constraints) ===");
    lines.push(...policyLines);
    lines.push("");
  }

  // Board of the current placements enriched with rotation facts so the AI can
  // see WHY each health number is what it is.
  const board: Record<string, { tmId?: string; tmName?: string }> = {};
  for (const [k, p] of Object.entries(result.draft)) board[k] = { tmId: p.tmId, tmName: p.tmName };

  lines.push("=== CURRENT PLACEMENTS WITH ROTATION FACTS ===");
  lines.push("(slot: TM (id) · health · last-30 count in this area · this-week repeats · recent trail · flag)");
  for (const slot of ctx.slots) {
    if (!slot.isRotationTracked) continue;
    const p = result.draft[slot.key];
    if (!p) {
      lines.push(`${slot.key}: OPEN`);
      continue;
    }
    const score = rotationHealthPoints({
      tmId: p.tmId, tmName: p.tmName, slotKey: slot.key, nightIso: ctx.nightIso,
      histories: ctx.histories, weeklyRecentHistory: ctx.weeklyRecentHistory,
      members: ctx.members, auxDefs: ctx.auxDefs, assignments: board,
    });
    const f = score.facts;
    const trail = trailFor(ctx, p.tmId, slot.key);
    const flag = score.isCritical ? " ⚠CRITICAL-REPEAT" : f.timesInSpread >= 2 || f.weekRepeat >= 2 ? " ⚠repeat" : "";
    const dossier = dossierBriefLine(ctx.knowledge, p.tmId, slot.key);
    lines.push(
      `${slot.key}: ${p.tmName} (${p.tmId}) · ${Math.round(score.points)}pt · ${f.timesInSpread}×last30 · wk×${f.weekRepeat}${trail}${flag}${dossier}`,
    );
  }
  lines.push("");

  // Chemistry — keep-apart pairs on tonight, keep-together pairs split up.
  const placedIds = new Set(Object.values(result.draft).map((p) => p.tmId));
  const chem = chemistryWarnings(ctx.knowledge, placedIds, (id) => ctx.rosterById.get(id)?.name ?? id);
  if (chem.length) {
    lines.push("=== CHEMISTRY (resolve HARD ones; weigh soft ones) ===");
    for (const c of chem) lines.push(`[${c.strength.toUpperCase()}] ${c.text}`);
    lines.push("");
  }

  lines.push("=== FRESHER ALTERNATIVES PER SLOT (eligible candidates: id · rotation-health) ===");
  lines.push("(Higher health = fresher for that TM. Use these to swap a repeat onto a fresher slot.)");
  for (const slot of ctx.slots) {
    if (!slot.isRotationTracked) continue;
    const ranking = result.breakdown[slot.key];
    if (!ranking || ranking.topCandidates.length <= 1) continue;
    const current = result.draft[slot.key]?.tmId;
    const alts = ranking.topCandidates
      .filter((c) => c.tmId !== current && !c.excluded)
      .slice(0, 4)
      .map((c) => `${c.tmId}(${Math.round(c.healthPoints)}pt${c.isCritical ? "⚠" : ""})`)
      .join(", ");
    if (alts) lines.push(`${slot.key}: ${alts}`);
  }
  lines.push("");

  lines.push("=== SCORECARD (beat this; coverage must NOT drop) ===");
  lines.push(
    `coverage=${result.scorecard.coverage} rotationHealthTotal=${Math.round(result.scorecard.healthTotal)} pref=${result.scorecard.prefTotal.toFixed(1)} skill=${result.scorecard.skillTotal.toFixed(1)}`,
  );
  lines.push("");
  lines.push(
    "TASK: scan the placements above for ⚠ flags and low health. For each, is there an eligible alternative (or a same-tier swap partner) who is fresher on that slot AND doesn't create a worse repeat elsewhere? Propose those overrides (both sides of a swap). Empty array if the board is already well-rotated.",
  );
  return lines.join("\n");
}

/** Compact recent-trail string for a TM (last few areas), for the brief. */
function trailFor(ctx: NightContext, tmId: string, slotKey: string): string {
  const history = ctx.histories[tmId];
  if (!history?.zoneDates) return "";
  const events: Array<{ ui: string; d: string }> = [];
  for (const [ui, ds] of Object.entries(history.zoneDates)) {
    for (const d of ds || []) {
      if (d >= ctx.nightIso) continue;
      events.push({ ui, d });
    }
  }
  events.sort((a, b) => b.d.localeCompare(a.d));
  const recent = events.slice(0, 3).map((e) => e.ui);
  return recent.length ? ` · trail:[${recent.join(",")}]` : "";
}
