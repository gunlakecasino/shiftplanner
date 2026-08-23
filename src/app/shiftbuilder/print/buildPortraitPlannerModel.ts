import {
  ZONE_DEFS,
  RR_DEFS,
  ZONE_VISUAL_ORDER,
  getZoneColor,
  getRRAccent,
  getAuxAccent,
  overlapSlotLabel,
  getOverlapAccent,
} from "@/lib/shiftbuilder/constants";
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
 */
export type PlannerRosterBand = "grave" | "pm" | "am";

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
  return "grave";
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

function zoneCards(snapshot: PrintDaySnapshot): PlannerSlotCard[] {
  return ZONE_VISUAL_ORDER.map((key) => {
    const def = ZONE_DEFS.find((z) => z.key === key);
    const tmName = assignedName(snapshot.assignments, key);
    return {
      key,
      kind: "zone" as const,
      label: def?.label ?? key,
      accent: getZoneColor(key),
      tmName,
      empty: !tmName,
    };
  });
}

function restroomCards(snapshot: PrintDaySnapshot): PlannerSlotCard[] {
  const cards: PlannerSlotCard[] = [];
  for (const def of RR_DEFS) {
    for (const side of [
      { prefix: "M", label: "M" },
      { prefix: "W", label: "W" },
    ] as const) {
      const key = `${side.prefix}RR${def.num}`;
      const tmName = assignedName(snapshot.assignments, key);
      cards.push({
        key,
        kind: "rr",
        label: `${def.label} ${side.label}`,
        accent: getRRAccent(def.num),
        tmName,
        empty: !tmName,
      });
    }
  }
  return cards;
}

function auxCards(snapshot: PrintDaySnapshot): PlannerSlotCard[] {
  return snapshot.auxDefs.map((def) => {
    const tmName = assignedName(snapshot.assignments, def.key);
    const isBlank = def.role === "blank" && !def.label?.trim();
    return {
      key: def.key,
      kind: "aux" as const,
      label: def.label?.trim() || (isBlank ? "OPEN AUX" : def.key),
      accent: getAuxAccent(def.key, def.role),
      tmName,
      empty: !tmName,
    };
  });
}

function overlapRows(snapshot: PrintDaySnapshot): PlannerOverlapRow[] {
  const mk = (half: "PM" | "AM"): PlannerSlotCard[] =>
    Array.from({ length: 6 }, (_, i) => {
      const key = `OL-${half}-${i}`;
      const tmName = assignedName(snapshot.assignments, key);
      return {
        key,
        kind: "overlap" as const,
        label: overlapSlotLabel(key),
        accent: getOverlapAccent(key),
        tmName,
        empty: !tmName,
      };
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
  const restrooms = restroomCards(snapshot);
  const zones = zoneCards(snapshot);
  const aux = auxCards(snapshot);
  const overlaps = overlapRows(snapshot);

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
