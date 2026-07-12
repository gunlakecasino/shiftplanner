/**
 * Server loader for PlacementPad Phase C overlap task insights.
 * Reuses PR3 loadOverlapTaskHistoryServer + standing pool read (Apply path).
 * Isolated from opsMutations.server.ts to minimize concurrent PR conflicts.
 */

import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import {
  buildOverlapTaskInsight,
  overlapInsightBandFromSlotKey,
  type OverlapInsightBand,
  type OverlapTaskHistoryRow,
  type OverlapTaskInsightModel,
  type OverlapTonightChip,
} from "@/lib/shiftbuilder/rotation/buildOverlapTaskInsight";
import {
  dedupeOverlapPoolTasks,
  overlapBandFromSlotKey,
} from "@/lib/shiftbuilder/rotation/overlapTaskApply";
import { loadOverlapTaskHistoryServer } from "@/lib/shiftbuilder/rotation/overlapTaskHistory.server";

function adminClient() {
  const client = createAdminClientSafe();
  if (!client) throw new Error("Service role not configured");
  return client;
}

export type GetOverlapTaskInsightsParams = {
  /** UI or DB slot key — used to derive band when `band` omitted. */
  slotKey?: string;
  band?: OverlapInsightBand;
  /** Tonight ISO date YYYY-MM-DD (required if nightId omitted). */
  nightDate?: string;
  /** Prefer nightId so we reuse the fair-apply history loader. */
  nightId?: string | null;
  tmId?: string | null;
  tonightChips?: OverlapTonightChip[];
  /** Lookback grave nights (default 30). */
  windowNights?: number;
};

async function resolveNightId(
  client: ReturnType<typeof adminClient>,
  nightId: string | null | undefined,
  nightDate: string | null | undefined,
): Promise<{ nightId: string; tonightIso: string }> {
  const id = String(nightId ?? "").trim();
  if (id) {
    const { data, error } = await client
      .from("nights")
      .select("id, night_date")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(`overlap insights night read: ${error.message}`);
    const iso = String((data as { night_date?: string } | null)?.night_date ?? "").slice(
      0,
      10,
    );
    if (!iso) throw new Error("overlap insights: night has no night_date");
    return { nightId: id, tonightIso: iso };
  }

  const date = String(nightDate ?? "").slice(0, 10);
  if (!date) throw new Error("nightDate or nightId is required");

  const { data, error } = await client
    .from("nights")
    .select("id, night_date")
    .eq("night_date", date)
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`overlap insights night by date: ${error.message}`);
  if (data?.id) {
    return {
      nightId: String((data as { id: string }).id),
      tonightIso: String((data as { night_date: string }).night_date).slice(0, 10),
    };
  }

  // Night row may not exist yet (unsaved draft) — still show pool with empty history
  return { nightId: "", tonightIso: date };
}

/**
 * Load standing pool + band task history, then build insight model.
 */
