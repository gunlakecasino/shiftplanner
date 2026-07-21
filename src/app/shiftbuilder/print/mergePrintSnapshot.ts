import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import type { DraftAssignmentRow } from "../components/placementFitForSlot";
import { computeBreakCounts } from "./buildPrintDaySnapshot";
import type { PrintDaySnapshot } from "./printPreviewTypes";

export type LiveBoardOverlay = {
  assignments: Record<
    string,
    { tmId?: string; tmName?: string; breakGroup?: number; isLocked?: boolean }
  >;
  auxDefs: AuxDef[];
  tasksBySlot: Record<string, NightSlotTask[]>;
  notes?: string;
};

function isDisplayName(value: string | undefined): value is string {
  const name = value?.trim();
  return Boolean(name && name !== "-");
}

/**
 * Live board state is allowed to be partial while an optimistic assignment is
 * settling. Keep the persisted name when it belongs to the same TM so the
 * print sheet never turns a valid assignment into an unassigned dash.
 */
function mergeLiveAssignments(
  persisted: PrintDaySnapshot["assignments"],
  live: LiveBoardOverlay["assignments"],
): PrintDaySnapshot["assignments"] {
  const merged = { ...persisted };

  for (const [slotKey, liveAssignment] of Object.entries(live)) {
    const savedAssignment = persisted[slotKey];
    const sameTm = Boolean(
      liveAssignment.tmId && savedAssignment?.tmId === liveAssignment.tmId,
    );
    const tmName = isDisplayName(liveAssignment.tmName)
      ? liveAssignment.tmName
      : sameTm && isDisplayName(savedAssignment?.tmName)
        ? savedAssignment.tmName
        : liveAssignment.tmName;

    merged[slotKey] = {
      ...savedAssignment,
      ...liveAssignment,
      tmName,
    };
  }

  return merged;
}

/** Overlay live builder board state onto a fetched snapshot (current night preview). */
export function applyLiveBoardToPrintSnapshot(
  snapshot: PrintDaySnapshot,
  live: LiveBoardOverlay,
): PrintDaySnapshot {
  const assignments = mergeLiveAssignments(snapshot.assignments, live.assignments);

  return {
    ...snapshot,
    assignments,
    auxDefs: live.auxDefs,
    tasksBySlot: live.tasksBySlot,
    breakCounts: computeBreakCounts(assignments),
    ...(live.notes !== undefined ? { notes: live.notes } : {}),
  };
}

/** Overlay engine draft proposals onto a Supabase-backed print snapshot. */
export function applyDraftToPrintSnapshot(
  snapshot: PrintDaySnapshot,
  draftAssignments: Record<string, DraftAssignmentRow>,
): PrintDaySnapshot {
  if (!draftAssignments || Object.keys(draftAssignments).length === 0) {
    return snapshot;
  }

  const assignments = { ...snapshot.assignments };

  for (const [slotKey, draft] of Object.entries(draftAssignments)) {
    if (draft.proposedClear) {
      const prev = assignments[slotKey];
      if (prev) {
        assignments[slotKey] = {
          ...prev,
          tmId: undefined,
          tmName: undefined,
        };
      } else {
        delete assignments[slotKey];
      }
      continue;
    }

    const tmName = draft.proposedTmName?.trim();
    const tmId = draft.proposedTmId;
    if (!tmName && !tmId) continue;

    assignments[slotKey] = {
      ...(assignments[slotKey] ?? {}),
      tmId: tmId ?? assignments[slotKey]?.tmId,
      tmName: tmName || assignments[slotKey]?.tmName,
    };
  }

  return {
    ...snapshot,
    assignments,
    breakCounts: computeBreakCounts(assignments),
  };
}
