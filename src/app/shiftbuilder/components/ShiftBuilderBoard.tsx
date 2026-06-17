"use client";

import React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { premiumSpring, premiumSpringReduced, premiumEntrance, premiumHoverLift, premiumStagger, premiumButton, premiumEntranceReduced, premiumPresenceReduced } from "@/lib/premiumSpring";
import ZoneCard from "./ZoneCard";
import RRCard from "./RRCard";
import AuxCard from "./AuxCard";
import OverlapSlot from "./OverlapSlot";
import {
  ZONE_DEFS,
  RR_DEFS,
  getZoneColor,
  getRRAccent,
  getAuxAccent,
  ZONE_VISUAL_ORDER,
} from "@/lib/shiftbuilder/constants";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import { normalizeGender } from "@/lib/shiftbuilder/placement";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { useAssignments, useDraftAssignments, useAuxDefs, useShiftBuilderStore } from "../store/useShiftBuilderStore";
import PlacementPad, { type PlacementPadAnchor } from "./PlacementPad";
import TaskTextEditPad from "./TaskTextEditPad";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { shiftBuilderVersionLabel } from "../version";
import { WeekHealthTracker } from "./WeekHealthTracker";
import { RotationHealthFloater } from "./RotationHealthFloater";
import type { TmEntry } from "./MarkerPad";
import { usePlacementFitMap } from "../hooks/usePlacementFitMap";
import { nightIsoFromDate } from "./placementPadHelpers";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import type { DraftAssignmentRow } from "./placementFitForSlot";


function slotShowsFilled(
  slotKey: string,
  assignments: Record<string, { tmName?: string }>,
  isDraftMode: boolean,
  draftAssignments: Record<string, DraftAssignmentRow>,
): boolean {
  if (isDraftMode) {
    const d = draftAssignments[slotKey];
    if (d?.proposedClear) return false;
    if (d?.proposedTmName?.trim()) return true;
  }
  return !!assignments[slotKey]?.tmName;
}

export interface ShiftBuilderBoardProps {
  // Pre-processed wave data from worker (3.2) – used in breaks view for performance
  processedWaves?: any[];
  processedBreakCounts?: { 1: number; 2: number; 3: number }; // from worker (3.4/3.2 hardening)
  // Core day data (from useCurrentNight core + secondary)
  assignments?: Record<string, any>; // optional — prefer store selector (3.4 narrow subscription)
  nightId?: string | null;
  members?: any[];
  scheduledTmIdsTonight?: Set<string>;

  // Secondary / deferred
  selectedTasks?: any; // Record or array — cards are flexible
  tasks?: any[];
  breakAssignments?: any;
  cardBorders?: Record<string, string>;
  notes?: string;
  recentZoneHistory?: any;
  /** 7-night / this-week history map (tmId -> [{nightDate, slotKey}]) for week-repeat tells in pads + health. */
  weeklyRecentHistory?: Map<string, Array<{ nightDate: string; slotKey: string }>>;

  // Board view + interaction state (controlled by orchestrator)
  selectedDay: DayDef;
  selectedDayIndex: number;
  currentView: "deployment" | "breaks";
  breakGroup: 1 | 2 | 3;
  isDark: boolean;
  isDraftMode: boolean;
  draftAssignments?: Record<string, any>; // optional — prefer store selector (3.4)
  isCurrentNightLocked: boolean;
  loadingAssignments?: boolean;
  auxDefs?: AuxDef[]; // optional — prefer store selector (3.4)

  // Stable callbacks (memoized in parent) — loose to match the many call sites
  onDayPillClick?: (idx: number) => void;
  onBreakGroupChange?: (g: 1 | 2 | 3) => void;
  onCardClick?: any;
  onGenderClick?: (k: string, el?: HTMLElement, e?: React.MouseEvent) => void;
  onRemoveTask?: any;
  onSetTaskColor?: any;
  onEditTask?: any;
  setBreakGroupForSlot?: any;
  onLiveAssign?: any;
  onLiveUnassign?: any;
  onClearSlot?: (slotKey: string) => void;
  onAddCoverage?: (sourceSlotKey: string, targetSlotKey: string) => void | Promise<void>;
  /** Initial wiring for xAI-powered engine insights in the unilateral marker pad. Called with the active slot (or focusedSk for RR). Returns a rich natural-language explanation. */
  onRequestEngineInsight?: (slotKey: string, context?: string | Record<string, unknown>) => Promise<string>;

  // Live cache interface (passed through for optimistic)
  live?: any;

  // Breaks view overlap headers (pre-computed in parent for now)
  amOverlapDayName?: string;
  amOverlapDateNum?: number;
  nextDayColor?: string;
  /** Active anchored placement pad slot (controlled by orchestrator). */
  selectedSlotKey?: string | null;
  onSlotToggle?: (slotKey: string) => void;
  onSlotClose?: () => void;
  /** Merged assignments for pad display (store + live). */
  padAssignments?: Record<string, any>;
  scheduledUnassigned?: TmEntry[];
  allEligibleTms?: TmEntry[];
  onAddOnCall?: (tmId: string, tmName: string) => void | Promise<void>;
  onMarkUnavailable?: (tmId: string, tmName: string, status: string) => void | Promise<void>;
  onToggleLock?: (slotKey: string) => void;
  onAssign?: (slotKey: string, tmId: string, tmName: string) => void;
  onAssignSweeper?: (slotKey: string, sweeperLabel: string) => void | Promise<void>;
  onAddTask?: (slotKey: string, label: string) => void | Promise<void>;
  /** When set by ShiftBuilderClient, avoids duplicate history fetch + powers rotation health floater. */
  fitBySlot?: Record<string, PrerenderedPlacementFit>;
  /** Stage zoom — re-equalize card rows when fit changes (see layoutHeight below). */
  artboardScale?: number;
  /** When true (print-preview mode), suppress digital-only assists (xAI chips/lines, fit chips, HUDs) so the live canvas matches the exact Golden that will be cloned for PDF/print. Core content (names, badges that print, tasks, etc.) unchanged. */
  isPrintPreview?: boolean;

  /** When true, suppress card-attached PlacementPad — parent renders an external pad. */
  useExternalPad?: boolean;

  onAddAuxSlot?: () => void;
  onRemoveAuxSlot?: () => void;
  canAddAux?: boolean;
  canRemoveAux?: boolean;
  onSetAuxRole?: (slotKey: string, role: import("@/lib/shiftbuilder/placement").AuxRole) => void;
  onSetAuxLabel?: (slotKey: string, label: string) => void;

  /** When false, PlacementPad renders without xAI analyst/matrix (e.g. /today). */
  placementPadInsightsEnabled?: boolean;

  /** When true, TM picker rows are draggable onto slots (requires parent DndContext). */
  enableTmDragAssign?: boolean;

  /** Weekly Overview focus (from navbar table): dims non-matching cards, highlights the focused TM's slot on this day. */
  focusedTmId?: string | null;

  /** Builder sheet-header week health floater (center band beside the date block). */
  showWeekHealthBar?: boolean;
  weekDailyHealths?: Record<string, number>;
  weekHealthDayDefs?: Array<{
    date: Date;
    name: string;
    short?: string;
    index: number;
    dateNum?: number;
  }>;
  weekHealthLoading?: boolean;
  onWeekHealthSelectDay?: (index: number) => void;
  onWeekHealthDismiss?: () => void;

  /** Rotation health side drawer engine controls (clear + run xAI/rotation engine). Passed from orchestrator / cluster. */
  canRunEngine?: boolean;
  onRunXaiEngine?: () => void;
  onClearBoard?: () => void;
  engineRunning?: boolean;
  onApplyDraft?: () => void;
  onDiscardDraft?: () => void;
  draftGrokExplanation?: string;

}

/** Layout height in artboard coordinates (immune to ancestor CSS transform: scale). */
function layoutHeight(el: HTMLElement): number {
  return el.offsetHeight;
}

