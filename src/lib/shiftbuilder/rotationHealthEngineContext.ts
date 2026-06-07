/**
 * Rotation health context for the xAI placement engine — especially blank/partial boards
 * where live fitBySlot is empty but week histories + matrix data still exist.
 */

import type { ZoneDetailEntry } from "./data";
import type { AuxDef } from "./placement";
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
  members?: Array<Record<string, unknown>>;
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

  let projectedDraftFitPercent: number | null = null;
  if (plannerDraft && Object.keys(plannerDraft).length > 0) {
    const draftAssignments = assignmentsFromPlannerDraft(plannerDraft, rosterById);
    const draftFitBySlot: Record<string, ReturnType<typeof computeSlotPlacementFit>> =
      {};
    const draftTms = new Set(Object.values(plannerDraft).filter(Boolean));
    const otherProfiles: Record<string, ReturnType<typeof memberToPlacementProfile>> =
      {};
    for (const id of draftTms) {
      otherProfiles[id] = memberToPlacementProfile(members, id);
    }

    for (const [slotKey, row] of Object.entries(draftAssignments)) {
      if (!shouldShowPlacementFitChip(slotKey) || !row.tmId) continue;
      try {
        draftFitBySlot[slotKey] = computeSlotPlacementFit({
          slotKey,
          assignments: draftAssignments,
          members,
          auxDefs,
          currentIso: tonightIso,
          histories,
          historiesLoading: false,
          otherTmProfiles: otherProfiles,
          weeklyRecentHistory: scopedWeek,
        });
      } catch {
        /* skip */
      }
    }
    projectedDraftFitPercent = computeDailyHealthPercent(
      auxDefs,
      draftAssignments,
      draftFitBySlot,
    );
  }

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

  const summaryText = [
    `BOARD: ${boardState.toUpperCase()} (${assignedCount} live assignments tonight).`,
    `Tonight ISO: ${tonightIso}.`,
    `WEEK FIT AVG (built prior days): ${weekFitAvg ?? "—"}%.`,
    `WEEK REPEAT POLICY: ${weekPolicyPercent ?? "—"}% (max repeat ${weekData.maxWeeklyRepeat}; violations ${weekData.repeatViolations}).`,
    plannerDraft
      ? `PROJECTED FIT if deterministic planner draft applied: ${projectedDraftFitPercent ?? "—"}%.`
      : null,
    `PRIOR NIGHTS: ${priorLines}`,
    `WEEK VIOLATIONS (TM same area >1× this grave week through tonight):`,
    violLines,
    boardState === "blank"
      ? "BLANK BOARD GUIDANCE: No live fit map exists yet. Use candidateRotationPreviews per slot (spread/last-5/week-repeat/gaps) and build the draft slot-by-slot in fill order. Prefer candidates with high healthPoints, 0× week repeat on that slot, and who close spread gaps. Avoid adding new week violations."
      : "Use live fit + candidate previews; override planner top when rotation health clearly improves.",
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
    inLast5: false, // surfaced in fitSummary; avoid duplicate fetch
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
  return candidates.slice(0, maxCandidates).map((c) =>
    previewCandidateRotationFit({
      ...rest,
      tmId: c.tmId,
      tmName: c.tmName,
    }),
  );
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
} {
  const { slotCandidates, maxCandidatesPerSlot = 4, ...briefArgs } = args;
  const brief = buildRotationHealthEngineBrief(briefArgs);
  const candidatePreviewsBySlot: Record<string, CandidateRotationPreview[]> = {};

  const baseAssignments =
    briefArgs.plannerDraft && Object.keys(briefArgs.plannerDraft).length > 0
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

  return { brief, candidatePreviewsBySlot };
}

/** Compact prompt block from rotation pack. */
export function formatRotationPackForPrompt(
  brief: RotationHealthEngineBrief,
  candidatePreviewsBySlot: Record<string, CandidateRotationPreview[]>,
): string {
  const lines: string[] = [brief.summaryText, "", "=== CANDIDATE ROTATION PREVIEWS (per slot top-K) ==="];

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

  return lines.join("\n");
}