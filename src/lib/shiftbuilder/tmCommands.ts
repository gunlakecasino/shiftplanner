/**
 * Mutations for the Command Palette's `make` and `remove` commands.
 *
 * Privileged writes (grave pool, display name, call-off) go through
 * postOpsMutation → /api/shiftbuilder/mutations with session + permission.
 * Server handlers use the admin client (see opsMutations.server.ts).
 * Reads may still use the browser supabase client where RLS allows SELECT.
 */

import { supabase } from "../supabase";

import { uiToDb } from "./slot-keys";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export type GravePoolValue = "Full" | "AM" | "PM" | null;

export interface DisplayNameConflict {
  conflictTmId: string;
  conflictDisplayName: string;
}

// ---------------------------------------------------------------
// make <TM> eligible <group>
// make <TM> ineligible
// ---------------------------------------------------------------

/**
 * Sets a TM's grave_pool. Pass `null` to make them ineligible for grave
 * entirely. Pass "Full" / "AM" / "PM" to mark them as that grave-pool type.
 *
 * Why this matters: isEligibleForSlot() in placement.ts treats `gravePool`
 * as the canonical signal for who can hold a zone slot. Flipping this here
 * immediately updates the engine's behavior on the next run.
 *
 * Permission: canAccessSudo OR canManageTeam (KD-16).
 */
export async function setTMGravePool(
  tmId: string,
  value: GravePoolValue
): Promise<void> {
  if (typeof window !== "undefined") {
    const { postOpsMutation } = await import("./opsMutationClient");
    await postOpsMutation("set_tm_grave_pool", { tmId, value });
    return;
  }

  const { setTMGravePoolServer } = await import("./opsMutations.server");
  await setTMGravePoolServer(tmId, value);

  try {
    const { revalidateRosterCache } = await import("./revalidateOpsCache");
    await revalidateRosterCache();
  } catch {
    /* server revalidate optional */
  }
}

// ---------------------------------------------------------------
// make <TM> display name "<new>"
// ---------------------------------------------------------------

/**
 * Check whether changing this TM's display_name would collide with another
 * ACTIVE TM. Case-insensitive, trimmed. Returns the conflicting record so
 * the UI can show "Mike already exists — pick a different name".
 */
export async function checkDisplayNameConflict(
  tmId: string,
  newDisplayName: string
): Promise<DisplayNameConflict | null> {
  const normalized = newDisplayName.trim();
  if (!normalized) return null;

  const { data, error } = await supabase
    .from("tm_profiles")
    .select("tm_id, display_name")
    .eq("active", true)
    .ilike("display_name", normalized) // case-insensitive exact match
    .neq("tm_id", tmId);

  if (error) {
    throw new Error(`checkDisplayNameConflict failed: ${error.message}`);
  }

  if (!data || data.length === 0) return null;

  return {
    conflictTmId: data[0].tm_id,
    conflictDisplayName: data[0].display_name,
  };
}

/**
 * Update a TM's display_name. Caller is responsible for checking conflicts
 * via checkDisplayNameConflict() first — this function does NOT enforce
 * uniqueness because the schema doesn't (and we want the UI to handle the
 * conflict gracefully rather than throwing).
 *
 * Permission: canAccessSudo OR canManageTeam (KD-16).
 */
export async function setTMDisplayName(
  tmId: string,
  newDisplayName: string
): Promise<void> {
  const trimmed = newDisplayName.trim();
  if (!trimmed) {
    throw new Error("setTMDisplayName: new display name cannot be empty");
  }

  if (typeof window !== "undefined") {
    const { postOpsMutation } = await import("./opsMutationClient");
    await postOpsMutation("set_tm_display_name", { tmId, displayName: trimmed });
    return;
  }

  const { setTMDisplayNameServer } = await import("./opsMutations.server");
  await setTMDisplayNameServer(tmId, trimmed);

  try {
    const { revalidateRosterCache } = await import("./revalidateOpsCache");
    await revalidateRosterCache();
  } catch {
    /* server revalidate optional */
  }
}

