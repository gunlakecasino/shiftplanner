/**
 * Rotation health context for the xAI placement engine — especially blank/partial boards
 * where live fitBySlot is empty but week histories + matrix data still exist.
 */

import type { ZoneDetailEntry } from "./data";
import type { AuxDef, CoveragePlannerResult } from "./placement";
import { isOptionalDeploymentSlot } from "./placement";
import { assignViolatesFillOrder } from "./xaiFillOrderContract";
import {
  computeSlotPlacementFit,
  memberToPlacementProfile,
  resolveSlotAssignmentRow,
  type DraftAssignmentRow,
  type SlotAssignmentRow,
} from "@/lib/shiftbuilder/rotation/placementFitForSlot";
import {
  buildWeekRepeatData,
  computeDailyHealthPercent,
  computeShiftRotationHealth,
  computeWeekAverageHealth,
  filterWeeklyHistoryThroughNight,
  getTmWeekRepeatForSlotThroughNight,
  slotHealthPoints,
  type WeekNightRecord,
  type WeekRepeatViolation,
} from "@/lib/shiftbuilder/rotation/shiftRotationHealth";
import {
  collectDeploymentSlotKeys,
  getMergedPlacementSequence,
  getSpreadPlacementCounts,
  getSpreadPlacementKeys,
  isInPriorPlacementSameAreaWindow,
  isSlotInPlacementSequence,
  LAST5_SOFT_TRAIL_COUNT,
  PLACEMENT_SPREAD_NIGHTS,
  PRIOR_PLACEMENT_CRITICAL_WINDOW,
  placementRepeatKeysMatch,
  shouldShowPlacementFitChip,
  weekEntriesForTm,
} from "@/lib/shiftbuilder/rotation/placementPadHelpers";
import type { PrerenderedPlacementFit } from "@/lib/shiftbuilder/rotation/placementFitScore";
import type { PlacementFitVerdict } from "@/lib/shiftbuilder/placementPadInsightSchema";

export type CandidateRotationPreview = {
  tmId: string;
  tmName: string;
  slotKey: string;
  fitVerdict: string;
  /** Granular 0–100 score (one decimal) for picker sort + badge. */
  healthPoints: number;
  timesInSpread: number;
  inLast5: boolean;
  /** 0 = most recent grave night in last-5 trail; -1 if not in trail. */
  last5Index: number;
  weekRepeat: number;
  /** Distinct grave nights worked this week through tonight (hypothetical assign). */
  weekNightsWorked: number;
  /** Distinct slot areas worked this grave week through tonight. */
  weekUniqueSlots: number;
  /** Days since last placement in this slot; null = never. */
  daysSinceInSlot: number | null;
  /** Slots in last-30 spread matrix with 0× exposure. */
  gapCount: number;
  /** Top spread gaps for this TM (slots not in last-30). */
  topGaps: string[];
  fitSummary: string;
  fitFactLine: string;
};

export type RotationHealthEngineBrief = {
  boardState: "blank" | "partial" | "full";
  tonightIso: string;
  /** Mean nightly fit across built prior days in this grave week. */
  weekFitAvg: number | null;
  /** Week repeat-policy score (max-1-per-area). */
  weekPolicyPercent: number | null;
  /** Prior built nights' fit % in this grave week (excludes tonight). */
  priorBuiltDays: Array<{ nightDate: string; fitPercent: number }>;
  weekViolations: Array<{
    tmId: string;
    tmName?: string;
    slotKey: string;
    count: number;
    nights: string[];
  }>;
  /** Deterministic planner draft projected fit if applied as-is. */
  projectedDraftFitPercent: number | null;
  /** Health-first greedy draft projected fit (rotation-optimized baseline for Grok). */
  projectedHealthOptimizedFitPercent: number | null;
  /** Compact operator/xAI-facing summary block. */
  summaryText: string;
};

export type BuildRotationHealthEngineBriefArgs = {
  tonightIso: string;
  assignments: Record<string, SlotAssignmentRow>;
  auxDefs: AuxDef[];
  histories: Record<string, ZoneDetailEntry | null>;
  weeklyRecentHistory?: Map<string, WeekNightRecord[]>;
  weekDailyHealths?: Record<string, number>;
  graveWeekDateKeys?: string[];
  rosterById?: Map<string, { name?: string; fullName?: string }>;
  /** Planner deterministic draft tmId per slot — for projected health on blank boards. */
  plannerDraft?: Record<string, string>;
  /** Health-first greedy draft — shown alongside planner projection. */
  healthOptimizedDraft?: Record<string, string>;
  members?: Array<Record<string, unknown>>;
};

export type DraftRotationHealthScore = {
  projectedFitPercent: number | null;
  slotCount: number;
  bySlot: Record<
    string,
    {
      tmId: string;
      tmName: string;
      healthPoints: number;
      fitVerdict: string;
      fitSummary: string;
    }
  >;
};

function rosterName(
  tmId: string,
  rosterById?: Map<string, { name?: string; fullName?: string }>,
): string | undefined {
  const tm = rosterById?.get(tmId);
  return tm?.name || tm?.fullName;
}

function countAssignedSlots(assignments: Record<string, SlotAssignmentRow>): number {
  return Object.values(assignments).filter((r) => r?.tmId || r?.tmName).length;
}

export function assignmentsFromPlannerDraft(
  draft: Record<string, string>,
  rosterById?: Map<string, { name?: string; fullName?: string }>,
): Record<string, SlotAssignmentRow> {
  const out: Record<string, SlotAssignmentRow> = {};
  for (const [slotKey, tmId] of Object.entries(draft)) {
    if (!tmId) continue;
    out[slotKey] = {
      tmId,
      tmName: rosterName(tmId, rosterById) ?? tmId,
    };
  }
  return out;
}

