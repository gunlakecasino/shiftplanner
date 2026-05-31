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
import { setNightLocked } from "./data";

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
// ---------------------------------------------------------------------------
// Shift-week helpers (server-side, UTC-safe for ISO date strings)
// Grave shift weeks run Friday → Thursday.
// ---------------------------------------------------------------------------
const DAY_NAMES_UTC = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * day_num / page_num within a shift week: Friday=1 … Thursday=7.
 * Formula: ((dow + 2) % 7) + 1, where dow = getUTCDay() (0=Sun … 6=Sat).
 */
function shiftDayNum(dow: number): number {
  return ((dow + 2) % 7) + 1;
}

function shiftWeekEnding(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  const dow = d.getUTCDay();
  const daysSinceFri = (dow + 2) % 7;
  const end = new Date(d);
  end.setUTCDate(d.getUTCDate() - daysSinceFri + 6);
  return end.toISOString().slice(0, 10);
}

/**
 * For each ISO date in `dates`, ensure a `nights` row exists.
 * Creates the parent `weeks` row if needed (Fri–Thu window).
 * Safe to call with dates that already have nights — they'll be skipped.
 */
async function ensureNightsExist(dates: string[]): Promise<void> {
  if (dates.length === 0) return;

  // Group dates by their shift week_ending
  const byWeek = new Map<string, { weekEnding: string; dates: string[] }>();
  for (const iso of dates) {
    const weekEnding = shiftWeekEnding(iso);
    if (!byWeek.has(weekEnding)) {
      byWeek.set(weekEnding, { weekEnding, dates: [] });
    }
    byWeek.get(weekEnding)!.dates.push(iso);
  }

  for (const { weekEnding, dates: weekDates } of byWeek.values()) {
    // Find or create the weeks row (weeks table has: week_ending, label, status, schedule_path)
    let weekId: string | null = null;
    {
      const { data: existing } = await supabase
        .from('weeks')
        .select('id')
        .eq('week_ending', weekEnding)
        .maybeSingle();
      weekId = (existing as any)?.id ?? null;
    }
    if (!weekId) {
      const { data: newWeek, error: wErr } = await supabase
        .from('weeks')
        .insert({ week_ending: weekEnding, label: `Week ending ${weekEnding}`, status: 'draft' })
        .select('id')
        .single();
      if (wErr || !newWeek) {
        console.warn(`[ensureNightsExist] couldn't create week ${weekEnding}:`, wErr?.message);
        continue;
      }
      weekId = (newWeek as any).id;
    }

    // Create nights for any dates in this week that are missing.
    // nights requires: week_id, night_date, day_name, day_num, page_num (all NOT NULL).
    for (const iso of weekDates) {
      const d = new Date(iso + 'T12:00:00Z');
      const dow = d.getUTCDay();
      const dayName = DAY_NAMES_UTC[dow];
      const dayNum = shiftDayNum(dow); // Fri=1 … Thu=7
      const { error: nErr } = await supabase
        .from('nights')
        .insert({
          week_id: weekId,
          night_date: iso,
          day_name: dayName,
          day_num: dayNum,
          page_num: dayNum, // matches existing pattern: page_num === day_num
          status: 'draft',
          is_locked: false,
        });
      // Ignore unique-constraint errors — night already exists
      if (nErr && !nErr.message.includes('duplicate') && !nErr.message.includes('unique')) {
        console.warn(`[ensureNightsExist] couldn't create night ${iso}:`, nErr.message);
      }
    }
  }
}

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

  // Auto-create nights (and parent weeks) for any dates not yet in the DB,
  // then re-resolve them so the upsert below can write all rows.
  const unresolvedDates = distinctDates.filter((d) => !dateToNightId.has(d));
  if (unresolvedDates.length > 0) {
    await ensureNightsExist(unresolvedDates);
    // Re-fetch the newly created nights
    const { data: newNightRows } = await supabase
      .from("nights")
      .select("id, night_date")
      .in("night_date", unresolvedDates);
    (newNightRows ?? []).forEach((r: any) => {
      dateToNightId.set(String(r.night_date), String(r.id));
    });
  }

  // Build the row payload.
  // Dedupe by (night_id, tm_id) — Postgres rejects an upsert that
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

