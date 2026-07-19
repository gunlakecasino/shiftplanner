/**
 * engine/eligibility.ts — the ONE hard eligibility gate (P1-2, principle N2/N3, KD-7).
 *
 * Every engine stage (planner, optimizer, health preview, guard, AI tools) asks
 * `canPlace()` and nothing else. It composes, in order:
 *   1. core liturgy   — gender / grave-pool / overlap-band (eligibilityCore.isEligibleForSlot)
 *   2. accommodations — hard limits from BOTH stores, collapsed (see below)
 *   3. operator rules — engine_eligibility_rules (isEligibleUnderRules), when loaded
 *   4. schedule gate  — graves_default_schedule membership, when enabled
 *
 * Accommodations have two stores that must never diverge (P0-2, 2026-07-18):
 * the `tm_accommodations` table (authored in Sudo -> Team) and the Supervisor
 * Brain dossiers (`ops_supervisor_knowledge`). Before this fix only the dossier
 * copy blocked anything, so an operator who recorded a hard accommodation in
 * Sudo had it silently ignored by every engine path. Both are now folded into a
 * SINGLE evaluation (`accommodationVerdict`) that runs the one matcher
 * (`opsKnowledge/apply.accommodationBlocks`), so one accommodation cannot be
 * half-enforced. Build the options bag with `gateOptionsFor(ctx, tm)` — it
 * threads every hard input at once, which is what stops a new call site from
 * quietly reintroducing a bare gate.
 *
 * Liturgy lives in the **leaf** `eligibilityCore.ts` (no reverse imports).
 * Import direction: engine/eligibility → eligibilityCore + engineOverrides.
 * placement.ts re-exports liturgy for BC but must NEVER import this file
 * (placement↔eligibility cycle is forbidden).
 */

import {
  isEligibleForSlot,
  normalizeGender,
  slotTypeForKey,
} from "../eligibilityCore";
import { isEligibleUnderRules } from "../engineOverrides";
import type { EligibilityRule } from "../engineConfig";
import type { TMAccommodationRow } from "../data";
import type { TmModel, NightContext, SlotModel } from "./types";
import type { Accommodation, OpsKnowledge } from "../opsKnowledge/types";
import { emptyOpsKnowledge } from "../opsKnowledge/types";
import { accommodationBlocks } from "../opsKnowledge/apply";

export { slotTypeForKey } from "../eligibilityCore";

export interface EligibilityVerdict {
  ok: boolean;
  /** First failing rule's human-readable reason. Undefined when ok. */
  reason?: string;
}

/** TM shape the core liturgy understands (a subset of TmModel + raw rows). */
export interface EligibilityTm {
  id?: string;
  tmId?: string;
  tm_id?: string;
  gender?: string | null;
  gravePool?: string | null;
  grave_pool?: string | null;
  isAMOverlap?: boolean;
  is_am_overlap?: boolean;
  isPMOverlap?: boolean;
  is_pm_overlap?: boolean;
  /** Schedule-derived full-grave (gravePool may be null) — P1-16. */
  isFullGrave?: boolean;
  isFullGraveTonight?: boolean;
  adminTrainingStatus?: string | null;
  admin_training_status?: string | null;
  weeksInRole?: number;
}

export interface CanPlaceOptions {
  eligibilityRules?: EligibilityRule[];
  /** When non-empty, TM must be a member to be placeable. */
  scheduledTmIds?: Set<string>;
  /**
   * Slot type for operator rules ("zone" | "rr" | "aux" | "overlap").
   * When omitted, derived via `slotTypeForKey(slotKey)` — never defaults to
   * a hard-coded `"zone"` (that was the pre-constitution footgun).
   */
  slotType?: string;
  /** Supervisor Brain — hard accommodations become blocks. */
  knowledge?: OpsKnowledge;
  /**
   * This TM's active `tm_accommodations` rows. Enforced identically to the
   * Supervisor-Brain dossier accommodations (P0-2) — pass them, or the
   * operator's Sudo-authored limits do nothing.
   */
  accommodations?: TMAccommodationRow[];
  /** UI keys that represent Admin, including flex AUX shells. */
  adminSlotKeys?: Set<string>;
  /**
   * Weeks the TM has held the role, for operator `min_weeks` rules.
   * `undefined` means UNKNOWN, not zero — see `weeksInRoleFromMemberRow`.
   */
  weeksInRole?: number;
}

