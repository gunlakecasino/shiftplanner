"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  computeShiftRotationHealth,
  computeWeekAverageHealth,
  GRAVE_WEEK_LABEL,
  ROTATION_HEALTH_TARGET,
  rotationHealthFloaterColors,
  type ShiftRotationHealth,
} from "./shiftRotationHealth";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import type { DraftAssignmentRow, SlotAssignmentRow } from "./placementFitForSlot";
import { premiumSpring } from "@/lib/premiumSpring";
import { ROTATION_HEALTH_BOTTOM_PX } from "./canvasPillGlass";
import { SB_DRAWER_TRANSITION } from "./builderPrimitives";

/** above-ops-pill: fixed bottom-right; inline: parent flex cluster handles position.
 *  side-right-collapsed: compact pill above LIVE ops bar; expands left as a drawer.
 */
export type RotationHealthPlacement =
  | "above-ops-pill"
  | "inline"
  | "below-page"
  | "page-corner"
  | "side-right-collapsed";

/** Viewport offset from bottom — clears the ops status pill (~28px) + margin. */
const OPS_PILL_STACK_BOTTOM_PX = ROTATION_HEALTH_BOTTOM_PX;

/** Matches OpsStatusBar shell — sit directly above LIVE with same right inset. */
const OPS_PILL_RIGHT_INSET = "max(10px, env(safe-area-inset-right, 0px))";
const OPS_PILL_Z = 2147483647;
const ROTATION_HEALTH_Z = OPS_PILL_Z - 1;

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
  const clusterRef = React.useRef<HTMLDivElement>(null);
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

  React.useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!clusterRef.current?.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [expanded]);

  if (!visible) return null;

  const colors = rotationHealthFloaterColors(dailyPercent);
  const display = dailyPercent !== null ? `${dailyPercent}%` : "—%";

  if (placement === "side-right-collapsed") {
    return (
      <div
        ref={clusterRef}
        className="no-print"
        style={{
          position: "fixed",
          right: OPS_PILL_RIGHT_INSET,
          bottom: `max(${OPS_PILL_STACK_BOTTOM_PX}px, calc(${OPS_PILL_STACK_BOTTOM_PX}px + env(safe-area-inset-bottom, 0px)))`,
          zIndex: ROTATION_HEALTH_Z,
          display: "flex",
          flexDirection: "row-reverse",
          alignItems: "stretch",
          pointerEvents: "auto",
          fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
        }}
      >
        {/* Collapsed handle — horizontal pill above LIVE */}
        <motion.button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 cursor-pointer select-none shrink-0"
          style={{
            background: colors.bg,
            border: `1px solid ${colors.border}`,
            color: colors.text,
            boxShadow: "0 4px 14px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.12)",
            minHeight: 32,
            minWidth: 72,
          }}
          whileHover={{ scale: 1.02 }}
          transition={premiumSpring}
          title={expanded ? "Collapse rotation health drawer" : breakdownTitle(health, dailyPercent, weekAveragePercent)}
          aria-expanded={expanded}
          aria-label={`Rotation health ${display}. ${expanded ? "Collapse" : "Expand"} drawer`}
        >
          <span className="text-[7px] font-bold uppercase tracking-[0.6px] opacity-85">ROT</span>
          <span
            className="text-[13px] font-bold tabular-nums leading-none"
            style={{ fontFamily: "ui-monospace, monospace" }}
          >
            {display}
          </span>
          <span className="text-[10px] opacity-70" aria-hidden="true">
            {expanded ? "›" : "‹"}
          </span>
        </motion.button>

        {/* Drawer expands left (same pattern as LIVE ops telemetry) */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ maxWidth: 0, opacity: 0, paddingLeft: 0, paddingRight: 0 }}
              animate={{ maxWidth: 220, opacity: 1, paddingLeft: 0, paddingRight: 8 }}
              exit={{ maxWidth: 0, opacity: 0, paddingLeft: 0, paddingRight: 0 }}
              transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              className="overflow-hidden flex items-stretch"
              style={{ transition: SB_DRAWER_TRANSITION }}
            >
              <div
                className="rounded-[10px] overflow-hidden flex flex-col justify-between"
                style={{
                  width: 212,
                  minHeight: 32,
                  maxHeight: 148,
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  color: colors.text,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.22)",
                  padding: "6px 8px",
                  fontSize: 9,
                  lineHeight: 1.25,
                }}
              >
                <div>
                  <div className="text-[7px] font-semibold uppercase tracking-[0.5px] opacity-85">
                    Rotation health
                  </div>
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span
                      className="text-[18px] font-bold tabular-nums leading-none"
                      style={{ fontFamily: "ui-monospace, monospace" }}
                    >
                      {display}
                    </span>
                    <span className="text-[7px] uppercase tracking-[0.04em] opacity-70">tonight</span>
                  </div>
                  <div className="text-[8px] font-semibold tabular-nums opacity-90 mt-0.5">
                    {weekAverageDisplay} fit · {(health.weekPolicyPercent ?? health.weeklyBalance) ?? "—"}% policy
                    {health.openGaps > 0 ? ` · ${health.openGaps} gap${health.openGaps > 1 ? "s" : ""}` : ""}
                  </div>
                  <div className="text-[7px] opacity-70 mt-0.5 leading-snug">
                    tonight · {GRAVE_WEEK_LABEL} avg · policy · target {ROTATION_HEALTH_TARGET}%
                  </div>
                </div>

                {isDraftMode && (
                  <div className="mt-1 text-[7px] opacity-85 leading-snug">
                    Draft preview · {draftSlotCount} placement{draftSlotCount === 1 ? "" : "s"}
                    {draftGrokExplanation ? (
                      <div className="opacity-75 mt-0.5 line-clamp-2" title={draftGrokExplanation}>
                        {draftGrokExplanation.slice(0, 96)}{draftGrokExplanation.length > 96 ? "…" : ""}
                      </div>
                    ) : null}
                  </div>
                )}

                {(onApplyDraft || onDiscardDraft) && isDraftMode && (
                  <div className="mt-1.5 flex gap-1">
                    {onDiscardDraft && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onDiscardDraft(); }}
                        disabled={!canDiscardDraft}
                        className="flex-1 text-[7px] px-1.5 py-1 rounded border border-current opacity-80 hover:opacity-100 disabled:opacity-40"
                      >
                        Discard
                      </button>
                    )}
                    {onApplyDraft && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); void onApplyDraft(); setExpanded(false); }}
                        disabled={!canApplyDraft}
                        className="flex-1 text-[7px] px-1.5 py-1 rounded bg-current text-[color:var(--bg)] font-semibold disabled:opacity-40"
                      >
                        Apply
                      </button>
                    )}
                  </div>
                )}

                {(onClear || onRunEngine) && (
                  <div className="mt-1.5 pt-1 border-t border-current/30 flex gap-1">
                    {onClear && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onClear(); setExpanded(false); }}
                        disabled={!onClear}
                        className="flex-1 text-[7px] px-1.5 py-1 rounded border border-current opacity-80 hover:opacity-100 disabled:opacity-40"
                      >
                        Clear
                      </button>
                    )}
                    {onRunEngine && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRunEngine(); }}
                        disabled={!canRunEngine || running}
                        className="flex-1 text-[7px] px-1.5 py-1 rounded bg-current text-[color:var(--bg)] font-semibold disabled:opacity-40"
                        style={{ opacity: running ? 0.6 : 0.9 }}
                      >
                        {running ? "Running…" : "Run engine"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const anchorStyle: React.CSSProperties =
    placement === "inline"
      ? { position: "relative", zIndex: 1 }
      : placement === "above-ops-pill"
        ? {
            position: "fixed",
            bottom: OPS_PILL_STACK_BOTTOM_PX,
            right: OPS_PILL_RIGHT_INSET,
            zIndex: ROTATION_HEALTH_Z,
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