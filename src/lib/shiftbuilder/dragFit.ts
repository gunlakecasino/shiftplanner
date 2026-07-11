"use client";

/**
 * dragFit — live "fit halo" verdicts for drop targets during a TM drag.
 *
 * While a TM (roster chip or assigned card) is being dragged, every deployment
 * slot gets a cheap, synchronous verdict so the operator can survey the whole
 * board *before* dropping — the preventive counterpart to the after-the-fact
 * PlacementFitChip:
 *
 *   - "blocked" — hard-ineligible (gender for RR, overlap pool vs full-grave, custom rules)
 *   - "poor"    — TM already held this exact slot 2+ other nights this week (repeat streak)
 *   - "ok"      — one other night in this slot this week
 *   - "great"   — no same-slot repeat this week
 *
 * This is deliberately a *subset* of the full multi-signal fit score: only
 * signals that are free to compute per-slot on drag start. The full score
 * still renders on the chip after the drop. Verdicts are advisory — drops on
 * "blocked" are still allowed and caught by the existing server-side guards.
 *
 * Rendering contract (see globals.css "Fit Halos"): tiers map to
 * `sb-dragfit-<tier>` classes that pair a ring color with a glyph badge
 * (✓ ~ ! ✕) so color is never the only channel.
 */

import { createContext, useContext } from "react";
// Liturgy only for cheap drag halos (no schedule/rules load on pointer-move).
// Full hard gate for Apply / mutations is `canPlace` (engine/eligibility).
import { isEligibleForSlot } from "./eligibilityCore";
import { placementRepeatKey } from "@/app/shiftbuilder/components/placementPadHelpers";

export type DragFitTier = "great" | "ok" | "poor" | "blocked";

export type DragFitSnapshot = {
  /** slotKey -> verdict for the TM currently being dragged. */
  map: Record<string, DragFitTier>;
  /** Display name of the dragged TM (for future hover reasons / a11y). */
  tmName?: string;
};

/** Null whenever no TM drag is in flight — consumers render nothing. */
export const DragFitContext = createContext<DragFitSnapshot | null>(null);

export function useDragFitTier(slotKey: string): DragFitTier | null {
  const snap = useContext(DragFitContext);
  return snap?.map[slotKey] ?? null;
}

export type DragFitProfile = {
  gender?: string | null;
  gravePool?: string | null;
  isAMOverlap?: boolean;
  isPMOverlap?: boolean;
} | null;

export function computeDragFitMap(args: {
  profile: DragFitProfile;
  tmId: string;
  slotKeys: string[];
  /** Slot the drag started from — excluded so the source card never halos itself. */
  fromSlot?: string | null;
  /** ISO date of the night being edited — tonight's own placement isn't a "repeat". */
  currentIso: string;
  weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;
}): Record<string, DragFitTier> {
  const { profile, tmId, slotKeys, fromSlot, currentIso, weeklyRecentHistory } = args;

  // F9 (2026-07-02): count repeats by area-merged key (MRR8/WRR8 → RR8), the
  // same key the engine's prior-3 gate, the week policy, and the fit chips use.
  // Keying by the raw slot let a TM with WRR8 ×2 this week show a "great" halo on
  // MRR8 — then get a critical-repeat chip after the drop, on the very surface
  // meant to prevent that drop.
  const repeatsByArea = new Map<string, number>();
  for (const entry of weeklyRecentHistory?.get(tmId) ?? []) {
    if (entry.nightDate === currentIso) continue;
    const area = placementRepeatKey(entry.slotKey);
    repeatsByArea.set(area, (repeatsByArea.get(area) ?? 0) + 1);
  }

  const out: Record<string, DragFitTier> = {};
  for (const slotKey of slotKeys) {
    if (fromSlot && slotKey === fromSlot) continue;
    if (profile && !isEligibleForSlot(profile, slotKey)) {
      out[slotKey] = "blocked";
      continue;
    }
    const repeats = repeatsByArea.get(placementRepeatKey(slotKey)) ?? 0;
    out[slotKey] = repeats >= 2 ? "poor" : repeats === 1 ? "ok" : "great";
  }
  return out;
}
