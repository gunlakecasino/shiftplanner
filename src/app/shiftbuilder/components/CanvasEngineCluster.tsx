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
  canRunEngine: boolean;
  canEditAssignments: boolean;
  isCurrentNightLocked: boolean;
  engineRunPhase: EngineRunPhase;
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
  canRunEngine,
  canEditAssignments,
  isCurrentNightLocked,
  engineRunPhase,
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
      }),
    [auxDefs, assignments, fitBySlot, isDraftMode, draftAssignments],
  );

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
    "Rotation health averages assigned zone / RR / aux placements (open gaps excluded).",
    `Target: ${ROTATION_HEALTH_TARGET}%`,
    health.percent !== null ? `Score: ${health.percent}%` : "Score: —",
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
        </div>
      )}

      <div
        className="flex flex-row items-stretch overflow-hidden rounded shadow-lg"
        style={{
          background: colors.bg,
          border: `1px solid ${colors.border}`,
          boxShadow: "0 2px 10px rgba(0,0,0,0.45)",
        }}
      >
        {/* Side drawer — actions slide out to the left */}
        <div
          aria-hidden={!drawerOpen}
          className="flex items-center overflow-hidden transition-[max-width,opacity,padding] duration-300 ease-out"
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
                className="rounded p-1.5 transition-opacity disabled:opacity-40 shrink-0"
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
                onClick={() => onApplyDraft?.()}
                disabled={saveDisabled}
                title={
                  saveDisabled
                    ? "No draft placements to save"
                    : "Save all draft placements to the board"
                }
                aria-label="Save all draft placements"
                className="rounded p-1.5 transition-opacity disabled:opacity-40 shrink-0"
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
            className="rounded p-1.5 transition-opacity disabled:opacity-40 shrink-0"
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
              className="rounded px-2 py-1.5 transition-opacity disabled:opacity-40 shrink-0"
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
          className="flex items-center gap-1 px-2 py-1 text-left transition-opacity hover:opacity-95"
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
              <ChevronRight size={14} strokeWidth={2.5} />
            ) : (
              <ChevronLeft size={14} strokeWidth={2.5} />
            )}
          </span>
          <span className="flex flex-col items-end gap-0.5 min-w-[72px]">
            <span
              className="text-[7px] font-semibold uppercase tracking-[0.14em] opacity-90"
              style={{ lineHeight: 1 }}
            >
              Rotation health
            </span>
            <span className="text-[13px] font-bold tabular-nums leading-none">
              {display}
            </span>
            <span
              className="text-[7px] opacity-80 tabular-nums"
              style={{ lineHeight: 1 }}
            >
              target {ROTATION_HEALTH_TARGET}%
              {health.openGaps > 0
                ? ` · ${health.openGaps} gap${health.openGaps === 1 ? "" : "s"}`
                : ""}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}