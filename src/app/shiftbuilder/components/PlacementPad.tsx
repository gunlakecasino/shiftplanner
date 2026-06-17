"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import type { NightSlotTask, ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import { premiumSpring, premiumPresence, premiumPresenceReduced, premiumButton, premiumTap } from "@/lib/premiumSpring";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { normalizeGender, isEligibleForSlot } from "@/lib/shiftbuilder/placement";
import type { PlacementPadInsight } from "@/lib/shiftbuilder/placementPadInsightSchema";
import {
  fitVerdictLabel,
  fitVerdictStyles,
} from "@/lib/shiftbuilder/placementPadInsightSchema";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import { computeSlotPlacementFit } from "./placementFitForSlot";
import { getTmThisWeekRepeatForSlot } from "./shiftRotationHealth";
import type { PlacementInsightMode } from "@/lib/shiftbuilder/engineInsightForPlacement";
import {
  ZONE_DEFS,
  RR_DEFS,
  getZoneColor,
  getRRAccent,
  getAuxAccent,
  type BreakGroup,
} from "@/lib/shiftbuilder/constants";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { getTmPlacementHistory } from "@/lib/shiftbuilder/data";
import { getSlotMeta, TmPicker, type TmEntry } from "./MarkerPad";
import { useShiftBuilderStore } from "../store/useShiftBuilderStore";
import { isTabletTouchDevice } from "@/lib/shiftbuilder/tabletDevice";
import { tabletHaptic } from "@/lib/shiftbuilder/tabletHaptic";
import {
  PLACEMENT_SPREAD_NIGHTS,
  getSpreadPlacementKeys,
  getSpreadPlacementCounts,
  spreadFrequencyAccent,
  getLastPlacementSequence,
  getDaysSinceForKey,
  formatPlacementUiLabel,
  nightIsoFromDate,
  computePlacementRotationBasics,
  formatPlacementRotationDisplay,
  formatRotationBriefForAnalyst,
  type PlacementRotationBasics,
  type PlacementRotationDisplay,
  type PlacementTmProfile,
} from "./placementPadHelpers";
import { postEngineInsight } from "../lib/engineInsightClient";
import { BuilderBusyLabel, BuilderLoadingLine } from "./builderPrimitives";

const Z9_STAT_RED = "#E53935";
const LAST5_COUNT = 5;

export type PlacementPadAnchor = "left" | "right" | "bottom";
export type PlacementPadPresentation = "flyout" | "dock";
export type PlacementDockTab = "assign" | "tasks" | "intel";

export interface PlacementPadProps {
  slotKey: string;
  anchor: PlacementPadAnchor;
  /** Tablet inspector — rendered inside PlacementDock (no bottom sheet / backdrop). */
  presentation?: PlacementPadPresentation;
  dockTab?: PlacementDockTab;
  onDockTabChange?: (tab: PlacementDockTab) => void;
  /** Host card wrapper — portaled pad positions from [data-placement-host] rect. */
  hostId?: string;
  onClose: () => void;
  assignments: Record<string, any>; // mirrors loose store typing (documented during production review; high-churn assignment shape from zustand/liveCache — same as Board/store)
  selectedTasks: Record<string, NightSlotTask[]>;
  selectedDay: DayDef;
  members?: any[]; // roster rows — loose to match effectiveRealRoster etc across board/pad (pragmatic for monolith churn)
  auxDefs: AuxDef[];
  isDark: boolean;
  isCurrentNightLocked?: boolean;
  setBreakGroupForSlot?: (k: string, g: BreakGroup) => void;
  onAddCoverage?: (sourceSlotKey: string, targetSlotKey: string) => void | Promise<void>;
  onLiveUnassign?: (slotKey: string) => void;
  onToggleLock?: (slotKey: string) => void;
  onAssign?: (slotKey: string, tmId: string, tmName: string) => void;
  onAddTask?: (slotKey: string, label: string) => void | Promise<void>;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  /** Remove all non-coverage tasks on this slot. */
  onClearSlotTasks?: (slotKey: string) => void | Promise<void>;
  /** Copy regular tasks from the paired M/W restroom side (MRRn ↔ WRRn). */
  onCopyRestroomPairingTasks?: (slotKey: string) => void | Promise<void>;
  onAssignSweeper?: (slotKey: string, sweeperLabel: string) => void | Promise<void>;
  onRequestEngineInsight?: (slotKey: string, context?: string | Record<string, unknown>) => Promise<string>;
  scheduledUnassigned?: TmEntry[];
  allEligibleTms?: TmEntry[];
  onAddOnCall?: (tmId: string, tmName: string) => void | Promise<void>;
  onMarkUnavailable?: (tmId: string, tmName: string, status: string) => void | Promise<void>;
  /** Board-computed instant fit (same object as card chip). */
  boardPrerenderedFit?: PrerenderedPlacementFit;
  isDraftMode?: boolean;
  draftAssignments?: Record<
    string,
    {
      proposedTmId?: string;
      proposedTmName?: string;
      proposedClear?: boolean;
    }
  >;
  /** Recent 7-night (this-week) history map for detecting same-area repeats for the viewed TM. */
  weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;
  /** When false, skip xAI calls and hide analyst/matrix surfaces (e.g. /today quick board). */
  insightsEnabled?: boolean;
  /** When true, TM picker rows can be dragged onto slots (parent must provide DndContext). */
  enableTmDragAssign?: boolean;
}

const PAD_W = 340;
/** Max pad height — fits iPad landscape with internal scroll for overflow.
    Quick view (one-liner + expander + always matrix) is intentionally compact so the marker card
    can size to content (no internal scroll) unless truly necessary (TmPicker/deep/long tasks). */
const PAD_MAX_HEIGHT = 640;
const TABLET_SHEET_HEIGHT_RATIO = 0.42;
const TABLET_SHEET_MAX_HEIGHT = 460;

function computeTabletBottomSheetStyle(pickerOpen = false): React.CSSProperties {
  const vv = window.visualViewport;
  const h = vv?.height ?? window.innerHeight;
  const maxH = pickerOpen
    ? Math.min(Math.round(h * 0.58), 560)
    : Math.min(Math.round(h * TABLET_SHEET_HEIGHT_RATIO), TABLET_SHEET_MAX_HEIGHT);
  return {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    zIndex: 2147483635,
    maxHeight: maxH,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };
}

function anchorClass(anchor: PlacementPadAnchor): string {
  if (anchor === "left") return "placement-pad absolute top-0 right-full mr-1.5";
  if (anchor === "bottom") return "placement-pad absolute bottom-0 left-full ml-1.5";
  return "placement-pad absolute top-0 left-full ml-1.5";
}

function computePortalStyle(
  hostId: string,
  anchor: PlacementPadAnchor,
): React.CSSProperties | null {
  const host = document.querySelector(
    `[data-placement-host="${hostId}"]`,
  ) as HTMLElement | null;
  if (!host) return null;

  const rect = host.getBoundingClientRect();
  const gap = 6;
  const padW = PAD_W;
  const maxH = Math.min(window.innerHeight - 24, PAD_MAX_HEIGHT);

  let left = rect.right + gap;
  let top = rect.top;

  if (anchor === "left") {
    left = rect.left - padW - gap;
    top = rect.top;
  } else if (anchor === "bottom") {
    left = rect.right + gap;
    // Pin bottom edge to host — avoid translateY(-100%) which jumps when content height changes
    top = Math.max(8, rect.bottom - maxH);
  }

  if (left + padW > window.innerWidth - 8) {
    left = rect.left - padW - gap;
  }
  if (left < 8) left = 8;

  const base: React.CSSProperties = {
    position: "fixed",
    left,
    width: padW,
    zIndex: 200,
    maxHeight: maxH,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };

  if (anchor !== "bottom") {
    let clampedTop = top;
    if (clampedTop + maxH > window.innerHeight - 8) {
      clampedTop = Math.max(8, window.innerHeight - maxH - 8);
    }
    return { ...base, top: clampedTop };
  }

  return { ...base, top };
}

export function usePortalPlacementStyle(
  hostId: string | undefined,
  anchor: PlacementPadAnchor,
  tabletPickerOpen = false,
): React.CSSProperties | null {
  const [style, setStyle] = useState<React.CSSProperties | null>(null);
  const rafRef = useRef<number | null>(null);

  const tabletSheet = isTabletTouchDevice();

  const update = useCallback(() => {
    if (!hostId) {
      setStyle(null);
      return;
    }
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setStyle(
        tabletSheet
          ? computeTabletBottomSheetStyle(tabletPickerOpen)
          : computePortalStyle(hostId, anchor),
      );
    });
  }, [hostId, anchor, tabletSheet, tabletPickerOpen]);

  useLayoutEffect(() => {
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const vv = window.visualViewport;
    if (vv) vv.addEventListener("resize", update);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      if (vv) vv.removeEventListener("resize", update);
    };
  }, [update]);

  return style;
}

function SectionLabel({ children, large = false }: { children: React.ReactNode; large?: boolean }) {
  return (
    <span
      className={`font-semibold uppercase tracking-[0.12em] text-neutral-400 ${
        large ? "text-[15px]" : "text-[9px]"
      }`}
    >
      {children}
    </span>
  );
}

