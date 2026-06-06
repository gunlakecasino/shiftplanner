"use client";

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NightSlotTask, ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { normalizeGender, isEligibleForSlot } from "@/lib/shiftbuilder/placement";
import type { PlacementPadInsight, XaiFit } from "@/lib/shiftbuilder/placementPadInsightSchema";
import {
  fitVerdictLabel,
  fitVerdictStyles,
} from "@/lib/shiftbuilder/placementPadInsightSchema";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import { computeSlotPlacementFit } from "./placementFitForSlot";
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

export interface PlacementPadProps {
  slotKey: string;
  anchor: PlacementPadAnchor;
  /** Host card wrapper — portaled pad positions from [data-placement-host] rect. */
  hostId?: string;
  onClose: () => void;
  assignments: Record<string, any>;
  selectedTasks: Record<string, NightSlotTask[]>;
  selectedDay: DayDef;
  members?: any[];
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
  onAssignSweeper?: (slotKey: string, sweeperLabel: string) => void | Promise<void>;
  onRequestEngineInsight?: (slotKey: string, context?: string | Record<string, unknown>) => Promise<string>;
  scheduledUnassigned?: TmEntry[];
  allEligibleTms?: TmEntry[];
  onAddOnCall?: (tmId: string, tmName: string) => void | Promise<void>;
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
  /** Callback to report xAI structured fit (headline, verdict) for surfacing magic one line + override in card corner chips. */
  onXaiFit?: (hostId: string, xai: XaiFit) => void;
}

const PAD_W = 272;
/** Max pad height — fits iPad landscape with internal scroll for overflow */
const PAD_MAX_HEIGHT = 600;
const TABLET_SHEET_HEIGHT_RATIO = 0.45;
const TABLET_SHEET_MAX_HEIGHT = 520;

function computeTabletBottomSheetStyle(): React.CSSProperties {
  const vv = window.visualViewport;
  const h = vv?.height ?? window.innerHeight;
  const maxH = Math.min(Math.round(h * TABLET_SHEET_HEIGHT_RATIO), TABLET_SHEET_MAX_HEIGHT);
  return {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
    zIndex: 200,
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

function usePortalPlacementStyle(
  hostId: string | undefined,
  anchor: PlacementPadAnchor,
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
          ? computeTabletBottomSheetStyle()
          : computePortalStyle(hostId, anchor),
      );
    });
  }, [hostId, anchor, tabletSheet]);

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-neutral-400">
      {children}
    </span>
  );
}

