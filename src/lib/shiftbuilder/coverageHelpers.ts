import { getRRAccent, getZoneColor } from "@/lib/shiftbuilder/constants";

/** Returns the accent hex for any UI slot key (zone, RR side, aux). */
export function getSlotAccentColor(uiKey: string): string {
  if (uiKey.startsWith("MRR") || uiKey.startsWith("WRR")) {
    const num = parseInt(uiKey.replace(/^[MW]RR/, ""), 10);
    return getRRAccent(num);
  }
  if (uiKey.startsWith("Z")) return getZoneColor(uiKey);
  return "#6B7280";
}

/** Returns a human-readable label for a slot (e.g. "Zone 3", "Restroom 7", or custom text). */
export function getSlotCoverageLabel(uiKey: string): string {
  if (uiKey.startsWith("custom:")) return uiKey.slice(7);
  if (uiKey === "Z9SR") return "Zone 9 Smoking Room";
  if (uiKey.startsWith("Z")) return `Zone ${uiKey.slice(1)}`;
  if (uiKey.startsWith("MRR") || uiKey.startsWith("WRR")) {
    return `Restroom ${uiKey.replace(/^[MW]RR/, "")}`;
  }
  return uiKey;
}

/** For an RR key (MRR7, WRR7) return both sides. For others return [key]. */
export function expandCoverageToKeys(uiKey: string): string[] {
  if (uiKey.startsWith("MRR")) return [uiKey, `WRR${uiKey.slice(3)}`];
  if (uiKey.startsWith("WRR")) return [`MRR${uiKey.slice(3)}`, uiKey];
  return [uiKey];
}
