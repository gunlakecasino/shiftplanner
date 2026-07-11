/**
 * validateAssignments.server.ts — shared canPlace re-validate for Apply (KD-5).
 *
 * Authoritative server path for draft proposals. Used by:
 *   - batchApplyDraftAssignmentsServer (all-or-nothing before any write)
 *   - validateProposedAssignments (client pre-check, defense-in-depth)
 *
 * Always loads schedule / config / knowledge / profiles via admin (service role).
 * Never trusts client schedule lists. Fail closed when loaders error.
 */

import { createAdminClientSafe } from "@/app/api/admin/_lib/createAdminClient";
import { parseLocalDateISO } from "@/lib/shiftbuilder/dateUtils";
import { canPlace, slotTypeForKey } from "@/lib/shiftbuilder/engine/eligibility";
import {
  EngineConfigLoadError,
  getFullyResolvedEngineConfigServer,
} from "@/lib/shiftbuilder/engineConfig.server";
import {
  expandScheduledIdsForNight,
  getScheduledIdsForNight,
  isTmIdOnScheduleSet,
} from "@/lib/shiftbuilder/gravesDefaultSchedule";
import {
  loadOpsKnowledgeServer,
  OpsKnowledgeLoadError,
} from "@/lib/shiftbuilder/opsKnowledge/data.server";
import { dbToUi } from "@/lib/shiftbuilder/slot-keys";

export type Proposal = {
  /** UI key (Z4, MRR6) or DB key (zone_4, rr_6) — normalized server-side. */
  slotKey: string;
  tmId: string | null;
  slotType?: string | null;
  rrSide?: string | null;
};

export type ValidationError = {
  slotKey: string;
  tmId: string | null;
  reason: string;
};

export type ValidationResult =
  | { valid: true; invalid: [] }
  | { valid: false; invalid: ValidationError[] };

function invalidStar(reason: string): ValidationResult {
  return {
    valid: false,
    invalid: [{ slotKey: "*", tmId: null, reason }],
  };
}

/** Detect DB-shaped keys written by batch_apply (zone_1, rr_6, overlap_pm_1, …). */
function looksLikeDbSlotKey(slotKey: string): boolean {
  return /^(zone_|rr_|aux_|support_|trash_|overlap_|admin$|z9_sr$)/i.test(slotKey);
}

function toUiSlotKey(
  slotKey: string,
  slotType?: string | null,
  rrSide?: string | null,
): string {
  if (!looksLikeDbSlotKey(slotKey)) {
    // Already UI-ish (Z4, MRR6, OL-AM-1, …) or unknown — pass through.
    return slotKey;
  }
  try {
    return dbToUi(slotKey, slotType ?? "zone", rrSide ?? null);
  } catch {
    return slotKey;
  }
}

/** Normalize DB night_date (YYYY-MM-DD or ISO timestamp) → YYYY-MM-DD. */
function normalizeNightDateIso(raw: string): string {
  const s = String(raw).trim();
  return s.includes("T") ? s.slice(0, 10) : s.slice(0, 10);
}

/**
 * Resolve authoritative night_date for a night id via admin.
 * Schedule day-key MUST come from this — never from a client-supplied date alone.
 */
async function resolveNightDate(
  nightId: string,
): Promise<{ date: string } | { error: string }> {
  const client = createAdminClientSafe();
  if (!client) {
    return { error: "Eligibility service unavailable" };
  }
  const { data, error } = await client
    .from("nights")
    .select("id, night_date")
    .eq("id", nightId)
    .maybeSingle();

  if (error) {
    return { error: `Night lookup failed: ${error.message}` };
  }
  if (!data?.night_date) {
    return { error: "Night not found" };
  }
  return { date: normalizeNightDateIso(String(data.night_date)) };
}

/**
 * Authoritative canPlace validation for a night's draft proposals.
 * Performs zero writes. Caller must not write when `valid === false`.
 *
 * Schedule date is always `nights.night_date` for `nightId` (KD-5). Client
 * `date` is advisory only — if present and disagrees, validation fails closed.
 */