/**
 * Conservative stand-in when computeSlotPlacementFit throws for an assigned draft slot.
 * Without this, the slot was silently dropped from both the score list and the gap count
 * (see computeDailyHealthPercent's `if (!fit) continue`), shrinking the denominator and
 * inflating the projected health % instead of reflecting that the slot couldn't be scored.
 */
function unscorableDraftSlotFit(): PrerenderedPlacementFit {
  return {
    fitVerdict: "poor_fit",
    fitSummary: "Could not score this placement — treated as unfit for projection purposes.",
    fitFactLine: "Fit computation failed",
    healthPoints: 0,
  };
}

function computeDraftFitPercent(
  draft: Record<string, string>,
  args: {
    tonightIso: string;
    auxDefs: AuxDef[];
    histories: Record<string, ZoneDetailEntry | null>;
    weeklyRecentHistory?: Map<string, WeekNightRecord[]>;
    members?: Array<Record<string, unknown>>;
    rosterById?: Map<string, { name?: string; fullName?: string }>;
  },
): number | null {
  if (!draft || Object.keys(draft).length === 0) return null;

  const scopedWeek = filterWeeklyHistoryThroughNight(
    args.weeklyRecentHistory,
    args.tonightIso,
  );
  const draftAssignments = assignmentsFromPlannerDraft(draft, args.rosterById);
  const draftFitBySlot: Record<string, ReturnType<typeof computeSlotPlacementFit>> = {};
  const draftTms = new Set(Object.values(draft).filter(Boolean));
  const otherProfiles: Record<string, ReturnType<typeof memberToPlacementProfile>> = {};
  for (const id of draftTms) {
    otherProfiles[id] = memberToPlacementProfile(args.members ?? [], id);
  }

  for (const [slotKey, row] of Object.entries(draftAssignments)) {
    if (!shouldShowPlacementFitChip(slotKey) || !row.tmId) continue;
    try {
      draftFitBySlot[slotKey] = computeSlotPlacementFit({
        slotKey,
        assignments: draftAssignments,
        members: args.members ?? [],
        auxDefs: args.auxDefs,
        currentIso: args.tonightIso,
        histories: args.histories,
        historiesLoading: false,
        otherTmProfiles: otherProfiles,
        weeklyRecentHistory: scopedWeek,
      });
    } catch {
      draftFitBySlot[slotKey] = unscorableDraftSlotFit();
    }
  }

  return computeDailyHealthPercent(args.auxDefs, draftAssignments, draftFitBySlot);
}

/** Score a full proposed draft's projected rotation health %. */
export function scoreDraftRotationHealth(
  draft: Record<string, string>,
  args: Omit<BuildRotationHealthEngineBriefArgs, "assignments" | "plannerDraft" | "healthOptimizedDraft">,
): DraftRotationHealthScore {
  const scopedWeek = filterWeeklyHistoryThroughNight(
    args.weeklyRecentHistory,
    args.tonightIso,
  );
  const draftAssignments = assignmentsFromPlannerDraft(draft, args.rosterById);
  const bySlot: DraftRotationHealthScore["bySlot"] = {};
  const draftTms = new Set(Object.values(draft).filter(Boolean));
  const otherProfiles: Record<string, ReturnType<typeof memberToPlacementProfile>> = {};
  for (const id of draftTms) {
    otherProfiles[id] = memberToPlacementProfile(args.members ?? [], id);
  }

  const draftFitBySlot: Record<string, ReturnType<typeof computeSlotPlacementFit>> = {};
  for (const [slotKey, row] of Object.entries(draftAssignments)) {
    if (!shouldShowPlacementFitChip(slotKey) || !row.tmId) continue;
    try {
      const fit = computeSlotPlacementFit({
        slotKey,
        assignments: draftAssignments,
        members: args.members ?? [],
        auxDefs: args.auxDefs,
        currentIso: args.tonightIso,
        histories: args.histories,
        historiesLoading: false,
        otherTmProfiles: otherProfiles,
        weeklyRecentHistory: scopedWeek,
      });
      draftFitBySlot[slotKey] = fit;
    } catch {
      draftFitBySlot[slotKey] = unscorableDraftSlotFit();
    }
  }

  const granularDraftFit =
    Object.keys(args.histories).length > 0
      ? applyGranularHealthToFitMap(draftFitBySlot, draftAssignments, {
          auxDefs: args.auxDefs,
          currentIso: args.tonightIso,
          histories: args.histories,
          weeklyRecentHistory: scopedWeek,
          members: args.members ?? [],
        })
      : draftFitBySlot;

  for (const [slotKey, fit] of Object.entries(granularDraftFit)) {
    const row = draftAssignments[slotKey];
    if (!row?.tmId || !fit) continue;
    bySlot[slotKey] = {
      tmId: row.tmId,
      tmName: row.tmName ?? row.tmId,
      healthPoints: fit.healthPoints ?? slotHealthPoints(fit),
      fitVerdict: fit.fitVerdict,
      fitSummary: fit.fitSummary,
    };
  }

  return {
    projectedFitPercent: computeDailyHealthPercent(
      args.auxDefs,
      draftAssignments,
      granularDraftFit,
    ),
    slotCount: Object.keys(bySlot).length,
    bySlot,
  };
}

export type BuildHealthOptimizedDraftArgs = {
  placementOrder: string[];
  plannerResult: CoveragePlannerResult;
  tonightIso: string;
  auxDefs: AuxDef[];
  histories: Record<string, ZoneDetailEntry | null>;
  weeklyRecentHistory?: Map<string, WeekNightRecord[]>;
  members?: Array<Record<string, unknown>>;
  rosterById?: Map<string, { name?: string; fullName?: string }>;
  scheduledTmIds?: Set<string>;
  /** Live board assignments before engine draft (preserved slots). */
  baseAssignments?: Record<string, SlotAssignmentRow>;
  maxCandidatesPerSlot?: number;
};

