"use server";

/**
 * Privileged write actions surfaced from the SUDO window.
 *
 * These helpers don't go through a server action wrapper today because the
 * Supabase client already runs against the service-role key in dev (per
 * Brian's no-auth research-preview stance). When auth lands, every function
 * here should move behind a server-action with role checks.
 */

import { supabase } from "../supabase";
import type { NightStatusUpsert } from "./adpSchedule";
import type { PlacementMethod, GrokReasoningEffort } from "./engineConfig";

export interface NightStatusUpsertResult {
  /** Total rows successfully written (count of (tm_id, night_id) pairs) */
  written: number;
  /** Number of distinct night_dates we couldn't resolve to a night_id */
  missingNights: number;
  /** Dates for which no `nights` row existed */
  unresolvedDates: string[];
}

/**
 * Batch-upsert `night_tm_status` rows from a parsed ADP schedule.
 *
 * Resolves each `nightDate` to a `night_id` via the `nights` table. Dates
 * with no `nights` row are skipped and reported back so the operator knows
 * to either (a) extend the weeks/nights structure first, or (b) ignore
 * dates outside the active week.
 *
 * Uses upsert on (night_id, tm_id) so re-running the import is idempotent.
 */
export async function upsertNightTmStatusBatch(
  upserts: NightStatusUpsert[]
): Promise<NightStatusUpsertResult> {
  if (upserts.length === 0) {
    return { written: 0, missingNights: 0, unresolvedDates: [] };
  }

  // Collect distinct dates, resolve to night_ids.
  const distinctDates = Array.from(new Set(upserts.map((u) => u.nightDate)));
  const { data: nightRows, error: nightErr } = await supabase
    .from("nights")
    .select("id, night_date")
    .in("night_date", distinctDates);
  if (nightErr) {
    throw new Error(`Couldn't resolve nights: ${nightErr.message}`);
  }
  const dateToNightId = new Map<string, string>();
  (nightRows ?? []).forEach((r: any) => {
    dateToNightId.set(String(r.night_date), String(r.id));
  });

  const unresolvedDates = distinctDates.filter((d) => !dateToNightId.has(d));

  // Build the row payload — skip rows for nights we couldn't resolve.
  // Also dedupe by (night_id, tm_id) — Postgres rejects an upsert that
  // tries to affect the same row twice in a single statement, and ADP
  // exports occasionally have the same TM on two lines that both
  // fuzzy-match to the same tm_id.
  const seen = new Set<string>();
  const rows: Array<{ night_id: string; tm_id: string; tm_name: string; status: string; note: string }> = [];
  for (const u of upserts) {
    if (!dateToNightId.has(u.nightDate)) continue;
    const night_id = dateToNightId.get(u.nightDate)!;
    const key = `${night_id}|${u.tmId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      night_id,
      tm_id: u.tmId,
      tm_name: u.tmName,
      status: u.status,
      note: `imported from ADP, shift code: ${u.rawShiftCode || "(blank)"}`,
    });
  }

  if (rows.length === 0) {
    return {
      written: 0,
      missingNights: unresolvedDates.length,
      unresolvedDates,
    };
  }

  const { error: upsertErr } = await supabase
    .from("night_tm_status")
    .upsert(rows, { onConflict: "night_id,tm_id" });

  if (upsertErr) {
    throw new Error(`night_tm_status upsert failed: ${upsertErr.message}`);
  }

  return {
    written: rows.length,
    missingNights: unresolvedDates.length,
    unresolvedDates,
  };
}

// =====================================================================
// Schedule storage management (SUDO Schedules tab)
// =====================================================================

export interface ScheduleRecord {
  weekId: string;
  weekEnding: string; // ISO yyyy-mm-dd
  weekLabel: string;
  status: string;
  schedulePath: string;
  storageSizeBytes: number;
  storageUpdatedAt: string | null;
  storageCreatedAt: string | null;
  /** Number of night_tm_status rows currently applied for this week's date range. */
  appliedRowCount: number;
}

const SCHEDULE_BUCKET = "schedules";

/**
 * List every weeks row that has a schedule_path, joined with storage metadata
 * and a count of applied night_tm_status rows. Used by the Schedules tab as
 * the default landing view.
 */
export async function listSchedules(): Promise<ScheduleRecord[]> {
  // 1) weeks with schedule_path
  const { data: weeks, error: weeksErr } = await supabase
    .from("weeks")
    .select("id, week_ending, label, status, schedule_path")
    .not("schedule_path", "is", null)
    .order("week_ending", { ascending: false });
  if (weeksErr) throw new Error(`listSchedules weeks query failed: ${weeksErr.message}`);
  if (!weeks || weeks.length === 0) return [];

  // 2) storage metadata via the Storage API (public-callable; the JS client
  //    can't query the `storage` schema directly from REST).
  const storageByName = new Map<string, { size: number; created_at: string | null; updated_at: string | null }>();
  try {
    const { data: storageRows, error: storageErr } = await supabase.storage
      .from(SCHEDULE_BUCKET)
      .list("", { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
    if (storageErr) {
      console.warn("[sudoActions] storage list failed:", storageErr.message);
    } else if (storageRows) {
      storageRows.forEach((r: any) => {
        storageByName.set(r.name, {
          size: Number(r.metadata?.size ?? 0),
          created_at: r.created_at ?? null,
          updated_at: r.updated_at ?? null,
        });
      });
    }
  } catch (err) {
    console.warn("[sudoActions] storage list threw:", err);
  }

  // 3) for each week, count night_tm_status rows linked to that week's nights
  const weekIds = weeks.map((w: any) => w.id);
  const { data: nightsForWeeks, error: nightsErr } = await supabase
    .from("nights")
    .select("id, week_id")
    .in("week_id", weekIds);
  if (nightsErr) {
    console.warn("[sudoActions] nights lookup failed:", nightsErr.message);
  }
  const nightsByWeek = new Map<string, string[]>();
  (nightsForWeeks ?? []).forEach((n: any) => {
    if (!nightsByWeek.has(n.week_id)) nightsByWeek.set(n.week_id, []);
    nightsByWeek.get(n.week_id)!.push(n.id);
  });

  // Single batched count query — count(*) per night_id, then reduce.
  const allNightIds = (nightsForWeeks ?? []).map((n: any) => n.id);
  const countsByNight = new Map<string, number>();
  if (allNightIds.length > 0) {
    const { data: statusRows, error: statusErr } = await supabase
      .from("night_tm_status")
      .select("night_id")
      .in("night_id", allNightIds)
      .eq("status", "present");
    if (!statusErr && statusRows) {
      statusRows.forEach((r: any) => {
        countsByNight.set(r.night_id, (countsByNight.get(r.night_id) ?? 0) + 1);
      });
    }
  }

  return weeks.map((w: any) => {
    const meta = storageByName.get(w.schedule_path);
    const nightIds = nightsByWeek.get(w.id) ?? [];
    const appliedRowCount = nightIds.reduce((sum, nid) => sum + (countsByNight.get(nid) ?? 0), 0);
    return {
      weekId: w.id,
      weekEnding: w.week_ending,
      weekLabel: w.label ?? "",
      status: w.status ?? "",
      schedulePath: w.schedule_path,
      storageSizeBytes: meta?.size ?? 0,
      storageUpdatedAt: meta?.updated_at ?? null,
      storageCreatedAt: meta?.created_at ?? null,
      appliedRowCount,
    };
  });
}

/**
 * Download a schedule file from the `schedules` bucket as an ArrayBuffer
 * the XLSX parser can ingest.
 */
export async function downloadScheduleFile(path: string): Promise<ArrayBuffer> {
  const { data, error } = await supabase.storage
    .from(SCHEDULE_BUCKET)
    .download(path);
  if (error) throw new Error(`downloadScheduleFile failed: ${error.message}`);
  return await data.arrayBuffer();
}

/**
 * Upload a fresh schedule file to storage. Caller is responsible for
 * deciding whether to also (a) update weeks.schedule_path, (b) create a
 * new weeks row — we keep this function focused on the file write.
 */
export async function uploadScheduleFile(
  filename: string,
  blob: Blob
): Promise<void> {
  const { error } = await supabase.storage
    .from(SCHEDULE_BUCKET)
    .upload(filename, blob, { upsert: true });
  if (error) throw new Error(`uploadScheduleFile failed: ${error.message}`);
}

/**
 * Link an uploaded schedule file to a weeks row. Creates the weeks row if
 * one doesn't already exist for the given week_ending date.
 */
export async function linkScheduleToWeek(args: {
  weekEnding: string; // yyyy-mm-dd
  schedulePath: string;
  label?: string;
}): Promise<string /* weekId */> {
  const { data: existing, error: lookupErr } = await supabase
    .from("weeks")
    .select("id")
    .eq("week_ending", args.weekEnding)
    .limit(1);
  if (lookupErr) throw new Error(`linkScheduleToWeek lookup failed: ${lookupErr.message}`);

  if (existing && existing.length > 0) {
    const id = (existing[0] as any).id;
    const { error: updErr } = await supabase
      .from("weeks")
      .update({ schedule_path: args.schedulePath })
      .eq("id", id);
    if (updErr) throw new Error(`linkScheduleToWeek update failed: ${updErr.message}`);
    return id;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("weeks")
    .insert({
      week_ending: args.weekEnding,
      schedule_path: args.schedulePath,
      label: args.label ?? `Week ending ${args.weekEnding}`,
      status: "draft",
    })
    .select("id")
    .single();
  if (insErr) throw new Error(`linkScheduleToWeek insert failed: ${insErr.message}`);
  return (inserted as any).id;
}

/**
 * Remove all `night_tm_status` rows tied to a schedule's date range. Used
 * by the Unapply button and as part of Delete.
 */
export async function unapplyScheduleForDates(
  dates: string[]
): Promise<{ deleted: number }> {
  if (dates.length === 0) return { deleted: 0 };

  const { data: nightRows, error: nightErr } = await supabase
    .from("nights")
    .select("id")
    .in("night_date", dates);
  if (nightErr) throw new Error(`unapply failed (nights lookup): ${nightErr.message}`);
  if (!nightRows || nightRows.length === 0) return { deleted: 0 };

  const nightIds = nightRows.map((n: any) => n.id);
  // Delete present-status rows; preserve any operator-set 'off' rows that
  // weren't from this schedule.
  const { error: delErr, count } = await supabase
    .from("night_tm_status")
    .delete({ count: "exact" })
    .in("night_id", nightIds)
    .eq("status", "present");
  if (delErr) throw new Error(`unapply failed (delete): ${delErr.message}`);

  return { deleted: count ?? 0 };
}

/**
 * Delete a schedule entirely: removes the storage file, clears
 * weeks.schedule_path, and unapplies the night_tm_status rows tied to
 * the week's date range.
 */
export async function deleteSchedule(args: {
  weekId: string;
  schedulePath: string;
}): Promise<void> {
  // 1) Find the date range for this week.
  const { data: nightRows, error: nightErr } = await supabase
    .from("nights")
    .select("night_date")
    .eq("week_id", args.weekId);
  if (nightErr) throw new Error(`delete failed (nights lookup): ${nightErr.message}`);

  const dates = (nightRows ?? []).map((n: any) => String(n.night_date));

  // 2) Unapply night_tm_status for those dates.
  if (dates.length > 0) {
    await unapplyScheduleForDates(dates);
  }

  // 3) Clear weeks.schedule_path.
  const { error: updErr } = await supabase
    .from("weeks")
    .update({ schedule_path: null })
    .eq("id", args.weekId);
  if (updErr) throw new Error(`delete failed (weeks update): ${updErr.message}`);

  // 4) Remove the storage file.
  const { error: removeErr } = await supabase.storage
    .from(SCHEDULE_BUCKET)
    .remove([args.schedulePath]);
  if (removeErr) {
    // Non-fatal: weeks row is already unlinked. Surface as a warning.
    console.warn("[sudoActions] storage remove failed:", removeErr.message);
    throw new Error(
      `Schedule was unlinked from weeks but the storage file couldn't be deleted: ${removeErr.message}`
    );
  }
}