export async function validateProposalsForNight(params: {
  nightId: string;
  /**
   * Optional client YYYY-MM-DD (cache-bust / UX). Never used as the schedule
   * day-key by itself. When provided, must match `nights.night_date` for nightId.
   */
  date?: string | null;
  proposals: Proposal[];
}): Promise<ValidationResult> {
  const client = createAdminClientSafe();
  if (!client) {
    return invalidStar("Eligibility service unavailable");
  }

  if (!params.proposals?.length) {
    return { valid: true, invalid: [] };
  }

  // Always bind schedule gate to the night row — client date cannot spoof day-key.
  const resolved = await resolveNightDate(params.nightId);
  if ("error" in resolved) {
    return invalidStar(resolved.error);
  }
  const dateIso = resolved.date;

  const clientDate = params.date?.trim() || "";
  if (clientDate) {
    const clientNorm = normalizeNightDateIso(clientDate);
    if (clientNorm !== dateIso) {
      return invalidStar(
        `Date does not match night (${clientNorm} ≠ ${dateIso})`,
      );
    }
  }

  // ── Schedule (admin; day-key from nights.night_date only) ──
  let scheduledIds;
  try {
    const nightDate = parseLocalDateISO(dateIso);
    scheduledIds = await getScheduledIdsForNight(nightDate, params.nightId);
    scheduledIds = await expandScheduledIdsForNight(scheduledIds);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "schedule load failed";
    return invalidStar(`No graves schedule for night (${msg})`);
  }

  const serverScheduleEmpty =
    scheduledIds.grave.size === 0 &&
    scheduledIds.amOverlap.size === 0 &&
    scheduledIds.pmOverlap.size === 0 &&
    scheduledIds.onCall.size === 0;

  if (serverScheduleEmpty) {
    return invalidStar("No graves schedule for night");
  }

  const onScheduleTonight = new Set<string>([
    ...scheduledIds.grave,
    ...scheduledIds.amOverlap,
    ...scheduledIds.pmOverlap,
    ...scheduledIds.onCall,
  ]);

  // ── Engine config / eligibility rules (admin, fail closed) ──
  let eligibilityRules;
  try {
    const cfg = await getFullyResolvedEngineConfigServer();
    eligibilityRules = cfg.eligibilityRules ?? [];
  } catch (e) {
    if (e instanceof EngineConfigLoadError) {
      return invalidStar(e.message.startsWith("Eligibility")
        ? e.message
        : "Eligibility config unavailable");
    }
    return invalidStar("Eligibility config unavailable");
  }

  // ── Supervisor knowledge (admin, fail closed on load error) ──
  let knowledge;
  try {
    knowledge = await loadOpsKnowledgeServer();
  } catch (e) {
    if (e instanceof OpsKnowledgeLoadError) {
      return invalidStar(
        e.message.startsWith("Supervisor")
          ? e.message
          : "Supervisor knowledge unavailable",
      );
    }
    return invalidStar("Supervisor knowledge unavailable");
  }

  // ── Profiles for proposed TMs ──
  const neededTmIds = new Set<string>();
  for (const p of params.proposals) {
    if (p.tmId) neededTmIds.add(p.tmId);
  }

  const profileByIdOrTmId = new Map<string, Record<string, unknown>>();
  const profileIndex = new Map<
    string,
    { id: string; tmId: string | null; name: string; gravePool: string | null; gender: string | null }
  >();

  if (neededTmIds.size > 0) {
    const ids = Array.from(neededTmIds);
    const [{ data: byId, error: errById }, { data: byTmId, error: errByTmId }] =
      await Promise.all([
        client
          .from("tm_profiles")
          .select("id, tm_id, grave_pool, gender, display_name, full_name")
          .in("id", ids),
        client
          .from("tm_profiles")
          .select("id, tm_id, grave_pool, gender, display_name, full_name")
          .in("tm_id", ids),
      ]);

    if (errById || errByTmId) {
      const msg = errById?.message || errByTmId?.message || "profile load failed";
      return invalidStar(`TM profile load failed: ${msg}`);
    }

    const seen = new Set<string>();
    const profiles = [...(byId || []), ...(byTmId || [])].filter((p) => {
      if (seen.has(p.id as string)) return false;
      seen.add(p.id as string);
      return true;
    });

    for (const p of profiles) {
      profileByIdOrTmId.set(p.id as string, p as Record<string, unknown>);
      if (p.tm_id) profileByIdOrTmId.set(p.tm_id as string, p as Record<string, unknown>);
      const row = {
        id: p.id as string,
        tmId: (p.tm_id as string | null) ?? null,
        name:
          (p.display_name as string) ||
          (p.full_name as string) ||
          (p.tm_id as string) ||
          (p.id as string),
        gravePool: (p.grave_pool as string | null) ?? null,
        gender: (p.gender as string | null) ?? null,
      };
      profileIndex.set(p.id as string, row);
      if (p.tm_id) profileIndex.set(p.tm_id as string, row);
    }
  }

  const invalid: ValidationError[] = [];

  for (const proposal of params.proposals) {
    const { tmId } = proposal;
    // Clears: allowed with edit permission (caller already checked); no canPlace.
    if (!tmId) continue;

    const uiKey = toUiSlotKey(proposal.slotKey, proposal.slotType, proposal.rrSide);

    const onSchedule = isTmIdOnScheduleSet(tmId, onScheduleTonight, profileIndex);
    if (!onSchedule) {
      invalid.push({
        slotKey: uiKey,
        tmId,
        reason: "Not scheduled on Graves Default Schedule for tonight",
      });
      continue;
    }

    const profile = profileByIdOrTmId.get(tmId);
    if (!profile) {
      invalid.push({
        slotKey: uiKey,
        tmId,
        reason: "TM profile not found",
      });
      continue;
    }

    const tmForEligibility = {
      id: profile.id as string,
      tmId: (profile.tm_id as string) || tmId,
      gravePool: profile.grave_pool as string | null,
      gender: profile.gender as string | null,
      isAMOverlap: isTmIdOnScheduleSet(tmId, scheduledIds.amOverlap, profileIndex),
      isPMOverlap: isTmIdOnScheduleSet(tmId, scheduledIds.pmOverlap, profileIndex),
    };

    const slotType = slotTypeForKey(uiKey);

    try {
      const verdict = canPlace(tmForEligibility, uiKey, {
        eligibilityRules,
        scheduledTmIds: onScheduleTonight,
        slotType,
        knowledge,
      });
      if (!verdict.ok) {
        invalid.push({
          slotKey: uiKey,
          tmId,
          reason:
            verdict.reason ??
            `Not eligible for ${uiKey} per placement rules (grave pool / gender / overlap)`,
        });
      }
    } catch {
      invalid.push({
        slotKey: uiKey,
        tmId,
        reason: "Eligibility check failed",
      });
    }
  }

  if (invalid.length === 0) {
    return { valid: true, invalid: [] };
  }
  return { valid: false, invalid };
}

/** Error thrown by batch_apply when canPlace re-validate rejects proposals. */
export class ProposalValidationError extends Error {
  readonly invalid: ValidationError[];
  readonly status = 400 as const;

  constructor(invalid: ValidationError[]) {
    const summary =
      invalid.length === 1
        ? `${invalid[0].slotKey}: ${invalid[0].reason}`
        : `${invalid.length} placement(s) failed eligibility re-validate`;
    super(summary);
    this.name = "ProposalValidationError";
    this.invalid = invalid;
  }
}
