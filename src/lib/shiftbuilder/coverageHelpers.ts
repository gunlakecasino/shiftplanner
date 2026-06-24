import { ZONE_DEFS, RR_DEFS, getRRAccent, getZoneColor } from "@/lib/shiftbuilder/constants";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { slotKeyToLabel } from "@/lib/shiftbuilder/slot-keys";

export type CoverageSide = "A" | "B";

export type CoveredByEntry = {
  tmName: string;
  tmId?: string;
  side?: CoverageSide | null;
  sourceKey: string;
  taskLabel: string;
};

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

/** Numeric / short suffix for A/B badges (Z6 → 6, MRR8 → 8, Z9SR → 9SR). */
export function coveragePositionSuffix(targetSlotKey: string): string {
  if (targetSlotKey === "Z9SR") return "9SR";
  if (targetSlotKey.startsWith("Z")) return targetSlotKey.slice(1);
  const rr = targetSlotKey.match(/^[MW]RR(\d+)$/);
  if (rr) return rr[1];
  return targetSlotKey.replace(/\s+/g, "");
}

/** Display label for one coverer's A/B position (e.g. 6A, 8B). */
export function formatCoverageSideLabel(
  targetSlotKey: string,
  side: CoverageSide,
): string {
  return `${coveragePositionSuffix(targetSlotKey)}${side}`;
}

/** For an RR key (MRR7, WRR7) return both sides. For others return [key]. */
export function expandCoverageToKeys(uiKey: string): string[] {
  if (uiKey.startsWith("MRR")) return [uiKey, `WRR${uiKey.slice(3)}`];
  if (uiKey.startsWith("WRR")) return [`MRR${uiKey.slice(3)}`, uiKey];
  return [uiKey];
}

type CoverageTaskRow = {
  taskLabel: string;
  isCoverage?: boolean;
  coverageSide?: CoverageSide | null;
};
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

function sideSortOrder(side: CoverageSide | null | undefined): number {
  if (side === "A") return 0;
  if (side === "B") return 1;
  return 2;
}

/** Apply default A/B when exactly two coverers and sides are missing. */
export function resolveDualCoverageSides(
  entries: CoveredByEntry[],
): CoveredByEntry[] {
  if (entries.length !== 2) return entries;

  const hasA = entries.some((e) => e.side === "A");
  const hasB = entries.some((e) => e.side === "B");
  if (hasA && hasB) {
    return [...entries].sort(
      (a, b) => sideSortOrder(a.side) - sideSortOrder(b.side),
    );
  }

  const sorted = [...entries].sort((a, b) => a.tmName.localeCompare(b.tmName));
  return [
    { ...sorted[0], side: sorted[0].side ?? "A" },
    { ...sorted[1], side: sorted[1].side ?? "B" },
  ];
}

/**
 * Inverse coverage map: target slot → coverer entries (with optional A/B side).
 */
export function buildCoveredByIndex(
  assignments: Record<string, AssignmentRow>,
  selectedTasks: Record<string, CoverageTaskRow[]>,
  auxDefs: AuxDef[] = [],
): Record<string, CoveredByEntry[]> {
  const labelToKey = buildCoverageLabelIndex(auxDefs);
  const index: Record<string, CoveredByEntry[]> = {};

  for (const [sourceKey, tasks] of Object.entries(selectedTasks)) {
    const row = assignments[sourceKey];
    const tmName = row?.tmName?.trim();
    if (!tmName) continue;

    for (const t of tasks) {
      if (!t.isCoverage) continue;
      const targetKey = parseCoverageTargetFromTaskLabel(t.taskLabel, labelToKey);
      if (!targetKey) continue;

      if (!index[targetKey]) index[targetKey] = [];
      index[targetKey].push({
        tmName,
        tmId: row?.tmId,
        side: t.coverageSide ?? null,
        sourceKey,
        taskLabel: t.taskLabel,
      });
    }
  }

  const result: Record<string, CoveredByEntry[]> = {};
  for (const [key, entries] of Object.entries(index)) {
    const deduped = entries.sort((a, b) => a.tmName.localeCompare(b.tmName));
    result[key] =
      deduped.length === 2 ? resolveDualCoverageSides(deduped) : deduped;
  }
  return result;
}

/** Legacy name list for print paths that only need strings. */
export function coveredByNamesFromEntries(entries: CoveredByEntry[]): string[] {
  return entries.map((e) => e.tmName).filter(Boolean);
}

/** Format coverer names for card display: "Gary / Tawnya". */
export function formatCoveredByNames(names: string[]): string {
  return names.filter(Boolean).join(" / ");
}

/** Compact display name for tight card interiors — first name when full name is long. */
export function formatCoveredDisplayName(
  fullName: string,
  maxLen = 11,
): { display: string; full: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return { display: "", full: "" };
  if (trimmed.length <= maxLen) return { display: trimmed, full: trimmed };

  const parts = trimmed.split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (first && parts.length > 1 && first.length <= maxLen) {
    return { display: first, full: trimmed };
  }

  return { display: `${trimmed.slice(0, maxLen)}…`, full: trimmed };
}

/** Suggest side when adding a new coverer to a target that already has one. */
export function suggestCoverageSideForNewCoverer(
  existingEntries: CoveredByEntry[],
): CoverageSide {
  const used = new Set(
    existingEntries.map((e) => e.side).filter((s): s is CoverageSide => !!s),
  );
  if (!used.has("A")) return "A";
  if (!used.has("B")) return "B";
  return "B";
}