function normalizeForGate(tm: EligibilityTm, weeksInRole?: number): Record<string, unknown> {
  return {
    id: tm.id,
    tmId: tm.tmId,
    tm_id: tm.tm_id,
    gender: tm.gender,
    gravePool: tm.gravePool ?? tm.grave_pool,
    isAMOverlap: tm.isAMOverlap ?? tm.is_am_overlap,
    isPMOverlap: tm.isPMOverlap ?? tm.is_pm_overlap,
    // P1-16: schedule-derived full-grave TMs have a null gravePool. Dropping
    // this made them count in feasibility but fail every zone.
    isFullGrave: tm.isFullGrave ?? tm.isFullGraveTonight,
    adminTrainingStatus: tm.adminTrainingStatus ?? tm.admin_training_status,
    weeksInRole: weeksInRole ?? tm.weeksInRole,
  };
}

function isAdminSlot(slotKey: string, adminSlotKeys?: Set<string>): boolean {
  const normalized = String(slotKey ?? "").trim().toUpperCase();
  return (
    normalized === "ADM" ||
    normalized === "ADMIN" ||
    normalized === "AUX_ADMIN" ||
    adminSlotKeys?.has(slotKey) === true ||
    adminSlotKeys?.has(normalized) === true
  );
}

function adminTrainingStatus(gate: Record<string, unknown>): string {
  return String(gate.adminTrainingStatus ?? "").trim().toLowerCase();
}

/**
 * Translate one `tm_accommodations` row into the Supervisor-Brain
 * `Accommodation` shape so both stores are matched by the same code (P0-2).
 *
 * `target` is operator free text. It is read as a slot key ("Z9") AND as a zone
 * tag ("sweeper"), with a leading "no_" stripped, because the Sudo field's
 * placeholder is `no_sweeper` while `ZoneProfile.tags` carries `sweeper`. A row
 * with no target names no slot and therefore blocks nothing — it stays advisory
 * and still reaches the AI brief through the dossier path.
 */
function accommodationRowToKnowledge(row: TMAccommodationRow): Accommodation {
  const target = (row.target ?? "").trim();
  const tag = target.toLowerCase().replace(/^no[_\-\s]+/, "");
  const tags = Array.from(
    new Set([target.toLowerCase(), tag, tag.replace(/[_\-\s]+/g, "")]),
  ).filter(Boolean);
  return {
    kind: "other",
    label: row.note?.trim() || target || row.type,
    severity: String(row.severity ?? "").trim().toLowerCase() === "hard" ? "hard" : "soft",
    blockedSlotKeys: target ? Array.from(new Set([target, target.toUpperCase()])) : undefined,
    blockedTags: tags.length > 0 ? tags : undefined,
  };
}

/**
 * ONE accommodation verdict over BOTH stores (P0-2). Merging the rows into the
 * TM's dossier before matching means the hard/soft semantics, the slot-key
 * matching and the zone-tag matching are literally the same code path for
 * `tm_accommodations` and for the Supervisor Brain — there is no second
 * implementation left to drift.
 */
