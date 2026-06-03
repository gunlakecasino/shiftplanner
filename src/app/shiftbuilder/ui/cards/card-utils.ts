/**
 * Shared pure utilities for the new decomposed PlanningCard system (ui/cards/).
 * 
 * These are the single source of truth for labeling, theming, and small derived values
 * across ZonePlanningCard, RestroomPlanningCard, AuxPlanningCard, BreakPlanningCard, etc.
 * 
 * Keeping them here (instead of duplicating or reaching into legacy planner/) gives the
 * Phase 1+ "Seamless Awe" surface maximum independence and long-term velocity.
 * (Loosely typed for the isolated dev preview while the canonical model stabilizes.)
 */

export function getSlotLabel(assignment: any): string {
  const { slotKey, slotType, rrSide } = assignment || {};
  if (!slotKey) return "Slot";

  if (slotKey.startsWith("Zone")) return slotKey.replace("Zone", "Zone ");
  if (slotType === "rr" || slotKey.includes("RR")) {
    const num = slotKey.replace(/M|W|RR/g, "");
    const side = rrSide === "mens" ? "♂" : rrSide === "womens" ? "♀" : "";
    return `RR${num} ${side}`.trim();
  }
  if (slotKey.startsWith("BW")) {
    // Handle both "BW2-Row1" and "BW2Row1" style keys gracefully
    const match = slotKey.match(/^BW(\d+)(?:[-_]?Row)?(\d+)?$/i);
    if (match) {
      const wave = match[1];
      const row = match[2] ? ` · Row ${match[2]}` : "";
      return `BW${wave}${row}`;
    }
    return slotKey.replace(/[-_]/g, " · ");
  }
  if (slotKey.includes("Overlap")) return slotKey.replace("-Overlap", " Overlap");
  if (slotKey === "AUX" || slotType === "aux") return "AUX";
  return slotKey;
}

export function getAccentColor(slotKey: string): string {
  if (slotKey.startsWith("Zone")) {
    const n = parseInt(slotKey.replace("Zone", "")) || 1;
    // Premium, distinct zone colors (subtle but identifiable)
    const colors = ["#E85D04", "#F59E0B", "#0EA5E9", "#EF4444", "#22C55E", "#3B82F6", "#8B5CF6", "#854D0E", "#DC2626", "#16A34A"];
    return colors[(n - 1) % colors.length];
  }
  if (slotKey.includes("RR") || slotKey.includes("MRR") || slotKey.includes("WRR")) return "#64748b";
  if (slotKey === "AUX" || slotKey.includes("AUX")) return "#475569";
  if (slotKey.startsWith("BW")) return "#a16207"; // warm amber for breaks
  return "#475569";
}

/**
 * Human-friendly short label for a break wave/row slot.
 */
export function getBreakWaveLabel(slotKey: string): string {
  if (slotKey.includes("BW1")) return "Wave 1";
  if (slotKey.includes("BW2")) return "Wave 2";
  if (slotKey.includes("BW3")) return "Wave 3";
  if (slotKey.includes("BW")) return "Break";
  return "Break";
}

/**
 * Format confidence for display (0.87 → "87%").
 */
export function formatConfidence(conf?: number): string {
  if (conf === undefined || conf === null) return "";
  return `${Math.round(conf * 100)}%`;
}

/**
 * Subtle color ramp for confidence / provenance strength (used for badges, bars, rings).
 * Returns Tailwind-friendly classes or hex when needed.
 */
export function getConfidenceColor(conf?: number): string {
  if (conf === undefined || conf === null) return "text-muted-foreground/60";
  if (conf >= 0.9) return "text-emerald-600";
  if (conf >= 0.75) return "text-amber-600";
  if (conf >= 0.6) return "text-sky-600";
  return "text-rose-600/70";
}

/**
 * Optional: very light background tint for high-confidence cards (future use in shell or cards).
 */
export function getConfidenceBg(conf?: number): string {
  if (!conf) return "";
  if (conf >= 0.9) return "bg-emerald-500/5";
  if (conf >= 0.75) return "bg-amber-500/5";
  return "";
}
