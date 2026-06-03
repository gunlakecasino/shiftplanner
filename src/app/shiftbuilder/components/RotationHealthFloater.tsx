"use client";

import React from "react";
import {
  computeShiftRotationHealth,
  ROTATION_HEALTH_TARGET,
  rotationHealthFloaterColors,
  type ShiftRotationHealth,
} from "./shiftRotationHealth";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import type { DraftAssignmentRow, SlotAssignmentRow } from "./placementFitForSlot";

export type RotationHealthFloaterProps = {
  visible: boolean;
  auxDefs: AuxDef[];
  assignments: Record<string, SlotAssignmentRow>;
  fitBySlot: Record<string, PrerenderedPlacementFit>;
  isDraftMode?: boolean;
  draftAssignments?: Record<string, DraftAssignmentRow>;
};

function breakdownTitle(health: ShiftRotationHealth): string {
  const { counts, openGaps, scoredCount, percent } = health;
  const lines = [
    "Rotation health averages assigned zone / RR / aux placements (open gaps excluded).",
    `Target: ${ROTATION_HEALTH_TARGET}%`,
    "",
    percent !== null ? `Score: ${percent}%` : "Score: — (no assigned slots yet)",
    `${scoredCount} assigned · ${openGaps} open gap${openGaps === 1 ? "" : "s"}`,
    "",
    `${counts.strong_fit} strong · ${counts.acceptable} acceptable · ${counts.questionable} check · ${counts.needs_swap} swap · ${counts.poor_fit} poor`,
  ];
  return lines.join("\n");
}

/** Fixed above OpsStatusBar; screen-only (no-print). */
export function RotationHealthFloater({
  visible,
  auxDefs,
  assignments,
  fitBySlot,
  isDraftMode,
  draftAssignments,
}: RotationHealthFloaterProps) {
  const health = React.useMemo(
    () =>
      computeShiftRotationHealth(auxDefs, assignments, fitBySlot, {
        isDraftMode,
        draftAssignments,
      }),
    [auxDefs, assignments, fitBySlot, isDraftMode, draftAssignments],
  );

  if (!visible) return null;

  const colors = rotationHealthFloaterColors(health.percent);
  const display =
    health.percent !== null ? `${health.percent}%` : "—%";

  return (
    <div
      className="no-print"
      style={{
        position: "fixed",
        bottom: 36,
        right: 10,
        zIndex: 2147483646,
        pointerEvents: "auto",
      }}
      title={breakdownTitle(health)}
    >
      <div
        className="flex flex-col items-end gap-0.5 rounded px-2 py-1 shadow-lg"
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          color: colors.text,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
        }}
      >
        <span
          className="text-[7px] font-semibold uppercase tracking-[0.14em] opacity-90"
          style={{ lineHeight: 1 }}
        >
          Rotation health
        </span>
        <span className="text-[13px] font-bold tabular-nums leading-none">
          {display}
        </span>
        <span className="text-[7px] opacity-80 tabular-nums" style={{ lineHeight: 1 }}>
          target {ROTATION_HEALTH_TARGET}%
          {health.openGaps > 0 ? ` · ${health.openGaps} gap${health.openGaps === 1 ? "" : "s"}` : ""}
        </span>
      </div>
    </div>
  );
}