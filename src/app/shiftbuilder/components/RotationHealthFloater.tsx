"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  ChevronLeft,
  ChevronRight,
  Eraser,
  Check,
  X,
  Sparkles,
  Wand2,
  Loader2,
} from "lucide-react";
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
import {
  CANVAS_PILL_MONO,
  ROTATION_HEALTH_BOTTOM_PX,
  ROTATION_HEALTH_Z,
  velvetGlassPillStyle,
} from "./canvasPillGlass";
import { SB_DRAWER_TRANSITION } from "./builderPrimitives";
import { RotationHealthOrb } from "./RotationHealthOrb";
import type { TimefoldProgressTick } from "@/lib/shiftbuilder/timefold/timefoldTypes";

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
  /** Unified engine drawer — same home as rotation health orb. */
  canRunEngine?: boolean;
  canEditAssignments?: boolean;
  isCurrentNightLocked?: boolean;
  onRunXaiEngine?: () => void;
  onDeepOptimize?: () => void;
  onClearBoard?: () => void;
  engineRunning?: boolean;
  deepOptimizeRunning?: boolean;
  deepOptimizeTick?: TimefoldProgressTick | null;
  onCancelDeepOptimize?: () => void;
  onApplyDraft?: () => void;
  onDiscardDraft?: () => void;
  /** When DraftStatusPill is visible, skip redundant draft microcopy in the drawer. */
  showDraftStatusPill?: boolean;
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
    `Granular fit: spread, last-5 position, prior-3 critical (50%), week repeat, recency, gap coverage (one decimal).`,
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
    `${counts.strong_fit} strong · ${counts.acceptable} acceptable · ${counts.questionable} check · ${counts.critical_repeat} critical · ${counts.needs_swap} swap · ${counts.poor_fit} poor`,
    "",
    "Click the orb to open engine tools — Run Engine, Optimize Tonight, Clear board.",
  ];
  return lines.join("\n");
}

