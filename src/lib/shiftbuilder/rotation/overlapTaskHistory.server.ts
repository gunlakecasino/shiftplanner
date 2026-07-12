/**
 * Server-only loader: last N grave nights of overlap task×TM history.
 * Used by fair Apply Overlap (PR3) and later by PlacementPad OL insights (PR6).
 *
 * OVERLAP_FAIR_APPLY: set server env to "1" to enable fair path in apply.
 * Default unset/0 → random_fallback (safe until is_one_off column + manual defaults are live).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalizeTaskLabel,
  overlapBandFromSlotKey,
  type OverlapBand,
} from "@/lib/shiftbuilder/rotation/overlapTaskApply";
import type { TaskHistoryEvent } from "@/lib/shiftbuilder/rotation/overlapTaskFairness";

export type LoadOverlapTaskHistoryParams = {
  /** Tonight's night id — used to resolve night_date and exclude tonight. */
  nightId: string;
  /** Optional band filter; omit for AM+PM. */
  band?: OverlapBand;
  /** How many prior grave nights (default 30). */
  windowNights?: number;
};

export type LoadOverlapTaskHistoryResult = {
  tonightIso: string;
  events: TaskHistoryEvent[];
  nightIds: string[];
};

function normalizeNightDateIso(raw: string | null | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  // Accept YYYY-MM-DD or full ISO timestamps
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}

/**
 * Load TaskHistoryEvent[] for the last `windowNights` grave nights with
 * night_date < tonight. Joins night_slot_tasks on overlap slots with
 * zone_assignments for tm_id on the same night+slot.
 *
 * taskKey = source_work_item_id if set, else normalizeTaskLabel(task_label).
 * isOneOff from column when present; legacy rows without column → false.
 */
export async function loadOverlapTaskHistoryServer(
  client: SupabaseClient,
  params: LoadOverlapTaskHistoryParams,
): Promise<LoadOverlapTaskHistoryResult> {
  const windowNights = Math.max(1, params.windowNights ?? 30);
  const nightId = String(params.nightId ?? "").trim();
  if (!nightId) {
    return { tonightIso: "", events: [], nightIds: [] };
  }

  const { data: tonightRow, error: tonightErr } = await client
    .from("nights")
    .select("id, night_date")
    .eq("id", nightId)
    .maybeSingle();

  if (tonightErr) {
    throw new Error(`overlapTaskHistory: tonight read failed: ${tonightErr.message}`);
  }
  const tonightIso = normalizeNightDateIso(
    (tonightRow as { night_date?: string } | null)?.night_date,
  );
  if (!tonightIso) {
    throw new Error("overlapTaskHistory: night has no night_date");
  }

  // Last N grave nights strictly before tonight (any nights row; not only OL-active)
  const { data: priorNights, error: nightsErr } = await client
    .from("nights")
    .select("id, night_date")
    .lt("night_date", tonightIso)
    .order("night_date", { ascending: false })
    .limit(windowNights);

  if (nightsErr) {
    throw new Error(`overlapTaskHistory: prior nights failed: ${nightsErr.message}`);
  }

  const nightRows = (priorNights ?? []) as Array<{ id: string; night_date: string }>;
  if (!nightRows.length) {
    return { tonightIso, events: [], nightIds: [] };
  }

  const nightIdToDate = new Map<string, string>();
  for (const n of nightRows) {
    nightIdToDate.set(String(n.id), normalizeNightDateIso(n.night_date));
  }
  const nightIds = [...nightIdToDate.keys()];

  // Overlap chips on those nights (select * for column drift / pre-migration safety)
  const { data: taskRows, error: taskErr } = await client
    .from("night_slot_tasks")
    .select(
      "night_id, slot_key, slot_type, task_label, source_work_item_id, is_one_off, is_coverage, rr_side",
    )
    .in("night_id", nightIds)
    .like("slot_key", "overlap_%");

  if (taskErr) {
    // Column may not exist yet — retry without new columns
    const msg = String(taskErr.message ?? "");
    if (/source_work_item_id|is_one_off/i.test(msg)) {
      const { data: legacyTasks, error: legacyErr } = await client
        .from("night_slot_tasks")
        .select("night_id, slot_key, slot_type, task_label, is_coverage, rr_side")
        .in("night_id", nightIds)
        .like("slot_key", "overlap_%");
      if (legacyErr) {
        throw new Error(`overlapTaskHistory: tasks failed: ${legacyErr.message}`);
      }
      return {
        tonightIso,
        events: buildEventsFromRows({
          taskRows: (legacyTasks ?? []) as Array<Record<string, unknown>>,
          nightIdToDate,
          bandFilter: params.band,
          hasNewColumns: false,
          assignByNightSlot: await loadAssignMap(client, nightIds),
        }),
        nightIds,
      };
    }
    throw new Error(`overlapTaskHistory: tasks failed: ${taskErr.message}`);
  }

  const assignByNightSlot = await loadAssignMap(client, nightIds);

  return {
    tonightIso,
    events: buildEventsFromRows({
      taskRows: (taskRows ?? []) as Array<Record<string, unknown>>,
      nightIdToDate,
      bandFilter: params.band,
      hasNewColumns: true,
      assignByNightSlot,
    }),
    nightIds,
  };
}