// =====================================================================
// Team management (SUDO Team tab)
// =====================================================================

import * as XLSX from "xlsx";
import { parseWorkbookAggregate } from "./adpSchedule";

export interface TMRecord {
  tmId: string;
  displayName: string;
  fullName: string | null;
  employeeName: string | null;
  active: boolean;
  gravePool: string | null;
  primarySection: string | null;
  tieBreakRank: number | null;
  skillScore: number | null;
  status: string;
  statusDate: string | null;
  statusNote: string | null;
  slotPreference: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TMPreference {
  id: string;
  tmId: string;
  stance: string;
  strength: string;
  target: string;
  note: string | null;
  addedDate: string | null;
  lastReviewed: string | null;
}

export interface TMAccommodation {
  id: string;
  tmId: string;
  type: string;
  severity: string;
  target: string | null;
  note: string;
  addedDate: string;
  status: string;
}

export interface TMSlotSkill {
  tmId: string;
  slotId: string;
  score: number;
  updatedAt: string;
}

/**
 * List every TM (active + inactive). Caller decides whether to filter.
 */
export async function listAllTMs(): Promise<TMRecord[]> {
  const { data, error } = await supabase
    .from("tm_profiles")
    .select("*")
    .order("display_name", { ascending: true });
  if (error) throw new Error(`listAllTMs failed: ${error.message}`);
  return (data ?? []).map(rowToTMRecord);
}

function rowToTMRecord(r: any): TMRecord {
  return {
    tmId: r.tm_id,
    displayName: r.display_name,
    fullName: r.full_name,
    employeeName: r.employee_name,
    active: !!r.active,
    gravePool: r.grave_pool,
    primarySection: r.primary_section,
    tieBreakRank: r.tie_break_rank,
    skillScore: r.skill_score === null ? null : Number(r.skill_score),
    status: r.status ?? "active",
    statusDate: r.status_date,
    statusNote: r.status_note,
    slotPreference: r.slot_preference,
    notes: r.notes,
    metadata: r.metadata ?? {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Insert or update a TM. Supply tmId for an update; omit it to insert (a new
 * tm_id will be derived from the display name).
 */
export async function upsertTM(input: {
  tmId?: string;
  displayName: string;
  fullName?: string | null;
  employeeName?: string | null;
  active?: boolean;
  gravePool?: string | null;
  primarySection?: string | null;
  tieBreakRank?: number | null;
  skillScore?: number | null;
  status?: string;
  slotPreference?: string | null;
  notes?: string | null;
}): Promise<string /* tmId */> {
  const isInsert = !input.tmId;
  const tmId = input.tmId ?? deriveTmId(input.displayName);

  const payload: any = {
    tm_id: tmId,
    display_name: input.displayName,
    full_name: input.fullName ?? null,
    employee_name: input.employeeName ?? null,
    active: input.active ?? true,
    grave_pool: input.gravePool ?? null,
    primary_section: input.primarySection ?? null,
    tie_break_rank: input.tieBreakRank ?? null,
    skill_score: input.skillScore ?? null,
    status: input.status ?? "active",
    slot_preference: input.slotPreference ?? null,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  };

  if (isInsert) {
    const { error } = await supabase.from("tm_profiles").insert(payload);
    if (error) throw new Error(`upsertTM insert failed: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("tm_profiles")
      .update(payload)
      .eq("tm_id", tmId);
    if (error) throw new Error(`upsertTM update failed: ${error.message}`);
  }
  return tmId;
}

/** Derive a tm_id from a display name. Mirrors the existing convention
 *  (lowercase, underscored). If the slug already exists, append a hash. */
function deriveTmId(displayName: string): string {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  // Random suffix — the engine treats tm_id as opaque so collisions matter
  // more than readability for new inserts. 6-char hex is plenty.
  const suffix = Math.random().toString(16).slice(2, 8);
  return `tm_${slug || "tm"}_${suffix}`;
}

/** Soft-delete a TM (active=false). History rows are preserved. */
export async function softDeleteTM(tmId: string, reason: "separated" | "LOA" | "transferred" | "other" = "separated"): Promise<void> {
  const { error } = await supabase
    .from("tm_profiles")
    .update({
      active: false,
      status: reason, // must be one of: 'active' | 'LOA' | 'transferred' | 'separated' | 'other'
      status_date: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    })
    .eq("tm_id", tmId);
  if (error) throw new Error(`softDeleteTM failed: ${error.message}`);
}

/** Restore a soft-deleted TM. */
export async function restoreTM(tmId: string): Promise<void> {
  const { error } = await supabase
    .from("tm_profiles")
    .update({
      active: true,
      status: "active",
      status_date: null,
      status_note: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tm_id", tmId);
  if (error) throw new Error(`restoreTM failed: ${error.message}`);
}

/**
 * Find unmatched names from the most-recently-applied schedule. Downloads
 * the file, parses with the same aggregate parser the sudo Schedules tab
 * uses, then returns the rawNames whose fuzzy-match failed.
 *
 * Returns [] when no applied schedule exists or every name matched.
 */
export async function getUnmatchedFromLatestSchedule(roster: {
  id: string;
  name?: string | null;
  fullName?: string | null;
}[]): Promise<string[]> {
  // Find the most recently applied schedule: weeks rows with schedule_path
  // AND at least one applied night_tm_status row in their date range.
  const schedules = await listSchedules();
  const applied = schedules
    .filter((s) => s.appliedRowCount > 0)
    .sort((a, b) => (a.weekEnding < b.weekEnding ? 1 : -1));
  if (applied.length === 0) return [];

  const latest = applied[0];
  try {
    const buf = await downloadScheduleFile(latest.schedulePath);
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const parsed = parseWorkbookAggregate(wb, latest.schedulePath, roster as any);
    const unmatched = parsed.rows
      .filter((r) => !r.tmId)
      .map((r) => r.rawName.trim())
      .filter(Boolean);
    // Dedupe (ADP files sometimes list the same person twice across sheets).
    return Array.from(new Set(unmatched));
  } catch (err) {
    console.warn("[sudoActions] getUnmatchedFromLatestSchedule parse failed:", err);
    return [];
  }
}

/**
 * Bulk-fetch this TM's preferences, accommodations, and per-slot skill
 * scores in one round-trip. Used by the edit drawer.
 */
export async function getTMDetail(tmId: string): Promise<{
  preferences: TMPreference[];
  accommodations: TMAccommodation[];
  slotSkills: TMSlotSkill[];
}> {
  const [prefRes, accRes, skillRes] = await Promise.all([
    supabase.from("tm_preferences").select("*").eq("tm_id", tmId),
    supabase.from("tm_accommodations").select("*").eq("tm_id", tmId),
    supabase.from("tm_slot_skills").select("*").eq("tm_id", tmId),
  ]);
  if (prefRes.error) throw new Error(`getTMDetail prefs: ${prefRes.error.message}`);
  if (accRes.error) throw new Error(`getTMDetail accs: ${accRes.error.message}`);
  if (skillRes.error) throw new Error(`getTMDetail skills: ${skillRes.error.message}`);

  return {
    preferences: (prefRes.data ?? []).map((r: any) => ({
      id: r.id,
      tmId: r.tm_id,
      stance: r.stance,
      strength: r.strength,
      target: r.target,
      note: r.note,
      addedDate: r.added_date,
      lastReviewed: r.last_reviewed,
    })),
    accommodations: (accRes.data ?? []).map((r: any) => ({
      id: r.id,
      tmId: r.tm_id,
      type: r.type,
      severity: r.severity,
      target: r.target,
      note: r.note,
      addedDate: r.added_date,
      status: r.status,
    })),
    slotSkills: (skillRes.data ?? []).map((r: any) => ({
      tmId: r.tm_id,
      slotId: r.slot_id,
      score: Number(r.score),
      updatedAt: r.updated_at,
    })),
  };
}

/** Upsert a per-slot skill score (0-10). */
export async function upsertSlotSkill(args: {
  tmId: string;
  slotId: string;
  score: number;
}): Promise<void> {
  const score = Math.max(0, Math.min(10, Math.round(args.score)));
  const { error } = await supabase
    .from("tm_slot_skills")
    .upsert(
      {
        tm_id: args.tmId,
        slot_id: args.slotId,
        score,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tm_id,slot_id" }
    );
  if (error) throw new Error(`upsertSlotSkill failed: ${error.message}`);
}

/** Add a preference row. */
export async function addTMPreference(input: {
  tmId: string;
  stance: string;
  strength: string;
  target: string;
  note?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("tm_preferences").insert({
    tm_id: input.tmId,
    stance: input.stance,
    strength: input.strength,
    target: input.target,
    note: input.note ?? null,
    added_date: new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(`addTMPreference failed: ${error.message}`);
}

export async function deleteTMPreference(id: string): Promise<void> {
  const { error } = await supabase.from("tm_preferences").delete().eq("id", id);
  if (error) throw new Error(`deleteTMPreference failed: ${error.message}`);
}

export async function addTMAccommodation(input: {
  tmId: string;
  type: string;
  severity: string;
  target?: string | null;
  note: string;
  status?: string;
}): Promise<void> {
  const { error } = await supabase.from("tm_accommodations").insert({
    tm_id: input.tmId,
    type: input.type,
    severity: input.severity,
    target: input.target ?? null,
    note: input.note,
    status: input.status ?? "active",
    added_date: new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(`addTMAccommodation failed: ${error.message}`);
}

export async function deleteTMAccommodation(id: string): Promise<void> {
  const { error } = await supabase.from("tm_accommodations").delete().eq("id", id);
  if (error) throw new Error(`deleteTMAccommodation failed: ${error.message}`);
}

/**
 * Create a TM from an unmatched ADP name with sensible defaults. The full
 * name comes from the ADP cell; the operator fills in Display Name + grave
 * pool + skills in the drawer that opens after.
 */
export async function createTMFromUnmatched(adpRawName: string): Promise<string> {
  // Try to derive a sensible default display name: ADP often gives
  // "Lastname, Firstname". Use the first word if so.
  let defaultDisplay = adpRawName.trim();
  if (defaultDisplay.includes(",")) {
    const [last, first] = defaultDisplay.split(",").map((s) => s.trim());
    defaultDisplay = first || last;
  } else {
    defaultDisplay = defaultDisplay.split(/\s+/)[0] || defaultDisplay;
  }

  return upsertTM({
    displayName: defaultDisplay,
    fullName: adpRawName.trim(),
    active: true,
    gravePool: null,
    status: "active",
  });
}

/**
 * "Merge" an unmatched ADP raw name into an existing TM.
 * Appends the exact ADP spelling to the TM's full_name (using " | " separator)
 * so that future schedule parses will exact-match or fuzzy-match this variant.
 *
 * This is the "this person already exists under a slightly different name" flow.
 */
export async function mergeUnmatchedIntoTM(rawName: string, tmId: string): Promise<void> {
  const { data, error } = await supabase
    .from("tm_profiles")
    .select("full_name, display_name")
    .eq("tm_id", tmId)
    .single();

  if (error || !data) {
    throw new Error(`Could not load TM ${tmId} for merge: ${error?.message}`);
  }

  const current = (data.full_name || data.display_name || "").trim();
  const addition = rawName.trim();

  if (!addition) return;

  // Avoid duplicating if it's already present (case-insensitive)
  if (current.toLowerCase().includes(addition.toLowerCase())) {
    return;
  }

  const newFull = current ? `${current} | ${addition}` : addition;

  const { error: updErr } = await supabase
    .from("tm_profiles")
    .update({
      full_name: newFull,
      updated_at: new Date().toISOString(),
    })
    .eq("tm_id", tmId);

  if (updErr) {
    throw new Error(`mergeUnmatchedIntoTM update failed: ${updErr.message}`);
  }
}

/**
 * Updates (or creates) the currently active engine_config row.
 * Used by the Sudo > Engine Config tab to let operators switch between
 * deterministic vs grok-hybrid and tune Grok 4.3 reasoning depth.
 */
export async function updateActiveEngineConfig(updates: {
  placementMethod?: PlacementMethod;
  grokReasoningEffort?: GrokReasoningEffort;
  notes?: string | null;
}): Promise<void> {
  // Find the current active row (most recent is_active = true)
  const { data: activeRows, error: findErr } = await supabase
    .from("engine_config")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1);

  if (findErr) {
    throw new Error(`Could not find active engine_config: ${findErr.message}`);
  }

  const payload: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.placementMethod) payload.placement_method = updates.placementMethod;
  if (updates.grokReasoningEffort) payload.grok_reasoning_effort = updates.grokReasoningEffort;
  if (updates.notes !== undefined) payload.notes = updates.notes;

  if (activeRows && activeRows.length > 0) {
    // Update existing active row in place (simple & safe for dev)
    const { error: updErr } = await supabase
      .from("engine_config")
      .update(payload)
      .eq("id", activeRows[0].id);

    if (updErr) throw new Error(`Failed to update engine_config: ${updErr.message}`);
  } else {
    // No active row — create one (seed with defaults + our changes)
    const { error: insErr } = await supabase.from("engine_config").insert({
      ...payload,
      is_active: true,
      weights: {},
      thresholds: {},
      slot_priority: {},
      created_at: new Date().toISOString(),
    });

    if (insErr) throw new Error(`Failed to create engine_config row: ${insErr.message}`);
  }
}

