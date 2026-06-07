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
  type SlotAssignmentRow,
} from "@/app/shiftbuilder/components/placementFitForSlot";
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
} from "@/app/shiftbuilder/components/shiftRotationHealth";
import {
  getSpreadPlacementCounts,
  getSpreadPlacementKeys,
  PLACEMENT_SPREAD_NIGHTS,
  shouldShowPlacementFitChip,
} from "@/app/shiftbuilder/components/placementPadHelpers";

export type CandidateRotationPreview = {
  tmId: string;
  tmName: string;
  slotKey: string;
  fitVerdict: string;
  healthPoints: number;
  timesInSpread: number;
  inLast5: boolean;
  weekRepeat: number;
  /** Top spread gaps for this TM (slots not in last-30). */
  topGaps: string[];
  fitSummary: string;
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
      /* skip */
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
      bySlot[slotKey] = {
        tmId: row.tmId,
        tmName: row.tmName ?? row.tmId,
        healthPoints: slotHealthPoints(fit),
        fitVerdict: fit.fitVerdict,
        fitSummary: fit.fitSummary,
      };
    } catch {
      /* skip */
    }
  }

  return {
    projectedFitPercent: computeDailyHealthPercent(
      args.auxDefs,
      draftAssignments,
      draftFitBySlot,
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
      const fallback = candidates.find(
        (c) =>
          (!scheduleGate || scheduledTmIds!.has(c.tmId)) && !usedTmIds.has(c.tmId),
      );
      if (fallback) {
        best = {
          tmId: fallback.tmId,
          tmName: fallback.tmName,
          healthPoints: 0,
          fitVerdict: "acceptable",
          fitSummary: "Planner fallback — no health-scored candidate passed gates",
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
      ? "BLANK BOARD GUIDANCE: No live fit map exists yet. Use candidateRotationPreviews per slot (spread/last-5/week-repeat/gaps) and build the draft slot-by-slot in fill order. Prefer candidates with high healthPoints (90+ strong, 80–89 acceptable), 0× week repeat on that slot, and who close spread gaps. Call scoreDraftRotationHealth before final JSON."
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

  return {
    tmId,
    tmName,
    slotKey,
    fitVerdict: fit.fitVerdict,
    healthPoints: slotHealthPoints(fit),
    timesInSpread: spreadCounts.get(slotKey) ?? 0,
    inLast5: false,
    weekRepeat,
    topGaps,
    fitSummary: fit.fitSummary,
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