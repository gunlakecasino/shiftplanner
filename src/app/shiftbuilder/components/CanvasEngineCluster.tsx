"use client";

import React from "react";
import { ChevronLeft, ChevronRight, Eraser, Check, X } from "lucide-react";
import {
  computeShiftRotationHealth,
  ROTATION_HEALTH_TARGET,
  rotationHealthFloaterColors,
} from "./shiftRotationHealth";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import type { DraftAssignmentRow, SlotAssignmentRow } from "./placementFitForSlot";
import {
  CANVAS_PILL_MONO,
  ROTATION_HEALTH_BOTTOM_PX,
  velvetGlassPillStyle,
} from "./canvasPillGlass";

export type EngineRunPhase = "idle" | "planner" | "xai";

export type CoverageEngineRunOptions = {
  forceXai?: boolean;
  useTools?: boolean;
  confirmMessage?: string;
  skipConfirm?: boolean;
};

export type CanvasEngineClusterProps = {
  visible: boolean;
  auxDefs: AuxDef[];
  assignments: Record<string, SlotAssignmentRow>;
  fitBySlot: Record<string, PrerenderedPlacementFit>;
  isDraftMode?: boolean;
  draftAssignments?: Record<string, DraftAssignmentRow>;
  draftGrokExplanation?: string;
  canRunEngine: boolean;
  canEditAssignments: boolean;
  isCurrentNightLocked: boolean;
  engineRunPhase: EngineRunPhase;
  /** Optional recent 7-night history (from currentNight / effectiveRecentZoneHistory) to power real weekly balance in health %. */
  weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;
  onRunXaiEngine: () => void;
  onClearBoard: () => void;
  onApplyDraft?: () => void;
  onDiscardDraft?: () => void;
};

/**
 * Rotation health pill with a left-side drawer for Clear board + Run xAI Engine.
 */
