"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
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
import { premiumSpring } from "@/lib/premiumSpring";

/** above-ops-pill: fixed bottom-right; inline: parent flex cluster handles position. 
 *  side-right-collapsed: thin vertical bar on right side of builder canvas (collapsed health to the side). 
 */
export type RotationHealthPlacement =
  | "above-ops-pill"
  | "inline"
  | "below-page"
  | "page-corner"
  | "side-right-collapsed";

/** Viewport offset from bottom — clears the ops status pill (~28px) + 10px margin. */
const OPS_PILL_STACK_BOTTOM_PX = 44;

export type RotationHealthFloaterProps = {
  visible: boolean;
  auxDefs: AuxDef[];
  assignments: Record<string, SlotAssignmentRow>;
  fitBySlot: Record<string, PrerenderedPlacementFit>;
  isDraftMode?: boolean;
  draftAssignments?: Record<string, DraftAssignmentRow>;
  /** above-ops-pill (default): fixed above ops telemetry; below-page: under artboard frame.
   * side-right-collapsed: compact indicator on the right edge (small section, not full height) that expands as a drawer with details + engine controls.
   */
  placement?: RotationHealthPlacement;
  weekDailyHealths?: Record<string, number>;
  selectedDayDateKey?: string;
  weekHealthLoading?: boolean;

  // Engine controls to embed in the expanded drawer (clear + run xAI/rotation engine).
  // Only shown in builder view when provided.
  canRunEngine?: boolean;
  running?: boolean;
  onRunEngine?: () => void;
  onClear?: () => void;
  onApplyDraft?: () => void;
  onDiscardDraft?: () => void;
  draftGrokExplanation?: string;
  isCurrentNightLocked?: boolean;
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
    `Rotation health: big = tonight fit. Small = ${GRAVE_WEEK_LABEL} fit avg + repeat policy (separate).`,
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
  // Engine controls for the side drawer
  canRunEngine,
  onRunEngine,
  onClear,
  running,
  onApplyDraft,
  onDiscardDraft,
  draftGrokExplanation,
  isCurrentNightLocked,
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
  const [expanded, setExpanded] = React.useState(false);
  const draftSlotCount = React.useMemo(
    () =>
      Object.values(draftAssignments ?? {}).filter(
        (d) => d?.proposedTmName?.trim() && !d.proposedClear,
      ).length,
    [draftAssignments],
  );
  const draftActionsDisabled = Boolean(isCurrentNightLocked || running);
  const canApplyDraft = !draftActionsDisabled && draftSlotCount > 0;
  const canDiscardDraft = !draftActionsDisabled && Boolean(isDraftMode);

  if (!visible) return null;

  const colors = rotationHealthFloaterColors(dailyPercent);
  const display = dailyPercent !== null ? `${dailyPercent}%` : "—%";

  // Collapsed to the side as a little drawer / indicator (builder view only).
  // Small section of the right edge (compact height, not full side), positioned off to the side at bottom of aux/grid.
  // Click the indicator to toggle the drawer panel that slides in with full health details + clear/run engine controls.
  // Does not overtake the surface. Uses premiumSpring for smooth expand.
  if (placement === "side-right-collapsed") {
    const indicatorRight = 8; // just off the scrollbar, right-aligned to the Live pill
    const indicatorBottom = 20; // bottom of the tab sits on the top of the Live pill
    const indicatorWidth = 16;
    const indicatorHeight = 30; // small compact tab directly on the top right of the Live pill

    return (
      <>
        {/* Compact indicator / drawer handle - small vertical tab pinned on the top right of the Live pill */}
        <motion.div
          onClick={() => setExpanded((e) => !e)}
          className="no-print flex flex-col items-center justify-center cursor-pointer select-none"
          style={{
            position: "fixed",
            right: indicatorRight,
            bottom: indicatorBottom,
            width: indicatorWidth,
            height: indicatorHeight,
            background: colors.bg,
            borderLeft: `1px solid ${colors.border}`,
            borderTop: `1px solid ${colors.border}`,
            borderBottom: `1px solid ${colors.border}`,
            color: colors.text,
            fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            zIndex: 60,
          }}
          whileHover={{ scale: 1.05 }}
          transition={premiumSpring}
          title={expanded ? "Collapse rotation health drawer" : "Expand for details + engine controls"}
          aria-expanded={expanded}
        >
          <div
            style={{
              writingMode: "vertical-rl",
              transform: "rotate(180deg)",
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.5px",
              display: "flex",
              alignItems: "center",
              gap: 1,
              whiteSpace: "nowrap",
              height: "100%",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: "11px", fontWeight: 800, fontFamily: "ui-monospace, monospace" }}>{display}</span>
          </div>
          <span style={{ fontSize: 6, opacity: 0.7 }}>{expanded ? "‹" : "›"}</span>
        </motion.div>

        {/* Expandable drawer panel - to the left of the indicator, larger for details, pinned above the Live pill */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 160, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={premiumSpring}
              className="no-print overflow-hidden"
              style={{
                position: "fixed",
                right: indicatorRight + indicatorWidth,
                bottom: indicatorBottom,
                width: 160,
                height: 110, // larger for readable details + buttons, still compact at bottom right
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                color: colors.text,
                fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
                boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
                zIndex: 60,
              }}
            >
              <div style={{ padding: "4px 6px", fontSize: "8px", lineHeight: 1.15, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                {/* Health summary */}
                <div>
                  <div className="text-[6px] font-semibold uppercase tracking-[0.5px] opacity-85">Rotation health</div>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-[14px] font-bold tabular-nums" style={{ fontFamily: "ui-monospace, monospace" }}>{display}</span>
                    <span className="text-[6px] uppercase tracking-[0.04em] opacity-70">tonight</span>
                  </div>
                  <div className="text-[7px] font-semibold tabular-nums opacity-90 mt-0.5">
                    {weekAverageDisplay} fit · {(health.weekPolicyPercent ?? health.weeklyBalance) ?? "—"}% policy
                    {health.openGaps > 0 ? ` · ${health.openGaps} gap${health.openGaps > 1 ? "s" : ""}` : ""}
                  </div>
                  <div className="text-[6px] opacity-70 mt-0.5 leading-snug">
                    tonight · {GRAVE_WEEK_LABEL} avg · policy · target {ROTATION_HEALTH_TARGET}%
                  </div>
                </div>

                {isDraftMode && (
                  <div className="mt-0.5 text-[6px] opacity-85 leading-snug">
                    Draft preview · {draftSlotCount} placement{draftSlotCount === 1 ? "" : "s"}
                    {draftGrokExplanation ? (
                      <div className="opacity-75 mt-0.5 line-clamp-2" title={draftGrokExplanation}>
                        {draftGrokExplanation.slice(0, 80)}{draftGrokExplanation.length > 80 ? "…" : ""}
                      </div>
                    ) : null}
                  </div>
                )}

                {(onApplyDraft || onDiscardDraft) && isDraftMode && (
                  <div className="mt-1 flex gap-1">
                    {onDiscardDraft && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDiscardDraft(); }}
                        disabled={!canDiscardDraft}
                        className="flex-1 text-[6px] px-1 py-0.5 rounded border border-current opacity-80 hover:opacity-100 disabled:opacity-40"
                        style={{ fontFamily: "inherit" }}
                      >
                        Discard
                      </button>
                    )}
                    {onApplyDraft && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void onApplyDraft(); setExpanded(false); }}
                        disabled={!canApplyDraft}
                        className="flex-1 text-[6px] px-1 py-0.5 rounded bg-current text-[color:var(--bg)] font-semibold disabled:opacity-40"
                        style={{ fontFamily: "inherit" }}
                      >
                        Apply
                      </button>
                    )}
                  </div>
                )}

                {/* Clear and Run engine controls in the drawer */}
                {(onClear || onRunEngine) && (
                  <div className="mt-1 pt-1 border-t border-current opacity-30 flex gap-1">
                    {onClear && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onClear(); setExpanded(false); }}
                        disabled={!onClear}
                        className="flex-1 text-[6px] px-1 py-0.5 rounded border border-current opacity-80 hover:opacity-100 disabled:opacity-40"
                        style={{ fontFamily: "inherit" }}
                      >
                        Clear
                      </button>
                    )}
                    {onRunEngine && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRunEngine(); }}
                        disabled={!canRunEngine || running}
                        className="flex-1 text-[6px] px-1 py-0.5 rounded bg-current text-[color:var(--bg)] font-semibold disabled:opacity-40"
                        style={{ fontFamily: "inherit", opacity: running ? 0.6 : 0.85 }}
                      >
                        {running ? "Running..." : "Run engine"}
                      </button>
                    )}
                  </div>
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
                  className="self-end mt-0.5 text-[6px] opacity-60 hover:opacity-100 underline"
                  style={{ fontFamily: "inherit" }}
                >
                  close
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

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
          fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
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
            title="Tonight fit"
          >
            {display}
          </span>
          <span
            className="text-[7px] font-semibold uppercase tracking-[0.04em] opacity-75"
            style={{ lineHeight: 1 }}
          >
            tonight
          </span>
        </span>
        <span
          className="flex items-baseline gap-2 text-[11px] font-semibold tabular-nums opacity-90"
          style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", lineHeight: 1.1 }}
        >
          <span title={`${GRAVE_WEEK_LABEL} mean nightly fit`}>{weekAverageDisplay} fit</span>
          <span className="opacity-60">·</span>
          <span title="Week repeat policy">
            {(health.weekPolicyPercent ?? health.weeklyBalance) != null
              ? `${health.weekPolicyPercent ?? health.weeklyBalance}%`
              : "—%"}{" "}
            policy
            {xaiAdj > 0 && <span className="text-[9px] ml-0.5 opacity-70">xAI</span>}
          </span>
        </span>
        <span className="text-[7.5px] opacity-80 tabular-nums" style={{ lineHeight: 1 }}>
          tonight fit · {GRAVE_WEEK_LABEL} fit avg · repeat policy · target {ROTATION_HEALTH_TARGET}%
          {health.openGaps > 0 ? ` · ${health.openGaps} gap${health.openGaps === 1 ? "" : "s"}` : ""}
        </span>
      </div>
    </div>
  );
}