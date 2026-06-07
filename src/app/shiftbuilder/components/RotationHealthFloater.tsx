"use client";

import React from "react";
import {
  computeShiftRotationHealth,
  computeWeekAverageHealth,
  GRAVE_WEEK_LABEL,
  ROTATION_HEALTH_TARGET,
  rotationHealthFloaterColors,
  getWeekRepeatViolations,
  type ShiftRotationHealth,
  type WeekRepeatViolation,
} from "./shiftRotationHealth";
// WeekRepeatViolation is referenced in breakdownTitle for the (optional) viol list note.
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
  weekDailyHealths?: Record<string, number>;
  selectedDayDateKey?: string;
  weekHealthLoading?: boolean;
};

function breakdownTitle(
  health: ShiftRotationHealth,
  dailyPercent: number | null,
  weekAveragePercent: number | null,
): string {
  const { counts, openGaps, scoredCount } = health;
  const xaiAdj = (health as any).xaiRepeatPenaltyReduction || 0;
  const viols = (health as any).repeatViolations ?? 0;
  const maxR = (health as any).maxWeeklyRepeat ?? 0;
  const violList = (health as any).violations as WeekRepeatViolation[] | undefined;
  const violNote = viols > 0 ? ` · ${viols} viol${viols > 1 ? "s" : ""} (use ADVISOR or week scan for moves)` : "";
  const lines = [
    `Rotation health: big = this day's health. Small = ${GRAVE_WEEK_LABEL} week average (mean of built days).`,
    "xAI fairnessSignals on violating placements can reduce the week penalty (numeric 'forgiveness').",
    "ADVISOR (main cluster) or 'xAI week scan' in WEEK BUILDER: concrete (TM+slot+night) moves to raise the week average.",
    `Target: ${ROTATION_HEALTH_TARGET}%`,
    "",
    dailyPercent !== null ? `This day: ${dailyPercent}%` : "This day: —",
    weekAveragePercent !== null
      ? `Week avg (${GRAVE_WEEK_LABEL}): ${weekAveragePercent}%`
      : `Week avg (${GRAVE_WEEK_LABEL}): —`,
    (health as any).weeklyBalance !== undefined ? `Policy week score: ${(health as any).weeklyBalance}% (max repeat: ${maxR}, violations: ${viols})${xaiAdj > 0 ? ` · xAI adj -${xaiAdj.toFixed(0)}pt` : ""}${violNote}` : "",
    `${scoredCount} assigned · ${openGaps} open gap${openGaps === 1 ? "" : "s"}`,
    "Key signals: 30-night spread, last-5, this-week repeat per placement, bilateral swap lanes, xAI coverage on violators.",
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
  weekDailyHealths,
  selectedDayDateKey,
  weekHealthLoading,
}: RotationHealthFloaterProps) {
  const health = React.useMemo(
    () =>
      computeShiftRotationHealth(auxDefs, assignments, fitBySlot, {
        isDraftMode,
        draftAssignments,
        weekDailyHealths,
      }),
    [auxDefs, assignments, fitBySlot, isDraftMode, draftAssignments, weekDailyHealths],
  );

  const trackerDaily =
    selectedDayDateKey && weekDailyHealths
      ? weekDailyHealths[selectedDayDateKey]
      : undefined;
  const dailyPercent = weekHealthLoading ? null : (trackerDaily ?? null);
  const weekAveragePercent = weekHealthLoading
    ? null
    : computeWeekAverageHealth(weekDailyHealths);
  const weekAverageDisplay =
    weekAveragePercent !== null ? `${weekAveragePercent}%` : "—%";
  const xaiAdj = health.xaiRepeatPenaltyReduction || 0;

  if (!visible) return null;

  const colors = rotationHealthFloaterColors(dailyPercent);
  const display = dailyPercent !== null ? `${dailyPercent}%` : "—%";

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
      title={breakdownTitle(health, dailyPercent, weekAveragePercent)}
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
            {weekAverageDisplay} wk avg
            {xaiAdj > 0 && <span className="text-[10px] ml-0.5 opacity-70">xAI</span>}
          </span>
        </span>
        <span className="text-[7.5px] opacity-80 tabular-nums" style={{ lineHeight: 1 }}>
          this day · {GRAVE_WEEK_LABEL} avg · target {ROTATION_HEALTH_TARGET}%
          {health.openGaps > 0 ? ` · ${health.openGaps} gap${health.openGaps === 1 ? "" : "s"}` : ""}
        </span>
      </div>
    </div>
  );
}