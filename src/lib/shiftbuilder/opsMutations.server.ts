import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { uiToDb } from "@/lib/shiftbuilder/slot-keys";
import type { BreakGroupValue } from "@/lib/shiftbuilder/breakGroupResolve";
import type { MoveTaskParams } from "./data";

export type UpsertAssignmentParams = {
  nightId: string;
  slotKey: string;
  tmId: string | null;
  slotType?: string;
  rrSide?: "mens" | "womens" | null;
  isLocked?: boolean;
};

export type UpsertBreakParams = {
  nightId: string;
  tmId: string;
  groupNum: BreakGroupValue;
  slotRef?: string | null;
  breakWave?: number;
};

export type AddTaskParams = {
  nightId: string;
  slotKey: string;
  slotType: "zone" | "rr" | "aux" | "overlap";
  rrSide?: "mens" | "womens" | null;
  taskLabel: string;
  catalogTaskId?: string | null;
  sortOrder?: number;
  color?: string | null;
  isCoverage?: boolean;
  coverageSide?: "A" | "B" | null;
};

export type RemoveTaskParams = {
  nightId: string;
  slotKey: string;
  slotType: "zone" | "rr" | "aux" | "overlap";
  rrSide?: "mens" | "womens" | null;
  taskLabel: string;
};

function adminClient() {
  const client = createAdminClientSafe();
  if (!client) throw new Error("Service role not configured");
  return client;
}

function isDbSlotKey(slotKey: string): boolean {
  return /^(zone_|rr_|aux_|support_|trash_|overlap_|admin$|z9_sr$)/.test(slotKey);
}

function normalizeSlotKeys(
  slotKey: string,
  slotType: string,
  rrSide: string | null,
): { finalSlotKey: string; finalSlotType: string; finalRrSide: string | null } {
  let finalSlotKey = slotKey;
  let finalSlotType = slotType;
  let finalRrSide = rrSide;
  if (!isDbSlotKey(slotKey)) {
    try {
      const mapped = uiToDb(slotKey);
      finalSlotKey = mapped.slot_key;
      finalSlotType = mapped.slot_type;
      finalRrSide = mapped.rr_side;
    } catch {
      /* leave as-is */
    }
  }
  return { finalSlotKey, finalSlotType, finalRrSide };
}

export async function upsertZoneAssignmentServer(params: UpsertAssignmentParams) {
  const {
    nightId,
    slotKey,
    tmId,
    slotType = "zone",
    rrSide = null,
    isLocked = false,
  } = params;

  if (!nightId || !slotKey) {
    throw new Error("nightId and slotKey are required");
  }

  const { finalSlotKey, finalSlotType, finalRrSide } = normalizeSlotKeys(
    slotKey,
    slotType,
    rrSide,
  );

  if (!tmId) {
    return deleteZoneAssignmentServer({
      nightId,
      uiKey: slotKey,
      slotType: finalSlotType,
      rrSide: finalRrSide,
    });
  }

  const client = adminClient();
  const { error } = await client.from("zone_assignments").upsert(
    {
      night_id: nightId,
      slot_key: finalSlotKey,
      slot_type: finalSlotType,
      tm_id: tmId,
      rr_side: finalRrSide,
      is_filled: true,
      is_locked: isLocked,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "night_id,slot_type,slot_key,rr_side" },
  );

  if (error) throw new Error(`Failed to save assignment: ${error.message}`);
  return { success: true, action: "upserted" as const };
}

