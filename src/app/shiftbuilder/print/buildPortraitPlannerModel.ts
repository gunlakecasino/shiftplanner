import {
  ZONE_DEFS,
  RR_DEFS,
  ZONE_VISUAL_ORDER,
  NUMBERED_AUX_ROLES,
  auxRoleTrailCode,
  canonicalizeAuxSlotKeyForTrail,
  getZoneColor,
  getRRAccent,
  getAuxAccent,
  getOverlapAccent,
} from "@/lib/shiftbuilder/constants";
import { buildCoveredByIndex } from "@/lib/shiftbuilder/coverageHelpers";
import type { AuxDef, AuxRole } from "@/lib/shiftbuilder/placement";
import { printAssigneeName } from "./printAssigneeName";
import { PLANNER_ROSTER_PER_PAGE } from "./portraitConstants";
import type { PrintDaySnapshot } from "./printPreviewTypes";

/**
 * Portrait planner data.
 *
 * Left column = Graves Default Schedule / on-call for the night (who is
 * scheduled). Right grids = the same placement snapshot Golden print uses:
 * persisted night-core assignments, then live-board overlay for the open
 * night, then draft overlay when Draft Mode is on. Breaks are omitted.
 *
 * Dual-coverage rule (huddle clipboard):
 * - The primary owner prints on the primary assignment slot only.
 * - Extra coverage from `additional_coverage_slots` / coverage tasks is a
 *   quiet +Z7-style cue on that primary card.
 * - The covered slot stays a structured open box with a quiet “via Z6” mark.
 * - We never move a TM onto a slot they are not assigned to.
 */
export type PlannerRosterBand = "grave" | "pm" | "am" | "other";

export type PlannerRosterEntry = {
  tmId: string;
  name: string;
  band: PlannerRosterBand;
  placed: boolean;
};

export type PlannerSlotCard = {
  key: string;
  kind: "zone" | "rr" | "aux" | "overlap";
  label: string;
  accent: string;
  tmName: string | null;
  empty: boolean;
  /** Short codes this primary also covers (e.g. Z7). */
  covers: string[];
  /** Short code of the primary slot when this card is covered, not owned. */
  coveredVia: string | null;
};

export type PlannerOverlapRow = {
  key: "PM" | "AM";
  time: string;
  dayName: string;
  dateNum: number;
  headerColor: string;
  slots: PlannerSlotCard[];
};

export type PortraitPlannerPageModel = {
  dayName: string;
  dateNum: number;
  monthYear: string;
  dayColor: string;
  nightMeta: string;
  pageIndex: number;
  pageCount: number;
  rosterContinued: boolean;
  roster: PlannerRosterEntry[];
  restrooms: PlannerSlotCard[];
  zones: PlannerSlotCard[];
  aux: PlannerSlotCard[];
  overlaps: PlannerOverlapRow[];
};

type PlannerAssignment = PrintDaySnapshot["assignments"][string];

function assignedName(
  assignments: PrintDaySnapshot["assignments"],
  slotKey: string,
): string | null {
  const row = assignments[slotKey];
  return printAssigneeName(row?.tmName, row?.tmId);
}

function placedTmIds(assignments: PrintDaySnapshot["assignments"]): Set<string> {
  const ids = new Set<string>();
  for (const row of Object.values(assignments)) {
    const id = row?.tmId?.trim();
    if (id) ids.add(id);
  }
  return ids;
}

export function plannerRosterBand(row: {
  isFullGrave?: boolean;
  isPMOverlap?: boolean;
  isAMOverlap?: boolean;
}): PlannerRosterBand {
  if (row.isPMOverlap) return "pm";
  if (row.isAMOverlap) return "am";
  if (row.isFullGrave) return "grave";
  return "other";
}

export function plannerRosterMark(band: PlannerRosterBand): "FG" | "PM" | "AM" | null {
  if (band === "pm") return "PM";
  if (band === "am") return "AM";
  if (band === "grave") return "FG";
  return null;
}

