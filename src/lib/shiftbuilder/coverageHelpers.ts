import { ZONE_DEFS, RR_DEFS, getRRAccent, getZoneColor } from "@/lib/shiftbuilder/constants";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { slotKeyToLabel, uiToDb, type DbSlot } from "@/lib/shiftbuilder/slot-keys";

export type CoverageSide = "A" | "B";

export type CoveredByEntry = {
  tmName: string;
  tmId?: string;
  side?: CoverageSide | null;
  sourceKey: string;
  taskLabel: string;
  taskId?: string;
  isSynthetic?: boolean;
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

/** Returns a human-readable label for a slot (e.g. "Zone 3", "Women's Restroom 7"). */
export function getSlotCoverageLabel(uiKey: string): string {
  if (uiKey.startsWith("custom:")) return uiKey.slice(7);
  if (uiKey === "Z9SR") return "Zone 9 Smoking Room";
  if (uiKey.startsWith("Z")) return `Zone ${uiKey.slice(1)}`;
  if (uiKey.startsWith("WRR")) return `Women's Restroom ${uiKey.slice(3)}`;
  if (uiKey.startsWith("MRR")) return `Men's Restroom ${uiKey.slice(3)}`;
  return uiKey;
}

function directZoneNumber(slotKey: string): string | null {
  const normalized = slotKey.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const match = normalized.match(/^(?:Z|ZONE)(10|[1-9])$/);
  return match?.[1] ?? null;
}

/**
 * Context shown beside the TM name on a covered secondary-zone print card.
 * Only direct zone-to-zone coverage qualifies; restroom and auxiliary
 * fallback retain their existing covered-by presentation.
 */
export function formatSecondaryZonePrimaryLabel(
  targetSlotKey: string,
  sourceSlotKey: string,
): string | null {
  if (!directZoneNumber(targetSlotKey)) return null;
  const sourceZone = directZoneNumber(sourceSlotKey);
  return sourceZone ? `AND ZONE ${sourceZone}` : null;
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

/**
 * Display position for a covered target. A/B is meaningful only when more
 * than one TM shares the target; a solo coverer simply shows the slot number.
 */
export function formatCoveragePositionLabel(
  targetSlotKey: string,
  side: CoverageSide | null | undefined,
  covererCount: number,
): string {
  const suffix = coveragePositionSuffix(targetSlotKey);
  return covererCount > 1 && side ? `${suffix}${side}` : suffix;
}

/**
 * Coverage targets stay on the exact UI key they resolve to.
 * Gendered restroom halves (MRR / WRR) must never mirror onto each other.
 */
export function expandCoverageToKeys(uiKey: string): string[] {
  return [uiKey];
}

/**
 * Persist slot for a coverage write. MRR / WRR always carry rr_side so a
 * null-side row cannot land on men's via dbToUi.
 */
export function persistSlotForCoverageSource(sourceKey: string): DbSlot {
  const rrMatch = sourceKey.match(/^([MW])RR(\d+)$/);
  if (rrMatch) {
    const db = uiToDb(sourceKey);
    const rr_side = rrMatch[1] === "W" ? "womens" : "mens";
    return { ...db, slot_type: "rr", rr_side };
  }
  return uiToDb(sourceKey);
}

type CoverageTaskRow = {
  id?: string;
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
    const mrr = `MRR${rr.num}`;
    const wrr = `WRR${rr.num}`;
    register(getSlotCoverageLabel(mrr), mrr);
    register(getSlotCoverageLabel(wrr), wrr);
    register(slotKeyToLabel(mrr), mrr);
    register(slotKeyToLabel(wrr), wrr);
  }

  register(getSlotCoverageLabel("ADM"), "ADM");
  register(slotKeyToLabel("ADM"), "ADM");
  register(getSlotCoverageLabel("Z9SR"), "Z9SR");
  register(slotKeyToLabel("Z9SR"), "Z9SR");

  for (const aux of auxDefs) {
    register(getSlotCoverageLabel(aux.key), aux.key);
    register(slotKeyToLabel(aux.key), aux.key);
    if (aux.role === "admin") {
      map.set(getSlotCoverageLabel("ADM"), aux.key);
      map.set(slotKeyToLabel("ADM"), aux.key);
    } else if (aux.role === "z9sr") {
      map.set(getSlotCoverageLabel("Z9SR"), aux.key);
      map.set(slotKeyToLabel("Z9SR"), aux.key);
    }
    if (aux.label) register(aux.label, aux.key);
    if (aux.locations?.[0]) register(aux.locations[0], aux.key);
  }

  return map;
}

function restroomNumberFromLabel(raw: string): string | null {
  if (/^1\s*\+\s*2$/.test(raw)) return "1";
  return /^\d+$/.test(raw) ? raw : null;
}

function isWomensRestroomToken(token: string): boolean {
  return /^women'?s$/i.test(token.replace(/[\u2018\u2019\u02BC]/g, "'"));
}

/**
 * Resolve a restroom coverage label. Gendered labels stay on that half.
 * Legacy "Restroom 7" / "RR 7" inherit the source half when the source is
 * already MRR/WRR — never both. Zone/aux sources stay unresolved so we do
 * not invent a gender.
 */
export function parseRestroomCoverageLabel(
  label: string,
  sourceKey?: string,
): string | null {
  const normalized = label
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  const gendered = normalized.match(
    /^(women's|womens|men's|mens)\s+(?:restroom|rr)\s+(1\s*\+\s*2|\d+)$/i,
  );
  if (gendered) {
    const num = restroomNumberFromLabel(gendered[2]);
    if (!num) return null;
    return isWomensRestroomToken(gendered[1]) ? `WRR${num}` : `MRR${num}`;
  }

  const paren = normalized.match(
    /^(?:restroom|rr)\s+(1\s*\+\s*2|\d+)\s*\((women's|womens|men's|mens)\)$/i,
  );
  if (paren) {
    const num = restroomNumberFromLabel(paren[1]);
    if (!num) return null;
    return isWomensRestroomToken(paren[2]) ? `WRR${num}` : `MRR${num}`;
  }

  const genderless = normalized.match(/^(?:restroom|rr)\s+(1\s*\+\s*2|\d+)$/i);
  if (genderless) {
    const num = restroomNumberFromLabel(genderless[1]);
    if (!num) return null;
    if (sourceKey?.startsWith("WRR")) return `WRR${num}`;
    if (sourceKey?.startsWith("MRR")) return `MRR${num}`;
    return null;
  }

  return null;
}

/** Parse `And Zone 2` / `And Women's Restroom 7` → target UI slot key. */
export function parseCoverageTargetFromTaskLabel(
  taskLabel: string,
  labelToKey: Map<string, string>,
  sourceKey?: string,
): string | null {
  const trimmed = taskLabel.trim();
  if (!/^and\s+/i.test(trimmed)) return null;
  const label = trimmed.replace(/^and\s+/i, "").trim();
  if (!label) return null;
  return labelToKey.get(label) ?? parseRestroomCoverageLabel(label, sourceKey);
}

function sideSortOrder(side: CoverageSide | null | undefined): number {
  if (side === "A") return 0;
  if (side === "B") return 1;
  return 2;
}

/** Apply default A/B when exactly two coverers and sides are missing or duplicated. */
export function resolveDualCoverageSides(
  entries: CoveredByEntry[],
): CoveredByEntry[] {
  if (entries.length !== 2) return entries;

  const withA = entries.find((e) => e.side === "A");
  const withB = entries.find((e) => e.side === "B");
  const unset = entries.find((e) => e.side !== "A" && e.side !== "B");

  if (withA && withB) {
    return [...entries].sort(
      (a, b) => sideSortOrder(a.side) - sideSortOrder(b.side),
    );
  }

  if (withA && unset) {
    return [
      { ...withA, side: "A" },
      { ...unset, side: "B" },
    ];
  }

  if (withB && unset) {
    return [
      { ...unset, side: "A" },
      { ...withB, side: "B" },
    ];
  }

  // Both null, both A, both B, or any other duplicate — stable A/B by name
  const sorted = [...entries].sort((a, b) => a.tmName.localeCompare(b.tmName));
  return [
    { ...sorted[0], side: "A" },
    { ...sorted[1], side: "B" },
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
      const targetKey = parseCoverageTargetFromTaskLabel(
        t.taskLabel,
        labelToKey,
        sourceKey,
      );
      if (!targetKey) continue;

      if (!index[targetKey]) index[targetKey] = [];
      index[targetKey].push({
        tmName,
        tmId: row?.tmId,
        side: t.coverageSide ?? null,
        sourceKey,
        taskLabel: t.taskLabel,
        taskId: t.id,
        isSynthetic: t.id?.startsWith("coverage:") === true,
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
  if (existingEntries.length === 0) return "A";

  const used = new Set(
    existingEntries.map((e) => e.side).filter((s): s is CoverageSide => !!s),
  );

  // First coverer often has no persisted side — treat as implicit A
  if (existingEntries.length === 1 && used.size === 0) return "B";
  if (!used.has("A")) return "A";
  if (!used.has("B")) return "B";
  return "B";
}
