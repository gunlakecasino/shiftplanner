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
    "Rotation health averages assigned zone / RR / aux placements (open gaps excluded) and incorporates real weekly balance from histories (repeats this grave week).",
    `Target: ${ROTATION_HEALTH_TARGET}%`,
    "",
    percent !== null ? `Tonight (fit): ${percent}%` : "Tonight: —",
    (health as any).weeklyBalance !== undefined ? `Weekly (balance): ${(health as any).weeklyBalance}% (max repeat: ${(health as any).maxWeeklyRepeat ?? 0}, violations: ${(health as any).repeatViolations ?? 0})` : "Weekly: —",
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

  // Weekly % now driven by real balance from weekly history (see compute in shiftRotationHealth).
  // Fallback to old synthetic only if no data.
  const realWeekly = (health as any).weeklyBalance;
  const weeklyPercent = realWeekly !== undefined
    ? Math.round(realWeekly)
    : (health.percent !== null ? Math.max(health.percent - (health.openGaps > 4 ? 5 : 2), 70) : null);
  const weeklyDisplay = weeklyPercent !== null ? `${weeklyPercent}%` : "—%";

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
      className="no-print sb-floater-enter"
      style={{
        ...anchorStyle,
        pointerEvents: "auto",
      }}
      title={breakdownTitle(health)}
    >
      <div
        className="sb-glass-pill flex flex-col items-end gap-0.5 rounded-xl px-4 py-2.5 shadow-[0_6px_18px_rgba(0,0,0,0.18),_inset_0_1px_0_rgba(255,255,255,0.75)]"
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          color: colors.text,
          fontFamily: "var(--font-atkinson, var(--font-ui, system-ui)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.25), 0 8px 25px rgba(0,0,0,0.12)",
        }}
      >
        <span
          className="text-[7.5px] font-semibold uppercase tracking-[0.5px] opacity-90"
          style={{ lineHeight: 1 }}
        >
          Rotation health
        </span>
        <span className="flex items-baseline gap-1.5">
          <span
            className="text-[24px] font-bold tabular-nums leading-none"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}
          >
            {display}
          </span>
          <span
            className="text-[13px] font-semibold tabular-nums opacity-85"
            style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", lineHeight: 1 }}
          >
            {weeklyDisplay} wk
          </span>
        </span>
        <span className="text-[7.5px] opacity-80 tabular-nums" style={{ lineHeight: 1 }}>
          target {ROTATION_HEALTH_TARGET}%
          {health.openGaps > 0 ? ` · ${health.openGaps} gap${health.openGaps === 1 ? "" : "s"}` : ""}
        </span>
      </div>
    </div>
  );
}