/** Rotation health orb + unified engine drawer (Run Engine, Optimize Tonight, Clear). */
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
  canRunEngine = false,
  canEditAssignments = false,
  isCurrentNightLocked = false,
  onRunXaiEngine,
  onDeepOptimize,
  onClearBoard,
  engineRunning = false,
  deepOptimizeRunning = false,
  deepOptimizeTick = null,
  onCancelDeepOptimize,
  onApplyDraft,
  onDiscardDraft,
  showDraftStatusPill = false,
}: RotationHealthFloaterProps) {
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

  const running = engineRunning || deepOptimizeRunning;

  React.useEffect(() => {
    if (running || deepOptimizeRunning) setDrawerOpen(true);
  }, [running, deepOptimizeRunning]);

  React.useEffect(() => {
    if (isDraftMode && draftSlotCount > 0 && !showDraftStatusPill) setDrawerOpen(true);
  }, [isDraftMode, draftSlotCount, showDraftStatusPill]);

  React.useEffect(() => {
    if (!drawerOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        if (!deepOptimizeRunning) setDrawerOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [drawerOpen, deepOptimizeRunning]);

  if (!visible) return null;

  const display = formatRotationHealthPercent(dailyPercent);
  const tooltip = breakdownTitle(health, dailyPercent, weekAveragePercent);
  // The shell is velvet glass (matching all app chrome); the health *tier* color
  // is carried entirely by the orb's own gradient shader, not the box — the old
  // tier-colored slab (e.g. burnt-orange at amber) fought the whole aesthetic.
  const glassText = "var(--sb-text-1, #1c1c1e)";
  const glassBorder = "var(--sb-glass-border, rgba(0,0,0,0.1))";

  const engineDisabled =
    !canRunEngine || isCurrentNightLocked || engineRunning || deepOptimizeRunning;
  const optimizeDisabled = engineDisabled || !onDeepOptimize;
  const clearDisabled =
    !canEditAssignments || isCurrentNightLocked || running;
  const draftActionsDisabled =
    !canEditAssignments || isCurrentNightLocked || running;
  const saveDisabled = draftActionsDisabled || draftSlotCount === 0;
  const discardDisabled = draftActionsDisabled || !isDraftMode;

  const actionBtnBase: React.CSSProperties = {
    fontFamily: CANVAS_PILL_MONO,
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.05em",
    border: `1px solid ${glassBorder}`,
    color: glassText,
    background: "rgba(0,0,0,0.045)",
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  let engineLabel = "Run Engine";
  if (engineRunning) engineLabel = "Scoring…";

  const drawerWidth = deepOptimizeRunning ? 300 : isDraftMode ? 320 : 280;

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
    <div
      ref={rootRef}
      className="no-print flex flex-col items-end gap-2"
      style={anchorStyle}
    >
      {deepOptimizeRunning && (
        <div
          className="w-full max-w-[300px] rounded-2xl px-3.5 py-3"
          style={velvetGlassPillStyle({ borderRadius: 16 })}
          role="status"
          aria-live="polite"
          aria-label="Optimize Tonight — running"
        >
          <div className="flex items-center gap-2">
            <Loader2
              size={14}
              className="shrink-0 animate-spin motion-reduce:animate-none"
              style={{ color: "var(--sb-gold-ink)" }}
            />
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-foreground">
              Optimize Tonight
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {deepOptimizeTick?.etaSeconds ?? "…"}s
            </span>
          </div>
          <p className="mt-1 truncate text-[10px] text-muted-foreground">
            {deepOptimizeTick?.headline ?? "Reading tonight's board…"}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--muted)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${deepOptimizeTick?.percent ?? 0}%`,
                background: "linear-gradient(90deg, var(--sb-gold-ink), var(--sb-gold))",
              }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[9px] tabular-nums text-muted-foreground">
            <span>Projected health {deepOptimizeTick ? deepOptimizeTick.bestScore.toFixed(1) : "—"}%</span>
            <span>{deepOptimizeTick?.percent ?? 0}%</span>
          </div>
          {onCancelDeepOptimize && (
            <button
              type="button"
              className="mt-2 w-full rounded-full px-2 py-1 text-[10px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              onClick={onCancelDeepOptimize}
            >
              Cancel — keep board
            </button>
          )}
        </div>
      )}

      <div
        className="flex flex-row items-stretch overflow-hidden rounded-2xl"
        style={{
          background: "var(--sb-glass)",
          border: `1px solid ${glassBorder}`,
          boxShadow:
            "inset 0 1px 0 var(--sb-glass-highlight), 0 8px 28px -10px rgba(0,0,0,0.4)",
          backdropFilter: "var(--sb-glass-blur)",
          WebkitBackdropFilter: "var(--sb-glass-blur)",
        }}
      >
        <div
          aria-hidden={!drawerOpen}
          className="sb-drawer-shell flex flex-col justify-center gap-1.5"
          style={{
            maxWidth: drawerOpen ? drawerWidth : 0,
            opacity: drawerOpen ? 1 : 0,
            paddingLeft: drawerOpen ? 8 : 0,
            paddingRight: drawerOpen ? 6 : 0,
            paddingTop: drawerOpen ? 6 : 0,
            paddingBottom: drawerOpen ? 6 : 0,
            borderRight: drawerOpen ? `1px solid ${glassBorder}` : "none",
            transition: SB_DRAWER_TRANSITION,
            overflow: "hidden",
          }}
        >
          {isDraftMode && !showDraftStatusPill && (
            <p
              className="max-w-[260px] px-0.5 text-[9px] leading-snug opacity-85"
              style={{ fontFamily: CANVAS_PILL_MONO }}
            >
              Draft preview on cards
              {draftSlotCount > 0
                ? ` · ${draftSlotCount} placement${draftSlotCount === 1 ? "" : "s"}`
                : ""}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-1.5">
            {isDraftMode && (
              <>
                <button
                  type="button"
                  onClick={() => onDiscardDraft?.()}
                  disabled={discardDisabled}
                  title="Discard draft"
                  aria-label="Discard draft"
                  className="sb-interactive rounded p-1.5 disabled:opacity-40 shrink-0"
                  style={{
                    ...actionBtnBase,
                    padding: 6,
                    cursor: discardDisabled ? "not-allowed" : "pointer",
                  }}
                >
                  <X size={14} strokeWidth={2.25} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => void onApplyDraft?.()}
                  disabled={saveDisabled}
                  title="Apply draft to live board"
                  aria-label="Apply draft to live board"
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
                  <Check size={14} strokeWidth={2.5} aria-hidden />
                </button>
              </>
            )}

            {onClearBoard && (
              <button
                type="button"
                onClick={onClearBoard}
                disabled={clearDisabled}
                title="Clear all assignments (locked slots kept)"
                aria-label="Clear board"
                className="sb-interactive rounded p-1.5 disabled:opacity-40 shrink-0"
                style={{
                  ...actionBtnBase,
                  padding: 6,
                  cursor: clearDisabled ? "not-allowed" : "pointer",
                }}
              >
                <Eraser size={14} strokeWidth={2.25} aria-hidden />
              </button>
            )}

            {onRunXaiEngine && !isDraftMode && (
              <button
                type="button"
                onClick={onRunXaiEngine}
                disabled={engineDisabled}
                title="Run weighted planner + xAI — preview in Draft Mode"
                className={`sb-interactive flex items-center gap-1 rounded px-2 py-1.5 disabled:opacity-40 shrink-0 ${engineRunning ? "sb-engine-running" : ""}`}
                style={{
                  ...actionBtnBase,
                  textTransform: "uppercase",
                  cursor: engineDisabled ? "not-allowed" : "pointer",
                }}
              >
                <Sparkles size={12} aria-hidden />
                {engineLabel}
              </button>
            )}

            {onRunXaiEngine && isDraftMode && !running && (
              <button
                type="button"
                onClick={onRunXaiEngine}
                disabled={engineDisabled}
                title="Re-run engine (replaces current draft)"
                className="rounded px-2 py-1.5 disabled:opacity-40 shrink-0"
                style={{
                  ...actionBtnBase,
                  cursor: engineDisabled ? "not-allowed" : "pointer",
                }}
              >
                Re-run
              </button>
            )}

            {onDeepOptimize && (
              <button
                type="button"
                onClick={onDeepOptimize}
                disabled={optimizeDisabled}
                title="Optimize tonight's board for rotation — lands in Draft Mode"
                className="sb-interactive flex items-center gap-1 rounded px-2 py-1.5 disabled:opacity-40 shrink-0"
                style={{
                  ...actionBtnBase,
                  background: deepOptimizeRunning
                    ? "rgba(255,204,0,0.22)"
                    : actionBtnBase.background,
                  cursor: optimizeDisabled ? "not-allowed" : "pointer",
                }}
              >
                <Wand2 size={12} aria-hidden />
                {deepOptimizeRunning ? "Optimizing…" : "Optimize"}
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-expanded={drawerOpen}
          aria-label={
            drawerOpen ? "Close engine tools" : "Open engine tools"
          }
          title={tooltip}
          className="flex items-center gap-1.5 p-1 transition-opacity hover:opacity-95"
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
        >
          <span className="flex shrink-0 items-center justify-center opacity-60 px-0.5" aria-hidden>
            {drawerOpen ? (
              <ChevronRight size={14} strokeWidth={2.75} style={{ color: glassText }} />
            ) : (
              <ChevronLeft size={14} strokeWidth={2.75} style={{ color: glassText }} />
            )}
          </span>
          <RotationHealthOrb
            percent={dailyPercent}
            title={tooltip}
            aria-label={`Tonight's rotation fit ${display}. Click for engine tools.`}
          />
        </button>
      </div>
    </div>
  );

  return placement === "above-ops-pill" || placement === "side-right-collapsed"
    ? portalToBody(shell)
    : shell;
}