export type HealthOptimizedDraftResult = {
  draft: Record<string, string>;
  projectedFitPercent: number | null;
  plannerProjectedFitPercent: number | null;
  liftVsPlanner: number | null;
  picks: Array<{
    slotKey: string;
    tmId: string;
    tmName: string;
    healthPoints: number;
    plannerTopTmId?: string;
    reason: string;
  }>;
};

/**
 * Greedy health-first draft: walk fill order, pick max healthPoints per slot
 * from planner Top-K (on-schedule, one-TM-per-night, fill-order safe).
 *
 * This is the "rotation > preferences > skill" tier of the declared hierarchy
 * (see placement.ts header): the planner's weighted score (preferences, skill,
 * affinity) decides *who makes the Top-K*; rotation health decides the pick
 * within it. The fallback path ("health gates relaxed") is the coverage tier
 * asserting itself — coverage beats rotation when they conflict.
 */
export function buildHealthOptimizedDraft(
  args: BuildHealthOptimizedDraftArgs,
): HealthOptimizedDraftResult {
  const {
    placementOrder,
    plannerResult,
    tonightIso,
    auxDefs,
    histories,
    weeklyRecentHistory,
    members = [],
    rosterById,
    scheduledTmIds,
    baseAssignments = {},
    maxCandidatesPerSlot = 5,
  } = args;

  const scopedWeek = filterWeeklyHistoryThroughNight(weeklyRecentHistory, tonightIso);
  const draft: Record<string, string> = {};
  const draftRows: Record<string, SlotAssignmentRow> = { ...baseAssignments };
  const usedTmIds = new Set(
    Object.values(baseAssignments)
      .map((r) => r?.tmId)
      .filter((id): id is string => !!id),
  );
  const picks: HealthOptimizedDraftResult["picks"] = [];

  const scheduleGate = scheduledTmIds && scheduledTmIds.size > 0;

  for (const slotKey of placementOrder) {
    if (isOptionalDeploymentSlot(slotKey)) continue;

    const ranking = plannerResult.breakdown[slotKey];
    if (!ranking) continue;

    if (ranking.preserved && ranking.pickedTmId) {
      draft[slotKey] = ranking.pickedTmId;
      draftRows[slotKey] = {
        tmId: ranking.pickedTmId,
        tmName: rosterName(ranking.pickedTmId, rosterById) ?? ranking.pickedTmId,
      };
      usedTmIds.add(ranking.pickedTmId);
      continue;
    }

    const candidates = ranking.topCandidates.slice(0, maxCandidatesPerSlot);
    if (candidates.length === 0) continue;

    const plannerTopTmId = candidates[0]?.tmId;
    let best: {
      tmId: string;
      tmName: string;
      healthPoints: number;
      fitVerdict: string;
      fitSummary: string;
    } | null = null;

    const otherProfiles: Record<string, ReturnType<typeof memberToPlacementProfile>> = {};
    for (const id of usedTmIds) {
      otherProfiles[id] = memberToPlacementProfile(members, id);
    }

    for (const c of candidates) {
      if (scheduleGate && !scheduledTmIds!.has(c.tmId)) continue;
      if (usedTmIds.has(c.tmId)) continue;

      const tmHistory = histories[c.tmId] ?? null;
      const tmWeekEntries = weekEntriesForTm(scopedWeek, c.tmId, tonightIso);
      if (
        isInPriorPlacementSameAreaWindow(
          tmHistory,
          slotKey,
          tonightIso,
          PRIOR_PLACEMENT_CRITICAL_WINDOW,
          tmWeekEntries,
        )
      ) {
        continue;
      }

      const hypotheticalRows: Record<string, SlotAssignmentRow> = {
        ...draftRows,
        [slotKey]: { tmId: c.tmId, tmName: c.tmName },
      };
      const fillCheck = assignViolatesFillOrder(
        slotKey,
        Object.fromEntries(
          Object.entries(hypotheticalRows).map(([k, v]) => [k, { tmId: v.tmId }]),
        ),
      );
      if (fillCheck.violates) continue;

      try {
        const fit = computeSlotPlacementFit({
          slotKey,
          assignments: hypotheticalRows,
          members,
          auxDefs,
          currentIso: tonightIso,
          histories,
          historiesLoading: false,
          otherTmProfiles: {
            ...otherProfiles,
            [c.tmId]: memberToPlacementProfile(members, c.tmId),
          },
          weeklyRecentHistory: scopedWeek,
        });
        const hp = slotHealthPoints(fit);
        if (!best || hp > best.healthPoints) {
          best = {
            tmId: c.tmId,
            tmName: c.tmName,
            healthPoints: hp,
            fitVerdict: fit.fitVerdict,
            fitSummary: fit.fitSummary,
          };
        }
      } catch {
        /* try next candidate */
      }
    }

    if (!best) {
      const fallbackPool = candidates.filter((c) => {
        if (scheduleGate && !scheduledTmIds!.has(c.tmId)) return false;
        if (usedTmIds.has(c.tmId)) return false;
        const tmHistory = histories[c.tmId] ?? null;
        const tmWeekEntries = weekEntriesForTm(scopedWeek, c.tmId, tonightIso);
        return !isInPriorPlacementSameAreaWindow(
          tmHistory,
          slotKey,
          tonightIso,
          PRIOR_PLACEMENT_CRITICAL_WINDOW,
          tmWeekEntries,
        );
      });
      const fallback = [...fallbackPool].sort((a, b) => b.total - a.total)[0];
      if (fallback) {
        best = {
          tmId: fallback.tmId,
          tmName: fallback.tmName,
          healthPoints: 0,
          fitVerdict: "acceptable",
          fitSummary: "Planner fallback — best-scored candidate (health gates relaxed)",
        };
      }
    }

    // F2 (2026-07-02): final coverage rescue. If every remaining candidate is a
    // prior-3 repeat (so both passes above found nobody), coverage is tier 1 and
    // must still win — fill the slot with the best-scored candidate anyway rather
    // than leaving a required zone open. Previously the slot was silently skipped,
    // and because open slots don't reduce the health %, the coverage-dropping
    // draft scored *higher* than one that filled the slot with a critical repeat.
    // We compute the true (low) health so the projection reflects reality, not 0.
    if (!best) {
      const rescuePool = candidates.filter(
        (c) => (!scheduleGate || scheduledTmIds!.has(c.tmId)) && !usedTmIds.has(c.tmId),
      );
      const rescue = [...rescuePool].sort((a, b) => b.total - a.total)[0];
      if (rescue) {
        let hp = 0;
        let verdict: PlacementFitVerdict = "critical_repeat";
        try {
          const fit = computeSlotPlacementFit({
            slotKey,
            assignments: { ...draftRows, [slotKey]: { tmId: rescue.tmId, tmName: rescue.tmName } },
            members,
            auxDefs,
            currentIso: tonightIso,
            histories,
            historiesLoading: false,
            otherTmProfiles: { ...otherProfiles, [rescue.tmId]: memberToPlacementProfile(members, rescue.tmId) },
            weeklyRecentHistory: scopedWeek,
          });
          hp = slotHealthPoints(fit);
          verdict = fit.fitVerdict;
        } catch {
          /* keep conservative defaults */
        }
        best = {
          tmId: rescue.tmId,
          tmName: rescue.tmName,
          healthPoints: hp,
          fitVerdict: verdict,
          fitSummary: "Coverage rescue — prior-3 relaxed (only eligible option for a required slot)",
        };
      }
    }

    if (!best) continue;

    draft[slotKey] = best.tmId;
    draftRows[slotKey] = { tmId: best.tmId, tmName: best.tmName };
    usedTmIds.add(best.tmId);

    const overrideNote =
      plannerTopTmId && plannerTopTmId !== best.tmId
        ? ` (over planner top ${plannerTopTmId})`
        : "";
    picks.push({
      slotKey,
      tmId: best.tmId,
      tmName: best.tmName,
      healthPoints: best.healthPoints,
      plannerTopTmId,
      reason: `${best.healthPoints}pt ${best.fitVerdict}${overrideNote}`,
    });
  }

  const scoreArgs = {
    tonightIso,
    auxDefs,
    histories,
    weeklyRecentHistory,
    members,
    rosterById,
  };
  const projectedFitPercent = computeDraftFitPercent(draft, scoreArgs);
  const plannerDraft = Object.fromEntries(
    Object.entries(plannerResult.proposedAssignments).filter(([, id]) => !!id),
  ) as Record<string, string>;
  const plannerProjectedFitPercent = computeDraftFitPercent(plannerDraft, scoreArgs);
  const liftVsPlanner =
    projectedFitPercent != null && plannerProjectedFitPercent != null
      ? projectedFitPercent - plannerProjectedFitPercent
      : null;

  return {
    draft,
    projectedFitPercent,
    plannerProjectedFitPercent,
    liftVsPlanner,
    picks,
  };
}

