"use server";

/**
 * Privileged write actions surfaced from the SUDO / Settings window.
 */

import { supabase } from "../supabase";
import type { PlacementMethod, GrokReasoningEffort } from "./engineConfig";

/**
 * Update (or insert) the schedule status for a single TM on a single night.
 * Changes are picked up live via realtime subscriptions on night_tm_status.
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

export interface TMRecord {
  id: string;           // uuid (new canonical id for new schedule/group tables)
  tmId: string;         // legacy text id (tm_xxx)
  displayName: string;
  fullName: string | null;
  employeeName: string | null;
  active: boolean;
  gravePool: string | null;
  primarySection: string | null;
  /** Biological gender for MRR vs WRR restroom eligibility. 'M' | 'F' | null (null = unknown = eligible for both as safe fallback). */
  gender?: 'M' | 'F' | null;
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
    id: r.id,                    // the uuid we added for new tables
    tmId: r.tm_id,
    displayName: r.display_name,
    fullName: r.full_name,
    employeeName: r.employee_name,
    active: !!r.active,
    gravePool: r.grave_pool,
    primarySection: r.primary_section,
    gender: (r.gender as 'M' | 'F' | null) ?? null,
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
  /** 'M' | 'F' | null — persisted to tm_profiles.gender for restroom eligibility */
  gender?: 'M' | 'F' | null;
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
    gender: input.gender ?? null,
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
