import { addDays, formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { DAY_LONG, SHIFT_DAY_COLORS } from "@/lib/shiftbuilder/dateUtils";
import type { NightSlotTask, ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import { mapNightTasksToUiKeys } from "@/lib/shiftbuilder/mapNightTasksToUiKeys";
import {
  ZONE_DEFS,
  RR_DEFS,
  ZONE_VISUAL_ORDER,
  ZONE_ICONS,
  RR_ICONS,
  getZoneColor,
  getRRAccent,
  getAuxAccent,
  getAuxIcon,
  getOverlapAccent,
  overlapSlotLabel,
} from "@/lib/shiftbuilder/constants";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { fetchNightCoreData } from "@/app/shiftbuilder/hooks/fetchNightCoreData";
import { fetchNightSecondaryData } from "@/app/shiftbuilder/hooks/fetchNightSecondaryData";
import { hasPrintAssigneeName, printAssigneeName } from "./printAssigneeName";
import {
  buildPlacementTrailLabels,
  PLACEMENT_HISTORY_FETCH_CALENDAR_DAYS,
} from "@/app/shiftbuilder/components/placementPadHelpers";
import type {
  PrintDaySnapshot,
  PrintPlanningCardModel,
  PrintTaskLine,
  PrintBreaksWave,
  PrintOverlapRow,
  PrintBreaksPerson,
} from "./printPreviewTypes";

function toTaskLines(tasks: NightSlotTask[] | undefined): PrintTaskLine[] {
  return (tasks ?? []).map((t) => ({
    id: t.id,
    label: t.taskLabel,
    color: t.color ?? null,
    markerType: t.markerType ?? null,
    textStyle: t.textStyle ?? null,
    isCoverage: Boolean(t.isCoverage),
  }));
}

export function slotShowsFilled(
  slotKey: string,
  assignments: Record<string, { tmName?: string; tmId?: string }>,
): boolean {
  const row = assignments[slotKey];
  return hasPrintAssigneeName(row?.tmName, row?.tmId);
}

import { computeBreakCounts } from "@/lib/shiftbuilder/processNightData";
export { computeBreakCounts };

const PRINT_HISTORY_CHUNK_SIZE = 48;

/**
 * Add newest-first placement trails after persisted, live, and draft assignment
 * overlays have settled. The history query is anchored to the planned night so
 * a later planning page can include earlier built nights in the same week.
 */
export async function hydratePrintPlacementTrails(
  snapshot: PrintDaySnapshot,
): Promise<PrintDaySnapshot> {
  const tmIds = [
    ...new Set(
      Object.values(snapshot.assignments)
        .map((assignment) => assignment?.tmId)
        .filter((tmId): tmId is string => Boolean(tmId)),
    ),
  ].sort();
  if (tmIds.length === 0) return snapshot;

  const placementTrailsByTmId = {
    ...(snapshot.placementTrailsByTmId ?? {}),
  };
  const missingTmIds = tmIds.filter((tmId) => !(tmId in placementTrailsByTmId));
  if (missingTmIds.length === 0) return snapshot;

  const beforeIso = formatLocalDateISO(snapshot.day.date);
  try {
    for (let index = 0; index < missingTmIds.length; index += PRINT_HISTORY_CHUNK_SIZE) {
      const chunk = missingTmIds.slice(index, index + PRINT_HISTORY_CHUNK_SIZE);
      const response = await fetch("/api/shiftbuilder/placement-histories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tmIds: chunk,
          days: PLACEMENT_HISTORY_FETCH_CALENDAR_DAYS,
          throughDate: beforeIso,
        }),
      });
      if (!response.ok) throw new Error(`placement-histories ${response.status}`);

      const payload = (await response.json()) as {
        histories?: Record<string, ZoneDetailEntry | null>;
      };
      for (const tmId of chunk) {
        placementTrailsByTmId[tmId] = buildPlacementTrailLabels(
          payload.histories?.[tmId] ?? null,
          beforeIso,
        );
      }
    }
  } catch (error) {
    console.warn("[print] placement trails unavailable", error);
    return snapshot;
  }

  return { ...snapshot, placementTrailsByTmId };
}

function coverageFromTasks(tasks: PrintTaskLine[]): { label: string | null; color: string | null } {
  const cov = tasks.find((t) => t.isCoverage);
  return cov ? { label: cov.label, color: cov.color ?? null } : { label: null, color: null };
}

function slotRefType(ref: string): "zone" | "rr" | "aux" | "overlap" {
  if (ref.startsWith("OL-")) return "overlap";
  if (ref.startsWith("MRR") || ref.startsWith("WRR")) return "rr";
  if (/^Z\d+$/.test(ref)) return "zone";
  return "aux";
}

