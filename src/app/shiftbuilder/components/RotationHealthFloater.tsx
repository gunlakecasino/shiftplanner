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

/** above-ops-pill: fixed bottom-right; inline: parent flex cluster handles position. */
export type RotationHealthPlacement =
  | "above-ops-pill"
  | "inline"
  | "below-page"
  | "page-corner";

/** Viewport offset from bottom — clears the ops status pill (~28px) + 10px margin. */
const OPS_PILL_STACK_BOTTOM_PX = 44;

export type RotationHealthFloaterProps = {
  visible: boolean;
  auxDefs: AuxDef[];
  assignments: Record<string, SlotAssignmentRow>;
  fitBySlot: Record<string, PrerenderedPlacementFit>;
  isDraftMode?: boolean;
  draftAssignments?: Record<string, DraftAssignmentRow>;
  /** above-ops-pill (default): fixed above ops telemetry; below-page: under artboard frame */
  placement?: RotationHealthPlacement;
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

/** Pinned above OpsStatusBar on canvas; screen-only (no-print). */
export function RotationHealthFloater({
  visible,
  auxDefs,
  assignments,
  fitBySlot,
  isDraftMode,
  draftAssignments,
  placement = "above-ops-pill",
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

  const anchorStyle: React.CSSProperties =
    placement === "inline"
      ? { position: "relative", zIndex: 1 }
      : placement === "above-ops-pill"
        ? {
            position: "fixed",
            bottom: OPS_PILL_STACK_BOTTOM_PX,
            right: 10,
            zIndex: 2147483646,
          }
        : placement === "page-corner"
        ? {
            position: "absolute",
            bottom: 10,
            right: 10,
            zIndex: 30,
          }
        : {
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 8,
            zIndex: 30,
          };

  return (
    <div
      className="no-print"
      style={{
        ...anchorStyle,
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