// ---------------------------------------------------------------
// remove <TM> from <date>
// ---------------------------------------------------------------

export interface CallOffRow {
  id: string;
  tmId: string;
  nightDate: string; // ISO yyyy-mm-dd
  reason: string | null;
  createdAt: string;
  createdBy: string | null;
}

/**
 * Mark a TM as removed from a specific night's schedule.
 *
 * Behavior (operator-confirmed): clear all assignments for that night AND
 * insert a call_offs row so the roster can render them in a "Called Off"
 * section.
 *
 * The three assignment tables (`zone_assignments`, `overlap_assignments`,
 * `break_assignments`) are wiped for this TM + night. `zone_assignments`
 * uses a (night_id, slot_key, slot_type, rr_side) primary key so we update
 * the row's tm_id to NULL rather than deleting it — that preserves the
 * slot row for the operator to re-fill. Overlap and break use TM-keyed
 * rows so we delete them outright.
 */
export async function removeTMFromSchedule(args: {
  tmId: string;
  nightId: string;       // for zone/overlap/break clearing
  nightDate: Date;       // for the call_offs row
  reason?: string;
}): Promise<void> {
  const { tmId, nightId, nightDate, reason } = args;
  const iso = toIsoDate(nightDate);

  if (typeof window !== "undefined") {
    const { postOpsMutation } = await import("./opsMutationClient");
    await postOpsMutation("mark_tm_call_off", {
      nightId,
      tmId,
      date: iso,
      reason: reason ?? "called_off",
    });
    return;
  }

  const { markTmCallOffServer } = await import("./opsMutations.server");
  await markTmCallOffServer({
    nightId,
    tmId,
    date: iso,
    reason: reason ?? "called_off",
  });
}

/**
 * Reverse a `remove` — delete the call_offs row. Doesn't restore the
 * assignments (those were cleared and would need to be re-added manually).
 * Used by the Undo toast.
 */
export async function undoRemoveFromSchedule(args: {
  tmId: string;
  nightDate: Date;
}): Promise<void> {
  const { tmId, nightDate } = args;
  const iso = toIsoDate(nightDate);

  if (typeof window !== "undefined") {
    const { postOpsMutation } = await import("./opsMutationClient");
    await postOpsMutation("unmark_tm_call_off", { tmId, date: iso });
    return;
  }

  const { unmarkTmCallOffServer } = await import("./opsMutations.server");
  await unmarkTmCallOffServer({ tmId, date: iso });
}

/**
 * Returns the set of TM ids called-off for any of the given ISO dates.
 * Returned as a Set of `${tmId}|${iso}` strings so the caller can check
 * each cell individually. Used by the SUDO schedule preview to overlay
 * call-off strikethroughs on top of a parsed XLSX grid.
 */
export async function getCallOffsForDateRange(
  isoDates: string[]
): Promise<Set<string>> {
  if (isoDates.length === 0) return new Set();
  const { data, error } = await supabase
    .from("call_offs")
    .select("tm_id, night_date")
    .in("night_date", isoDates);
  if (error) {
    console.error("[tmCommands] getCallOffsForDateRange failed:", error.message);
    return new Set();
  }
  return new Set(
    (data ?? []).map(
      (r: any) => `${r.tm_id}|${String(r.night_date)}`
    )
  );
}

/**
 * Returns the set of TM ids that are called-off for a given night_date.
 */
export async function getCallOffsForDate(date: Date): Promise<Set<string>> {
  const iso = toIsoDate(date);

  const { data, error } = await supabase
    .from("call_offs")
    .select("tm_id")
    .eq("night_date", iso);

  if (error) {
    console.error("[tmCommands] getCallOffsForDate failed:", error.message);
    return new Set();
  }

  return new Set((data ?? []).map((r: any) => r.tm_id));
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Silence unused-import warning — uiToDb is exported here as a convenience
// for callers that might want to map UI keys later. Keeps the surface small.
void uiToDb;