/**
 * ShiftBuilderBoard
 *
 * Isolated, memoized owner of the sacred 1056×816 print-artboard contract.
 * This is the #1 highest-ROI extraction for day-switch speed on iPad.
 *
 * - Receives a narrow, day-specific prop bag (assignments + view state + stable fns).
 * - Owns all internal derived (breakCounts, wave prep) with useMemo.
 * - The parent orchestrator (ShiftBuilderClient) no longer re-renders this entire
 *   subtree on every unrelated state change.
 * - Internal week pills and GROUP pills use callbacks so the board never owns
 *   global day/view selection.
 *
 * Sacred contracts preserved 100%: print fidelity, Draft Mode, engine output,
 * realtime optimistic, BreakBadge interactions, exact Golden layout.
 */
const ShiftBuilderBoard = React.memo(function ShiftBuilderBoard({
  assignments: assignmentsProp,
  nightId,
  selectedTasks = [],
  cardBorders = {},
  breakAssignments = [],
  selectedDay,
  selectedDayIndex,
  currentView,
  breakGroup,
  isDark,
  isDraftMode,
  draftAssignments: draftAssignmentsProp,
  isCurrentNightLocked,
  loadingAssignments,
  auxDefs: auxDefsProp,
  onDayPillClick,
  onBreakGroupChange,
  onCardClick,
  onGenderClick,
  onRemoveTask,
  onSetTaskColor,
  onEditTask,
  setBreakGroupForSlot,
  onLiveAssign,
  onLiveUnassign,
  onAddCoverage,
  onRequestEngineInsight,
  live,
  amOverlapDayName,
  amOverlapDateNum,
  nextDayColor,
  processedWaves,
  processedBreakCounts,
  selectedSlotKey = null,
  onSlotToggle,
  onSlotClose,
  padAssignments,
  scheduledUnassigned = [],
  allEligibleTms,
  onAddOnCall,
  onMarkUnavailable,
  weeklyRecentHistory,
  onClearSlot,
  onToggleLock,
  onAssign,
  onAssignSweeper,
  onAddTask,
  members = [],
  fitBySlot: fitBySlotProp,
  artboardScale,
  isPrintPreview = false,
  useExternalPad = false,
  onAddAuxSlot,
  onRemoveAuxSlot,
  canAddAux = false,
  canRemoveAux = false,
  onSetAuxRole,
  onSetAuxLabel,
  placementPadInsightsEnabled = true,
  enableTmDragAssign = false,
  focusedTmId,
  showWeekHealthBar = false,
  weekDailyHealths = {},
  weekHealthDayDefs,
  weekHealthLoading = false,
  onWeekHealthSelectDay,
  onWeekHealthDismiss,

  canRunEngine,
  onRunXaiEngine,
  onClearBoard,
  engineRunning,
  onApplyDraft,
  onDiscardDraft,
  draftGrokExplanation,
}: ShiftBuilderBoardProps) {
  const reducedMotion = useReducedMotion();

  // 3.4 — Narrow Zustand subscriptions (primary source). Only re-renders this island
  // when the selected slice actually mutates. Falls back to props during transition.
  const assignments = useAssignments() ?? assignmentsProp ?? {};
  const draftAssignments = useDraftAssignments() ?? draftAssignmentsProp ?? {};
  const auxDefs = useAuxDefs() ?? auxDefsProp ?? {};

  // Respect pending drag so source cards do not lose their draggable state
  // or visual TM during an active reassignment drag. This is critical for
  // making assigned TM drag feel solid like task drag.
  const pendingDrag = useShiftBuilderStore(s => s.pendingDrag) ?? null;

  // Refs for grids (used for ResizeObserver in some paths, but in builder we let cards
  // size naturally to their content — strict padding + tasks + wrapped text determine height.
  // No forced minHeight equalization in builder so cards "adapt to the size they need".
  // The overall page/sheet area adapts (scrolls when necessary) to fully show the layout.
  // Print-preview path still uses CSS 1fr + h-full for the Golden capture fidelity.
  const zonesGridRef = React.useRef<HTMLDivElement>(null);
  const restroomsGridRef = React.useRef<HTMLDivElement>(null);
  const auxGridRef = React.useRef<HTMLDivElement>(null);

  // Derived assignments for rendering that respects active pending drag.
  // This ensures the source card stays visually "occupied" and draggable throughout the gesture.
  const displayAssignments = React.useMemo(() => {
    if (!pendingDrag?.fromSlot) return assignments;

    const copy = { ...assignments };
    // Force the original TM to remain visible on the source slot during drag.
    // This prevents the card from losing its useDraggable mid-gesture.
    if (pendingDrag.fromSlot && pendingDrag.tmId) {
      copy[pendingDrag.fromSlot] = {
        ...(copy[pendingDrag.fromSlot] || {}),
        tmId: pendingDrag.tmId,
        tmName: pendingDrag.tmName,
      };
    }
    return copy;
  }, [assignments, pendingDrag]);

  // === Duplicate TM conflict detection (per-night, across all position slots) ===
  // High-class ops safety: flag cards so operators immediately see when the same TM
  // has been placed in more than one spot on this night (zones + RR sides + aux + overlaps).
  // Computed on the visual/proposed state (display + draft overlay).
  // Passed down so cards can render refined, subtle digital-assist flags (no-print).
  const { conflictingTms, tmConflictSlots } = React.useMemo(() => {
    const tmToSlots: Record<string, string[]> = {};

    // Helper to record a TM for a slot (prefers draft proposed state for what the operator sees)
    const record = (slotKey: string) => {
      const d = draftAssignments[slotKey] as any;
      const live = displayAssignments[slotKey];
      const tmId = d?.proposedTmId || live?.tmId;
      if (tmId) {
        (tmToSlots[tmId] ||= []).push(slotKey);
      }
    };

    // Zones
    ZONE_DEFS.forEach(d => record(d.key));

    // Restrooms (both sides)
    RR_DEFS.forEach(d => {
      record(`MRR${d.num}`);
      record(`WRR${d.num}`);
    });

    // Aux / support
    auxDefs.forEach(d => record(d.key));

    // Overlaps (any OL- keys present)
    Object.keys(displayAssignments).forEach(k => {
      if (k.startsWith('OL-')) record(k);
    });
    Object.keys(draftAssignments).forEach(k => {
      if (k.startsWith('OL-')) record(k);
    });

    const dups = new Set<string>();
    const slotsByTm: Record<string, string[]> = {};
    Object.entries(tmToSlots).forEach(([tmId, slots]) => {
      if (slots.length > 1) {
        dups.add(tmId);
        slotsByTm[tmId] = slots;
      }
    });
    return { conflictingTms: dups, tmConflictSlots: slotsByTm };
  }, [displayAssignments, draftAssignments, auxDefs]);

  const isAnyDragActive = !!pendingDrag;
  // === Local derived (was in giant parent; now scoped to board only) ===
  // Always call the hook (Rules of Hooks). Prefer worker value when available.
  const computedBreakCounts = React.useMemo(() => {
    const counts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
    Object.values(assignments).forEach((a: any) => {
      if (!a?.tmId && !a?.tmName) return;
      const g = (a.breakGroup ?? 0) as 1 | 2 | 3;
      if (g === 1 || g === 2 || g === 3) counts[g]++;
    });
    return counts;
  }, [assignments]);

  const breakCounts = processedBreakCounts ?? computedBreakCounts;

  const inRotationCount = breakCounts[1] + breakCounts[2] + breakCounts[3];

  const padDisplayAssignments = padAssignments ?? displayAssignments;

  const currentIso = nightIsoFromDate(selectedDay.date);

  const internalFitMap = usePlacementFitMap({
    enabled: !fitBySlotProp && currentView === "deployment",
    assignments: displayAssignments,
    isDraftMode,
    draftAssignments,
    members,
    auxDefs,
    currentIso,
    scheduledUnassigned,
    allEligibleTms,
  });
  const fitBySlot = fitBySlotProp ?? internalFitMap.fitBySlot;
  // In print-preview mode the live canvas must match the exact Golden that print capture will clone (no digital chips/lines at all).
  const showDigitalAssists = !isPrintPreview;
  const builderCardGridClass = showDigitalAssists ? " sb-builder-card-grid" : "";
  /** Grid cell host — stretches to row height so cards align across columns. */
  const gridHostClass = isPrintPreview ? "relative h-full" : "relative h-full min-h-0 flex flex-col";
  const zoneGridClass = isPrintPreview
    ? `grid grid-cols-5 gap-1.5 flex-1 w-full${builderCardGridClass}`
    : `sb-zone-grid flex-1 w-full${builderCardGridClass}`;
  const rrGridClass = isPrintPreview
    ? `grid grid-cols-5 gap-1.5 flex-1 w-full${builderCardGridClass}`
    : `sb-rr-grid flex-1 w-full${builderCardGridClass}`;
  const auxGridClass = isPrintPreview
    ? `grid gap-1.5 flex-1 w-full${builderCardGridClass}`
    : `sb-aux-grid flex-1 w-full${builderCardGridClass}`;
  // Overlap strips: 6-across with row-equal heights (dedicated grid, not zone card grid).
  const overlapGridClass = isPrintPreview
    ? "sb-overlap-grid sb-overlap-card-grid flex-1 grid grid-cols-6 gap-1.5 min-w-0"
    : "sb-overlap-grid sb-overlap-card-grid flex-1 min-w-0";

  /** Exactly one anchored pad host — prevents duplicate RR pads. */
  const activePlacementPad = React.useMemo((): {
    slotKey: string;
    anchor: PlacementPadAnchor;
    hostId: string;
  } | null => {
    if (!selectedSlotKey || /^RR\d+$/.test(selectedSlotKey)) return null;

    const rrMatch = selectedSlotKey.match(/^(MRR|WRR)(\d+)$/);
    if (rrMatch) {
      const num = parseInt(rrMatch[2], 10);
      return {
        slotKey: selectedSlotKey,
        anchor: [8, 10].includes(num) ? "left" : "bottom",
        hostId: `rr-${num}`,
      };
    }

    if (/^Z\d+$/.test(selectedSlotKey)) {
      return {
        slotKey: selectedSlotKey,
        anchor: ["Z4", "Z5", "Z9", "Z10"].includes(selectedSlotKey) ? "left" : "right",
        hostId: selectedSlotKey,
      };
    }

    if (auxDefs.some((d) => d.key === selectedSlotKey)) {
      return {
        slotKey: selectedSlotKey,
        anchor: "bottom",
        hostId: selectedSlotKey,
      };
    }

    if (/^OL-(PM|AM)-\d+$/.test(selectedSlotKey)) {
      return {
        slotKey: selectedSlotKey,
        anchor: "bottom",
        hostId: selectedSlotKey,
      };
    }

    return null;
  }, [selectedSlotKey, auxDefs]);

  // Close placement pad on outside click
  React.useEffect(() => {
    if (!selectedSlotKey) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-slot-key]") && !target.closest(".placement-pad")) {
        onSlotClose?.();
      }
    };
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [selectedSlotKey, onSlotClose]);

  // === Task text/font attributes pad (double-click on TaskRow) ===
  // Local to Board (builder-only UI state). No need to lift open/close to Client.
  const [activeTaskEditPad, setActiveTaskEditPad] = React.useState<null | {
    slotKey: string;
    task: NightSlotTask;
    hostId: string;
  }>(null);

  const handleOpenTaskTextEdit = React.useCallback((slotKey: string, task: NightSlotTask) => {
    if (isPrintPreview) return;
    const hostId = `task-${slotKey}-${task.id}`;
    setActiveTaskEditPad({ slotKey, task, hostId });
  }, [isPrintPreview]);

  const closeTaskTextEditPad = React.useCallback(() => {
    setActiveTaskEditPad(null);
  }, []);

  const renderTaskTextEditPad = () => {
    if (isPrintPreview || !activeTaskEditPad) return null;
    return (
      <TaskTextEditPad
        slotKey={activeTaskEditPad.slotKey}
        task={activeTaskEditPad.task}
        hostId={activeTaskEditPad.hostId}
        onClose={closeTaskTextEditPad}
        onEditTask={onEditTask}
        onSetTaskColor={onSetTaskColor}
        onRemoveTask={onRemoveTask}
        isDark={isDark}
      />
    );
  };

  // Equalize card heights within each grid row on the deployment sheet.
  // Re-runs when returning from the breaks view (grids unmount/remount) so heights
  // do not stay at natural uneven sizes after tab switches.
  React.useEffect(() => {
    let innerRaf = 0;
    let ro: ResizeObserver | null = null;

    if (currentView !== "deployment") return;

    const getGridColumnCount = (gridEl: HTMLElement): number => {
      const cols = getComputedStyle(gridEl).gridTemplateColumns;
      if (!cols || cols === "none") return 5;
      return cols.split(" ").filter((c) => c.trim()).length;
    };

    const equalizeCardsInGrid = (gridEl: HTMLElement, colsPerRow: number) => {
      const wrappers = Array.from(gridEl.children) as HTMLElement[];
      for (let i = 0; i < wrappers.length; i += colsPerRow) {
        const rowWrappers = wrappers.slice(i, i + colsPerRow);
        let maxCardH = 0;
        const rowCards: HTMLElement[] = [];
        rowWrappers.forEach((wrapper) => {
          const card = wrapper.querySelector(":scope > .assignment-card") as HTMLElement | null;
          if (!card) return;
          card.style.minHeight = "";
          const h = layoutHeight(card);
          if (h > maxCardH) maxCardH = h;
          rowCards.push(card);
        });
        if (maxCardH > 0) {
          rowCards.forEach((card) => {
            card.style.minHeight = `${maxCardH}px`;
          });
        }
      }
    };

    /** RR columns stack women's + men's cards; equalize each band across the 5 columns. */
    const equalizeRRGrid = (gridEl: HTMLElement) => {
      const wrappers = Array.from(gridEl.children) as HTMLElement[];
      const womenCards: HTMLElement[] = [];
      const menCards: HTMLElement[] = [];
      wrappers.forEach((wrapper) => {
        const cards = wrapper.querySelectorAll(":scope .assignment-card");
        if (cards[0]) womenCards.push(cards[0] as HTMLElement);
        if (cards[1]) menCards.push(cards[1] as HTMLElement);
      });
      const applyBand = (cards: HTMLElement[]) => {
        let maxH = 0;
        cards.forEach((card) => {
          card.style.minHeight = "";
          const h = layoutHeight(card);
          if (h > maxH) maxH = h;
        });
        if (maxH > 0) {
          cards.forEach((card) => {
            card.style.minHeight = `${maxH}px`;
          });
        }
      };
      applyBand(womenCards);
      applyBand(menCards);
    };

    const equalize = () => {
      if (isPrintPreview) return; // Pure CSS distribution (minmax(0,1fr) + h-full) in sacred preview/capture.
      if (isAnyDragActive) return;
      // Builder: do NOT force minHeights. Cards (and thus rows/sections) size to what their
      // content needs (text + strict padding + variable # of tasks pinned at bottom).
      // The sheet container below will adapt (overflow-y-auto) so the full natural layout is visible.
      // (Previously we equalized bands; that is now relaxed per request for content-adaptive cards.)
    };

    const attachResizeObserver = () => {
      const grids = [zonesGridRef.current, restroomsGridRef.current, auxGridRef.current].filter(
        Boolean,
      ) as HTMLElement[];
      if (!grids.length || typeof ResizeObserver === "undefined") return;
      ro?.disconnect();
      ro = new ResizeObserver(() => {
        requestAnimationFrame(equalize);
      });
      grids.forEach((el) => ro!.observe(el));
    };

    if (!isAnyDragActive) {
      // Only schedule equalize + attach ResizeObserver when NOT dragging.
      // During active drag we completely avoid any RAFs and observer callbacks that would
      // mutate card minHeight on the scaled artboard (primary cause of the perceived "zoom out" glitch).
      const outerRaf = requestAnimationFrame(() => {
        equalize();
        innerRaf = requestAnimationFrame(() => {
          equalize();
          attachResizeObserver();
        });
      });

      return () => {
        cancelAnimationFrame(outerRaf);
        cancelAnimationFrame(innerRaf);
        ro?.disconnect();
      };
    }

    // Drag active: no equalize work, no observer attached this effect run.
    // equalize() itself also bails early (defense-in-depth if a stale callback fires at the boundary).
    // Effect will re-run on isAnyDragActive change (it's a dep) and restore normal equalizing cleanly.
    return () => {
      ro?.disconnect();
    };
  }, [
    currentView,
    assignments,
    auxDefs,
    selectedTasks,
    draftAssignments,
    loadingAssignments,
    isDraftMode,
    cardBorders,
    selectedSlotKey,
    artboardScale,
    isAnyDragActive, // React to drag start/end so we can pause/restore cleanly.
  ]);

  // Helper used only inside breaks view wave rendering
  const slotRefType = (ref: string | null): "zone" | "rr" | "aux" => {
    if (!ref) return "zone";
    if (ref.startsWith("MRR") || ref.startsWith("WRR")) return "rr";
    if (/^Z\d+$/.test(ref)) return "zone";
    return "aux";
  };

  // Wrapped handlers so clicks on cards (or card sub-parts) set the unilateral marker pad.
  // IMPORTANT: We no longer auto-delegate to the parent onCardClick/onGenderClick here.
  // The rich marker pad (the drawn baseline with Placement Matrix / Last 5 / Insights + quick actions)
  // is now the primary thing that appears when you click a placement card.
  // Actions inside the pad (Lock / Coverage / Swap / Assign Sweeper) explicitly call the
  // original onCardClick / onGenderClick (which opens the full MarkerPad) + close the pad.
  // Clear is direct + fast. This prevents the "both pad + full drawer at once" clutter.
  const handleCardClickForPad = React.useCallback((k: string) => {
    onSlotToggle?.(k);
  }, [onSlotToggle]);

  const handleGenderClickForPad = React.useCallback((k: string) => {
    onSlotToggle?.(k);
  }, [onSlotToggle]);

  const renderPlacementPad = (
    slotKey: string,
    anchor: PlacementPadAnchor,
    hostId: string,
  ) => {
    if (useExternalPad) return null;
    if (selectedSlotKey !== slotKey) return null;
    return (
      <PlacementPad
        slotKey={slotKey}
        anchor={anchor}
        hostId={hostId}
        onClose={() => onSlotClose?.()}
        assignments={padDisplayAssignments}
        selectedTasks={selectedTasks}
        selectedDay={selectedDay}
        members={members}
        auxDefs={auxDefs}
        isDark={isDark}
        isCurrentNightLocked={isCurrentNightLocked}
        setBreakGroupForSlot={setBreakGroupForSlot}
        onAddCoverage={onAddCoverage}
        onLiveUnassign={onClearSlot ?? onLiveUnassign}
        onToggleLock={onToggleLock}
        onAssign={onAssign}
        onAddTask={onAddTask}
        onRemoveTask={onRemoveTask}
        onAssignSweeper={onAssignSweeper}
        onRequestEngineInsight={onRequestEngineInsight}
        scheduledUnassigned={scheduledUnassigned}
        allEligibleTms={allEligibleTms}
        onAddOnCall={onAddOnCall}
        onMarkUnavailable={onMarkUnavailable}
        boardPrerenderedFit={fitBySlot[slotKey]}
        isDraftMode={isDraftMode}
        draftAssignments={draftAssignments}
        weeklyRecentHistory={weeklyRecentHistory}
        insightsEnabled={placementPadInsightsEnabled}
        enableTmDragAssign={enableTmDragAssign}
      />
    );
  };

  const getLocs = (a: any) => {
    if (a.type === "zone") {
      // Static zone "locations" (area names) removed as placeholder/fake data.
      // Dynamic/recent placement history is handled separately elsewhere.
      return "";
    }
    if (a.type === "rr") {
      // Static RR side locations removed (were placeholder data).
      return "";
    }
    if (a.type === "aux") {
      const aux = auxDefs.find((x) => x.key === a.slotKey);
      return aux ? aux.locations.join(" · ") : "";
    }
    return "";
  };

  const accentFor = (a: any): string => {
    if (a.type === "zone") return getZoneColor(a.slotKey);
    if (a.type === "rr") {
      const num = parseInt((a.slotKey || "").replace(/\D/g, ""), 10) || 1;
      return getRRAccent(num);
    }
    return getAuxAccent(a.slotKey);
  };

  const chipLabel = (a: any): string => {
    if (a.type === "zone") {
      return `ZONE ${(a.slotKey || "").replace(/\D/g, "")}`;
    }
    if (a.type === "rr") {
      const num = (a.slotKey || "").replace(/\D/g, "");
      const side = (a.slotKey || "").startsWith("M") ? "M" : "W";
      const def = RR_DEFS.find((r) => r.num === parseInt(num, 10));
      return def ? `${def.label} ${side}` : `RR ${num} ${side}`;
    }
    const def = auxDefs.find((d) => d.key === a.slotKey);
    return def ? def.label : a.slotKey;
  };

  // Helper: compute the locations from the *most recent N placement events* (chronological last assignments)
  // for a TM's pad history. Used to make the Last 30 Spread grid + counts reflect the last 30 nights
  // assignments (not just any in a calendar window), so it matches what Last 5 shows and pulls full data.
  // Filters to prior to viewed day if beforeIso provided. Returns unique ui keys in recency order (newest first).

  // Build tmId → assignment reverse lookup for breaks view (only when needed)
  const tmToAssignment = React.useMemo(() => {
    const map: Record<string, any> = {};
    Object.values(assignments).forEach((a: any) => {
      if (a?.tmId) map[a.tmId] = a;
    });
    return map;
  }, [assignments]);

  // 3.5+ Paint measurement — fires after the browser has committed + painted the artboard.
  // This gives us the true "user sees the new day" number (data ready → pixels on screen).
  React.useEffect(() => {
    if (typeof window === 'undefined' || !nightId) return;

    // Double rAF ensures we measure after the paint has actually occurred.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const paintTs = performance.now();
        (window as any).__lastBoardPaintTs = paintTs;
        performance.mark('board-first-paint', { detail: { nightId } });

        // Optional: expose delta from data ready if available
        const dataReady = (window as any).__lastDataReadyTs;
        if (dataReady) {
          const paintDelta = paintTs - dataReady;
          (window as any).__lastDataToPaintMs = paintDelta;
        }
      });
    });
  }, [nightId]);

  return (
    <div className={isPrintPreview ? "print-artboard" : "builder-workspace sb-builder-compact"}>
      {/* Golden header: BIG 15 + day name + month/day-of-week + BREAKS dots
         on the left; GRAVE meta + week pills + GROUP selector on the right. */}
      <div
        className={`sheet-header flex-shrink-0 ${isPrintPreview ? "pb-1 mb-1" : "pb-1 mb-0.5"} ${
          !isPrintPreview && showWeekHealthBar && weekHealthDayDefs?.length
            ? "sb-sheet-header-with-health grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-x-3"
            : "flex items-end justify-between"
        }`}
      >
        {/* LEFT */}
        <div className={`flex items-end ${isPrintPreview ? "gap-3" : "gap-2"}`}>
          <div
            className="font-black tabular-nums leading-[0.78]"
            style={{
              fontSize: isPrintPreview ? 58 : 44,
              letterSpacing: "-3px",
              fontFamily: "var(--font-atkinson)",
              ...(currentView === "deployment"
                ? { color: isDark ? "#E5E5E7" : "#1C1C1E" }
                : {
                    color: "transparent",
                    WebkitTextStroke: `1.5px ${isDark ? "#9CA3AF" : "#1C1C1E"}`,
                    textShadow: "none",
                  }),
            }}
          >
            {selectedDay.dateNum}
          </div>
          <div className="-mb-0.5 flex flex-col">
            <div
              className="font-bold leading-none flex items-center gap-2"
              style={{ color: selectedDay.color, fontSize: isPrintPreview ? 26 : 22, letterSpacing: "-0.8px", fontFamily: "var(--font-atkinson)" }}
            >
              {currentView === "deployment" ? selectedDay.name : "Break Sheet"}
              {isCurrentNightLocked && (
                <span
                  className="no-print inline-flex items-center gap-1 text-[13px] px-2 py-0.5 rounded-full border"
                  style={{
                    background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                    borderColor: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.15)",
                    color: isDark ? "#F2F2F4" : "#1C1C1E",
                    fontSize: 11,
                    fontFamily: "var(--font-atkinson)",
                    letterSpacing: "0.5px",
                  }}
                  title="This day is locked — no changes allowed"
                >
                  <span className="ms" style={{ fontSize: 13 }}>lock</span>
                  LOCKED
                </span>
              )}
            </div>
            <div className="text-[11px] mt-0.5 leading-none" style={{ color: isDark ? "#9CA3AF" : "#4B5563" }}>
              {currentView === "deployment"
                ? `${selectedDay.monthYear} · Day ${selectedDayIndex + 1} of 7`
                : `${selectedDay.name} · ${selectedDay.monthYear}`}
            </div>
            {currentView === "deployment" ? (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[8.5px] font-bold tracking-[1px]" style={{ color: isDark ? "#E5E5E7" : "#1C1C1E", fontFamily: "var(--font-atkinson)" }}>BREAKS</span>
                <div className="flex gap-[2px]">
                  {[1, 2, 3].map((g) => (
                    <div
                      key={g}
                      className="w-[14px] h-[14px] rounded-full text-[8px] font-bold leading-none flex items-center justify-center tabular-nums"
                      style={{ background: isDark ? "#E5E5E7" : "#1C1C1E", color: isDark ? "#1C1C1E" : "#fff", fontFamily: "var(--font-atkinson)" }}
                      title={`Break ${g}: ${breakCounts[g as 1 | 2 | 3]} TM${breakCounts[g as 1 | 2 | 3] === 1 ? "" : "s"}`}
                    >
                      {breakCounts[g as 1 | 2 | 3] || ""}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mt-1.5">
                <span className="text-[10px] font-bold tabular-nums" style={{ color: isDark ? "#F2F2F4" : "#111" }}>{inRotationCount}</span>
                <span className="text-[8.5px] font-bold tracking-[1px]" style={{ color: isDark ? "#E5E5E7" : "#1C1C1E", fontFamily: "var(--font-atkinson)" }}>IN ROTATION</span>
                <span className="text-[8.5px] font-bold tracking-[1px] ml-1.5" style={{ color: isDark ? "#E5E5E7" : "#1C1C1E", fontFamily: "var(--font-atkinson)" }}>BREAKS</span>
                <div className="flex gap-[2px]">
                  {[1, 2, 3].map((g) => (
                    <div
                      key={g}
                      className="w-[14px] h-[14px] rounded-full text-[8px] font-bold leading-none flex items-center justify-center tabular-nums"
                      style={{ background: isDark ? "#E5E5E7" : "#1C1C1E", color: isDark ? "#1C1C1E" : "#fff", fontFamily: "var(--font-atkinson)" }}
                      title={`Break ${g}: ${breakCounts[g as 1 | 2 | 3]} TM${breakCounts[g as 1 | 2 | 3] === 1 ? "" : "s"}`}
                    >
                      {breakCounts[g as 1 | 2 | 3] || ""}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CENTER — compact week health floater (builder only) */}
        {!isPrintPreview && showWeekHealthBar && weekHealthDayDefs && weekHealthDayDefs.length > 0 ? (
          <div className="sb-sheet-header-health no-print flex min-w-0 items-end justify-center self-end px-1">
            <WeekHealthTracker
              visible
              variant="bar"
              placement="header-inline"
              isDark={isDark}
              healthLoading={weekHealthLoading}
              weekDailyHealths={weekDailyHealths}
              dayDefs={weekHealthDayDefs}
              selectedDayIndex={selectedDayIndex}
              onSelectDay={onWeekHealthSelectDay}
              onDismiss={onWeekHealthDismiss}
            />
          </div>
        ) : null}

        {/* RIGHT */}
        <div className="flex flex-col items-end gap-1.5">
          {currentView === "breaks" && (
            <div
              className="text-[9.5px] font-bold tracking-[1.2px] uppercase"
              style={{ color: isDark ? "#9CA3AF" : "#1C1C1E", fontFamily: "var(--font-atkinson)" }}
            >
              BY BREAK WAVE
            </div>
          )}

          {/* Week pills (internal nav — uses callback so board stays isolated) */}
          <div className="flex gap-[2px]">
            {Array.from({ length: 7 }).map((_, i) => {
              // We don't have the full DAY_DEFS here; the parent passes the visual state via selectedDayIndex.
              // For the tiny pills we reconstruct minimal visual from the active day color + index.
              // To keep exact fidelity we accept the 7 tiny pills as a presentational row driven by index.
              const isActive = i === selectedDayIndex;
              // Color is only accurate for the active day; others are neutral (matches original behavior in this context).
              const color = isActive ? selectedDay.color : undefined;
              return (
                <div
                  key={i}
                  onClick={() => onDayPillClick?.(i)}
                  className="min-w-[18px] h-[16px] px-1 text-[9px] flex items-center justify-center font-bold tracking-[-0.2px] rounded-[3px]"
                  style={{
                    background: isActive && color ? color : "transparent",
                    color: isActive ? "#fff" : (isDark ? "#9CA3AF" : "#6B7280"),
                    fontFamily: "var(--font-atkinson)",
                  }}
                  title={`Day ${i + 1}`}
                >
                  {["F","S","S","M","T","W","T"][i]}
                </div>
              );
            })}
          </div>

          {/* Group selector (Golden shows GROUP label + three numbered pills) */}
          {currentView === "deployment" && (
            <div className="flex items-center gap-1.5">
              <span className="text-[8.5px] font-bold tracking-[1px] text-[#1C1C1E]" style={{ fontFamily: "var(--font-atkinson)" }}>GROUP</span>
              <div className="flex gap-[3px]">
                {[1, 2, 3].map((g) => {
                  const isActive = breakGroup === g;
                  return (
                    <div
                      key={g}
                      onClick={() => onBreakGroupChange?.(g as 1 | 2 | 3)}
                      className="min-w-[15px] h-[15px] px-1 text-[9px] flex items-center justify-center font-bold rounded-[2px]"
                      style={{
                        background: isActive ? "#1C1C1E" : "#E5E5E7",
                        color: isActive ? "#fff" : "#6B7280",
                        fontFamily: "var(--font-atkinson)",
                      }}
                      title={`Break Group ${g}`}
                    >
                      {g}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Undo / Redo — kept in parent orchestrator chrome for now (they act on global history) */}
          {/* The original had them here; if they must live visually inside the artboard header they can be passed as slots later. */}
        </div>
      </div>

      <div className={`flex flex-col w-full ${isPrintPreview ? 'flex-1 min-h-0 overflow-hidden' : 'overflow-y-auto pb-8'}`}>
        {/* Task text edit pad (double-click any task row). Rendered at content root so available in both deployment + breaks. Portaled. */}
        {renderTaskTextEditPad()}
        {currentView === "deployment" ? (
          <>
            {/* ZONES — custom layout (ZONE_VISUAL_ORDER from constants):
                 Row 1: Z1 | Z3 | Z4 | Z5 | Z9
                 Row 2: Z2 | Z6 | Z7 | Z8 | Z10
                 (5-col CSS grid; child order = visual positions. Mirrored in print overview for PDF consistency.) */}
            <section className={`sb-builder-section ${isPrintPreview ? "mb-1" : "mb-0"}`}>
              <div className="sheet-section-header">
                <span className="label">ZONES</span>
                <div className="divider" />
                <span className="count">
                  {ZONE_DEFS.filter((d) =>
                    slotShowsFilled(d.key, assignments, isDraftMode, draftAssignments),
                  ).length} / 10 FILLED
                </span>
                {conflictingTms.size > 0 && showDigitalAssists && (
                  <span
                    className="ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-mono tracking-[0.5px] bg-[#B89708]/12 text-[#8B6910] dark:bg-[#B89708]/15 dark:text-[#E9B948] border border-[#B89708]/30"
                    title={`${conflictingTms.size} team member${conflictingTms.size > 1 ? 's' : ''} assigned to multiple slots this night`}
                  >
                    {conflictingTms.size} dup{conflictingTms.size > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div ref={zonesGridRef} className={zoneGridClass} style={{ gridAutoRows: "minmax(0, 1fr)" }}>
                {ZONE_VISUAL_ORDER.map((zKey, visualIdx) => {
                  const def = ZONE_DEFS.find((d) => d.key === zKey)!;
                  const key = def.key;
                  const idx = visualIdx; // visual position for entrance stagger in the laid-out grid
                  const accent = getZoneColor(key);
                  const a = displayAssignments[key] || {};
                  const prov = a.provenance || {};
                  const hasProv = prov.rationale || prov.fairnessSignals;

                  const cardContent = (
                    <>
                      <ZoneCard
                        def={def}
                        assignments={displayAssignments}
                        selectedTasks={selectedTasks}
                        setBreakGroupForSlot={setBreakGroupForSlot}
                        onCardClick={handleCardClickForPad}
                        loading={loadingAssignments}
                        borderColor={cardBorders[key]}
                        isDraftMode={isDraftMode}
                        draftInfo={draftAssignments[key]}
                        onRemoveTask={onRemoveTask}
                        onSetTaskColor={onSetTaskColor}
                        onEditTask={onEditTask}
                        onOpenTaskTextEdit={handleOpenTaskTextEdit}
                        isLocked={isCurrentNightLocked}
                        onLiveAssign={onLiveAssign}
                        onLiveUnassign={onLiveUnassign}
                        fitChip={showDigitalAssists ? fitBySlot[key] : undefined}
                        showDigitalAssists={showDigitalAssists}
                        focusedTmId={focusedTmId}
                        conflictingTms={conflictingTms}
                        tmConflictSlots={tmConflictSlots}
                      />
                      {activePlacementPad?.hostId === key &&
                        renderPlacementPad(activePlacementPad.slotKey, activePlacementPad.anchor, key)}
                    </>
                  );

                  return isPrintPreview ? (
                    <div key={key} className="relative h-full" data-slot-key={key} data-placement-host={key}>
                      {cardContent}
                    </div>
                  ) : (
                    <motion.div
                      key={key}
                      className={gridHostClass}
                      data-slot-key={key}
                      data-placement-host={key}
                      {...premiumEntrance}
                      {...premiumHoverLift}
                      custom={idx}
                      transition={premiumStagger(idx)}
                    >
                      {cardContent}
                    </motion.div>
                  );
                })}
              </div>
            </section>

            {/* RESTROOMS — Golden: 1 row × 5 cols */}
            <section className={`sb-builder-section ${isPrintPreview ? "mb-1" : "mb-0"}`}>
              <div className="sheet-section-header">
                <span className="label">RESTROOMS</span>
                <div className="divider" />
                <span className="count">
                  {RR_DEFS.reduce((acc, d) => {
                    const m = slotShowsFilled(`MRR${d.num}`, assignments, isDraftMode, draftAssignments);
                    const w = slotShowsFilled(`WRR${d.num}`, assignments, isDraftMode, draftAssignments);
                    return acc + (m ? 1 : 0) + (w ? 1 : 0);
                  }, 0)} / 10 FILLED
                </span>
              </div>
              <div ref={restroomsGridRef} className={rrGridClass} style={{ gridAutoRows: "minmax(0, 1fr)" }}>
                {RR_DEFS.map((def, idx) => {
                  const key = `RR${def.num}`; // physical key for marker pad (sides use MRR/WRR internally)
                  const accent = getRRAccent(def.num);
                  const mKey = `MRR${def.num}`;
                  const wKey = `WRR${def.num}`;
                  const rrHostId = `rr-${def.num}`;

                  const cardContent = (
                    <>
                      <RRCard
                        def={def}
                        assignments={displayAssignments}
                        selectedTasks={selectedTasks}
                        setBreakGroupForSlot={setBreakGroupForSlot}
                        onGenderClick={handleGenderClickForPad}
                        loading={loadingAssignments}
                        borderColor={cardBorders[`RR${def.num}`] || cardBorders[mKey] || cardBorders[wKey]}
                        isDraftMode={isDraftMode}
                        draftInfoW={draftAssignments[wKey]}
                        draftInfoM={draftAssignments[mKey]}
                        onRemoveTask={onRemoveTask}
                        onSetTaskColor={onSetTaskColor}
                        onEditTask={onEditTask}
                        onOpenTaskTextEdit={handleOpenTaskTextEdit}
                        isLocked={isCurrentNightLocked}
                        onLiveAssign={onLiveAssign}
                        onLiveUnassign={onLiveUnassign}
                        fitChipW={showDigitalAssists ? fitBySlot[wKey] : undefined}
                        fitChipM={showDigitalAssists ? fitBySlot[mKey] : undefined}
                        showDigitalAssists={showDigitalAssists}
                        focusedTmId={focusedTmId}
                        conflictingTms={conflictingTms}
                        tmConflictSlots={tmConflictSlots}
                      />
                      {activePlacementPad?.hostId === rrHostId &&
                        renderPlacementPad(activePlacementPad.slotKey, activePlacementPad.anchor, rrHostId)}
                    </>
                  );

                  return isPrintPreview ? (
                    <div
                      key={def.num}
                      className="relative h-full"
                      data-slot-key={key}
                      data-pad-host={rrHostId}
                      data-placement-host={rrHostId}
                    >
                      {cardContent}
                    </div>
                  ) : (
                    <motion.div
                      key={def.num}
                      className={gridHostClass}
                      data-slot-key={key}
                      data-pad-host={rrHostId}
                      data-placement-host={rrHostId}
                      {...premiumEntrance}
                      {...premiumHoverLift}
                      custom={idx}
                      transition={premiumStagger(idx)}
                    >
                      {cardContent}
                    </motion.div>
                  );
                })}
              </div>
            </section>

            {/* AUXILIARY */}
            <section className={`sb-builder-section ${isPrintPreview ? "mb-2" : "mb-0"}`} style={{ position: 'relative' }}>
              <div className="sheet-section-header">
                <span className="label">AUXILIARY</span>
                <div className="divider" />
                <span className="count">
                  {auxDefs.filter((d) =>
                    (d.role !== "blank" || !!d.label) && slotShowsFilled(d.key, assignments, isDraftMode, draftAssignments),
                  ).length} / {auxDefs.filter((d) => d.role !== "blank" || !!d.label).length} FILLED
                </span>
                {!isPrintPreview && !isCurrentNightLocked && (
                  <div className="flex items-center gap-1 ml-1 no-print">
                    <motion.button
                      type="button"
                      className="sb-aux-slot-btn w-5 h-5 flex items-center justify-center rounded text-[12px] font-bold leading-none disabled:opacity-30"
                      onClick={onAddAuxSlot}
                      disabled={!canAddAux}
                      title="Add blank aux slot"
                      aria-label="Add aux slot"
                      {...premiumButton}
                      transition={premiumSpring}
                    >
                      +
                    </motion.button>
                    <motion.button
                      type="button"
                      className="sb-aux-slot-btn w-5 h-5 flex items-center justify-center rounded text-[12px] font-bold leading-none disabled:opacity-30"
                      onClick={onRemoveAuxSlot}
                      disabled={!canRemoveAux}
                      title="Remove last empty aux slot"
                      aria-label="Remove empty aux slot"
                      {...premiumButton}
                      transition={premiumSpring}
                    >
                      −
                    </motion.button>
                  </div>
                )}
              </div>
              <div
                ref={auxGridRef}
                className={auxGridClass}
                style={{
                  ...(isPrintPreview
                    ? { gridTemplateColumns: `repeat(${auxDefs.length}, minmax(0, 1fr))` }
                    : {}),
                  gridAutoRows: "minmax(0, 1fr)",
                }}
              >
                {!isPrintPreview ? (
                  <AnimatePresence>
                    {auxDefs.map((def, idx) => {
                      const key = def.key;
                      const accent = getAuxAccent(key, def.role);
                      const a = displayAssignments[key] || {};
                      const prov = a.provenance || {};
                      const hasProv = prov.rationale || prov.fairnessSignals;

                      const cardContent = (
                        <>
                          <AuxCard
                            def={def}
                            assignments={displayAssignments}
                            selectedTasks={selectedTasks}
                            setBreakGroupForSlot={setBreakGroupForSlot}
                            onCardClick={handleCardClickForPad}
                            loading={loadingAssignments}
                            borderColor={cardBorders[key]}
                            isDraftMode={isDraftMode}
                            draftInfo={draftAssignments[key]}
                            onRemoveTask={onRemoveTask}
                            onSetTaskColor={onSetTaskColor}
                            onEditTask={onEditTask}
                            onOpenTaskTextEdit={handleOpenTaskTextEdit}
                            isLocked={isCurrentNightLocked}
                            onLiveAssign={onLiveAssign}
                            onLiveUnassign={onLiveUnassign}
                            fitChip={showDigitalAssists ? fitBySlot[key] : undefined}
                            showDigitalAssists={showDigitalAssists}
                            focusedTmId={focusedTmId}
                            conflictingTms={conflictingTms}
                            tmConflictSlots={tmConflictSlots}
                            onSetAuxRole={onSetAuxRole}
                            onSetAuxLabel={onSetAuxLabel}
                          />
                          {activePlacementPad?.hostId === key &&
                            renderPlacementPad(activePlacementPad.slotKey, activePlacementPad.anchor, key)}
                        </>
                      );

                      const entrance = reducedMotion ? premiumEntranceReduced : premiumEntrance;
                      const exitTrans = reducedMotion 
                        ? { ...premiumSpringReduced } 
                        : { ...premiumSpring, stiffness: 300, damping: 22 };

                      return (
                        <motion.div
                          key={key}
                          layout  // smooth reflow of siblings when aux count changes (add/remove)
                          className={gridHostClass}
                          data-slot-key={key}
                          data-placement-host={key}
                          {...entrance}
                          {...premiumHoverLift}
                          custom={idx}
                          transition={premiumStagger(idx)}
                          exit={{
                            opacity: 0,
                            scale: 0.92,
                            y: 8,
                            transition: exitTrans
                          }}
                        >
                          {cardContent}
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                ) : (
                  auxDefs.map((def, idx) => {
                    const key = def.key;
                    const accent = getAuxAccent(key, def.role);
                    const a = displayAssignments[key] || {};
                    const prov = a.provenance || {};
                    const hasProv = prov.rationale || prov.fairnessSignals;

                    const cardContent = (
                      <>
                        <AuxCard
                          def={def}
                          assignments={displayAssignments}
                          selectedTasks={selectedTasks}
                          setBreakGroupForSlot={setBreakGroupForSlot}
                          onCardClick={handleCardClickForPad}
                          loading={loadingAssignments}
                          borderColor={cardBorders[key]}
                          isDraftMode={isDraftMode}
                          draftInfo={draftAssignments[key]}
                          onRemoveTask={onRemoveTask}
                          onSetTaskColor={onSetTaskColor}
                          onEditTask={onEditTask}
                          onOpenTaskTextEdit={handleOpenTaskTextEdit}
                          isLocked={isCurrentNightLocked}
                          onLiveAssign={onLiveAssign}
                          onLiveUnassign={onLiveUnassign}
                          fitChip={showDigitalAssists ? fitBySlot[key] : undefined}
                          showDigitalAssists={showDigitalAssists}
                          focusedTmId={focusedTmId}
                          conflictingTms={conflictingTms}
                          tmConflictSlots={tmConflictSlots}
                          onSetAuxRole={onSetAuxRole}
                          onSetAuxLabel={onSetAuxLabel}
                        />
                        {activePlacementPad?.hostId === key &&
                          renderPlacementPad(activePlacementPad.slotKey, activePlacementPad.anchor, key)}
                      </>
                    );

                    return (
                      <div key={key} className={`relative ${isPrintPreview ? 'h-full' : ''}`} data-slot-key={key} data-placement-host={key}>
                        {cardContent}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Rotation health as compact side drawer/indicator (small section of right edge, not full height).
                  Click to expand drawer with full details + Clear / Run engine buttons.
                  Positioned off to the side (right margin), small height so it doesn't overtake/overlap the grid or empty states.
                  Builder-only via !isPrintPreview. */}
              {!isPrintPreview && (
                <RotationHealthFloater
                  visible
                  auxDefs={auxDefs}
                  assignments={displayAssignments}
                  fitBySlot={fitBySlot || {}}
                  isDraftMode={isDraftMode}
                  draftAssignments={draftAssignments}
                  placement="side-right-collapsed"
                  weekDailyHealths={weekDailyHealths}
                  selectedDayDateKey={currentIso}
                  weekHealthLoading={weekHealthLoading}
                  // Engine controls for the drawer (clear board + run xAI engine for rotation health)
                  canRunEngine={canRunEngine}
                  onRunEngine={onRunXaiEngine}
                  onClear={onClearBoard}
                  running={engineRunning}
                  onApplyDraft={onApplyDraft}
                  onDiscardDraft={onDiscardDraft}
                  draftGrokExplanation={draftGrokExplanation}
                  isCurrentNightLocked={isCurrentNightLocked}
                />
              )}
            </section>
          </>
        ) : (
          <>
            {/* 3 Break Wave Columns — Golden tight layout */}
            <div className="grid grid-cols-3 gap-1 mb-1.5">
              {[1, 2, 3].map((wave) => {
                // Always derive wave membership from the live Zustand assignments.
                // This is the exact same data source the BreakBadge pills read on the
                // deployment view. Pill taps via setBreakGroupForSlot mutate the store
                // directly, so the break sheet columns now instantly reflect the selected
                // break groups without waiting for realtime, worker snapshots, or day reload.
                // (processedWaves is a day-switch perf cache only; live mutations win for
                // the on-screen "breaks" view and for what the operator just selected.)
                const waveAssignments: any[] = Object.entries(assignments)
                  .map(([slotKey, a]: [string, any]) => {
                    if (!a?.tmId || (a.breakGroup ?? 0) !== wave) return null;
                    return {
                      ...a,
                      slotKey,
                      type: slotRefType(slotKey),
                      tmName: a.tmName,
                    };
                  })
                  .filter(Boolean) as any[];

                const count = waveAssignments.length;
                const waveColor =
                  wave === 1 ? "#1a2332" : wave === 2 ? "#5a6b7d" : "#c8d3dc";

                return (
                  <div
                    key={wave}
                    className="border border-[#E5E5E7] dark:border-[#3A3A3C] rounded-[3px] bg-white dark:bg-[#1C1C1E] overflow-hidden flex flex-col"
                    style={{ borderTop: `3px solid ${waveColor}` }}
                  >
                    <div className="px-3 pt-2 pb-1 flex items-end gap-2.5 border-b border-[#F2F2F4] dark:border-[#2C2C2E]">
                      <div
                        className="font-black tabular-nums leading-none text-[#1C1C1E] dark:text-[#F2F2F4]"
                        style={{ fontSize: 42, letterSpacing: "-2px", fontFamily: "var(--font-atkinson)" }}
                      >
                        {wave}
                      </div>
                      <div className="-mb-0.5">
                        <div
                          className="font-extrabold tracking-[1px] uppercase leading-none text-[#1C1C1E] dark:text-[#F2F2F4]"
                          style={{ fontSize: 13, fontFamily: "var(--font-atkinson)" }}
                        >
                          Break {wave}
                        </div>
                        <div className="text-[10px] text-[#6B7280] dark:text-[#8E8E93] mt-0.5">{count} people</div>
                      </div>
                    </div>

                    <div className="px-2 pb-1 pt-1 space-y-1 text-[9px]">
                      {["zone", "rr", "aux"].map((cat) => {
                        const items = waveAssignments.filter((a: any) => (a as any).type === cat);
                        if (!items.length) return null;

                        const label = cat === "zone" ? "ZONES" : cat === "rr" ? "RESTROOMS" : "AUXILIARY";

                        return (
                          <div key={cat}>
                            <div className="flex items-center gap-1 mb-1">
                              <span className="text-[#6B7280] dark:text-[#8E8E93] font-bold tracking-[1.2px] uppercase text-[7.5px]" style={{ fontFamily: "var(--font-atkinson)" }}>{label}</span>
                              <div className="flex-1 h-px bg-[#E5E7EB] dark:bg-[#3A3A3C]" />
                            </div>
                            <div className="space-y-1">
                              {items.map((a: any, idx: number) => {
                                const accent = accentFor(a);
                                const showChip = !a.notPlaced;
                                return (
                                  <div key={idx} className="flex items-center gap-1.5">
                                    <div className="flex-1 border-b border-dashed border-[#C8C8CC] dark:border-[#48484A] pb-px min-w-0">
                                      <div className="font-semibold text-[#111] dark:text-[#F2F2F4] truncate text-[9px] leading-tight">
                                        {a.tmName || " "}
                                      </div>
                                    </div>
                                    {showChip ? (
                                      <div
                                        className="text-[8.5px] font-extrabold tracking-[0.4px] px-1.5 py-px rounded-[2px] whitespace-nowrap border bg-white dark:bg-[#2C2C2E]"
                                        style={{ borderColor: accent, color: accent, fontFamily: "var(--font-atkinson)" }}
                                      >
                                        {chipLabel(a)}
                                      </div>
                                    ) : (
                                      <div className="w-3" />
                                    )}
                                    <span className="text-[7.5px] text-[#9CA3AF] uppercase tracking-[0.5px] w-3 text-center">
                                      {showChip && a.type === "rr" ? ((a.slotKey || "").startsWith("M") ? "M" : "W") : ""}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* OVERLAPS — Golden full-width pinned section */}
            <section
              className={`sb-builder-section pt-1.5 overlaps-section${isPrintPreview ? " mt-auto" : ""}`}
              data-print-target="overlaps"
            >
              <div className="sheet-section-header">
                <span className="label">OVERLAPS</span>
                <div className="divider" />
              </div>

              <div className="space-y-2">
                {[
                  {
                    time: "11p – 1a (swings)",
                    key: "PM" as const,
                    dayName: selectedDay.name,
                    dateNum: selectedDay.dateNum,
                    headerColor: selectedDay.color,
                  },
                  {
                    time: "5a – 7a (days)",
                    key: "AM" as const,
                    dayName: amOverlapDayName,
                    dateNum: amOverlapDateNum,
                    headerColor: nextDayColor,
                  },
                ].map((row) => (
                  <div key={row.key}>
                    <div className="flex items-baseline gap-2 pl-1 mb-0.5">
                      <div
                        className="font-black tabular-nums leading-none"
                        style={{ fontSize: 22, color: isDark ? "#E5E5E7" : "#1C1C1E", fontFamily: "var(--font-atkinson)" }}
                      >
                        {row.dateNum}
                      </div>
                      <div
                        className="font-bold tracking-[-0.4px] leading-none"
                        style={{ fontSize: 16, color: row.headerColor, fontFamily: "var(--font-atkinson)" }}
                      >
                        {row.dayName}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-[60px] flex-shrink-0 text-[10px] font-bold tracking-[0.4px] text-[#1C1C1E]" style={{ fontFamily: "var(--font-atkinson)" }}>
                        {row.time}
                      </div>
                      <div className={overlapGridClass}>
                        {Array.from({ length: 6 }).map((_, i) => {
                          const slotKey = `OL-${row.key}-${i}`;
                          return (
                            <div
                              key={i}
                              className={gridHostClass}
                              data-slot-key={slotKey}
                              data-placement-host={slotKey}
                            >
                              <OverlapSlot
                                slotKey={slotKey}
                                assignments={displayAssignments}
                                selectedTasks={selectedTasks}
                                onCardClick={handleCardClickForPad}
                                loading={loadingAssignments}
                                isDraftMode={isDraftMode}
                                draftInfo={draftAssignments[slotKey]}
                                onRemoveTask={onRemoveTask}
                                onSetTaskColor={onSetTaskColor}
                                onEditTask={onEditTask}
                                onOpenTaskTextEdit={handleOpenTaskTextEdit}
                                isLocked={isCurrentNightLocked}
                                onLiveAssign={onLiveAssign}
                                onLiveUnassign={onLiveUnassign}
                                fitChip={showDigitalAssists ? fitBySlot[slotKey] : undefined}
                                showDigitalAssists={showDigitalAssists}
                                focusedTmId={focusedTmId}
                                conflictingTms={conflictingTms}
                                tmConflictSlots={tmConflictSlots}
                              />
                              {activePlacementPad?.hostId === slotKey &&
                                renderPlacementPad(
                                  activePlacementPad.slotKey,
                                  activePlacementPad.anchor,
                                  slotKey,
                                )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>

      {/* Sheet footer — single aligned row (brand · version · page) */}
      <div
        className={`sheet-footer flex-shrink-0 flex items-center justify-between gap-3 text-[9pt] leading-none tracking-[0.1px] ${
          isPrintPreview
            ? "pt-1 border-t border-[#E5E5E7]"
            : "pt-2 mt-3 border-t border-black/5 dark:border-white/[0.07]"
        }`}
        style={{
          color: isDark ? "#9CA3AF" : "#9CA3AF",
          fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))",
        }}
      >
        <div className="min-w-0 truncate">
          <span className="font-bold tracking-[1px]" style={{ color: isDark ? "#E5E5E7" : "#1C1C1E" }}>
            SBS
          </span>
          <span className="mx-1 opacity-60">©</span>
          <span style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}>Weekly Zone Deployment Book</span>
          <span className="mx-1 opacity-40">—</span>
          <span className="font-semibold tracking-[1px]" style={{ color: isDark ? "#E5E5E7" : "#1C1C1E" }}>
            GRAVES
          </span>
        </div>
        <div className="shrink-0 tabular-nums">{shiftBuilderVersionLabel()}</div>
        <div
          className="shrink-0 tabular-nums text-right"
          style={{ color: isDark ? "#9CA3AF" : "#6B7280" }}
        >
          — {currentView === "deployment" ? selectedDayIndex * 2 + 1 : selectedDayIndex * 2 + 2} of 14 —
        </div>
      </div>

    </div>
  );
});

export default ShiftBuilderBoard;