/** Build week + matrix rotation briefing for Grok on blank or partial nights. */
export function buildRotationHealthEngineBrief(
  args: BuildRotationHealthEngineBriefArgs,
): RotationHealthEngineBrief {
  const {
    tonightIso,
    assignments,
    auxDefs,
    histories,
    weeklyRecentHistory,
    weekDailyHealths,
    graveWeekDateKeys,
    rosterById,
    plannerDraft,
    healthOptimizedDraft,
    members = [],
  } = args;

  const assignedCount = countAssignedSlots(assignments);
  const boardState: RotationHealthEngineBrief["boardState"] =
    assignedCount === 0 ? "blank" : assignedCount >= 18 ? "full" : "partial";

  const scopedWeek = filterWeeklyHistoryThroughNight(
    weeklyRecentHistory,
    tonightIso,
  );
  const weekData = buildWeekRepeatData(scopedWeek);
  const weekViolations = weekData.violList.map((v: WeekRepeatViolation) => ({
    tmId: v.tmId,
    tmName: rosterName(v.tmId, rosterById),
    slotKey: v.slotKey,
    count: v.count,
    nights: v.nights,
  }));

  const priorBuiltDays: RotationHealthEngineBrief["priorBuiltDays"] = [];
  if (weekDailyHealths) {
    const keys = graveWeekDateKeys ?? Object.keys(weekDailyHealths).sort();
    for (const nightDate of keys) {
      if (nightDate >= tonightIso) continue;
      const fitPercent = weekDailyHealths[nightDate];
      if (typeof fitPercent === "number") {
        priorBuiltDays.push({ nightDate, fitPercent });
      }
    }
  }

  const weekFitAvg = computeWeekAverageHealth(weekDailyHealths, graveWeekDateKeys);

  const weekHealth = computeShiftRotationHealth(auxDefs, assignments, {}, {
    weeklyRecentHistory: scopedWeek,
    weekDailyHealths,
  });
  const weekPolicyPercent =
    weekHealth.weekPolicyPercent ?? weekHealth.weeklyBalance ?? null;

  const scoreArgs = {
    tonightIso,
    auxDefs,
    histories,
    weeklyRecentHistory,
    members,
    rosterById,
  };
  const projectedDraftFitPercent = plannerDraft
    ? computeDraftFitPercent(plannerDraft, scoreArgs)
    : null;
  const projectedHealthOptimizedFitPercent = healthOptimizedDraft
    ? computeDraftFitPercent(healthOptimizedDraft, scoreArgs)
    : null;

  const violLines =
    weekViolations.length > 0
      ? weekViolations
          .slice(0, 12)
          .map(
            (v) =>
              `${v.tmName || v.tmId} ×${v.count} on ${v.slotKey} (${v.nights.join(", ")})`,
          )
          .join("\n")
      : "None — no TM×area repeats yet this grave week through tonight.";

  const priorLines =
    priorBuiltDays.length > 0
      ? priorBuiltDays
          .map((d) => `${d.nightDate}: ${d.fitPercent}% fit`)
          .join(" · ")
      : "No prior built nights in this grave week yet.";

  const liftLine =
    projectedDraftFitPercent != null && projectedHealthOptimizedFitPercent != null
      ? `HEALTH-OPTIMIZED DRAFT: ${projectedHealthOptimizedFitPercent}% (planner ${projectedDraftFitPercent}%; lift +${projectedHealthOptimizedFitPercent - projectedDraftFitPercent}pt). Use health-optimized draft as baseline — Grok may refine with notes/chemistry.`
      : healthOptimizedDraft
        ? `HEALTH-OPTIMIZED DRAFT projected fit: ${projectedHealthOptimizedFitPercent ?? "—"}%.`
        : null;

  const summaryText = [
    `BOARD: ${boardState.toUpperCase()} (${assignedCount} live assignments tonight).`,
    `Tonight ISO: ${tonightIso}.`,
    `SCORING BANDS: strong_fit = 90–100pt, acceptable = 80–89pt (mean healthPoints = tonight fit %).`,
    `WEEK FIT AVG (built prior days): ${weekFitAvg ?? "—"}%.`,
    `WEEK REPEAT POLICY: ${weekPolicyPercent ?? "—"}% (max repeat ${weekData.maxWeeklyRepeat}; violations ${weekData.repeatViolations}).`,
    plannerDraft
      ? `PLANNER DRAFT projected fit: ${projectedDraftFitPercent ?? "—"}%.`
      : null,
    liftLine,
    `PRIOR NIGHTS: ${priorLines}`,
    `WEEK VIOLATIONS (TM same area >1× this grave week through tonight):`,
    violLines,
    boardState === "blank"
      ? "BLANK BOARD GUIDANCE: No live fit map exists yet. Use candidateRotationPreviews per slot (spread/last-5/week-repeat/gaps) and build the draft slot-by-slot in fill order. Prefer candidates with high healthPoints (90+ = strong: ≤1× spread AND not in last-5 for that area; 76–84 acceptable), 0× week repeat on that slot, and who close spread gaps. Open slots never reduce rotation health %. Call scoreDraftRotationHealth before final JSON."
      : "Use live fit + candidate previews; override planner top when rotation health clearly improves. Call scoreDraftRotationHealth before final JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  return {
    boardState,
    tonightIso,
    weekFitAvg,
    weekPolicyPercent,
    priorBuiltDays,
    weekViolations,
    projectedDraftFitPercent,
    projectedHealthOptimizedFitPercent,
    summaryText,
  };
}

