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

/**
 * Set TM grave_pool (null = ineligible).
 * Admin client only — callers MUST already have enforced canAccessSudo ∥ canManageTeam
 * (mutations route via requireOpsAnyPermission). Do not call from unauthenticated code.
 */
export async function setTMGravePoolServer(
  tmId: string,
  value: GravePoolValue,
): Promise<{ ok: true }> {
  const id = typeof tmId === "string" ? tmId.trim() : "";
  if (!id || id === "undefined" || id === "null") {
    throw new Error("setTMGravePool: tmId is required");
  }
  if (value !== null && value !== "Full" && value !== "AM" && value !== "PM") {
    throw new Error(`setTMGravePool: invalid grave_pool value "${String(value)}"`);
  }

  const client = adminClient();
  const { data, error } = await client
    .from("tm_profiles")
    .update({ grave_pool: value, updated_at: new Date().toISOString() })
    .eq("tm_id", id)
    .select("tm_id");

  if (error) {
    throw new Error(
      `setTMGravePool failed for ${id} → ${value ?? "NULL"}: ${error.message}`,
    );
  }
  if (!data || data.length === 0) {
    throw new Error(`setTMGravePool: no tm_profiles row for tm_id=${id}`);
  }
  return { ok: true };
}

/**
 * Update TM display_name.
 * Admin client only — callers MUST already have enforced canAccessSudo ∥ canManageTeam
 * (mutations route via requireOpsAnyPermission). Do not call from unauthenticated code.
 */
