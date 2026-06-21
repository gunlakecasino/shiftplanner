import { addDays } from "@/lib/shiftbuilder/dateUtils";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { DAY_LONG, SHIFT_DAY_COLORS } from "@/lib/shiftbuilder/dateUtils";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { dbToUi } from "@/lib/shiftbuilder/slot-keys";
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
} from "@/lib/shiftbuilder/constants";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { fetchNightCoreData } from "@/app/shiftbuilder/hooks/fetchNightCoreData";
import { fetchNightSecondaryData } from "@/app/shiftbuilder/hooks/fetchNightSecondaryData";
import { getNightMeta } from "@/lib/shiftbuilder/data";
import type {
  PrintDaySnapshot,
  PrintPlanningCardModel,
  PrintTaskLine,
  PrintBreaksWave,
  PrintOverlapRow,
  PrintBreaksPerson,
} from "./printPreviewTypes";

function tasksByUiKey(rows: NightSlotTask[]): Record<string, NightSlotTask[]> {
  const out: Record<string, NightSlotTask[]> = {};
  rows.forEach((row) => {
    const uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);
    if (uiKey.startsWith("UNK:")) {
      if (row.slotType === "overlap" && (row.slotKey === "overlap_pm" || row.slotKey === "overlap_am")) {
        const half = row.slotKey === "overlap_pm" ? "PM" : "AM";
        for (let i = 0; i < 6; i++) {
          (out[`OL-${half}-${i}`] ??= []).push(row);
        }
      }
      return;
    }
    (out[uiKey] ??= []).push(row);
  });
  return out;
}

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
  assignments: Record<string, { tmName?: string }>,
): boolean {
  return !!assignments[slotKey]?.tmName?.trim();
}

import { computeBreakCounts } from "@/lib/shiftbuilder/processNightData";
export { computeBreakCounts };

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

export async function buildPrintDaySnapshot(day: DayDef, dayIndex: number): Promise<PrintDaySnapshot> {
  const [core, secondary] = await Promise.all([
    fetchNightCoreData(day),
    fetchNightSecondaryData(day),
  ]);

  const amDate = addDays(day.date, 1);
  const assignments = core.assignments ?? {};

  let nightStatus: "published" | "draft" = "draft";
  if (core.nightId) {
    const meta = await getNightMeta(core.nightId);
    nightStatus = meta.status === "published" ? "published" : "draft";
  }

  return {
    dayIndex,
    day,
    assignments,
    tasksBySlot: tasksByUiKey((secondary.tasks ?? []) as NightSlotTask[]),
    auxDefs: core.auxDefs ?? [],
    amOverlapDayName: DAY_LONG[amDate.getDay()],
    amOverlapDateNum: amDate.getDate(),
    nextDayColor: SHIFT_DAY_COLORS[(dayIndex + 1) % 7],
    breakCounts: computeBreakCounts(assignments),
    notes: secondary.notes ?? "",
    nightStatus,
  };
}

export function buildZoneCardModels(snapshot: PrintDaySnapshot): PrintPlanningCardModel[] {
  return ZONE_VISUAL_ORDER.map((zKey) => {
    const def = ZONE_DEFS.find((d) => d.key === zKey)!;
    const a = snapshot.assignments[def.key] || {};
    const taskLines = toTaskLines(snapshot.tasksBySlot[def.key]);
    const cov = coverageFromTasks(taskLines);
    const regular = taskLines.filter((t) => !t.isCoverage);
    return {
      key: def.key,
      kind: "zone",
      headerLabel: def.label,
      headerIcon: ZONE_ICONS[def.key] ?? "●",
      accentColor: getZoneColor(def.key),
      tmName: a.tmName ?? null,
      locationLines: [],
      tasks: regular,
      coverageLabel: cov.label,
      coverageColor: cov.color,
      breakGroup: (a.breakGroup ?? 0) as 0 | 1 | 2 | 3,
      empty: !a.tmName,
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
      const taskLines = toTaskLines(snapshot.tasksBySlot[slotKey]);
      const cov = coverageFromTasks(taskLines);
      const regular = taskLines.filter((t) => !t.isCoverage);
      return {
        key: slotKey,
        kind: "rr-side",
        headerLabel: def.label,
        headerIcon: icon,
        accentColor: color,
        tmName: a.tmName ?? null,
        locationLines: [],
        tasks: regular,
        coverageLabel: cov.label,
        coverageColor: cov.color,
        breakGroup: (a.breakGroup ?? 0) as 0 | 1 | 2 | 3,
        empty: !a.tmName,
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
      tmName: a.tmName ?? null,
      locationLines: locs.length ? locs : [],
      tasks: regular,
      coverageLabel: null,
      coverageColor: null,
      breakGroup: (a.breakGroup ?? 0) as 0 | 1 | 2 | 3,
      empty: !a.tmName && !isBlank,
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
      if (!a?.tmId || (a.breakGroup ?? 0) !== wave) return;
      people.push({
        slotKey,
        tmName: a.tmName || a.tmId,
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
      const taskLines = toTaskLines(snapshot.tasksBySlot[slotKey]);
      const regular = taskLines.filter((t) => !t.isCoverage);
      return {
        key: slotKey,
        kind: "overlap",
        headerLabel: `OL ${i + 1}`,
        accentColor: "#6b7280",
        tmName: a.tmName ?? null,
        locationLines: [],
        tasks: regular,
        empty: !a.tmName,
        minHeightPx: 54,
      };
    });

  return [
    {
      key: "PM",
      time: "11p – 1a (swings)",
      dayName: snapshot.day.name,
      dateNum: snapshot.day.dateNum,
      headerColor: snapshot.day.color,
      slots: mkSlots("PM"),
    },
    {
      key: "AM",
      time: "5a – 7a (days)",
      dayName: snapshot.amOverlapDayName,
      dateNum: snapshot.amOverlapDateNum,
      headerColor: snapshot.nextDayColor,
      slots: mkSlots("AM"),
    },
  ];
}