export function CanvasEngineCluster({
  visible,
  auxDefs,
  assignments,
  fitBySlot,
  isDraftMode,
  draftAssignments,
  draftGrokExplanation,
  canRunEngine,
  canEditAssignments,
  isCurrentNightLocked,
  engineRunPhase,
  weeklyRecentHistory,
  onRunXaiEngine,
  onClearBoard,
  onApplyDraft,
  onDiscardDraft,
}: CanvasEngineClusterProps) {
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  const draftSlotCount = React.useMemo(
    () =>
      Object.values(draftAssignments ?? {}).filter(
        (d) => d?.proposedTmName?.trim() && !d.proposedClear,
      ).length,
    [draftAssignments],
  );

  const health = React.useMemo(
    () =>
      computeShiftRotationHealth(auxDefs, assignments, fitBySlot, {
        isDraftMode,
        draftAssignments,
        weeklyRecentHistory,
      }),
    [auxDefs, assignments, fitBySlot, isDraftMode, draftAssignments, weeklyRecentHistory],
  );

  // Weekly % now uses real balance from weeklyRecentHistory (or weeklyHistories) when available
  // in the health compute (TM×area repeats this week, max=1 ideal, penalty at 2, real bad at 3+).
  // The returned health.percent is a 0.7 tonight + 0.3 weekly blend so repeats visibly affect the main number.
  // weeklyDisplay / breakdown show the raw weekly component + the max repeat stats.
  const realWeekly = (health as any).weeklyBalance;
  const weeklyPercent = realWeekly !== undefined
    ? Math.round(realWeekly)
    : (health.percent !== null ? Math.max(health.percent - (health.openGaps > 4 ? 5 : 2), 70) : null);
  const weeklyDisplay = weeklyPercent !== null ? `${weeklyPercent}%` : "—%";

  const running = engineRunPhase !== "idle";
  const engineDisabled = !canRunEngine || isCurrentNightLocked || running;
  const clearDisabled = !canEditAssignments || isCurrentNightLocked || running;
  const draftActionsDisabled =
    !canEditAssignments || isCurrentNightLocked || running;
  const saveDisabled = draftActionsDisabled || draftSlotCount === 0;
  const discardDisabled = draftActionsDisabled || !isDraftMode;

  React.useEffect(() => {
    if (running) setDrawerOpen(true);
  }, [running]);

  React.useEffect(() => {
    if (isDraftMode) setDrawerOpen(true);
  }, [isDraftMode]);

  React.useEffect(() => {
    if (!drawerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setDrawerOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [drawerOpen]);

  if (!visible) return null;

  const colors = rotationHealthFloaterColors(health.percent);
  const display = health.percent !== null ? `${health.percent}%` : "—%";

  const breakdownTitle = [
    "Rotation health averages assigned zone / RR / aux placements (open gaps excluded) and incorporates real weekly balance from histories (TM×area repeats). Policy: max repeat 1 per TM per area per week; penalty at 2, real bad at 3+.",
    `Target: ${ROTATION_HEALTH_TARGET}%`,
    health.percent !== null ? `Health (tonight fit + weekly blend): ${health.percent}%` : "Health: —",
    weeklyPercent !== null ? `Weekly (raw balance): ${weeklyPercent}%` : "Weekly: —",
    (health as any).maxWeeklyRepeat !== undefined ? `Max repeat this week: ${(health as any).maxWeeklyRepeat} (violations: ${(health as any).repeatViolations ?? 0})` : "",
    `${health.scoredCount} assigned · ${health.openGaps} open gap${health.openGaps === 1 ? "" : "s"}`,
    `${health.counts.strong_fit} strong · ${health.counts.acceptable} acceptable · ${health.counts.questionable} check`,
    "",
    isDraftMode
      ? "Draft mode: ✓ save all, ✕ discard, eraser clear, re-run engine."
      : "Click to open engine tools (clear board, run xAI engine).",
  ].join("\n");

  let buttonLabel = "Run xAI Engine";
  if (engineRunPhase === "planner") buttonLabel = "Scoring…";
  if (engineRunPhase === "xai") buttonLabel = "xAI judging…";

  const engineTitle = isCurrentNightLocked
    ? "Day is locked — engine cannot run"
    : !canRunEngine
      ? "Insufficient privileges to run the engine"
      : running
        ? "Engine run in progress"
        : "Run weighted planner + xAI judgment — preview in draft mode";

  const clearTitle = isCurrentNightLocked
    ? "Day is locked — board cannot be cleared"
    : !canEditAssignments
      ? "Insufficient privileges to clear assignments"
      : running
        ? "Wait for engine run to finish"
        : "Clear all assignments (locked slots kept)";

  const actionBtnBase: React.CSSProperties = {
    fontFamily: CANVAS_PILL_MONO,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    border: `1px solid ${colors.border}`,
    color: colors.text,
    background: "rgba(0,0,0,0.18)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  return (
    <div
      ref={rootRef}
      className="no-print"
      style={{
        position: "fixed",
        bottom: ROTATION_HEALTH_BOTTOM_PX,
        right: 10,
        zIndex: 2147483646,
        pointerEvents: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: 8,
      }}
    >
      {isDraftMode && (
        <div
          className="px-3 py-2 max-w-[min(340px,calc(100vw-24px))]"
          style={velvetGlassPillStyle()}
          title="Engine draft preview — nothing is saved until you apply"
        >
          <div
            className="flex items-center gap-2"
            style={{
              fontFamily: CANVAS_PILL_MONO,
              fontSize: 10,
              letterSpacing: "0.04em",
            }}
          >
            <span
              className="shrink-0 rounded px-1.5 py-0.5 font-bold uppercase"
              style={{
                fontSize: 8,
                background: "rgba(251,191,36,0.22)",
                border: "1px solid rgba(251,191,36,0.35)",
                color: "var(--sb-text-1, inherit)",
              }}
            >
              Draft
            </span>
            <span className="leading-snug opacity-90">
              Engine preview on cards
              {draftSlotCount > 0
                ? ` · ${draftSlotCount} placement${draftSlotCount === 1 ? "" : "s"}`
                : ""}
            </span>
          </div>
          {isDraftMode && draftGrokExplanation && (
            <div
              style={{
                fontSize: 9,
                opacity: 0.85,
                marginTop: 4,
                fontFamily: CANVAS_PILL_MONO,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }}
              title={draftGrokExplanation}
            >
              xAI summary: {draftGrokExplanation.slice(0, 140)}{draftGrokExplanation.length > 140 ? '…' : ''}
            </div>
          )}
        </div>
      )}

      <div
        className="flex flex-row items-stretch overflow-hidden rounded shadow-lg"
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
          backdropFilter: "blur(6px) saturate(120%)",
          WebkitBackdropFilter: "blur(6px) saturate(120%)",
        }}
      >
        {/* Side drawer — actions slide out to the left */}
        <div
          aria-hidden={!drawerOpen}
          className="sb-drawer-shell flex items-center"
          style={{
            maxWidth: drawerOpen ? (isDraftMode ? 320 : 280) : 0,
            opacity: drawerOpen ? 1 : 0,
            paddingLeft: drawerOpen ? 6 : 0,
            paddingRight: drawerOpen ? 4 : 0,
            gap: drawerOpen ? 6 : 0,
            borderRight: drawerOpen ? `1px solid ${colors.border}` : "none",
          }}
        >
          {isDraftMode && (
            <>
              <button
                type="button"
                onClick={() => onDiscardDraft?.()}
                disabled={discardDisabled}
                title={
                  isCurrentNightLocked
                    ? "Day is locked"
                    : "Discard engine draft"
                }
                aria-label="Discard draft"
                className="sb-interactive rounded p-1.5 disabled:opacity-40 shrink-0"
                style={{
                  ...actionBtnBase,
                  padding: 6,
                  cursor: discardDisabled ? "not-allowed" : "pointer",
                }}
              >
                <X size={15} strokeWidth={2.25} aria-hidden />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void onApplyDraft?.();
                }}
                disabled={saveDisabled}
                title={
                  saveDisabled
                    ? "No draft placements to save"
                    : "Save all draft placements to the board"
                }
                aria-label="Save all draft placements"
                className="sb-interactive rounded p-1.5 disabled:opacity-40 shrink-0"
                style={{
                  ...actionBtnBase,
                  padding: 6,
                  background: saveDisabled
                    ? actionBtnBase.background
                    : "rgba(34,197,94,0.35)",
                  cursor: saveDisabled ? "not-allowed" : "pointer",
                }}
              >
                <Check size={15} strokeWidth={2.5} aria-hidden />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClearBoard}
            disabled={clearDisabled}
            title={clearTitle}
            aria-label="Clear board"
            className="sb-interactive rounded p-1.5 disabled:opacity-40 shrink-0"
            style={{
              ...actionBtnBase,
              padding: 6,
              cursor: clearDisabled ? "not-allowed" : "pointer",
            }}
          >
            <Eraser size={15} strokeWidth={2.25} aria-hidden />
          </button>
          {!isDraftMode && (
            <button
              type="button"
              onClick={onRunXaiEngine}
              disabled={engineDisabled}
              title={engineTitle}
              className={`sb-interactive rounded px-2 py-1.5 disabled:opacity-40 shrink-0 ${running ? "sb-engine-running" : ""}`}
              style={{
                ...actionBtnBase,
                textTransform: "uppercase",
                background: running ? "rgba(0,0,0,0.28)" : actionBtnBase.background,
                cursor: engineDisabled ? "not-allowed" : "pointer",
              }}
            >
              {buttonLabel}
            </button>
          )}
          {isDraftMode && !running && (
            <button
              type="button"
              onClick={onRunXaiEngine}
              disabled={engineDisabled}
              title="Re-run xAI engine (replaces current draft)"
              className="rounded px-2 py-1.5 transition-opacity disabled:opacity-40 shrink-0"
              style={{
                ...actionBtnBase,
                textTransform: "uppercase",
                cursor: engineDisabled ? "not-allowed" : "pointer",
              }}
            >
              Re-run
            </button>
          )}
        </div>

        {/* Rotation health — toggle drawer */}
        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-expanded={drawerOpen}
          aria-label={
            drawerOpen
              ? "Close engine tools drawer"
              : "Open engine tools drawer"
          }
          title={breakdownTitle}
          className="flex items-center gap-2 px-4 py-2 text-left transition-opacity hover:opacity-95"
          style={{
            fontFamily: CANVAS_PILL_MONO,
            color: colors.text,
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <span
            className="flex shrink-0 items-center justify-center opacity-80"
            aria-hidden
          >
            {drawerOpen ? (
              <ChevronRight size={16} strokeWidth={2.75} />
            ) : (
              <ChevronLeft size={16} strokeWidth={2.75} />
            )}
          </span>
          <span className="flex flex-col items-end gap-0.5 min-w-[140px]">
            <span
              className="text-[7.5px] font-semibold uppercase tracking-[0.5px] opacity-90"
              style={{ lineHeight: 1, fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
            >
              Rotation health
            </span>
            <span className="flex items-baseline gap-1.5">
              <span
                className="text-[20px] font-bold tabular-nums leading-none"
                style={{ fontFamily: CANVAS_PILL_MONO }}
              >
                {display}
              </span>
              <span
                className="text-[11px] font-semibold tabular-nums opacity-85"
                style={{ fontFamily: CANVAS_PILL_MONO, lineHeight: 1 }}
              >
                {weeklyDisplay} wk
              </span>
            </span>
            <span
              className="text-[7.5px] opacity-80 tabular-nums"
              style={{ lineHeight: 1, fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
            >
              target {ROTATION_HEALTH_TARGET}%
              {health.openGaps > 0 ? ` · ${health.openGaps} gap${health.openGaps === 1 ? "" : "s"}` : ""}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}