export type PreviewCandidateRotationFitArgs = {
  tmId: string;
  tmName: string;
  slotKey: string;
  tonightIso: string;
  assignments: Record<string, SlotAssignmentRow>;
  auxDefs: AuxDef[];
  histories: Record<string, ZoneDetailEntry | null>;
  weeklyRecentHistory?: Map<string, WeekNightRecord[]>;
  members?: Array<Record<string, unknown>>;
};

function daysSinceLastPlacementInSlot(
  history: ZoneDetailEntry | null,
  slotKey: string,
  beforeIso: string,
): number | null {
  const dates = (history?.zoneDates?.[slotKey] || []).filter((d) => d < beforeIso);
  if (dates.length === 0) return null;
  const latest = dates.reduce((a, b) => (a > b ? a : b));
  const d1 = new Date(`${beforeIso}T12:00:00`);
  const d2 = new Date(`${latest}T12:00:00`);
  return Math.max(0, Math.floor((d1.getTime() - d2.getTime()) / 86_400_000));
}

function graveWeekWorkload(
  weeklyRecentHistory: Map<string, WeekNightRecord[]> | undefined,
  tmId: string,
  throughIso: string,
  countTonightHypothetical: boolean,
): { weekNightsWorked: number; weekUniqueSlots: number } {
  const records = (weeklyRecentHistory?.get(tmId) ?? []).filter(
    (r) => r.nightDate <= throughIso,
  );
  const nightSet = new Set(records.map((r) => r.nightDate));
  const slotSet = new Set(records.map((r) => r.slotKey));
  if (countTonightHypothetical && !nightSet.has(throughIso)) {
    nightSet.add(throughIso);
  }
  return {
    weekNightsWorked: nightSet.size,
    weekUniqueSlots: slotSet.size,
  };
}

export type CandidatePickerScoreInput = {
  slotKey: string;
  tonightIso: string;
  history: ZoneDetailEntry | null;
  spreadCounts: Map<string, number>;
  spreadKeys: Set<string>;
  timesInSpread: number;
  last5: string[];
  weekRepeat: number;
  weekNightsWorked: number;
  weekUniqueSlots: number;
  gapCount: number;
  fitVerdict: string;
};

/**
 * Continuous 0–100 score (one decimal) for a hypothetical TM→slot pick.
 * Differentiates candidates with similar spread counts via recency, last-5 position,
 * grave-week load, gap coverage, and spread-balance signals.
 */