function PlacementAnalystBlock({
  compactTablet = false,
  prerendered,
  loading,
  detailsOpen,
  text,
  structured,
  cached,
  assigned,
  onMoreDetails,
  onTrain,
  onClearDetails,
  matrixExpanded,
  onToggleMatrix,
  evidenceOpen,
  setEvidenceOpen,
  padGoodExamples,
  rotationGapsLine,
  slotSpreadCount,
  slotKey: analystSlotKey,
  onClearTraining,
}: {
  prerendered: PrerenderedPlacementFit;
  loading: boolean;
  detailsOpen: boolean;
  text: string | null;
  structured?: PlacementPadInsight | null;
  cached?: boolean;
  assigned: boolean;
  onMoreDetails: () => void;
  onTrain?: () => void;
  onClearDetails: () => void;
  matrixExpanded?: boolean;
  onToggleMatrix?: () => void;
  evidenceOpen?: boolean;
  setEvidenceOpen?: (v: boolean) => void;
  padGoodExamples?: Array<{ slotKey: string; insightText: string }>;
  rotationGapsLine?: string | null;
  slotSpreadCount?: number;
  slotKey?: string;
  onClearTraining?: () => void;
  compactTablet?: boolean;
}) {
  const headerStyles = fitVerdictStyles(prerendered.fitVerdict);
  const showXaiBody = detailsOpen && (loading || text || structured);
  const xaiOverridesInstant =
    !!structured &&
    structured.fitVerdict != null &&
    structured.fitSummary != null &&
    (structured.fitVerdict !== prerendered.fitVerdict ||
      structured.fitSummary.trim() !== prerendered.fitSummary.trim());
  const xaiHeaderStyles = structured?.fitVerdict
    ? fitVerdictStyles(structured.fitVerdict)
    : headerStyles;

  // When a light xAI determination (headline + bullets) has populated in the quick view,
  // we show *only* the XAI Determination section. Hide the engine baseline header and the old "tap for..." text.
  const hasQuickXai = !detailsOpen && !!structured?.headline;

  return (
    <div className="mx-3 mb-2 rounded-xl border border-black/[0.06] bg-neutral-50/90 overflow-hidden">
      {!hasQuickXai && (
      <div
        className="px-2.5 py-2 border-b"
        style={{
          borderColor: headerStyles.border,
          background: headerStyles.bg,
        }}
      >
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide ${headerStyles.badge}`}
          >
            {fitVerdictLabel(prerendered.fitVerdict)}
          </span>
          <span className="text-[7px] font-medium uppercase tracking-wide text-neutral-400">
            engine baseline
          </span>
        </div>
        <p
          className="text-[11px] font-semibold leading-snug"
          style={{ color: headerStyles.text }}
        >
          {prerendered.fitSummary}
        </p>
        {prerendered.fitFactLine ? (
          <p className="mt-0.5 text-[9px] leading-snug text-neutral-500 tabular-nums">
            {prerendered.fitFactLine}
          </p>
        ) : null}
      </div>
      )}

      <div className="px-2.5 py-2">
        {/* Quick view: just the bold one-liner + small expander under it for provenance/signals/priors,
            then the Matrix panel always visible underneath (compact, embedded). No bullets here — they live in deep "Full reasoning".
            The marker card height will adapt (see outer body/pad style changes) so this + tasks + actions rarely forces scroll. */}
        {!detailsOpen && structured?.headline && (
          <div 
            className={`mb-0.5 rounded-2xl border border-[#2F5C7C]/15 bg-white/97 px-3 py-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.1),_inset_0_1px_0_rgba(255,255,255,0.9),_inset_0_-1px_0_rgba(0,0,0,0.02)]${compactTablet ? " sb-pad-xai-compact text-[13px]" : " text-[11px]"} hover:scale-[1.005] hover:-translate-y-px transition-all duration-150`}
            style={{ borderLeft: '5px solid #2F5C7C55', backdropFilter: 'blur(16px) saturate(160%)' }}
          >
            <div className="flex items-baseline gap-1 mb-1">
              <span style={{ fontSize: "10px", color: '#2F5C7C' }}>✧</span>
              <span
                className="font-semibold tracking-[0.4px] uppercase text-[#2F5C7C]/90"
                style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))", fontSize: compactTablet ? "11px" : "9px" }}
              >
                XAI FAST (BOARD + WEEK SIGNALS)
              </span>
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- bullets present in deep xAI structured response but not on base PlacementPadInsight type (headline/light path differs); mirrors loose insight typing documented in review */}
              {(structured as any)?.bullets && (structured as any).bullets.length > 0 && (
                <span 
                  className="ml-auto text-[5.5px] font-medium tracking-[0.4px] px-1 py-px text-[#2F5C7C]/60"
                  style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
                >
                  synthesized
                </span>
              )}
            </div>

            {/* The bold one-liner headline */}
            <p
              className={`font-semibold text-neutral-950 tracking-[-0.2px] leading-snug ${
                compactTablet ? "mb-1 text-[16px]" : "mb-1 text-[13px]"
              }`}
              style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
            >
              {structured.headline}
            </p>

            {/* Week repeat signal is carried in the xAI context (see tmThisWeekRepeat + boardAndWeekContext below) so the fast one-liner and provenance text will call it out when relevant. Static visual badge can be added once scope is threaded to all sub renders. */}

            {/* Expander under the one-liner for the provenance surface (spread/gaps/training signals + priors) */}
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- bullets present in deep xAI structured response but not on base PlacementPadInsight type (headline/light path differs); mirrors loose insight typing documented in review */}
            {!compactTablet && (structured as any)?.bullets && (structured as any).bullets.length > 0 && (
              <div className="mt-0.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEvidenceOpen?.(!evidenceOpen);
                  }}
                  className="sb-interactive w-full flex items-center justify-between text-[7.5px] font-medium tracking-[0.15px] text-[#2F5C7C]/80 hover:text-[#2F5C7C] px-0.5 mb-0.5"
                  style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
                >
                  <span>✧ Provenance surface (spread • gaps • training)</span>
                  <span>{evidenceOpen ? '−' : '+'}</span>
                </button>

                {evidenceOpen && (
                  <div className="rounded-xl border border-[#2F5C7C]/10 bg-white/60 px-2 py-1 text-[9px] leading-[1.3] text-neutral-700 space-y-px mb-2">
                    {slotSpreadCount !== undefined && analystSlotKey && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-[#2F5C7C]/55 text-[8px] tracking-[0.1px]">SPREAD</span>
                        <span className="font-medium">{analystSlotKey}: {slotSpreadCount}× last 30 (very fresh)</span>
                      </div>
                    )}
                    {rotationGapsLine && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-[#2F5C7C]/55 text-[8px] tracking-[0.1px]">GAPS</span>
                        <span className="font-medium truncate max-w-[170px]">{rotationGapsLine.slice(0, 42)}{rotationGapsLine.length > 42 ? '…' : ''} (balance oppty)</span>
                      </div>
                    )}
                    {(padGoodExamples?.length ?? 0) > 0 && (
                      <div className="flex justify-between items-baseline">
                        <span className="text-[#2F5C7C]/55 text-[8px] tracking-[0.1px]">TRAINING</span>
                        <span className="font-medium">{padGoodExamples!.length} Gold examples (your history)</span>
                      </div>
                    )}
                    {/* WEEK REPEAT line is included via xAI-synthesized provenance when the context carries the tmThisWeekRepeat signal. */}
                  </div>
                )}

                {evidenceOpen && (padGoodExamples?.length ?? 0) > 0 && (
                  <div className="text-[7.5px] text-neutral-600 mb-2">
                    Prior Gold examples:
                    {padGoodExamples!.slice(-2).map((ex, i) => (
                      <div key={i} className="pl-1 truncate">• “{ex.insightText.slice(0, 55)}{ex.insightText.length > 55 ? '…”' : '”'}</div>
                    ))}
                    {onClearTraining && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClearTraining();
                        }}
                        className="ml-1 text-[7px] text-[#2F5C7C]/60 hover:text-[#2F5C7C] underline"
                        style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
                      >
                        clear
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        <div className="flex flex-wrap items-center gap-1 -mt-0.5 mb-0.5">
          {!detailsOpen ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoreDetails();
              }}
              disabled={loading}
              className={`sb-interactive rounded-full border border-[#2F5C7C]/25 bg-[#F8FAFC] px-2 py-px font-medium tracking-[0.1px] text-[#2F5C7C] hover:bg-white hover:border-[#2F5C7C]/40 disabled:opacity-60${compactTablet ? " text-[10px]" : " text-[8px]"}`}
              style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
            >
              {loading ? (
                <BuilderBusyLabel className="text-[7px]">Loading insight</BuilderBusyLabel>
              ) : (
                /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- bullets access on insight (see other notes in file) */
                (structured as any)?.bullets?.length ? "Full reasoning" : structured?.headline ? "Full reasoning" : "✧  xAI insight"
              )}
            </button>
          ) : (
            <>
              <SectionLabel>xAI details</SectionLabel>
              {cached && (
                <span className="text-[7px] font-medium uppercase tracking-wide text-neutral-400">
                  cached
                </span>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoreDetails();
                }}
                disabled={loading}
                className="sb-interactive rounded-full border border-[#2F5C7C]/20 bg-white px-2 py-0.5 text-[9px] font-medium tracking-[0.1px] text-[#2F5C7C]/90 hover:bg-[#F8FAFC] hover:border-[#2F5C7C]/35 disabled:opacity-60"
                style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
              >
                {loading ? "Analyzing…" : "Refresh insight"}
              </button>
            </>
          )}
        </div>

        {!detailsOpen && !hasQuickXai && (
          <p className="mt-1 text-[9px] text-neutral-400 leading-snug">
            {assigned
              ? "Rotation-based verdict above. Tap for narrative, neighbors, and swap analysis."
              : "Eligibility check above. Tap for ranked assignee picks."}
          </p>
        )}

        {showXaiBody && structured && xaiOverridesInstant ? (
          <div
            className="mt-2 mb-1.5 rounded-lg border px-2 py-1.5"
            style={{
              borderColor: xaiHeaderStyles.border,
              background: xaiHeaderStyles.bg,
            }}
          >
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              <span
                className={`rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide ${xaiHeaderStyles.badge}`}
              >
                {fitVerdictLabel(structured.fitVerdict ?? prerendered.fitVerdict)}
              </span>
              <span className="text-[7px] font-medium uppercase tracking-wide text-neutral-400">
                xAI updated
              </span>
            </div>
            <p
              className="text-[11px] font-semibold leading-snug"
              style={{ color: xaiHeaderStyles.text }}
            >
              {structured.fitSummary}
            </p>
            {structured.verdictOverrideReason ? (
              <p className="mt-0.5 text-[9px] text-neutral-500 leading-snug">
                {structured.verdictOverrideReason}
              </p>
            ) : null}
          </div>
        ) : null}

        {showXaiBody && structured ? (
          <div className="mt-1.5 space-y-1.5 text-[10px] leading-snug text-neutral-700">
            {/* Deep view provenance surface — consistent with quick view and wonderful matrix. */}
            {(padGoodExamples?.length ?? 0) > 0 || rotationGapsLine || slotSpreadCount !== undefined ? (
              <div className="mb-1 p-1.5 rounded-lg border border-[#2F5C7C]/10 bg-white/60 text-[9px] leading-snug">
                <div className="font-medium tracking-[0.15px] text-[#2F5C7C]/75 mb-0.5 text-[8px]">✧ Provenance surface</div>
                {slotSpreadCount !== undefined && analystSlotKey && (
                  <div className="flex justify-between"><span className="text-[#2F5C7C]/50 text-[7.5px]">SPREAD</span><span className="font-medium">{analystSlotKey}: {slotSpreadCount}× (very fresh)</span></div>
                )}
                {rotationGapsLine && (
                  <div className="flex justify-between"><span className="text-[#2F5C7C]/50 text-[7.5px]">GAPS</span><span className="font-medium truncate max-w-[160px]">{rotationGapsLine.slice(0, 40)}{rotationGapsLine.length > 40 ? '…' : ''} (balance)</span></div>
                )}
                {(padGoodExamples?.length ?? 0) > 0 && (
                  <div className="flex justify-between"><span className="text-[#2F5C7C]/50 text-[7.5px]">TRAINING</span><span className="font-medium">{padGoodExamples!.length} Golds (your history)</span></div>
                )}
              </div>
            ) : null}

            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.2px] text-[#2F5C7C]/70">Tonight</p>
              <p 
                className="mt-0.5 font-medium text-neutral-900 tracking-[-0.1px]" 
                style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
              >
                <span className="opacity-50 mr-1" style={{ fontSize: "8px" }}>✧</span>
                {structured.headline}
              </p>
              {structured.whyTonight ? (
                <p className="mt-0.5 text-[10px] text-neutral-700">{structured.whyTonight}</p>
              ) : null}
            </div>
            {structured.rotationNote && (
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.2px] text-[#2F5C7C]/70">Rotation</p>
                <p className="mt-0.5 text-neutral-600">{structured.rotationNote}</p>
              </div>
            )}
            {structured.neighborDynamics && (
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.2px] text-[#2F5C7C]/70">Neighbors</p>
                <p className="mt-0.5 text-neutral-600">{structured.neighborDynamics}</p>
              </div>
            )}
            {(structured.swapRecommendations?.length ?? 0) > 0 && (
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.2px] text-[#2F5C7C]/70">Swap lanes</p>
                <ul className="mt-0.5 space-y-0.5">
                  {(structured.swapRecommendations ?? []).map((s, i) => (
                    <li key={i} className="text-neutral-600">
                      {s.priority === "high" ? "★ " : s.priority === "medium" ? "· " : "○ "}
                      {s.summary}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(structured.watchouts?.length ?? 0) > 0 && (
              <div>
                <p className="text-[7.5px] font-semibold uppercase tracking-[0.2px] text-amber-700/80">Watchouts</p>
                <ul className="mt-0.5 list-disc pl-2 text-neutral-600">
                  {(structured.watchouts ?? []).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {structured.rankedAssignees && structured.rankedAssignees.length > 0 && (
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.2px] text-[#2F5C7C]/70">Best picks</p>
                <ol className="mt-0.5 space-y-0.5 pl-2 list-decimal text-neutral-600">
                  {[...structured.rankedAssignees]
                    .sort((a, b) => a.rank - b.rank)
                    .map((r) => (
                      <li key={`${r.rank}-${r.tmName}`}>
                        <span className="font-medium text-neutral-800">{r.tmName}</span>
                        {" — "}
                        {r.fitSummary}
                        {r.caveats ? (
                          <span className="text-neutral-400"> ({r.caveats})</span>
                        ) : null}
                      </li>
                    ))}
                </ol>
              </div>
            )}
          </div>
        ) : showXaiBody && loading ? (
          <BuilderLoadingLine>Building detailed analyst notes</BuilderLoadingLine>
        ) : showXaiBody && text ? (
          <p className="mt-1.5 text-[9px] leading-snug text-neutral-600 whitespace-pre-wrap">
            {text}
          </p>
        ) : null}

        {detailsOpen && text && (
          <div className="mt-2 flex items-center gap-1.5">
            {onTrain && (
              <button
                type="button"
                title="Save as gold example for future insights"
                onClick={(e) => {
                  e.stopPropagation();
                  onTrain();
                }}
                className="rounded border border-black/[0.06] bg-white px-1.5 py-0.5 text-[10px]"
              >
                👍 Gold
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearDetails();
              }}
              className="rounded border border-black/[0.06] bg-white px-1.5 py-0.5 text-[10px]"
            >
              Hide details
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PlacementCell({
  label,
  spreadCount,
  title,
}: {
  label: string;
  /** Times placed in last-30 spread (0 = not in spread). */
  spreadCount: number;
  title?: string;
}) {
  const placed = spreadCount > 0;
  const pillAccent = spreadFrequencyAccent(spreadCount);

  return (
    <motion.div
      title={title ?? label}
      className="flex h-[26px] items-center justify-center rounded-md text-[10px] font-bold tabular-nums transition-colors"
      style={
        placed && pillAccent
          ? {
              background: `${pillAccent}22`,
              border: `1px solid ${pillAccent}55`,
              color: pillAccent,
            }
          : {
              background: "rgba(115,115,115,0.14)",
              border: "1px dashed rgba(115,115,115,0.38)",
              color: "rgba(82,82,82,0.72)",
            }
      }
      whileHover={{ scale: 1.1, y: -1, transition: premiumSpring }}
      whileTap={{ scale: 0.92, transition: premiumTap }}
    >
      {label}
    </motion.div>
  );
}

function InlineCoverage({
  sourceKey,
  auxDefs,
  onPick,
  onCancel,
}: {
  sourceKey: string;
  auxDefs: AuxDef[];
  onPick: (target: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="border-t border-black/[0.06] bg-neutral-50/80 px-3 py-2.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-neutral-700">Add coverage</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="text-neutral-400 hover:text-neutral-600 text-xs px-1"
        >
          ✕
        </button>
      </div>
      {[
        { title: "Zones", items: ZONE_DEFS.map((z) => ({ key: z.key, label: z.key.replace("Z", ""), color: getZoneColor(z.key) })) },
        {
          title: "Restrooms",
          items: RR_DEFS.map((rr) => ({
            key: `MRR${rr.num}`,
            label: rr.label,
            color: getRRAccent(rr.num),
          })),
        },
        {
          title: "Aux",
          items: auxDefs
            .filter((d) => !d.key.startsWith("SP"))
            .map((aux) => {
              const isZ9SR = aux.role === "z9sr" || aux.key === "Z9SR";
              const displayLabel = isZ9SR
                ? "Z9 SR"
                : (aux.label || aux.key).replace(/ .*/, "").slice(0, 5);
              return {
                key: aux.key,
                label: displayLabel,
                color: getAuxAccent(aux.key),
              };
            }),
        },
      ].map((section) => (
        <div key={section.title}>
          <SectionLabel>{section.title}</SectionLabel>
          <div
            className="mt-1 grid gap-1"
            style={{ gridTemplateColumns: `repeat(${section.title === "Aux" ? 4 : 5}, 1fr)` }}
          >
            {section.items.map((item) => {
              const isSelf =
                item.key === sourceKey ||
                (section.title === "Restrooms" &&
                  (sourceKey === item.key || sourceKey === item.key.replace("MRR", "WRR")));
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={isSelf}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isSelf) onPick(item.key);
                  }}
                  className="h-[22px] rounded-md text-[9px] font-bold disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{
                    border: `1px solid ${isSelf ? "rgba(0,0,0,0.06)" : `${item.color}66`}`,
                    background: isSelf ? "transparent" : `${item.color}14`,
                    color: isSelf ? "rgba(0,0,0,0.2)" : item.color,
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Custom coverage text, pinned to bottom as isCoverage task */}
      <div className="border-t border-black/[0.06] pt-2 mt-1">
        <div className="text-[10px] text-neutral-600 mb-1">Custom text (pinned bottom)</div>
        <form
          className="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const input = (e.currentTarget.elements.namedItem("customCoverage") as HTMLInputElement);
            const val = input.value.trim();
            if (val) {
              onPick(`custom:${val}`);
              input.value = "";
            }
          }}
        >
          <input
            name="customCoverage"
            type="text"
            placeholder="e.g. High Limit Slots"
            className="flex-1 text-[10px] border border-black/[0.1] px-1 py-0.5 rounded bg-white"
            onKeyDown={(e) => e.stopPropagation()}
          />
          <button
            type="submit"
            className="text-[10px] px-2 py-0.5 rounded border border-black/[0.1] bg-white hover:bg-neutral-50"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
}

const PlacementPad: React.FC<PlacementPadProps> = ({
  slotKey,
  anchor,
  hostId,
  presentation = "flyout",
  dockTab = "assign",
  onDockTabChange,
  onClose,
  assignments,
  selectedTasks,
  selectedDay,
  members = [],
  auxDefs,
  isCurrentNightLocked,
  onAddCoverage,
  onLiveUnassign,
  onToggleLock,
  onAssign,
  onAddTask,
  onRemoveTask,
  onClearSlotTasks,
  onCopyRestroomPairingTasks,
  onAssignSweeper,
  onRequestEngineInsight,
  scheduledUnassigned = [],
  allEligibleTms,
  onAddOnCall,
  onMarkUnavailable,
  boardPrerenderedFit,
  isDraftMode = false,
  draftAssignments = {},
  weeklyRecentHistory,
  insightsEnabled = true,
  enableTmDragAssign = false,
}) => {
  const { label, accent } = getSlotMeta(slotKey);
  const a = assignments[slotKey] || {};
  const prov = a.provenance || {};
  const hasProv = !!(prov.rationale || (prov.fairnessSignals && Object.keys(prov.fairnessSignals).length > 0));
  const tasks = (selectedTasks[slotKey] || []).filter((t) => !t.isCoverage);
  const isRestroomSide = /^[MW]RR\d+$/.test(slotKey);

  // This-week (planned prior days in the current grave week + current) count per slot for the viewed TM.
  // Fed from the week-planned weeklyRecentHistory (built in Client from live assignments for week days <= selected).
  // Makes boardAndWeekContext "week exposure" and xAI fast/provenance see the built history as we progress days in the week.
  const thisWeekCountFor = React.useMemo(() => {
    const counts = new Map<string, number>();
    if (!a.tmId || !weeklyRecentHistory) return counts;
    const recs = weeklyRecentHistory.get(a.tmId) || [];
    for (const r of recs) {
      counts.set(r.slotKey, (counts.get(r.slotKey) || 0) + 1);
    }
    // include current
    if (a.tmId) {
      counts.set(slotKey, (counts.get(slotKey) || 0) + 1);
    }
    return counts;
  }, [weeklyRecentHistory, a.tmId, slotKey]);

  const [padHistory, setPadHistory] = useState<ZoneDetailEntry | null>(null);
  const [padHistoryLoading, setPadHistoryLoading] = useState(false);
  const [rotationDisplay, setRotationDisplay] = useState<PlacementRotationDisplay | null>(null);
  const [deepInsight, setDeepInsight] = useState<string | null>(null);
  const [insightStructured, setInsightStructured] = useState<PlacementPadInsight | null>(null);
  const [insightCached, setInsightCached] = useState(false);
  const [deepInsightLoading, setDeepInsightLoading] = useState(false);
  const [analystDetailsOpen, setAnalystDetailsOpen] = useState(false);
  const [matrixExpanded, setMatrixExpanded] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [briefLoading, setBriefLoading] = useState(true);
  const analystRequestRef = useRef(0);
  const [padGoodExamples, setPadGoodExamples] = useState<
    Array<{ slotKey: string; insightText: string }>
  >([]);
  const [rotationBasics, setRotationBasics] = useState<PlacementRotationBasics | null>(null);
  const rotationSigRef = useRef<string | null>(null);

  const [coverageMode, setCoverageMode] = useState(false);
  const [assignMode, setAssignMode] = useState(false);
  const [assignConfirmed, setAssignConfirmed] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const [sweeperOpen, setSweeperOpen] = useState(false);
  const taskInputRef = useRef<HTMLInputElement>(null);

  const closeSide = anchor === "left" ? "left" : "right";
  const railSide = anchor === "left" ? "right" : "left";
  const isDock = presentation === "dock";
  const showDockAssignedSummary =
    isDock && dockTab === "assign" && !!a.tmId && !assignMode;
  const showTmPicker =
    onAssign && (assignMode || !a.tmId) && !showDockAssignedSummary;
  const portalStyle = usePortalPlacementStyle(isDock ? undefined : hostId, anchor, showTmPicker);
  const tabletBottomSheet =
    !isDock && isTabletTouchDevice() && !!hostId && !!portalStyle;
  const usePortal = !isDock && !!hostId && !!portalStyle;
  const padLarge = isDock || tabletBottomSheet;
  const showTasksPane = !isDock || dockTab === "tasks";
  const showIntelPane = !isDock || dockTab === "intel";
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (!tabletBottomSheet || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [tabletBottomSheet]);

  useEffect(() => {
    setCoverageMode(false);
    setAssignMode(false);
    setAssignConfirmed(false);
    setRotationDisplay(null);
    setDeepInsight(null);
    setInsightStructured(null);
    setInsightCached(false);
    setDeepInsightLoading(false);
    setAnalystDetailsOpen(false);
    setPadGoodExamples([]);
    setRotationBasics(null);
    rotationSigRef.current = null;
    setTaskInput("");
    setSweeperOpen(false);
    setMatrixExpanded(false);
    setEvidenceOpen(false);
    setBriefLoading(insightsEnabled);
  }, [slotKey, insightsEnabled]);

  useEffect(() => {
    if (analystDetailsOpen) setMatrixExpanded(false);
  }, [analystDetailsOpen]);

  // Brief loading / skeleton on pad open until the light xAI determination (bold one-liner + provenance + matrix surface)
  // is ready. This prevents any "dry run" / engine baseline state from ever flashing before the xAI content.
  // Safety timeout is generous enough for the (history + 50ms delayed light call) but brief in human terms.
  // The veil drops as soon as the headline populates (the primary signal the user wants to see first).
  useEffect(() => {
    if (!insightsEnabled) {
      setBriefLoading(false);
      return;
    }
    const t = setTimeout(() => setBriefLoading(false), 700);
    return () => clearTimeout(t);
  }, [slotKey, insightsEnabled]);

  // Resolve the veil only when the xAI light headline is actually present (or in deep view).
  // History alone is not sufficient — the light call produces the headline we surface as the hero.
  useEffect(() => {
    if (!insightsEnabled) return;
    if (insightStructured?.headline) {
      setBriefLoading(false);
    }
  }, [insightStructured?.headline, insightsEnabled]);

  /* eslint-disable react-hooks/set-state-in-effect -- history load effect intentionally sets loading + data (sync early-return + async promise handlers); these are *not* render-cascading sync sets in the effect body proper, but linter is textual. Documented per review (same as live data effects in Client). */
  useEffect(() => {
    if (!a.tmId) {
      setPadHistory(null);
      setPadHistoryLoading(false);
      return;
    }
    setPadHistoryLoading(true);
    getTmPlacementHistory(a.tmId, 90)
      .then((h) => {
        setPadHistory(h);
        setPadHistoryLoading(false);
      })
      .catch(() => {
        setPadHistory(null);
        setPadHistoryLoading(false);
      });
  }, [slotKey, a.tmId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/preserve-manual-memoization -- the setTimeout + multiple state updates after assign make the callback intentionally side-effectful; preserving the manual useCallback is desired for stable ref to TM picker rows, rule cannot be satisfied here without extra indirection */
  const handlePickTm = useCallback(
    (tm: TmEntry) => {
      if (!onAssign) return;
      onAssign(slotKey, tm.tmId, tm.tmName);
      tabletHaptic(16);
      setAssignConfirmed(true);
      setTimeout(() => {
        setAssignMode(false);
        setAssignConfirmed(false);
      }, 700);
    },
    [slotKey, onAssign],
  );
  /* eslint-enable react-hooks/preserve-manual-memoization */

  const handleAddTask = () => {
    const lbl = taskInput.trim();
    if (!lbl || !onAddTask) return;
    setTaskInput("");
    void onAddTask(slotKey, lbl);
    setTimeout(() => taskInputRef.current?.focus(), 0);
  };

  const currentIso = nightIsoFromDate(selectedDay.date);

  const rrLocs = RR_DEFS.flatMap((d) => {
    const tmId = a?.tmId;
    const rawGender =
      members?.find((m: { id?: string; tmId?: string; tm_id?: string; gender?: string | null }) => m.id === tmId || m.tmId === tmId || m.tm_id === tmId)?.gender ?? null;
    const g = normalizeGender(rawGender);
    const sides: { ui: string; label: string }[] = [];
    if (!g || g === "M") sides.push({ ui: `MRR${d.num}`, label: `${d.num}M` });
    if (!g || g === "F") sides.push({ ui: `WRR${d.num}`, label: `${d.num}W` });
    return sides;
  });

  const auxLocs = auxDefs
    .filter((d) => !d.key.startsWith("SP"))
    .map((d) => ({
      ui: d.key,
      label: formatPlacementUiLabel(d.key, d.label || d.key),
    }));

  /** Single authoritative source for Matrix grid + xAI + prerender fit (padHistory only). */
  const padMatrixFacts = React.useMemo(() => {
    const spreadCounts = getSpreadPlacementCounts(
      padHistory,
      PLACEMENT_SPREAD_NIGHTS,
      currentIso,
    );
    const spreadKeys = getSpreadPlacementKeys(
      padHistory,
      PLACEMENT_SPREAD_NIGHTS,
      currentIso,
    );
    const last5Sequence = getLastPlacementSequence(
      padHistory,
      LAST5_COUNT,
      currentIso,
    );
    const zoneLines = ZONE_DEFS.map(
      (z) => `${z.key}:${spreadCounts.get(z.key) ?? 0}`,
    ).join(" ");
    const rrLines = rrLocs
      .map((loc) => `${loc.ui}:${spreadCounts.get(loc.ui) ?? 0}`)
      .join(" ");
    const auxLines = auxLocs
      .map((loc) => `${loc.ui}:${spreadCounts.get(loc.ui) ?? 0}`)
      .join(" ");
    const last5Line = last5Sequence.join(" → ") || "—";
    const slotSpread = spreadCounts.get(slotKey) ?? 0;
    const slotInLast5 = last5Sequence.includes(slotKey);
    const weekPrior = a.tmId
      ? getTmThisWeekRepeatForSlot(weeklyRecentHistory, a.tmId, slotKey).count
      : 0;
    const weekRepeatTotal = weekPrior + (a.tmId ? 1 : 0);

    const matrixSpreadSnapshot = [
      "MATRIX SURFACE (authoritative — identical to the pad Matrix grid; do not contradict these counts):",
      `Zones: ${zoneLines}`,
      rrLines ? `RR: ${rrLines}` : null,
      auxLines ? `Aux: ${auxLines}` : null,
      `LAST-5 TRAIL (newest first): ${last5Line}`,
      `CURRENT SLOT ${slotKey}: ${slotSpread}× in last-${PLACEMENT_SPREAD_NIGHTS}${slotInLast5 ? "; IN last-5 trail" : "; NOT in last-5 trail"}`,
      weekRepeatTotal > 1
        ? `THIS GRAVE WEEK on ${slotKey}: ${weekRepeatTotal}× (incl. tonight; last-30 may still be 0)`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    const slotHistorySummary = a.tmId
      ? slotSpread > 0
        ? `${slotSpread}× in last ${PLACEMENT_SPREAD_NIGHTS} nights; in last-5 trail: ${slotInLast5 ? "yes" : "no"}`
        : `Not in last ${PLACEMENT_SPREAD_NIGHTS}-night spread${weekRepeatTotal > 1 ? `; ${weekRepeatTotal}× this grave week on ${slotKey}` : ""}`
      : undefined;

    return {
      spreadCounts,
      spreadKeys,
      last5Sequence,
      matrixSpreadSnapshot,
      slotSpread,
      slotInLast5,
      weekRepeatTotal,
      slotHistorySummary,
    };
  }, [
    padHistory,
    currentIso,
    slotKey,
    a.tmId,
    weeklyRecentHistory,
    rrLocs,
    auxLocs,
  ]);

  const spreadKeys = padMatrixFacts.spreadKeys;
  const placedSet = new Set(spreadKeys);
  const spreadCountFor = (ui: string) => padMatrixFacts.spreadCounts.get(ui) ?? 0;

  const getPillAccent = (ui: string): string => {
    if (/^Z\d+$/.test(ui)) return getZoneColor(ui);
    if (ui.startsWith("MRR") || ui.startsWith("WRR")) {
      return getRRAccent(parseInt(ui.replace(/\D/g, ""), 10) || 1);
    }
    return getAuxAccent(ui);
  };

  const rrCount = spreadKeys.filter((k) => k.startsWith("MRR") || k.startsWith("WRR")).length;
  const zoneCount = spreadKeys.filter((k) => /^Z\d+$/.test(k)).length;
  const z9Days = getDaysSinceForKey(padHistory, "Z9", currentIso);
  const z9srDays = getDaysSinceForKey(padHistory, "Z9SR", currentIso);

  const last5Sequence = padMatrixFacts.last5Sequence;
  const last5Pills: Array<string | null> = [...last5Sequence];
  while (last5Pills.length < LAST5_COUNT) last5Pills.push(null);

  const tmMember = a.tmId
    ? members.find(
        (m: { id?: string; tmId?: string; tm_id?: string }) =>
          m.id === a.tmId || m.tmId === a.tmId || m.tm_id === a.tmId,
      )
    : undefined;

  const placementTmProfile = React.useCallback(
    (m: typeof tmMember): PlacementTmProfile | null => {
      if (!m) return null;
      return {
        gender: m.gender,
        gravePool: m.gravePool ?? m.grave_pool,
        isAMOverlap: m.isAMOverlap ?? m.is_am_overlap,
        isPMOverlap: m.isPMOverlap ?? m.is_pm_overlap,
      };
    },
    [],
  );

  const currentPlacementTm = placementTmProfile(tmMember);

  const boardNeighborSummary = Object.entries(assignments)
    .filter(([k, v]) => k !== slotKey && v?.tmName)
    .slice(0, 16)
    .map(([k, v]) => `${k}:${v.tmName}`)
    .join(", ");

  const timesInSpread = padMatrixFacts.slotSpread;
  const slotHistorySummary = padMatrixFacts.slotHistorySummary;

  const auxKeysSig = React.useMemo(
    () => auxDefs.filter((d) => !d.key.startsWith("SP")).map((d) => d.key).join(","),
    [auxDefs],
  );

  const matrixSlotKeys = React.useMemo(() => {
    const keys = ZONE_DEFS.map((z) => z.key);
    const tmId = a.tmId;
    const rawGender =
      members?.find((m: { id?: string; tmId?: string; tm_id?: string }) =>
        m.id === tmId || m.tmId === tmId || m.tm_id === tmId,
      )?.gender ?? null;
    const g = normalizeGender(rawGender);
    for (const d of RR_DEFS) {
      if (!g || g === "M") keys.push(`MRR${d.num}`);
      if (!g || g === "F") keys.push(`WRR${d.num}`);
    }
    for (const key of auxKeysSig.split(",").filter(Boolean)) keys.push(key);
    return keys;
  }, [a.tmId, auxKeysSig, members]);

  /** Stable fingerprint so board changes do not retrigger rotation in a loop */
  const boardSig = React.useMemo(
    () =>
      Object.entries(assignments)
        .filter(([, row]) => row?.tmId)
        .map(([k, row]) => `${k}:${row!.tmId}`)
        .sort()
        .join("|"),
    [assignments],
  );

  const spreadGapsList = matrixSlotKeys.filter((k) => !placedSet.has(k));

  const buildCandidateProfiles = React.useCallback(() => {
    const seen = new Set<string>();
    const pool = [...scheduledUnassigned, ...(allEligibleTms || [])];
    return pool
      .filter((t) => {
        if (seen.has(t.tmId)) return false;
        seen.add(t.tmId);
        return true;
      })
      .slice(0, 14)
      .map((t) => {
        const m = members.find(
          (mem: { id?: string; tmId?: string; tm_id?: string }) =>
            mem.id === t.tmId || mem.tmId === t.tmId || mem.tm_id === t.tmId,
        );
        const profile = placementTmProfile(m);
        const eligible = profile
          ? isEligibleForSlot(
              {
                gender: profile.gender,
                gravePool: profile.gravePool,
                isAMOverlap: profile.isAMOverlap,
                isPMOverlap: profile.isPMOverlap,
              },
              slotKey,
            )
          : true;
        return {
          tmName: t.tmName,
          tmId: t.tmId,
          eligible,
          gender: profile?.gender ?? null,
          gravePool: profile?.gravePool ?? null,
          isAMOverlap: profile?.isAMOverlap,
          isPMOverlap: profile?.isPMOverlap,
        };
      });
  }, [scheduledUnassigned, allEligibleTms, members, placementTmProfile, slotKey]);

  const padHistorySig = React.useMemo(
    () =>
      padHistory
        ? `${padHistory.tmId}:${padHistory.lastDate}:${padHistory.totalAssignments}`
        : "",
    [padHistory?.tmId, padHistory?.lastDate, padHistory?.totalAssignments],
  );

  const matrixSlotKeysSig = React.useMemo(
    () => matrixSlotKeys.join(","),
    [matrixSlotKeys],
  );

  const candidatePoolSize = scheduledUnassigned.length + (allEligibleTms?.length ?? 0);

  const preferredCandidateIds = React.useMemo(
    () => scheduledUnassigned.map((t) => t.tmId).filter(Boolean),
    [scheduledUnassigned],
  );

  // Always score from padHistory — same source as the Matrix surface (last-30 + last-5).
  // boardPrerenderedFit uses the board hook's history cache and can disagree with the pad matrix.
  const prerenderedFit = React.useMemo((): PrerenderedPlacementFit => {
    const fit = computeSlotPlacementFit({
      slotKey,
      assignments,
      isDraftMode,
      draftAssignments,
      members: members as Array<Record<string, unknown>>,
      auxDefs,
      currentIso,
      histories: padHistory && a.tmId ? { [a.tmId]: padHistory } : {},
      historiesLoading: !!a.tmId && padHistoryLoading,
      weeklyRecentHistory,
      candidateProfiles: a.tmName ? undefined : buildCandidateProfiles(),
      preferredCandidateIds: a.tmName ? undefined : preferredCandidateIds,
    });
    return fit;
  }, [
    slotKey,
    assignments,
    isDraftMode,
    draftAssignments,
    members,
    auxDefs,
    currentIso,
    padHistory,
    a.tmId,
    padHistoryLoading,
    weeklyRecentHistory,
    a.tmName,
    buildCandidateProfiles,
    preferredCandidateIds,
  ]);

  const insightContextSig = React.useMemo(
    () =>
      [
        slotKey,
        a.tmId ?? "",
        boardSig,
        currentIso,
        padHistorySig,
        padMatrixFacts.matrixSpreadSnapshot,
        rotationDisplay?.gapsLine ?? "",
        (rotationDisplay?.swapLines ?? []).join("|"),
        prov.rationale ?? "",
        JSON.stringify(prov.fairnessSignals ?? {}),
        String(candidatePoolSize),
      ].join("§"),
    [
      slotKey,
      a.tmId,
      boardSig,
      currentIso,
      padHistorySig,
      padMatrixFacts.matrixSpreadSnapshot,
      rotationDisplay?.gapsLine,
      rotationDisplay?.swapLines,
      prov.rationale,
      prov.fairnessSignals,
      candidatePoolSize,
    ],
  );

  const buildInsightContext = React.useCallback(
    (mode: PlacementInsightMode) => ({
      slotKey,
      tmName: a.tmName || "Unassigned",
      mode,
      prerenderVerdict: prerenderedFit.fitVerdict,
      prerenderSummary: prerenderedFit.fitSummary,
      prerenderFactLine: prerenderedFit.fitFactLine,
      isRR: slotKey.startsWith("MRR") || slotKey.startsWith("WRR"),
      rrSide: slotKey.startsWith("MRR")
        ? "mens"
        : slotKey.startsWith("WRR")
          ? "womens"
          : null,
      rationale: prov.rationale as string | undefined,
      fairnessSignals: prov.fairnessSignals as Record<string, number | string> | undefined,
      recentPlacements: last5Sequence.filter(Boolean).join(" → ") || undefined,
      slotSpecificHistory: slotHistorySummary,
      matrixSpreadSnapshot: padMatrixFacts.matrixSpreadSnapshot,
      currentContext: boardNeighborSummary || undefined,
      tmAttributes: tmMember
        ? {
            gravePool: tmMember.gravePool ?? tmMember.grave_pool,
            isAMOverlap: !!(tmMember.isAMOverlap ?? tmMember.is_am_overlap),
            isPMOverlap: !!(tmMember.isPMOverlap ?? tmMember.is_pm_overlap),
            gender: tmMember.gender ?? null,
          }
        : undefined,
      priorGoodExamples: padGoodExamples.slice(-3),
      rotationBrief: formatRotationBriefForAnalyst(rotationDisplay),
      rotationGapsLine: rotationDisplay?.gapsLine,
      rotationSwapLines: rotationDisplay?.swapLines,
      spreadPlaced: spreadKeys.slice(0, 24).join(", ") || undefined,
      spreadGaps: spreadGapsList.slice(0, 24).join(", ") || undefined,
      // Vast context for light/fast xAI determination (meaningful additional signal for 4-6 bullet synthesis)
      tmExposureDetail: last5Sequence.filter(Boolean).length
        ? `${last5Sequence.filter(Boolean).length}× in recent trail (see full trail in facts)`
        : undefined,
      neighborExposureNotes: boardNeighborSummary || undefined,
      slotTasksSummary: (selectedTasks[slotKey] || []).map((t: { label?: string; name?: string; id?: string }) => t.label || t.name || t.id).slice(0, 3).join(" + ") || undefined,
      boardCoreSnapshot: boardNeighborSummary || undefined,
      // One more layer of vast context for the light determination
      currentBreakGroup: (assignments[slotKey] as { breakGroup?: number } | undefined)?.breakGroup ?? undefined,
      hasCoverageTasks: (selectedTasks[slotKey] || []).some((t: { isCoverage?: boolean }) => t.isCoverage) ? "yes" : undefined,

      // Explicit this-week same-area repeat signal for the current TM + slot (for fast light xAI + deep).
      // Lets the one-liner / bullets call out rotation problems directly ("... but repeat alert: 2x here this week").
      tmThisWeekRepeat: (() => {
        const base = getTmThisWeekRepeatForSlot(weeklyRecentHistory, a.tmId, slotKey);
        const tot = base.count + (a.tmId ? 1 : 0);
        if (tot <= 1) return undefined;
        const isBad = tot >= 3;
        return `${a.tmName || 'TM'} repeat this week: ${tot}× in ${label} (incl. current; policy max 1 — ${isBad ? 'real bad' : 'penalty'})`;
      })(),

      // BOARD AND WEEK CONTEXT — the big one for "board and week context" the operator wants.
      // Compact dense snapshot of the entire current artboard + this week's rotation health.
      // Lets the fast light model produce bullets that consider global balance, not just local slot.
      boardAndWeekContext: (() => {
        const parts: string[] = [];

        // 1. Current full board state — who is on what right now, with their week exposure.
        const boardLines = Object.entries(assignments)
          .filter(([k, v]) => v?.tmName)
          .slice(0, 20)
          .map(([k, v]) => {
            const weekExp = thisWeekCountFor.get(k) ?? 0;
            const spreadExp = spreadCountFor(k);
            const tags: string[] = [];
            if (weekExp > 0) tags.push(`${weekExp}× this week`);
            if (spreadExp > 0) tags.push(`${spreadExp}× last-30`);
            return `${k}:${v.tmName}${tags.length ? `(${tags.join("; ")})` : ""}`;
          })
          .join(' ');
        parts.push(`CURRENT BOARD STATE (full artboard right now + week exposure): ${boardLines || 'mostly empty'}`);

        // 2. This week's rotation health (the core "week context").
        if (rotationDisplay) {
          const w: string[] = [];
          if (rotationDisplay.gapsLine) w.push(`GAPS THIS WEEK: ${rotationDisplay.gapsLine}`);
          if (rotationDisplay.swapLines?.length) w.push(`KEY SWAP LANES THIS WEEK: ${rotationDisplay.swapLines.slice(0, 4).join(' | ')}`);
          if (w.length) parts.push(w.join(' • '));
        }

        // 3. Which slots have the biggest gaps this week (under-used in the 30-night spread).
        if (spreadGapsList?.length) {
          parts.push(`SLOTS WITH THE BIGGEST GAPS THIS WEEK (least placed in spread): ${spreadGapsList.slice(0, 10).join(', ')}`);
        }

        // 4. Night position + overall board fill this night (global balance).
        if (selectedDay) {
          parts.push(`POSITION IN WEEK: day ${selectedDay.dateNum || ''}`);
        }
        const filledCount = Object.values(assignments).filter((v: { tmName?: string }) => !!v?.tmName).length;
        const totalSlots = Object.keys(assignments).length;
        parts.push(`BOARD FILL THIS NIGHT: ${filledCount}/${totalSlots} slots have a TM right now`);

        (() => {
          const base = getTmThisWeekRepeatForSlot(weeklyRecentHistory, a.tmId, slotKey);
          const tot = base.count + (a.tmId ? 1 : 0);
          if (tot > 1) {
            parts.push(`TM WEEK REPEAT ALERT for current assignment: ${a.tmName || 'TM'} has ${tot}× in ${label} this week (dates: ${base.dates.join(' ')}). Max ideal = 1.`);
          }
        })();

        return parts.join('\n');
      })(),
      candidateProfiles: !a.tmName ? buildCandidateProfiles() : undefined,
      suggestedCandidates: !a.tmName
        ? buildCandidateProfiles()
            .filter((c) => c.eligible)
            .slice(0, 8)
            .map((c) => c.tmName)
            .join(", ")
        : undefined,
      contextSig: insightContextSig,
      filledSlotKeys: Object.entries(assignments)
        .filter(([, row]) => !!(row as { tmId?: string })?.tmId)
        .map(([key]) => key),
      emptySlotKeys: Object.entries(assignments)
        .filter(([, row]) => !(row as { tmId?: string })?.tmId)
        .map(([key]) => key),
    }),
    [
      slotKey,
      a.tmName,
      prov.rationale,
      prov.fairnessSignals,
      last5Sequence,
      slotHistorySummary,
      boardNeighborSummary,
      tmMember,
      padGoodExamples,
      rotationDisplay,
      spreadKeys,
      spreadGapsList,
      buildCandidateProfiles,
      insightContextSig,
      assignments,
      selectedTasks,
      boardNeighborSummary,
      selectedDay,
      padHistory,
      padMatrixFacts.matrixSpreadSnapshot,
      currentIso,
      prerenderedFit.fitVerdict,
      prerenderedFit.fitSummary,
      prerenderedFit.fitFactLine,
      weeklyRecentHistory,
      a.tmId,
      slotKey,
    ],
  );

  const runPlacementAnalyst = React.useCallback(
    async (mode: PlacementInsightMode) => {
      const reqId = ++analystRequestRef.current;
      setDeepInsightLoading(true);
      try {
        const data = await postEngineInsight(buildInsightContext(mode));
        if (analystRequestRef.current !== reqId) return;
        setDeepInsight(data.text || null);
        setInsightStructured(data.structured ?? null);
        setInsightCached(!!data.cached);
        // Add usage to session + 30d monthly tracker ONLY for actual (non-cached) xAI calls
        // (cached hits don't spend tokens)
        if (data && !data.cached && data.usage) {
          try {
            useShiftBuilderStore.getState().addAiUsage(data.usage);
          } catch {}
        }
      } catch (err) {
        if (analystRequestRef.current !== reqId) return;
        setDeepInsight(
          err instanceof Error ? err.message : "Analyst unavailable.",
        );
        setInsightStructured(null);
        setInsightCached(false);
      } finally {
        if (analystRequestRef.current === reqId) {
          setDeepInsightLoading(false);
        }
      }
    },
    [buildInsightContext],
  );

  const handleMoreDetails = React.useCallback(() => {
    setAnalystDetailsOpen(true);
    const mode: PlacementInsightMode = a.tmName ? "deep" : "assignee";
    void runPlacementAnalyst(mode);
  }, [a.tmName, runPlacementAnalyst]);

  // Light/fast magic one-liner determination (grok-build-0.1 "fast").
  // Runs automatically (cheap) when the pad mounts for a placed TM so the builder digital veil
  // (corner ✧ chip + under-name annotation line) gets a crisp headline *immediately*.
  // This refines the "magic one liner" availability without burning full 4.3 tokens on every pad open.
  // Explicit "More details" still does the rich grok-4.3 high call (can override the headline).
  const lightRunRef = React.useRef(0);
  const runLightDetermination = React.useCallback(async () => {
    if (!a.tmName) return;
    const reqId = ++lightRunRef.current;
    try {
      const data = await postEngineInsight(buildInsightContext("headline"));
      if (lightRunRef.current !== reqId) return;
      // We intentionally do *not* set deepInsight / detailsOpen here — this is the silent quick determination
      // for the card surfaces. If user wants elaboration they tap the button.
      if (data.structured?.headline) {
        setInsightStructured((prev) => (prev?.headline ? prev : data.structured ?? null));
        setInsightCached(!!data.cached);
      }
      if (data && !data.cached && data.usage) {
        try {
          useShiftBuilderStore.getState().addAiUsage(data.usage);
        } catch {}
      }
    } catch {
      // Silent fail is fine — prerender + rotation are still authoritative.
    }
  }, [a.tmName, buildInsightContext, hostId, slotKey]);

  // Re-run xAI when pad history loads or changes — matrix + headline must share the same facts.
  /* eslint-disable react-hooks/set-state-in-effect -- intentional clear of insight state when history/sig changes for this pad instance (fresh context for xAI/rotation on pad open or day switch); linter advisory, same pattern as focus reset in Client */
  React.useEffect(() => {
    if (!insightsEnabled) return;
    setInsightStructured(null);
    setInsightCached(false);
    setBriefLoading(true);
  }, [padHistorySig, a.tmId, slotKey, insightsEnabled]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-run the light headline determination once per pad open for assigned TMs.
  // This is the key UX refinement: the magic one-liner now appears in the builder surfaces (cards)
  // as soon as you click a card to open its pad, using a cheap fast-model call.
  React.useEffect(() => {
    if (!insightsEnabled) return;
    if (!a.tmName || analystDetailsOpen || insightStructured?.headline || padHistoryLoading) return;
    // Smaller delay; wait for history so context (spread/last5/rotation) is ready for better bullets + less choppy re-renders before grok appears.
    const t = setTimeout(() => {
      void runLightDetermination();
    }, 50);
    return () => clearTimeout(t);
  }, [a.tmName, analystDetailsOpen, insightStructured?.headline, padHistoryLoading, runLightDetermination, insightsEnabled]);

  /* eslint-disable react-hooks/set-state-in-effect -- multiple intentional state resets inside (clear rotation/insight when sigs or insightsEnabled or tm changes for pad freshness); linter rule advisory for derived UI state sync, consistent with Client focus reset and /today patterns. Re-enable after this effect. */
  useEffect(() => {
    if (!insightsEnabled) {
      setRotationBasics(null);
      setRotationDisplay(null);
      rotationSigRef.current = null;
      return;
    }
    if (!a.tmId) {
      setRotationBasics(null);
      setRotationDisplay(null);
      rotationSigRef.current = null;
      return;
    }
    if (padHistoryLoading || !padHistory) return;

    const sig = `${slotKey}|${a.tmId}|${currentIso}|${boardSig}|${auxKeysSig}|${padHistorySig}`;
    if (rotationSigRef.current === sig) return;

    let cancelled = false;

    const run = async () => {
      const otherIds = [
        ...new Set(
          Object.values(assignments)
            .map((row: { tmId?: string }) => row?.tmId)
            .filter((id): id is string => !!id && id !== a.tmId),
        ),
      ];

      let histories: Record<string, ZoneDetailEntry | null> = {};
      try {
        if (otherIds.length > 0) {
          const res = await fetch("/api/shiftbuilder/placement-histories", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tmIds: otherIds, days: PLACEMENT_SPREAD_NIGHTS }),
          });
          if (res.ok) {
            const data = await res.json();
            histories = data.histories ?? {};
          }
        }
      } catch {
        /* rotation still works without cross-board histories */
      }

      if (cancelled) return;

      const otherTmProfiles: Record<string, PlacementTmProfile | null> = {};
      for (const row of Object.values(assignments)) {
        const id = row?.tmId;
        if (!id || id === a.tmId) continue;
        const mem = members.find(
          (m: { id?: string; tmId?: string; tm_id?: string }) =>
            m.id === id || m.tmId === id || m.tm_id === id,
        );
        otherTmProfiles[id] = placementTmProfile(mem);
      }

      const basics = computePlacementRotationBasics(
        padHistory,
        slotKey,
        a.tmId,
        matrixSlotKeys,
        assignments,
        histories,
        currentIso,
        PLACEMENT_SPREAD_NIGHTS,
        currentPlacementTm,
        otherTmProfiles,
      );
      rotationSigRef.current = sig;
      setRotationBasics(basics);
      if (a.tmName) {
        setRotationDisplay(
          formatPlacementRotationDisplay(a.tmName, slotKey, basics, PLACEMENT_SPREAD_NIGHTS),
        );
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    a.tmId,
    a.tmName,
    padHistoryLoading,
    padHistorySig,
    slotKey,
    currentIso,
    boardSig,
    auxKeysSig,
    matrixSlotKeysSig,
    assignments,
    insightsEnabled,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const showMatrixSection =
    !!a.tmName &&
    (insightsEnabled
      ? !briefLoading &&
        (analystDetailsOpen ||
          matrixExpanded ||
          (!analystDetailsOpen && !!insightStructured?.headline) ||
          !(!analystDetailsOpen && insightStructured?.headline))
      : true);

  const showMatrixGrid = insightsEnabled
    ? analystDetailsOpen ||
      matrixExpanded ||
      (!analystDetailsOpen && !!insightStructured?.headline)
    : true;

  const matrixQuickMode = !insightsEnabled || !analystDetailsOpen;

  const padEl = (
    <motion.div
      className={`placement-pad sb-pad-enter no-print ${isDock ? "placement-dock-inner h-full" : usePortal ? "fixed" : anchorClass(anchor)} ${tabletBottomSheet ? "sb-tablet-bottom-sheet" : ""} ${isDock ? "" : "z-[60] rounded-2xl border border-white/40 dark:border-white/10 bg-white/95 dark:bg-zinc-950/95 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.32),0_2px_4px_-1px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-[28px]"} flex flex-col overflow-hidden`}
      style={
        isDock
          ? { display: "flex", flexDirection: "column", height: "100%", width: "100%" }
          : usePortal
            ? portalStyle!
            : {
                width: PAD_W,
                maxHeight:
                  analystDetailsOpen || showTmPicker
                    ? PAD_MAX_HEIGHT
                    : Math.min(520, PAD_MAX_HEIGHT),
                display: "flex",
                flexDirection: "column",
              }
      }
      onClick={(e) => e.stopPropagation()}
      {...(reducedMotion ? premiumPresenceReduced : premiumPresence)}
      // Premium entrance for the placement pad popup in builder view — smooth pop with spring for Apple feel.
      // Only rendered in !isPrintPreview contexts via caller in Board. Reduced-motion safe.
    >
      {tabletBottomSheet ? (
        <div className="sb-pad-handle" aria-hidden />
      ) : null}
      {!isDock ? (
        <>
      {/* Accent rail */}
      <div
        className="absolute top-3 h-10 w-[3px] rounded-full"
        style={{
          [railSide]: -1,
          background: accent,
          boxShadow: `0 0 10px ${accent}66`,
        }}
      />

      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="sb-pad-close absolute top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-black/[0.06] bg-neutral-100/80 text-neutral-400 text-sm hover:bg-neutral-200/80 hover:text-neutral-600"
        style={tabletBottomSheet ? { right: 8, left: "auto" } : { [closeSide]: 8 }}
        aria-label="Close"
        {...premiumTap}
        whileHover={{ scale: 1.1 }}
        transition={premiumSpring}
      >
        ×
      </motion.button>
        </>
      ) : null}

      {/* Header — fixed, never scrolls away (flyout only; dock uses PlacementDock header) */}
      {!isDock ? (
      <div className="shrink-0">
        <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2 pr-10">
          <div
            className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${
              padLarge ? "h-12 w-12 text-[17px]" : "h-8 w-8 text-[11px]"
            }`}
            style={{ background: a.tmName ? accent : "rgba(0,0,0,0.08)", color: a.tmName ? "#fff" : "#999" }}
          >
            {a.tmName ? a.tmName[0].toUpperCase() : "–"}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={`truncate font-bold uppercase tracking-[0.14em] ${padLarge ? "text-[15px]" : "text-[10px]"}`}
              style={{ color: accent }}
            >
              {label}
            </div>
            <div className={`truncate font-bold tracking-tight text-neutral-900 ${padLarge ? "text-[24px]" : "text-[16px]"}`}>
              {a.tmName || "Unassigned"}
            </div>
            {a.tmName && onMarkUnavailable && (
              <motion.button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void onMarkUnavailable(a.tmId, a.tmName, 'called_off');
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="ml-2 text-[8px] px-1.5 py-0.5 rounded border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100"
                style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
                {...premiumTap}
                whileHover={{ scale: 1.05, transition: premiumSpring }}
              >
                Mark unavailable
              </motion.button>
            )}
          </div>
          {a.breakGroup != null && a.breakGroup > 0 && (
            <div className="shrink-0 text-center">
              <div className={`font-bold uppercase tracking-widest text-neutral-400 ${padLarge ? "text-[9px]" : "text-[7px]"}`}>Brk</div>
              <div
                className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold text-white"
                style={{ background: accent, border: `1px solid ${accent}` }}
              >
                {a.breakGroup}
              </div>
            </div>
          )}
        </div>
        <div className="mx-3 border-t border-black/[0.06]" />
      </div>
      ) : null}

      {/* Body — only this region scrolls when content is tall.
          In quick view (bold one-liner + provenance expander + always Matrix) we let height adapt to content
          so the marker card grows naturally with no scroll bar if the total fits under the screen-safe max. */}
      <div
        className={`min-h-0 overscroll-contain ${
          isDock || showTmPicker || analystDetailsOpen
            ? `flex-1 overflow-y-auto ${showTmPicker ? (padLarge ? "min-h-[360px]" : "min-h-[300px]") : ""}`
            : "overflow-visible"
        }`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {showDockAssignedSummary ? (
          <div className={`flex flex-col gap-3 ${padLarge ? "px-4 py-4" : "px-3 py-3"}`}>
            <p className={`font-medium text-neutral-600 ${padLarge ? "text-[15px]" : "text-[11px]"}`}>
              {a.tmName} is assigned to this slot tonight.
            </p>
            <button
              type="button"
              onClick={() => {
                setAssignMode(true);
                onDockTabChange?.("assign");
              }}
              className={`w-full rounded-xl font-semibold text-white ${padLarge ? "min-h-11 py-3 text-[16px]" : "py-2 text-[11px]"}`}
              style={{ background: accent }}
            >
              Swap team member
            </button>
            {a.tmName && onMarkUnavailable ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void onMarkUnavailable(a.tmId, a.tmName, "called_off");
                }}
                className={`rounded-xl border border-amber-300 bg-amber-50 font-semibold text-amber-800 hover:bg-amber-100 ${padLarge ? "min-h-11 py-3 text-[14px]" : "py-2 text-[10px]"}`}
              >
                Mark unavailable
              </button>
            ) : null}
          </div>
        ) : showTmPicker ? (
          <div className={`flex h-full flex-col ${padLarge ? "min-h-[340px] px-4 py-3" : "min-h-[280px] px-2.5 py-2"}`}>
            <motion.div {...(reducedMotion ? premiumPresenceReduced : premiumPresence)} className="contents">
            <TmPicker
              tms={scheduledUnassigned}
              allTms={allEligibleTms}
              currentTmName={a.tmId ? a.tmName : undefined}
              onPick={handlePickTm}
              onAddOnCall={
                onAddOnCall
                  ? (tm) => { void onAddOnCall(tm.tmId, tm.tmName); }
                  : undefined
              }
              onMarkUnavailable={
                onMarkUnavailable
                  ? (tm, status) => { void onMarkUnavailable(tm.tmId, tm.tmName, status); }
                  : undefined
              }
              onCancel={a.tmId ? () => setAssignMode(false) : undefined}
              confirmed={assignConfirmed}
              accent={accent}
              isDark={false}
              variant={padLarge ? "tablet" : "default"}
              enableDragAssign={enableTmDragAssign}
            />
            </motion.div>
          </div>
        ) : coverageMode && showTasksPane ? (
          <InlineCoverage
            sourceKey={slotKey}
            auxDefs={auxDefs}
            onPick={async (tgt) => {
              if (onAddCoverage) await onAddCoverage(slotKey, tgt);
              setCoverageMode(false);
            }}
            onCancel={() => setCoverageMode(false)}
          />
        ) : (
          <div className="flex flex-col">
            {!a.tmName && !isDock && (
              <div className="px-3 pt-2 pb-1 space-y-2">
                <button
                  type="button"
                  disabled={isCurrentNightLocked}
                  onClick={() => setAssignMode(true)}
                  className={`w-full rounded-lg font-semibold text-white disabled:opacity-50 ${
                    padLarge ? "py-3.5 text-[18px]" : "py-2 text-[11px]"
                  }`}
                  style={{ background: accent }}
                >
                  Assign team member
                </button>
              </div>
            )}

            {/* Tasks — visible immediately (they are current state, not dependent on xAI enrichment) */}
            {showTasksPane ? (
            <div className="px-3 pt-2.5 pb-1">
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <SectionLabel large={padLarge}>
                  Tasks{tasks.length > 0 ? ` · ${tasks.length}` : ""}
                </SectionLabel>
                <div className="flex items-center gap-1 shrink-0">
                  {onClearSlotTasks && tasks.length > 0 && !isCurrentNightLocked ? (
                    <motion.button
                      type="button"
                      onClick={() => void onClearSlotTasks(slotKey)}
                      className={`rounded-md border border-black/[0.08] bg-neutral-50 px-2 py-0.5 font-semibold text-neutral-500 hover:bg-neutral-100 hover:text-red-600 ${padLarge ? "text-[12px]" : "text-[9px]"}`}
                      {...premiumButton}
                      whileHover={{ scale: 1.03 }}
                      transition={premiumSpring}
                    >
                      Clear tasks
                    </motion.button>
                  ) : null}
                  {onCopyRestroomPairingTasks && isRestroomSide && !isCurrentNightLocked ? (
                    <motion.button
                      type="button"
                      onClick={() => void onCopyRestroomPairingTasks(slotKey)}
                      className={`rounded-md border border-black/[0.08] bg-neutral-50 px-2 py-0.5 font-semibold text-neutral-500 hover:bg-neutral-100 ${padLarge ? "text-[12px]" : "text-[9px]"}`}
                      {...premiumButton}
                      whileHover={{ scale: 1.03 }}
                      transition={premiumSpring}
                    >
                      Copy from Restroom Pairing
                    </motion.button>
                  ) : null}
                  {onAssignSweeper ? (
                    <motion.button
                      type="button"
                      onClick={() => setSweeperOpen((v) => !v)}
                      className={`rounded-md border border-black/[0.08] bg-neutral-50 px-2 py-0.5 font-semibold text-neutral-500 hover:bg-neutral-100 ${padLarge ? "text-[12px]" : "text-[9px]"}`}
                      {...premiumButton}
                      whileHover={{ scale: 1.03 }}
                      transition={premiumSpring}
                    >
                      Sweeper
                    </motion.button>
                  ) : null}
                </div>
              </div>

              {sweeperOpen && onAssignSweeper && (
                <div className="mb-1.5 flex flex-col gap-1">
                  <AnimatePresence>
                    {["Sweep 5/8/HL", "Sweep 9/10/SR"].map((opt, i) => (
                      <motion.button
                        key={opt}
                        type="button"
                        onClick={() => {
                          void onAssignSweeper(slotKey, opt);
                          setSweeperOpen(false);
                        }}
                        className="rounded-lg border border-amber-200/80 bg-amber-50 px-2.5 py-1.5 text-left text-[10px] font-semibold text-amber-700 hover:bg-amber-100/80"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ ...premiumSpring, delay: i * 0.03 }}
                        whileHover={{ scale: 1.02, transition: premiumSpring }}
                        whileTap={{ scale: 0.97, transition: premiumTap }}
                      >
                        {opt}
                      </motion.button>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {tasks.length > 0 && (
                <div className="mb-1.5 flex flex-col gap-1">
                  <AnimatePresence>
                    {tasks.map((t) => (
                      <motion.div
                        key={t.id}
                        layout
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.96 }}
                        transition={premiumSpring}
                        className="flex items-center gap-2 rounded-lg border border-black/[0.06] bg-neutral-50/90 px-2 py-1.5"
                      >
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-sm"
                          style={{ background: t.color ?? accent }}
                        />
                        <span className={`flex-1 truncate font-medium text-neutral-900 ${padLarge ? "text-[17px]" : "text-[11.5px]"}`}>
                          {t.taskLabel}
                        </span>
                        {onRemoveTask && (
                          <button
                            type="button"
                            onClick={() => onRemoveTask(slotKey, t.taskLabel)}
                            className="text-neutral-400 hover:text-neutral-600 text-xs leading-none px-0.5"
                            aria-label={`Remove ${t.taskLabel}`}
                          >
                            ×
                          </button>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {onAddTask && (
                <motion.div 
                  className="flex gap-1.5"
                  initial={{ opacity: 0.9 }}
                  animate={{ opacity: 1 }}
                  transition={premiumSpring}
                >
                  <input
                    ref={taskInputRef}
                    type="text"
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTask();
                      }
                    }}
                    placeholder="Add a task…"
                    disabled={isCurrentNightLocked}
                    className={`min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-white text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-black/[0.06] ${
                      padLarge ? "px-3.5 py-3 text-[18px]" : "px-2.5 py-1.5 text-[11px]"
                    }`}
                  />
                  {taskInput.trim() && (
                    <motion.button
                      type="button"
                      onClick={handleAddTask}
                      className={`shrink-0 rounded-lg px-2.5 font-bold text-white ${padLarge ? "text-[14px] py-2" : "text-[10px]"}`}
                      style={{ background: accent }}
                      {...premiumButton}
                      whileHover={{ scale: 1.05 }}
                      transition={premiumSpring}
                    >
                      Add
                    </motion.button>
                  )}
                  {taskInput.trim() && (
                    <button
                      type="button"
                      onClick={() => setTaskInput("")}
                      className="shrink-0 text-neutral-400 hover:text-neutral-600 px-1 text-lg leading-none"
                      aria-label="Clear task input"
                    >
                      ×
                    </button>
                  )}
                </motion.div>
              )}
            </div>
            ) : null}

            {showIntelPane ? (
            <>
            {/* Targeted skeleton for the xAI area (bold one-liner + expander + always Matrix).
                Placed exactly where the real xAI glass will appear (after tasks).
                Shown while we are still awaiting the light determination headline.
                This (combined with the strict mount guard on the analyst block below) eliminates
                any flash of the engine baseline / "dry run" state before the xAI content. */}
            {insightsEnabled && !(analystDetailsOpen || !!insightStructured?.headline) && (
              <div className="px-3 pt-1 pb-2">
                <div
                  className="mb-2 rounded-2xl border border-[#2F5C7C]/15 bg-white/85 px-5 py-3.5"
                  style={{ borderLeft: '5px solid #2F5C7C22' }}
                >
                  <div className="flex items-baseline gap-1.5 mb-1.5">
                    <span style={{ fontSize: "10px", color: "#2F5C7C40" }}>✧</span>
                    <div className="h-2 w-44 rounded bg-[#2F5C7C]/15" />
                    <div className="ml-auto h-1.5 w-9 rounded bg-[#2F5C7C]/10" />
                  </div>
                  <div className="h-4 w-[94%] rounded bg-neutral-200/80 mb-2.5" />
                  <div className="text-[8px] text-[#2F5C7C]/40 mb-1" style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}>
                    ✧ Matrix surface · last 30 nights (spread) + last 5 placements
                  </div>
                  <div className="grid grid-cols-5 gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-3.5 rounded bg-neutral-200/50" />
                    ))}
                  </div>
                </div>
                <div className="pl-0.5 text-[8px] text-neutral-400/60" style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}>
                  Gathering board + week signals…
                </div>
              </div>
            )}

            {insightsEnabled && (analystDetailsOpen || !!insightStructured?.headline) && (
            <PlacementAnalystBlock
              compactTablet={padLarge}
              prerendered={prerenderedFit}
              loading={deepInsightLoading}
              detailsOpen={analystDetailsOpen}
              text={deepInsight}
              structured={insightStructured}
              cached={insightCached}
              assigned={!!a.tmName}
              onMoreDetails={handleMoreDetails}
              onTrain={
                deepInsight
                  ? () =>
                      setPadGoodExamples((prev) =>
                        [...prev, { slotKey, insightText: deepInsight }].slice(-3),
                      )
                  : undefined
              }
              matrixExpanded={matrixExpanded}
              onToggleMatrix={() => setMatrixExpanded(!matrixExpanded)}
              evidenceOpen={evidenceOpen}
              setEvidenceOpen={setEvidenceOpen}
              padGoodExamples={padGoodExamples}
              rotationGapsLine={rotationDisplay?.gapsLine}
              slotSpreadCount={spreadCountFor ? spreadCountFor(slotKey) : undefined}
              slotKey={slotKey}
              onClearTraining={() => setPadGoodExamples([])}
              onClearDetails={() => {
                setAnalystDetailsOpen(false);
                setDeepInsight(null);
                setInsightStructured(null);
                setInsightCached(false);
                // Also reset light run so next pad open can re-determine fresh if needed.
                lightRunRef.current = 0;
              }}
            />
            )}

            {showMatrixSection && (
              <div className={`border-t border-black/[0.05] px-2.5 ${matrixQuickMode ? "py-0.5" : "py-1.5"}`}>
                {/* Rotation history only in deep xAI view. */}
                {insightsEnabled && analystDetailsOpen && (
                  padHistoryLoading && !rotationDisplay ? (
                    <BuilderLoadingLine className="text-[10px]">Loading placement history</BuilderLoadingLine>
                  ) : rotationDisplay ? (
                    <>
                      <SectionLabel>Rotation · 30 nights</SectionLabel>
                      <div className="mt-1 space-y-1 text-[10px] leading-snug text-neutral-700">
                        {rotationDisplay.gapsLine && <p>{rotationDisplay.gapsLine}</p>}
                        {rotationDisplay.swapLines.length > 0 && (
                          <div>
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-neutral-400">
                              Swap lanes
                            </p>
                            {rotationDisplay.swapLines.map((line) => (
                              <p key={line} className="text-[9.5px] text-neutral-600">
                                {line}
                              </p>
                            ))}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5 text-[8px] text-neutral-400">
                          <span className="inline-flex items-center gap-0.5">
                            <span className="h-2 w-3 rounded border border-dashed border-neutral-400/50 bg-neutral-200/60" />
                            not in spread
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <span className="h-2 w-3 rounded border border-sky-400/50 bg-sky-50" />
                            cross
                          </span>
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 text-[10px] text-neutral-500">No history yet.</p>
                  )
                )}

                {/* Matrix panel — always in quick view when xAI is off (/today); under xAI headline in builder. */}
                {showMatrixGrid && (
                  <div className={matrixQuickMode ? "mt-0" : ""}>
                    {!insightsEnabled && padHistoryLoading ? (
                      <BuilderLoadingLine className="text-[10px]">Loading placement matrix</BuilderLoadingLine>
                    ) : (
                      <>
                    {matrixQuickMode ? (
                      <div className="text-[8.5px] font-medium tracking-[0.25px] text-[#2F5C7C]/80 mb-0.5 flex items-center gap-1" style={{ fontFamily: 'var(--font-atkinson, var(--font-ui, system-ui))' }}>
                        {insightsEnabled ? "✧ Matrix surface" : "Matrix"} · last 30 nights (spread) + last 5 placements
                      </div>
                    ) : (
                      <SectionLabel>Matrix</SectionLabel>
                    )}

                    {/* Counts row */}
                    <div className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono ${matrixQuickMode ? "text-[7.5px]" : "text-[9px]"}`}>
                      <span>
                        <span className="font-semibold" style={{ color: accent }}>RR</span>{" "}
                        <span className="font-bold text-neutral-800">{rrCount}</span>
                      </span>
                      <span className="text-neutral-300">|</span>
                      <span>
                        <span className="font-semibold text-neutral-400">Zone</span>{" "}
                        <span className="font-bold text-neutral-800">{zoneCount}</span>
                      </span>
                      <span className="text-neutral-300">|</span>
                      <span>
                        <span className="font-semibold" style={{ color: Z9_STAT_RED }}>Z9</span>{" "}
                        <span className="font-bold text-neutral-800 tabular-nums">{z9Days}</span>
                      </span>
                      <span>
                        <span className="font-semibold" style={{ color: Z9_STAT_RED }}>Z9SR</span>{" "}
                        <span className="font-bold text-neutral-800 tabular-nums">{z9srDays}</span>
                      </span>
                    </div>

                    {/* Compact legend only in quick; deep uses its own */}
                    {matrixQuickMode && (
                      <div className="mt-0.5 mb-0.5 flex flex-wrap gap-x-1.5 gap-y-0 text-[6.5px] text-neutral-400">
                        <span className="inline-flex items-center gap-0.5">
                          <span className="h-1.5 w-2 rounded border" style={{ background: "#16a34a22", borderColor: "#16a34a55" }} />
                          1×
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <span className="h-1.5 w-2 rounded border" style={{ background: "#ea580c22", borderColor: "#ea580c55" }} />
                          2×
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <span className="h-1.5 w-2 rounded border" style={{ background: "#dc262622", borderColor: "#dc262655" }} />
                          3×+
                        </span>
                        <span className="inline-flex items-center gap-0.5">
                          <span className="h-1.5 w-2 rounded border border-dashed border-neutral-400/50 bg-neutral-200/60" />
                          not in spread
                        </span>
                      </div>
                    )}

                    {/* Grids: compact inline spans for quick (always visible, small height); PlacementCell for deep */}
                    {matrixQuickMode ? (
                      <>
                        <div className="grid grid-cols-5 gap-0.5">
                          {ZONE_DEFS.map((z) => {
                            // Matrix pills = last-30 spread only (nights strictly before viewed night).
                            // Current assignment and future week plan do not color cells.
                            const n = spreadCountFor(z.key);
                            const col = n > 0 && spreadFrequencyAccent(n) ? spreadFrequencyAccent(n) : null;
                            const title = n > 0 ? `${z.key} · ${n}× in last 30 nights` : z.key;
                            return (
                              <motion.div
                                key={z.key}
                                className="flex h-4 items-center justify-center rounded text-[7px] font-bold tabular-nums"
                                style={col ? { background: `${col}22`, border: `1px solid ${col}55`, color: col } : { background: "rgba(115,115,115,0.14)", border: "1px dashed rgba(115,115,115,0.38)", color: "rgba(82,82,82,0.72)" }}
                                title={title}
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ ...premiumSpring, delay: 0.01 * (ZONE_DEFS.findIndex(zz => zz.key === z.key) || 0) }}
                                whileHover={{ scale: 1.08, y: -1, transition: premiumSpring }}
                                whileTap={{ scale: 0.95, transition: premiumTap }}
                              >
                                {z.key}
                              </motion.div>
                            );
                          })}
                        </div>

                        {rrLocs.length > 0 && (
                          <div className="mt-0.5 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${Math.min(rrLocs.length, 5)}, 1fr)` }}>
                            {rrLocs.map((loc) => {
                              const n = spreadCountFor(loc.ui);
                              const col = n > 0 && spreadFrequencyAccent(n) ? spreadFrequencyAccent(n) : null;
                              return (
                                <motion.div
                                  key={loc.ui}
                                  className="flex h-4 items-center justify-center rounded text-[7px] font-bold tabular-nums"
                                  style={col ? { background: `${col}22`, border: `1px solid ${col}55`, color: col } : { background: "rgba(115,115,115,0.14)", border: "1px dashed rgba(115,115,115,0.38)", color: "rgba(82,82,82,0.72)" }}
                                  title={n > 0 ? `${loc.ui} · ${n}× in last 30 nights` : loc.ui}
                                  whileHover={{ scale: 1.08, y: -1, transition: premiumSpring }}
                                  whileTap={{ scale: 0.95, transition: premiumTap }}
                                >
                                  {loc.label}
                                </motion.div>
                              );
                            })}
                          </div>
                        )}

                        {auxLocs.length > 0 && (
                          <div className="mt-0.5 grid gap-0.5" style={{ gridTemplateColumns: `repeat(${Math.min(auxLocs.length, 5)}, 1fr)` }}>
                            {auxLocs.map((loc) => {
                              const n = spreadCountFor(loc.ui);
                              const col = n > 0 && spreadFrequencyAccent(n) ? spreadFrequencyAccent(n) : null;
                              return (
                                <motion.div
                                  key={loc.ui}
                                  className="flex h-4 items-center justify-center rounded text-[7px] font-bold tabular-nums"
                                  style={col ? { background: `${col}22`, border: `1px solid ${col}55`, color: col } : { background: "rgba(115,115,115,0.14)", border: "1px dashed rgba(115,115,115,0.38)", color: "rgba(82,82,82,0.72)" }}
                                  title={n > 0 ? `${loc.ui} · ${n}× in last 30 nights` : loc.ui}
                                  whileHover={{ scale: 1.08, y: -1, transition: premiumSpring }}
                                  whileTap={{ scale: 0.95, transition: premiumTap }}
                                >
                                  {loc.label}
                                </motion.div>
                              );
                            })}
                          </div>
                        )}

                        <p className="mt-1 mb-0.5 text-[7px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
                          Last 5
                        </p>
                        <div className="grid grid-cols-5 gap-0.5">
                          {last5Pills.map((ui, i) => {
                            if (!ui) {
                              return (
                                <span key={`empty-${i}`} className="flex h-4 items-center justify-center rounded border border-dashed border-black/[0.08] bg-transparent text-[7px] text-neutral-300">—</span>
                              );
                            }
                            const pillAccent = getPillAccent(ui);
                            const pillLabel = formatPlacementUiLabel(ui);
                            return (
                              <span
                                key={`${ui}-${i}`}
                                className="flex h-4 items-center justify-center rounded text-[7px] font-bold tabular-nums"
                                style={pillAccent ? { background: `${pillAccent}22`, border: `1px solid ${pillAccent}55`, color: pillAccent } : { background: "rgba(115,115,115,0.14)", border: "1px dashed rgba(115,115,115,0.38)", color: "rgba(82,82,82,0.72)" }}
                                title={pillLabel}
                              >
                                {pillLabel}
                              </span>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="mt-2.5 mb-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-neutral-400">Last 30 Spread</p>
                        <div className="mb-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[8px] text-neutral-400">
                          <span className="inline-flex items-center gap-0.5">
                            <span className="h-2 w-3 rounded border" style={{ background: "#16a34a22", borderColor: "#16a34a55" }} />1×
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <span className="h-2 w-3 rounded border" style={{ background: "#ea580c22", borderColor: "#ea580c55" }} />2×
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <span className="h-2 w-3 rounded border" style={{ background: "#dc262622", borderColor: "#dc262655" }} />3×+
                          </span>
                          <span className="inline-flex items-center gap-0.5">
                            <span className="h-2 w-3 rounded border border-dashed border-neutral-400/50 bg-neutral-200/60" />not in spread
                          </span>
                        </div>

                        <div className="grid grid-cols-5 gap-1">
                          {ZONE_DEFS.map((z) => {
                            const n = spreadCountFor(z.key);
                            return <PlacementCell key={z.key} label={z.key} spreadCount={n} title={n > 0 ? `${z.key} · ${n}× in last 30 nights` : z.key} />;
                          })}
                        </div>

                        {rrLocs.length > 0 && (
                          <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(rrLocs.length, 5)}, 1fr)` }}>
                            {rrLocs.map((loc) => {
                              const n = spreadCountFor(loc.ui);
                              return <PlacementCell key={loc.ui} label={loc.label} spreadCount={n} title={n > 0 ? `${loc.ui} · ${n}× in last 30 nights` : loc.ui} />;
                            })}
                          </div>
                        )}

                        {auxLocs.length > 0 && (
                          <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(auxLocs.length, 5)}, 1fr)` }}>
                            {auxLocs.map((loc) => {
                              const n = spreadCountFor(loc.ui);
                              return <PlacementCell key={loc.ui} label={loc.label} spreadCount={n} title={n > 0 ? `${loc.ui} · ${n}× in last 30 nights` : loc.ui} />;
                            })}
                          </div>
                        )}

                        <p className="mt-2.5 mb-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-neutral-400">Last 5</p>
                        <div className="grid grid-cols-5 gap-1">
                          {last5Pills.map((ui, i) => {
                            if (!ui) {
                              return <span key={`empty-${i}`} className="flex h-[22px] items-center justify-center rounded-md border border-dashed border-black/[0.08] bg-transparent text-[9px] text-neutral-300">—</span>;
                            }
                            const pillAccent = getPillAccent(ui);
                            const pillLabel = formatPlacementUiLabel(ui);
                            return (
                              <motion.div
                                key={`${ui}-${i}`}
                                title={ui}
                                className="flex h-[22px] items-center justify-center rounded-md text-[9px] font-bold tabular-nums"
                                style={{ background: `${pillAccent}22`, border: `1px solid ${pillAccent}55`, color: pillAccent }}
                                whileHover={{ scale: 1.08, y: -1, transition: premiumSpring }}
                                whileTap={{ scale: 0.95, transition: premiumTap }}
                              >
                                {pillLabel}
                              </motion.div>
                            );
                          })}
                        </div>
                      </>
                    )}
                      </>
                    )}
                  </div>
                )}

                {insightsEnabled && analystDetailsOpen && hasProv && prov.rationale && (
                  <p className="mt-2 text-[8px] text-neutral-400 leading-snug" title={prov.rationale}>Engine: {prov.rationale}</p>
                )}
              </div>
            )}
            </>
            ) : null}
          </div>
        )}
      </div>

      {(isDock || (!showTmPicker && !coverageMode)) && (
        <div className="sb-pad-actions grid grid-cols-4 gap-1 border-t border-black/[0.06] bg-neutral-50/50 p-1.5 shrink-0">
          {(
            [
              { label: a.isLocked ? "Locked" : "Lock", onClick: () => onToggleLock?.(slotKey), variant: "default" as const },
              { label: "Clear", onClick: () => onLiveUnassign?.(slotKey), variant: "danger" as const },
              {
                label: "Coverage",
                onClick: () => {
                  setCoverageMode(true);
                  onDockTabChange?.("tasks");
                },
                variant: "default" as const,
              },
              {
                label: "Swap",
                onClick: () => {
                  setAssignMode(true);
                  onDockTabChange?.("assign");
                },
                variant: "default" as const,
              },
            ] as const
          ).map((btn) => (
            <motion.button
              key={btn.label}
              type="button"
              disabled={isCurrentNightLocked}
              onClick={btn.onClick}
              className={`rounded-lg font-semibold tracking-tight disabled:opacity-40 ${
                padLarge ? "h-11 text-[15px]" : "h-7 text-[9px]"
              } ${
                btn.variant === "danger"
                  ? "border border-red-200/80 bg-red-50 text-red-600 hover:bg-red-100/80"
                  : "border border-black/[0.08] bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
              {...premiumButton}
              transition={premiumSpring}
            >
              {btn.label}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );

  if (isDock) {
    return padEl;
  }

  if (usePortal && typeof document !== "undefined") {
    const portalContent = tabletBottomSheet ? (
      <>
        <div
          className="sb-pad-backdrop no-print"
          role="presentation"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        />
        {padEl}
      </>
    ) : (
      padEl
    );
    return createPortal(portalContent, document.body);
  }
  return padEl;
};

export default PlacementPad;