export async function getOverlapTaskInsightsServer(
  params: GetOverlapTaskInsightsParams,
): Promise<OverlapTaskInsightModel> {
  const band: OverlapInsightBand | null =
    params.band ??
    (params.slotKey ? overlapInsightBandFromSlotKey(params.slotKey) : null);
  if (!band) {
    throw new Error("band or valid overlap slotKey is required");
  }

  const windowNights = params.windowNights ?? 30;
  const client = adminClient();
  const { nightId, tonightIso } = await resolveNightId(
    client,
    params.nightId,
    params.nightDate,
  );

  // Standing pool (same source as Apply Overlap) + Phase D day/priority filter for display
  const { data: workRows, error: workErr } = await client
    .from("ops_work_items")
    .select(
      "id, slot_key, title, task_color, priority, recurrence_days, pool_sort_order",
    )
    .eq("is_slot_default", true)
    .eq("active", true)
    .eq("department", "graves")
    .is("archived_at", null)
    .not("slot_key", "is", null);

  if (workErr) {
    throw new Error(`overlap insights pool read failed: ${workErr.message}`);
  }

  const {
    normalizeRecurrenceDays,
    selectOverlapPoolForNight,
  } = await import("@/lib/shiftbuilder/rotation/overlapPoolSelect");

  const rawPool: Array<{
    id: string;
    label: string;
    color?: string | null;
    band: OverlapInsightBand;
  }> = [];
  const metaById = new Map<
    string,
    {
      priority: string;
      recurrenceDays: number[] | null;
      poolSortOrder: number | null;
    }
  >();
  for (const r of workRows ?? []) {
    const sk = String((r as { slot_key?: string }).slot_key ?? "");
    const b = overlapBandFromSlotKey(sk);
    if (b !== band) continue;
    const id = String((r as { id: string }).id);
    const pso = (r as { pool_sort_order?: number | null }).pool_sort_order;
    metaById.set(id, {
      priority: String((r as { priority?: string }).priority ?? "normal"),
      recurrenceDays: normalizeRecurrenceDays(
        (r as { recurrence_days?: unknown }).recurrence_days,
      ),
      poolSortOrder:
        pso == null || !Number.isFinite(Number(pso)) ? null : Number(pso),
    });
    rawPool.push({
      id,
      label: String((r as { title?: string }).title ?? ""),
      color: ((r as { task_color?: string | null }).task_color as string | null) ?? null,
      band: b,
    });
  }
  const deduped = dedupeOverlapPoolTasks(rawPool);
  // Show tonight's eligible pool (day filter); order by priority for pad readability
  const selectable = deduped.map((t) => {
    const m = metaById.get(t.id);
    return {
      id: t.id,
      label: t.label,
      color: t.color ?? null,
      band: t.band as "AM" | "PM",
      priority: m?.priority ?? "normal",
      recurrenceDays: m?.recurrenceDays ?? null,
      poolSortOrder: m?.poolSortOrder ?? null,
    };
  });
  // seatsCount large so we list all eligible (not staffing-cut); pad shows full tonight set
  const { selected: tonightEligible } = selectOverlapPoolForNight(
    selectable,
    99,
    tonightIso,
  );
  const pool = tonightEligible.map((t) => ({
    id: t.id,
    label: t.label,
  }));

  // History via shared PR3 loader (when night exists)
  let history: OverlapTaskHistoryRow[] = [];
  if (nightId) {
    const hist = await loadOverlapTaskHistoryServer(client, {
      nightId,
      band,
      windowNights,
    });

    const tmIds = [...new Set(hist.events.map((e) => e.tmId).filter(Boolean))];
    const nameMap = new Map<string, string>();
    if (tmIds.length) {
      const { data: profiles } = await client
        .from("tm_profiles")
        .select("tm_id, display_name, full_name")
        .in("tm_id", tmIds);
      for (const p of profiles ?? []) {
        const row = p as {
          tm_id: string;
          display_name: string | null;
          full_name: string | null;
        };
        nameMap.set(row.tm_id, row.display_name || row.full_name || row.tm_id);
      }
    }

    history = hist.events.map((e) => {
      const label =
        String(e.taskLabel ?? "").trim() ||
        // Fallback: if taskKey looks like a uuid, keep short; else use key as label
        (e.taskKey.includes("-") && e.taskKey.length > 20
          ? e.taskKey
          : e.taskKey);
      return {
        nightDate: e.nightDate,
        tmId: e.tmId,
        tmName: nameMap.get(e.tmId) || e.tmId,
        taskLabel: label,
        taskKey: e.taskKey,
        isOneOff: e.isOneOff,
      };
    });
  }

  return buildOverlapTaskInsight({
    band,
    tonightIso,
    tmId: params.tmId ?? null,
    tonightChips: params.tonightChips ?? [],
    standingPool: pool,
    history,
    windowNights,
  });
}