export function computeCandidatePickerHealthPoints(
  input: CandidatePickerScoreInput,
): number {
  const {
    slotKey,
    last5,
  } = input;

  const priorNights = last5.slice(0, PRIOR_PLACEMENT_CRITICAL_WINDOW);
  if (priorNights.some((ui) => placementRepeatKeysMatch(slotKey, ui))) {
    return 50;
  }

  const {
    tonightIso,
    history,
    spreadCounts,
    spreadKeys,
    timesInSpread,
    weekRepeat,
    weekNightsWorked,
    weekUniqueSlots,
    gapCount,
    fitVerdict,
  } = input;

  let score = 100;

  score -= timesInSpread * 7.5;

  // F8 (2026-07-02): the old prior-3 penalty block here was dead code — any
  // same-area hit inside PRIOR_PLACEMENT_CRITICAL_WINDOW already triggered the
  // early `return 50` above, so `criticalIdx < WINDOW` was never reachable. Only
  // the beyond-window same-area case (in last-5 but older than prior-3) survives.
  const sameAreaIdx = last5.findIndex((ui) => placementRepeatKeysMatch(ui, slotKey));
  if (sameAreaIdx >= PRIOR_PLACEMENT_CRITICAL_WINDOW) {
    score -= 4;
  }

  score -= weekRepeat * 4.5;
  if (weekRepeat >= 2) score -= (weekRepeat - 1) * 3.5;

  const daysSince = daysSinceLastPlacementInSlot(history, slotKey, tonightIso);
  if (daysSince === null) {
    score += 7.5;
  } else {
    score += Math.min(11, daysSince * 0.12);
  }

  if (!spreadKeys.has(slotKey) && gapCount > 0) {
    score += Math.min(3.5, 1.2 + gapCount * 0.25);
  }

  let maxSpreadElsewhere = 0;
  for (const [key, count] of spreadCounts.entries()) {
    if (key === slotKey) continue;
    if (count > maxSpreadElsewhere) maxSpreadElsewhere = count;
  }
  if (timesInSpread > maxSpreadElsewhere) {
    score -= 2.5 + (timesInSpread - maxSpreadElsewhere) * 1.2;
  } else if (timesInSpread > 0 && timesInSpread === maxSpreadElsewhere) {
    score -= 0.8;
  }

  if (weekNightsWorked > 0) {
    score -= Math.min(5, weekNightsWorked * 0.6);
  }
  if (weekUniqueSlots > 0 && weekRepeat === 0) {
    score += Math.min(2, weekUniqueSlots * 0.35);
  }

  score += Math.min(2.5, spreadKeys.size * 0.18);

  if (fitVerdict === "acceptable") score = Math.min(score, 84);
  else if (fitVerdict === "questionable") score = Math.min(score, 72);
  else if (fitVerdict === "critical_repeat") score = Math.min(score, 50);
  else if (fitVerdict === "needs_swap") score = Math.min(score, 48);
  else if (fitVerdict === "poor_fit") score = Math.min(score, 20);

  const clamped = Math.max(0, Math.min(100, score));
  return Math.round(clamped * 10) / 10;
}

function formatCandidatePickerFactLine(args: {
  slotKey: string;
  timesInSpread: number;
  daysSinceInSlot: number | null;
  weekRepeat: number;
  last5Index: number;
  gapCount: number;
  weekNightsWorked: number;
}): string {
  const recency =
    args.daysSinceInSlot === null
      ? "never here"
      : `${args.daysSinceInSlot}d since`;
  const trail =
    args.last5Index >= 0 ? `last-5 #${args.last5Index + 1}` : "not in last-5";
  const priorThreeCritical =
    args.last5Index >= 0 && args.last5Index < 3 ? "prior-3 critical" : null;
  return [
    `${args.timesInSpread}× ${args.slotKey} last-30`,
    recency,
    `wk×${args.weekRepeat} this slot`,
    `${args.gapCount} spread gaps`,
    trail,
    priorThreeCritical,
    `${args.weekNightsWorked} grave nights this wk`,
  ].filter(Boolean).join(" · ");
}

/** Sort picker rows: healthPoints desc, then history/repeat tie-breakers. */
export function compareCandidateRotationPreviews(
  a: CandidateRotationPreview,
  b: CandidateRotationPreview,
): number {
  const pts = b.healthPoints - a.healthPoints;
  if (pts !== 0) return pts;

  const spread = a.timesInSpread - b.timesInSpread;
  if (spread !== 0) return spread;

  if (a.inLast5 !== b.inLast5) return a.inLast5 ? 1 : -1;

  const last5 =
    (a.last5Index < 0 ? 99 : a.last5Index) -
    (b.last5Index < 0 ? 99 : b.last5Index);
  if (last5 !== 0) return last5;

  const week = a.weekRepeat - b.weekRepeat;
  if (week !== 0) return week;

  const daysA = a.daysSinceInSlot ?? 9999;
  const daysB = b.daysSinceInSlot ?? 9999;
  if (daysB !== daysA) return daysB - daysA;

  const gaps = b.gapCount - a.gapCount;
  if (gaps !== 0) return gaps;

  const wkNights = a.weekNightsWorked - b.weekNightsWorked;
  if (wkNights !== 0) return wkNights;

  return a.tmName.localeCompare(b.tmName);
}

export type GranularFitMapContext = {
  auxDefs: AuxDef[];
  currentIso: string;
  histories: Record<string, ZoneDetailEntry | null>;
  weeklyRecentHistory?: Map<string, WeekNightRecord[]>;
  members?: Array<Record<string, unknown>>;
  isDraftMode?: boolean;
  draftAssignments?: Record<string, DraftAssignmentRow>;
};