export function buildPlannerRoster(snapshot: PrintDaySnapshot): PlannerRosterEntry[] {
  const placed = placedTmIds(snapshot.assignments);
  const rows = snapshot.scheduledRoster ?? [];
  return rows
    .map((row) => ({
      tmId: row.tmId,
      name: row.name.trim(),
      band: plannerRosterBand(row),
      placed: placed.has(row.tmId),
    }))
    .filter((row) => row.name.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function paginatePlannerRoster<T>(
  rows: T[],
  perPage = PLANNER_ROSTER_PER_PAGE,
): T[][] {
  if (rows.length === 0) return [[]];
  if (rows.length <= perPage) return [rows];
  const pages: T[][] = [];
  for (let i = 0; i < rows.length; i += perPage) {
    pages.push(rows.slice(i, i + perPage));
  }
  return pages;
}

/** Compact huddle codes: Z5, WRR7, ADM, PM 1. Never the long Golden title. */
export function plannerSlotCode(slotKey: string): string {
  const raw = slotKey.trim();
  if (!raw) return raw;

  const overlap = raw.match(/^OL-(PM|AM)-(\d+)$/i);
  if (overlap) return `${overlap[1].toUpperCase()} ${Number(overlap[2]) + 1}`;

  const rr = raw.match(/^([MW])RR(\d+)$/i);
  if (rr) return `${rr[1].toUpperCase()}RR${rr[2]}`;

  const zone = raw.match(/^(?:Z|ZONE\s*)(10|[1-9])$/i);
  if (zone) return `Z${zone[1]}`;

  const compact = raw.replace(/\s+/g, "").toUpperCase();
  if (compact === "ADMIN" || compact === "ADM") return "ADM";
  if (compact === "Z9SR" || compact === "Z9SMOKINGROOM") return "Z9SR";
  return compact.slice(0, 8);
}

export function plannerAuxLabel(def: AuxDef, auxDefs: AuxDef[]): string {
  if (def.role === "admin") return "ADM";
  if (def.role && def.role !== "blank") {
    const nth = NUMBERED_AUX_ROLES.has(def.role)
      ? auxDefs.filter((row) => row.role === def.role).findIndex((row) => row.key === def.key)
      : 0;
    const code = auxRoleTrailCode(def.role as AuxRole, nth >= 0 ? nth : 0);
    return code === "ADMIN" ? "ADM" : code;
  }
  if (!def.label?.trim()) return "AUX";
  const trail = canonicalizeAuxSlotKeyForTrail(def.key, auxDefs);
  if (trail === "ADMIN") return "ADM";
  if (/^AUX\d+$/i.test(trail)) {
    const compact = def.label.replace(/\s+/g, "").toUpperCase();
    return compact.slice(0, 8) || "AUX";
  }
  return plannerSlotCode(trail);
}

function coverageTargetsFromAssignment(row: PlannerAssignment | undefined): string[] {
  const raw = row?.additionalCoverageSlots ?? row?.additional_coverage_slots ?? [];
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((key): key is string => typeof key === "string" && key.trim().length > 0))];
}