export async function deleteZoneAssignmentServer(params: {
  nightId: string;
  uiKey: string;
  slotType?: string;
  rrSide?: string | null;
}) {
  const client = adminClient();
  const { nightId, uiKey, slotType = "zone", rrSide = null } = params;

  if (!nightId || !uiKey) {
    throw new Error("nightId and uiKey are required");
  }

  let canonical: { slot_key: string; slot_type: string; rr_side: string | null };
  if (isDbSlotKey(uiKey)) {
    canonical = { slot_key: uiKey, slot_type: slotType, rr_side: rrSide };
  } else {
    try {
      canonical = uiToDb(uiKey) as typeof canonical;
    } catch {
      canonical = { slot_key: uiKey, slot_type: slotType, rr_side: rrSide };
    }
  }

  const variants = [
    canonical,
    { slot_key: canonical.slot_key, slot_type: canonical.slot_type, rr_side: null },
    { slot_key: uiKey, slot_type: slotType, rr_side: rrSide },
    { slot_key: uiKey.toLowerCase(), slot_type: slotType, rr_side: rrSide },
    { slot_key: uiKey, slot_type: slotType, rr_side: null },
    { slot_key: uiKey.toLowerCase(), slot_type: slotType, rr_side: null },
  ];

  let totalDeleted = 0;
  for (const v of variants) {
    let q = client
      .from("zone_assignments")
      .delete()
      .eq("night_id", nightId)
      .eq("slot_key", v.slot_key)
      .eq("slot_type", v.slot_type);

    if (v.rr_side != null) q = q.eq("rr_side", v.rr_side);
    else q = q.is("rr_side", null);

    const { error, count } = await q;
    if (!error && count) totalDeleted += count;
  }

  return { success: true, rowsDeleted: totalDeleted };
}

export async function batchApplyDraftAssignmentsServer(
  nightId: string,
  slots: Array<{
    slotKey: string;
    slotType: string;
    rrSide: string | null;
    tmId: string | null;
  }>,
): Promise<void> {
  const client = adminClient();
  const now = new Date().toISOString();
  const toUpsert = slots.filter((s) => s.tmId !== null);
  const toDelete = slots.filter((s) => s.tmId === null);
  const errors: string[] = [];

  if (toUpsert.length > 0) {
    const rows = toUpsert.map((s) => ({
      night_id: nightId,
      slot_key: s.slotKey,
      slot_type: s.slotType,
      rr_side: s.rrSide,
      tm_id: s.tmId,
      is_filled: true,
      is_locked: false,
      updated_at: now,
    }));
    const { error } = await client
      .from("zone_assignments")
      .upsert(rows, { onConflict: "night_id,slot_type,slot_key,rr_side" });
    if (error) errors.push(`batch upsert failed: ${error.message}`);
  }

  if (toDelete.length > 0) {
    const results = await Promise.allSettled(
      toDelete.map(async (s) => {
        let q = client
          .from("zone_assignments")
          .delete()
          .eq("night_id", nightId)
          .eq("slot_key", s.slotKey)
          .eq("slot_type", s.slotType);
        if (s.rrSide) q = q.eq("rr_side", s.rrSide);
        const { error } = await q;
        if (error) throw new Error(`delete ${s.slotKey}: ${error.message}`);
      }),
    );
    results.forEach((r) => {
      if (r.status === "rejected") errors.push(r.reason?.message ?? "delete failed");
    });
  }

  if (errors.length > 0) throw new Error(errors.join("; "));
}

