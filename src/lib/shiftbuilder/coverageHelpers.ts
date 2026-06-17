import { ZONE_DEFS, RR_DEFS, getRRAccent, getZoneColor } from "@/lib/shiftbuilder/constants";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { slotKeyToLabel } from "@/lib/shiftbuilder/slot-keys";

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

type CoverageTaskRow = { taskLabel: string; isCoverage?: boolean };
type AssignmentRow = { tmName?: string; tmId?: string };

/** Register every label that may appear in an "And …" coverage task. */
export function buildCoverageLabelIndex(auxDefs: AuxDef[] = []): Map<string, string> {
  const map = new Map<string, string>();
  const register = (label: string, key: string) => {
    const trimmed = label.trim();
    if (!trimmed || map.has(trimmed)) return;
    map.set(trimmed, key);
  };

  for (const z of ZONE_DEFS) {
    register(getSlotCoverageLabel(z.key), z.key);
    register(z.label, z.key);
  }

  for (const rr of RR_DEFS) {
    register(getSlotCoverageLabel(`MRR${rr.num}`), `MRR${rr.num}`);
    register(rr.label, `MRR${rr.num}`);
  }

  register(getSlotCoverageLabel("ADM"), "ADM");
  register(slotKeyToLabel("ADM"), "ADM");
  register(getSlotCoverageLabel("Z9SR"), "Z9SR");
  register(slotKeyToLabel("Z9SR"), "Z9SR");

  for (const aux of auxDefs) {
    register(getSlotCoverageLabel(aux.key), aux.key);
    register(slotKeyToLabel(aux.key), aux.key);
    if (aux.label) register(aux.label, aux.key);
    if (aux.locations?.[0]) register(aux.locations[0], aux.key);
  }

  return map;
}

/** Parse `And Zone 2` / `And Z9 Smoking Room` → target UI slot key. */
export function parseCoverageTargetFromTaskLabel(
  taskLabel: string,
  labelToKey: Map<string, string>,
): string | null {
  const trimmed = taskLabel.trim();
  if (!/^and\s+/i.test(trimmed)) return null;
  const label = trimmed.replace(/^and\s+/i, "").trim();
  if (!label) return null;
  return labelToKey.get(label) ?? null;
}

/**
 * Inverse coverage map: target slot → TM names covering it.
 * Only includes TMs assigned to a source card that has an isCoverage banner
 * whose parsed target matches that exact slot key (no M/W mirroring).
 */
export function buildCoveredByIndex(
  assignments: Record<string, AssignmentRow>,
  selectedTasks: Record<string, CoverageTaskRow[]>,
  auxDefs: AuxDef[] = [],
): Record<string, string[]> {
  const labelToKey = buildCoverageLabelIndex(auxDefs);
  const index: Record<string, Set<string>> = {};

  for (const [sourceKey, tasks] of Object.entries(selectedTasks)) {
    const tmName = assignments[sourceKey]?.tmName?.trim();
    if (!tmName) continue;

    for (const t of tasks) {
      if (!t.isCoverage) continue;
      const targetKey = parseCoverageTargetFromTaskLabel(t.taskLabel, labelToKey);
      if (!targetKey) continue;
      if (!index[targetKey]) index[targetKey] = new Set();
      index[targetKey].add(tmName);
    }
  }

  const result: Record<string, string[]> = {};
  for (const [key, names] of Object.entries(index)) {
    result[key] = [...names].sort((a, b) => a.localeCompare(b));
  }
  return result;
}

/** Format coverer names for card display: "Gary / Tawnya". */
export function formatCoveredByNames(names: string[]): string {
  return names.filter(Boolean).join(" / ");
}