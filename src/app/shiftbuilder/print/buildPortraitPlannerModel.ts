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
import { PLANNER_ROSTER_PER_PAGE, PLANNER_TRAIL_COUNT } from "./portraitConstants";
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
 *
 * Workbook rule: the same sheet must work blank, partial, or filled. Trails
 * are real history only. Missing / empty `placementTrailsByTmId` prints no
 * codes — the trail line stays a quiet write-in, never a fabricated dash
 * of invented slots.
 */
export type PlannerRosterBand = "grave" | "pm" | "am";

export type PlannerRosterEntry = {
  tmId: string;
  name: string;
  band: PlannerRosterBand;
  placed: boolean;
  /** Newest-first short codes, at most PLANNER_TRAIL_COUNT. Empty = no history. */
  trail: string[];
};

export type PlannerRosterGroup = {
  band: PlannerRosterBand;
  label: string;
  continued: boolean;
  rows: PlannerRosterEntry[];
};

export type PlannerSlotCard = {
  key: string;
  kind: "zone" | "rr" | "aux" | "overlap";
  label: string;
  accent: string;
  tmId: string | null;
  tmName: string | null;
  empty: boolean;
  /** Newest-first short codes under a placed name. Empty when unowned or no history. */
  trail: string[];
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
  rosterGroups: PlannerRosterGroup[];
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

export const PLANNER_ROSTER_GROUP_ORDER: PlannerRosterBand[] = ["pm", "grave", "am"];

export const PLANNER_ROSTER_GROUP_LABEL: Record<PlannerRosterBand, string> = {
  pm: "PM",
  grave: "Graves",
  am: "AM",
};

export function plannerRosterBand(row: {
  isFullGrave?: boolean;
  isPMOverlap?: boolean;
  isAMOverlap?: boolean;
}): PlannerRosterBand {
  if (row.isPMOverlap) return "pm";
  if (row.isAMOverlap) return "am";
  return "grave";
}

/**
 * Last-5 trail for a TM. Missing key, empty array, or blank labels → [].
 * Never invents codes. Truncates to PLANNER_TRAIL_COUNT, newest first as stored.
 */
export function plannerTrailLabels(
  trailsByTmId: Record<string, string[]> | undefined,
  tmId: string | null | undefined,
  count = PLANNER_TRAIL_COUNT,
): string[] {
  if (!tmId) return [];
  const raw = trailsByTmId?.[tmId];
  if (!raw?.length) return [];
  return raw
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
    .slice(0, count);
}

/** Compact middot line for print. Empty history → "" (caller keeps a write-in). */
export function formatPlannerTrailLine(labels: string[]): string {
  return labels
    .map((label) => label.trim())
    .filter((label) => label.length > 0)
    .slice(0, PLANNER_TRAIL_COUNT)
    .join(" · ");
}

function emptyRosterGroups(): PlannerRosterGroup[] {
  return PLANNER_ROSTER_GROUP_ORDER.map((band) => ({
    band,
    label: PLANNER_ROSTER_GROUP_LABEL[band],
    continued: false,
    rows: [],
  }));
}

export function buildPlannerRosterGroups(snapshot: PrintDaySnapshot): PlannerRosterGroup[] {
  const placed = placedTmIds(snapshot.assignments);
  const trails = snapshot.placementTrailsByTmId;
  const byBand: Record<PlannerRosterBand, PlannerRosterEntry[]> = {
    pm: [],
    grave: [],
    am: [],
  };

  for (const row of snapshot.scheduledRoster ?? []) {
    const name = row.name.trim();
    if (!name) continue;
    const band = plannerRosterBand(row);
    byBand[band].push({
      tmId: row.tmId,
      name,
      band,
      placed: placed.has(row.tmId),
      trail: plannerTrailLabels(trails, row.tmId),
    });
  }

  for (const band of PLANNER_ROSTER_GROUP_ORDER) {
    byBand[band].sort((a, b) => a.name.localeCompare(b.name));
  }

  return PLANNER_ROSTER_GROUP_ORDER.map((band) => ({
    band,
    label: PLANNER_ROSTER_GROUP_LABEL[band],
    continued: false,
    rows: byBand[band],
  }));
}

export function buildPlannerRoster(snapshot: PrintDaySnapshot): PlannerRosterEntry[] {
  return buildPlannerRosterGroups(snapshot).flatMap((group) => group.rows);
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

/**
 * Pack named groups across pages. Repeat a group head when it continues.
 * Avoid starting a group in the last slot, and avoid leaving a single name
 * on the next page when two can travel together.
 */
export function paginatePlannerRosterGroups(
  groups: PlannerRosterGroup[],
  perPage = PLANNER_ROSTER_PER_PAGE,
): PlannerRosterGroup[][] {
  const named = groups.filter((group) => group.rows.length > 0);
  if (named.length === 0) return [emptyRosterGroups()];

  const pages: PlannerRosterGroup[][] = [];
  let page: PlannerRosterGroup[] = [];
  let used = 0;

  const flush = () => {
    if (page.length > 0) pages.push(page);
    page = [];
    used = 0;
  };

  for (const group of named) {
    let offset = 0;
    while (offset < group.rows.length) {
      let slots = perPage - used;
      if (offset === 0 && slots <= 1 && used > 0) {
        flush();
        slots = perPage;
      }
      const remaining = group.rows.length - offset;
      let take = Math.min(slots, remaining);
      if (remaining - take === 1 && take > 1 && used + take >= perPage) {
        take -= 1;
      }
      if (take <= 0) {
        flush();
        continue;
      }
      page.push({
        band: group.band,
        label: group.label,
        continued: offset > 0,
        rows: group.rows.slice(offset, offset + take),
      });
      used += take;
      offset += take;
      if (used >= perPage) flush();
    }
  }
  flush();
  return insertEmptyBandShells(pages.length ? pages : [[]], groups);
}

function insertEmptyBandShells(
  packed: PlannerRosterGroup[][],
  allGroups: PlannerRosterGroup[],
): PlannerRosterGroup[][] {
  const emptyByBand = new Map(
    allGroups.filter((group) => group.rows.length === 0).map((group) => [group.band, group]),
  );
  if (emptyByBand.size === 0) return packed;

  return packed.map((page, pageIndex) => {
    const bandsOnPage = page.map((group) => group.band);
    const firstIndex = bandsOnPage.length
      ? PLANNER_ROSTER_GROUP_ORDER.indexOf(bandsOnPage[0])
      : 0;
    const lastIndex = bandsOnPage.length
      ? PLANNER_ROSTER_GROUP_ORDER.indexOf(bandsOnPage[bandsOnPage.length - 1])
      : -1;
    const isLastPage = pageIndex === packed.length - 1;
    const out: PlannerRosterGroup[] = [];

    for (let bandIndex = 0; bandIndex < PLANNER_ROSTER_GROUP_ORDER.length; bandIndex += 1) {
      const band = PLANNER_ROSTER_GROUP_ORDER[bandIndex];
      const existing = page.find((group) => group.band === band);
      if (existing) {
        out.push(existing);
        continue;
      }
      const shell = emptyByBand.get(band);
      if (!shell) continue;
      const inSpan = bandIndex >= firstIndex && bandIndex <= lastIndex;
      const afterLastOnLastPage = isLastPage && bandIndex > lastIndex;
      const beforeFirstOnFirstPage = pageIndex === 0 && bandIndex < firstIndex;
      if (inSpan || afterLastOnLastPage || beforeFirstOnFirstPage) {
        out.push(shell);
      }
    }
    return out;
  });
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

function assignedTmId(
  assignments: PrintDaySnapshot["assignments"],
  slotKey: string,
): string | null {
  const id = assignments[slotKey]?.tmId?.trim();
  return id || null;
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
  const tmId = tmName ? assignedTmId(snapshot.assignments, args.key) : null;
  const covers = tmName ? uniqueCodes(maps.coversBySource[args.key] ?? []) : [];
  const coveredVia = !tmName ? plannerSlotCode(maps.coveredViaByTarget[args.key] ?? "") || null : null;
  return {
    key: args.key,
    kind: args.kind,
    label: args.label,
    accent: args.accent,
    tmId,
    tmName,
    empty: !tmName,
    trail: tmId ? plannerTrailLabels(snapshot.placementTrailsByTmId, tmId) : [],
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
  const groups = buildPlannerRosterGroups(snapshot);
  const maps = buildCoverageMaps(snapshot);
  const restrooms = restroomCards(snapshot, maps);
  const zones = zoneCards(snapshot, maps);
  const aux = auxCards(snapshot, maps);
  const overlaps = overlapRows(snapshot, maps);

  return [
    {
      dayName: snapshot.day.name,
      dateNum: snapshot.day.dateNum,
      monthYear: snapshot.day.monthYear,
      dayColor: snapshot.day.color,
      nightMeta: snapshot.day.meta?.trim() || "11p – 7a",
      pageIndex: 1,
      pageCount: 1,
      rosterContinued: false,
      roster: groups.flatMap((group) => group.rows),
      rosterGroups: groups,
      restrooms,
      zones,
      aux,
      overlaps,
    },
  ];
}
