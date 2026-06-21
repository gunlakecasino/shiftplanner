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

/** Overlay live builder board state onto a fetched snapshot (current night preview). */
export function applyLiveBoardToPrintSnapshot(
  snapshot: PrintDaySnapshot,
  live: LiveBoardOverlay,
): PrintDaySnapshot {
  return {
    ...snapshot,
    assignments: live.assignments,
    auxDefs: live.auxDefs,
    tasksBySlot: live.tasksBySlot,
    breakCounts: computeBreakCounts(live.assignments),
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