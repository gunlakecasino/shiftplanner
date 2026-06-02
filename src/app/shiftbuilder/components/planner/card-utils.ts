import type { ShiftAssignment } from "../../store/useShiftBuilderStore";

/**
 * Shared pure utilities for PlanningCard and its type-specific variants.
 * Keeping these here improves efficiency and consistency across card types.
 */

export function getSlotLabel(assignment: ShiftAssignment): string {
  const { slotKey, slotType, rrSide } = assignment;
  if (slotKey.startsWith("Zone")) return slotKey.replace("Zone", "Zone ");
  if (slotType === "rr") {
    const num = slotKey.replace(/M|W|RR/g, "");
    const side = rrSide === "mens" ? "♂" : rrSide === "womens" ? "♀" : "";
    return `RR${num} ${side}`.trim();
  }
  if (slotKey.startsWith("BW")) return slotKey.replace("-", " · Row ");
  if (slotKey.includes("Overlap")) return slotKey.replace("-Overlap", " Overlap");
  return slotKey;
}

export function getAccentColor(slotKey: string): string {
  if (slotKey.startsWith("Zone")) {
    const n = parseInt(slotKey.replace("Zone", "")) || 1;
    const colors = ["#E85D04", "#F59E0B", "#0EA5E9", "#EF4444", "#22C55E", "#3B82F6", "#8B5CF6", "#854D0E", "#DC2626", "#16A34A"];
    return colors[(n - 1) % colors.length];
  }
  if (slotKey.includes("RR")) return "#64748b";
  return "#475569";
}

/**
 * Returns a human-friendly short label for a break wave slot.
 */
export function getBreakWaveLabel(slotKey: string): string {
  if (slotKey.includes("BW1")) return "Wave 1";
  if (slotKey.includes("BW2")) return "Wave 2";
  if (slotKey.includes("BW3")) return "Wave 3";
  return "Break";
}