/**
 * Update (or insert) the schedule status for a single TM on a single night.
 * Supports marking LOA, PTO, Other, or changing the effective status without a full ADP re-import.
 * Changes are picked up live by the planner via realtime subscriptions on night_tm_status.
 */
export async function updateNightTmStatus(params: {
  nightId: string;
  tmId: string;
  status: string;           // e.g. "scheduled", "present", "off", "LOA", "PTO", "Other", "called_off"
  note?: string | null;
  tmName?: string | null;   // optional – will be filled if missing
}) {
  const { nightId, tmId, status, note, tmName } = params;

  const payload: any = {
    night_id: nightId,
    tm_id: tmId,
    status,
    note: note ?? null,
    updated_at: new Date().toISOString(),
  };

  if (tmName) payload.tm_name = tmName;

  const { error } = await supabase
    .from("night_tm_status")
    .upsert(payload, { onConflict: "night_id,tm_id" });

  if (error) {
    throw new Error(`updateNightTmStatus failed: ${error.message}`);
  }
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

/**
 * Set the publication status of an entire week.
 * 'published' = officially released / locked for ops use.
 * 'draft' = still in preparation.
 *
 * When publishing, the nights for that week are also locked.
 * When unpublishing, they are unlocked.
 */
export async function setWeekPublished(weekId: string, published: boolean): Promise<void> {
  const status = published ? "published" : "draft";

  // 1. Update week status
  const { error } = await supabase
    .from("weeks")
    .update({ status })
    .eq("id", weekId);

  if (error) {
    throw new Error(`setWeekPublished failed: ${error.message}`);
  }

  // 2. Lock/unlock the individual nights
  const { data: nightRows, error: nightsErr } = await supabase
    .from("nights")
    .select("id")
    .eq("week_id", weekId);

  if (nightsErr) {
    console.warn("[sudoActions] setWeekPublished - could not load nights for locking:", nightsErr.message);
    return;
  }

  const nightIds = (nightRows ?? []).map((n: any) => n.id);
  for (const nightId of nightIds) {
    try {
      await setNightLocked(nightId, published);
    } catch (lockErr) {
      console.warn(`[sudoActions] Failed to ${published ? 'lock' : 'unlock'} night ${nightId}`, lockErr);
    }
  }
}

/**
 * Set publication status for specific individual days (by ISO date).
 * Useful for publishing only certain days of a week (granular control).
 *
 * When publishing days, those nights are also locked in the main planner.
 * When unpublishing, they are unlocked.
 */
export async function setDatesPublished(
  dates: string[],
  published: boolean
): Promise<{ updated: number }> {
  if (!dates.length) return { updated: 0 };

  const status = published ? "published" : "draft";

  // Find the corresponding night rows
  const { data: nights, error: nightsErr } = await supabase
    .from("nights")
    .select("id")
    .in("night_date", dates);

  if (nightsErr) {
    throw new Error(`setDatesPublished (nights lookup) failed: ${nightsErr.message}`);
  }

  const nightIds = (nights ?? []).map((n: any) => n.id);
  if (nightIds.length === 0) return { updated: 0 };

  // Update status on nights
  const { error: updErr, count } = await supabase
    .from("nights")
    .update({ status })
    .in("id", nightIds);

  if (updErr) {
    throw new Error(`setDatesPublished failed: ${updErr.message}`);
  }

  // Lock/unlock the nights
  for (const nightId of nightIds) {
    try {
      await setNightLocked(nightId, published);
    } catch (lockErr) {
      console.warn(`[sudoActions] Failed to ${published ? 'lock' : 'unlock'} night ${nightId}`, lockErr);
    }
  }

  return { updated: count ?? 0 };
}

// =====================================================================
// Team management (SUDO Team tab)
// =====================================================================

import * as XLSX from "xlsx";
import { parseWorkbookAggregate } from "./adpSchedule";

export interface TMRecord {
  id: string;           // uuid (new canonical id for new schedule/group tables)
  tmId: string;         // legacy text id (tm_xxx)
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

// =====================================================================
// User management (SUDO Users tab) — granular per-user privileges
// =====================================================================

export interface SudoUser {
  id: string;
  email: string | null;
  full_name: string;
  username: string;
  role: string;
  is_active: boolean;
  permissions: Record<string, any> | null;
  created_at?: string;
  updated_at?: string;
}

export async function listAllUsers(): Promise<SudoUser[]> {
  // We try to include the permissions column, but fall back gracefully
  // if the migration hasn't been applied yet (common during development).
  const baseSelect = "id, email, full_name, username, role, is_active, created_at, updated_at";

  // First attempt: include permissions
  let { data, error } = await supabase
    .from("users")
    .select(`${baseSelect}, permissions`)
    .order("full_name", { ascending: true });

  if (error && error.message.includes("permissions")) {
    // Column doesn't exist yet — fetch without it and default permissions to null
    console.warn("[listAllUsers] 'permissions' column not found yet. Falling back to null permissions.");
    const fallback = await supabase
      .from("users")
      .select(baseSelect)
      .order("full_name", { ascending: true });

    if (fallback.error) throw new Error(`listAllUsers failed: ${fallback.error.message}`);

    return (fallback.data ?? []).map((u: any) => ({
      ...u,
      permissions: null,
    })) as SudoUser[];
  }

  if (error) throw new Error(`listAllUsers failed: ${error.message}`);
  return (data as SudoUser[]) ?? [];
}

export async function updateUserPermissions(
  userId: string,
  permissions: Record<string, any> | null
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ permissions, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) throw new Error(`updateUserPermissions failed: ${error.message}`);
}

export async function updateUserRole(userId: string, role: string): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ role, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) throw new Error(`updateUserRole failed: ${error.message}`);
}