function accommodationVerdict(
  tmId: string,
  slotKey: string,
  knowledge: OpsKnowledge | undefined,
  rows: TMAccommodationRow[] | undefined,
): { blocked: boolean; reason?: string } {
  const hasRows = !!rows && rows.length > 0;
  if (!knowledge && !hasRows) return { blocked: false };
  const base = knowledge ?? emptyOpsKnowledge();
  if (!hasRows) return accommodationBlocks(base, tmId, slotKey);

  const dossier = base.dossiers[tmId];
  const merged: OpsKnowledge = {
    ...base,
    dossiers: {
      ...base.dossiers,
      [tmId]: {
        ...(dossier ?? { tmId, capabilities: [], accommodations: [] }),
        tmId,
        accommodations: [
          ...(dossier?.accommodations ?? []),
          ...rows!.map(accommodationRowToKnowledge),
        ],
      },
    },
  };
  return accommodationBlocks(merged, tmId, slotKey);
}

/** Derive a human reason when the core liturgy rejects — mirrors its branches. */
function deriveLiturgyReason(gate: Record<string, unknown>, slotKey: string): string {
  const isAM = !!gate.isAMOverlap;
  const isPM = !!gate.isPMOverlap;
  const poolKind = String(gate.gravePool ?? "").toUpperCase();
  const isOverlapByPool = poolKind === "AM" || poolKind === "PM";
  const g = normalizeGender(gate.gender);

  if (slotKey.startsWith("Z")) {
    return "Zone requires a full-grave TM (overlap-band or non-grave excluded)";
  }
  if (slotKey.startsWith("OL-AM") || slotKey.includes("AM-Overlap")) {
    return "AM overlap slot requires an AM-flagged grave TM";
  }
  if (slotKey.startsWith("OL-PM") || slotKey.includes("PM-Overlap")) {
    return "PM overlap slot requires a PM-flagged grave TM";
  }
  if (slotKey.startsWith("MRR")) {
    if (g === "F") return "Men's restroom requires a male TM";
    return "Men's restroom requires a full-night grave TM (overlap excluded)";
  }
  if (slotKey.startsWith("WRR")) {
    if (g === "M") return "Women's restroom requires a female TM";
    return "Women's restroom requires a full-night grave TM (overlap excluded)";
  }
  if (isOverlapByPool || isAM || isPM) {
    return "Full-night position — AM/PM overlap TMs work partial shifts";
  }
  return "Not eligible for this slot under core rules";
}

/**
 * The single hard gate. Returns `{ ok, reason? }`.
 *
 * `slotKey` (string) is accepted directly so non-context callers (drag halos,
 * fit chips) can use it without building a NightContext.
 */
export function canPlace(
  tm: EligibilityTm,
  slotKey: string,
  opts: CanPlaceOptions = {},
): EligibilityVerdict {
  const { eligibilityRules = [], scheduledTmIds, knowledge, accommodations } = opts;
  // Always resolve slot type from the key when caller omits it — never "zone".
  const slotType = opts.slotType ?? slotTypeForKey(slotKey);
  const gate = normalizeForGate(tm, opts.weeksInRole);
  const tmId = (tm.tm_id || tm.tmId || tm.id || "").trim();

  // 1. Core liturgy (leaf — no operator rules threaded here).
  if (!isEligibleForSlot(gate, slotKey)) {
    return { ok: false, reason: deriveLiturgyReason(gate, slotKey) };
  }

  if (isAdminSlot(slotKey, opts.adminSlotKeys) && adminTrainingStatus(gate) !== "trained") {
    return { ok: false, reason: "Admin requires Admin-trained status" };
  }

  // 1b. Hard accommodations — Supervisor Brain dossiers AND tm_accommodations,
  //     evaluated as ONE verdict (safety-critical limits, P0-2).
  const acc = accommodationVerdict(tmId, slotKey, knowledge, accommodations);
  if (acc.blocked) return { ok: false, reason: acc.reason };

  // 2. Operator rules (engine_eligibility_rules) — F1 fix; correct slotType.
  if (eligibilityRules.length > 0) {
    if (!isEligibleUnderRules(gate as any, slotKey, slotType, eligibilityRules)) {
      return { ok: false, reason: "Blocked by an operator eligibility rule" };
    }
  }

  // 3. Schedule gate — graves_default_schedule is the sole root source of truth
  //    for who is working tonight, when loaded.
  if (scheduledTmIds && scheduledTmIds.size > 0) {
    if (!scheduledTmIds.has(tmId)) {
      return { ok: false, reason: "Not on tonight's grave schedule" };
    }
  }

  return { ok: true };
}