async function loadAssignMap(
  client: SupabaseClient,
  nightIds: string[],
): Promise<Map<string, string>> {
  const { data: assignRows, error: assignErr } = await client
    .from("zone_assignments")
    .select("night_id, slot_key, tm_id")
    .in("night_id", nightIds)
    .not("tm_id", "is", null);

  if (assignErr) {
    throw new Error(`overlapTaskHistory: assignments failed: ${assignErr.message}`);
  }

  const map = new Map<string, string>();
  for (const r of assignRows ?? []) {
    const nid = String((r as { night_id?: string }).night_id ?? "");
    const sk = String((r as { slot_key?: string }).slot_key ?? "");
    const tm = String((r as { tm_id?: string }).tm_id ?? "");
    if (!nid || !sk || !tm) continue;
    map.set(`${nid}|${sk}`, tm);
  }
  return map;
}

function buildEventsFromRows(params: {
  taskRows: Array<Record<string, unknown>>;
  nightIdToDate: Map<string, string>;
  bandFilter?: OverlapBand;
  hasNewColumns: boolean;
  assignByNightSlot: Map<string, string>;
}): TaskHistoryEvent[] {
  const events: TaskHistoryEvent[] = [];
  for (const row of params.taskRows) {
    if (row.is_coverage === true) continue;
    const nightId = String(row.night_id ?? "");
    const slotKey = String(row.slot_key ?? "");
    const nightDate = params.nightIdToDate.get(nightId);
    if (!nightDate || !slotKey) continue;

    const band = overlapBandFromSlotKey(slotKey);
    if (!band) continue;
    if (params.bandFilter && band !== params.bandFilter) continue;

    const tmId = params.assignByNightSlot.get(`${nightId}|${slotKey}`);
    if (!tmId) continue; // unstaffed seat chips don't contribute TM history

    const label = String(row.task_label ?? "").trim();
    if (!label) continue;

    let taskKey: string;
    if (params.hasNewColumns) {
      const src = String(row.source_work_item_id ?? "").trim();
      taskKey = src || normalizeTaskLabel(label);
    } else {
      taskKey = normalizeTaskLabel(label);
    }
    if (!taskKey) continue;

    let isOneOff = false;
    if (params.hasNewColumns && row.is_one_off != null) {
      isOneOff = row.is_one_off === true;
    }

    events.push({
      nightDate,
      band,
      tmId,
      taskKey,
      isOneOff,
      taskLabel: label,
    });
  }
  return events;
}