// =====================================================================
// User creation & soft-delete (used by Sudo → Users tab)
// =====================================================================

export interface CreateUserInput {
  full_name: string;
  username: string;
  email?: string | null;
  role?: string;
  pin: string; // raw PIN, will be hashed server-side
}

export async function createUser(input: CreateUserInput): Promise<string> {
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: {
      full_name: input.full_name,
      username: input.username,
      email: input.email || null,
      role: input.role || 'utility_ops_super',
      pin: input.pin,
    },
  });

  if (error) {
    throw new Error(`Failed to create user: ${error.message}`);
  }

  // The edge function should return { success: true, userId }
  if (!data?.success) {
    throw new Error(data?.error || 'Unknown error creating user');
  }

  return data.userId;
}

export async function deactivateUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) throw new Error(`deactivateUser failed: ${error.message}`);
}

export async function reactivateUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) throw new Error(`reactivateUser failed: ${error.message}`);
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
    id: r.id,                    // the uuid we added for new tables
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
  weights?: Record<string, number>;
  eligibilityRules?: any[]; // custom rules for the skill / engine_eligibility_rules
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
  if (updates.weights) payload.weights = updates.weights;
  if (updates.eligibilityRules) payload.eligibility_rules = updates.eligibilityRules; // store as JSON column or related table

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
      weights: updates.weights || {},
      thresholds: {},
      slot_priority: {},
      created_at: new Date().toISOString(),
    });

    if (insErr) throw new Error(`Failed to create engine_config row: ${insErr.message}`);
  }
}

// =====================================================================
// Batch placement engine runner (SUDO Batch Planner tab)
// =====================================================================

import {
  getGraveAvailableTeamMembers,
  getNightAssignments,
  getScheduledTmIdsForNight,
  getSlotDifficultyRaw,
  getTMSkillScores,
  getTMPreferences,
  getTMPairAffinities,
  getTMAccommodations,
  getTmZoneMatrix,
} from "./data";
import { getActiveEngineConfig } from "./engineConfig";
import {
  runWeightedPlanner,
  getSlotsInPlacementOrder,
  logEngineRunSummary,
} from "./placement";
import { buildDefaultAdjacency } from "./scoring";
import { uiToDb, dbToUi } from "./slot-keys";

export interface BatchNightResult {
  nightId: string;
  nightDate: string;
  dayName: string;
  status: "ok" | "skip" | "error";
  /** Number of slots the engine proposed and wrote. */
  assigned: number;
  /** Slots already filled / locked — left untouched. */
  preserved: number;
  /** Slots the engine couldn't fill (no eligible candidate). */
  unfilled: number;
  notes: string[];
  errorMessage?: string;
}