function chipLabel(slotKey: string, auxDefs: AuxDef[]): string {
  if (slotKey.startsWith("OL-")) return slotKey.replace(/^OL-/, "");
  if (/^Z\d+$/.test(slotKey)) return `ZONE ${slotKey.replace(/\D/g, "")}`;
  if (slotKey.startsWith("MRR") || slotKey.startsWith("WRR")) {
    const num = slotKey.replace(/\D/g, "");
    const side = slotKey.startsWith("M") ? "M" : "W";
    const def = RR_DEFS.find((r) => String(r.num) === num);
    return def ? `${def.label} ${side}` : `RR ${num} ${side}`;
  }
  const def = auxDefs.find((d) => d.key === slotKey);
  return def?.label || slotKey;
}

function accentForSlot(slotKey: string, auxDefs: AuxDef[]): string {
  if (/^Z\d+$/.test(slotKey)) return getZoneColor(slotKey);
  if (slotKey.startsWith("MRR") || slotKey.startsWith("WRR")) {
    const num = parseInt(slotKey.replace(/\D/g, ""), 10) || 1;
    return getRRAccent(num);
  }
  const def = auxDefs.find((d) => d.key === slotKey);
  return getAuxAccent(slotKey, def?.role);
}

export async function buildPrintDaySnapshot(
  day: DayDef,
  dayIndex: number,
  options: { includePlacementTrails?: boolean } = {},
): Promise<PrintDaySnapshot> {
  const [core, secondary] = await Promise.all([
    fetchNightCoreData(day, { printOnly: true }),
    fetchNightSecondaryData(day, { printOnly: true }),
  ]);

  const amDate = addDays(day.date, 1);
  const assignments = core.assignments ?? {};

  const nightStatus: "published" | "draft" = core.status === "published" ? "published" : "draft";

  const snapshot: PrintDaySnapshot = {
    dayIndex,
    day,
    assignments,
    tasksBySlot: mapNightTasksToUiKeys(
      (secondary.tasks ?? []) as NightSlotTask[],
      core.auxDefs ?? [],
      assignments,
    ),
    auxDefs: core.auxDefs ?? [],
    amOverlapDayName: DAY_LONG[amDate.getDay()],
    amOverlapDateNum: amDate.getDate(),
    nextDayColor: SHIFT_DAY_COLORS[(dayIndex + 1) % 7],
    breakCounts: computeBreakCounts(assignments),
    notes: secondary.notes ?? "",
    sideTasks: secondary.sideTasks ?? [],
    nightStatus,
    scheduledRoster: (core.gravesScheduleRoster ?? []).map((row: {
      id?: string;
      name?: string;
      isFullGrave?: boolean;
      isPMOverlap?: boolean;
      isAMOverlap?: boolean;
    }) => ({
      tmId: String(row.id ?? ""),
      name: String(row.name ?? ""),
      isFullGrave: Boolean(row.isFullGrave),
      isPMOverlap: Boolean(row.isPMOverlap),
      isAMOverlap: Boolean(row.isAMOverlap),
    })).filter((row) => row.tmId && row.name),
  };

  return options.includePlacementTrails
    ? hydratePrintPlacementTrails(snapshot)
    : snapshot;
}

export function buildZoneCardModels(snapshot: PrintDaySnapshot): PrintPlanningCardModel[] {
  return ZONE_VISUAL_ORDER.map((zKey) => {
    const def = ZONE_DEFS.find((d) => d.key === zKey)!;
    const a = snapshot.assignments[def.key] || {};
    const tmName = printAssigneeName(a.tmName, a.tmId);
    const taskLines = toTaskLines(snapshot.tasksBySlot[def.key]);
    const cov = coverageFromTasks(taskLines);
    const regular = taskLines.filter((t) => !t.isCoverage);
    return {
      key: def.key,
      kind: "zone",
      headerLabel: def.label,
      headerIcon: ZONE_ICONS[def.key] ?? "●",
      accentColor: getZoneColor(def.key),
      tmId: a.tmId ?? null,
      tmName,
      locationLines: [],
      tasks: regular,
      coverageLabel: cov.label,
      coverageColor: cov.color,
      breakGroup: (a.breakGroup ?? 0) as 0 | 1 | 2 | 3,
      empty: !tmName,
      minHeightPx: 124,
    };
  });
}