function PlacementAnalystBlock({
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
}) {
  const headerStyles = fitVerdictStyles(prerendered.fitVerdict);
  const showXaiBody = detailsOpen && (loading || text || structured);
  const xaiOverridesInstant =
    !!structured &&
    (structured.fitVerdict !== prerendered.fitVerdict ||
      structured.fitSummary.trim() !== prerendered.fitSummary.trim());
  const xaiHeaderStyles = structured
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
        {/* ONLY the XAI Determination shows in the quick view (per request).
            Headline + 4-6 bullet synthesis from the fast light model (vast context).
            Engine baseline and raw rotation lists are suppressed here.
            "Full 4.3 analysis" button reveals the complete deep 4.3 content. */}
        {!detailsOpen && structured?.headline && (
          <div 
            className="mb-2 rounded-2xl border border-[#2F5C7C]/20 bg-white/95 px-4 py-3.5 text-[9px] shadow-[0_6px_18px_rgba(0,0,0,0.09),_inset_0_1px_0_rgba(255,255,255,0.85)]"
            style={{ borderLeft: '4px solid #2F5C7C44', backdropFilter: 'blur(12px) saturate(145%)' }} // richer liquid glass + stronger editorial ink bar — part of the cohesive authoring veil on the living sheet
          >
            <div className="flex items-baseline gap-1.5 mb-1.5">
              <span style={{ fontSize: "11px", color: '#2F5C7C' }}>✧</span>
              <span
                className="font-semibold tracking-[0.3px] uppercase text-[#2F5C7C]"
                style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))", fontSize: "8px" }}
              >
                xAI determination (fast • board + week)
              </span>
              {(structured as any).bullets && (structured as any).bullets.length > 0 && (
                <span 
                  className="ml-auto text-[6px] font-medium tracking-[0.4px] px-1.5 py-0.5 rounded-full bg-[#2F5C7C]/8 text-[#2F5C7C]/75"
                  style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
                >
                  4–6 insights
                </span>
              )}
            </div>

            {/* The magic one-liner headline — now the clear hero of the entire quick pad view */}
            <p
              className="font-semibold text-neutral-950 tracking-[-0.25px] leading-snug mb-2.5 text-[10.5px]"
              style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
            >
              {structured.headline}
            </p>

            {/* The 4-6 xAI powered bullets — synthesized from the full vast context including the new boardAndWeekContext (full current artboard placements + this week's rotation health, gaps, swaps across the board). This is now the *only* insight surface shown in the quick pad view. */}
            {(structured as any).bullets && (structured as any).bullets.length > 0 && (
              <ul className="space-y-[2px] pl-0.5 text-[8.5px] leading-[1.25] text-neutral-800">
                {(structured as any).bullets.slice(0, 6).map((b: string, i: number) => (
                  <li key={i} className="flex gap-1.5">
                    <span className="text-[#2F5C7C]/50 mt-[1.5px] flex-shrink-0 select-none" style={{ fontSize: "7.5px" }}>◆</span>
                    <span style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}>{b}</span>
                  </li>
                ))}
              </ul>
            )}

            {/* Evidence / signals for the light xAI determination (first slice of reasoning deep dive).
                Uses context the fast model already received (rotation, spread, training examples).
                Optional, collapsed by default to protect the headline + bullets as the hero.
                All digital authoring veil only (no-print / showDigitalAssists). */}
            {(structured as any).bullets && (structured as any).bullets.length > 0 && (
              <div className="mt-2 -mx-1 border-t border-[#2F5C7C]/10 pt-1.5">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEvidenceOpen?.(!evidenceOpen);
                  }}
                  className="sb-interactive w-full flex items-center justify-between text-[7px] font-medium tracking-[0.15px] text-[#2F5C7C]/75 hover:text-[#2F5C7C] px-0.5"
                  style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
                >
                  <span>
                    ✧ Key signals
                    {(padGoodExamples?.length ?? 0) > 0 ? ` · ${padGoodExamples!.length} shaped by your Gold` : ''}
                  </span>
                  <span>{evidenceOpen ? '−' : '+'}</span>
                </button>

                {evidenceOpen && (
                  <div className="mt-1 pl-0.5 text-[7px] leading-[1.2] text-neutral-600 space-y-px">
                    {slotSpreadCount !== undefined && analystSlotKey && (
                      <div>This TM on {analystSlotKey}: {slotSpreadCount}× in last 30 nights (spread freshness)</div>
                    )}
                    {rotationGapsLine && (
                      <div>Week gaps affecting this: {rotationGapsLine.slice(0, 65)}{rotationGapsLine.length > 65 ? '…' : ''}</div>
                    )}
                    {(padGoodExamples?.length ?? 0) > 0 && (
                      <div>{padGoodExamples!.length} of your Gold examples injected as few-shots (training signal)</div>
                    )}
                    <div>Model also received: current board fill, weekly rotation health, neighbor exposure, slot tasks, strict fill-order + graves schedule rules.</div>
                    {(padGoodExamples?.length ?? 0) > 0 && onClearTraining && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onClearTraining();
                        }}
                        className="mt-0.5 text-[6.5px] text-[#2F5C7C]/60 hover:text-[#2F5C7C] underline"
                      >
                        Clear this session’s Gold examples
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Integrated Expand Matrix affordance — now a seamless editorial bottom bar inside the XAI determination box (not tacked-on). Matches the liquid glass family, ink blue, active scale. Exact phrasing for the last 30 spread + last 5 placements view. When toggled the matrix below feels like refined data poetry. */}
            {(structured as any).bullets && (structured as any).bullets.length > 0 && (
              <div className="mt-3 -mx-1 border-t border-[#2F5C7C]/10 pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleMatrix?.();
                  }}
                  className="sb-interactive inline-flex items-center gap-1 rounded-lg border border-[#2F5C7C]/15 bg-white/60 px-2.5 py-0.5 text-[7.5px] font-medium tracking-[0.15px] text-[#2F5C7C] hover:bg-white/90 hover:border-[#2F5C7C]/30"
                  style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
                >
                  <span>⤢</span> {(matrixExpanded ?? false) ? 'Collapse' : 'Expand'} Matrix (last 30 spread + last 5 placements)
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {!detailsOpen ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMoreDetails();
              }}
              disabled={loading}
              className="sb-interactive rounded-full border border-[#2F5C7C]/25 bg-[#F8FAFC] px-2.5 py-0.5 text-[9px] font-medium tracking-[0.1px] text-[#2F5C7C] hover:bg-white hover:border-[#2F5C7C]/40 disabled:opacity-60"
              style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
            >
              {loading ? (
                <BuilderBusyLabel className="text-[9px]">Loading insight</BuilderBusyLabel>
              ) : (structured as any)?.bullets?.length ? "Deep 4.3 analysis (narrative • neighbors • swaps • ranked)" : structured?.headline ? "Deep 4.3 analysis (narrative • neighbors • swaps • ranked)" : "✧  xAI insight"}
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
                {fitVerdictLabel(structured.fitVerdict)}
              </span>
              <span className="text-[7px] font-medium uppercase tracking-wide text-neutral-400">
                xAI updated
              </span>
            </div>
            <p
              className="text-[10px] font-semibold leading-snug"
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
          <div className="mt-1.5 space-y-2 text-[9px] leading-snug text-neutral-700">
            {/* Deep view also surfaces the key signals / evidence basis (iterated from light path).
                Grounds the rich whyTonight, swaps, etc. in the same concrete rotation/spread/training context the model received.
                Consistent with the light "Key signals" panel. Digital veil only. */}
            {(padGoodExamples?.length ?? 0) > 0 || rotationGapsLine || slotSpreadCount !== undefined ? (
              <div className="mb-1.5 p-1.5 rounded-lg border border-[#2F5C7C]/10 bg-white/60 text-[7.5px] leading-snug">
                <div className="font-medium tracking-[0.15px] text-[#2F5C7C]/80 mb-0.5">✧ Key signals (basis for this analysis)</div>
                {slotSpreadCount !== undefined && analystSlotKey && (
                  <div>This TM on {analystSlotKey}: {slotSpreadCount}× in last 30 nights (spread freshness)</div>
                )}
                {rotationGapsLine && (
                  <div>Week gaps: {rotationGapsLine.slice(0, 70)}{rotationGapsLine.length > 70 ? '…' : ''}</div>
                )}
                {(padGoodExamples?.length ?? 0) > 0 && (
                  <div>{padGoodExamples!.length} Gold examples from this session injected as few-shots</div>
                )}
                <div>Full context: board + week health, TM trail, tasks, fill-order contract, graves schedule filter.</div>
                {(padGoodExamples?.length ?? 0) > 0 && onClearTraining && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearTraining();
                    }}
                    className="mt-0.5 text-[6.5px] text-[#2F5C7C]/60 hover:text-[#2F5C7C] underline"
                  >
                    Clear session Gold examples
                  </button>
                )}
              </div>
            ) : null}

            <div>
              <p className="text-[8px] font-semibold uppercase tracking-wide text-neutral-400">
                Tonight
              </p>
              {/* The "magic one line" — presented here with editorial weight and the same Atkinson family + ✧ language used on the cards in builder veil. Feels like the same artistic annotation, just expanded. */}
              <p 
                className="mt-0.5 font-medium text-neutral-900 tracking-[-0.1px]" 
                style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
              >
                <span className="opacity-50 mr-1" style={{ fontSize: "8px" }}>✧</span>
                {structured.headline}
              </p>
              <p className="mt-0.5 text-neutral-600">{structured.whyTonight}</p>
            </div>
            {structured.rotationNote && (
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-wide text-neutral-400">
                  Rotation
                </p>
                <p className="mt-0.5 text-neutral-600">{structured.rotationNote}</p>
              </div>
            )}
            {structured.neighborDynamics && (
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-wide text-neutral-400">
                  Neighbors
                </p>
                <p className="mt-0.5 text-neutral-600">{structured.neighborDynamics}</p>
              </div>
            )}
            {structured.swapRecommendations.length > 0 && (
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-wide text-neutral-400">
                  Swap lanes
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {structured.swapRecommendations.map((s, i) => (
                    <li key={i} className="text-neutral-600">
                      {s.priority === "high" ? "★ " : s.priority === "medium" ? "· " : "○ "}
                      {s.summary}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {structured.watchouts.length > 0 && (
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-wide text-amber-700/90">
                  Watchouts
                </p>
                <ul className="mt-0.5 list-disc pl-3 text-neutral-600">
                  {structured.watchouts.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
            {structured.rankedAssignees && structured.rankedAssignees.length > 0 && (
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-wide text-neutral-400">
                  Best picks
                </p>
                <ol className="mt-0.5 space-y-0.5 pl-3 list-decimal text-neutral-600">
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
    <span
      title={title ?? label}
      className="flex h-[22px] items-center justify-center rounded-md text-[9px] font-bold tabular-nums transition-colors"
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
    >
      {label}
    </span>
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
            .map((aux) => ({
              key: aux.key,
              label: (aux.label || aux.key).replace(/ .*/, "").slice(0, 5),
              color: getAuxAccent(aux.key),
            })),
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
    </div>
  );
}

const PlacementPad: React.FC<PlacementPadProps> = ({
  slotKey,
  anchor,
  hostId,
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
  onAssignSweeper,
  onRequestEngineInsight,
  scheduledUnassigned = [],
  allEligibleTms,
  onAddOnCall,
  boardPrerenderedFit,
  isDraftMode = false,
  draftAssignments = {},
  onXaiFit,
}) => {
  const { label, accent } = getSlotMeta(slotKey);
  const a = assignments[slotKey] || {};
  const prov = a.provenance || {};
  const hasProv = !!(prov.rationale || (prov.fairnessSignals && Object.keys(prov.fairnessSignals).length > 0));
  const tasks = (selectedTasks[slotKey] || []).filter((t) => !t.isCoverage);

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
  const portalStyle = usePortalPlacementStyle(hostId, anchor);
  const tabletBottomSheet = isTabletTouchDevice() && !!hostId && !!portalStyle;
  const usePortal = !!hostId && !!portalStyle;

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
  }, [slotKey]);

  useEffect(() => {
    if (analystDetailsOpen) setMatrixExpanded(false);
  }, [analystDetailsOpen]);

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

  const handlePickTm = useCallback(
    (tm: TmEntry) => {
      if (!onAssign) return;
      onAssign(slotKey, tm.tmId, tm.tmName);
      setAssignConfirmed(true);
      setTimeout(() => {
        setAssignMode(false);
        setAssignConfirmed(false);
      }, 700);
    },
    [slotKey, onAssign],
  );

  const handleAddTask = () => {
    const lbl = taskInput.trim();
    if (!lbl || !onAddTask) return;
    setTaskInput("");
    void onAddTask(slotKey, lbl);
    setTimeout(() => taskInputRef.current?.focus(), 0);
  };

  const showTmPicker = onAssign && (!a.tmId || assignMode);
  const currentIso = nightIsoFromDate(selectedDay.date);
  const spreadKeys = getSpreadPlacementKeys(padHistory, PLACEMENT_SPREAD_NIGHTS, currentIso);
  const spreadCounts = getSpreadPlacementCounts(padHistory, PLACEMENT_SPREAD_NIGHTS, currentIso);
  const placedSet = new Set(spreadKeys);
  const spreadCountFor = (ui: string) => spreadCounts.get(ui) ?? 0;

  const rrLocs = RR_DEFS.flatMap((d) => {
    const tmId = a?.tmId;
    const rawGender =
      members?.find((m: any) => m.id === tmId || m.tmId === tmId || m.tm_id === tmId)?.gender ?? null;
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

  const last5Sequence = getLastPlacementSequence(padHistory, LAST5_COUNT, currentIso);
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

  const timesInSpread = spreadCountFor(slotKey);
  const slotHistorySummary = a.tmId
    ? timesInSpread > 0
      ? `${timesInSpread}× in last ${PLACEMENT_SPREAD_NIGHTS} nights; in last-5 trail: ${last5Sequence.includes(slotKey) ? "yes" : "no"}`
      : `Not in last ${PLACEMENT_SPREAD_NIGHTS}-night spread`
    : undefined;

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

  const prerenderedFit = React.useMemo((): PrerenderedPlacementFit => {
    if (boardPrerenderedFit) return boardPrerenderedFit;
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
      candidateProfiles: a.tmName ? undefined : buildCandidateProfiles(),
      preferredCandidateIds: a.tmName ? undefined : preferredCandidateIds,
    });
    return fit;
  }, [
    boardPrerenderedFit,
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
      slotTasksSummary: (selectedTasks[slotKey] || []).map((t: any) => t.label || t.name || t.id).slice(0, 3).join(" + ") || undefined,
      boardCoreSnapshot: boardNeighborSummary || undefined,
      // One more layer of vast context for the light determination
      currentBreakGroup: (assignments[slotKey] as any)?.breakGroup ?? undefined,
      hasCoverageTasks: (selectedTasks[slotKey] || []).some((t: any) => t.isCoverage) ? "yes" : undefined,

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
            const exp = spreadCountFor ? spreadCountFor(k) : 0;
            return `${k}:${v.tmName}${exp ? `(${exp}× this week)` : ''}`;
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
        const filledCount = Object.values(assignments).filter((v: any) => !!v?.tmName).length;
        const totalSlots = Object.keys(assignments).length;
        parts.push(`BOARD FILL THIS NIGHT: ${filledCount}/${totalSlots} slots have a TM right now`);

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
      currentIso,
      prerenderedFit.fitVerdict,
      prerenderedFit.fitSummary,
      prerenderedFit.fitFactLine,
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
        if (onXaiFit && data.structured) {
          onXaiFit(hostId || slotKey, {
            fitVerdict: data.structured.fitVerdict,
            fitSummary: data.structured.fitSummary,
            headline: data.structured.headline,
          });
        }
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
      if (onXaiFit && data.structured) {
        onXaiFit(hostId || slotKey, {
          fitVerdict: data.structured.fitVerdict,
          fitSummary: data.structured.fitSummary,
          headline: data.structured.headline,
        });
      }
      if (data && !data.cached && data.usage) {
        try {
          useShiftBuilderStore.getState().addAiUsage(data.usage);
        } catch {}
      }
    } catch {
      // Silent fail is fine — prerender + rotation are still authoritative; cards just won't get xAI line yet.
    }
  }, [a.tmName, buildInsightContext, hostId, slotKey, onXaiFit]);

  // Auto-run the light headline determination once per pad open for assigned TMs.
  // This is the key UX refinement: the magic one-liner now appears in the builder surfaces (cards)
  // as soon as you click a card to open its pad, using a cheap fast-model call.
  React.useEffect(() => {
    if (!a.tmName || analystDetailsOpen || insightStructured?.headline || padHistoryLoading) return;
    // Smaller delay; wait for history so context (spread/last5/rotation) is ready for better bullets + less choppy re-renders before grok appears.
    const t = setTimeout(() => {
      void runLightDetermination();
    }, 50);
    return () => clearTimeout(t);
  }, [a.tmName, analystDetailsOpen, insightStructured?.headline, padHistoryLoading, runLightDetermination]);

  useEffect(() => {
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
  ]);



  const padEl = (
    <div
      className={`placement-pad sb-pad-enter no-print ${usePortal ? "fixed" : anchorClass(anchor)} ${tabletBottomSheet ? "sb-tablet-bottom-sheet" : ""} z-[60] flex flex-col overflow-hidden rounded-2xl border border-white/40 dark:border-white/10 bg-white/95 dark:bg-zinc-950/95 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.32),0_2px_4px_-1px_rgba(0,0,0,0.06),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-[28px]`}
      style={
        usePortal
          ? portalStyle!
          : { width: PAD_W, maxHeight: PAD_MAX_HEIGHT, display: "flex", flexDirection: "column" }
      }
      onClick={(e) => e.stopPropagation()}
    >
      {/* Accent rail */}
      <div
        className="absolute top-3 h-10 w-[3px] rounded-full"
        style={{
          [railSide]: -1,
          background: accent,
          boxShadow: `0 0 10px ${accent}66`,
        }}
      />

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="sb-pad-close absolute top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-black/[0.06] bg-neutral-100/80 text-neutral-400 text-sm hover:bg-neutral-200/80 hover:text-neutral-600"
        style={{ [closeSide]: 8 }}
        aria-label="Close"
      >
        ×
      </button>

      {/* Header — fixed, never scrolls away */}
      <div className="shrink-0">
        <div className="flex items-center gap-2.5 px-3.5 pt-3 pb-2 pr-10">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ background: a.tmName ? accent : "rgba(0,0,0,0.08)", color: a.tmName ? "#fff" : "#999" }}
          >
            {a.tmName ? a.tmName[0].toUpperCase() : "–"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: accent }}>
              {label}
            </div>
            <div className="truncate text-[15px] font-bold tracking-tight text-neutral-900">
              {a.tmName || "Unassigned"}
            </div>
          </div>
          {a.breakGroup != null && a.breakGroup > 0 && (
            <div className="shrink-0 text-center">
              <div className="text-[7px] font-bold uppercase tracking-widest text-neutral-400">Brk</div>
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

      {/* Body — only this region scrolls when content is tall */}
      <div
        className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${
          showTmPicker ? "min-h-[300px]" : ""
        }`}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {showTmPicker ? (
          <div className="flex h-full min-h-[280px] flex-col px-2.5 py-2">
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
              onCancel={a.tmId ? () => setAssignMode(false) : undefined}
              confirmed={assignConfirmed}
              accent={accent}
              isDark={false}
            />
          </div>
        ) : coverageMode ? (
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
            {!a.tmName && (
              <div className="px-3 pt-2 pb-1 space-y-2">
                <button
                  type="button"
                  disabled={isCurrentNightLocked}
                  onClick={() => setAssignMode(true)}
                  className="w-full rounded-lg py-2 text-[11px] font-semibold text-white disabled:opacity-50"
                  style={{ background: accent }}
                >
                  Assign team member
                </button>
              </div>
            )}

            {/* Tasks */}
            <div className="px-3 pt-2.5 pb-1">
              <div className="flex items-center justify-between mb-1.5">
                <SectionLabel>
                  Tasks{tasks.length > 0 ? ` · ${tasks.length}` : ""}
                </SectionLabel>
                {onAssignSweeper && (
                  <button
                    type="button"
                    onClick={() => setSweeperOpen((v) => !v)}
                    className="rounded-md border border-black/[0.08] bg-neutral-50 px-2 py-0.5 text-[9px] font-semibold text-neutral-500 hover:bg-neutral-100"
                  >
                    Sweeper
                  </button>
                )}
              </div>

              {sweeperOpen && onAssignSweeper && (
                <div className="mb-1.5 flex flex-col gap-1">
                  {["Sweep 5/8/HL", "Sweep 9/10/SR"].map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        void onAssignSweeper(slotKey, opt);
                        setSweeperOpen(false);
                      }}
                      className="rounded-lg border border-amber-200/80 bg-amber-50 px-2.5 py-1.5 text-left text-[10px] font-semibold text-amber-700 hover:bg-amber-100/80"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {tasks.length > 0 && (
                <div className="mb-1.5 flex flex-col gap-1">
                  {tasks.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 rounded-lg border border-black/[0.06] bg-neutral-50/90 px-2 py-1.5"
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-sm"
                        style={{ background: t.color ?? accent }}
                      />
                      <span className="flex-1 truncate text-[11px] font-medium text-neutral-800">
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
                    </div>
                  ))}
                </div>
              )}

              {onAddTask && (
                <div className="flex gap-1.5">
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
                    className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-white px-2.5 py-1.5 text-[11px] text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-black/[0.06]"
                  />
                  {taskInput.trim() && (
                    <button
                      type="button"
                      onClick={handleAddTask}
                      className="shrink-0 rounded-lg px-2.5 text-[10px] font-bold text-white"
                      style={{ background: accent }}
                    >
                      Add
                    </button>
                  )}
                </div>
              )}
            </div>

            <PlacementAnalystBlock
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
                if (onXaiFit) onXaiFit(hostId || slotKey, null);
                // Also reset light run so next pad open can re-determine fresh if needed.
                lightRunRef.current = 0;
              }}
            />

            {a.tmName && (analystDetailsOpen || matrixExpanded || !( !analystDetailsOpen && insightStructured?.headline )) && (
              <div className="border-t border-black/[0.05] px-3 py-2.5">
                {/* The synthesized 4-6 bullet list lives in the xAI determination box above.
                    Raw rotation list kept below for reference (the "combined" request is addressed by the bullets). */}
                {analystDetailsOpen && (
                  padHistoryLoading && !rotationDisplay ? (
                    <BuilderLoadingLine className="text-[10px]">Loading placement history</BuilderLoadingLine>
                  ) : rotationDisplay ? (
                    <>
                      <SectionLabel>Rotation · 30 nights</SectionLabel>
                      <div className="mt-1 space-y-1 text-[10px] leading-snug text-neutral-700">
                        {rotationDisplay.gapsLine && <p>{rotationDisplay.gapsLine}</p>}
                        {rotationDisplay.swapLines.length > 0 && (
                          <div>
                            <p className="text-[8px] font-semibold uppercase tracking-wide text-neutral-400">
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

                {(analystDetailsOpen || matrixExpanded) && (
                  <>
                    {/* In quick XAI view the matrix header is editorial/poetic to match the determination box language; full details keeps the compact SectionLabel. */}
                    {!analystDetailsOpen ? (
                      <div className="text-[10px] font-medium tracking-[0.3px] text-[#2F5C7C]/80 mb-1" style={{ fontFamily: 'var(--font-atkinson, var(--font-ui, system-ui))' }}>
                        Matrix · last 30 nights (spread) + last 5 placements
                      </div>
                    ) : (
                      <SectionLabel>Matrix</SectionLabel>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 font-mono text-[10px]">
                  <span>
                    <span className="font-semibold" style={{ color: accent }}>
                      RR
                    </span>{" "}
                    <span className="font-bold text-neutral-800">{rrCount}</span>
                  </span>
                  <span className="text-neutral-300">|</span>
                  <span>
                    <span className="font-semibold text-neutral-400">Zone</span>{" "}
                    <span className="font-bold text-neutral-800">{zoneCount}</span>
                  </span>
                  <span className="text-neutral-300">|</span>
                  <span>
                    <span className="font-semibold" style={{ color: Z9_STAT_RED }}>
                      Z9
                    </span>{" "}
                    <span className="font-bold text-neutral-800 tabular-nums">{z9Days}</span>
                  </span>
                  <span>
                    <span className="font-semibold" style={{ color: Z9_STAT_RED }}>
                      Z9SR
                    </span>{" "}
                    <span className="font-bold text-neutral-800 tabular-nums">{z9srDays}</span>
                  </span>
                </div>

                <p className="mt-2.5 mb-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
                  Last 30 Spread
                </p>
                    <div className="mb-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[8px] text-neutral-400">
                      <span className="inline-flex items-center gap-0.5">
                        <span
                          className="h-2 w-3 rounded border"
                          style={{
                            background: "#16a34a22",
                            borderColor: "#16a34a55",
                          }}
                        />
                        1×
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <span
                          className="h-2 w-3 rounded border"
                          style={{
                            background: "#ea580c22",
                            borderColor: "#ea580c55",
                          }}
                        />
                        2×
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <span
                          className="h-2 w-3 rounded border"
                          style={{
                            background: "#dc262622",
                            borderColor: "#dc262655",
                          }}
                        />
                        3×+
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        <span className="h-2 w-3 rounded border border-dashed border-neutral-400/50 bg-neutral-200/60" />
                        not in spread
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-1">
                      {ZONE_DEFS.map((z) => {
                        const n = spreadCountFor(z.key);
                        return (
                          <PlacementCell
                            key={z.key}
                            label={z.key}
                            spreadCount={n}
                            title={n > 0 ? `${z.key} · ${n}× in last 30 nights` : z.key}
                          />
                        );
                      })}
                    </div>

                    {rrLocs.length > 0 && (
                      <div
                        className="mt-1 grid gap-1"
                        style={{ gridTemplateColumns: `repeat(${Math.min(rrLocs.length, 5)}, 1fr)` }}
                      >
                        {rrLocs.map((loc) => {
                          const n = spreadCountFor(loc.ui);
                          return (
                            <PlacementCell
                              key={loc.ui}
                              label={loc.label}
                              spreadCount={n}
                              title={n > 0 ? `${loc.ui} · ${n}× in last 30 nights` : loc.ui}
                            />
                          );
                        })}
                      </div>
                    )}

                    {auxLocs.length > 0 && (
                      <div
                        className="mt-1 grid gap-1"
                        style={{ gridTemplateColumns: `repeat(${Math.min(auxLocs.length, 5)}, 1fr)` }}
                      >
                        {auxLocs.map((loc) => {
                          const n = spreadCountFor(loc.ui);
                          return (
                            <PlacementCell
                              key={loc.ui}
                              label={loc.label}
                              spreadCount={n}
                              title={n > 0 ? `${loc.ui} · ${n}× in last 30 nights` : loc.ui}
                            />
                          );
                        })}
                      </div>
                    )}

                    <p className="mt-2.5 mb-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-neutral-400">
                      Last 5
                    </p>
                    <div className="grid grid-cols-5 gap-1">
                      {last5Pills.map((ui, i) => {
                        if (!ui) {
                          return (
                            <span
                              key={`empty-${i}`}
                              className="flex h-[22px] items-center justify-center rounded-md border border-dashed border-black/[0.08] bg-transparent text-[9px] text-neutral-300"
                            >
                              —
                            </span>
                          );
                        }
                        const pillAccent = getPillAccent(ui);
                        const pillLabel = formatPlacementUiLabel(ui);
                        return (
                          <span
                            key={`${ui}-${i}`}
                            title={ui}
                            className="flex h-[22px] items-center justify-center rounded-md text-[9px] font-bold tabular-nums"
                            style={{
                              background: `${pillAccent}22`,
                              border: `1px solid ${pillAccent}55`,
                              color: pillAccent,
                            }}
                          >
                            {pillLabel}
                          </span>
                        );
                      })}
                    </div>
                  </>
                )}

                    {analystDetailsOpen && hasProv && prov.rationale && (
                      <p
                        className="mt-2 text-[8px] text-neutral-400 leading-snug"
                        title={prov.rationale}
                      >
                        Engine: {prov.rationale}
                      </p>
                    )}
              </div>
            )}
          </div>
        )}
      </div>

      {!showTmPicker && !coverageMode && (
        <div className="grid grid-cols-4 gap-1 border-t border-black/[0.06] bg-neutral-50/50 p-1.5 shrink-0">
          {(
            [
              { label: a.isLocked ? "Locked" : "Lock", onClick: () => onToggleLock?.(slotKey), variant: "default" as const },
              { label: "Clear", onClick: () => onLiveUnassign?.(slotKey), variant: "danger" as const },
              { label: "Coverage", onClick: () => setCoverageMode(true), variant: "default" as const },
              { label: "Swap", onClick: () => setAssignMode(true), variant: "default" as const },
            ] as const
          ).map((btn) => (
            <button
              key={btn.label}
              type="button"
              disabled={isCurrentNightLocked}
              onClick={btn.onClick}
              className={`h-7 rounded-lg text-[9px] font-semibold tracking-tight disabled:opacity-40 ${
                btn.variant === "danger"
                  ? "border border-red-200/80 bg-red-50 text-red-600 hover:bg-red-100/80"
                  : "border border-black/[0.08] bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );

  if (usePortal && typeof document !== "undefined") {
    return createPortal(padEl, document.body);
  }
  return padEl;
};

export default PlacementPad;