export interface BatchWeekResult {
  weekId: string;
  weekEnding: string;
  nights: BatchNightResult[];
  totalAssigned: number;
  totalPreserved: number;
  totalUnfilled: number;
}

export interface BatchRunOptions {
  /** If true, skip nights that already have ANY zone assignments (don't overwrite). */
  skipFilledNights?: boolean;
  /** If true, also skip nights where night_tm_status has no present rows (no schedule loaded). */
  requireSchedule?: boolean;
  /**
   * If true, restrict the engine roster to only TMs whose names resolved in the
   * ADP schedule import (night_tm_status). Default: FALSE — the engine uses ALL
   * active grave-pool TMs so that name-matching gaps never starve the roster.
   * Turn this on only after you've confirmed the schedule import captured everyone.
   */
  filterBySchedule?: boolean;
}

/**
 * Run the weighted placement engine for every night in a week (or a single
 * specified night) and commit the proposals directly to zone_assignments.
 *
 * Does NOT run Grok — the batch runner is deterministic / weighted-only for
 * speed and predictability. Operator can always open a specific night in the
 * main board and run Grok there if they want an AI-assisted override.
 *
 * Behaviour per night:
 *   - Respects `is_locked = true` (never overwrites a locked slot)
 *   - Respects `skipFilledNights` — skips the whole night if ≥1 zone already set
 *   - Respects `requireSchedule` — skips the night if night_tm_status is empty
 *   - Only writes slots that were EMPTY before the run (fills gaps, not overwrites)
 */