/**
 * The ONE options bag for a context-bound gate call.
 *
 * Every hard input travels together — operator rules, schedule membership,
 * Supervisor-Brain knowledge, `tm_accommodations` and weeks-in-role. Call sites
 * that hand-roll a subset are exactly how P0-1 (week engine without knowledge)
 * and P0-2 (accommodations enforced nowhere) happened; use this so adding a new
 * hard input reaches every gate at once.
 */
export function gateOptionsFor(ctx: NightContext, tm: EligibilityTm): CanPlaceOptions {
  const tmId = (tm.tm_id || tm.tmId || tm.id || "").trim();
  const adminSlotKeys = new Set<string>(
    ctx.auxDefs.filter((d) => d.role === "admin").flatMap((d) => [d.key, d.key.toUpperCase()]),
  );
  adminSlotKeys.add("ADM");
  return {
    eligibilityRules: ctx.eligibilityRules,
    scheduledTmIds: ctx.scheduledTmIds,
    knowledge: ctx.knowledge,
    accommodations: ctx.accommodationsByTm.get(tmId),
    adminSlotKeys,
    weeksInRole: weeksInRoleForTm(ctx, tmId),
  };
}

/** Keyed on the context (not the member array) — nightIso is part of the answer. */
const weeksInRoleCache = new WeakMap<NightContext, Map<string, number | undefined>>();

/**
 * Weeks-in-role for operator `min_weeks` rules, read from the raw member row
 * (P0-4). There is no hire-date column on `tm_profiles` today, so this resolves
 * only when the roster row actually carries one of the recognized fields;
 * otherwise it returns `undefined`, meaning **unknown** — never 0. A `min_weeks`
 * rule must treat unknown as "condition not applicable", or it fails the entire
 * roster (which is the live bug this pairs with).
 */
export function weeksInRoleForTm(ctx: NightContext, tmId: string): number | undefined {
  // Gates run per (candidate x slot); index the roster once per context instead
  // of scanning `members` on every call.
  let byTm = weeksInRoleCache.get(ctx);
  if (!byTm) {
    byTm = new Map<string, number | undefined>();
    for (const raw of ctx.members) {
      const id = String(raw.id ?? raw.tmId ?? raw.tm_id ?? "").trim();
      if (id) byTm.set(id, weeksInRoleFromMemberRow(raw, ctx.nightIso));
    }
    weeksInRoleCache.set(ctx, byTm);
  }
  return byTm.get(tmId);
}

/** Recognized weeks-in-role / role-start fields on a raw roster row. */
export function weeksInRoleFromMemberRow(
  raw: Record<string, unknown>,
  asOfIso: string,
): number | undefined {
  const explicit = raw.weeksInRole ?? raw.weeks_in_role;
  if (typeof explicit === "number" && Number.isFinite(explicit)) return Math.max(0, explicit);

  const start =
    raw.roleStartDate ?? raw.role_start_date ?? raw.hireDate ?? raw.hire_date ??
    raw.startDate ?? raw.start_date;
  if (typeof start !== "string" || !start.trim()) return undefined;
  const startMs = new Date(`${start.slice(0, 10)}T12:00:00`).getTime();
  const asOfMs = new Date(`${asOfIso}T12:00:00`).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(asOfMs)) return undefined;
  return Math.max(0, Math.floor((asOfMs - startMs) / (7 * 86_400_000)));
}

/** Context-bound convenience — pulls every hard input from ctx (gateOptionsFor). */
export function canPlaceInContext(
  tm: TmModel,
  slot: SlotModel,
  ctx: NightContext,
): EligibilityVerdict {
  return canPlace(tm, slot.key, {
    ...gateOptionsFor(ctx, tm),
    slotType: slotTypeForKey(slot.key),
  });
}