export async function toggleAssignmentLockServer(params: {
  nightId: string;
  slotKey: string;
  slotType: string;
  rrSide?: string | null;
  currentLocked: boolean;
}) {
  const client = adminClient();
  const { nightId, slotKey, slotType, rrSide = null, currentLocked } = params;

  let q = client
    .from("zone_assignments")
    .update({
      is_locked: !currentLocked,
      updated_at: new Date().toISOString(),
    })
    .eq("night_id", nightId)
    .eq("slot_key", slotKey)
    .eq("slot_type", slotType)
    // Guard against a stale read-modify-write: only flip the lock if the row still
    // matches the lock state the caller last observed. If another operator (or tab)
    // already toggled it, this update matches zero rows instead of clobbering theirs.
    .eq("is_locked", currentLocked);

  if (rrSide) q = q.eq("rr_side", rrSide);
  else q = q.is("rr_side", null);

  const { data, error } = await q.select("slot_key");
  if (error) throw new Error(`Failed to toggle lock: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("Lock state changed elsewhere — refresh and try again.");
  }
  return { success: true, newLocked: !currentLocked };
}

export async function setNightLockedServer(nightId: string, locked: boolean): Promise<void> {
  const client = adminClient();
  const { error } = await client
    .from("nights")
    .update({ is_locked: locked, updated_at: new Date().toISOString() })
    .eq("id", nightId);
  if (error) throw new Error(`Failed to ${locked ? "lock" : "unlock"} day: ${error.message}`);
}

export async function setNightPublishedServer(nightId: string, published: boolean): Promise<void> {
  const client = adminClient();
  const status = published ? "published" : "draft";
  const { error } = await client
    .from("nights")
    .update({
      status,
      ...(published ? { is_locked: false } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", nightId);
  if (error) throw new Error(`Failed to ${published ? "publish" : "unpublish"} day: ${error.message}`);
}

export async function setNightCardBorderServer(
  nightId: string,
  slotKey: string,
  color: string,
): Promise<void> {
  const client = adminClient();
  const { error } = await client.from("night_card_borders").upsert(
    {
      night_id: nightId,
      slot_key: slotKey,
      color,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "night_id,slot_key" },
  );
  if (error) throw new Error(`Failed to save card border: ${error.message}`);
}

export async function removeNightCardBorderServer(nightId: string, slotKey: string): Promise<void> {
  const client = adminClient();
  const { error } = await client
    .from("night_card_borders")
    .delete()
    .eq("night_id", nightId)
    .eq("slot_key", slotKey);
  if (error) throw new Error(`Failed to remove card border: ${error.message}`);
}

export async function upsertBreakAssignmentServer(params: UpsertBreakParams): Promise<void> {
  const { nightId, tmId, groupNum, slotRef = null, breakWave = 1 } = params;
  const client = adminClient();
  const { error } = await client.from("break_assignments").upsert(
    {
      night_id: nightId,
      tm_id: tmId,
      group_num: groupNum as BreakGroupValue,
      break_wave: breakWave,
      slot_ref: slotRef,
      sort_order: groupNum,
      is_wave_locked: false,
    },
    { onConflict: "night_id,tm_id" },
  );
  if (error) throw new Error(`Failed to save break group: ${error.message}`);
}

export async function deleteBreakAssignmentServer(nightId: string, tmId: string): Promise<void> {
  const client = adminClient();
  const { error } = await client
    .from("break_assignments")
    .delete()
    .eq("night_id", nightId)
    .eq("tm_id", tmId);
  if (error) throw new Error(`Failed to clear break assignment: ${error.message}`);
}

export async function addNightSlotTaskServer(params: AddTaskParams): Promise<void> {
  const client = adminClient();
  const {
    nightId,
    slotKey,
    slotType,
    rrSide = null,
    taskLabel,
    catalogTaskId = null,
    sortOrder = 0,
    color = null,
    isCoverage = false,
    coverageSide = null,
  } = params;

  const { error } = await client.from("night_slot_tasks").insert({
    night_id: nightId,
    slot_key: slotKey,
    slot_type: slotType,
    rr_side: rrSide,
    task_label: taskLabel,
    catalog_task_id: catalogTaskId,
    sort_order: sortOrder,
    color,
    is_coverage: isCoverage,
    coverage_side: coverageSide,
  });

  if (error && (error as { code?: string }).code !== "23505") {
    throw new Error(`Failed to add task: ${error.message}`);
  }
}

export async function removeNightSlotTaskServer(params: RemoveTaskParams): Promise<void> {
  const client = adminClient();
  const { nightId, slotKey, slotType, rrSide = null, taskLabel } = params;

  let q = client
    .from("night_slot_tasks")
    .delete()
    .eq("night_id", nightId)
    .eq("slot_key", slotKey)
    .eq("slot_type", slotType)
    .eq("task_label", taskLabel);

  if (rrSide) q = q.eq("rr_side", rrSide);
  else q = q.is("rr_side", null);

  const { error } = await q;
  if (error) throw new Error(`Failed to remove task: ${error.message}`);
}

export async function moveNightSlotTaskServer(params: MoveTaskParams): Promise<void> {
  const client = adminClient();
  const {
    nightId, taskLabel,
    fromSlotKey, fromSlotType, fromRrSide = null,
    toSlotKey, toSlotType, toRrSide = null,
  } = params;

  if (!nightId || !taskLabel || !fromSlotKey || !toSlotKey) {
    throw new Error('moveNightSlotTaskServer requires nightId, taskLabel, from/to slot keys');
  }

  // Locate the row by old composite (label is stable within night+slot), with rr_side
  let findQ = client
    .from("night_slot_tasks")
    .select('id, color, sort_order, catalog_task_id')
    .eq("night_id", nightId)
    .eq("slot_key", fromSlotKey)
    .eq("slot_type", fromSlotType)
    .eq("task_label", taskLabel);

  if (fromRrSide) {
    findQ = findQ.eq("rr_side", fromRrSide);
  } else {
    findQ = findQ.is("rr_side", null);
  }

  const { data: rows, error: findErr } = await findQ;
  if (findErr) {
    throw new Error(`Failed to locate task for move: ${findErr.message}`);
  }
  const existing = rows && rows.length > 0 ? rows[0] : null;
  if (!existing) {
    // Already moved or never existed — treat as success (idempotent for UI)
    return;
  }

  // Update the targeting columns (preserves id, color, sort, catalog link)
  const { error: updErr } = await client
    .from("night_slot_tasks")
    .update({
      slot_key: toSlotKey,
      slot_type: toSlotType,
      rr_side: toRrSide,
    })
    .eq('id', existing.id);

  if (updErr) {
    throw new Error(
      `Failed to move task: ${updErr.message || 'unknown error'} (code: ${updErr.code || 'unknown'})`
    );
  }
}

export async function updateNightSlotTaskCoverageSideServer(
  nightId: string,
  slotKey: string,
  taskLabel: string,
  coverageSide: "A" | "B" | null,
  rrSide: "mens" | "womens" | null = null,
): Promise<void> {
  const client = adminClient();
  let q = client
    .from("night_slot_tasks")
    .update({ coverage_side: coverageSide })
    .eq("night_id", nightId)
    .eq("slot_key", slotKey)
    .eq("task_label", taskLabel);

  if (rrSide) q = q.eq("rr_side", rrSide);
  else q = q.is("rr_side", null);

  const { error } = await q;
  if (error) throw new Error(`Failed to set coverage side: ${error.message}`);
}

export async function updateNightSlotTaskStyleServer(
  nightId: string,
  slotKey: string,
  taskLabel: string,
  textStyle: Record<string, unknown> | null,
  rrSide: "mens" | "womens" | null = null,
): Promise<void> {
  const client = adminClient();
  let q = client
    .from("night_slot_tasks")
    .update({ text_style: textStyle })
    .eq("night_id", nightId)
    .eq("slot_key", slotKey)
    .eq("task_label", taskLabel);

  if (rrSide) q = q.eq("rr_side", rrSide);
  else q = q.is("rr_side", null);

  const { error } = await q;
  if (error) throw new Error(`Failed to set task text style: ${error.message}`);
}

export async function updateNightSlotTaskColorServer(
  nightId: string,
  slotKey: string,
  taskLabel: string,
  color?: string | null,
  rrSide: "mens" | "womens" | null = null,
  markerType?: "highlight" | "underline" | "circle" | "none" | null,
): Promise<void> {
  const client = adminClient();
  const update: Record<string, unknown> = {};
  if (color !== undefined) update.color = color;
  if (markerType !== undefined) update.marker_type = markerType;

  let q = client
    .from("night_slot_tasks")
    .update(update)
    .eq("night_id", nightId)
    .eq("slot_key", slotKey)
    .eq("task_label", taskLabel);

  if (rrSide) q = q.eq("rr_side", rrSide);
  else q = q.is("rr_side", null);

  const { error } = await q;
  if (error) throw new Error(`Failed to set task color: ${error.message}`);
}

export async function updateNightSlotTaskLabelServer(
  nightId: string,
  slotKey: string,
  oldLabel: string,
  newLabel: string,
  rrSide: "mens" | "womens" | null = null,
): Promise<void> {
  const trimmed = newLabel.trim();
  if (!trimmed) throw new Error("Task label cannot be empty");

  const client = adminClient();
  let q = client
    .from("night_slot_tasks")
    .update({ task_label: trimmed })
    .eq("night_id", nightId)
    .eq("slot_key", slotKey)
    .eq("task_label", oldLabel);

  if (rrSide) q = q.eq("rr_side", rrSide);
  else q = q.is("rr_side", null);

  const { error } = await q;
  if (error) throw new Error(`Failed to update task label: ${error.message}`);
}

export async function replaceNightSlotTasksForSlotServer(params: {
  nightId: string;
  slotKey: string;
  rrSide: string | null;
  slotType: string;
  tasks: Array<{
    taskLabel: string;
    sortOrder?: number;
    taskColor?: string | null;
    isCoverage?: boolean;
  }>;
  /** When true, re-insert existing is_coverage rows after applying the new task list. */
  preserveCoverage?: boolean;
}): Promise<number> {
  const client = adminClient();
  const { nightId, slotKey, rrSide, slotType, tasks, preserveCoverage = false } = params;

  let preservedCoverage: Array<{
    taskLabel: string;
    sortOrder?: number;
    taskColor?: string | null;
    isCoverage: boolean;
  }> = [];

  if (preserveCoverage) {
    let covQ = client
      .from("night_slot_tasks")
      .select("task_label, sort_order, color")
      .eq("night_id", nightId)
      .eq("slot_key", slotKey)
      .eq("is_coverage", true);
    covQ = rrSide ? covQ.eq("rr_side", rrSide) : covQ.is("rr_side", null);
    const { data: covRows, error: covErr } = await covQ.order("sort_order", { ascending: true });
    if (covErr) throw new Error(`Task replace coverage read failed: ${covErr.message}`);
    preservedCoverage = (covRows ?? []).map((r, idx) => ({
      taskLabel: r.task_label as string,
      sortOrder: (r.sort_order as number | null) ?? idx,
      taskColor: (r.color as string | null) ?? null,
      isCoverage: true,
    }));
  }

  let del = client.from("night_slot_tasks").delete().eq("night_id", nightId).eq("slot_key", slotKey);
  del = rrSide ? del.eq("rr_side", rrSide) : del.is("rr_side", null);
  const { error: delErr } = await del;
  if (delErr) throw new Error(`Task replace delete failed: ${delErr.message}`);

  const mergedTasks = [
    ...tasks,
    ...preservedCoverage.map((t, idx) => ({
      ...t,
      sortOrder: tasks.length + idx,
    })),
  ];

  if (!mergedTasks.length) return 0;

  const inserts = mergedTasks.map((t, idx) => ({
    night_id: nightId,
    slot_key: slotKey,
    slot_type: slotType,
    rr_side: rrSide || null,
    task_label: t.taskLabel,
    catalog_task_id: null,
    sort_order: t.sortOrder ?? idx,
    color: t.taskColor ?? null,
    is_coverage: t.isCoverage ?? false,
  }));

  const { error: insErr } = await client.from("night_slot_tasks").insert(inserts);
  if (insErr) throw new Error(`Task replace insert failed: ${insErr.message}`);
  return mergedTasks.length;
}

export async function replaceAllNightSlotTasksServer(
  nightId: string,
  tasks: Array<{
    slotKey: string;
    slotType: string;
    rrSide: string | null;
    taskLabel: string;
    catalogTaskId?: string | null;
    sortOrder?: number;
    color?: string | null;
    isCoverage?: boolean;
  }>,
): Promise<void> {
  const client = adminClient();
  const { error: delErr } = await client.from("night_slot_tasks").delete().eq("night_id", nightId);
  if (delErr) throw new Error(`Failed to clear tasks: ${delErr.message}`);
  if (!tasks.length) return;

  const inserts = tasks.map((t) => ({
    night_id: nightId,
    slot_key: t.slotKey,
    slot_type: t.slotType,
    rr_side: t.rrSide,
    task_label: t.taskLabel,
    catalog_task_id: t.catalogTaskId ?? null,
    sort_order: t.sortOrder ?? 0,
    color: t.color ?? null,
    is_coverage: t.isCoverage ?? false,
  }));

  const { error: insErr } = await client.from("night_slot_tasks").insert(inserts);
  if (insErr) throw new Error(`Failed to copy tasks: ${insErr.message}`);
}

/** Mark a TM unavailable tonight — clears their placements and records call_offs. */
export async function markTmCallOffServer(params: {
  nightId: string;
  tmId: string;
  date: string;
  reason?: string | null;
}): Promise<{ ok: true }> {
  const { nightId, tmId, date, reason } = params;
  const client = adminClient();

  const zoneClear = await client
    .from("zone_assignments")
    .update({ tm_id: null, is_filled: false, is_locked: false })
    .eq("night_id", nightId)
    .eq("tm_id", tmId);
  if (zoneClear.error) {
    throw new Error(`markTmCallOff: zone clear failed: ${zoneClear.error.message}`);
  }

  const overlapClear = await client
    .from("overlap_assignments")
    .delete()
    .eq("night_id", nightId)
    .eq("tm_id", tmId);
  if (overlapClear.error) {
    throw new Error(`markTmCallOff: overlap clear failed: ${overlapClear.error.message}`);
  }

  const breakClear = await client
    .from("break_assignments")
    .delete()
    .eq("night_id", nightId)
    .eq("tm_id", tmId);
  if (breakClear.error) {
    throw new Error(`markTmCallOff: break clear failed: ${breakClear.error.message}`);
  }

  const upsert = await client.from("call_offs").upsert(
    {
      tm_id: tmId,
      night_date: date,
      reason: reason ?? null,
    },
    { onConflict: "tm_id,night_date" },
  );
  if (upsert.error) {
    throw new Error(`markTmCallOff: call_offs upsert failed: ${upsert.error.message}`);
  }

  return { ok: true };
}

/** Remove a call_offs row so the TM is available again tonight (does not restore prior slots). */
export async function unmarkTmCallOffServer(params: {
  tmId: string;
  date: string;
}): Promise<{ ok: true }> {
  const client = adminClient();
  const { error } = await client
    .from("call_offs")
    .delete()
    .eq("tm_id", params.tmId)
    .eq("night_date", params.date);
  if (error) {
    throw new Error(`unmarkTmCallOff: delete failed: ${error.message}`);
  }
  return { ok: true };
}

export type GravePoolValue = "Full" | "AM" | "PM" | null;

/** Set TM grave_pool (null = ineligible). Admin client; session-gated at mutations route. */
export async function setTMGravePoolServer(
  tmId: string,
  value: GravePoolValue,
): Promise<{ ok: true }> {
  if (!tmId) throw new Error("setTMGravePool: tmId is required");
  if (value !== null && value !== "Full" && value !== "AM" && value !== "PM") {
    throw new Error(`setTMGravePool: invalid grave_pool value "${String(value)}"`);
  }

  const client = adminClient();
  const { error } = await client
    .from("tm_profiles")
    .update({ grave_pool: value, updated_at: new Date().toISOString() })
    .eq("tm_id", tmId);

  if (error) {
    throw new Error(
      `setTMGravePool failed for ${tmId} → ${value ?? "NULL"}: ${error.message}`,
    );
  }
  return { ok: true };
}

/** Update TM display_name. Admin client; session-gated at mutations route. */
export async function setTMDisplayNameServer(
  tmId: string,
  newDisplayName: string,
): Promise<{ ok: true }> {
  if (!tmId) throw new Error("setTMDisplayName: tmId is required");
  const trimmed = newDisplayName.trim();
  if (!trimmed) {
    throw new Error("setTMDisplayName: new display name cannot be empty");
  }

  const client = adminClient();
  const { error } = await client
    .from("tm_profiles")
    .update({ display_name: trimmed, updated_at: new Date().toISOString() })
    .eq("tm_id", tmId);

  if (error) {
    throw new Error(
      `setTMDisplayName failed for ${tmId} → "${trimmed}": ${error.message}`,
    );
  }
  return { ok: true };
}