function uniqueCodes(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    const code = plannerSlotCode(key);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

function buildCoverageMaps(snapshot: PrintDaySnapshot): {
  coversBySource: Record<string, string[]>;
  coveredViaByTarget: Record<string, string>;
} {
  const coveredByIndex = buildCoveredByIndex(
    snapshot.assignments,
    snapshot.tasksBySlot,
    snapshot.auxDefs,
  );
  const coversBySource: Record<string, string[]> = {};
  const coveredViaByTarget: Record<string, string> = {};

  const addCover = (sourceKey: string, targetKey: string) => {
    if (!sourceKey || !targetKey || sourceKey === targetKey) return;
    if (assignedName(snapshot.assignments, targetKey)) return;
    (coversBySource[sourceKey] ??= []);
    if (!coversBySource[sourceKey].includes(targetKey)) {
      coversBySource[sourceKey].push(targetKey);
    }
    if (!coveredViaByTarget[targetKey]) {
      coveredViaByTarget[targetKey] = sourceKey;
    }
  };

  for (const [sourceKey, assignment] of Object.entries(snapshot.assignments)) {
    if (!assignedName(snapshot.assignments, sourceKey)) continue;
    for (const targetKey of coverageTargetsFromAssignment(assignment)) {
      addCover(sourceKey, targetKey);
    }
  }

  for (const [targetKey, entries] of Object.entries(coveredByIndex)) {
    for (const entry of entries) {
      addCover(entry.sourceKey, targetKey);
    }
  }

  return { coversBySource, coveredViaByTarget };
}

function slotCard(
  snapshot: PrintDaySnapshot,
  maps: ReturnType<typeof buildCoverageMaps>,
  args: {
    key: string;
    kind: PlannerSlotCard["kind"];
    label: string;
    accent: string;
  },
): PlannerSlotCard {
  const tmName = assignedName(snapshot.assignments, args.key);
  const covers = tmName ? uniqueCodes(maps.coversBySource[args.key] ?? []) : [];
  const coveredVia = !tmName ? plannerSlotCode(maps.coveredViaByTarget[args.key] ?? "") || null : null;
  return {
    key: args.key,
    kind: args.kind,
    label: args.label,
    accent: args.accent,
    tmName,
    empty: !tmName,
    covers,
    coveredVia,
  };
}

function zoneCards(
  snapshot: PrintDaySnapshot,
  maps: ReturnType<typeof buildCoverageMaps>,
): PlannerSlotCard[] {
  return ZONE_VISUAL_ORDER.map((key) => {
    const def = ZONE_DEFS.find((z) => z.key === key);
    return slotCard(snapshot, maps, {
      key,
      kind: "zone",
      label: plannerSlotCode(def?.key ?? key),
      accent: getZoneColor(key),
    });
  });
}

function restroomCards(
  snapshot: PrintDaySnapshot,
  maps: ReturnType<typeof buildCoverageMaps>,
): PlannerSlotCard[] {
  const cards: PlannerSlotCard[] = [];
  for (const def of RR_DEFS) {
    for (const side of ["M", "W"] as const) {
      const key = `${side}RR${def.num}`;
      cards.push(
        slotCard(snapshot, maps, {
          key,
          kind: "rr",
          label: plannerSlotCode(key),
          accent: getRRAccent(def.num),
        }),
      );
    }
  }
  return cards;
}

function auxCards(
  snapshot: PrintDaySnapshot,
  maps: ReturnType<typeof buildCoverageMaps>,
): PlannerSlotCard[] {
  return snapshot.auxDefs.map((def) =>
    slotCard(snapshot, maps, {
      key: def.key,
      kind: "aux",
      label: plannerAuxLabel(def, snapshot.auxDefs),
      accent: getAuxAccent(def.key, def.role),
    }),
  );
}

function overlapRows(
  snapshot: PrintDaySnapshot,
  maps: ReturnType<typeof buildCoverageMaps>,
): PlannerOverlapRow[] {
  const mk = (half: "PM" | "AM"): PlannerSlotCard[] =>
    Array.from({ length: 6 }, (_, i) => {
      const key = `OL-${half}-${i}`;
      return slotCard(snapshot, maps, {
        key,
        kind: "overlap",
        label: plannerSlotCode(key),
        accent: getOverlapAccent(key),
      });
    });

  return [
    {
      key: "PM",
      time: "11p – 1a",
      dayName: snapshot.day.name,
      dateNum: snapshot.day.dateNum,
      headerColor: snapshot.day.color,
      slots: mk("PM"),
    },
    {
      key: "AM",
      time: "5a – 7a",
      dayName: snapshot.amOverlapDayName,
      dateNum: snapshot.amOverlapDateNum,
      headerColor: snapshot.nextDayColor,
      slots: mk("AM"),
    },
  ];
}

export function buildPortraitPlannerPages(snapshot: PrintDaySnapshot): PortraitPlannerPageModel[] {
  const roster = buildPlannerRoster(snapshot);
  const chunks = paginatePlannerRoster(roster);
  const maps = buildCoverageMaps(snapshot);
  const restrooms = restroomCards(snapshot, maps);
  const zones = zoneCards(snapshot, maps);
  const aux = auxCards(snapshot, maps);
  const overlaps = overlapRows(snapshot, maps);

  return chunks.map((chunk, index) => ({
    dayName: snapshot.day.name,
    dateNum: snapshot.day.dateNum,
    monthYear: snapshot.day.monthYear,
    dayColor: snapshot.day.color,
    nightMeta: snapshot.day.meta?.trim() || "11p – 7a",
    pageIndex: index + 1,
    pageCount: chunks.length,
    rosterContinued: index > 0,
    roster: chunk,
    restrooms,
    zones,
    aux,
    overlaps,
  }));
}
