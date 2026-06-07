import { getRRAccent, getZoneColor } from "@/lib/shiftbuilder/constants";

export function getSlotAccentColor(uiKey: string): string {
  if (uiKey.startsWith("MRR") || uiKey.startsWith("WRR")) {
    const num = parseInt(uiKey.replace(/^[MW]RR/, ""), 10);
    return getRRAccent(num);
  }
  if (uiKey.startsWith("Z")) return getZoneColor(uiKey);
  return "#6B7280";
}

export function getSlotCoverageLabel(uiKey: string): string {
  if (uiKey === "Z9SR") return "Zone 9SR";
  if (uiKey.startsWith("Z")) return `Zone ${uiKey.slice(1)}`;
  if (uiKey.startsWith("MRR") || uiKey.startsWith("WRR")) {
    return `Restroom ${uiKey.replace(/^[MW]RR/, "")}`;
  }
  return uiKey;
}

export function expandCoverageToKeys(uiKey: string): string[] {
  if (uiKey.startsWith("MRR")) return [uiKey, `WRR${uiKey.slice(3)}`];
  if (uiKey.startsWith("WRR")) return [`MRR${uiKey.slice(3)}`, uiKey];
  return [uiKey];
}