/**
 * Privileged SUDO / Team surfaces.
 *
 * Writes go through postOpsMutation → /api/shiftbuilder/mutations with session +
 * permission (fail closed). Server handlers use the admin client
 * (opsMutations.server.ts). Reads may still use the browser supabase client
 * where RLS allows SELECT.
 *
 * Browser-only for write exports — do not call from non-window contexts.
 * Team identity / prefs / skills require canAccessSudo ∥ canManageTeam.
 * Engine config requires canAccessSudo. Night TM status requires canEditAssignments.
 */

import { supabase } from "../supabase";
import type { PlacementMethod, GrokReasoningEffort } from "./engineConfig";

function assertBrowser(fn: string): void {
  if (typeof window === "undefined") {
    throw new Error(
      `${fn} is browser-only; call the *Server writer after requireOpsPermission / requireOpsAnyPermission`,
    );
  }
}

/**
 * Update (or insert) the schedule status for a single TM on a single night.
 * Changes are picked up live via realtime subscriptions on night_tm_status.
 *
 * Permission: canEditAssignments (mutations API).
 */
export async function updateNightTmStatus(params: {
  nightId: string;
  tmId: string;
  status: string;           // e.g. "scheduled", "present", "off", "LOA", "PTO", "Other", "called_off"
  note?: string | null;
  tmName?: string | null;   // optional – will be filled if missing
}): Promise<void> {
  assertBrowser("updateNightTmStatus");
  const { postOpsMutation } = await import("./opsMutationClient");
  await postOpsMutation("update_night_tm_status", {
    nightId: params.nightId,
    tmId: params.tmId,
    status: params.status,
    note: params.note ?? null,
    tmName: params.tmName ?? null,
  });
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
 * Read via browser client (RLS SELECT).
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
 * tm_id will be derived from the display name server-side).
 *
 * Permission: canAccessSudo OR canManageTeam (mutations API).
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
  assertBrowser("upsertTM");
  const { postOpsMutation } = await import("./opsMutationClient");
  const result = await postOpsMutation<{ tmId: string }>("upsert_tm_profile", {
    tmId: input.tmId,
    displayName: input.displayName,
    fullName: input.fullName ?? null,
    employeeName: input.employeeName ?? null,
    active: input.active,
    gravePool: input.gravePool ?? null,
    primarySection: input.primarySection ?? null,
    gender: input.gender ?? null,
    tieBreakRank: input.tieBreakRank ?? null,
    skillScore: input.skillScore ?? null,
    status: input.status,
    slotPreference: input.slotPreference ?? null,
    notes: input.notes ?? null,
  });
  return result.tmId;
}

/** Soft-delete a TM (active=false). History rows are preserved.
 *  Permission: canAccessSudo OR canManageTeam. */
export async function softDeleteTM(
  tmId: string,
  reason: "separated" | "LOA" | "transferred" | "other" = "separated",
): Promise<void> {
  assertBrowser("softDeleteTM");
  const { postOpsMutation } = await import("./opsMutationClient");
  await postOpsMutation("soft_delete_tm", { tmId, reason });
}

/** Restore a soft-deleted TM.
 *  Permission: canAccessSudo OR canManageTeam. */
export async function restoreTM(tmId: string): Promise<void> {
  assertBrowser("restoreTM");
  const { postOpsMutation } = await import("./opsMutationClient");
  await postOpsMutation("restore_tm", { tmId });
}


/**
 * Bulk-fetch this TM's preferences, accommodations, and per-slot skill
 * scores in one round-trip. Used by the edit drawer.
 * Read via browser client (RLS SELECT).
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

/** Upsert a per-slot skill score (0-10).
 *  Permission: canAccessSudo OR canManageTeam. */
export async function upsertSlotSkill(args: {
  tmId: string;
  slotId: string;
  score: number;
}): Promise<void> {
  assertBrowser("upsertSlotSkill");
  const { postOpsMutation } = await import("./opsMutationClient");
  await postOpsMutation("upsert_slot_skill", {
    tmId: args.tmId,
    slotId: args.slotId,
    score: args.score,
  });
}

/** Add a preference row. Permission: canAccessSudo OR canManageTeam. */
export async function addTMPreference(input: {
  tmId: string;
  stance: string;
  strength: string;
  target: string;
  note?: string | null;
}): Promise<void> {
  assertBrowser("addTMPreference");
  const { postOpsMutation } = await import("./opsMutationClient");
  await postOpsMutation("add_tm_preference", {
    tmId: input.tmId,
    stance: input.stance,
    strength: input.strength,
    target: input.target,
    note: input.note ?? null,
  });
}

/** Permission: canAccessSudo OR canManageTeam. */
export async function deleteTMPreference(id: string): Promise<void> {
  assertBrowser("deleteTMPreference");
  const { postOpsMutation } = await import("./opsMutationClient");
  await postOpsMutation("delete_tm_preference", { id });
}

/** Permission: canAccessSudo OR canManageTeam. */
export async function addTMAccommodation(input: {
  tmId: string;
  type: string;
  severity: string;
  target?: string | null;
  note: string;
  status?: string;
}): Promise<void> {
  assertBrowser("addTMAccommodation");
  const { postOpsMutation } = await import("./opsMutationClient");
  await postOpsMutation("add_tm_accommodation", {
    tmId: input.tmId,
    type: input.type,
    severity: input.severity,
    target: input.target ?? null,
    note: input.note,
    status: input.status,
  });
}

/** Permission: canAccessSudo OR canManageTeam. */
export async function deleteTMAccommodation(id: string): Promise<void> {
  assertBrowser("deleteTMAccommodation");
  const { postOpsMutation } = await import("./opsMutationClient");
  await postOpsMutation("delete_tm_accommodation", { id });
}


/**
 * Updates (or creates) the currently active engine_config row.
 * Used by the Sudo > Engine Config tab to let operators switch between
 * deterministic vs grok-hybrid and tune Grok 4.3 reasoning depth.
 *
 * Permission: canAccessSudo (mutations API).
 */
export async function updateActiveEngineConfig(updates: {
  placementMethod?: PlacementMethod;
  grokReasoningEffort?: GrokReasoningEffort;
  notes?: string | null;
  weights?: Record<string, number>;
  eligibilityRules?: any[]; // custom rules for the skill / engine_eligibility_rules
}): Promise<void> {
  assertBrowser("updateActiveEngineConfig");
  const { postOpsMutation } = await import("./opsMutationClient");
  await postOpsMutation("update_engine_config", {
    placementMethod: updates.placementMethod,
    grokReasoningEffort: updates.grokReasoningEffort,
    notes: updates.notes,
    weights: updates.weights,
    eligibilityRules: updates.eligibilityRules,
  });
}
