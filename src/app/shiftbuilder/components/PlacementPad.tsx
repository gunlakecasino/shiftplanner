"use client";

import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { X, Plus, Sparkles } from "lucide-react";
import type { NightSlotTask, ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { normalizeGender } from "@/lib/shiftbuilder/placement";
import type { PlacementPadInsight } from "@/lib/shiftbuilder/placementPadInsightSchema";
import {
  fitVerdictLabel,
  fitVerdictStyles,
} from "@/lib/shiftbuilder/placementPadInsightSchema";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import { computeSlotPlacementFit } from "./placementFitForSlot";
import { getTmWeekRepeatForSlotThroughNight } from "./shiftRotationHealth";
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
import { getSlotMeta, TmPicker, type TmEntry } from "./MarkerPad";
import type { PickerTmRotationFit } from "../hooks/usePickerRotationSort";
import { useShiftBuilderStore } from "../store/useShiftBuilderStore";
import { tabletHaptic } from "@/lib/shiftbuilder/tabletHaptic";
import {
  placeFixedPopover,
  readViewportHeight,
} from "@/lib/shiftbuilder/viewportLock";
import {
  PLACEMENT_SPREAD_NIGHTS,
  PLACEMENT_HISTORY_FETCH_CALENDAR_DAYS,
  getSpreadPlacementKeys,
  getSpreadPlacementCounts,
  MATRIX_SPREAD_ONCE,
  MATRIX_SPREAD_TWICE,
  MATRIX_SPREAD_THRICE_PLUS,
  MATRIX_SPREAD_NONE,
  getLastPlacementSequence,
  getDaysSinceForKey,
  formatPlacementUiLabel,
  nightIsoFromDate,
  buildMatrixSlotKeysForTm,
  computePlacementRotationBasics,
  formatPlacementRotationDisplay,
  formatRotationBriefForAnalyst,
  spreadCountForRepeatKey,
  type PlacementRotationBasics,
  type PlacementRotationDisplay,
  type PlacementTmProfile,
} from "./placementPadHelpers";
import { memberToPlacementProfile } from "./placementFitForSlot";
import { postEngineInsight } from "../lib/engineInsightClient";
import { BuilderLoadingLine } from "./builderPrimitives";

/* ── Refined visual tokens & helpers (from Refined Placement Pad) ─────────── */
type ExposureLevel = 0 | 1 | 2 | 3;

function LegendDot({ color }: { color: string }) {
  return <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />;
}

function matrixSpreadPillStyle(exposure: ExposureLevel): React.CSSProperties {
  if (exposure === 0) {
    return {
      border: `1px dashed ${MATRIX_SPREAD_NONE}`,
      color: "#9CA3AF",
      background: "white",
    };
  }
  const base =
    exposure === 1
      ? MATRIX_SPREAD_ONCE
      : exposure === 2
        ? MATRIX_SPREAD_TWICE
        : MATRIX_SPREAD_THRICE_PLUS;
  const bgAlpha = exposure === 1 ? "22" : exposure === 2 ? "30" : "3A";
  return {
    border: `2px solid ${base}`,
    color: base,
    background: `${base}${bgAlpha}`,
  };
}

function InlineCoverage({ sourceKey, auxDefs, onPick, onCancel }: { sourceKey: string; auxDefs: AuxDef[]; onPick: (target: string) => void; onCancel: () => void }) {
  const handleCustomSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.elements.namedItem("customCoverage") as HTMLInputElement | null;
    const val = input?.value.trim();
    if (val) {
      onPick(`custom:${val}`);
      if (input) input.value = "";
    }
  };

  const isSelfCoverage = (key: string) => {
    if (key === sourceKey) return true;
    // RR sides: if source is one side, other side of same RR is also "self" for coverage logic? (rare)
    if (sourceKey.startsWith("MRR") || sourceKey.startsWith("WRR")) {
      const num = sourceKey.replace(/^[MW]RR/, "");
      if (key === `MRR${num}` || key === `WRR${num}`) return true;
    }
    return false;
  };

  return (
    <div className="border-t border-black/[0.06] bg-neutral-50/80 px-3 py-2.5 flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-neutral-700">Add coverage</span>
        <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-600 text-xs px-1">✕</button>
      </div>

      {/* Zones */}
      <div>
        <div className="text-[8px] font-bold tracking-[0.8px] uppercase text-neutral-500 mb-0.5">Zones</div>
        <div className="grid grid-cols-5 gap-1 text-[9px]">
          {ZONE_DEFS.map(z => {
            const self = isSelfCoverage(z.key);
            return (
              <button
                key={z.key}
                disabled={self}
                onClick={() => onPick(z.key)}
                className="h-[22px] rounded-md border text-center disabled:opacity-30"
                style={{ borderColor: getZoneColor(z.key) + (self ? "22" : "66"), color: self ? "#aaa" : getZoneColor(z.key) }}
              >
                {z.key}
              </button>
            );
          })}
        </div>
      </div>

      {/* Restrooms */}
      <div>
        <div className="text-[8px] font-bold tracking-[0.8px] uppercase text-neutral-500 mb-0.5">Restrooms</div>
        <div className="grid grid-cols-5 gap-1 text-[8px]">
          {RR_DEFS.map(rr => {
            const mKey = `MRR${rr.num}`;
            const wKey = `WRR${rr.num}`;
            const self = isSelfCoverage(mKey) || isSelfCoverage(wKey);
            const color = getRRAccent(rr.num);
            return (
              <button
                key={rr.num}
                disabled={self}
                onClick={() => onPick(mKey)}  // pick MRR side as canonical for coverage
                className="h-[22px] rounded-md border text-center disabled:opacity-30"
                style={{ borderColor: color + (self ? "22" : "66"), color: self ? "#aaa" : color, fontSize: "8px" }}
              >
                {rr.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Aux / Support */}
      {auxDefs.length > 0 && (
        <div>
          <div className="text-[8px] font-bold tracking-[0.8px] uppercase text-neutral-500 mb-0.5">Aux / Support</div>
          <div className="grid grid-cols-4 gap-1 text-[8px]">
            {auxDefs.filter(d => !d.key.startsWith("SP")).map(aux => {
              const self = isSelfCoverage(aux.key);
              const color = getAuxAccent(aux.key);
              const display = (aux.label || aux.key).replace(/ .*/, "").slice(0, 6);
              return (
                <button
                  key={aux.key}
                  disabled={self}
                  onClick={() => onPick(aux.key)}
                  className="h-[22px] rounded-md border text-center disabled:opacity-30"
                  style={{ borderColor: color + (self ? "22" : "66"), color: self ? "#aaa" : color }}
                >
                  {display}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Custom coverage text input (pinned bottom as "And ..." coverage task) */}
      <div className="border-t border-black/[0.06] pt-2 mt-1">
        <div className="text-[10px] text-neutral-600 mb-1">Custom text (pinned bottom)</div>
        <form className="flex gap-1" onSubmit={handleCustomSubmit}>
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

/** Engine baseline + optional xAI light/deep insight for the pad. */
function FitIntelBlock({
  prerendered,
  loading,
  detailsOpen,
  structured,
  text,
  assigned,
  onMoreDetails,
  onCollapseDetails,
  rotationGapsLine,
  swapLines,
  weekRepeatLine,
}: {
  prerendered: PrerenderedPlacementFit;
  loading: boolean;
  detailsOpen: boolean;
  structured: PlacementPadInsight | null;
  text: string | null;
  assigned: boolean;
  onMoreDetails: () => void;
  onCollapseDetails: () => void;
  rotationGapsLine?: string | null;
  swapLines?: string[];
  weekRepeatLine?: string | null;
}) {
  const styles = fitVerdictStyles(prerendered.fitVerdict);
  const xaiOverrides =
    !!structured?.fitVerdict &&
    !!structured?.fitSummary &&
    (structured.fitVerdict !== prerendered.fitVerdict ||
      structured.fitSummary.trim() !== prerendered.fitSummary.trim());
  const xaiStyles = structured?.fitVerdict
    ? fitVerdictStyles(structured.fitVerdict)
    : styles;

  return (
    <div className="rounded-2xl border border-black/[0.06] bg-neutral-50/90 overflow-hidden">
      <div
        className="px-3 py-2.5 border-b border-black/[0.04]"
        style={{ background: styles.bg }}
      >
        <div className="flex flex-wrap items-center gap-1.5 mb-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${styles.badge}`}
          >
            {fitVerdictLabel(prerendered.fitVerdict)}
          </span>
          <span className="text-[8px] font-medium uppercase tracking-wide text-white/70">
            rotation fit
          </span>
          {typeof prerendered.healthPoints === "number" && (
            <span className="ml-auto text-[10px] font-semibold tabular-nums text-white/90">
              {prerendered.healthPoints.toFixed(0)}pt
            </span>
          )}
        </div>
        <p className="text-[12px] font-semibold leading-snug" style={{ color: styles.text }}>
          {prerendered.fitSummary}
        </p>
        {prerendered.fitFactLine ? (
          <p className="mt-0.5 text-[10px] leading-snug text-white/75 tabular-nums">
            {prerendered.fitFactLine}
          </p>
        ) : null}
      </div>

      {(weekRepeatLine || rotationGapsLine || (swapLines && swapLines.length > 0)) && (
        <div className="px-3 py-2 space-y-1 text-[11px] leading-snug text-neutral-700 border-b border-black/[0.04]">
          {weekRepeatLine && (
            <p className="font-semibold text-amber-800">{weekRepeatLine}</p>
          )}
          {rotationGapsLine && <p>{rotationGapsLine}</p>}
          {swapLines && swapLines.length > 0 && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-wide text-neutral-400 mb-0.5">
                Swap lanes
              </p>
              {swapLines.map((line) => (
                <p key={line} className="text-[10.5px] text-neutral-600">
                  {line}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {structured?.headline && (
        <div className="px-3 py-2 border-b border-black/[0.04] bg-white/80">
          <div className="flex items-center gap-1 mb-0.5">
            <Sparkles className="w-3 h-3 text-[#2F5C7C]" />
            <span className="text-[8px] font-bold uppercase tracking-[0.12em] text-[#2F5C7C]/90">
              xAI
            </span>
          </div>
          <p className="text-[12px] font-semibold text-neutral-900 leading-snug">
            {structured.headline}
          </p>
          {xaiOverrides && structured.fitSummary && (
            <div
              className="mt-1.5 rounded-lg px-2 py-1"
              style={{ background: xaiStyles.bg }}
            >
              <span className={`text-[8px] font-bold uppercase ${xaiStyles.badge} rounded-full px-1.5 py-0.5`}>
                {fitVerdictLabel(structured.fitVerdict)}
              </span>
              <p className="mt-0.5 text-[11px] font-semibold" style={{ color: xaiStyles.text }}>
                {structured.fitSummary}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="px-3 py-2 flex items-center gap-2">
        {!detailsOpen ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMoreDetails();
            }}
            disabled={loading || !assigned}
            className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-[#2F5C7C]/25 text-[#2F5C7C] bg-white hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            {loading ? "Analyzing…" : structured?.headline ? "Full reasoning" : "xAI insight"}
          </button>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCollapseDetails();
            }}
            className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-neutral-200 text-neutral-600 bg-white"
          >
            Collapse
          </button>
        )}
        {loading && detailsOpen && (
          <BuilderLoadingLine className="text-[10px]">Building analyst notes</BuilderLoadingLine>
        )}
      </div>

      {detailsOpen && structured && (
        <div className="px-3 pb-3 space-y-2 text-[11px] leading-snug text-neutral-700">
          {structured.whyTonight && (
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wide text-[#2F5C7C]/70">Tonight</p>
              <p className="mt-0.5">{structured.whyTonight}</p>
            </div>
          )}
          {structured.rotationNote && (
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wide text-[#2F5C7C]/70">Rotation</p>
              <p className="mt-0.5">{structured.rotationNote}</p>
            </div>
          )}
          {(structured.swapRecommendations?.length ?? 0) > 0 && (
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wide text-[#2F5C7C]/70">Swap lanes</p>
              <ul className="mt-0.5 space-y-0.5">
                {(structured.swapRecommendations ?? []).map((s, i) => (
                  <li key={i}>
                    {s.priority === "high" ? "★ " : "· "}
                    {s.summary}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(structured.watchouts?.length ?? 0) > 0 && (
            <div>
              <p className="text-[8px] font-bold uppercase tracking-wide text-amber-700/80">Watchouts</p>
              <ul className="mt-0.5 list-disc pl-3">
                {(structured.watchouts ?? []).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          {text && !structured.whyTonight && (
            <p className="whitespace-pre-wrap text-neutral-600">{text}</p>
          )}
        </div>
      )}
    </div>
  );
}


/* ── Original supporting types / constants (kept for compatibility) ───────── */
export type PlacementPadAnchor = "left" | "right" | "bottom";
export type PlacementPadPresentation = "flyout" | "dock";
export type PlacementDockTab = "assign" | "tasks" | "intel";

export interface PlacementPadProps {
  slotKey: string;
  anchor: PlacementPadAnchor;
  presentation?: PlacementPadPresentation;
  dockTab?: PlacementDockTab;
  onDockTabChange?: (tab: PlacementDockTab) => void;
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
  /** Opens Tasks Pad — primary surface for adding and formatting tasks. */
  onOpenTasksPad?: (slotKey: string, task?: NightSlotTask, options?: { addMode?: boolean }) => void;
  onRemoveTask?: (
    slotKey: string,
    taskLabel: string,
    taskId?: string | null,
  ) => void;
  onClearSlotTasks?: (slotKey: string) => void | Promise<void>;
  onCopyRestroomPairingTasks?: (slotKey: string) => void | Promise<void>;
  onAssignSweeper?: (slotKey: string, sweeperLabel: string) => void | Promise<void>;
  onRequestEngineInsight?: (slotKey: string, context?: string | Record<string, unknown>) => Promise<string>;
  scheduledUnassigned?: TmEntry[];
  allEligibleTms?: TmEntry[];
  pickerFitByTmId?: Record<string, PickerTmRotationFit>;
  onAddOnCall?: (tmId: string, tmName: string) => void | Promise<void>;
  onMarkUnavailable?: (tmId: string, tmName: string, status: string) => void | Promise<void>;
  boardPrerenderedFit?: PrerenderedPlacementFit;
  isDraftMode?: boolean;
  draftAssignments?: Record<string, any>;
  weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;
  insightsEnabled?: boolean;
  enableTmDragAssign?: boolean;
}

const PAD_W = 340;
const PAD_MAX_HEIGHT = 640;
const LAST5_COUNT = 5;
const Z9_STAT_RED = "#ff3b30"; // iOS red

function anchorClass(anchor: PlacementPadAnchor): string {
  if (anchor === "left") return "placement-pad absolute top-0 right-full mr-1.5";
  if (anchor === "bottom") return "placement-pad absolute bottom-0 left-full ml-1.5";
  return "placement-pad absolute top-0 left-full ml-1.5";
}

/** Shared flyout anchor + host for Placement Pad and Tasks Pad (card-attached portaling). */
export function resolvePadAnchorHost(
  slotKey: string,
  auxDefs: AuxDef[],
): { hostId: string; anchor: PlacementPadAnchor } | null {
  if (!slotKey || /^RR\d+$/.test(slotKey)) return null;

  const rrMatch = slotKey.match(/^(MRR|WRR)(\d+)$/);
  if (rrMatch) {
    const num = parseInt(rrMatch[2], 10);
    return {
      hostId: `rr-${num}`,
      anchor: [8, 10].includes(num) ? "left" : "bottom",
    };
  }

  if (/^Z\d+$/.test(slotKey)) {
    return {
      hostId: slotKey,
      anchor: ["Z4", "Z5", "Z9", "Z10"].includes(slotKey) ? "left" : "right",
    };
  }

  if (auxDefs.some((d) => d.key === slotKey)) {
    return { hostId: slotKey, anchor: "bottom" };
  }

  if (/^OL-(PM|AM)-\d+$/.test(slotKey)) {
    return { hostId: slotKey, anchor: "bottom" };
  }

  return null;
}

function computePortalStyle(hostId: string, anchor: PlacementPadAnchor): React.CSSProperties | null {
  const host = document.querySelector(
    `[data-placement-host="${hostId}"], [data-task-host="${hostId}"]`,
  ) as HTMLElement | null;
  if (!host) return null;
  const rect = host.getBoundingClientRect();
  const gap = 6;
  const padW = PAD_W;
  // visualViewport on iPad Safari — window.innerHeight lies under dynamic chrome.
  const maxH = Math.min(Math.max(180, readViewportHeight() - 24), PAD_MAX_HEIGHT);

  // Prefer right of card; left-anchor cards open left; bottom-anchor still docks to card bottom.
  const preferLeft = anchor === "left";
  const placed = placeFixedPopover(rect, padW, maxH, {
    gap,
    pad: 8,
    preferBelow: anchor !== "left",
    preferLeft,
  });

  // For classic left/right side pads, pin vertical start to card top then clamp via placeFixedPopover.
  let top = placed.top;
  let left = placed.left;
  if (anchor === "right" || anchor === "left") {
    // Re-place with height-aware clamp but prefer aligning top with card.
    const aligned = placeFixedPopover(
      new DOMRect(rect.x, rect.y, rect.width, Math.min(rect.height, 40)),
      padW,
      maxH,
      { gap, pad: 8, preferBelow: true, preferLeft },
    );
    top = aligned.top;
    left = aligned.left;
    // Prefer aligning with card top when it fits.
    if (rect.top + maxH <= readViewportHeight() - 8) {
      top = Math.max(8, rect.top);
    }
  } else if (anchor === "bottom") {
    // Sit beside card, bottom-aligned within viewport.
    left = placed.left;
    top = Math.max(8, Math.min(rect.bottom - maxH, placed.top));
  }

  return {
    position: "fixed",
    left,
    top,
    width: padW,
    zIndex: 200,
    maxHeight: maxH,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };
}

export function usePortalPlacementStyle(hostId: string | undefined, anchor: PlacementPadAnchor, _tabletPickerOpen = false): React.CSSProperties | null {
  const [style, setStyle] = useState<React.CSSProperties | null>(null);
  const rafRef = useRef<number | null>(null);
  const update = useCallback(() => {
    if (!hostId) { setStyle(null); return; }
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setStyle(computePortalStyle(hostId, anchor));
    });
  }, [hostId, anchor]);
  useLayoutEffect(() => {
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", update);
      vv.addEventListener("scroll", update);
    }
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      if (vv) {
        vv.removeEventListener("resize", update);
        vv.removeEventListener("scroll", update);
      }
    };
  }, [update]);
  return style;
}

/* ── Main Component (refined visual + full functionality) ─────────────────── */
const PlacementPad: React.FC<PlacementPadProps> = (props) => {
  const {
    slotKey, anchor, hostId, presentation = "flyout", dockTab = "assign", onDockTabChange, onClose,
    assignments, selectedTasks, selectedDay, members = [], auxDefs, isCurrentNightLocked,
    onAddCoverage, onLiveUnassign, onToggleLock, onAssign, onAddTask, onOpenTasksPad, onRemoveTask,
    onClearSlotTasks, onCopyRestroomPairingTasks, onAssignSweeper, onMarkUnavailable,
    scheduledUnassigned = [], allEligibleTms, pickerFitByTmId, onAddOnCall, boardPrerenderedFit,
    isDraftMode = false, draftAssignments = {}, weeklyRecentHistory, insightsEnabled = true, enableTmDragAssign = false,
  } = props;

  const { label, accent } = getSlotMeta(slotKey);
  const a = assignments[slotKey] || {};
  const tasks = (selectedTasks[slotKey] || []).filter((t) => !t.isCoverage);
  const isRestroomSide = /^[MW]RR\d+$/.test(slotKey);
  const isDock = presentation === "dock";
  const padLarge = isDock;

  // Original heavy logic kept (history, rotation, xAI, fit)
  const currentIso = nightIsoFromDate(selectedDay.date);
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
  const [padGoodExamples, setPadGoodExamples] = useState<Array<{ slotKey: string; insightText: string }>>([]);
  const [rotationBasics, setRotationBasics] = useState<PlacementRotationBasics | null>(null);
  /** Peer board histories for swap-aware local fit (same data as rotation basics). */
  const [peerHistories, setPeerHistories] = useState<Record<string, ZoneDetailEntry | null>>({});
  const [peerProfiles, setPeerProfiles] = useState<
    Record<string, PlacementTmProfile | null>
  >({});
  const rotationSigRef = useRef<string | null>(null);

  const [coverageMode, setCoverageMode] = useState(false);
  const [assignMode, setAssignMode] = useState(false);
  const [assignConfirmed, setAssignConfirmed] = useState(false);
  const [sweeperOpen, setSweeperOpen] = useState(false);
  const [taskInput, setTaskInput] = useState("");
  const taskInputRef = useRef<HTMLInputElement>(null);
  const lightRunRef = useRef(0);

  // Reset pad UI/insight state when identity (slot/TM/night/insights) changes.
  useEffect(() => {
    setCoverageMode(false);
    setAssignMode(false);
    setAssignConfirmed(false);
    setRotationDisplay(null);
    setRotationBasics(null);
    setPeerHistories({});
    setPeerProfiles({});
    rotationSigRef.current = null;
    setDeepInsight(null);
    setInsightStructured(null);
    setInsightCached(false);
    setAnalystDetailsOpen(false);
    setDeepInsightLoading(false);
    // Drop prior TM's history immediately so matrix/fit never paint under the wrong id.
    setPadHistory(null);
    setPadHistoryLoading(!!a.tmId);
    lightRunRef.current += 1;
    analystRequestRef.current += 1;
    setMatrixExpanded(false);
    setEvidenceOpen(false);
    setTaskInput("");
    setSweeperOpen(false);
  }, [slotKey, a.tmId, selectedDay.date, insightsEnabled]);

  const closeSide = anchor === "left" ? "left" : "right";
  const showDockAssignedSummary = isDock && dockTab === "assign" && !!a.tmId && !assignMode;
  const showTmPicker = onAssign && (assignMode || !a.tmId) && !showDockAssignedSummary;
  const showTasksPane = !isDock || dockTab === "tasks";
  const showIntelPane = !isDock || dockTab === "intel";
  const portalStyle = usePortalPlacementStyle(isDock ? undefined : hostId, anchor, showTmPicker);
  const usePortal = !isDock && !!hostId && !!portalStyle;

  // Fetch current TM placement history via session-gated batch API (aligned calendar lookback with chips).
  useEffect(() => {
    if (!a.tmId) {
      setPadHistory(null);
      setPadHistoryLoading(false);
      return;
    }
    const fetchTmId = a.tmId;
    let cancelled = false;
    setPadHistoryLoading(true);
    (async () => {
      try {
        const res = await fetch("/api/shiftbuilder/placement-histories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tmIds: [fetchTmId],
            days: PLACEMENT_HISTORY_FETCH_CALENDAR_DAYS,
          }),
        });
        if (!res.ok) throw new Error(`history ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        const next =
          (data.histories as Record<string, ZoneDetailEntry | null>)?.[fetchTmId] ?? null;
        // Identity guard: never attach another TM's payload to this pad.
        if (next && next.tmId && next.tmId !== fetchTmId) {
          setPadHistory(null);
        } else {
          setPadHistory(next);
        }
      } catch {
        if (!cancelled) setPadHistory(null);
      } finally {
        if (!cancelled) setPadHistoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slotKey, a.tmId]);

  // Only use history that matches the currently assigned TM (guards race during switches).
  const safePadHistory =
    padHistory && a.tmId && (!padHistory.tmId || padHistory.tmId === a.tmId)
      ? padHistory
      : null;

  const padMatrixFacts = React.useMemo(() => {
    const spreadCounts = getSpreadPlacementCounts(
      safePadHistory,
      PLACEMENT_SPREAD_NIGHTS,
      currentIso,
    );
    const spreadKeys = getSpreadPlacementKeys(
      safePadHistory,
      PLACEMENT_SPREAD_NIGHTS,
      currentIso,
    );
    const last5Sequence = getLastPlacementSequence(
      safePadHistory,
      LAST5_COUNT,
      currentIso,
    );
    return {
      spreadCounts,
      spreadKeys,
      last5Sequence,
      slotSpread: spreadCountForRepeatKey(spreadCounts, slotKey),
    };
  }, [safePadHistory, currentIso, slotKey]);

  const spreadCountFor = (ui: string) => padMatrixFacts.spreadCounts.get(ui) ?? 0;
  const last5Sequence = padMatrixFacts.last5Sequence;
  const spreadKeys = padMatrixFacts.spreadKeys;

  const rrLocs = RR_DEFS.flatMap((d) => {
    const g = normalizeGender(members.find((m: any) => m.id === a.tmId || m.tmId === a.tmId)?.gender);
    const sides: { ui: string; label: string }[] = [];
    if (!g || g === "M") sides.push({ ui: `MRR${d.num}`, label: `${d.num}M` });
    if (!g || g === "F") sides.push({ ui: `WRR${d.num}`, label: `${d.num}W` });
    return sides;
  });
  // Stable trail ids (STEP / JC / OAS1) so matrix exposure matches history — never
  // "STEPUP" from stripping "STEP UP", and never AUXn which diverges across nights.
  const auxLocs = auxDefs
    .filter((d) => d.role !== "blank" && d.role !== "support")
    .map((d) => {
      const stable = formatPlacementUiLabel(d.key, d.label || d.key, auxDefs);
      return { ui: stable, label: stable };
    });

  const matrixSlotKeys = React.useMemo(
    () => buildMatrixSlotKeysForTm(a.tmId, members as any[], auxDefs),
    [a.tmId, members, auxDefs],
  );

  const boardSig = React.useMemo(
    () =>
      Object.entries(assignments)
        .filter(([, row]) => row?.tmId)
        .map(([k, row]) => `${k}:${row!.tmId}`)
        .sort()
        .join("|"),
    [assignments],
  );

  const padHistorySig = React.useMemo(
    () =>
      safePadHistory
        ? `${safePadHistory.tmId}:${safePadHistory.lastDate}:${safePadHistory.totalAssignments}`
        : "",
    [safePadHistory?.tmId, safePadHistory?.lastDate, safePadHistory?.totalAssignments],
  );

  const currentPlacementTm = React.useMemo(
    () => memberToPlacementProfile(members as Array<Record<string, unknown>>, a.tmId),
    [members, a.tmId],
  );

  // Rotation basics + swap lanes (needs other board TM histories).
  useEffect(() => {
    if (!a.tmId || !a.tmName) {
      setRotationBasics(null);
      setRotationDisplay(null);
      setPeerHistories({});
      setPeerProfiles({});
      rotationSigRef.current = null;
      return;
    }
    if (padHistoryLoading) return;
    // null history = brand-new TM: still compute gaps (all matrix slots "not recent")
    const historyForBasics = safePadHistory ?? {
      tmId: a.tmId!,
      tmName: a.tmName ?? a.tmId!,
      zoneDates: {},
      zoneCounts: {},
      totalAssignments: 0,
      totalNights: 0,
      lastDate: "",
      zoneDow: {},
    };

    const sig = `${slotKey}|${a.tmId}|${currentIso}|${boardSig}|${padHistorySig}`;
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
            body: JSON.stringify({
              tmIds: otherIds.slice(0, 48),
              days: PLACEMENT_HISTORY_FETCH_CALENDAR_DAYS,
            }),
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
        const id = (row as { tmId?: string })?.tmId;
        if (!id || id === a.tmId) continue;
        otherTmProfiles[id] = memberToPlacementProfile(
          members as Array<Record<string, unknown>>,
          id,
        );
      }

      const basics = computePlacementRotationBasics(
        historyForBasics,
        slotKey,
        a.tmId!,
        matrixSlotKeys,
        assignments,
        histories,
        currentIso,
        PLACEMENT_SPREAD_NIGHTS,
        currentPlacementTm,
        otherTmProfiles,
      );
      rotationSigRef.current = sig;
      setPeerHistories(histories);
      setPeerProfiles(otherTmProfiles);
      setRotationBasics(basics);
      setRotationDisplay(
        formatPlacementRotationDisplay(a.tmName!, slotKey, basics, PLACEMENT_SPREAD_NIGHTS),
      );
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
    matrixSlotKeys,
    assignments,
    members,
    safePadHistory,
    currentPlacementTm,
  ]);

  // Prefer board chip when present (same granular pipeline); fall back to pad-local score.
  // Local score includes peer histories + profiles when rotation effect has loaded them (swap-aware).
  const localPrerenderedFit = React.useMemo(() => {
    const histories: Record<string, ZoneDetailEntry | null> = {
      ...peerHistories,
    };
    if (safePadHistory && a.tmId) {
      histories[a.tmId] = safePadHistory;
    }
    return computeSlotPlacementFit({
      slotKey,
      assignments,
      isDraftMode,
      draftAssignments,
      members: members as any,
      auxDefs,
      currentIso,
      histories,
      historiesLoading: padHistoryLoading,
      otherTmProfiles: peerProfiles,
      weeklyRecentHistory,
    });
  }, [
    slotKey,
    assignments,
    isDraftMode,
    draftAssignments,
    members,
    auxDefs,
    currentIso,
    safePadHistory,
    a.tmId,
    padHistoryLoading,
    weeklyRecentHistory,
    peerHistories,
    peerProfiles,
  ]);

  // Board chips use full-board histories (swap-aware). Prefer that when not history-pending.
  const prerenderedFit: PrerenderedPlacementFit =
    boardPrerenderedFit && !boardPrerenderedFit.healthPending
      ? boardPrerenderedFit
      : localPrerenderedFit;

  const weekRepeatTotal = a.tmId
    ? getTmWeekRepeatForSlotThroughNight(
        weeklyRecentHistory,
        a.tmId,
        slotKey,
        currentIso,
        true, // count tonight if assigned and not already in map
      )
    : 0;
  const weekRepeatLine =
    weekRepeatTotal > 1
      ? weekRepeatTotal >= 3
        ? `This week: ${weekRepeatTotal}× on ${label} (real bad — rotate out)`
        : `This week: ${weekRepeatTotal}× on ${label} (policy max 1)`
      : null;

  const buildInsightContext = React.useCallback(
    (mode: PlacementInsightMode) => {
      const prov = (assignments[slotKey] as { provenance?: { rationale?: string; fairnessSignals?: Record<string, number | string> } })?.provenance || {};
      return {
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
        rationale: prov.rationale,
        fairnessSignals: prov.fairnessSignals,
        recentPlacements: last5Sequence.filter(Boolean).join(" → ") || undefined,
        slotSpecificHistory:
          padMatrixFacts.slotSpread > 0
            ? `${padMatrixFacts.slotSpread}× in last ${PLACEMENT_SPREAD_NIGHTS} nights`
            : `Not in last ${PLACEMENT_SPREAD_NIGHTS}-night spread`,
        rotationBrief: formatRotationBriefForAnalyst(rotationDisplay),
        rotationGapsLine: rotationDisplay?.gapsLine,
        rotationSwapLines: rotationDisplay?.swapLines,
        spreadPlaced: spreadKeys.slice(0, 24).join(", ") || undefined,
        spreadGaps: matrixSlotKeys.filter((k) => !spreadKeys.includes(k)).slice(0, 24).join(", ") || undefined,
        tmThisWeekRepeat:
          weekRepeatTotal > 1
            ? `${a.tmName || "TM"} repeat this week: ${weekRepeatTotal}× in ${label}`
            : undefined,
        contextSig: `${slotKey}|${a.tmId}|${padHistorySig}|${boardSig}|${prerenderedFit.fitVerdict}`,
      };
    },
    [
      slotKey,
      a.tmName,
      a.tmId,
      prerenderedFit,
      last5Sequence,
      padMatrixFacts.slotSpread,
      rotationDisplay,
      spreadKeys,
      matrixSlotKeys,
      weekRepeatTotal,
      label,
      padHistorySig,
      boardSig,
      assignments,
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
        if (data && !data.cached && data.usage) {
          try {
            useShiftBuilderStore.getState().addAiUsage(data.usage);
          } catch {
            /* optional usage tracker */
          }
        }
      } catch (err) {
        if (analystRequestRef.current !== reqId) return;
        setDeepInsight(err instanceof Error ? err.message : "Analyst unavailable.");
        setInsightStructured(null);
      } finally {
        if (analystRequestRef.current === reqId) setDeepInsightLoading(false);
      }
    },
    [buildInsightContext],
  );

  const handleMoreDetails = React.useCallback(() => {
    setAnalystDetailsOpen(true);
    void runPlacementAnalyst(a.tmName ? "deep" : "assignee");
  }, [a.tmName, runPlacementAnalyst]);

  const runLightDetermination = React.useCallback(async () => {
    if (!insightsEnabled || !a.tmName) return;
    const reqId = ++lightRunRef.current;
    try {
      const data = await postEngineInsight(buildInsightContext("headline"));
      if (lightRunRef.current !== reqId) return;
      if (data.structured?.headline) {
        setInsightStructured(data.structured ?? null);
        setInsightCached(!!data.cached);
      }
      if (data && !data.cached && data.usage) {
        try {
          useShiftBuilderStore.getState().addAiUsage(data.usage);
        } catch {
          /* optional */
        }
      }
    } catch {
      /* prerender + rotation remain authoritative */
    }
  }, [a.tmName, buildInsightContext, insightsEnabled]);

  useEffect(() => {
    if (!insightsEnabled) return;
    if (!a.tmName || analystDetailsOpen || insightStructured?.headline || padHistoryLoading) return;
    const t = setTimeout(() => {
      void runLightDetermination();
    }, 80);
    return () => clearTimeout(t);
  }, [
    a.tmName,
    analystDetailsOpen,
    insightStructured?.headline,
    padHistoryLoading,
    runLightDetermination,
    insightsEnabled,
    padHistorySig,
  ]);

  const sweeperOptions = [
    { label: "Sweep 5/8/HL", full: "Sweep 5/8/HL" },
    { label: "Sweep 9/10/SR", full: "Sweep 9/10/SR" },
  ];

  const rrWorkedCount = spreadKeys.filter((k) => k.startsWith("MRR") || k.startsWith("WRR")).length;
  const zoneWorkedCount = spreadKeys.filter((k) => /^Z\d+$/.test(k)).length;
  const z9Days = getDaysSinceForKey(safePadHistory, "Z9", currentIso);
  const z9srDays = getDaysSinceForKey(safePadHistory, "Z9SR", currentIso);

  const last5Pills: Array<string | null> = [...last5Sequence];
  while (last5Pills.length < LAST5_COUNT) last5Pills.push(null);

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

  const handleInlineAddTask = () => {
    const lbl = taskInput.trim();
    if (!lbl || !onAddTask) return;
    setTaskInput("");
    void onAddTask(slotKey, lbl);
    setTimeout(() => taskInputRef.current?.focus(), 0);
  };

  // Build refined data
  const refinedName = a.tmName || "Unassigned";
  const refinedZoneColor = accent;
  const refinedBrk = a.breakGroup || 0;

  function getSlotAccent(key: string): string {
    if (/^Z\d+$/.test(key)) return getZoneColor(key);
    const rrMatch = key.match(/^(?:M|W)?RR(\d+)[MW]?$/i) || key.match(/^RR(\d+)([MW])?$/i);
    if (rrMatch) {
      return getRRAccent(parseInt(rrMatch[1], 10));
    }
    // Map trail short codes back to roles for accent colors.
    const roleFromTrail =
      key === "STEP" || key === "step_up"
        ? "step_up"
        : key === "JC" || key === "job_coach"
          ? "job_coach"
          : key === "ADMIN" || key === "ADM"
            ? "admin"
            : key === "Z9SR"
              ? "z9sr"
              : /^(TSH|TR)\d+$/i.test(key)
                ? "trash"
                : /^(SUP|SP)\d+$/i.test(key)
                  ? "support"
                  : /^OAS\d+$/i.test(key)
                    ? "oasis"
                    : undefined;
    if (roleFromTrail) {
      return getAuxAccent(key, roleFromTrail as any) || "#6B7280";
    }
    const def = auxDefs.find((d) => d.key === key);
    return getAuxAccent(key, def?.role) || "#6B7280";
  }

  const refinedZones = [
    ...ZONE_DEFS.map(z => ({ 
      id: z.key, 
      label: z.key, 
      exposure: Math.min(3, spreadCountFor(z.key)) as ExposureLevel,
      color: getSlotAccent(z.key)
    })),
    ...rrLocs.map(loc => ({ 
      id: loc.ui, 
      label: loc.label, 
      exposure: Math.min(3, spreadCountFor(loc.ui)) as ExposureLevel,
      color: getSlotAccent(loc.ui)
    })),
    ...auxLocs.map(loc => ({ 
      id: loc.ui, 
      label: loc.label, 
      exposure: Math.min(3, spreadCountFor(loc.ui)) as ExposureLevel,
      color: getSlotAccent(loc.ui)
    })),
  ];

  const refinedLastFive = last5Pills.map((ui) => {
    if (!ui) return { label: "—", color: "#C7C7CC" };
    // Sequence is already normalized (STEP / SUP1 / …); format is idempotent.
    const label = formatPlacementUiLabel(ui);
    return { label, color: getSlotAccent(label) };
  });

  const portalStyleLocal = usePortalPlacementStyle(isDock ? undefined : hostId, anchor, showTmPicker);
  const usePortalLocal = !isDock && !!hostId && !!portalStyleLocal;

  const refinedCard = (
    <div className="w-full bg-white rounded-3xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.09),0_1px_3px_rgba(0,0,0,0.05)] flex flex-col min-h-0 flex-1">
      {/* Header - smaller & tighter */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: a.tmName ? refinedZoneColor : "#9CA3AF" }}>
              <span className="text-white text-[17px] font-semibold leading-none select-none">{refinedName.charAt(0)}</span>
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold tracking-[0.14em] uppercase mb-px" style={{ color: refinedZoneColor }}>{label}</p>
              <h2 className="text-[18px] font-bold text-gray-900 leading-tight truncate">{refinedName}</h2>
            </div>
          </div>

          <div className="flex items-start gap-1.5 flex-shrink-0">
            {refinedBrk > 0 && (
              <div className="text-right">
                <p className="text-[8px] font-bold tracking-[0.16em] uppercase text-gray-400 mb-px">BRK</p>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: "#FF9500" }}>
                  <span className="text-white text-base font-bold leading-none">{refinedBrk}</span>
                </div>
              </div>
            )}
            <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="mt-0.5 w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200" aria-label="Close">
              <X className="w-3 h-3 text-gray-500" />
            </button>
          </div>
        </div>

        {a.tmName && onMarkUnavailable && (
          <div className="mt-2.5">
            <button onClick={(e) => { e.stopPropagation(); void onMarkUnavailable(a.tmId, a.tmName, "called_off"); }} className="text-[10px] font-semibold px-3 py-1 rounded-lg border border-yellow-300 text-yellow-600 bg-yellow-50 hover:bg-yellow-100 active:scale-95 transition-all">
              Mark unavailable
            </button>
          </div>
        )}
      </div>

      <div className="h-px bg-gray-100" />

      {/* Body — picker uses one inner scroll region (Safari breaks on nested overflow-y). */}
      <div
        className={`px-4 py-3 flex flex-col min-h-0 ${
          showTmPicker
            ? "flex-1 overflow-hidden"
            : coverageMode || analystDetailsOpen
              ? "space-y-3 overflow-y-auto max-h-[380px]"
              : "space-y-3 overflow-visible"
        }`}
      >
        {!a.tmName && !showTmPicker && (
          <div className="py-2">
            <button disabled={isCurrentNightLocked} onClick={() => setAssignMode(true)} className="w-full rounded-2xl py-3 text-[13px] font-semibold text-white disabled:opacity-50" style={{ background: accent }}>
              Assign team member
            </button>
          </div>
        )}

        {showTmPicker && (
          <div className="flex flex-col flex-1 min-h-0">
            <TmPicker
              key={`${slotKey}:${nightIsoFromDate(selectedDay.date)}`}
              tms={scheduledUnassigned}
              allTms={allEligibleTms}
              fitByTmId={pickerFitByTmId}
              currentTmName={a.tmId ? a.tmName : undefined}
              onPick={handlePickTm}
              onAddOnCall={onAddOnCall ? (tm) => void onAddOnCall(tm.tmId, tm.tmName) : undefined}
              onMarkUnavailable={onMarkUnavailable ? (tm, s) => void onMarkUnavailable(tm.tmId, tm.tmName, s) : undefined}
              onCancel={a.tmId ? () => setAssignMode(false) : undefined}
              confirmed={assignConfirmed}
              accent={accent}
              isDark={false}
              variant={padLarge ? "tablet" : "default"}
              enableDragAssign={false}
              allowListScroll
              listScrollMaxHeight={padLarge ? 320 : 252}
            />
          </div>
        )}

        {coverageMode && showTasksPane && !showTmPicker && (
          <InlineCoverage sourceKey={slotKey} auxDefs={auxDefs} onPick={async (t) => { if (onAddCoverage) await onAddCoverage(slotKey, t); setCoverageMode(false); }} onCancel={() => setCoverageMode(false)} />
        )}

        {!showTmPicker && !coverageMode && a.tmName && (
          <>
            {showTasksPane && (
              <div className="space-y-1.5">
                {tasks.map((t) => (
                  <div
                    key={t.id || t.taskLabel}
                    className={`flex items-center justify-between px-3 py-2 rounded-2xl border border-gray-100 bg-white text-[12px] ${onOpenTasksPad ? "cursor-pointer hover:border-[#007AFF]/30 hover:bg-[#007AFF]/[0.03]" : ""}`}
                    onClick={onOpenTasksPad ? (e) => { e.stopPropagation(); onOpenTasksPad(slotKey, t); } : undefined}
                    onKeyDown={onOpenTasksPad ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenTasksPad(slotKey, t); } } : undefined}
                    role={onOpenTasksPad ? "button" : undefined}
                    tabIndex={onOpenTasksPad ? 0 : undefined}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: t.color ?? accent }} />
                      <span className="font-medium text-gray-800 truncate">{t.taskLabel}</span>
                    </div>
                    {onRemoveTask && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onRemoveTask(slotKey, t.taskLabel, t.id); }}
                        className="text-gray-300 hover:text-red-400"
                        aria-label={`Remove ${t.taskLabel}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}

                {onOpenTasksPad ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onOpenTasksPad(slotKey, undefined, { addMode: true }); }}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl border border-dashed border-[#007AFF]/35 bg-[#007AFF]/[0.04] text-[12px] font-semibold text-[#007AFF] hover:bg-[#007AFF]/[0.08] active:scale-[0.99] transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{tasks.length ? "Add another task" : "Add tasks"}</span>
                  </button>
                ) : onAddTask ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-2xl border border-gray-200">
                    <input
                      ref={taskInputRef}
                      value={taskInput}
                      onChange={(e) => setTaskInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleInlineAddTask()}
                      placeholder="Add a task..."
                      className="flex-1 bg-transparent text-[12px] text-gray-700 placeholder-gray-400 outline-none"
                    />
                    {taskInput.trim() ? (
                      <button type="button" onClick={handleInlineAddTask} className="text-[#007AFF] flex-shrink-0">
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {onAssignSweeper && (() => {
                  const hasSweeper = tasks.some((t: any) => t.taskLabel?.toLowerCase().includes('sweep'));
                  return (
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSweeperOpen(!sweeperOpen); }}
                        disabled={hasSweeper || isCurrentNightLocked}
                        className="w-full text-[11px] py-[5px] rounded-xl flex items-center justify-center gap-1.5 font-semibold"
                        style={{
                          background: hasSweeper ? '#f3f4f6' : '#fef3c7',
                          color: hasSweeper ? '#9ca3af' : '#b45309',
                          border: hasSweeper ? '1px solid #e5e7eb' : '1px solid #fcd34d',
                          cursor: hasSweeper ? 'default' : 'pointer',
                        }}
                      >
                        <span style={{ fontSize: 13 }}>🧹</span>
                        <span>Assign Sweeper</span>
                        {hasSweeper && <span style={{ fontSize: 9, opacity: 0.55, marginLeft: 2 }}>(assigned)</span>}
                      </button>

                      {sweeperOpen && !hasSweeper && (
                        <div
                          className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow text-[12px] z-10 py-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {sweeperOptions.map((opt) => (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => {
                                void onAssignSweeper(slotKey, opt.full);
                                setSweeperOpen(false);
                              }}
                              className="w-full text-left px-3 py-1.5 hover:bg-amber-50 text-amber-700"
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {(showIntelPane || !isDock) && (
              <>
                {padHistoryLoading && a.tmId ? (
                  <BuilderLoadingLine className="text-[11px]">Loading rotation history</BuilderLoadingLine>
                ) : (
                  <FitIntelBlock
                    prerendered={prerenderedFit}
                    loading={deepInsightLoading}
                    detailsOpen={analystDetailsOpen}
                    structured={insightStructured}
                    text={deepInsight}
                    assigned={!!a.tmName}
                    onMoreDetails={handleMoreDetails}
                    onCollapseDetails={() => {
                      setAnalystDetailsOpen(false);
                      setDeepInsight(null);
                    }}
                    rotationGapsLine={rotationDisplay?.gapsLine}
                    swapLines={rotationDisplay?.swapLines}
                    weekRepeatLine={weekRepeatLine}
                  />
                )}
              </>
            )}

            {/* Matrix — full gender-eligible surface (no truncation) */}
            <div>
              <p className="text-[9px] text-gray-400 mb-1">Matrix · last 30 nights (spread) + last 5 placements</p>

              <div className="flex items-center gap-1 mb-1 flex-wrap text-[11px]">
                <span className="font-bold" style={{ color: "#ff3b30" }}>RR</span>
                <span className="font-bold text-gray-800">{rrWorkedCount}</span>
                <span className="text-gray-300 mx-0.5">|</span>
                <span className="text-gray-500">Zone</span>
                <span className="font-bold text-gray-800">{zoneWorkedCount}</span>
                <span className="text-gray-300 mx-0.5">|</span>
                <span className="text-gray-500">Z9</span>
                <span className="font-semibold text-gray-500">{z9Days}</span>
                <span className="text-gray-500">Z9SR</span>
                <span className="font-semibold text-gray-500">{z9srDays}</span>
              </div>

              <div className="flex items-center gap-2 mb-2 flex-wrap text-[9px] text-gray-500">
                <span className="flex items-center gap-1"><LegendDot color={MATRIX_SPREAD_ONCE}/>1×</span>
                <span className="flex items-center gap-1"><LegendDot color={MATRIX_SPREAD_TWICE}/>2×</span>
                <span className="flex items-center gap-1"><LegendDot color={MATRIX_SPREAD_THRICE_PLUS}/>3×+</span>
                <span className="flex items-center gap-1"><LegendDot color={MATRIX_SPREAD_NONE}/>not in spread</span>
              </div>

              <div className="grid grid-cols-5 gap-1">
                {refinedZones.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-xl py-[5px] text-[10px] font-semibold text-center transition-colors"
                      style={matrixSpreadPillStyle(item.exposure)}
                      title={
                        item.exposure === 0
                          ? `${item.label} · not in last 30 nights`
                          : `${item.label} · ${item.exposure >= 3 ? "3+" : item.exposure}× in last 30 nights`
                      }
                    >
                      {item.label}
                    </div>
                  ))}
              </div>
            </div>

            {/* LAST 5 — slot accent colors (matches deployment card chrome) */}
            <div>
              <p className="text-[8px] font-bold tracking-[0.14em] uppercase text-gray-400 mb-1">LAST 5</p>
              <div className="grid grid-cols-5 gap-1">
                {refinedLastFive.map((p, i) => {
                  const base = p.color;
                  // Soft tinted pill using the actual zone/restroom accent color
                  const style: React.CSSProperties = {
                    background: `${base}22`,
                    border: `1px solid ${base}55`,
                    color: base
                  };
                  return (
                    <div 
                      key={i} 
                      className="rounded-xl py-[5px] text-[10px] font-bold text-center"
                      style={style}
                    >
                      {p.label}
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer - smaller */}
      {(isDock || (!showTmPicker && !coverageMode)) && (
        <div className="px-3 pb-3 pt-2 border-t border-gray-100 bg-white">
          <div className="grid grid-cols-4 gap-1">
            {[
              { label: a.isLocked ? "Locked" : "Lock", onClick: () => onToggleLock?.(slotKey) },
              { label: "Clear", onClick: () => onLiveUnassign?.(slotKey), danger: true },
              { label: "Coverage", onClick: () => { setCoverageMode(true); onDockTabChange?.("tasks"); } },
              { label: "Swap", onClick: () => { setAssignMode(true); onDockTabChange?.("assign"); } },
            ].map((b, i) => (
              <button key={i} disabled={isCurrentNightLocked} onClick={b.onClick} className={`py-2 rounded-2xl text-[11px] font-semibold ${ (b as any).danger ? "text-[#FF3B30] bg-[#FFF0F0] border border-[#FFD5D5]" : "text-gray-800 bg-white border border-gray-200" }`}>
                {b.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const outer = (
    <motion.div
      className={`placement-pad no-print ${isDock ? "placement-dock-inner h-full" : usePortalLocal ? "fixed" : anchorClass(anchor)} flex flex-col overflow-hidden`}
      style={
        isDock 
          ? { display: "flex", flexDirection: "column", height: "100%", width: "100%" } 
          : usePortalLocal 
            ? portalStyleLocal! 
            : { 
                width: PAD_W, 
                // Adaptive: only hard max when we are in tall modes (picker/details). Normal view sizes to content.
                maxHeight: (showTmPicker || analystDetailsOpen) ? PAD_MAX_HEIGHT : undefined,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
              }
      }
      onClick={e => e.stopPropagation()}
    >
      {refinedCard}
    </motion.div>
  );

  if (isDock) return outer;
  if (usePortalLocal && typeof document !== "undefined") {
    return createPortal(outer, document.body);
  }
  return outer;
};

export default PlacementPad;