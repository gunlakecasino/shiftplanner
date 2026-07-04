/**
 * engine/context.ts — the ONE context loader (P1-1).
 *
 * `buildNightContext` normalizes already-loaded raw data (roster rows, config,
 * histories, reference maps) into the single `NightContext` shape every stage
 * consumes. It is a **pure normalizer** — no Supabase, no DOM — so it runs
 * identically client-side (interactive), server-side (batch), and in tests
 * (fixtures). Async loaders that hit `data.ts` fetchers wrap this; the shape
 * they produce is identical, which is what makes cross-surface parity provable.
 *
 * Two responsibilities that live here and nowhere else:
 *  1. History scoping — `weeklyRecentHistory` is filtered to nights < nightIso
 *     once, at load. Downstream code never re-filters (that is where tonight /
 *     this-week off-by-ones came from).
 *  2. Identity + profile normalization — the id/tmId/tm_id and
 *     gravePool/grave_pool duality is collapsed into `TmModel` here.
 */

import type {
  ZoneDetailEntry,
  TmZoneMatrixRow,
  TMPreferenceRow,
  TMPairAffinityRow,
  TMAccommodationRow,
} from "../data";
import type { EngineConfig, EligibilityRule } from "../engineConfig";
import {
  getSlotsInPlacementOrder,
  isOptionalDeploymentSlot,
  isFullGraveForPlacement,
  normalizeGender,
  type AuxDef,
} from "../placement";
import { COVERAGE_TIERS, getTierForSlot } from "../skills/placement-engine";
import { shouldShowPlacementFitChip } from "@/app/shiftbuilder/components/placementPadHelpers";
import { buildDefaultAdjacency } from "../scoring";
import { assignmentTmId, boardTmId } from "../tmIdentity";
import type {
  NightContext,
  SlotAssignmentRow,
  SlotModel,
  TmModel,
  WeekNightRecord,
} from "./types";

export interface BuildNightContextInput {
  nightIso: string;
  config: EngineConfig;
  /** Operator rules; defaults to (config as FullyResolved).eligibilityRules ?? []. */
  eligibilityRules?: EligibilityRule[];
  auxDefs: AuxDef[];
  /** Raw roster/member rows (any id/pool shape). */
  members: Array<Record<string, unknown>>;
  scheduledTmIds?: Set<string>;
  assignments?: Record<string, SlotAssignmentRow>;
  histories?: Record<string, ZoneDetailEntry | null>;
  /** Unscoped week history — the loader scopes it to < nightIso. */
  weeklyRecentHistory?: Map<string, WeekNightRecord[]>;
  zoneMatrix?: Map<string, Map<string, TmZoneMatrixRow>>;
  skillScores?: Map<string, number>;
  slotDifficulty?: Map<string, number>;
  preferencesByTm?: Map<string, TMPreferenceRow[]>;
  pairAffinitiesByTm?: Map<string, TMPairAffinityRow[]>;
  accommodationsByTm?: Map<string, TMAccommodationRow[]>;
  adjacency?: Map<string, string[]>;
  knowledge?: import("../opsKnowledge/types").OpsKnowledge;
}

/** Grave-week records with nightDate strictly before `nightIso`. */
function scopeWeekHistoryBefore(
  map: Map<string, WeekNightRecord[]> | undefined,
  nightIso: string,
): Map<string, WeekNightRecord[]> {
  const out = new Map<string, WeekNightRecord[]>();
  if (!map) return out;
  for (const [tmId, records] of map.entries()) {
    const filtered = records.filter((r) => r.nightDate < nightIso);
    if (filtered.length > 0) out.set(tmId, filtered);
  }
  return out;
}

function slotTierInfo(slotKey: string): { tier: number; isHardCoverage: boolean } {
  const t = getTierForSlot(slotKey);
  if (t) {
    const idx = COVERAGE_TIERS.findIndex((x) => x.name === t.name);
    return { tier: idx < 0 ? COVERAGE_TIERS.length : idx, isHardCoverage: t.isHardCoverage };
  }
  return { tier: COVERAGE_TIERS.length, isHardCoverage: false };
}

