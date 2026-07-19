"use client";

import React from "react";
import { ChevronLeft, ChevronRight, Eraser, Check, X } from "lucide-react";
import {
  computeShiftRotationHealth,
  computeWeekAverageHealth,
  GRAVE_WEEK_LABEL,
  ROTATION_HEALTH_TARGET,
  rotationHealthTextColor,
  rotationHealthIconColor,
  formatRotationHealthPercent,
  normalizeRotationHealthPercent,
  type WeekRepeatViolation,
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
  runMode?: "fill-open" | "rebuild-day";
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
  /** Per-day daily health % (built days only) — tracker + cluster read the same map. */
  weekDailyHealths?: Record<string, number>;
  /** ISO date (YYYY-MM-DD) for the selected grave night — aligns cluster daily with tracker pill. */
  selectedDayDateKey?: string;
  /** Fri→Thu ISO keys in order — week average uses only built days in this window. */
  graveWeekDateKeys?: string[];
  /** When true, daily/week numbers show "—" until week histories finish loading. */
  weekHealthLoading?: boolean;
  /** If provided (and tracker was dismissed), shows a small "Show week tracker" affordance. */
  onShowWeekHealthTracker?: () => void;
  onRunXaiEngine: () => void;
  onClearBoard: () => void;
  onApplyDraft?: () => void;
  onDiscardDraft?: () => void;
  /** When provided (and violations exist), shows an "Advisor" affordance next to / in the health pill drawer.
   *  This is the primary surface for "rotation health + xAI breakdown of what to move where + why".
   */
  onRequestRotationAdvisor?: () => void | Promise<void>;
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
  weekDailyHealths,
  selectedDayDateKey,
  graveWeekDateKeys,
  weekHealthLoading,
  onShowWeekHealthTracker,
  onRunXaiEngine,
  onClearBoard,
  onApplyDraft,
  onDiscardDraft,
  onRequestRotationAdvisor,
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
        weekDailyHealths,
      }),
    [auxDefs, assignments, fitBySlot, isDraftMode, draftAssignments, weeklyRecentHistory, weekDailyHealths],
  );

  // Big number = this selected day's health (matches the tracker's pill for that day).
  const trackerDaily =
    selectedDayDateKey && weekDailyHealths
      ? weekDailyHealths[selectedDayDateKey]
      : undefined;
  // Single source: weekDailyHealths (selected day = live fit; other days = week histories path).
  const dailyPercent = trackerDaily ?? null;

  // Small number = Fri–Thu grave week average (mean of built days' daily health %).
  const weekAveragePercent = weekHealthLoading
    ? null
    : computeWeekAverageHealth(weekDailyHealths, graveWeekDateKeys);
  const weekAverageDisplay = formatRotationHealthPercent(weekAveragePercent);

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

  const normalizedDaily = normalizeRotationHealthPercent(dailyPercent);
  const display = formatRotationHealthPercent(normalizedDaily);
  // On-glass palette: the shell is velvet glass (matching the draft pill + all app
  // chrome), so text is dark foreground and the health *tier* is carried as an
  // accent — the big number's ink + a small status dot — not the whole background.
  const healthInk = rotationHealthTextColor(normalizedDaily);
  const healthDot = rotationHealthIconColor(normalizedDaily) ?? "#9ca3af";
  const glassText = "var(--sb-text-1, #1c1c1e)";
  const glassBorder = "var(--sb-glass-border, rgba(0,0,0,0.1))";

  const weekPolicyPercent = health.weekPolicyPercent ?? health.weeklyBalance;
  const weekPolicyDisplay = formatRotationHealthPercent(weekPolicyPercent);

  const breakdownTitle = [
    `Rotation health % = placed TMs only (open gaps do not reduce it).`,
    `Big = tonight fit (spread + last-5 trail + week repeat per area). Small = ${GRAVE_WEEK_LABEL} fit avg + repeat policy.`,
    `Target (tonight fit): ${ROTATION_HEALTH_TARGET}%`,
    normalizedDaily !== null
      ? `Tonight fit: ${formatRotationHealthPercent(normalizedDaily)}`
      : "Tonight fit: —",
    weekAveragePercent !== null
      ? `Week fit avg (${GRAVE_WEEK_LABEL} built days): ${formatRotationHealthPercent(weekAveragePercent)}`
      : `Week fit avg (${GRAVE_WEEK_LABEL}): —`,
    weekPolicyPercent !== undefined
      ? `Week repeat policy: ${formatRotationHealthPercent(weekPolicyPercent)} (max repeat ${(health as any).maxWeeklyRepeat ?? 0}; violations ${(health as any).repeatViolations ?? 0})`
      : "",
    (health as any).maxWeeklyRepeat !== undefined ? `Max repeat this week: ${(health as any).maxWeeklyRepeat} (violations: ${(health as any).repeatViolations ?? 0})` : "",
    `${health.scoredCount} placed scored · ${health.openGaps} open gap${health.openGaps === 1 ? "" : "s"} (info only)`,
    `${health.counts.strong_fit} strong · ${health.counts.acceptable} acceptable · ${health.counts.questionable} check`,
    "Signals: spread in area, last-5 trail (blocks strong), this-week repeats, bilateral gaps, xAI adj on violators.",
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
    border: `1px solid ${glassBorder}`,
    color: glassText,
    background: "rgba(0,0,0,0.045)",
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
                background: "var(--sb-gold-surface, rgba(255, 204, 0, 0.24))",
                border: "1px solid var(--sb-gold-border, rgba(255, 204, 0, 0.44))",
                color: "var(--sb-gold-ink, #d4a800)",
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
            borderRight: drawerOpen ? `1px solid ${glassBorder}` : "none",
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
          {/* Rotation advisor — available whenever week data is being built (the WEEK BUILDER sheet or when weeklyRecentHistory is populated).
              We no longer gate strictly on filtered repeatViolations > 0, because we deliberately exclude overlaps/admin from the week rotation policy and viol count.
              The advisor itself will focus only on relevant deployment slots (Z/RR/proper aux) and report if there are no current relevant repeats.
              This + the "xAI week scan" in the WEEK BUILDER toolbar are the entry points for the "what to move where + why to raise the health %" breakdown. */}
          {onRequestRotationAdvisor && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void onRequestRotationAdvisor();
              }}
              title="Rotation advisor: xAI + local suggestions for concrete moves (only on main deployment slots) that would reduce relevant repeats and raise weeklyBalance / overall health %"
              className="sb-interactive rounded px-2 py-1 text-[9px] font-semibold disabled:opacity-40 shrink-0"
              style={{
                ...actionBtnBase,
                fontSize: 9,
                padding: "2px 6px",
                background: "rgba(147,51,234,0.14)",
                border: "1px solid rgba(147,51,234,0.35)",
                color: "#7c3aed",
                cursor: "pointer",
              }}
            >
              ADVISOR
            </button>
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
            color: glassText,
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
              className="flex items-center gap-1 text-[7.5px] font-semibold uppercase tracking-[0.5px] opacity-90"
              style={{ lineHeight: 1, fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
            >
              <span
                aria-hidden
                className="inline-block size-1.5 shrink-0 rounded-full"
                style={{ background: healthDot, boxShadow: `0 0 5px ${healthDot}` }}
              />
              Rotation health
            </span>
            {onShowWeekHealthTracker && (
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onShowWeekHealthTracker();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    onShowWeekHealthTracker();
                  }
                }}
                className="ml-2 text-[8px] uppercase tracking-[0.5px] opacity-70 hover:opacity-100 active:opacity-90 underline cursor-pointer"
                title="Show the live per-day week health tracker"
              >
                tracker
              </span>
            )}
            <span className="flex items-baseline gap-1.5">
              <span
                className="text-[20px] font-bold tabular-nums leading-none"
                style={{ fontFamily: CANVAS_PILL_MONO, color: healthInk }}
                title="Tonight fit — granular spread/swap quality for this night"
              >
                {display}
              </span>
              <span
                className="text-[7px] font-semibold uppercase tracking-[0.04em] opacity-75"
                style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))", lineHeight: 1 }}
              >
                tonight
              </span>
              {/* Coverage counter — the % scores placed TMs only, so a green number on a
                  half-empty board is a lie of omission. Gaps get their own visible count. */}
              {health.openGaps > 0 && (
                <span
                  className="rounded px-1 py-px text-[8px] font-bold tabular-nums uppercase tracking-[0.04em]"
                  style={{
                    fontFamily: CANVAS_PILL_MONO,
                    lineHeight: 1.2,
                    background: "rgba(255,59,48,0.22)",
                    border: "1px solid rgba(255,59,48,0.4)",
                  }}
                  title={`${health.openGaps} required slot${health.openGaps === 1 ? "" : "s"} unfilled — the fit % scores placed TMs only and does not include these`}
                >
                  {health.openGaps} open
                </span>
              )}
            </span>
            <span
              className="flex items-baseline gap-2 text-[10px] font-semibold tabular-nums opacity-90"
              style={{ fontFamily: CANVAS_PILL_MONO, lineHeight: 1.1 }}
            >
              <span title={`${GRAVE_WEEK_LABEL} mean nightly fit across built days`}>
                {weekAverageDisplay} fit
              </span>
              <span
                className="opacity-70"
                title="Week repeat policy — max-1-per-area penalty (independent of tonight fit)"
              >
                ·
              </span>
              <span title="Week repeat policy score (lower when same TM repeats area 2×+ this grave week)">
                {weekPolicyDisplay} policy
              </span>
            </span>
            <span
              className="text-[7.5px] opacity-80 tabular-nums"
              style={{ lineHeight: 1, fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
            >
              tonight fit · {GRAVE_WEEK_LABEL} fit avg · repeat policy · target {ROTATION_HEALTH_TARGET}%
              {health.openGaps > 0 ? ` · ${health.openGaps} gap${health.openGaps === 1 ? "" : "s"}` : ""}
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
