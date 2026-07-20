import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { parseLocalDateISO } from "./dateUtils";
import { getCachedNightIdForDate } from "./data.server";
import { fetchRecentZoneHistoryServer } from "./zoneHistory.server";
import type { ZoneHistoryRecord } from "./zoneHistory";
import { normalizeTaskTextStyle } from "./taskTextStyle";
import { mapPrintSideTasks, type PrintSideTaskRow } from "./printSideTasks";

function getSupabase(): SupabaseClient {
  const client = createAdminClientSafe();
  if (!client) {
    throw new Error(
      "Night-secondary requires SUPABASE_SERVICE_ROLE_KEY (session APIs must not read board data with the anon key)",
    );
  }
  return client;
}

type NightSlotTaskRow = {
  id: string;
  night_id: string;
  slot_key: string;
  slot_type: "zone" | "rr" | "aux" | "overlap";
  rr_side: "mens" | "womens" | null;
  task_label: string;
  catalog_task_id: string | null;
  sort_order: number;
  color: string | null;
  marker_type?: string | null;
  markerType?: string | null;
  text_style?: unknown;
  textStyle?: unknown;
  is_coverage: boolean;
  coverage_side?: "A" | "B" | null;
  source_work_item_id?: string | null;
  is_one_off?: boolean | null;
};

type BreakAssignmentRow = {
  night_id: string;
  tm_id: string;
  group_num: number;
  break_wave?: number;
  slot_ref?: string | null;
};

function mapNightSlotTask(r: NightSlotTaskRow) {
  return {
    id: r.id,
    nightId: r.night_id,
    slotKey: r.slot_key,
    slotType: r.slot_type,
    rrSide: r.rr_side,
    taskLabel: r.task_label,
    catalogTaskId: r.catalog_task_id,
    sortOrder: r.sort_order ?? 0,
    color: r.color ?? null,
    markerType: (r.marker_type ?? r.markerType ?? null) as any,
    textStyle: normalizeTaskTextStyle(r.text_style ?? r.textStyle ?? null),
    isCoverage: r.is_coverage ?? false,
    coverageSide: (r.coverage_side ?? null) as "A" | "B" | null,
    sourceWorkItemId: (r.source_work_item_id ?? null) as string | null,
    isOneOff: r.is_one_off === true,
  };
}

function mapBreakAssignment(r: BreakAssignmentRow) {
  return {
    nightId: r.night_id,
    tmId: r.tm_id,
    groupNum: r.group_num,
    breakWave: r.break_wave ?? 1,
    slotRef: r.slot_ref ?? null,
  };
}

export type NightSecondaryBundlePayload = {
  notes: string;
  tasks: ReturnType<typeof mapNightSlotTask>[];
  breakAssignments: ReturnType<typeof mapBreakAssignment>[];
  cardBorders: Record<string, string>;
  calledOffIds: string[];
  rawBreakRows: ReturnType<typeof mapBreakAssignment>[];
  recentZoneHistory: ZoneHistoryRecord;
  sideTasks: ReturnType<typeof mapPrintSideTasks>;
};

export async function buildNightSecondaryBundle(
  isoDate: string,
  options: { includeSideTasks?: boolean; printOnly?: boolean } = {},
): Promise<NightSecondaryBundlePayload> {
  const supabase = getSupabase();
  const anchorDate = parseLocalDateISO(isoDate);
  const printOnly = options.printOnly === true;

  const [nightId, recentZoneHistory] = await Promise.all([
    getCachedNightIdForDate(isoDate),
    printOnly
      ? Promise.resolve({} as ZoneHistoryRecord)
      : fetchRecentZoneHistoryServer(anchorDate, 7, supabase),
  ]);

  const [notesRes, tasksRes, breaksRes, bordersRes, callOffsRes, sideTasksRes] = await Promise.all([
    nightId
      ? supabase.from("nights").select("notes").eq("id", nightId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    nightId
      ? supabase
          .from("night_slot_tasks")
          .select("*")
          .eq("night_id", nightId)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    nightId && !printOnly
      ? supabase
          .from("break_assignments")
          .select("*")
          .eq("night_id", nightId)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    nightId && !printOnly
      ? supabase
          .from("night_card_borders")
          .select("slot_key, border_color")
          .eq("night_id", nightId)
      : Promise.resolve({ data: [], error: null }),
    // call_offs is keyed by night_date (not night_id). Without this, Mark
    // unavailable only clears board slots; the roster never learns they are
    // called off and they reappear under "On Sheet — Not Placed" after poll.
    printOnly
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("call_offs").select("tm_id").eq("night_date", isoDate),
    options.includeSideTasks
      ? supabase
          .from("ops_work_items")
          .select("id, title, status, priority, assignee_tm_id, completed_at, updated_by_name, created_at")
          .eq("work_type", "task")
          .eq("department", "graves")
          .eq("due_date", isoDate)
          .eq("active", true)
          .eq("is_slot_default", false)
          .eq("approval_state", "approved")
          .is("archived_at", null)
          .neq("status", "cancelled")
          .or("due_shift.is.null,due_shift.eq.graves,due_shift.eq.any")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (callOffsRes.error) {
    console.warn(
      "[nightSecondaryBundle] call_offs fetch failed",
      callOffsRes.error.message,
    );
  }

  const cardBorders: Record<string, string> = {};
  (bordersRes.data || []).forEach((r: { slot_key?: string; border_color?: string }) => {
    if (r.slot_key && r.border_color) cardBorders[r.slot_key] = r.border_color;
  });

  const breakRows = (breaksRes.data ?? []) as BreakAssignmentRow[];
  const mappedBreaks = breakRows.map(mapBreakAssignment);
  const mappedTasks = ((tasksRes.data ?? []) as NightSlotTaskRow[]).map(mapNightSlotTask);

  if (sideTasksRes.error) {
    console.warn(
      "[nightSecondaryBundle] side task fetch failed",
      sideTasksRes.error.message,
    );
  }
  const sideTaskRows = (sideTasksRes.data ?? []) as PrintSideTaskRow[];
  const assigneeIds = Array.from(
    new Set(sideTaskRows.map((row) => row.assignee_tm_id).filter((id): id is string => !!id)),
  );
  const nameMap = new Map<string, string>();
  if (assigneeIds.length > 0) {
    const { data: profiles, error: profileError } = await supabase
      .from("tm_profiles")
      .select("tm_id, display_name, full_name")
      .in("tm_id", assigneeIds);
    if (profileError) {
      console.warn("[nightSecondaryBundle] side task assignee fetch failed", profileError.message);
    }
    for (const profile of profiles ?? []) {
      const row = profile as { tm_id: string; display_name?: string | null; full_name?: string | null };
      nameMap.set(row.tm_id, row.display_name || row.full_name || row.tm_id);
    }
  }

  const calledOffIds = Array.from(
    new Set(
      ((callOffsRes.data ?? []) as Array<{ tm_id?: string | null }>)
        .map((r) => (typeof r.tm_id === "string" ? r.tm_id.trim() : ""))
        .filter(Boolean),
    ),
  );

  return {
    notes: (notesRes.data as { notes?: string } | null)?.notes ?? "",
    tasks: mappedTasks,
    breakAssignments: mappedBreaks,
    cardBorders,
    calledOffIds,
    rawBreakRows: mappedBreaks,
    recentZoneHistory,
    sideTasks: mapPrintSideTasks(sideTaskRows, nameMap),
  };
}
