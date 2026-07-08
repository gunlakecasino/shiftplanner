/**
 * Mock Timefold solver simulation.
 *
 * Stands in for a real Timefold service call. Produces a plausible progress
 * stream (score climbing, constraint status settling) followed by 1-3
 * proposals built from tonight's *actual* board/roster data, so reviewing the
 * UX feels grounded rather than obviously fake. No network calls, no timers
 * outside what's created/cleaned up here.
 *
 * Replace `runMockTimefoldOptimize` with a real API call (SSE/poll/websocket
 * for progress, then a result fetch) when the solver service exists — keep
 * the same `onTick`/`onDone`/`onError` callback shape so the hook and UI
 * layer above don't need to change.
 */

import { ZONE_DEFS } from "../constants";
import type {
  TimefoldConstraintSignal,
  TimefoldHealthLift,
  TimefoldProgressTick,
  TimefoldProposal,
  TimefoldRunInput,
  TimefoldRunResult,
  TimefoldSlotDiff,
} from "./timefoldTypes";

const CONSTRAINT_DEFS: Array<{ id: string; label: string }> = [
  { id: "max_one_repeat", label: "Max 1 repeat per area / week" },
  { id: "full_grave_only", label: "Full-grave eligibility" },
  { id: "no_double_book", label: "No double-booking tonight" },
  { id: "rr_gender", label: "Restroom gender assignment" },
  { id: "coverage_floor", label: "Minimum zone coverage" },
];

function pickDurationMs(): number {
  // "Est. 12-18s" per the menu subtitle.
  return 12_000 + Math.random() * 6_000;
}

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function tmDisplayName(tm: { name?: string; fullName?: string; id: string }): string {
  return tm.name || tm.fullName || tm.id;
}

/** Build a small set of grounded "was -> proposed" diffs from real board/roster data. */
function buildDiffsForProposal(
  input: TimefoldRunInput,
  usedTmIds: Set<string>,
  diffCount: number,
): TimefoldSlotDiff[] {
  const candidateSlots = shuffled(ZONE_DEFS).slice(0, diffCount);
  const availableRoster = shuffled(
    input.roster.filter((tm) => !usedTmIds.has(tm.id)),
  );

  const diffs: TimefoldSlotDiff[] = [];
  candidateSlots.forEach((slot, i) => {
    const current = input.assignments[slot.key];
    const replacement = availableRoster[i];
    if (!replacement) return;

    usedTmIds.add(replacement.id);
    const improvesRotationHealth = i % 2 === 0;

    diffs.push({
      slotKey: slot.key,
      slotLabel: slot.label,
      previousTmId: current?.tmId ?? null,
      previousTmName: current?.tmName ?? null,
      proposedTmId: replacement.id,
      proposedTmName: tmDisplayName(replacement),
      reason: improvesRotationHealth
        ? `${tmDisplayName(replacement)} has the longest rotation gap for ${slot.label} — clears a critical repeat.`
        : `Balances weekly load — ${tmDisplayName(replacement)} is under-placed this week relative to peers.`,
      improvesRotationHealth,
    });
  });

  return diffs;
}

function buildHealthLifts(diffs: TimefoldSlotDiff[]): TimefoldHealthLift[] {
  const resolvedRepeats = diffs.filter((d) => d.improvesRotationHealth).length;
  const baseHealth = 74 + Math.round(Math.random() * 6);
  const lift = 4 + resolvedRepeats * 3;

  return [
    {
      label: "Rotation health",
      before: baseHealth,
      after: Math.min(99, baseHealth + lift),
      betterDirection: "up",
    },
    {
      label: "Open gaps",
      before: 3,
      after: Math.max(0, 3 - Math.ceil(diffs.length / 2)),
      betterDirection: "down",
    },
    {
      label: "Critical repeats",
      before: resolvedRepeats + 1,
      after: 1,
      betterDirection: "down",
    },
  ];
}

function buildConstraintSignals(seed: number): TimefoldConstraintSignal[] {
  return CONSTRAINT_DEFS.map((c, i) => {
    const roll = (seed + i) % 5;
    const status = roll === 4 ? "warning" : "satisfied";
    return {
      id: c.id,
      label: c.label,
      status,
      detail: status === "warning" ? "1 soft violation — reviewed, acceptable" : undefined,
    };
  });
}

