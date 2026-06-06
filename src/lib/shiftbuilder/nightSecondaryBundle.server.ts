import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { parseLocalDateISO } from "./dateUtils";
import { getCachedNightIdForDate } from "./data.server";
import { fetchRecentZoneHistoryServer } from "./zoneHistory.server";
import type { ZoneHistoryRecord } from "./zoneHistory";

let _client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return _client;
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
  is_coverage: boolean;
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
    isCoverage: r.is_coverage ?? false,
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
};

export async function buildNightSecondaryBundle(isoDate: string): Promise<NightSecondaryBundlePayload> {
  const supabase = getSupabase();
  const anchorDate = parseLocalDateISO(isoDate);

  const [nightId, recentZoneHistory] = await Promise.all([
    getCachedNightIdForDate(isoDate),
    fetchRecentZoneHistoryServer(anchorDate, 7, supabase),
  ]);

  const [notesRes, tasksRes, breaksRes, bordersRes] = await Promise.all([
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
    nightId
      ? supabase
          .from("break_assignments")
          .select("*")
          .eq("night_id", nightId)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    nightId
      ? supabase
          .from("night_card_borders")
          .select("slot_key, border_color")
          .eq("night_id", nightId)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const cardBorders: Record<string, string> = {};
  (bordersRes.data || []).forEach((r: { slot_key?: string; border_color?: string }) => {
    if (r.slot_key && r.border_color) cardBorders[r.slot_key] = r.border_color;
  });

  const breakRows = (breaksRes.data ?? []) as BreakAssignmentRow[];
  const mappedBreaks = breakRows.map(mapBreakAssignment);
  const mappedTasks = ((tasksRes.data ?? []) as NightSlotTaskRow[]).map(mapNightSlotTask);

  return {
    notes: (notesRes.data as { notes?: string } | null)?.notes ?? "",
    tasks: mappedTasks,
    breakAssignments: mappedBreaks,
    cardBorders,
    calledOffIds: [],
    rawBreakRows: mappedBreaks,
    recentZoneHistory,
  };
}