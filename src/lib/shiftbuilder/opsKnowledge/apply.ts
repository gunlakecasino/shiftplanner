/**
 * opsKnowledge/apply.ts — pure functions that turn Supervisor Brain knowledge
 * into engine behavior: hard accommodations become eligibility blocks, and every
 * dimension becomes brief context the AI reasons with. No I/O — fully testable.
 */

import type { OpsKnowledge, TmDossier } from "./types";

/**
 * Does a HARD accommodation forbid this TM on this slot? Soft accommodations are
 * advisory (they surface in the brief, not the guard). Matches by explicit slot
 * key or by the slot's zone-profile tags.
 */
export function accommodationBlocks(
  knowledge: OpsKnowledge | undefined,
  tmId: string,
  slotKey: string,
): { blocked: boolean; reason?: string } {
  const dossier = knowledge?.dossiers[tmId];
  if (!dossier) return { blocked: false };
  const slotTags = knowledge?.zoneProfiles[slotKey]?.tags ?? [];
  for (const acc of dossier.accommodations) {
    if (acc.severity !== "hard") continue;
    const bySlot = acc.blockedSlotKeys?.includes(slotKey);
    const byTag = acc.blockedTags?.some((t) => slotTags.includes(t));
    if (bySlot || byTag) {
      return { blocked: true, reason: `Accommodation: ${acc.label}` };
    }
  }
  return { blocked: false };
}

/** Capability level a TM has for a slot/area (checks exact slot then area labels). */
export function capabilityFor(
  dossier: TmDossier | undefined,
  slotKey: string,
): { level: number; note?: string } | null {
  if (!dossier) return null;
  const exact = dossier.capabilities.find((c) => c.area === slotKey);
  if (exact) return { level: exact.level, note: exact.note };
  // Area-family fallback (e.g. restrooms).
  const area = slotKey.startsWith("MRR") || slotKey.startsWith("WRR") ? "restrooms" : null;
  if (area) {
    const fam = dossier.capabilities.find((c) => c.area.toLowerCase() === area);
    if (fam) return { level: fam.level, note: fam.note };
  }
  return null;
}

/** One-line supervisor context for a placed TM on a slot (empty if nothing known). */
export function dossierBriefLine(
  knowledge: OpsKnowledge | undefined,
  tmId: string,
  slotKey: string,
): string {
  const d = knowledge?.dossiers[tmId];
  if (!d) return "";
  const parts: string[] = [];
  const cap = capabilityFor(d, slotKey);
  if (cap) parts.push(`capability here ${cap.level}/5${cap.note ? ` (${cap.note})` : ""}`);
  if (d.reliability) parts.push(`reliability ${d.reliability}/5`);
  if (d.trainingStatus) parts.push(d.trainingStatus);
  const softAcc = d.accommodations.filter((a) => a.severity === "soft").map((a) => a.label);
  const hardAcc = d.accommodations.filter((a) => a.severity === "hard").map((a) => a.label);
  if (hardAcc.length) parts.push(`HARD limits: ${hardAcc.join(", ")}`);
  if (softAcc.length) parts.push(`soft limits: ${softAcc.join(", ")}`);
  if (d.developmentGoals?.length) parts.push(`developing: ${d.developmentGoals.join(", ")}`);
  if (d.notes) parts.push(`note: ${d.notes}`);
  return parts.length ? ` · SUPERVISOR: ${parts.join(" · ")}` : "";
}

/** Active policies as brief lines, hard first. */
export function policiesBriefBlock(knowledge: OpsKnowledge | undefined): string[] {
  const active = (knowledge?.policies ?? []).filter((p) => p.active);
  if (active.length === 0) return [];
  const sorted = [...active].sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "hard" ? -1 : 1));
  return sorted.map((p) => `[${p.strength.toUpperCase()}] ${p.text}`);
}

/**
 * Chemistry issues for a proposed board: keep-apart pairs both placed tonight,
 * and keep-together pairs where only one is placed. `placedTmIds` = tmIds on the board.
 */
export function chemistryWarnings(
  knowledge: OpsKnowledge | undefined,
  placedTmIds: Set<string>,
  nameOf: (id: string) => string,
): Array<{ text: string; strength: "hard" | "soft" }> {
  const out: Array<{ text: string; strength: "hard" | "soft" }> = [];
  for (const link of knowledge?.chemistry ?? []) {
    const aIn = placedTmIds.has(link.aTmId);
    const bIn = placedTmIds.has(link.bTmId);
    if (link.kind === "keep_apart" && aIn && bIn) {
      out.push({
        strength: link.strength,
        text: `Keep apart: ${nameOf(link.aTmId)} + ${nameOf(link.bTmId)} both on tonight${link.reason ? ` (${link.reason})` : ""}`,
      });
    }
    if (link.kind === "keep_together" && aIn !== bIn) {
      out.push({
        strength: link.strength,
        text: `Keep together: ${nameOf(link.aTmId)} + ${nameOf(link.bTmId)} — only one is placed${link.reason ? ` (${link.reason})` : ""}`,
      });
    }
  }
  return out;
}