function buildSlotModels(
  auxDefs: AuxDef[],
  slotDifficulty: Map<string, number>,
): SlotModel[] {
  const orderedKeys = getSlotsInPlacementOrder(auxDefs);
  return orderedKeys.map((key) => {
    const { tier, isHardCoverage } = slotTierInfo(key);
    // slot_difficulty uses its own key scheme; resolve via the scoring helper.
    const diffKey = uiKeyToDifficultyKey(key);
    const difficulty = diffKey ? slotDifficulty.get(diffKey) ?? null : null;
    return {
      key,
      tier,
      difficulty,
      isOptional: isOptionalDeploymentSlot(key),
      isRotationTracked: shouldShowPlacementFitChip(key),
      isHardCoverage,
    };
  });
}

/** Local copy of the slot_difficulty key translation (avoids importing scoring's private helper cycle). */
function uiKeyToDifficultyKey(slotKey: string): string | null {
  if (slotKey === "Z9SR") return "Zone9SR";
  if (slotKey === "ADM") return "Admin";
  if (slotKey === "TR1") return "Trash1";
  if (slotKey === "TR2") return "Trash2";
  const zoneMatch = slotKey.match(/^Z(\d+)$/);
  if (zoneMatch) return `Zone${zoneMatch[1]}`;
  if (/^[MW]RR\d+$/.test(slotKey)) return slotKey;
  return null;
}

function normalizeTm(
  raw: Record<string, unknown>,
  scheduledTmIds: Set<string>,
): TmModel {
  const id = boardTmId(raw as any) || assignmentTmId(raw as any);
  const gravePool = (raw.gravePool ?? raw.grave_pool ?? null) as string | null;
  const isAMOverlap = !!(raw.isAMOverlap ?? raw.is_am_overlap ?? raw.isAMOverlapTonight);
  const isPMOverlap = !!(raw.isPMOverlap ?? raw.is_pm_overlap ?? raw.isPMOverlapTonight);
  return {
    id,
    name: (raw.name ?? raw.fullName ?? raw.full_name ?? id) as string,
    gender: normalizeGender(raw.gender),
    gravePool,
    isAMOverlap,
    isPMOverlap,
    isFullGrave: isFullGraveForPlacement(raw),
    scheduled: scheduledTmIds.size === 0 ? true : scheduledTmIds.has(id),
  };
}

export function buildNightContext(input: BuildNightContextInput): NightContext {
  const scheduledTmIds = input.scheduledTmIds ?? new Set<string>();
  const slotDifficulty = input.slotDifficulty ?? new Map<string, number>();

  const slots = buildSlotModels(input.auxDefs, slotDifficulty);
  const slotByKey = new Map(slots.map((s) => [s.key, s] as const));

  const roster: TmModel[] = [];
  const rosterById = new Map<string, TmModel>();
  for (const raw of input.members) {
    const tm = normalizeTm(raw, scheduledTmIds);
    if (!tm.id || rosterById.has(tm.id)) continue;
    roster.push(tm);
    rosterById.set(tm.id, tm);
  }

  // Scope grave-week history to nights STRICTLY before tonight, once, here.
  // Tonight's own placements live in `assignments`, not history; the health
  // model adds tonight's hypothetical itself (countTonightIfAssigned). This is
  // the single place week history is scoped — downstream code never re-filters.
  const weeklyRecentHistory = scopeWeekHistoryBefore(
    input.weeklyRecentHistory,
    input.nightIso,
  );

  const eligibilityRules =
    input.eligibilityRules ?? ((input.config as any).eligibilityRules as EligibilityRule[]) ?? [];

  return {
    nightIso: input.nightIso,
    config: input.config,
    eligibilityRules,
    auxDefs: input.auxDefs,
    slots,
    slotByKey,
    roster,
    rosterById,
    scheduledTmIds,
    assignments: input.assignments ?? {},
    histories: input.histories ?? {},
    weeklyRecentHistory,
    zoneMatrix: input.zoneMatrix ?? new Map(),
    skillScores: input.skillScores ?? new Map(),
    slotDifficulty,
    preferencesByTm: input.preferencesByTm ?? new Map(),
    pairAffinitiesByTm: input.pairAffinitiesByTm ?? new Map(),
    accommodationsByTm: input.accommodationsByTm ?? new Map(),
    adjacency: input.adjacency ?? buildDefaultAdjacency(),
    members: input.members,
    knowledge: input.knowledge,
  };
}