export async function setTMDisplayNameServer(
  tmId: string,
  newDisplayName: string,
): Promise<{ ok: true }> {
  const id = typeof tmId === "string" ? tmId.trim() : "";
  if (!id || id === "undefined" || id === "null") {
    throw new Error("setTMDisplayName: tmId is required");
  }
  const trimmed = newDisplayName.trim();
  if (!trimmed) {
    throw new Error("setTMDisplayName: new display name cannot be empty");
  }

  const client = adminClient();
  const { data, error } = await client
    .from("tm_profiles")
    .update({ display_name: trimmed, updated_at: new Date().toISOString() })
    .eq("tm_id", id)
    .select("tm_id");

  if (error) {
    throw new Error(
      `setTMDisplayName failed for ${id} → "${trimmed}": ${error.message}`,
    );
  }
  if (!data || data.length === 0) {
    throw new Error(`setTMDisplayName: no tm_profiles row for tm_id=${id}`);
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// SUDO / Team privileged writes (session-gated via mutations route)
// Admin client only — callers MUST enforce permission first.
// ---------------------------------------------------------------------------

export type SoftDeleteReason = "separated" | "LOA" | "transferred" | "other";

export type UpsertTMInput = {
  tmId?: string;
  displayName: string;
  fullName?: string | null;
  employeeName?: string | null;
  active?: boolean;
  gravePool?: string | null;
  primarySection?: string | null;
  gender?: "M" | "F" | null;
  tieBreakRank?: number | null;
  skillScore?: number | null;
  status?: string;
  slotPreference?: string | null;
  notes?: string | null;
};

function deriveTmId(displayName: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const suffix = Math.random().toString(16).slice(2, 8);
  return `tm_${slug || "tm"}_${suffix}`;
}

function requireTmId(tmId: unknown, label = "tmId"): string {
  const id = typeof tmId === "string" ? tmId.trim() : "";
  if (!id || id === "undefined" || id === "null") {
    throw new Error(`${label} is required`);
  }
  return id;
}

/** Upsert night_tm_status for one TM on one night. */
export async function updateNightTmStatusServer(params: {
  nightId: string;
  tmId: string;
  status: string;
  note?: string | null;
  tmName?: string | null;
}): Promise<{ ok: true }> {
  const nightId = typeof params.nightId === "string" ? params.nightId.trim() : "";
  if (!nightId) throw new Error("updateNightTmStatus: nightId is required");
  const tmId = requireTmId(params.tmId, "updateNightTmStatus: tmId");
  const status = typeof params.status === "string" ? params.status.trim() : "";
  if (!status) throw new Error("updateNightTmStatus: status is required");

  const payload: Record<string, unknown> = {
    night_id: nightId,
    tm_id: tmId,
    status,
    note: params.note ?? null,
    updated_at: new Date().toISOString(),
  };
  if (params.tmName) payload.tm_name = params.tmName;

  const client = adminClient();
  const { error } = await client
    .from("night_tm_status")
    .upsert(payload, { onConflict: "night_id,tm_id" });
  if (error) throw new Error(`updateNightTmStatus failed: ${error.message}`);
  return { ok: true };
}

/** Insert or update a TM profile. Returns tm_id. */
export async function upsertTMServer(input: UpsertTMInput): Promise<{ tmId: string }> {
  const displayName =
    typeof input.displayName === "string" ? input.displayName.trim() : "";
  if (!displayName) throw new Error("upsertTM: displayName is required");

  const isInsert = !input.tmId;
  const tmId = input.tmId ? requireTmId(input.tmId, "upsertTM: tmId") : deriveTmId(displayName);

  const payload: Record<string, unknown> = {
    tm_id: tmId,
    display_name: displayName,
    full_name: input.fullName ?? null,
    employee_name: input.employeeName ?? null,
    active: input.active ?? true,
    grave_pool: input.gravePool ?? null,
    primary_section: input.primarySection ?? null,
    gender: input.gender ?? null,
    tie_break_rank: input.tieBreakRank ?? null,
    skill_score: input.skillScore ?? null,
    status: input.status ?? "active",
    slot_preference: input.slotPreference ?? null,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  };

  const client = adminClient();
  if (isInsert) {
    const { error } = await client.from("tm_profiles").insert(payload);
    if (error) throw new Error(`upsertTM insert failed: ${error.message}`);
  } else {
    const { data, error } = await client
      .from("tm_profiles")
      .update(payload)
      .eq("tm_id", tmId)
      .select("tm_id");
    if (error) throw new Error(`upsertTM update failed: ${error.message}`);
    if (!data || data.length === 0) {
      throw new Error(`upsertTM: no tm_profiles row for tm_id=${tmId}`);
    }
  }
  return { tmId };
}

/** Soft-delete a TM (active=false). */
export async function softDeleteTMServer(
  tmId: string,
  reason: SoftDeleteReason = "separated",
): Promise<{ ok: true }> {
  const id = requireTmId(tmId, "softDeleteTM: tmId");
  const allowed: SoftDeleteReason[] = ["separated", "LOA", "transferred", "other"];
  if (!allowed.includes(reason)) {
    throw new Error(`softDeleteTM: invalid reason "${reason}"`);
  }

  const client = adminClient();
  const { data, error } = await client
    .from("tm_profiles")
    .update({
      active: false,
      status: reason,
      status_date: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    })
    .eq("tm_id", id)
    .select("tm_id");
  if (error) throw new Error(`softDeleteTM failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`softDeleteTM: no tm_profiles row for tm_id=${id}`);
  }
  return { ok: true };
}

/** Restore a soft-deleted TM. */
export async function restoreTMServer(tmId: string): Promise<{ ok: true }> {
  const id = requireTmId(tmId, "restoreTM: tmId");
  const client = adminClient();
  const { data, error } = await client
    .from("tm_profiles")
    .update({
      active: true,
      status: "active",
      status_date: null,
      status_note: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tm_id", id)
    .select("tm_id");
  if (error) throw new Error(`restoreTM failed: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error(`restoreTM: no tm_profiles row for tm_id=${id}`);
  }
  return { ok: true };
}

/** Upsert a per-slot skill score (0-10). */
export async function upsertSlotSkillServer(args: {
  tmId: string;
  slotId: string;
  score: number;
}): Promise<{ ok: true }> {
  const tmId = requireTmId(args.tmId, "upsertSlotSkill: tmId");
  const slotId = typeof args.slotId === "string" ? args.slotId.trim() : "";
  if (!slotId) throw new Error("upsertSlotSkill: slotId is required");
  const score = Math.max(0, Math.min(10, Math.round(Number(args.score))));

  const client = adminClient();
  const { error } = await client.from("tm_slot_skills").upsert(
    {
      tm_id: tmId,
      slot_id: slotId,
      score,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tm_id,slot_id" },
  );
  if (error) throw new Error(`upsertSlotSkill failed: ${error.message}`);
  return { ok: true };
}

export async function addTMPreferenceServer(input: {
  tmId: string;
  stance: string;
  strength: string;
  target: string;
  note?: string | null;
}): Promise<{ ok: true }> {
  const tmId = requireTmId(input.tmId, "addTMPreference: tmId");
  const stance = typeof input.stance === "string" ? input.stance.trim() : "";
  const strength = typeof input.strength === "string" ? input.strength.trim() : "";
  const target = typeof input.target === "string" ? input.target.trim() : "";
  if (!stance || !strength || !target) {
    throw new Error("addTMPreference: stance, strength, and target are required");
  }

  const client = adminClient();
  const { error } = await client.from("tm_preferences").insert({
    tm_id: tmId,
    stance,
    strength,
    target,
    note: input.note ?? null,
    added_date: new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(`addTMPreference failed: ${error.message}`);
  return { ok: true };
}

export async function deleteTMPreferenceServer(id: string): Promise<{ ok: true }> {
  const prefId = typeof id === "string" ? id.trim() : "";
  if (!prefId) throw new Error("deleteTMPreference: id is required");

  const client = adminClient();
  const { error } = await client.from("tm_preferences").delete().eq("id", prefId);
  if (error) throw new Error(`deleteTMPreference failed: ${error.message}`);
  return { ok: true };
}

export async function addTMAccommodationServer(input: {
  tmId: string;
  type: string;
  severity: string;
  target?: string | null;
  note: string;
  status?: string;
}): Promise<{ ok: true }> {
  const tmId = requireTmId(input.tmId, "addTMAccommodation: tmId");
  const type = typeof input.type === "string" ? input.type.trim() : "";
  const severity = typeof input.severity === "string" ? input.severity.trim() : "";
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (!type || !severity || !note) {
    throw new Error("addTMAccommodation: type, severity, and note are required");
  }

  const client = adminClient();
  const { error } = await client.from("tm_accommodations").insert({
    tm_id: tmId,
    type,
    severity,
    target: input.target ?? null,
    note,
    status: input.status ?? "active",
    added_date: new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(`addTMAccommodation failed: ${error.message}`);
  return { ok: true };
}

export async function deleteTMAccommodationServer(id: string): Promise<{ ok: true }> {
  const accId = typeof id === "string" ? id.trim() : "";
  if (!accId) throw new Error("deleteTMAccommodation: id is required");

  const client = adminClient();
  const { error } = await client.from("tm_accommodations").delete().eq("id", accId);
  if (error) throw new Error(`deleteTMAccommodation failed: ${error.message}`);
  return { ok: true };
}

export type UpdateEngineConfigInput = {
  placementMethod?: string;
  grokReasoningEffort?: string;
  notes?: string | null;
  weights?: Record<string, number>;
  eligibilityRules?: unknown[];
};

/** Update or create the active engine_config row. */
export async function updateActiveEngineConfigServer(
  updates: UpdateEngineConfigInput,
): Promise<{ ok: true }> {
  const client = adminClient();

  const { data: activeRows, error: findErr } = await client
    .from("engine_config")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (findErr) {
    throw new Error(`Could not find active engine_config: ${findErr.message}`);
  }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.placementMethod) {
    const allowed = ["greedy", "weighted", "grok-hybrid"];
    if (!allowed.includes(updates.placementMethod)) {
      throw new Error(`updateActiveEngineConfig: invalid placementMethod`);
    }
    payload.placement_method = updates.placementMethod;
  }
  if (updates.grokReasoningEffort) {
    const allowed = ["none", "low", "medium", "high"];
    if (!allowed.includes(updates.grokReasoningEffort)) {
      throw new Error(`updateActiveEngineConfig: invalid grokReasoningEffort`);
    }
    payload.grok_reasoning_effort = updates.grokReasoningEffort;
  }
  if (updates.notes !== undefined) payload.notes = updates.notes;
  if (updates.weights) payload.weights = updates.weights;
  if (updates.eligibilityRules) payload.eligibility_rules = updates.eligibilityRules;

  if (activeRows && activeRows.length > 0) {
    const { error: updErr } = await client
      .from("engine_config")
      .update(payload)
      .eq("id", activeRows[0].id);
    if (updErr) throw new Error(`Failed to update engine_config: ${updErr.message}`);
  } else {
    const { error: insErr } = await client.from("engine_config").insert({
      ...payload,
      is_active: true,
      weights: updates.weights || {},
      thresholds: {},
      slot_priority: {},
      created_at: new Date().toISOString(),
    });
    if (insErr) throw new Error(`Failed to create engine_config row: ${insErr.message}`);
  }
  return { ok: true };
}