/**
 * Re-score placed slots with the same granular picker algorithm so tracker %,
 * ROT orb, and Assign TM badges share one continuous health model.
 */
export function applyGranularHealthToFitMap(
  fitBySlot: Record<string, PrerenderedPlacementFit>,
  assignments: Record<string, SlotAssignmentRow>,
  context: GranularFitMapContext,
): Record<string, PrerenderedPlacementFit> {
  const {
    auxDefs,
    currentIso,
    histories,
    weeklyRecentHistory,
    members = [],
    isDraftMode = false,
    draftAssignments = {},
  } = context;

  const out: Record<string, PrerenderedPlacementFit> = { ...fitBySlot };

  for (const slotKey of collectDeploymentSlotKeys(auxDefs)) {
    if (!shouldShowPlacementFitChip(slotKey)) continue;

    const row = resolveSlotAssignmentRow(
      slotKey,
      assignments,
      isDraftMode,
      draftAssignments,
    );
    const tmId = row?.tmId;
    if (!tmId) continue;

    const existing = out[slotKey];
    if (!existing) continue;

    try {
      const preview = previewCandidateRotationFit({
        tmId,
        tmName: row?.tmName ?? tmId,
        slotKey,
        tonightIso: currentIso,
        assignments,
        auxDefs,
        histories,
        weeklyRecentHistory,
        members,
      });

      out[slotKey] = {
        ...existing,
        healthPoints: preview.healthPoints,
        fitVerdict: preview.fitVerdict as PlacementFitVerdict,
        fitFactLine: preview.fitFactLine,
      };
    } catch {
      // Keep whatever fit was already in `out` (a real computed fit, or the conservative
      // unscorable-slot fallback) rather than letting a fresh failure here propagate.
    }
  }

  return out;
}

/**
 * Map granular picker points to a verdict band for row badge color.
 *
 * F8 (2026-07-02): criticality is now an explicit flag, never inferred from
 * `points === 50`. A genuine critical repeat (prior-3 or week-repeat 3×) can be
 * capped *below* 50 and previously fell through to the milder "needs_swap"; now
 * it always reads `critical_repeat`. Mirrors engine/health/verdict.ts.
 */
export function pickerVerdictFromHealthPoints(
  points: number,
  isCritical = false,
): PlacementFitVerdict {
  if (isCritical) return "critical_repeat";
  if (points >= 90) return "strong_fit";
  if (points >= 76) return "acceptable";
  if (points >= 50) return "questionable";
  if (points >= 20) return "needs_swap";
  return "poor_fit";
}

/** Simulate rotation fit if tmId were placed on slotKey tonight (with current board context). */
export function previewCandidateRotationFit(
  args: PreviewCandidateRotationFitArgs,
): CandidateRotationPreview {
  const {
    tmId,
    tmName,
    slotKey,
    tonightIso,
    assignments,
    auxDefs,
    histories,
    weeklyRecentHistory,
    members = [],
  } = args;

  const scopedWeek = filterWeeklyHistoryThroughNight(
    weeklyRecentHistory,
    tonightIso,
  );
  const hypothetical: Record<string, SlotAssignmentRow> = {
    ...assignments,
    [slotKey]: { tmId, tmName },
  };

  const otherProfiles: Record<string, ReturnType<typeof memberToPlacementProfile>> =
    {};
  for (const row of Object.values(hypothetical)) {
    if (row?.tmId) otherProfiles[row.tmId] = memberToPlacementProfile(members, row.tmId);
  }

  const fit = computeSlotPlacementFit({
    slotKey,
    assignments: hypothetical,
    members,
    auxDefs,
    currentIso: tonightIso,
    histories,
    historiesLoading: false,
    otherTmProfiles: otherProfiles,
    weeklyRecentHistory: scopedWeek,
  });

  const history = histories[tmId] ?? null;
  const spreadCounts = getSpreadPlacementCounts(
    history,
    PLACEMENT_SPREAD_NIGHTS,
    tonightIso,
  );
  const spreadKeys = new Set(
    getSpreadPlacementKeys(history, PLACEMENT_SPREAD_NIGHTS, tonightIso),
  );
  const matrixKeys = Object.keys(history?.zoneDates ?? {}).filter((k) =>
    shouldShowPlacementFitChip(k),
  );
  const topGaps = matrixKeys
    .filter((k) => !spreadKeys.has(k) && k !== slotKey)
    .slice(0, 4);

  const weekRepeat = getTmWeekRepeatForSlotThroughNight(
    scopedWeek,
    tmId,
    slotKey,
    tonightIso,
    true,
  );
  const tmWeekEntries = weekEntriesForTm(scopedWeek, tmId, tonightIso);
  const last5 = getMergedPlacementSequence(history, LAST5_SOFT_TRAIL_COUNT, tonightIso, tmWeekEntries);
  const timesInSpread = spreadCounts.get(slotKey) ?? 0;
  const inLast5 = isSlotInPlacementSequence(last5, slotKey);
  const last5Index = last5.findIndex((ui) => placementRepeatKeysMatch(ui, slotKey));

  const daysSinceInSlot = daysSinceLastPlacementInSlot(history, slotKey, tonightIso);
  const gapCount = matrixKeys.filter(
    (k) => !spreadKeys.has(k) && k !== slotKey,
  ).length;
  const { weekNightsWorked, weekUniqueSlots } = graveWeekWorkload(
    scopedWeek,
    tmId,
    tonightIso,
    true,
  );
  const healthPoints = computeCandidatePickerHealthPoints({
    slotKey,
    tonightIso,
    history,
    spreadCounts,
    spreadKeys,
    timesInSpread,
    last5,
    weekRepeat,
    weekNightsWorked,
    weekUniqueSlots,
    gapCount,
    fitVerdict: fit.fitVerdict,
  });
  const fitFactLine = formatCandidatePickerFactLine({
    slotKey,
    timesInSpread,
    daysSinceInSlot,
    weekRepeat,
    last5Index,
    gapCount,
    weekNightsWorked,
  });

  // Prior-3 same-area repeat or a 3×+ same-week repeat is a critical repeat —
  // derived from conditions, not the score, so the verdict is never misread (F8).
  const isCritical =
    (last5Index >= 0 && last5Index < PRIOR_PLACEMENT_CRITICAL_WINDOW) || weekRepeat >= 3;

  return {
    tmId,
    tmName,
    slotKey,
    fitVerdict: pickerVerdictFromHealthPoints(healthPoints, isCritical),
    healthPoints,
    timesInSpread,
    inLast5,
    last5Index,
    weekRepeat,
    weekNightsWorked,
    weekUniqueSlots,
    daysSinceInSlot,
    gapCount,
    topGaps,
    fitSummary: fit.fitSummary,
    fitFactLine,
  };
}

