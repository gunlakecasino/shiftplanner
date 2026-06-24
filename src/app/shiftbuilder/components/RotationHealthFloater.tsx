"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  computeShiftRotationHealth,
  computeWeekAverageHealth,
  GRAVE_WEEK_LABEL,
  ROTATION_HEALTH_TARGET,
  normalizeRotationHealthPercent,
  formatRotationHealthPercent,
  type ShiftRotationHealth,
} from "./shiftRotationHealth";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import type { DraftAssignmentRow, SlotAssignmentRow } from "./placementFitForSlot";
import { ROTATION_HEALTH_BOTTOM_PX, ROTATION_HEALTH_Z } from "./canvasPillGlass";
import { RotationHealthOrb } from "./RotationHealthOrb";

export type RotationHealthPlacement =
  | "above-ops-pill"
  | "inline"
  | "below-page"
  | "page-corner"
  | "side-right-collapsed";

const OPS_PILL_STACK_BOTTOM_PX = ROTATION_HEALTH_BOTTOM_PX;
const OPS_PILL_RIGHT_INSET = "max(10px, env(safe-area-inset-right, 0px))";

function portalToBody(node: React.ReactNode): React.ReactNode {
  if (typeof document === "undefined") return null;
  return createPortal(node, document.body);
}

export type RotationHealthFloaterProps = {
  visible: boolean;
  auxDefs: AuxDef[];
  assignments: Record<string, SlotAssignmentRow>;
  fitBySlot: Record<string, PrerenderedPlacementFit>;
  isDraftMode?: boolean;
  draftAssignments?: Record<string, DraftAssignmentRow>;
  placement?: RotationHealthPlacement;
  weekDailyHealths?: Record<string, number>;
  selectedDayDateKey?: string;
  weekHealthLoading?: boolean;
  weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;
};

function breakdownTitle(
  health: ShiftRotationHealth,
  dailyPercent: number | null,
  weekAveragePercent: number | null,
): string {
  const { counts, openGaps, scoredCount } = health;
  const xaiAdj = health.xaiRepeatPenaltyReduction || 0;
  const viols = health.repeatViolations ?? 0;
  const maxR = health.maxWeeklyRepeat ?? 0;
  const violNote =
    viols > 0
      ? ` · ${viols} viol${viols > 1 ? "s" : ""} (use ADVISOR or week scan for moves)`
      : "";
  const lines = [
    `Rotation health % = placed TMs only (open gaps do not reduce it).`,
    `Granular fit: spread, last-5 position, week repeat, recency, gap coverage (one decimal).`,
    `Tonight fit (per-slot granular avg). Week = ${GRAVE_WEEK_LABEL} fit avg + repeat policy.`,
    `Target: ${ROTATION_HEALTH_TARGET}%`,
    "",
    dailyPercent !== null
      ? `This day: ${formatRotationHealthPercent(dailyPercent)}`
      : "This day: —",
    weekAveragePercent !== null
      ? `Week avg (${GRAVE_WEEK_LABEL}): ${formatRotationHealthPercent(weekAveragePercent)}`
      : `Week avg (${GRAVE_WEEK_LABEL}): —`,
    health.weeklyBalance !== undefined
      ? `Policy week score: ${formatRotationHealthPercent(health.weeklyBalance)} (max repeat: ${maxR}, violations: ${viols})${xaiAdj > 0 ? ` · xAI adj -${xaiAdj.toFixed(0)}pt` : ""}${violNote}`
      : "",
    `${scoredCount} placed scored · ${openGaps} open gap${openGaps === 1 ? "" : "s"} (info only)`,
    "",
    `${counts.strong_fit} strong · ${counts.acceptable} acceptable · ${counts.questionable} check · ${counts.needs_swap} swap · ${counts.poor_fit} poor`,
  ];
  return lines.join("\n");
}

/** Screen-only rotation health orb — no pill, no labels; hover for breakdown. */
export function RotationHealthFloater({
  visible,
  auxDefs,
  assignments,
  fitBySlot,
  isDraftMode,
  draftAssignments,
  placement = "side-right-collapsed",
  weekDailyHealths,
  selectedDayDateKey,
  weekHealthLoading,
  weeklyRecentHistory,
}: RotationHealthFloaterProps) {
  const health = React.useMemo(
    () =>
      computeShiftRotationHealth(auxDefs, assignments, fitBySlot, {
        isDraftMode,
        draftAssignments,
        weekDailyHealths,
        weeklyRecentHistory,
      }),
    [
      auxDefs,
      assignments,
      fitBySlot,
      isDraftMode,
      draftAssignments,
      weekDailyHealths,
      weeklyRecentHistory,
    ],
  );

  const trackerDaily =
    selectedDayDateKey && weekDailyHealths
      ? weekDailyHealths[selectedDayDateKey]
      : undefined;
  const dailyPercentRaw = weekHealthLoading ? null : (trackerDaily ?? null);
  const dailyPercent = normalizeRotationHealthPercent(dailyPercentRaw);
  const weekAveragePercent = normalizeRotationHealthPercent(
    weekHealthLoading ? null : computeWeekAverageHealth(weekDailyHealths),
  );

  if (!visible) return null;

  const display = formatRotationHealthPercent(dailyPercent);
  const tooltip = breakdownTitle(health, dailyPercent, weekAveragePercent);

  const anchorStyle: React.CSSProperties =
    placement === "inline"
      ? { position: "relative", zIndex: 1 }
      : placement === "above-ops-pill" || placement === "side-right-collapsed"
        ? {
            position: "fixed",
            right: OPS_PILL_RIGHT_INSET,
            bottom: `max(${OPS_PILL_STACK_BOTTOM_PX}px, calc(${OPS_PILL_STACK_BOTTOM_PX}px + env(safe-area-inset-bottom, 0px)))`,
            zIndex: ROTATION_HEALTH_Z,
            pointerEvents: "auto",
          }
        : placement === "page-corner"
          ? {
              position: "absolute",
              bottom: 10,
              right: 10,
              zIndex: 30,
              pointerEvents: "auto",
            }
          : {
              position: "absolute",
              top: "100%",
              right: 0,
              marginTop: 8,
              zIndex: 30,
              pointerEvents: "auto",
            };

  const shell = (
    <div style={anchorStyle} className="no-print">
      <RotationHealthOrb
        percent={dailyPercent}
        title={tooltip}
        aria-label={`Rotation health ${display}. Hover for details.`}
      />
    </div>
  );

  return placement === "above-ops-pill" || placement === "side-right-collapsed"
    ? portalToBody(shell)
    : shell;
}