function buildProposal(
  input: TimefoldRunInput,
  rank: number,
  diffCount: number,
  usedTmIds: Set<string>,
): TimefoldProposal {
  const diffs = buildDiffsForProposal(input, usedTmIds, diffCount);
  const constraints = buildConstraintSignals(rank);
  const brokenCount = constraints.filter((c) => c.status === "broken").length;

  return {
    id: `proposal-${rank}`,
    rank,
    title:
      rank === 1
        ? "Recommended — best overall balance"
        : rank === 2
          ? "Alternative — minimal disruption"
          : "Alternative — max rotation spread",
    summary:
      rank === 1
        ? `${diffs.length} change${diffs.length === 1 ? "" : "s"} · resolves ${diffs.filter((d) => d.improvesRotationHealth).length} rotation issue(s) with the fewest moves.`
        : `${diffs.length} change${diffs.length === 1 ? "" : "s"} · a different trade-off between disruption and rotation spread.`,
    score: 100 - brokenCount * 12 - rank * 3 + Math.round(Math.random() * 4),
    diffs,
    healthLifts: buildHealthLifts(diffs),
    constraints,
  };
}

export function generateMockProposals(input: TimefoldRunInput): TimefoldProposal[] {
  const usedTmIds = new Set<string>();
  const proposalCount = input.roster.length >= 6 ? 3 : input.roster.length >= 3 ? 2 : 1;

  return Array.from({ length: proposalCount }, (_, i) =>
    buildProposal(input, i + 1, 2 + i, usedTmIds),
  ).sort((a, b) => b.score - a.score)
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

export interface RunMockTimefoldOptimizeHandlers {
  onTick: (tick: TimefoldProgressTick) => void;
  onDone: (result: TimefoldRunResult) => void;
  onError?: (message: string) => void;
}

/**
 * Starts the simulated run. Returns a cancel function — call it to stop
 * ticking and skip onDone (mirrors aborting a real in-flight solver call).
 */
export function runMockTimefoldOptimize(
  input: TimefoldRunInput,
  handlers: RunMockTimefoldOptimizeHandlers,
): () => void {
  const durationMs = pickDurationMs();
  const tickEveryMs = 350;
  const totalTicks = Math.round(durationMs / tickEveryMs);
  let tickIndex = 0;
  let cancelled = false;
  let bestScore = 40 + Math.random() * 10;

  // Narrated in operator language (board words, not solver words) so the 12–18s
  // wait reads as demonstrated rigor instead of dead air. Order mirrors the real
  // solve phases so the copy stays honest when the live stream replaces the mock.
  const headlines = [
    "Reading tonight's board…",
    "Enforcing hard rules — restrooms, shift types…",
    "Exploring zone reassignments…",
    "Untangling rotation repeats…",
    "Balancing the week across the roster…",
    "Polishing fairness…",
    "Preparing your Draft…",
  ];

  const intervalId = setInterval(() => {
    if (cancelled) return;
    tickIndex += 1;
    const percent = Math.min(100, Math.round((tickIndex / totalTicks) * 100));

    // Score climbs with diminishing, slightly noisy improvements — never regresses visibly.
    const step = Math.max(0.2, (100 - bestScore) * 0.06 * Math.random());
    bestScore = Math.min(98, bestScore + step);
    const score = bestScore - Math.random() * 1.5;

    const headline =
      headlines[Math.min(headlines.length - 1, Math.floor((percent / 100) * headlines.length))];

    handlers.onTick({
      percent,
      score: Math.round(score * 10) / 10,
      bestScore: Math.round(bestScore * 10) / 10,
      iteration: tickIndex * 137,
      constraints: buildConstraintSignals(tickIndex),
      etaSeconds: Math.max(0, Math.round(((totalTicks - tickIndex) * tickEveryMs) / 1000)),
      headline,
    });

    if (tickIndex >= totalTicks) {
      clearInterval(intervalId);
      if (cancelled) return;
      try {
        const proposals = generateMockProposals(input);
        handlers.onDone({
          nightId: input.nightId,
          dateLabel: input.dateLabel,
          durationSeconds: Math.round(durationMs / 1000),
          proposals,
        });
      } catch (e) {
        handlers.onError?.(e instanceof Error ? e.message : "Optimization failed");
      }
    }
  }, tickEveryMs);

  return () => {
    cancelled = true;
    clearInterval(intervalId);
  };
}