export function buildRRCardModels(snapshot: PrintDaySnapshot): PrintPlanningCardModel[][] {
  return RR_DEFS.map((def) => {
    const mKey = `MRR${def.num}`;
    const wKey = `WRR${def.num}`;
    const color = getRRAccent(def.num);
    const icon = RR_ICONS[def.num] ?? "●";

    const side = (slotKey: string, sideLabel: string): PrintPlanningCardModel => {
      const a = snapshot.assignments[slotKey] || {};
      const tmName = printAssigneeName(a.tmName, a.tmId);
      const taskLines = toTaskLines(snapshot.tasksBySlot[slotKey]);
      const cov = coverageFromTasks(taskLines);
      const regular = taskLines.filter((t) => !t.isCoverage);
      return {
        key: slotKey,
        kind: "rr-side",
        headerLabel: def.label,
        headerIcon: icon,
        accentColor: color,
        tmId: a.tmId ?? null,
        tmName,
        locationLines: [],
        tasks: regular,
        coverageLabel: cov.label,
        coverageColor: cov.color,
        breakGroup: (a.breakGroup ?? 0) as 0 | 1 | 2 | 3,
        empty: !tmName,
        sideLabel,
        minHeightPx: 56,
      };
    };

    return [side(mKey, "M"), side(wKey, "W")];
  });
}

export function buildAuxCardModels(snapshot: PrintDaySnapshot): PrintPlanningCardModel[] {
  return snapshot.auxDefs.map((def) => {
    const a = snapshot.assignments[def.key] || {};
    const tmName = printAssigneeName(a.tmName, a.tmId);
    const taskLines = toTaskLines(snapshot.tasksBySlot[def.key]);
    const regular = taskLines.filter((t) => !t.isCoverage);
    const isBlank = def.role === "blank" && !def.label;
    const locs = def.locations?.length ? [def.locations.join(" · ")] : [];
    return {
      key: def.key,
      kind: "aux",
      headerLabel: def.label || (isBlank ? "SET ROLE" : def.key),
      headerIcon: getAuxIcon(def.key, def.role),
      accentColor: getAuxAccent(def.key, def.role),
      tmId: a.tmId ?? null,
      tmName,
      locationLines: locs.length ? locs : [],
      tasks: regular,
      coverageLabel: null,
      coverageColor: null,
      breakGroup: (a.breakGroup ?? 0) as 0 | 1 | 2 | 3,
      empty: !tmName && !isBlank,
      blankAux: isBlank,
      minHeightPx: 76,
    };
  });
}

export function buildBreaksWaves(snapshot: PrintDaySnapshot): PrintBreaksWave[] {
  const waves: PrintBreaksWave[] = [];
  for (const wave of [1, 2, 3, 4] as const) {
    const people: PrintBreaksPerson[] = [];
    Object.entries(snapshot.assignments).forEach(([slotKey, a]) => {
      if (!a?.tmId || (a.breakGroup ?? 0) !== wave || slotKey.startsWith("OL-")) return;
      people.push({
        slotKey,
        tmName: printAssigneeName(a.tmName, a.tmId) ?? a.tmId,
        chipLabel: chipLabel(slotKey, snapshot.auxDefs),
        accentColor: accentForSlot(slotKey, snapshot.auxDefs),
        sideLetter: slotKey.startsWith("MRR") ? "M" : slotKey.startsWith("WRR") ? "W" : "",
        category: slotRefType(slotKey),
      });
    });
    waves.push({ wave, people });
  }
  return waves;
}

export function buildOverlapRows(snapshot: PrintDaySnapshot): PrintOverlapRow[] {
  const mkSlots = (half: "PM" | "AM"): PrintPlanningCardModel[] =>
    Array.from({ length: 6 }, (_, i) => {
      const slotKey = `OL-${half}-${i}`;
      const a = snapshot.assignments[slotKey] || {};
      const tmName = printAssigneeName(a.tmName, a.tmId);
      const taskLines = toTaskLines(snapshot.tasksBySlot[slotKey]);
      return {
        key: slotKey,
        kind: "overlap",
        headerLabel: overlapSlotLabel(slotKey),
        accentColor: getOverlapAccent(slotKey),
        tmId: a.tmId ?? null,
        tmName,
        locationLines: [],
        tasks: taskLines,
        breakGroup: (a.breakGroup ?? 0) as 0 | 1 | 2 | 3 | 4,
        empty: !tmName,
        minHeightPx: 54,
      };
    });

  return [
    {
      key: "PM",
      time: "11p – 1a",
      dayName: snapshot.day.name,
      dateNum: snapshot.day.dateNum,
      headerColor: snapshot.day.color,
      slots: mkSlots("PM"),
    },
    {
      key: "AM",
      time: "5a – 7a",
      dayName: snapshot.amOverlapDayName,
      dateNum: snapshot.amOverlapDateNum,
      headerColor: snapshot.nextDayColor,
      slots: mkSlots("AM"),
    },
  ];
}
