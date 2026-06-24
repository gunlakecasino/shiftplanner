import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { formatLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { normalizeTaskTextStyle } from "@/lib/shiftbuilder/taskTextStyle";
import { zoneHistoryMapFromRecord, type ZoneHistoryRecord } from "@/lib/shiftbuilder/zoneHistory";

type NightSecondaryApiPayload = {
  notes?: string;
  tasks?: unknown[];
  breakAssignments?: unknown[];
  cardBorders?: Record<string, string>;
  calledOffIds?: string[];
  rawBreakRows?: unknown[];
  recentZoneHistory?: ZoneHistoryRecord;
};

function mapNightSlotTaskRow(row: Record<string, unknown>): NightSlotTask {
  return {
    id: String(row.id ?? ""),
    nightId: String(row.nightId ?? row.night_id ?? ""),
    slotKey: String(row.slotKey ?? row.slot_key ?? ""),
    slotType: (row.slotType ?? row.slot_type ?? "zone") as NightSlotTask["slotType"],
    rrSide: (row.rrSide ?? row.rr_side ?? null) as NightSlotTask["rrSide"],
    taskLabel: String(row.taskLabel ?? row.task_label ?? ""),
    catalogTaskId: (row.catalogTaskId ?? row.catalog_task_id ?? null) as string | null,
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
    color: (row.color ?? null) as string | null,
    markerType: (row.markerType ?? row.marker_type ?? null) as NightSlotTask['markerType'],
    textStyle: normalizeTaskTextStyle(row.textStyle ?? row.text_style ?? null),
    isCoverage: Boolean(row.isCoverage ?? row.is_coverage ?? false),
  };
}

function mapBreakAssignmentRow(row: Record<string, unknown>) {
  return {
    nightId: String(row.nightId ?? row.night_id ?? ""),
    tmId: String(row.tmId ?? row.tm_id ?? ""),
    groupNum: Number(row.groupNum ?? row.group_num ?? 0),
    breakWave: Number(row.breakWave ?? row.break_wave ?? 1),
    slotRef: (row.slotRef ?? row.slot_ref ?? null) as string | null,
  };
}

function hydrateSecondaryPayload(data: NightSecondaryApiPayload) {
  const rawTasks = (data.tasks ?? []) as Record<string, unknown>[];
  const rawBreaks = (data.breakAssignments ?? data.rawBreakRows ?? []) as Record<string, unknown>[];
  const mappedBreaks = rawBreaks.map(mapBreakAssignmentRow);

  return {
    notes: data.notes ?? "",
    tasks: rawTasks.map(mapNightSlotTaskRow),
    breakAssignments: mappedBreaks,
    cardBorders: data.cardBorders ?? {},
    recentZoneHistory: zoneHistoryMapFromRecord(data.recentZoneHistory),
    calledOffIds: new Set<string>(data.calledOffIds ?? []),
    rawBreakRows: mappedBreaks,
  };
}

export type FetchNightSecondaryOptions = {
  publishedOnlyPolicy?: boolean;
};

function emptyNightSecondaryResult(accessBlocked = false) {
  return {
    notes: "",
    tasks: [] as ReturnType<typeof mapNightSlotTaskRow>[],
    breakAssignments: [] as ReturnType<typeof mapBreakAssignmentRow>[],
    cardBorders: {} as Record<string, string>,
    recentZoneHistory: null,
    calledOffIds: new Set<string>(),
    rawBreakRows: [] as ReturnType<typeof mapBreakAssignmentRow>[],
    accessBlocked,
  };
}

/** Shared nightSecondary queryFn — fully API-backed on the happy path (no client Supabase). */
export async function fetchNightSecondaryData(
  selectedDay: DayDef,
  options?: FetchNightSecondaryOptions,
) {
  const dateStr = formatLocalDateISO(selectedDay.date);

  try {
    // Unique bust param for same reason as core: guarantee the request reaches a fresh server computation
    // after a mutation + revalidate (Safari and other caches can be stubborn).
    const bust = `&_=${Date.now()}`;
    const res = await fetch(`/api/shiftbuilder/night-secondary?date=${dateStr}${bust}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (res.status === 403) {
      return emptyNightSecondaryResult(true);
    }
    if (res.ok) {
      const data = (await res.json()) as NightSecondaryApiPayload;
      return hydrateSecondaryPayload(data);
    }
  } catch (e) {
    console.warn("[fetchNightSecondaryData] API path failed, using fallback", e);
  }

  if (options?.publishedOnlyPolicy) {
    return emptyNightSecondaryResult(true);
  }

  const {
    getNightIdForDate,
    getNightNotes,
    getNightSlotTasks,
    getNightBreakAssignments,
    getNightCardBorders,
    getRecentZoneHistory,
  } = await import("@/lib/shiftbuilder/data");

  const [id, recentHistory] = await Promise.all([
    getNightIdForDate(selectedDay.date),
    getRecentZoneHistory(selectedDay.date, 7),
  ]);

  const [notesText, nightTaskRows, breakRows, nightBorderMap] = await Promise.all([
    id ? getNightNotes(id) : Promise.resolve(""),
    id ? getNightSlotTasks(id) : Promise.resolve([]),
    id ? getNightBreakAssignments(id) : Promise.resolve([]),
    id ? getNightCardBorders(id) : Promise.resolve({} as Record<string, string>),
  ]);

  return {
    notes: notesText,
    tasks: nightTaskRows,
    breakAssignments: breakRows,
    cardBorders: nightBorderMap,
    recentZoneHistory: recentHistory,
    calledOffIds: new Set<string>(),
    rawBreakRows: breakRows,
  };
}