export type BuildSlotCandidatePreviewsArgs = {
  slotKey: string;
  candidates: Array<{ tmId: string; tmName: string }>;
  tonightIso: string;
  assignments: Record<string, SlotAssignmentRow>;
  auxDefs: AuxDef[];
  histories: Record<string, ZoneDetailEntry | null>;
  weeklyRecentHistory?: Map<string, WeekNightRecord[]>;
  members?: Array<Record<string, unknown>>;
  maxCandidates?: number;
};

export function buildSlotCandidateRotationPreviews(
  args: BuildSlotCandidatePreviewsArgs,
): CandidateRotationPreview[] {
  const { candidates, maxCandidates = 5, ...rest } = args;
  const previews = candidates.slice(0, maxCandidates).map((c) =>
    previewCandidateRotationFit({
      ...rest,
      tmId: c.tmId,
      tmName: c.tmName,
    }),
  );
  return previews.sort((a, b) => b.healthPoints - a.healthPoints);
}

export type BuildEngineRotationPackArgs = BuildRotationHealthEngineBriefArgs & {
  slotCandidates: Array<{
    slotKey: string;
    candidates: Array<{ tmId: string; tmName: string }>;
  }>;
  maxCandidatesPerSlot?: number;
};

/** Full rotation pack for Grok snapshot: week brief + per-slot candidate previews. */
export function buildEngineRotationPack(args: BuildEngineRotationPackArgs): {
  brief: RotationHealthEngineBrief;
  candidatePreviewsBySlot: Record<string, CandidateRotationPreview[]>;
  healthOptimizedDraft?: Record<string, string>;
} {
  const { slotCandidates, maxCandidatesPerSlot = 4, ...briefArgs } = args;
  const brief = buildRotationHealthEngineBrief(briefArgs);
  const candidatePreviewsBySlot: Record<string, CandidateRotationPreview[]> = {};

  const baseAssignments =
    briefArgs.healthOptimizedDraft && Object.keys(briefArgs.healthOptimizedDraft).length > 0
      ? assignmentsFromPlannerDraft(briefArgs.healthOptimizedDraft, briefArgs.rosterById)
      : briefArgs.plannerDraft && Object.keys(briefArgs.plannerDraft).length > 0
        ? assignmentsFromPlannerDraft(briefArgs.plannerDraft, briefArgs.rosterById)
        : briefArgs.assignments;

  for (const { slotKey, candidates } of slotCandidates) {
    if (!shouldShowPlacementFitChip(slotKey) || candidates.length === 0) continue;
    candidatePreviewsBySlot[slotKey] = buildSlotCandidateRotationPreviews({
      slotKey,
      candidates,
      tonightIso: briefArgs.tonightIso,
      assignments: baseAssignments,
      auxDefs: briefArgs.auxDefs,
      histories: briefArgs.histories,
      weeklyRecentHistory: briefArgs.weeklyRecentHistory,
      members: briefArgs.members,
      maxCandidates: maxCandidatesPerSlot,
    });
  }

  return {
    brief,
    candidatePreviewsBySlot,
    healthOptimizedDraft: briefArgs.healthOptimizedDraft,
  };
}

/** Compact prompt block from rotation pack. */
export function formatRotationPackForPrompt(
  brief: RotationHealthEngineBrief,
  candidatePreviewsBySlot: Record<string, CandidateRotationPreview[]>,
  healthOptimizedPicks?: HealthOptimizedDraftResult["picks"],
): string {
  const lines: string[] = [brief.summaryText, "", "=== CANDIDATE ROTATION PREVIEWS (per slot top-K, sorted by healthPoints) ==="];

  for (const [slotKey, previews] of Object.entries(candidatePreviewsBySlot)) {
    lines.push(`\n${slotKey}:`);
    for (const p of previews) {
      const gaps =
        p.topGaps.length > 0 ? ` gaps:${p.topGaps.join(",")}` : "";
      lines.push(
        `  ${p.tmName} (${p.tmId}) → ${p.healthPoints}pt ${p.fitVerdict} | ${p.timesInSpread}× last30 | wk×${p.weekRepeat}${gaps} | ${p.fitSummary}`,
      );
    }
  }

  if (healthOptimizedPicks && healthOptimizedPicks.length > 0) {
    lines.push("", "=== HEALTH-OPTIMIZED GREEDY BASELINE (rotation-first) ===");
    for (const p of healthOptimizedPicks) {
      lines.push(`  ${p.slotKey}: ${p.tmName} → ${p.reason}`);
    }
  }

  return lines.join("\n");
}