export async function batchRunEngineForWeek(
  weekId: string,
  options: BatchRunOptions = {}
): Promise<BatchWeekResult> {
  const { skipFilledNights = false, requireSchedule = false, filterBySchedule = false } = options;

  // Fetch the week's nights in chronological order
  const { data: nightRows, error: nightErr } = await supabase
    .from("nights")
    .select("id, night_date, day_name")
    .eq("week_id", weekId)
    .order("night_date", { ascending: true });
  if (nightErr) throw new Error(`batchRunEngineForWeek: could not fetch nights — ${nightErr.message}`);
  if (!nightRows || nightRows.length === 0) throw new Error("No nights found for this week.");

  // Load session-stable data once for the whole batch
  // zoneMatrix is preloaded here for future richer week-level orchestration
  // and to keep the data loading pattern consistent with per-night runs.
  const [engineConfig, skillScores, slotDifficulty, preferenceRows, pairAffinityRows, accommodationRows, grave, zoneMatrix] =
    await Promise.all([
      getActiveEngineConfig(),
      getTMSkillScores(),
      getSlotDifficultyRaw(),
      getTMPreferences(),
      getTMPairAffinities(),
      getTMAccommodations(),
      getGraveAvailableTeamMembers(),
      getTmZoneMatrix(),
    ]);

  // Build per-TM Maps once
  const prefByTm = new Map<string, any[]>();
  preferenceRows.forEach((r: any) => {
    if (!prefByTm.has(r.tmId)) prefByTm.set(r.tmId, []);
    prefByTm.get(r.tmId)!.push(r);
  });
  const pairByTm = new Map<string, any[]>();
  pairAffinityRows.forEach((r: any) => {
    if (!pairByTm.has(r.tmId)) pairByTm.set(r.tmId, []);
    pairByTm.get(r.tmId)!.push(r);
  });
  const accByTm = new Map<string, any[]>();
  accommodationRows.forEach((r: any) => {
    if (!accByTm.has(r.tmId)) accByTm.set(r.tmId, []);
    accByTm.get(r.tmId)!.push(r);
  });

  const adjacency = buildDefaultAdjacency();
  const results: BatchNightResult[] = [];

  for (const night of nightRows) {
    const nightId = String(night.id);
    const nightDate = String(night.night_date);
    const dayName = String(night.day_name ?? "");

    try {
      const nightResult = await runEngineForSingleNight({
        nightId,
        nightDate,
        dayName,
        grave,
        engineConfig,
        skillScores,
        slotDifficulty,
        prefByTm,
        pairByTm,
        accByTm,
        adjacency,
        skipFilledNights,
        requireSchedule,
        filterBySchedule,
      });
      results.push(nightResult);
    } catch (err) {
      results.push({
        nightId,
        nightDate,
        dayName,
        status: "error",
        assigned: 0,
        preserved: 0,
        unfilled: 0,
        notes: [],
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Also get the week_ending for the result header
  const { data: weekRow } = await supabase
    .from("weeks")
    .select("week_ending")
    .eq("id", weekId)
    .maybeSingle();

  return {
    weekId,
    weekEnding: (weekRow as any)?.week_ending ?? "",
    nights: results,
    totalAssigned: results.reduce((s, r) => s + r.assigned, 0),
    totalPreserved: results.reduce((s, r) => s + r.preserved, 0),
    totalUnfilled: results.reduce((s, r) => s + r.unfilled, 0),
  };
}

/**
 * Run the engine for a single night by nightId. Used by the per-night "Run"
 * button in the Sudo Batch Planner tab. Loads its own session data so it can
 * be called independently of batchRunEngineForWeek.
 */
export async function batchRunEngineForNight(
  nightId: string,
  options: BatchRunOptions = {}
): Promise<BatchNightResult> {
  const { skipFilledNights = false, requireSchedule = false, filterBySchedule = false } = options;

  const { data: nightRow, error: nightErr } = await supabase
    .from("nights")
    .select("id, night_date, day_name")
    .eq("id", nightId)
    .maybeSingle();
  if (nightErr || !nightRow) throw new Error(`Night ${nightId} not found`);

  const [engineConfig, skillScores, slotDifficulty, preferenceRows, pairAffinityRows, accommodationRows, grave, zoneMatrix] =
    await Promise.all([
      getActiveEngineConfig(),
      getTMSkillScores(),
      getSlotDifficultyRaw(),
      getTMPreferences(),
      getTMPairAffinities(),
      getTMAccommodations(),
      getGraveAvailableTeamMembers(),
      getTmZoneMatrix(), // preloaded once — fixes the previous per-TM N+1 inside scoring
    ]);

  const prefByTm = new Map<string, any[]>();
  preferenceRows.forEach((r: any) => {
    if (!prefByTm.has(r.tmId)) prefByTm.set(r.tmId, []);
    prefByTm.get(r.tmId)!.push(r);
  });
  const pairByTm = new Map<string, any[]>();
  pairAffinityRows.forEach((r: any) => {
    if (!pairByTm.has(r.tmId)) pairByTm.set(r.tmId, []);
    pairByTm.get(r.tmId)!.push(r);
  });
  const accByTm = new Map<string, any[]>();
  accommodationRows.forEach((r: any) => {
    if (!accByTm.has(r.tmId)) accByTm.set(r.tmId, []);
    accByTm.get(r.tmId)!.push(r);
  });

  return runEngineForSingleNight({
    nightId,
    nightDate: String((nightRow as any).night_date),
    dayName: String((nightRow as any).day_name ?? ""),
    grave,
    engineConfig,
    skillScores,
    slotDifficulty,
    prefByTm,
    pairByTm,
    accByTm,
    adjacency: buildDefaultAdjacency(),
    zoneMatrix,
    skipFilledNights,
    requireSchedule,
    filterBySchedule,
  });
}

/**
 * Internal: runs the weighted planner for one night and writes the proposals.
 * All session-stable data is pre-loaded by the caller.
 */
async function runEngineForSingleNight(params: {
  nightId: string;
  nightDate: string;
  dayName: string;
  grave: Awaited<ReturnType<typeof getGraveAvailableTeamMembers>>;
  engineConfig: Awaited<ReturnType<typeof getActiveEngineConfig>>;
  skillScores: Map<string, number>;
  slotDifficulty: Map<string, number>;
  prefByTm: Map<string, any[]>;
  pairByTm: Map<string, any[]>;
  accByTm: Map<string, any[]>;
  adjacency: Map<string, string[]>;
  zoneMatrix?: Map<string, Map<string, any>>;
  skipFilledNights: boolean;
  requireSchedule: boolean;
  filterBySchedule: boolean;
}): Promise<BatchNightResult> {
  const { nightId, nightDate, dayName, grave, engineConfig, skillScores, slotDifficulty, prefByTm, pairByTm, accByTm, adjacency, zoneMatrix, skipFilledNights, requireSchedule, filterBySchedule } = params;
  const notes: string[] = [];

  // Load night-specific data in parallel
  const [scheduledIds, existingAssignments] = await Promise.all([
    getScheduledTmIdsForNight(nightId),
    getNightAssignments(nightId),
  ]);

  // Optionally skip nights with no schedule import
  if (requireSchedule && scheduledIds.size === 0) {
    return { nightId, nightDate, dayName, status: "skip", assigned: 0, preserved: 0, unfilled: 0, notes: ["Skipped: no schedule data imported for this night"] };
  }

  // Check for existing zone assignments
  const zoneAssignments = existingAssignments.filter((a) => a.slotType === "zone" && a.tmId);
  if (skipFilledNights && zoneAssignments.length > 0) {
    return { nightId, nightDate, dayName, status: "skip", assigned: 0, preserved: zoneAssignments.length, unfilled: 0, notes: [`Skipped: ${zoneAssignments.length} zone(s) already filled`] };
  }

  // Build assignments map in the shape runWeightedPlanner expects.
  // Existing assignments come back with DB slot_keys (e.g. "zone_9", "rr_1_2",
  // "admin"). The planner works with UI keys (e.g. "Z9", "MRR1", "ADM").
  // Translate each DB row back to its UI key so preserve-detection works.
  const assignmentsMap: Record<string, { tmId: string; tmName: string; isLocked?: boolean }> = {};
  for (const a of existingAssignments) {
    if (!a.tmId) continue;
    try {
      const uiKey = dbToUi(a.slotKey, a.slotType ?? "zone", a.rrSide ?? null);
      assignmentsMap[uiKey] = { tmId: a.tmId, tmName: a.tmName ?? a.tmId, isLocked: a.isLocked };
    } catch {
      // Unrecognized slot shape — skip; planner will treat this slot as empty
    }
  }

  // Filter grave roster by schedule only when explicitly requested.
  // requireSchedule gates whether we RUN a night (skip with no schedule data).
  // filterBySchedule gates whether we NARROW the roster to scheduled TMs only —
  // defaults false so the full grave pool is always available.
  const rosterForEngine = (filterBySchedule && scheduledIds.size > 0)
    ? grave.filter((tm) => scheduledIds.has(tm.id))
    : grave;

  if (rosterForEngine.length === 0) {
    return { nightId, nightDate, dayName, status: "skip", assigned: 0, preserved: 0, unfilled: 0, notes: ["Skipped: no available TMs for this night"] };
  }

  // Run the weighted planner
  const orderedSlots = getSlotsInPlacementOrder();
  const plannerResult = runWeightedPlanner({
    orderedSlots,
    assignments: assignmentsMap,
    roster: rosterForEngine,
    graveOnly: true,
    scoringCtx: {
      config: engineConfig,
      skillScores,
      slotDifficulty,
      preferencesByTm: prefByTm,
      pairAffinitiesByTm: pairByTm,
      accommodationsByTm: accByTm,
      adjacency,
      zoneMatrix,
    },
  });

  notes.push(...plannerResult.notes);

  // === Rich engine telemetry (2026-05-30) ===
  const preservedCount = Object.values(plannerResult.breakdown).filter(b => b.preserved).length;
  const filledCount = Object.keys(plannerResult.proposedAssignments).length;
  const unfilledSlots = Object.entries(plannerResult.proposedAssignments)
    .filter(([, tmId]) => !tmId)
    .map(([k]) => k);

  logEngineRunSummary({
    mode: 'batch-night',
    dayName,
    nightDate,
    rosterSize: rosterForEngine.length,
    slotsProcessed: orderedSlots.length,
    preservedSlots: preservedCount,
    filledSlots: filledCount,
    unfilledSlots: unfilledSlots.length,
    usedGrok: false,
    grokPicksApplied: 0,
    matrixPreloaded: !!zoneMatrix && zoneMatrix.size > 0,
    warnings: plannerResult.notes,
    topUnfilledSlots: unfilledSlots.slice(0, 6),
    placementMethod: engineConfig.placementMethod,
  });

  // Count preserved (already filled) vs new proposals
  let preserved = 0;
  let assigned = 0;
  let unfilled = 0;

  for (const [slotKey, tmId] of Object.entries(plannerResult.proposedAssignments)) {
    const breakdown = plannerResult.breakdown[slotKey];
    if (breakdown?.preserved) {
      preserved++;
      continue; // was already filled — don't re-write
    }
    // Translate UI slot key → DB shape (slot_key, slot_type, rr_side)
    let dbSlot: ReturnType<typeof uiToDb>;
    try {
      dbSlot = uiToDb(slotKey);
    } catch {
      notes.push(`Unknown slot key "${slotKey}" — skipped`);
      continue;
    }

    // Write the new proposal to zone_assignments
    const { error: writeErr } = await supabase
      .from("zone_assignments")
      .upsert(
        {
          night_id: nightId,
          slot_key: dbSlot.slot_key,
          slot_type: dbSlot.slot_type,
          tm_id: tmId,
          rr_side: dbSlot.rr_side,
          is_filled: true,
          is_locked: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "night_id,slot_type,slot_key,rr_side" }
      );
    if (writeErr) {
      notes.push(`Failed to write ${slotKey}: ${writeErr.message}`);
    } else {
      assigned++;
    }
  }

  // Count slots the planner couldn't fill
  for (const slotKey of orderedSlots) {
    const breakdown = plannerResult.breakdown[slotKey];
    if (breakdown && !breakdown.preserved && breakdown.pickedTmId === null) {
      unfilled++;
    }
  }

  return { nightId, nightDate, dayName, status: "ok", assigned, preserved, unfilled, notes };
}

/**
 * Fetch all nights for a given weekId, ordered chronologically.
 * Used by the Batch Planner tab's night list.
 */
export async function listNightsForWeek(
  weekId: string
): Promise<Array<{ nightId: string; nightDate: string; dayName: string; assignmentCount: number }>> {
  const { data: nightRows, error: nightErr } = await supabase
    .from("nights")
    .select("id, night_date, day_name")
    .eq("week_id", weekId)
    .order("night_date", { ascending: true });
  if (nightErr) throw new Error(`listNightsForWeek: ${nightErr.message}`);
  if (!nightRows || nightRows.length === 0) return [];

  const nightIds = nightRows.map((n: any) => n.id);

  // Count existing zone assignments per night so the UI can show filled/empty
  const { data: assignRows } = await supabase
    .from("zone_assignments")
    .select("night_id")
    .in("night_id", nightIds)
    .not("tm_id", "is", null)
    .eq("slot_type", "zone");

  const countByNight = new Map<string, number>();
  (assignRows ?? []).forEach((r: any) => {
    countByNight.set(r.night_id, (countByNight.get(r.night_id) ?? 0) + 1);
  });

  return nightRows.map((n: any) => ({
    nightId: String(n.id),
    nightDate: String(n.night_date),
    dayName: String(n.day_name ?? ""),
    assignmentCount: countByNight.get(String(n.id)) ?? 0,
  }));
}

/**
 * List all weeks that have nights in the DB (for the week picker in the
 * Batch Planner tab). Returns weeks ordered by week_ending descending.
 */
export async function listWeeksWithNights(): Promise<
  Array<{ weekId: string; weekEnding: string; weekLabel: string; nightCount: number }>
> {
  const { data: weeks, error: weekErr } = await supabase
    .from("weeks")
    .select("id, week_ending, label")
    .order("week_ending", { ascending: false });
  if (weekErr) throw new Error(`listWeeksWithNights: ${weekErr.message}`);
  if (!weeks || weeks.length === 0) return [];

  const weekIds = weeks.map((w: any) => w.id);
  const { data: nightCounts } = await supabase
    .from("nights")
    .select("week_id")
    .in("week_id", weekIds);

  const countByWeek = new Map<string, number>();
  (nightCounts ?? []).forEach((n: any) => {
    countByWeek.set(n.week_id, (countByWeek.get(n.week_id) ?? 0) + 1);
  });

  return weeks
    .map((w: any) => ({
      weekId: w.id,
      weekEnding: w.week_ending,
      weekLabel: w.label ?? `Week ending ${w.week_ending}`,
      nightCount: countByWeek.get(w.id) ?? 0,
    }))
    .filter((w) => w.nightCount > 0);
}

