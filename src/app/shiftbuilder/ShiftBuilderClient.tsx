"use client";

import React, { useState, useEffect, useRef, useCallback, useTransition, useDeferredValue } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import {
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
// NOTE: useDraggable/useDroppable are still used inline by ZoneCard, RRCard, AuxCard,
// OverlapSlot — they'll be removed from this import during Phase 3 when those
// components are extracted to components/ and import useSlotDnd from lib instead.
// NOTE: Heavy data.ts functions dynamically imported below to fix Turbopack "module factory is not available" HMR errors.
// Only types remain as type-only import (zero runtime cost).
import type { CatalogTask, NightSlotTask, ZoneDetailEntry } from "@/lib/shiftbuilder/data";
import { uiToDb, dbToUi, type SlotType } from "@/lib/shiftbuilder/slot-keys"; // auxDbKeyToDef extracted, no longer used here
import { useShiftHistory, type Snapshot } from "@/lib/shiftbuilder/useShiftHistory";
// Command palette (and its hook) are loaded dynamically on first open to shrink
// the static dependency graph of this very large file and stop Turbopack module factory errors.

import {
  // Single source of truth — do NOT re-declare these locally in this file.
  // (Some were extracted; unused imports cleaned in production pass.)
  validatePlacementOrder,
  isEligibleForSlot,
  getSlotsInPlacementOrder,
  type AuxDef,
  type AuxRole,
} from "@/lib/shiftbuilder/placement";
import {
  createBlankAuxSlot,
  findRemovableEmptyAuxSlot,
  applyAuxRole,
  applyAuxLabel,
  defaultAuxDefsForNewNight,
  ensureAdminFirst,
} from "@/lib/shiftbuilder/auxLayout";
import { updateNightTmStatus } from "@/lib/shiftbuilder/sudoActions";
// tmCommands functions are dynamically imported below to avoid pulling heavy deps
// (e.g. useCommandActions transitive) into the static module graph of this giant file.
// This follows the established pattern to prevent Turbopack "module factory is not available" HMR errors.
// See comments around LazyCommandPalette and other await import() sites.
// runWeightedPlanner + logEngineRunSummary dynamically imported inside the engine handler (placement is a heavy module)
import type { SlotRanking } from "@/lib/shiftbuilder/placement";
// EngineRulesContext extracted; import removed to clean unused.
// buildDefaultAdjacency dynamically imported inside the engine handler (any static edge into scoring still triggers Turbopack "module factory" errors on this giant file, per the pattern for placement/grok/data/etc.)
// getActiveEngineConfig dynamically imported (engineConfig is small but any static edge into heavy modules still triggers Turbopack factory issues after the big refactor)
import type { EngineConfig } from "@/lib/shiftbuilder/engineConfig";
// All remaining data.ts functions (preferences, channels, locked, etc.) dynamically imported to eliminate the last static edge causing Turbopack module factory HMR errors.
// Scheduled data is now fetched via /api/shiftbuilder/scheduled-roster to avoid client-side admin client creation.
// grokEngine (buildGrokEngineSnapshot / mergeGrokOverridesIntoDraft) dynamically imported in handlers to shrink HMR surface
// GrokEngineSnapshot extracted; import removed (dynamic where needed).
// Command palette and Sudo surfaces are *fully dynamically loaded* (the Lazy* modules
// themselves are imported via `import()` inside effects/handlers, not at the top level
// of this file). This is the current state of the long-running "shrink the static
// dependency graph" effort to stop Turbopack from treating useCommandActions (and
// other heavy modules) as required from the giant Client at module evaluation time.
// XAISphere import removed — was creating a static dependency chain through ./xai → @/lib/xai barrel → grokIntelligence.ts
// If the sphere is still needed, it should be dynamically imported inside the render where the panel is toggled.
import { OpsAuthProvider, useOpsAuth } from "@/lib/auth/opsAuth";
import {
  logDeploymentChange,
  type DeploymentChangeAction,
} from "@/app/today/lib/todayChangeLog";
import { PinGate } from "./components/PinGate";
import {
  PrintCommandCenter,
  type PrintConfig,
} from "./components/PrintCommandCenter";
import { PrintExportProgressOverlay } from "./components/PrintExportProgressOverlay";
import {
  buildPrintQueue,
  applyCustomQueueOrder,
  saveLastPrintConfig,
  tonightPrintConfig,
  fullWeekPrintConfig,
} from "./print/printConfigUtils";
import { buildOverviewArtboardHTML, type OverviewNight } from "./print/printOverviewTables";
import { buildCoverPageArtboardHTML } from "./print/printCoverPage";
import { useShiftCompletion } from "@/hooks/useShiftCompletion";
// ── Phase 1 extractions — pure code moved to lib/shiftbuilder ─────────────────
import {
  startOfShiftWeek, currentShiftDate, daysBetween, addDays, sameDay,
  SHIFT_DAY_COLORS, MONTH_LONG, DAY_LONG,
  buildDayDefs,
  buildNavDayStrip,
  navIdForWeekDay,
  formatLocalDateISO, parseLocalDateISO,
} from "@/lib/shiftbuilder/dateUtils"; // formatWeekLabel, MONTH_SHORT, rosterWeekStartISO, isDayInRosterWeek, DayDef pruned (unused after extractions; keep list minimal for lint)
import {
  readWeeklyRosterScheduledFromStorage,
} from "@/lib/shiftbuilder/debugSessionLog"; // debugSessionLog pruned (unused after extraction)
import {
  assignmentTmId,
  boardTmId,
  boardTmIdsFromScheduled,
  buildTmLookupIndex,
  resolveTmFromLookup,
} from "@/lib/shiftbuilder/tmIdentity";
import {
  ZONE_DEFS, RR_DEFS, BLANK_AUX_DEFS, MAX_AUX_SLOTS, EXTRA_AUX_COLORS,
  ZONE_ICONS, RR_ICONS, AUX_ICONS, getAuxIcon,
  ZONE_COLORS, getZoneColor, RR_COLORS, getRRAccent, AUX_COLORS, getAuxAccent,
  type BreakGroup,
  type ActiveBreakGroupFilter,
  BREAK_GROUP_OVERLAPS,
  nextBreakGroup,
  COVERAGE_BAR_H,
} from "@/lib/shiftbuilder/constants";
import { handleSpotlightMove } from "@/lib/shiftbuilder/spotlightMove";
import { usePencilHover } from "@/lib/shiftbuilder/usePencilHover";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import FloatingNav from "./components/FloatingNav";
import { useCurrentNight } from "./hooks/useCurrentNight";
import WeeklyOverview from "./components/WeeklyOverview";
// useShiftData: small, data-only orchestration hook (Slice 1 of Production Stabilization).
// It wraps useCurrentNight + store + liveCache for hydration/effective values.
// Intentionally tiny with no UI/CommandPalette/useCommandActions transitive deps.
// Added as part of shrinking the static module graph of this giant file.
// See the long comments below about Lazy* + effect-driven dynamic imports for
// anything that must not be required at Client evaluation time.
import { useShiftData } from "./hooks/useShiftData";
import { useLiveAssignments } from "@/lib/shiftbuilder/useLiveAssignments";
import {
  initLiveCacheForNight,
  teardownAllLiveCache,
  liveAssignmentsStore,
  mirrorMainAssignmentsToLiveStore,
  getBoardAssignmentsDayKey,
  buildPadAssignmentsFromStore,
  nightDateKey,
} from "@/lib/shiftbuilder/liveCache";
import {
  GRAVES_DEFAULT_SCHEDULE_CHANGED_EVENT,
  invalidateNightCoreQueries,
  patchNightCoreAssignmentsCache,
  patchNightCoreAuxLayoutCache,
  patchNightSecondaryTasksCache,
} from "@/lib/shiftbuilder/scheduleCacheSync";
import {
  hydrateNightForPrint,
  nextFrames as printNextFrames,
  waitForPrintArtboardSettled,
} from "./print/printHydrateNight";
import { generatePrintPreviewGoldenPages } from "./print/printPreviewPipeline";
import { postProcessBreaksArtboard } from "./print/breaksArtboard";
import { exportGoldenPdf } from "./print/exportPdf";
import {
  mountGoldenPrintSession,
  runBrowserPrint,
  waitForGoldenRenderSettled,
} from "./print/printSession";
import { LivePrintPreviewArtboard } from "./print/LivePrintPreviewArtboard";

// === TEMPORARY DEBUG EXPOSURE (dev only) ===
// Allows console inspection of the two main stores the user was trying to access.
// Usage in console:
//   __liveAssignmentsStore.getState().assignmentsByNight["2026-06-01"]
//   __useShiftBuilderStore.getState().assignments["Z9"]
if (typeof window !== 'undefined') {
  (window as any).__liveAssignmentsStore = liveAssignmentsStore;
  (window as any).__useShiftBuilderStore = useShiftBuilderStore;
  (window as any).__getShiftBuilderDebugState = () => ({
    liveAssignments: liveAssignmentsStore.getState(),
    shiftBuilder: useShiftBuilderStore.getState(),
  });
  console.log('%c[ShiftBuilder] Debug stores exposed on window: __liveAssignmentsStore, __useShiftBuilderStore, __getShiftBuilderDebugState()', 'color:#0a0; font-weight: bold');
}
// ── Phase 2 extractions — primitive UI components ─────────────────────────────
// Extracted components now imported from ./components (Phase cleanups).
// (Some like AssignmentLine, TaskRow etc. may still be referenced via other paths or were partially inlined; cleaned unused top-level.)

import RosterItem from "./components/RosterItem";
import VirtualRosterList from "./components/VirtualRosterList";
import InteractiveStage from "./components/InteractiveStage";
import ShiftBuilderBoard, { type ShiftBuilderBoardProps } from "./components/ShiftBuilderBoard";
import PlacementPad from "./components/PlacementPad";
import { BuilderCanvasVeil, BuilderLoadingShell } from "./components/builderPrimitives";
import RosterRail from "./components/RosterRail";
import { ProvenanceGlass } from "./components/ProvenanceGlass";
import { OpsStatusBar, ensureOpsStatusBar, hideOpsStatusBar, updateOpsStatusBarContent } from "./components/OpsStatusBar";
// CanvasEngineCluster removed (its week/rotation health box + pill was the "old" one overtaking the surface).
// Rotation health is now the compact side drawer in RotationHealthFloater (with Clear/Run engine inside).
import type { EngineRunPhase, CoverageEngineRunOptions } from "./components/CanvasEngineCluster";
import { WeekHealthTracker } from "./components/WeekHealthTracker";
import {
  stageTopInsetPx,
  builderStageBottomInsetPx,
  BUILDER_CANVAS_MAX_WIDTH_PX,
} from "./components/canvasPillGlass";
import {
  computeShiftRotationHealth,
  computeDailyHealthPercent,
  computeWeekAverageHealth,
  filterWeeklyHistoryThroughNight,
  getWeekRepeatViolations,
  suggestLocalRotationMoves,
  type WeekRepeatViolation,
} from "./components/shiftRotationHealth";
import {
  computeSlotPlacementFit,
  resolveSlotAssignmentRow,
  memberToPlacementProfile,
  type SlotAssignmentRow,
} from "./components/placementFitForSlot";
import type { PlacementTmProfile } from "./components/placementPadHelpers";
import { usePlacementFitMap } from "./hooks/usePlacementFitMap";
import {
  collectDeploymentSlotKeys,
  nightIsoFromDate,
  shouldShowPlacementFitChip,
} from "./components/placementPadHelpers";
import {
  allWeekPlacementHistoriesCached,
  ensureWeekPlacementHistories,
  getCachedWeekPlacementHistories,
} from "./lib/weekPlacementHistoriesCache";
import { ShiftBuilderLaunchpad } from "./components/ShiftBuilderLaunchpad";
// LazyCommandPalette and LazySudoWindow are now dynamically imported (see below) to keep
// their (and their transitive deps like useCommandActions) out of the initial static
// module graph of this giant file. This is the latest step in the long-running effort
// to eliminate Turbopack "module factory is not available" errors during Client evaluation/HMR.
import { 
  useShiftBuilderStore, 
  useAssignments, 
  useDraftAssignments,
  useAuxDefs,
} from "./store/useShiftBuilderStore";
import { createRoot, Root } from "react-dom/client";

/** Body-mounted launchpad shell — must not intercept clicks when canvas is active. */
const LAUNCHPAD_ROOT_ID = "shiftbuilder-launchpad-root";

function setLaunchpadRootVisible(container: HTMLDivElement, visible: boolean) {
  container.style.transition =
    "opacity var(--sb-dur-fast, 0.22s) var(--sb-spring-gentle, ease)";
  if (visible) {
    container.style.display = "block";
    container.style.visibility = "visible";
    container.style.pointerEvents = "auto";
    requestAnimationFrame(() => {
      container.style.opacity = "1";
    });
  } else {
    container.style.opacity = "0";
    container.style.pointerEvents = "none";
    window.setTimeout(() => {
      if (container.style.opacity === "0") {
        container.style.display = "none";
        container.style.visibility = "hidden";
      }
    }, 240);
  }
}

/** Defensive teardown when leaving ShiftBuilder (avoids invisible full-screen blockers). */
function teardownShiftBuilderBodyChrome() {
  if (typeof document === "undefined") return;
  document.getElementById(LAUNCHPAD_ROOT_ID)?.remove();
  const wasPrinting = document.body.classList.contains("printing-dual-mode");
  document.body.classList.remove("printing-dual-mode");
  document.querySelector(".print-dual-container")?.remove();
  document.getElementById("__pcc-print-override")?.remove();
  if (!wasPrinting) return;
  Array.from(document.body.children).forEach((child) => {
    const el = child as HTMLElement;
    if (el.style.display === "none" && el.tagName !== "SCRIPT" && el.tagName !== "STYLE") {
      el.style.display = "";
    }
  });
}
// Phase 4 — extracted hooks
import { useTheme } from "./hooks/useTheme";
import { useRosterPanels } from "./hooks/useRosterPanels";
import { useToast } from "./hooks/useToast";
import {
  useZoom,
  NATURAL_WIDTH,
  NATURAL_HEIGHT,
  isTabletTouchDevice,
  type StageInsets,
} from "./hooks/useZoom";
import { useStagePinchPan } from "./hooks/useStagePinchPan";


// =============================================================================
// CARD RENDERERS — Golden-faithful (matches ZDS Goldens/*.png anatomy):
//   • thick colored top stripe
//   • label in accent color, uppercase, condensed
//   • single black square badge top-right showing the assigned break group
//     (click to cycle 1 → 2 → 3 → 1)
//   • dashed underline(s) for the TM name slot (form-field aesthetic)
//   • whole card is the drop target for roster drag & a click target for the
//     quick-action fan
// =============================================================================

// BreakBadge, AssignmentLine, ZoneCard, RRCard, AuxCard, OverlapSlot now imported from components/ above.

// Coverage helpers — support "Add Coverage" command (now imported from shared lib to eliminate duplication with today/lib and future surfaces).
import {
  getSlotAccentColor,
  getSlotCoverageLabel,
  expandCoverageToKeys,
} from "@/lib/shiftbuilder/coverageHelpers";

/**
 * CoverageBar — rendered at the very bottom of a zone or RR card to show
 * that the TM is pulling double duty covering another slot.
 * Background is the accent color of the SOURCE slot.
 */
// RRCard, AuxCard, OverlapSlot (and their sub-components) now imported from components/ above.

// Compact header overflow menu — houses low-usage actions (Print, Lock &
// Finalize) so the primary header bar stays short. ESC and outside-click
// dismiss; the menu is keyboard-navigable via the native button focus order.
interface HeaderOverflowProps {
  onRunEngine: () => void;
  onPrint: () => void;
  onAddAuxSlot: () => void;
  // null when there's nothing to remove (we're at the default 5); the menu
  // item renders disabled in that case so the operator can see the action
  // exists but is currently unavailable.
  onRemoveAuxSlot: (() => void) | null;
  lastAuxSlotLabel: string | null;
}

const HeaderOverflow: React.FC<HeaderOverflowProps & { onLockDay?: () => void }> = ({ onRunEngine, onPrint, onAddAuxSlot, onRemoveAuxSlot, lastAuxSlotLabel, onLockDay }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="h-7 w-7 rounded-md border border-[#E5E5E7] bg-white text-[#6B7280] hover:bg-[#F4F4F6] flex items-center justify-center"
        aria-label="More actions"
        title="More actions"
        aria-expanded={open}
      >
        <span className="ms" style={{ fontSize: 18, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}>more_horiz</span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 w-[200px] rounded-lg border border-[#E5E5E7] bg-white shadow-lg py-1 z-[60]"
        >
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onRunEngine(); }}
            className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-[#1C1C1E] hover:bg-[#F4F4F6]"
          >
            <span className="flex items-center gap-2">
              <span className="ms" style={{ fontSize: 15, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}>bolt</span>
              Run Engine
            </span>
            <span className="text-[11px] text-[#8E8E93] font-mono">R</span>
          </button>
          <div className="h-px bg-[#F2F2F4] mx-2 my-1" />
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onPrint(); }}
            className="w-full flex items-center justify-between px-3 py-2 text-[13px] text-[#1C1C1E] hover:bg-[#F4F4F6]"
          >
            <span className="flex items-center gap-2">
              <span className="ms" style={{ fontSize: 15, fontVariationSettings: '"FILL" 0, "wght" 300, "opsz" 20' }}>print</span>
              Print
            </span>
            <span className="text-[11px] text-[#8E8E93] font-mono">⌘P</span>
          </button>
          <div className="h-px bg-[#F2F2F4] mx-2 my-1" />
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onAddAuxSlot(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#1C1C1E] hover:bg-[#F4F4F6]"
          >
            <span className="ms" style={{ fontSize: 15, fontVariationSettings: '"FILL" 0, "wght" 300, "opsz" 20' }}>add</span>
            Add AUX Slot
          </button>
          <button
            role="menuitem"
            disabled={!onRemoveAuxSlot}
            onClick={() => { if (!onRemoveAuxSlot) return; setOpen(false); onRemoveAuxSlot(); }}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-[13px] ${
              onRemoveAuxSlot
                ? "text-[#1C1C1E] hover:bg-[#F4F4F6]"
                : "text-[#C8C8CC] cursor-not-allowed"
            }`}
            title={onRemoveAuxSlot ? `Remove ${lastAuxSlotLabel}` : "Default AUX slots can't be removed"}
          >
            <span className="flex items-center gap-2">
              <span className="ms" style={{ fontSize: 15, fontVariationSettings: '"FILL" 0, "wght" 300, "opsz" 20' }}>remove</span>
              Remove AUX Slot
            </span>
            {lastAuxSlotLabel && (
              <span className="text-[10px] text-[#8E8E93] font-mono truncate max-w-[60px]">{lastAuxSlotLabel}</span>
            )}
          </button>
          <div className="h-px bg-[#F2F2F4] mx-2 my-1" />
          <button
            role="menuitem"
            onClick={() => { setOpen(false); onLockDay?.(); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-[#007AFF] font-semibold hover:bg-[#E5F0FF]"
          >
            <span className="ms" style={{ fontSize: 15, fontVariationSettings: '"FILL" 0, "wght" 300, "opsz" 20' }}>lock</span>
            Lock &amp; Finalize
          </button>
        </div>
      )}
    </div>
  );
};

// Small input row inside the task selector popover. Typing a label + pressing
// Enter (or clicking +) inserts the label into the catalog and selects it for
// the current night. Lifted into its own component so the input keeps focus
// across re-renders.
const CustomTaskInput: React.FC<{ uiKey: string; onAdd: (uiKey: string, label: string) => void | Promise<void> }> = ({ uiKey, onAdd }) => {
  const [value, setValue] = useState("");
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    setValue("");
    onAdd(uiKey, v);
  };
  return (
    <div className="px-3 py-2 border-t border-[#E5E5E7] flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        placeholder="+ Add custom task…"
        className="flex-1 text-[12.5px] px-2 py-1.5 rounded border border-[#E5E5E7] bg-white text-[#1C1C1E] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#1D4ED8] focus:ring-1 focus:ring-[#1D4ED8]/30"
        style={{ fontFamily: "var(--font-atkinson)" }}
      />
      <button
        type="button"
        disabled={!value.trim()}
        onClick={submit}
        className="text-[11px] font-semibold px-3 py-1.5 rounded bg-[#1D4ED8] text-white disabled:bg-[#E5E5E7] disabled:text-[#9CA3AF] hover:bg-[#1E40AF] transition-colors"
      >
        Add
      </button>
    </div>
  );
};

// OverlapSlot now imported from components/ above.

// Collapsible-pill behavior — used by the week stepper, day picker, and view
// toggle so they default to showing just the active value and expand inline
// to the full set on tap. Click-outside or ESC collapses without changing
// selection; selecting a value inside the expanded pill collapses with the
// new active value.
function useCollapsiblePill() {
  const [expanded, setExpanded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expanded) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded]);
  return { expanded, setExpanded, wrapRef };
}

// Roster panel — useDroppable so a card can be dragged back here to unassign.
// Phase 2: Stronger visual feedback when dragging an assigned TM toward the roster.
const RosterDropZone: React.FC<{ 
  children: React.ReactNode; 
  className?: string; 
  isLocked?: boolean;
}> = ({ children, className, isLocked = false }) => {
  const { setNodeRef, isOver, active } = useDroppable({
    id: "roster",
    data: { type: "roster" },
    disabled: isLocked,
  });

  const isDraggingAssigned = active?.data.current?.type === "assigned";
  const isDraggingFromRoster = active?.data.current?.type === "tm";
  const highlight = isOver && (isDraggingAssigned || isDraggingFromRoster);

  return (
    <div
      ref={setNodeRef}
      className={`sb-drop-target ${className ?? ""} ${highlight ? "roster-drop-active" : ""} relative`}
    >
      {children}

      {/* Phase 2 drag feedback hint */}
      {highlight && isDraggingAssigned && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-medium text-[#B91C1C] bg-white/95 px-2 py-0.5 rounded shadow pointer-events-none">
          Drop here to unassign
        </div>
      )}
      {highlight && isDraggingFromRoster && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] font-medium text-[#007AFF] bg-white/95 px-2 py-0.5 rounded shadow pointer-events-none">
          Drop here to return
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inner component — the real ShiftBuilder experience (only rendered after PIN auth)
// ---------------------------------------------------------------------------
function AuthedShiftBuilder() {
  // Default the day picker to the active shift date. `currentShiftDate()`
  // returns yesterday's calendar date until 8:30am local time (so the operator
  // finishing Friday's grave at 6:30am Saturday morning still lands on
  // Friday); after 8:30am it returns today.
  // Restore the exact previously-selected GRAVE day (and therefore its week)
  // so that refresh keeps you on the same Thursday of week N, not the current week.
  // We persist the actual calendar date (ISO) for the chosen grave shift.
  const getSavedDate = (): Date | null => {
    const saved = localStorage.getItem("oms_selected_date");
    if (!saved) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(saved)) {
      return parseLocalDateISO(saved);
    }
    const d = new Date(saved);
    return isNaN(d.getTime()) ? null : d;
  };

  // Restore Apply Roster feed after refresh / HMR / tab reopen (localStorage).
  // This makes the direct feed from "Apply Roster" survive reloads, which is
  // required for the TM Picker to reliably show the scheduled + eligible + unassigned list.
  useEffect(() => {
    const saved = readWeeklyRosterScheduledFromStorage();
    if (saved?.weekStart) {
      useShiftBuilderStore.getState().setWeeklyRosterScheduled(saved as any);
    }
  }, []);

  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    const savedDate = getSavedDate();
    if (savedDate) {
      const ws = startOfShiftWeek(savedDate);
      const idx = Math.max(0, Math.min(6, daysBetween(ws, savedDate)));
      return idx;
    }
    // Fallback: last index only (legacy), else default strictly to real calendar TODAY.
    // User request: initial load into the canvas should land on "today".
    const legacy = localStorage.getItem("oms_selected_day_index");
    if (legacy !== null) {
      const idx = parseInt(legacy, 10);
      if (!isNaN(idx) && idx >= 0 && idx <= 6) return idx;
    }
    // Real calendar today (no grave rollover adjustment for initial landing)
    const realToday = new Date();
    realToday.setHours(0, 0, 0, 0);
    const ws = startOfShiftWeek(realToday);
    const idx = Math.max(0, Math.min(6, daysBetween(ws, realToday)));
    return idx;
  });

  // === Launchpad vs full Canvas (elegant new default homescreen) =============
  // The beautiful matching launchpad is now the default entry for ShiftBuilder.
  // "Enter Canvas" (or clicking any day) loads the sacred interactive editor.
  // Persist viewMode (like oms_selected_date) so hard refresh while in canvas
  // re-loads directly into canvas (ensures OpsStatusBar + session pill visible
  // without forcing operator back through launchpad).
  const [viewMode, setViewMode] = useState<'launchpad' | 'canvas'>(() => {
    try {
      const saved = localStorage.getItem("oms_view_mode");
      if (saved === "canvas" || saved === "launchpad") return saved;
    } catch {}
    return "launchpad";
  });
  // One-shot "pending day to land on when we switch to canvas" from the launchpad.
  // Using a ref (instead of state + effect that clears it) avoids any chance of
  // the "setState in effect" causing repeated renders / max update depth.
  // The value is consumed exactly once on the viewMode transition.
  // (The previous useState + effect version was triggering "Maximum update depth exceeded"
  // in some render/transition paths involving the launchpad <-> canvas switch.)
  const pendingCanvasDayIndexRef = React.useRef<number | undefined>(undefined);

  // Persisting setter used for all canvas/launchpad transitions so refresh keeps context.
  const persistViewMode = React.useCallback((m: "launchpad" | "canvas") => {
    try {
      localStorage.setItem("oms_view_mode", m);
    } catch {}
    setViewMode(m);
    // Extra defensive ensure for the OpsStatusBar + ai session pill when we go
    // (or restore) to canvas. Complements the useLayoutEffect and the launchpad effect.
    if (m === "canvas") {
      ensureOpsStatusBar();
    } else {
      hideOpsStatusBar();
    }
  }, []);

  // Early ensure for the status bar on initial mount when we restored directly to canvas
  // (the hard-refresh-in-canvas case). useLayoutEffect to run before browser paint.
  React.useLayoutEffect(() => {
    if (viewMode === "canvas") {
      ensureOpsStatusBar();
    }
  }, [viewMode]);

  // Early initialization of the roster bridges (Phase 3.1 unification).
  // Declared with `let` + empty defaults *here* (near the top, before any useMemo
  // that closes over them in deps) so TypeScript and the runtime never see a
  // forward reference / TDZ for effectiveGraveRoster / effectiveRealRoster.
  // They are assigned the real values from currentNight a few hundred lines later.
  // This is the minimal patch for the giant file after repeated extractions.
  let effectiveRealRoster: any[] = [];
  let effectiveGraveRoster: any[] = [];

  const enterCanvas = React.useCallback((targetDayIndex?: number) => {
    if (typeof targetDayIndex === 'number') {
      pendingCanvasDayIndexRef.current = targetDayIndex;
    }
    persistViewMode('canvas');
    // Force-create the pill synchronously from the action path. Complements the
    // conditional mount + launchpad effect ensure. Guarantees visibility on first
    // click into canvas after a hard refresh.
    ensureOpsStatusBar();
  }, [persistViewMode]);

  // Apply a day pre-selected from the launchpad once we switch into canvas mode.
  // Consumes the ref (set by enterCanvas) and clears it. Using ref + only depending on
  // viewMode prevents any "set in effect + changing dep" re-trigger loops that could
  // cause "Maximum update depth exceeded".
  React.useEffect(() => {
    if (viewMode === 'canvas' && typeof pendingCanvasDayIndexRef.current === 'number') {
      const target = pendingCanvasDayIndexRef.current;
      pendingCanvasDayIndexRef.current = undefined;
      setSelectedDayIndex(target);
    }
  }, [viewMode]);

  // === Imperative Launchpad Mounting (iPad Safari simulator fix) =============
  // We mount the Launchpad via createRoot directly to document.body because
  // declarative fixed/portal elements inside the canvas (which uses heavy
  // transform + stacking contexts) do not reliably paint on iPad Safari simulator.
  //
  // Critical: We NEVER call root.unmount() during normal mode switches.
  // Calling unmount() synchronously from an effect (or its cleanup) while the
  // parent React tree is rendering triggers:
  //   "Attempted to synchronously unmount a root while React was already rendering"
  //
  // Instead we use root.render(null) to clear it, which is safe.
  // Real unmount + DOM removal only happens on final component teardown.
  //
  // CRITICAL: The container is position:fixed + inset:0. When canvas mode clears
  // children via render(null), the empty div still captures all pointer events on
  // iPad/desktop — page feels frozen after refresh (oms_view_mode=canvas) or after
  // entering canvas. Always toggle display/pointer-events when hiding.
  React.useLayoutEffect(() => {
    if (typeof document === 'undefined') return;

    // Ensure we have a persistent container + root (create only once)
    if (!launchpadContainerRef.current) {
      // Orphan from a prior navigation if deferred cleanup did not run in time.
      document.getElementById(LAUNCHPAD_ROOT_ID)?.remove();

      const container = document.createElement('div');
      container.id = LAUNCHPAD_ROOT_ID;
      container.style.cssText = `
        position: fixed !important;
        inset: 0 !important;
        z-index: 2147483640 !important;
        background: transparent !important;
        opacity: 0 !important;
      `;
      setLaunchpadRootVisible(container, false);
      document.body.appendChild(container);
      launchpadContainerRef.current = container;

      const root = createRoot(container);
      launchpadRootRef.current = root;
    }

    const container = launchpadContainerRef.current;
    const root = launchpadRootRef.current!;

    if (viewMode === 'launchpad') {
      setLaunchpadRootVisible(container, true);
      root.render(<ShiftBuilderLaunchpad onEnterCanvas={enterCanvas} />);
      console.log('[Launchpad] Rendered into body root (iPad reliable)');
      hideOpsStatusBar();
    } else {
      // Safe way to "hide" the launchpad without unmounting the root.
      // This avoids the synchronous unmount race condition entirely.
      root.render(null);
      setLaunchpadRootVisible(container, false);
      // Explicit ensure here (in addition to <OpsStatusBar/> mount) defeats any timing
      // where the conditional React tree hasn't committed the effect yet on refresh/enter.
      ensureOpsStatusBar();
    }

    // This cleanup runs when AuthedShiftBuilder unmounts (leaving /shiftbuilder entirely).
    // We MUST defer the actual .unmount() because calling it synchronously from
    // an effect cleanup during a React update (e.g. viewMode change) triggers:
    //   "Attempted to synchronously unmount a root while React was already rendering"
    return () => {
      const r = launchpadRootRef.current;
      const c = launchpadContainerRef.current;

      // Remove the full-screen shell immediately so client navigations to other
      // routes are never left with a pointer-blocking layer.
      if (c) {
        setLaunchpadRootVisible(c, false);
        try { c.remove(); } catch {}
        launchpadContainerRef.current = null;
      }
      teardownShiftBuilderBodyChrome();

      if (r) {
        // Defer .unmount() only — safe outside React's commit phase.
        setTimeout(() => {
          try { r.unmount(); } catch {}
          launchpadRootRef.current = null;
        }, 0);
      }
    };
  }, [viewMode, enterCanvas]);

  const [currentView, setCurrentView] = useState<"deployment" | "breaks" | "weekly">(() => {
    const saved = localStorage.getItem("oms_current_view");
    return (saved === "breaks" || saved === "deployment" || saved === "weekly") ? saved : "deployment";
  });

  // Canvas authoring mode — the veil between living digital builder and pristine Golden fidelity.
  // "builder": the full artistic authoring surface. xAI magic lines, enhanced corner reads, micro digital ink,
  //            hover states, and power affordances appear as an integrated "whisper" on the sheet.
  //            Feels like one cohesive piece — liquid glass + Atkinson + calm zincs + zone accents + GRAVE red notes.
  // "print-preview": live on-canvas renders PrintPreviewPage (same component as export/print HTML).
  //            Sacred 1056×816 Golden artboard — identical markup to PDF/browser print output.
  // Toggle is pure digital chrome (FloatingNav). Export still fetches committed Supabase data per night.
  const [canvasMode, setCanvasMode] = useState<"builder" | "print-preview">(() => {
    const saved = localStorage.getItem("oms_canvas_mode");
    return (saved === "print-preview" || saved === "builder") ? saved : "builder";
  });
  const isPrintPreview = canvasMode === "print-preview";
  // Dismissable week health bar — placement under nav + stage top inset (see stageTopInsetPx).
  const [isWeekHealthTrackerDismissed, setIsWeekHealthTrackerDismissed] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      const stored = localStorage.getItem("oms_week_health_tracker_dismissed");
      if (stored === "false") return false;
      return true;
    } catch {
      return true;
    }
  });
  // Builder live canvas: deployment + breaks use the relaxed workspace (not the fixed 816px Golden frame).
  const isBuilderLiveCanvas =
    (currentView === "deployment" || currentView === "breaks") && !isPrintPreview;
  const isBuilderDeployment = currentView === "deployment" && !isPrintPreview;
  const relaxedFrameClass = isBuilderLiveCanvas ? "sb-relaxed-frame" : "";
  // Persist
  React.useEffect(() => {
    try { localStorage.setItem("oms_canvas_mode", canvasMode); } catch {}
  }, [canvasMode]);

  // Provenance glass (engine heart) — on-demand overlay. Board is the entire surface.
  // Populated from card clicks when engine provenance data (rationale + fairnessSignals) is present.
  // Card appearances are never altered.
  const [provenanceKey, setProvenanceKey] = useState<string | null>(null);

  // Dedicated state for the week rotation advisor text (local suggestions + xAI prescriptive moves).
  // Avoids fragile window stash + ensures re-renders of the glass when the async result arrives
  // (even if we set the same provenanceKey again).
  const [weekAdvisorText, setWeekAdvisorText] = useState<string | null>(null);

  // WeekLens v2 (builder-only chrome for the weekly overview page).
  // These drive the screen-only Top Controls Bar (40px unscaled page chrome above the golden paper)
  // and the right Focus sidebar (~22% unscaled, next to the 1056x816 artboard).
  // The golden paper (LiveWeeklyOverviewArtboard) and its layout solver remain 100% untouched
  // in geometry, row heights, column widths, and core content for preview/print fidelity.
  const [weekLensFilters, setWeekLensFilters] = useState<Set<string>>(new Set());
  const [weekLensSearch, setWeekLensSearch] = useState<string>("");
  const [weekLensSidebarOpen, setWeekLensSidebarOpen] = useState<boolean>(true);

  // Resolve provenance data for glass (supports flat rrSide keys like MRR1/WRR1 and physical).
  // Looks up in the current assignments (from store/live).
  const getProvenanceDataForKey = React.useCallback((key: string) => {
    // The main assignments come from the live cache / store (use getState inside to avoid forward-ref/TDZ in giant Client scope and to keep this helper stable).
    // We use a broad lookup; in practice the board passes displayAssignments but we resolve here.
    const a = (window as any).__OMS_ASSIGNMENTS__?.[key] || {}; // fallback if exposed; real lookup below

    // Real lookup from store (current source of truth for board + pad views). Avoids closing over render-scoped `assignments`/`padAssignments` declared much later.
    const storeState = useShiftBuilderStore.getState();
    const liveA = storeState.assignments || {};
    const mpA = (storeState as any).padAssignments || {}; // padAssignments is a derived memo in render; best-effort from store shape if exposed
    const candidate = liveA[key] || mpA[key] || a;

    if (!candidate) return null;

    // For RR sides the key may be MRRxx / WRRxx; the provenance lives on the side assignment.
    const prov = candidate.provenance || {};
    const hasReal = prov.rationale || prov.fairnessSignals;

    if (!hasReal) return null;

    return {
      name: candidate.tmName,
      rationale: prov.rationale,
      fairnessSignals: prov.fairnessSignals,
      confidence: prov.confidence,
    };
  }, []);

  // Day picker popover state for the left-rail colored day number.
  // When true we render a floating horizontal strip of the 7 days immediately
  // to the right of the left control rail.
  const [dayPickerOpen, setDayPickerOpen] = useState(false);

  // Calendar popover (full month picker) for jumping to any date via the left-rail calendar icon.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarView, setCalendarView] = useState<Date>(() => new Date());

  // === React 19 Transitions for fast day switching (new research direction) ===
  // Day changes should feel instant. We use startTransition so React can keep
  // the old UI responsive while the new day's heavy board renders.
  const [isPending, startDayTransition] = useTransition();
  const deferredDayIndex = useDeferredValue(selectedDayIndex);

  // (Dock-specific calendar popover removed — calendar now lives in the floating top header date navigator)

  // Zone legend — collapsible floating pill below the zoom chip.

  // Close day picker on outside click or Escape (same pattern as the retired pill hooks).
  useEffect(() => {
    if (!dayPickerOpen) return;
    const onDown = (e: MouseEvent) => {
      const picker = document.getElementById("left-rail-day-picker");
      const trigger = document.getElementById("left-rail-day-trigger");
      // Ignore clicks on the trigger itself (so re-clicking the colored day number
      // while open will close the picker via this handler, then the button's onClick
      // will re-open it — resulting in a reliable toggle).
      if (trigger && trigger.contains(e.target as Node)) return;
      if (picker && !picker.contains(e.target as Node)) {
        setDayPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDayPickerOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [dayPickerOpen]);

  // Close calendar popover on outside click or Escape.
  useEffect(() => {
    if (!calendarOpen) return;
    const onDown = (e: MouseEvent) => {
      const cal = document.getElementById("left-rail-calendar-popover");
      const trigger = document.getElementById("left-rail-calendar-trigger");
      if (trigger && trigger.contains(e.target as Node)) return;
      if (cal && !cal.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCalendarOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [calendarOpen]);

  // (Dock calendar close effect removed along with the old bottom dock popover)

  const [breakGroup, setBreakGroup] = useState<ActiveBreakGroupFilter>(1);
  const [assignments, setAssignments] = useState<any>(() => ({})); // live data only — the Golden visual structure + fallback names live in the card renderers and GOLDEN_VISUAL_SPEC. The robust scale below guarantees the paper itself is always visible.
  const [realRoster, setRealRoster] = useState<any[]>([]);
  const [graveRoster, setGraveRoster] = useState<any[]>([]); // GRAVE-shift filtered roster (Option B)
  // Session undo/redo (in-memory, one tab)
  const shiftHistory = useShiftHistory();

  // Stable ref to recordChange so the history effect below doesn't depend on
  // the shiftHistory object (which is a new reference every render) — prevents
  // the effect firing on every render instead of only when state actually changes.
  const recordChangeRef = useRef(shiftHistory.recordChange);
  useEffect(() => { recordChangeRef.current = shiftHistory.recordChange; });

  const positioningRef = useRef<HTMLDivElement>(null);

  // Dedicated overlay layer for artboard-centered floating UI (Command Palette, future floating tools).
  // Lives in the same flex-centering context as the scaled artboard but is NOT inside the scale transform,
  // so children render at 1:1 crisp size and can be positioned as "center of the artboard".
  const artboardOverlayRef = useRef<HTMLDivElement>(null);

  // Undo/Redo recording coordination
  const pendingHistoryRef = useRef<{ description: string; before: Snapshot } | null>(null);

  // Imperative launchpad container (required for reliable rendering on iPad Safari simulator)
  const launchpadContainerRef = useRef<HTMLDivElement | null>(null);
  const launchpadRootRef = useRef<Root | null>(null);

  const handleBackToLaunchpad = React.useCallback(() => {
    persistViewMode('launchpad');
    const root = launchpadRootRef.current;
    const launchContainer = launchpadContainerRef.current;
    if (root && launchContainer) {
      setLaunchpadRootVisible(launchContainer, true);
      root.render(<ShiftBuilderLaunchpad onEnterCanvas={enterCanvas} />);
    }
  }, [persistViewMode, enterCanvas]);

  // === Date / week selection ===
  // todayDate holds the active SHIFT date (not the calendar date) — see
  // `currentShiftDate()` for the rollover rule. Captured once on mount so
  // `isToday` highlights, the "Today" button anchor, and the day-picker's
  // current-day circle don't drift mid-session. If the operator's session
  // spans the 8:30am rollover they can refresh to pick up the new shift.
  const [todayDate] = useState<Date>(() => currentShiftDate());
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const savedDate = getSavedDate();
    if (savedDate) {
      return startOfShiftWeek(savedDate);
    }
    return startOfShiftWeek(currentShiftDate());
  });
  const DAY_DEFS = React.useMemo(() => buildDayDefs(weekStart, todayDate), [weekStart, todayDate]);
  const NAV_DAY_STRIP = React.useMemo(
    () => buildNavDayStrip(weekStart, todayDate),
    [weekStart, todayDate],
  );

  // === Live data: nightId resolves from the selected date ==================
  // Null means "no row exists in Supabase for this date yet" — the UI renders
  // empty cards and the first persist will lazy-create the night. Saving any
  // value here re-fetches roster + assignments via the effects below.
  const [nightId, setNightId] = useState<string | null>(null);
  const [isCurrentNightLocked, setIsCurrentNightLocked] = useState(false);
  const [currentNightStatus, setCurrentNightStatus] = useState<string | null>(null);
  const [publishDayBusy, setPublishDayBusy] = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  // Tracks loadingAssignments inside async callbacks (state can't be read stably from closures).
  const loadingAssignmentsRef = useRef<boolean>(false);

  // === Slot task catalog + selections ===================================
  // catalog: the menu of POSSIBLE tasks per slot (slot_task_catalog rows),
  // loaded once on mount. Indexed in a useMemo below by `${slotType}:${slotKey}:${rrSide ?? ""}`
  // for O(1) lookup from the popover.
  //
  // selectedTasks: per-night SELECTIONS, keyed by the UI slot key (Z1, MRR1,
  // etc.) so the card renderers can read tasks for a slot without round-tripping
  // through the db key.
  //
  // tasksOpenFor: ui slot key when the task-selector popover is open; null
  // when closed.
  const [catalog, setCatalog] = useState<CatalogTask[]>([]);
  const [selectedTasks, setSelectedTasks] = useState<Record<string, NightSlotTask[]>>({});
  const [tasksOpenFor, setTasksOpenFor] = useState<string | null>(null);

  // Task UX prefs (driven by the new Sudo → Tasks tab). Default = enabled so the
  // "drag tasks between cards" feature works out of the box.
  const [taskDragEnabled, setTaskDragEnabled] = useState(true);

  // === Hydration guard ====================================================
  // The page mixes server-rendered HTML (because it has "use client" but
  // Next.js still SSRs client components for first paint) with client-only
  // state like `fitScale` (measured from the viewport) and `todayDate`
  // (timezone-sensitive). When either of those leak into render output
  // during hydration, React detects a mismatch, throws away the SSR'd tree,
  // and re-renders from scratch — which makes the artboard flash empty for
  // a tick. `mounted` defers rendering anything browser-derived until after
  // the first client paint, so SSR output is stable and hydration succeeds.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // === Ops Status Bar (permanent, prod-visible) ===
  // The old imperative dev-only timing pill (3.5) has been promoted and replaced
  // by <OpsStatusBar /> (always rendered, proper React, same visual language,
  // lives in the exact chrome space the layout padding already reserves).
  // All measurement globals (__lastDaySwitch, __lastDataToPaintMs, etc.) continue
  // to be written by the day-switch paths + Board paint rAF — the bar just consumes them.

  // === Dark mode state ======================================================
  const { isDark, toggleTheme } = useTheme();
  // Raw break_assignments rows for the current night — used to render the
  // break sheet (waves) from the authoritative source.
  // Only TMs who are actually placed on the deployment this night (and have
  // a positive break group) will appear. Scheduled-but-not-placed TMs are
  // deliberately excluded per operator requirements.
  const [nightBreakRows, setNightBreakRows] = useState<Array<{ tmId: string; groupNum: number; slotRef: string | null }>>([]);

  // === Roster panel UI state (extracted to useRosterPanels) =================
  const {
    otherTmsExpanded, setOtherTmsExpanded,
    rosterOpen, setRosterOpen,
    calledOffExpanded, setCalledOffExpanded,
    sudoOpen, setSudoOpen,
    xaiSphereOpen, setXaiSphereOpen,
    deployedExpanded, setDeployedExpanded,
    pmOverlapsExpanded, setPmOverlapsExpanded,
    amOverlapsExpanded, setAmOverlapsExpanded,
    portersExpanded, setPortersExpanded,
    scheduledGravesExpanded, setScheduledGravesExpanded,
    scheduledPMExpanded, setScheduledPMExpanded,
    scheduledAMExpanded: _setScheduledAMExpanded, // eslint-disable-line @typescript-eslint/no-unused-vars -- provided by hook for rail internals; not called from Client scope
    rosterSearch,
    setRosterSearch: _setRosterSearch, // eslint-disable-line @typescript-eslint/no-unused-vars -- provided by hook for rail internals; not called from Client scope
    graveOnly, setGraveOnly,
    cmdkOpen, setCmdkOpen,
    cmdkInitialContext, setCmdkInitialContext,
  } = useRosterPanels();

  // Loader components for heavy surfaces, dynamically imported at runtime (see effects below).
  // Declared here (after useRosterPanels) so hook call order is stable.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic loader from import(); any is the pragmatic type for lazy component factories in this Turbopack-safe pattern (documented)
  const [CommandPaletteLoader, setCommandPaletteLoader] = useState<React.ComponentType<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic loader from import(); any is the pragmatic type for lazy component factories in this Turbopack-safe pattern (documented)
  const [SudoWindowLoader, setSudoWindowLoader] = useState<React.ComponentType<any> | null>(null);

  // Weekly Overview focus state (TM tap in the live table fades other rows + dims non-matching cards on current day's canvas;
  // detail shows the TM's full week placements + "where they are"). Cleared on close/day change.
  const [focusedWeeklyTmId, setFocusedWeeklyTmId] = useState<string | null>(null);

  // Auto-clear focus when the day (or week) changes so the highlight always matches the visible board.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset on day/week change (keeps focus highlight consistent with the *visible* board column; mirrors pattern used in /today nav resets; linter rule is advisory for cross-boundary sync)
  React.useEffect(() => {
    setFocusedWeeklyTmId(null);
  }, [selectedDayIndex, weekStart]);

  // Ops auth (PIN gate) — available only inside the authenticated tree.
  const { hasRole, user: currentOperator, logout: logoutOperator, permissions } = useOpsAuth();

  // Destructure the granular permissions for easy use throughout the component
  const {
    canSeeDraftData = false,
    canPublish = false,
    canApplySchedules = false,
    canRunEngine = false,
    canManageTeam = false,
    canAccessSudo = false,
    canEditAssignments = false,
    canLockUnlock = false,
  } = permissions || {};

  // Load the heavy admin surfaces (CommandPalette + SudoWindow) via their thin
  // wrapper modules ONLY when first opened. The wrappers themselves do a second
  // dynamic import of the real heavy component. This double-indirect + effect-driven
  // pattern keeps the import() expressions and the useCommandActions / Sudo dep
  // graphs completely out of the top-level static module evaluation of this giant
  // Client file. This is required to avoid repeated Turbopack "module factory is not
  // available" and follow-on ReferenceErrors (e.g. bare LazySudoWindow) after HMR
  // or hard refresh. The canvas (and OpsStatusBar with ai session tokens pill) can
  // only mount if Client itself evaluates cleanly.
  React.useEffect(() => {
    if (cmdkOpen && !CommandPaletteLoader) {
      import("./components/LazyCommandPalette").then((mod) => {
        if (mod.LazyCommandPalette) {
          setCommandPaletteLoader(() => mod.LazyCommandPalette);
        }
      });
    }
  }, [cmdkOpen, CommandPaletteLoader]);

  React.useEffect(() => {
    if (sudoOpen && !SudoWindowLoader) {
      import("./components/LazySudoWindow").then((mod) => {
        if (mod.LazySudoWindow) {
          setSudoWindowLoader(() => mod.LazySudoWindow);
        }
      });
    }
  }, [sudoOpen, SudoWindowLoader]);

  const handleOpenSudo = useCallback(() => {
    // Prefer the new granular permission system. Just flip the flag; the effect
    // above will perform the dynamic import of the thin loader if not already
    // present (matching the cmdkOpen pattern exactly).
    if (permissions?.canAccessSudo) {
      setSudoOpen(true);
    } else {
      console.warn("[shiftbuilder] Sudo access denied — role:", currentOperator?.role);
      // Future: surface a nice toast "Insufficient privileges for Sudo"
    }
  }, [permissions?.canAccessSudo, currentOperator?.role, setSudoOpen]);

  // Persist the exact selected GRAVE day (calendar date) so refresh restores
  // both the correct weekStart and the day index within that week.
  useEffect(() => {
    if (DAY_DEFS.length > 0) {
      const d = DAY_DEFS[selectedDayIndex]?.date;
      if (d) {
        localStorage.setItem("oms_selected_date", formatLocalDateISO(d));
      }
    }
  }, [selectedDayIndex, weekStart, DAY_DEFS]);

  useEffect(() => {
    localStorage.setItem("oms_current_view", currentView);
  }, [currentView]);

  // Called-off TMs for the currently selected night (from `call_offs` table)
  const [calledOffIds, setCalledOffIds] = useState<Set<string>>(new Set());

  // TMs explicitly marked as scheduled to work this specific night (from
  // `night_tm_status`, populated by the SUDO Schedules tab when an ADP
  // export is imported). Empty when no schedule data exists for the night
  // — the engine filter only applies when this set is non-empty.
  const [scheduledTmIdsTonight, setScheduledTmIdsTonight] = useState<Set<string>>(new Set());

  // === Engine config + reference data (Phase 1 weighted scoring) ===
  const [engineConfig, setEngineConfig] = useState<EngineConfig | null>(null);
  const [tmSkillScores, setTmSkillScores] = useState<Map<string, number>>(new Map());
  const [slotDifficulty, setSlotDifficulty] = useState<Map<string, number>>(new Map());
  const [tmPreferencesByTm, setTmPreferencesByTm] = useState<Map<string, any[]>>(new Map());
  const [tmPairAffinitiesByTm, setTmPairAffinitiesByTm] = useState<Map<string, any[]>>(new Map());
  const [tmAccommodationsByTm, setTmAccommodationsByTm] = useState<Map<string, any[]>>(new Map());
  const [tmZoneMatrix, setTmZoneMatrix] = useState<Map<string, Map<string, any>>>(new Map());
  const [recentZoneHistory, setRecentZoneHistory] = useState<Map<string, Array<{ nightDate: string; slotKey: string }>>>(new Map());
  // Per-slot top-K breakdown from the last engine run — fuels the Why? panel.
  const [draftBreakdown, setDraftBreakdown] = useState<Record<string, SlotRanking>>({});
  // Grok's reasoning per slot when it overrode the deterministic pick.
  const [draftGrokReasoning, setDraftGrokReasoning] = useState<Record<string, { source: "engine" | "grok"; reason?: string }>>({});
  const [draftGrokExplanation, setDraftGrokExplanation] = useState<string>("");
  const [draftEngineWarnings, setDraftEngineWarnings] = useState<string[]>([]);
  // Bumps when a `make`/`remove` command lands so the load effect refetches.
  const [tmCommandEpoch, setTMCommandEpoch] = useState(0);

  // Bumps when Sudo mutates per-night operational data (breaks, tasks, assignments, etc.)
  // so the current night's UI (including break sheet) refreshes without the user having to switch days.
  const [sudoDataEpoch, setSudoDataEpoch] = useState(0);

  // === Print Command Center ===
  const [isPrintCenterOpen, setIsPrintCenterOpen] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);
  const [printBusyMode, setPrintBusyMode] = useState<"print" | "export">("print");
  const [printProgress, setPrintProgress] = useState<{ current: number; total: number; label: string } | null>(null);

  useEffect(() => {
    if (!isPrinting) {
      document.body.classList.remove("sb-print-export-busy");
      return;
    }
    document.body.classList.add("sb-print-export-busy");
    return () => document.body.classList.remove("sb-print-export-busy");
  }, [isPrinting]);

  // Card borders for attention / marking (visual only)
  const [cardBorders, setCardBorders] = useState<Record<string, string>>({});

  // === Draft Mode (Engine Preview) ===
  const [isDraftMode, setIsDraftMode] = useState(false);
  const [draftAssignments, setDraftAssignments] = useState<Record<string, {
    proposedTmId: string;
    proposedTmName: string;
    previousTmId?: string;
    previousTmName?: string;
    /** When true, applying the draft clears this slot (Grok `remove` action). */
    proposedClear?: boolean;
  }>>({});

  const addCardBorder = (slotKey: string, color: string) => {
    // Optimistic update
    setCardBorders(prev => ({ ...prev, [slotKey]: color }));

    // Persist if we have a night
    if (nightId) {
      import("@/lib/shiftbuilder/data").then(({ setNightCardBorder }) =>
        setNightCardBorder(nightId, slotKey, color).catch((e) => {
          console.error("Failed to persist card border", e);
          showToast("Couldn't save border (will retry on reload)", "error");
        })
      );
    }
  };

  const removeCardBorder = (slotKey: string) => {
    // Optimistic update
    setCardBorders(prev => {
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });

    // Persist removal
    if (nightId) {
      import("@/lib/shiftbuilder/data").then(({ removeNightCardBorder }) =>
        removeNightCardBorder(nightId, slotKey).catch((e) => {
          console.error("Failed to remove card border", e);
          showToast("Couldn't remove border (will retry on reload)", "error");
        })
      );
    }
  };

  // Live break counts — one TM per (slot, break_group). Powers the three
  // small badges in the artboard header so operators can see at a glance
  // how balanced the wave loads are. Recomputes whenever assignments shift.
  const breakCounts = React.useMemo(() => {
    const counts: Record<1 | 2 | 3 | 4, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    Object.values(assignments).forEach((a: any) => {
      if (!a?.tmId && !a?.tmName) return;
      const g = (a.breakGroup ?? 0) as BreakGroup;
      // Off-the-sheet (0) intentionally excluded from rotation counts.
      if (g === 1) counts[1]++;
      else if (g === 2) counts[2]++;
      else if (g === 3) counts[3]++;
      else if (g === BREAK_GROUP_OVERLAPS) counts[4]++;
    });
    return counts;
  }, [assignments]);
  const inRotationCount = breakCounts[1] + breakCounts[2] + breakCounts[3] + breakCounts[4];

  // === Roster filtering (Phase 1 + GRAVE Phase 2) ============================
  // Component-level Set for O(1) "is this TM already on the board?" checks.
  // Replaces the O(n) Object.values().some() pattern used across the roster rail
  // and the completionScheduledUnplaced filter.
  //
  // IMPORTANT: This is an *early* memo. It must only reference state that is declared
  // before this point in the component to avoid Temporal Dead Zone (TDZ) errors during
  // the initial render. The full rich version (including currentNight, Zustand store,
  // and liveAssignmentsStore) lives in `alreadyAssignedThisNight` below, which is used
  // for the MarkerPad picker and other late consumers.
  const assignedThisNight = React.useMemo(() => {
    const set = new Set<string>(Object.values(assignments).map((a: any) => a?.tmId).filter(Boolean));
    Object.values(draftAssignments).forEach((a: any) => a?.tmId && set.add(a.tmId));
    return set;
  }, [assignments, draftAssignments]);

  // GRAVE shift filter (11pm–6:55am)
  const baseRoster = graveOnly ? graveRoster : realRoster;

  // These will be used in the rail rendering below.
  // We compute filtered versions of on/off schedule here for clean separation.
  // Note: actual on/off schedule split still happens in the IIFE in the JSX for now.

  // === Notes & Side Tasks (per-night, persisted to nights.notes) =========
  // The notes pad is contentEditable, which doesn't play nicely with React's
  // controlled-input pattern (re-rendering wipes the user's cursor). Instead
  // we manage it imperatively via a ref: load sets innerText once when the
  // night id resolves; typing triggers a debounced save.
  const notesRef = useRef<HTMLDivElement>(null);
  const notesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // === Notes AI completion ================================================
  // useShiftCompletion drives the ghost-text suggestion bar below the notes pad.
  // We snapshot `assignments` into a plain object for the context payload so
  // the hook's dependency doesn't churn on every render.
  const notesCompletion = useShiftCompletion({
    surface: "notes",
    context: {
      day: DAY_DEFS[selectedDayIndex]?.name,
      assignments: Object.fromEntries(
        Object.entries(assignments).map(([k, v]: [string, any]) => [
          k,
          { tmId: v?.tmId, tmName: v?.tmName },
        ])
      ),
      scheduledUnplaced: Array.from(scheduledTmIdsTonight)
        .filter((id) => !assignedThisNight.has(id))
        .slice(0, 12),
    },
  });

  // NOTE: handleNotesInput is defined later, AFTER `selectedDay` and
  // `showToast` are declared. Defining it here would TDZ on those bindings
  // in the deps array.

  // Toast queue — extracted to useToast
  const { toasts, lastSavedAt, setLastSavedAt, showToast, dismissToast } = useToast();

  // === Flex AUX row — per-night typed shells (admin first + 5 blanks, max 10) ===
  const [auxDefs, setAuxDefs] = useState<AuxDef[]>(() =>
    defaultAuxDefsForNewNight().map((d) => ({ ...d })),
  );
  const [customCoverageTargets, setCustomCoverageTargets] = useState<string[]>([]);
  const persistAuxLayoutNowRef = React.useRef<(layout: AuxDef[]) => void>(() => {});

  const addAuxSlot = () => {
    if (auxDefs.length >= MAX_AUX_SLOTS) return;
    const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
    pendingHistoryRef.current = { description: "Added blank AUX slot", before };

    setAuxDefs((prev) => {
      const slot = createBlankAuxSlot(prev);
      if (!slot) return prev;
      const next = [...prev, slot];
      const warnings = validatePlacementOrder(next);
      if (warnings.length > 0) {
        console.warn("[Placement] AUX slot added out of order:", warnings);
      }
      queueMicrotask(() => persistAuxLayoutNowRef.current(next));
      return next;
    });
  };

  const setAuxRole = (slotKey: string, role: AuxRole) => {
    if (role === "blank") return;
    const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
    pendingHistoryRef.current = { description: `Set ${slotKey} role → ${role}`, before };
    setAuxDefs((prev) => {
      const next = applyAuxRole(prev, slotKey, role);
      queueMicrotask(() => persistAuxLayoutNowRef.current(next));
      return next;
    });
  };

  const setAuxLabel = (slotKey: string, label: string) => {
    const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
    pendingHistoryRef.current = { description: `Renamed ${slotKey}`, before };
    setAuxDefs((prev) => {
      const next = applyAuxLabel(prev, slotKey, label);
      queueMicrotask(() => persistAuxLayoutNowRef.current(next));
      return next;
    });
  };

  // Called-off TMs should never be picked by the engine or proposed by Grok
  // for the current night.
  //
  // "Scheduled tonight" filter: when `night_tm_status` has rows for this
  // night (populated by the SUDO Schedules tab via ADP import), restrict
  // the engine candidate pool to those TMs. When the set is empty (no
  // schedule imported yet), fall through with no extra filter so the
  // engine still works on nights without imported schedules. This is the
  // opt-in fix for the "JT shouldn't show up on Wednesday" problem.
  // === Draft Mode Controls ===
  //
  // Respects engineConfig.placementMethod:
  //   - "weighted"     → Pure deterministic weighted planner (fast, predictable)
  //   - "grok-hybrid"  → Weighted planner + Grok 4.3 judgment layer on top
  //   - "greedy"       → Falls back to weighted (legacy)
  //
  const [engineRunPhase, setEngineRunPhase] = React.useState<EngineRunPhase>("idle");
  const runCoverageEngineRef = React.useRef<
    (options?: CoverageEngineRunOptions) => Promise<void>
  >(async () => {});

  const enterDraftMode = async (options?: CoverageEngineRunOptions) => {
    await runCoverageEngineRef.current(options);
  };

  /**
   * Translates the planner result (deterministic or post-Grok) into the
   * `draftAssignments` shape the UI consumes, plus stashes the breakdown
   * and Grok reasoning for the "Why?" panel.
   */
  const applyPlannerResultAsDraft = (
    result: { proposedAssignments: Record<string, string>; breakdown: Record<string, SlotRanking> },
    rosterForLookup: any[],
    reasoningBySlot: Record<string, { source: "engine" | "grok"; reason?: string }>,
    grokExplanation: string = "",
    warnings: string[] = []
  ) => {
    const lookup = buildTmLookupIndex(rosterForLookup);
    const newDraft: typeof draftAssignments = {};
    Object.entries(result.proposedAssignments).forEach(([slotKey, tmId]) => {
      const current = assignments[slotKey];
      const currentTmId = current?.tmId;

      if (!tmId) {
        if (currentTmId) {
          newDraft[slotKey] = {
            proposedTmId: "",
            proposedTmName: "",
            previousTmId: currentTmId,
            previousTmName: current?.tmName,
            proposedClear: true,
          };
        }
        return;
      }

      const tm = resolveTmFromLookup(lookup, tmId);
      if (!tm) return;

      const boardId = boardTmId(tm);
      if (currentTmId === boardId) return;

      newDraft[slotKey] = {
        proposedTmId: boardId,
        proposedTmName: tm.name || tm.fullName || boardId,
        previousTmId: currentTmId,
        previousTmName: current?.tmName,
      };
    });
    setDraftAssignments(newDraft);
    useShiftBuilderStore.getState().setDraftAssignments(newDraft);
    setDraftBreakdown(result.breakdown);
    setDraftGrokReasoning(reasoningBySlot);
    setDraftGrokExplanation(grokExplanation);
    setDraftEngineWarnings(warnings);
    setIsDraftMode(true);
  };

  const applyDraft = async () => {
    const draft = useShiftBuilderStore.getState().draftAssignments;
    const draftEntries = Object.entries(draft);
    if (!isDraftMode && draftEntries.length === 0) return;
    if (draftEntries.length === 0) {
      showToast("No draft placements to save", "error");
      return;
    }

    if (!confirm("Apply the draft assignments and save them permanently? This cannot be undone automatically.")) {
      return;
    }

    // === SLICE 4: Server-side eligibility + graves guard (before any optimistic state or history) ===
    // This is the hard re-check so Grok / engine / manual drafts cannot commit invalid placements.
    // We build a minimal proposal list and call the server action.
    const proposalsForGuard = draftEntries.map(([slotKey, info]) => ({
      slotKey,
      tmId: info.proposedClear ? null : (info.proposedTmId ?? null),
    }));

    try {
      const { validateProposedAssignments } = await import("./actions");
      const validation = await validateProposedAssignments({
        date: formatLocalDateISO(selectedDay.date),
        nightId: nightId || queryNightId,
        proposals: proposalsForGuard,
        clientScheduledTmIds: Array.from(effectiveScheduledTmIdsTonight),
      });

      if (!validation.valid) {
        const reasons = validation.invalid
          .map((e) => `${e.slotKey}: ${e.reason}`)
          .join(" | ");
        showToast(`Cannot apply — server guard rejected: ${reasons}`, "error");
        // Do not proceed to optimistic update or history record.
        return;
      }
    } catch (guardErr) {
      console.error("[applyDraft] server guard failed (proceeding with caution):", guardErr);
      // Fail open for now (network hiccup etc.) but log loudly. In production you may want to fail closed.
    }

    const slotTypeForUiKey = (slotKey: string) =>
      slotKey.startsWith("Z")
        ? "zone"
        : slotKey.startsWith("MRR") || slotKey.startsWith("WRR")
          ? "rr"
          : slotKey.startsWith("OL-")
            ? "overlap"
            : "aux";

    const storeBefore = useShiftBuilderStore.getState().assignments ?? {};
    const before: Snapshot = { assignments: { ...storeBefore }, auxDefs: [...auxDefs] };

    const newAssignments: Record<string, any> = { ...storeBefore };
    for (const [slotKey, info] of draftEntries) {
      if (info.proposedClear) {
        delete newAssignments[slotKey];
      } else if (info.proposedTmId) {
        newAssignments[slotKey] = {
          ...newAssignments[slotKey],
          tmId: info.proposedTmId,
          tmName: info.proposedTmName,
          breakGroup: newAssignments[slotKey]?.breakGroup ?? 0,
          type: slotTypeForUiKey(slotKey),
          slotKey,
        };
      }
    }

    const dateKey = formatLocalDateISO(selectedDay.date);
    const liveForNight: Record<string, { tmId: string; tmName: string | null }> = {};
    for (const [slotKey, row] of Object.entries(newAssignments)) {
      if (row?.tmId) {
        liveForNight[slotKey] = {
          tmId: row.tmId,
          tmName: row.tmName ?? row.tmId,
        };
      }
    }

    // Board + cards read Zustand and live cache; React Query was overwriting local-only updates.
    useShiftBuilderStore.getState().setAssignments(newAssignments);
    liveAssignmentsStore.getState().setAssignmentsForNight(dateKey, liveForNight);

    // Use the centralized data hook helpers (Slice 1) for mirror + cache patch.
    // This keeps the live cross-day store (Weekly Overview, repeats, fit, health, xAI) and
    // TanStack cache in sync after an optimistic apply.
    shiftData.mirrorCurrentDay?.();
    shiftData.patchCurrentNightCache?.(newAssignments);

    // Legacy bump kept for any remaining local memos during the transition.
    setLiveAssignVersion((v) => v + 1);

    setAssignments(newAssignments);
    const after: Snapshot = { assignments: newAssignments, auxDefs: [...auxDefs] };

    // === ATOMICITY CONTRACT (Slice 3 + 4 hardening) ===
    // - Server guard (validateProposedAssignments) already ran and passed (or failed open).
    // - Exactly one history entry for the entire batch (via recordAtomicChange).
    // - One optimistic store + live mirror + query patch.
    // - One batched DB write via batchApplyDraftAssignments.
    // - On DB failure: board is updated locally; operator can undo via history.
    recordChangeRef.current("Apply Engine Draft", before, after);

    setIsDraftMode(false);
    setDraftAssignments({});
    useShiftBuilderStore.getState().clearDraft();

    let nid = nightId || queryNightId;
    if (!nid) nid = await resolveNightIdForDate(selectedDay.date, selectedDay.name);
    if (!nid) {
      showToast("Draft applied on board but couldn't save — no night context. Reload and try again.", "error");
      return;
    }

    try {
      const slots = draftEntries.map(([slotKey, info]) => {
        const { slot_key, slot_type, rr_side } = uiToDb(slotKey);
        return {
          slotKey: slot_key,
          slotType: slot_type,
          rrSide: rr_side,
          tmId: info.proposedClear ? null : (info.proposedTmId ?? null),
        };
      });

      const { batchApplyDraftAssignments } = await import("@/lib/shiftbuilder/data");
      await batchApplyDraftAssignments(nid, slots);
      setLastSavedAt(new Date());
      const savedCount = draftEntries.filter(([, d]) => d.proposedTmId && !d.proposedClear).length;
      showToast(`Saved ${savedCount} placement${savedCount === 1 ? '' : 's'} (server-validated)`, "success");
    } catch (e: unknown) {
      console.error("[shiftbuilder] batchApplyDraft failed", e);
      const msg = e instanceof Error ? e.message : String(e);
      showToast(`Board updated but database save failed: ${msg}`, "error");
    }
  };

  const discardDraft = () => {
    if (!isDraftMode) return;

    if (confirm("Discard the current engine draft?")) {
      setIsDraftMode(false);
      setDraftAssignments({});
      useShiftBuilderStore.getState().clearDraft();
    }
  };

  // === Grok Structured Suggestions Integration ===
  /**
   * Applies one or more actions proposed by Grok.
   * Always ensures we are in Draft Mode first (per user decision).
   * Records the batch as a single history entry.
   */
  const applyGrokSuggestions = (actions: Array<{
    type: string;
    slotKey?: string;
    tmId?: string;
    fromSlot?: string;
    toSlot?: string;
    reason?: string;
  }>) => {
    if (isCurrentNightLocked) {
      showToast("This day is locked — cannot apply Grok suggestions", "error");
      return;
    }
    if (!actions || actions.length === 0) return;

    // Ensure we are in Draft Mode (this is the safe review surface)
    if (!isDraftMode) {
      // Lightweight enter without re-running the TS planner
      setIsDraftMode(true);
      setDraftAssignments({});
    }

    const before = {
      assignments: { ...assignments },
      auxDefs: [...auxDefs],
      draft: { ...draftAssignments },
    };

    const newDraft = { ...draftAssignments };
    // For lookup we use the FULL roster (the called-off filter only gates
    // *new* placement choices). If Grok proposes moving an already-assigned
    // TM, we still need to resolve their name even if they're called off.
    const rosterToUse = graveOnly ? effectiveGraveRoster : effectiveRealRoster;

    actions.forEach((action) => {
      if (action.type === "assign" && action.slotKey && action.tmId) {
        // Reject assign-to-zone for called-off TMs (defense in depth — the
        // snapshot we send to Grok already excludes them, but this catches
        // any drift).
        if (calledOffIds.has(action.tmId)) return;
        const tm = rosterToUse.find((t: any) => t.id === action.tmId);
        if (!tm) return;

        const current = assignments[action.slotKey];
        newDraft[action.slotKey] = {
          proposedTmId: action.tmId,
          // Display-name first — see enterDraftMode for the same rationale.
          proposedTmName: tm.name || tm.fullName || tm.id,
          previousTmId: current?.tmId,
          previousTmName: current?.tmName,
        };
      } else if (action.type === "remove" && action.slotKey) {
        const current = assignments[action.slotKey];
        if (!current?.tmId) return; // nothing to remove
        newDraft[action.slotKey] = {
          proposedTmId: "",
          proposedTmName: "",
          previousTmId: current.tmId,
          previousTmName: current.tmName,
          proposedClear: true,
        };
      } else if (action.type === "swap" && action.fromSlot && action.toSlot) {
        const fromAssignment = assignments[action.fromSlot];
        if (!fromAssignment?.tmId) return; // can't swap from an empty slot
        const fromTm = rosterToUse.find((t: any) => t.id === fromAssignment.tmId);
        if (!fromTm) return;

        const toAssignment = assignments[action.toSlot];
        const toTm = toAssignment?.tmId
          ? rosterToUse.find((t: any) => t.id === toAssignment.tmId)
          : null;

        // Move fromTm → toSlot
        newDraft[action.toSlot] = {
          proposedTmId: fromTm.id,
          proposedTmName: fromTm.name || fromTm.fullName || fromTm.id,
          previousTmId: toAssignment?.tmId,
          previousTmName: toAssignment?.tmName,
        };

        // Move toTm → fromSlot (or clear if toSlot was empty)
        if (toTm) {
          newDraft[action.fromSlot] = {
            proposedTmId: toTm.id,
            proposedTmName: toTm.name || toTm.fullName || toTm.id,
            previousTmId: fromTm.id,
            previousTmName: fromTm.name || fromTm.fullName,
          };
        } else {
          newDraft[action.fromSlot] = {
            proposedTmId: "",
            proposedTmName: "",
            previousTmId: fromTm.id,
            previousTmName: fromTm.name || fromTm.fullName,
            proposedClear: true,
          };
        }
      }
      // `note` actions are informational only — no draft mutation.
    });

    setDraftAssignments(newDraft);

    // Record as one atomic history entry
    pendingHistoryRef.current = {
      description: `Grok proposed ${actions.length} change(s)`,
      before,
    };
  };

  /**
   * Builds a rich snapshot and calls the new structured Grok endpoint.
   * This is the key integration point that gives Grok the full context
   * it was missing in the May 21 screenshot failures.
   */
  const requestGrokStructuredSuggestions = async (focus: {
    type: "slot" | "person" | "board";
    value?: string;
    /** Override all default Grok focus messages with a free-text question. */
    userQuestion?: string;
  }) => {
    // Dynamically import to keep the giant client file's static graph small for Turbopack HMR stability
    const { buildRichGrokContextSnapshot } = await import("@/lib/shiftbuilder/grokIntelligence");
    const snapshot = buildRichGrokContextSnapshot({
      day: selectedDay.name,
      graveOnly,
      assignments,
      draftAssignments,
      auxDefs,
      // Hide called-off TMs from Grok entirely. They're not eligible for
      // placement tonight and surfacing them would just produce suggestions
      // we'd reject in the guard.
      graveRoster: availableGraveRoster,
      selectedSlotKey: focus.type === "slot" ? focus.value : undefined,
      selectedPersonName: focus.type === "person" ? focus.value : undefined,
      contextType: focus.type === "board" ? "board" : focus.type,
    });

    // userQuestion override takes precedence — used by the ? query mode.
    const resolvedQuestion =
      focus.userQuestion ??
      (focus.type === "slot"
        ? `Best suggestions for slot ${focus.value}`
        : focus.type === "person"
        ? `Best things to do with ${focus.value}`
        : undefined);

    const { askGrokForStructuredSuggestions } = await import("./actions");
    const result = await askGrokForStructuredSuggestions({
      snapshot,
      rosterForGuard: availableGraveRoster,
      userQuestion: resolvedQuestion,
    });

    if ((result as any).usage) {
      try {
        useShiftBuilderStore.getState().addAiUsage((result as any).usage);
        updateOpsStatusBarContent?.();
      } catch {}
    }
    return result;
  };

  const triggerGrokBoardAnalysis = () => {
    if (isCurrentNightLocked) {
      showToast("This day is locked — analysis disabled", "error");
      return;
    }
    // Opens the palette (if not already) and the palette's global board button will be visible and prominent
    setCmdkOpen(true);
    // The prominent "Grok: Analyze Full Board" button is always at the top of the palette now
  };
  // Pop the most recently added AUX slot. Defaults are protected so the
  // operator can't accidentally remove SUPPORT 1 / TRASH 1 / etc. Any TM
  // assigned to the popped slot is automatically freed (their assignment
  // entry is cleared, so they re-appear as available in the roster).
  const removableEmptyAux = React.useMemo(() => {
    const live =
      useShiftBuilderStore.getState().assignments ?? assignments;
    return findRemovableEmptyAuxSlot(auxDefs, live);
  }, [auxDefs, assignments]);

  const canAddAux = auxDefs.length < MAX_AUX_SLOTS;
  const canRemoveAux = !!removableEmptyAux;

  const removeLastAuxSlot = () => {
    const live =
      useShiftBuilderStore.getState().assignments ?? assignments;
    setAuxDefs((prev) => {
      const removable = findRemovableEmptyAuxSlot(prev, live);
      if (!removable) return prev;
      const before = { assignments: { ...live }, auxDefs: [...prev] };
      pendingHistoryRef.current = {
        description: `Removed empty AUX slot ${removable.key}`,
        before,
      };
      const next = prev.filter((d) => d.key !== removable.key);
      queueMicrotask(() => persistAuxLayoutNowRef.current(next));
      return next;
    });
  };

  // === History recording effect (must be after auxDefs / assignments are declared) ===
  // Deps: assignments + auxDefs only — these are the actual triggers.
  // recordChangeRef holds the stable fn pointer so we don't put shiftHistory
  // (new object every render) in the dep array, which would fire this effect
  // on every render regardless of whether state actually changed.
  useEffect(() => {
    if (pendingHistoryRef.current) {
      const { description, before } = pendingHistoryRef.current;
      const after: Snapshot = {
        assignments: { ...assignments },
        auxDefs: [...auxDefs],
      };
      recordChangeRef.current(description, before, after);
      pendingHistoryRef.current = null;
    }
  }, [assignments, auxDefs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enforce that the "admin" aux (role === 'admin') is always the first card
  // in the AUXILIARY section. This reorders the auxDefs array (which controls
  // both visual order in the grid and the persisted aux_layout) whenever a
  // role change or load results in admin not being first.
  React.useEffect(() => {
    if (!auxDefs || auxDefs.length <= 1) return;
    const adminIndex = auxDefs.findIndex((d) => d.role === 'admin');
    if (adminIndex > 0) {
      setAuxDefs((prev) => {
        const admin = prev[adminIndex];
        const rest = prev.filter((_, i) => i !== adminIndex);
        const next = [admin, ...rest];
        queueMicrotask(() => persistAuxLayoutNowRef.current(next));
        return next;
      });
    }
  }, [auxDefs]);

  // Keyboard shortcuts for undo/redo (one tab session)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isUndo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !e.shiftKey;
      const isRedo = (e.metaKey || e.ctrlKey) && ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y");
      const isCommandPalette = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isUndo) {
        e.preventDefault();
        const prev = shiftHistory.undo();
        if (prev) applySnapshot(prev);
      }
      if (isRedo) {
        e.preventDefault();
        const next = shiftHistory.redo();
        if (next) applySnapshot(next);
      }
      if (isCommandPalette) {
        e.preventDefault();
        setCmdkOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shiftHistory]);

  // === Velvet Marker Pad — floating right panel for quick slot edits ===
  /** Active anchored placement pad slot (card-attached inspector + editor). */
  const [selectedSlotKey, setSelectedSlotKey] = useState<string | null>(null);

  const handleSlotToggle = React.useCallback((slotKey: string) => {
    if (isCurrentNightLocked) {
      showToast("This day is locked — editing disabled", "error");
      return;
    }
    let resolved = slotKey;
    // Physical RR wrapper (RR6) → open the correct MRR/WRR side (never fan out to all 5 cards)
    if (/^RR\d+$/.test(slotKey)) {
      const num = slotKey.replace(/^RR/, "");
      const mKey = `MRR${num}`;
      const wKey = `WRR${num}`;
      const merged = useShiftBuilderStore.getState().assignments ?? {};
      resolved = !merged[mKey]?.tmName ? mKey : wKey;
    }
    setSelectedSlotKey((prev) => (prev === resolved ? null : resolved));
  }, [isCurrentNightLocked, showToast]);

  const handleSlotClose = React.useCallback(() => {
    setSelectedSlotKey(null);
  }, []);

  const openPaletteForPerson = React.useCallback((tm: any) => {
    // Use id when available for stability; fall back to name
    const value = tm?.id || tm?.fullName || tm?.name || '';
    setCmdkInitialContext({ type: 'person', value });
    setCmdkOpen(true);
  }, []);

  // When palette closes, clear the one-time context so next manual ⌘K is clean.
  // Focus management now lives entirely inside CommandPalette (more reliable single source of truth).
  React.useEffect(() => {
    if (!cmdkOpen) {
      const t = setTimeout(() => setCmdkInitialContext(null), 50);
      return () => clearTimeout(t);
    }
  }, [cmdkOpen]);

  // When the main palette opens, close the placement pad (focus conflict on iPad)
  React.useEffect(() => {
    if (cmdkOpen && selectedSlotKey) {
      setSelectedSlotKey(null);
    }
  }, [cmdkOpen, selectedSlotKey]);

  // iPad: hide bottom chrome while PlacementPad sheet is open (avoids LIVE + rotation overlap).
  React.useEffect(() => {
    if (viewMode !== "canvas") return;
    if (isTabletTouchDevice() && selectedSlotKey) {
      hideOpsStatusBar();
      return;
    }
    ensureOpsStatusBar();
  }, [viewMode, selectedSlotKey]);

  const isCurrentWeek = sameDay(weekStart, startOfShiftWeek(todayDate));

  // Each pill group collapses to its active value by default and expands
  // inline on tap. Click-outside or ESC dismisses; selecting collapses with
  // the new active value (handled per-group at the onClick call sites).
  // Left-rail day/week/view controls now live in the fixed left control rail
  // (no more bottom floating pill cluster). The old collapsible pill hooks
  // are retired with the bottom UI.

  // === Zoom & centering (extracted to useZoom) ===
  const showWeekHealthBar =
    viewMode === "canvas" &&
    currentView === "deployment" &&
    isBuilderDeployment &&
    !isWeekHealthTrackerDismissed;

  const builderContentRef = useRef<HTMLDivElement>(null);
  const [builderContentHeight, setBuilderContentHeight] = useState(0);

  const stageInsets = React.useMemo<StageInsets>(() => {
    const tablet = isTabletTouchDevice();
    if (isBuilderLiveCanvas) {
      return {
        top: stageTopInsetPx(),
        right: tablet ? 12 : 16,
        bottom: builderStageBottomInsetPx(),
        left: rosterOpen ? (tablet ? 212 : 280) : tablet ? 12 : 16,
      };
    }
    return {
      top: stageTopInsetPx(),
      right: tablet ? 32 : 40,
      bottom: tablet ? 56 : 68,
      left: rosterOpen ? (tablet ? 212 : 280) : tablet ? 32 : 40,
    };
  }, [rosterOpen, isBuilderLiveCanvas]);

  const {
    zoomMode,
    setZoomMode,
    fitScale,
    stageHostRef,
    scale,
    recomputeScale,
    zoomSteps,
    isTabletTouch,
    maxScale,
  } = useZoom({
    rosterOpen,
    stageInsets,
    builderFit: isBuilderLiveCanvas
      ? {
          enabled: true,
          contentRef: builderContentRef,
          chromeHeightPx: 0,
        }
      : undefined,
  });

  // Builder canvas: default to zoom-to-fit on load, day switches, and deployment ↔ breaks toggles.
  useEffect(() => {
    if (!isBuilderLiveCanvas) return;
    setZoomMode("fit");
    const t1 = requestAnimationFrame(recomputeScale);
    const t2 = window.setTimeout(recomputeScale, 200);
    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(t2);
    };
  }, [isBuilderLiveCanvas, currentView, selectedDayIndex, recomputeScale, setZoomMode]);

  // Re-measure fit when chrome changes but preserve manual zoom if the user stepped in/out.
  useEffect(() => {
    if (!isBuilderLiveCanvas) return;
    recomputeScale();
  }, [isBuilderLiveCanvas, currentView, showWeekHealthBar, rosterOpen, recomputeScale]);

  useEffect(() => {
    if (!isBuilderLiveCanvas) return;
    const el = builderContentRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setBuilderContentHeight(el.scrollHeight || el.offsetHeight || 0);
    measure();
    const ro = new ResizeObserver(() => requestAnimationFrame(measure));
    ro.observe(el);
    return () => ro.disconnect();
  }, [isBuilderLiveCanvas, selectedDayIndex, currentView]);

  const stepZoom = (dir: -1 | 1) => {
    if (zoomMode === "fit") {
      // With richer step lists, pick a sensible discrete level out of "fit"
      // rather than blindly jumping to the extreme ends of the array.
      let target: number;
      if (dir > 0) {
        target = zoomSteps.find((s) => s >= 1) || zoomSteps[zoomSteps.length - 1];
      } else {
        target = zoomSteps.slice().reverse().find((s) => s <= 0.85) || zoomSteps[0];
      }
      setZoomMode(target);
      return;
    }
    const current =
      typeof zoomMode === "number"
        ? zoomSteps.reduce((best, step) =>
            Math.abs(step - zoomMode) < Math.abs(best - zoomMode) ? step : best,
          zoomSteps[0])
        : zoomSteps[Math.floor(zoomSteps.length / 2)];
    const idx = zoomSteps.indexOf(current);
    const baseIdx = idx === -1 ? Math.floor(zoomSteps.length / 2) : idx;
    const next = zoomSteps[Math.max(0, Math.min(zoomSteps.length - 1, baseIdx + dir))];
    setZoomMode(next);
  };

  // Handlers for the FloatingNav zoom cluster (Fit / − / +)
  const handleZoomFit = () => {
    recomputeScale(); // ensure fresh measurement
    setZoomMode("fit");
  };
  const handleZoomOut = () => stepZoom(-1);
  const handleZoomIn = () => stepZoom(1);

  const isStageZoomed =
    zoomMode !== "fit" || Math.abs(scale - fitScale) > 0.02;
  const stageZoomLabel = `${Math.round(scale * 100)}%`;

  useStagePinchPan({
    enabled: isTabletTouch && !selectedSlotKey,
    stageHostRef,
    scale,
    fitScale,
    maxScale,
    setZoomMode,
    onFit: handleZoomFit,
  });

  // === Apple Pencil Pro squeeze gesture to open Command Palette ===
  // When using Pencil Pro, hovering (or having the tip near) a card and
  // squeezing the barrel instantly opens the contextual Command Palette.
  useEffect(() => {
    const handlePointerRaw = (e: Event) => {
      const pe = e as PointerEvent;
      if (pe.pointerType !== "pen") return;

      // Squeeze on Pencil Pro is indicated by the barrel button (buttons & 2)
      if (pe.buttons & 2) {
        // Find the nearest ancestor that represents a slot/card
        const cardEl = (pe.target as HTMLElement | null)?.closest?.('[data-slot-key]');
        if (cardEl) {
          let slotKey = cardEl.getAttribute('data-slot-key');
          if (!slotKey) return;
          // Physical RR wrapper (RR6) — resolve to MRR/WRR side, never open 5 pads
          if (/^RR\d+$/.test(slotKey)) {
            const num = slotKey.replace(/^RR/, "");
            const mKey = `MRR${num}`;
            const wKey = `WRR${num}`;
            const merged = useShiftBuilderStore.getState().assignments ?? {};
            slotKey = !merged[mKey]?.tmName ? mKey : wKey;
          }
          handleSlotToggle(slotKey);
        }
      }
    };

    const stage = stageHostRef.current;
    if (stage) {
      stage.addEventListener("pointerrawupdate", handlePointerRaw, { passive: true });
      return () => {
        stage.removeEventListener("pointerrawupdate", handlePointerRaw);
      };
    }
  }, [handleSlotToggle]);

  // Use deferred value for the heavy board rendering.
  // The nav/chrome uses the immediate index for snappy feedback.
  const selectedDay = DAY_DEFS[deferredDayIndex];

  // Next calendar day for the AM overlaps (5a–7a). A Friday grave sheet's AM
  // overlaps physically occur on Saturday morning. We surface a "next day header"
  // in the overlaps section (styled to mimic the main artboard day headers)
  // and place the filled count directly under it.
  const amOverlapDate = addDays(selectedDay.date, 1);
  const amOverlapDayName = DAY_LONG[amOverlapDate.getDay()];
  const amOverlapDateNum = amOverlapDate.getDate();
  const nextDayColor = SHIFT_DAY_COLORS[(selectedDayIndex + 1) % 7];

  // Full data orchestration (Slice 1 — Production Stabilization).
  // useShiftData centralizes useCurrentNight + hydration bridges + effective values + store selectors.
  // This removes a large amount of unification/effect boilerplate from the orchestrator.
  const shiftData = useShiftData(selectedDay);

  // Back-compat aliases so the rest of this file (hundreds of references) continues to work
  // with minimal further edits in this slice. Over time these can be inlined to shiftData.* .
  const currentNight = shiftData.currentNight;

  // Flex aux row — immediate persist (resolves nightId if needed, patches query cache)
  const auxDefsLatestRef = React.useRef(auxDefs);
  auxDefsLatestRef.current = auxDefs;
  const auxSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const auxLayoutSavedFingerprintRef = React.useRef<string>("");

  const flushAuxLayoutSave = React.useCallback(async () => {
    if (auxSaveTimerRef.current) {
      clearTimeout(auxSaveTimerRef.current);
      auxSaveTimerRef.current = null;
    }
    const layout = auxDefsLatestRef.current;
    const dateStr = formatLocalDateISO(selectedDay.date);
    let nid = currentNight.nightId ?? nightId;
    try {
      if (!nid) {
        const { getOrCreateNightForDate } = await import("@/lib/shiftbuilder/data");
        nid = await getOrCreateNightForDate(selectedDay.date, selectedDay.name);
        setNightId(nid);
      }
      const fp = `${nid}:${JSON.stringify(layout)}`;
      if (fp === auxLayoutSavedFingerprintRef.current) return;

      const { saveNightAuxLayout } = await import("@/lib/shiftbuilder/data");
      await saveNightAuxLayout(nid, layout, dateStr);
      auxLayoutSavedFingerprintRef.current = fp;

      const qc = currentNight.queryClient;
      if (qc) {
        patchNightCoreAuxLayoutCache(qc, dateStr, layout);
      }
    } catch (e) {
      console.warn("[ShiftBuilder] aux_layout save failed", e);
      showToast("Aux layout could not be saved", "error");
    }
  }, [
    selectedDay.date,
    selectedDay.name,
    currentNight.nightId,
    currentNight.queryClient,
    nightId,
    showToast,
  ]);

  const scheduleAuxLayoutSave = React.useCallback(
    (delayMs = 250) => {
      if (auxSaveTimerRef.current) clearTimeout(auxSaveTimerRef.current);
      auxSaveTimerRef.current = setTimeout(() => {
        auxSaveTimerRef.current = null;
        void flushAuxLayoutSave();
      }, delayMs);
    },
    [flushAuxLayoutSave],
  );

  React.useEffect(() => {
    persistAuxLayoutNowRef.current = (layout) => {
      auxDefsLatestRef.current = layout;
      void flushAuxLayoutSave();
    };
  }, [flushAuxLayoutSave]);
  const storeAssignments = shiftData.storeAssignments;
  const storeDraftAssignments = shiftData.storeDraftAssignments;

  effectiveRealRoster = shiftData.effectiveRealRoster || [];
  effectiveGraveRoster = shiftData.effectiveGraveRoster || [];

  const effectiveRecentZoneHistory = shiftData.effectiveRecentZoneHistory ?? recentZoneHistory;
  const effectiveCardBorders = shiftData.effectiveCardBorders ?? cardBorders;

  const fullGraveScheduledTonight: Set<string> = shiftData.fullGraveScheduledTonight;
  const pmOverlapScheduledTonight: Set<string> = shiftData.pmOverlapScheduledTonight;
  const amOverlapScheduledTonight: Set<string> = shiftData.amOverlapScheduledTonight;

  const effectiveScheduledTmIdsTonight: Set<string> = shiftData.effectiveScheduledTmIdsTonight;

  const scheduleFilterActive = effectiveScheduledTmIdsTonight.size > 0;

  // Engine + picker pool — MUST run after effective* roster bridge (not the early `let` defaults).
  const availableGraveRoster = React.useMemo(
    () =>
      (effectiveGraveRoster as any[]).filter((t: any) => {
        const id = boardTmId(t);
        if (!id || calledOffIds.has(id)) return false;
        return !scheduleFilterActive || effectiveScheduledTmIdsTonight.has(id);
      }),
    [
      effectiveGraveRoster,
      calledOffIds,
      scheduleFilterActive,
      effectiveScheduledTmIdsTonight,
    ],
  );
  const availableRealRoster = React.useMemo(
    () =>
      (effectiveRealRoster as any[]).filter((t: any) => {
        const id = boardTmId(t);
        if (!id || calledOffIds.has(id)) return false;
        return !scheduleFilterActive || effectiveScheduledTmIdsTonight.has(id);
      }),
    [effectiveRealRoster, calledOffIds, scheduleFilterActive, effectiveScheduledTmIdsTonight],
  );

  // === END TEMP DIAGNOSTIC ===

  // Assignments and loading now come from the centralized useShiftData hook (Slice 1).
  // The heavy hydration effect (query → store + live cross-day mirrors + week bootstrap)
  // has been moved into useShiftData so the orchestrator is thinner and data ownership is explicit.
  const effectiveAssignments = shiftData.effectiveAssignments ?? assignments;

  const hasBoardPayload = shiftData.hasBoardPayload;
  const boardColdLoading = shiftData.boardColdLoading;
  const boardBackgroundSync = shiftData.boardBackgroundSync;
  const showCanvasVeil = boardBackgroundSync || (isPending && hasBoardPayload);

  // liveAssignVersion is still managed locally in the orchestrator for the many call sites that do
  // setLiveAssignVersion((v) => v + 1) after optimistic writes / drags / applies. The hook also tracks
  // its own version for shiftData consumers. We bump both for maximum compatibility in this slice.
  const [liveAssignVersion, setLiveAssignVersion] = React.useState(0);
  // After any major write, also bump the hook's internal tracker (used by week surfaces via shiftData).
  const bumpLiveFromHook = shiftData.bumpLiveAssignVersion;

  // Note: the previous large hydration useEffect, day-switch mirror, and initial week seed
  // now live inside useShiftData. The hook also provides mirrorCurrentDay() and patchCurrentNightCache()
  // for action sites that need to force a mirror after optimistic writes.

  // Live assignments version — forces alreadyAssignedThisNight (and therefore the
  // MarkerPad / picker scheduledUnassigned + allEligible lists) to recompute whenever
  // the optimistic live layer or realtime bridge mutates placements for this night.
  // This makes "exclude already placed TMs" reactive even in the modern live.assign path.
  // (Declaration lives earlier near the shiftData integration; this is the usage site only.)

  // Bootstrap liveAssignmentsStore for the full current grave week (and at least the "reached" days 0..selected).
  // This is what makes the Weekly Overview sheet, plannedThisWeekRecentHistory (used by fit chips, health,
  // pads, xAI, matrix), and week-repeat logic see prior days after a refresh or without the user having
  // manually visited/clicked every day in this browser session.
  //
  // Strategy:
  // - Prefetch all days in DAY_DEFS in the background (the prefetchNight helper uses queryClient.prefetchQuery).
  // - Seed synchronously from query cache if data is already present (fast cache hit or previous hover).
  // - Subscribe to the query cache so that when background prefetches for week days complete (or any
  //   other load of a week night happens), we normalize their assignments into the live store and bump
  //   liveAssignVersion. This causes weekOverviewNights + plannedThisWeekRecentHistory memos to re-run
  //   and the table / fit / health surfaces to update live.
  // - We still layer the live `assignments` for the exact current selected day on top (optimistic safety).
  // - Clicking day headers continues to work (normal hydrate + mirror for that day).
  React.useEffect(() => {
    if (!DAY_DEFS.length || !currentNight?.queryClient) return;

    const qc = currentNight.queryClient;
    const liveStore = liveAssignmentsStore.getState();

    // Prefetch the entire grave week in the background. Small number of days (usually 7), cheap.
    DAY_DEFS.forEach((def) => {
      try {
        currentNight.prefetchNight(def.date);
      } catch {}
    });

    // Immediate seed for anything already in cache right now.
    let seeded = false;
    DAY_DEFS.forEach((def) => {
      const dk = formatLocalDateISO(def.date);
      if (liveStore.assignmentsByNight[dk]) return;
      const cached: any = qc.getQueryData(["nightCore", dk]) || qc.getQueryData(["night", dk]);
      if (cached?.assignments) {
        const liveForNight: Record<string, any> = {};
        Object.entries(cached.assignments as Record<string, any>).forEach(([slotKey, a]: [string, any]) => {
          if (a?.tmId) {
            liveForNight[slotKey] = {
              tmId: a.tmId,
              tmName: a.tmName || null,
              isLocked: !!a.isLocked,
            };
          }
        });
        if (Object.keys(liveForNight).length > 0) {
          liveAssignmentsStore.getState().setAssignmentsForNight(dk, liveForNight);
          seeded = true;
        }
      }
    });
    if (seeded) setLiveAssignVersion((v) => v + 1);

    // React to async query completions for any of our week days.
    const queryCache = qc.getQueryCache();
    const unsub = queryCache.subscribe((event: any) => {
      const query = event?.query;
      const qk = query?.queryKey;
      if (!Array.isArray(qk) || qk[0] !== "nightCore") return;
      const dk = qk[1];
      if (typeof dk !== "string") return;

      // Only care about days that belong to the current grave week.
      const isWeekDay = DAY_DEFS.some((d) => formatLocalDateISO(d.date) === dk);
      if (!isWeekDay) return;

      // Already have it in live (from visit, previous seed, or mirror) — nothing to do.
      if (liveAssignmentsStore.getState().assignmentsByNight[dk]) return;

      const data = query?.state?.data;
      if (data?.assignments) {
        const liveForNight: Record<string, any> = {};
        Object.entries(data.assignments as Record<string, any>).forEach(([slotKey, a]: [string, any]) => {
          if (a?.tmId) {
            liveForNight[slotKey] = {
              tmId: a.tmId,
              tmName: a.tmName || null,
              isLocked: !!a.isLocked,
            };
          }
        });
        if (Object.keys(liveForNight).length > 0) {
          liveAssignmentsStore.getState().setAssignmentsForNight(dk, liveForNight);
          setLiveAssignVersion((v) => v + 1);
        }
      }
    });

    return () => {
      try {
        unsub();
      } catch {}
    };
  }, [DAY_DEFS, currentNight?.queryClient]);

  // Planned "this week" recent history built from live/in-app assignments for the days in the current grave week
  // up to and including the selectedDay. This ensures that as the user builds/plans forward within a week
  // (e.g. assigns Mon, then views Thu), the matrix, week-repeat penalties, fit chips, health %, pad xAI context,
  // and "this week" signals all see the prior days' planned placements in the same week.
  // Uses the liveAssignmentsStore (which holds per-night assignments by dateKey, updated on assign/live/realtime)
  // plus the current night's assignments.
  const plannedThisWeekRecentHistory = React.useMemo(() => {
    const result = new Map<string, Array<{ nightDate: string; slotKey: string }>>();
    if (!DAY_DEFS || DAY_DEFS.length === 0) return result;

    const storeState = liveAssignmentsStore.getState();
    const qc = currentNight?.queryClient;
    // Aggregate the full week data for "week as a whole" consistency.
    // Previously limited to i <= selectedDayIndex, which made the weekly repeat counts (and thus "wk" health %)
    // depend on the viewed day (history "shrunk" when viewing earlier days, and only the viewed day's assignments
    // were merged as "current"). Now we include *all* days in DAY_DEFS that have data in store/cache.
    // This makes the week % health (the weeklyBalance / repeat penalty part) consistent for the built week,
    // no matter which day you are currently viewing/editing. The "tonight" fit part still varies by selected day.
    // As you build forward, more days get data in the store (via mirrors), so the week aggregate grows naturally.
    for (let i = 0; i < DAY_DEFS.length; i++) {
      const dayDef = DAY_DEFS[i];
      if (!dayDef) continue;
      const dateKey = formatLocalDateISO(dayDef.date);
      let nightAss: Record<string, any> = {};
      // Query cache is authoritative for non-selected days (live store can race during day switches).
      if (qc) {
        const cached: any = qc.getQueryData(["nightCore", dateKey]) || qc.getQueryData(["night", dateKey]);
        if (cached?.assignments) nightAss = cached.assignments;
      }
      if (!nightAss || Object.keys(nightAss).length === 0) {
        nightAss = storeState.assignmentsByNight[dateKey] || {};
      }
      // Selected day: layer live board only when store is hydrated for that exact night.
      if (
        i === selectedDayIndex &&
        getBoardAssignmentsDayKey() === dateKey
      ) {
        const fromBoard = useShiftBuilderStore.getState().assignments ?? {};
        nightAss = { ...nightAss, ...fromBoard };
      }
      // Collect from the (store or cached) for this day. Do *not* layer the live main here;
      // the health merge will ensure the current viewed day's live is counted toward this week.
      // This keeps the base "week committed" consistent across view days.
      for (const [slotKey, ass] of Object.entries(nightAss)) {
        const tmId = (ass as any)?.tmId;
        if (tmId) {
          if (!result.has(tmId)) result.set(tmId, []);
          result.get(tmId)!.push({ nightDate: formatLocalDateISO(dayDef.date), slotKey });
        }
      }
    }
    return result;
  }, [DAY_DEFS, selectedDayIndex, assignments, storeAssignments, liveAssignVersion, currentNight?.queryClient]);

  // Data for the weekly overview on the sheet (built from live assignments across the week days).
  // This feeds the print-preview style weekly table directly on the artboard (replacing the old side panel).
  // Sources from liveAssignmentsStore (populated on assign + mirrors on day progress) + layers the
  // live `assignments` for the exact current selected day (optimistic/main). Only days up to the
  // selected get the "reached" treatment so that as you build forward (Mon->Thu), prior days populate
  // their columns with real placements (same policy as plannedThisWeekRecentHistory / matrix / repeats).
  // Full DAY_DEFS length keeps stable week table structure (matching print fidelity); unreached future
  // days render as blank (—) until visited/assigned.
  const weekOverviewNights: OverviewNight[] = React.useMemo(() => {
    const result: OverviewNight[] = [];
    if (!DAY_DEFS || DAY_DEFS.length === 0) return result;
    const storeState = liveAssignmentsStore.getState();
    const qc = currentNight?.queryClient;
    // Include data for the *full* week (all DAY_DEFS) if present in store/cache.
    // Previously limited to <= selectedDayIndex for "reached" during build-forward.
    // Now, once a day has been visited/built (data in store), it shows in the week table even when viewing an earlier day.
    // This makes the week view (table + its health) the "week as a whole" consistently.
    // Unvisited future days remain blank (—) until assigned/visited.
    DAY_DEFS.forEach((def, dayIndex) => {
      const dateKey = formatLocalDateISO(def.date);
      let nightAss: Record<string, any> = {};
      // Query cache is authoritative for non-selected days (live store can race during day switches).
      if (qc) {
        const cached: any = qc.getQueryData(["nightCore", dateKey]) || qc.getQueryData(["night", dateKey]);
        if (cached?.assignments) nightAss = cached.assignments;
      }
      if (!nightAss || Object.keys(nightAss).length === 0) {
        nightAss = storeState.assignmentsByNight[dateKey] || {};
      }
      // Selected day: overlay live zustand board only when hydrated for this exact night.
      if (
        dayIndex === selectedDayIndex &&
        getBoardAssignmentsDayKey() === dateKey
      ) {
        const fromBoard = useShiftBuilderStore.getState().assignments ?? {};
        nightAss = { ...nightAss, ...fromBoard };
      }
      // If still empty for a day (not yet visited), leave as {} → will be blank "—" in the table.
      // No else blanking; if store has data from prior visit, include it for the full week view.
      const assignmentsForOverview: Record<string, { tmId: string; tmName: string; breakGroup?: number } | null> = {};
      Object.entries(nightAss).forEach(([slotKey, a]: [string, any]) => {
        if (a?.tmId) {
          const tmName = a.tmName || a.displayName || a.fullName || a.name || '';
          assignmentsForOverview[slotKey] = {
            tmId: a.tmId,
            tmName,
            breakGroup: a.breakGroup ?? 0,
          };
        }
      });
      result.push({ dayIndex, assignments: assignmentsForOverview });
    });
    return result;
  }, [DAY_DEFS, selectedDayIndex, storeAssignments, liveAssignVersion, currentNight?.queryClient]);

  // WeekLens v2 shared memos (builder page only, but cheap to compute).
  // These power the top bar health/viol (already partially live) + the sidebar suggestions list.
  // Uses the exact same helpers as the advisor so numbers and suggestions stay consistent
  // (full week, only relevant deployment slots via shouldShowPlacementFitChip, real display names).
  const weekLensViolations: WeekRepeatViolation[] = React.useMemo(() => {
    return getWeekRepeatViolations(plannedThisWeekRecentHistory);
  }, [plannedThisWeekRecentHistory]);

  const weekLensSuggestions = React.useMemo(() => {
    // Build reliable tmName map (same approach as handleRequestRotationAdvisor).
    const tmNameById: Record<string, string> = {};
    const add = (id?: any, name?: any) => { if (id && name) tmNameById[String(id)] = String(name); };

    (weekOverviewNights || []).forEach((night: any) => {
      Object.values(night?.assignments || {}).forEach((row: any) => add(row?.tmId, row?.tmName || row?.displayName || row?.name));
    });
    Object.values(assignments || {}).forEach((row: any) => add((row as any)?.tmId, (row as any)?.tmName));

    try {
      const storeState = (typeof liveAssignmentsStore !== 'undefined' ? liveAssignmentsStore.getState() : null) as any;
      if (storeState?.assignmentsByNight) {
        Object.values(storeState.assignmentsByNight).forEach((nightAss: any) => {
          if (nightAss && typeof nightAss === 'object') {
            Object.values(nightAss).forEach((row: any) => add((row as any)?.tmId, (row as any)?.tmName));
          }
        });
      }
    } catch {}

    return suggestLocalRotationMoves(weekLensViolations, plannedThisWeekRecentHistory, auxDefs, (tid) => tmNameById[tid]);
  }, [weekLensViolations, plannedThisWeekRecentHistory, weekOverviewNights, assignments, auxDefs]);

  // Raw violation count to match the banner inside the paper (includes all repeats for visibility).
  // The weekLensViolations is the filtered/actionable one for health/AI.
  const rawWeekViolCount = React.useMemo(() => {
    let v = 0;
    const counts = new Map<string, number>();
    (weekOverviewNights || []).forEach((n: any) => {
      Object.entries(n.assignments || {}).forEach(([sk, a]: any) => {
        const t = a?.tmId;
        if (t) {
          const k = `${t}:${sk}`;
          counts.set(k, (counts.get(k) || 0) + 1);
        }
      });
    });
    counts.forEach((c) => { if (c > 1) v++; });
    return v;
  }, [weekOverviewNights]);

  React.useEffect(() => {
    const dateKey = nightDateKey(selectedDay.date);
    const bump = () => setLiveAssignVersion((v) => v + 1);
    const unsubLive = liveAssignmentsStore.subscribe(
      (state) => state.assignmentsByNight[dateKey],
      bump,
      { fireImmediately: false },
    );
    const unsubMain = useShiftBuilderStore.subscribe(
      (state) => state.assignments,
      bump,
      { fireImmediately: false },
    );
    return () => {
      unsubLive();
      unsubMain();
    };
  }, [selectedDay]);

  React.useEffect(() => {
    if (Object.keys(draftAssignments).length > 0 || Object.keys(useShiftBuilderStore.getState().draftAssignments).length > 0) {
      useShiftBuilderStore.getState().setDraftAssignments(draftAssignments);
    }
  }, [draftAssignments]);

  // Sync auxDefs into store (3.4) so Board and cards can subscribe narrowly
  React.useEffect(() => {
    if (auxDefs && auxDefs.length > 0) {
      useShiftBuilderStore.getState().setAuxDefs(auxDefs);
    }
  }, [auxDefs]);

  // One-time seed on mount so first paint of Board has correct auxDefs
  React.useEffect(() => {
    const storeAux = useShiftBuilderStore.getState().auxDefs;
    if (storeAux.length === 0 && auxDefs.length > 0) {
      useShiftBuilderStore.getState().setAuxDefs(auxDefs);
    }
  }, []); // run once

  // Hydrate auxDefs per night from night-core query
  const hydratedAuxDayRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    hydratedAuxDayRef.current = null;
    auxLayoutSavedFingerprintRef.current = "";
  }, [selectedDay.date]);

  React.useEffect(() => {
    const dayKey = nightDateKey(selectedDay.date);
    if (hydratedAuxDayRef.current === dayKey) return;
    if (boardColdLoading || currentNight.isCoreFetching) return;

    const fromQuery = currentNight.auxDefs;
    if (!fromQuery?.length) return;

    hydratedAuxDayRef.current = dayKey;
    const normalized = fromQuery.map((d) => ({
      ...d,
      role: d.role ?? "blank",
    }));
    const ensured = ensureAdminFirst(normalized);
    setAuxDefs(ensured);
    const nid = currentNight.nightId;
    if (nid) {
      auxLayoutSavedFingerprintRef.current = `${nid}:${JSON.stringify(ensured)}`;
    }
  }, [
    selectedDay.date,
    boardColdLoading,
    currentNight.isCoreFetching,
    currentNight.auxDefs,
    currentNight.nightId,
  ]);

  // Persist aux_layout whenever layout changes
  React.useEffect(() => {
    scheduleAuxLayoutSave(250);
  }, [auxDefs, scheduleAuxLayoutSave]);

  React.useEffect(() => {
    return () => {
      void flushAuxLayoutSave();
    };
  }, [flushAuxLayoutSave]);

  // === 3.2 Web Worker + 3.5 Measurement (Day Data Processor) ===
  // Offloads heavy post-processing from main thread (big win for iPad day switches).
  const dayWorkerRef = React.useRef<Worker | null>(null);
  const [processedDayData, setProcessedDayData] = React.useState<any>(null);

  // Initialize worker
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      dayWorkerRef.current = new Worker(
        new URL('../../lib/shiftbuilder/dayData.worker', import.meta.url),
        { type: 'module' }
      );

      dayWorkerRef.current.onmessage = (e: MessageEvent) => {
        if (e.data.type === 'PROCESSED_NIGHT') {
          setProcessedDayData(e.data.payload);
        } else if (e.data.type === 'PROCESS_ERROR') {
          console.warn('[DayWorker] error', e.data.payload);
          setProcessedDayData(null);
        }
      };

      return () => {
        dayWorkerRef.current?.terminate();
        dayWorkerRef.current = null;
      };
    } catch (err) {
      console.warn('[DayWorker] init failed (sync fallback)', err);
    }
  }, []);

  // Send work to worker when day data arrives
  React.useEffect(() => {
    if (!dayWorkerRef.current) return;

    const payload: any = { auxDefs };

    // Send raw data when available so the worker can do real heavy lifting
    // (assignment mapping, wave prep, etc.) off the main thread.
    const hasRaw = currentNight?.rawDbAssignments && Array.isArray(currentNight.rawDbAssignments);
    if (hasRaw) {
      payload.dbAssignments = currentNight.rawDbAssignments;
    }
    if (currentNight?.rawBreakRows) {
      payload.breakRows = currentNight.rawBreakRows;
    }
    if (currentNight?.slotDefaultBreaks) {
      payload.slotDefaultBreaks = currentNight.slotDefaultBreaks;
    }

    // Prefer enriched UI assignments (sudo defaults + explicit overrides) for break counts.
    if (effectiveAssignments && Object.keys(effectiveAssignments).length > 0) {
      payload.assignments = effectiveAssignments;
    }

    // Only post if we have something useful to avoid the worker getting undefined data
    if (hasRaw || (payload.assignments && Object.keys(payload.assignments).length > 0)) {
      dayWorkerRef.current.postMessage({
        type: 'PROCESS_NIGHT',
        payload,
      });
    }
  }, [
    currentNight?.rawDbAssignments,
    currentNight?.rawBreakRows,
    currentNight?.slotDefaultBreaks,
    effectiveAssignments,
    auxDefs,
  ]);

  // 3.5 Measurement: when the visual surface has fresh data
  // Made more defensive so the dev pill always gets a value (even on initial load
  // or day changes that don't perfectly mark 'day-switch-start').
  React.useEffect(() => {
    if (!currentNight?.assignments || typeof window === 'undefined') return;

    const now = Date.now();
    const hasStartMark = typeof performance !== 'undefined' && performance.getEntriesByName?.('day-switch-start')?.length > 0;

    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark('day-data-ready', { 
        detail: { nightId: currentNight.nightId, hasProcessed: !!processedDayData } 
      });
    }

    let duration = 0;
    try {
      if (hasStartMark) {
        const measure = performance.measure('day-switch-to-data-ready', 'day-switch-start', 'day-data-ready');
        duration = measure?.duration ?? 0;
      } else {
        // Fallback: use a rough "data arrived" timestamp for the pill
        duration = 0; // will show as 0ms or we can use a different signal
      }
    } catch {
      // measure can throw if no start mark — that's expected on first load
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[Perf] Night data ready: ${duration ? duration.toFixed(1) + 'ms' : 'initial/other path'}`, {
        nightId: currentNight.nightId,
        fromWorker: !!processedDayData,
      });

      (window as any).__lastDaySwitchMs = duration || (now - (window as any).__nightDataArrivalTs || 120);
      (window as any).__lastDaySwitch = {
        totalMs: duration || 0,
        source: processedDayData ? 'worker+store' : 'store',
        hasWorker: !!processedDayData,
        nightId: currentNight.nightId,
        ts: now,
      };
      (window as any).__nightDataArrivalTs = now;
      (window as any).__lastDataReadyTs = performance.now();  // for paint delta calculation in Board

      // Server latency signal for the permanent OpsStatusBar (v1 approximation:
      // time from day-switch start mark to core data ready is dominated by the
      // Supabase roundtrip + processing). A true lightweight ping can be added later.
      (window as any).__lastServerLatencyMs = Math.round(duration || 40);
    }
  }, [currentNight?.assignments, currentNight?.nightId, processedDayData]);

  // Week prefetch: BuilderDataPrefetch seeds cache during PIN gate; this effect
  // tops up when weekStart changes (calendar navigation) or selected day shifts.
  React.useEffect(() => {
    if (!currentNight?.prefetchNight || DAY_DEFS.length === 0) return;

    const selectedDef = DAY_DEFS[selectedDayIndex];
    if (selectedDef?.date) {
      currentNight.prefetchNight(selectedDef.date);
    }

    DAY_DEFS.forEach((def, idx) => {
      if (idx === selectedDayIndex) return;
      setTimeout(() => currentNight.prefetchNight(def.date), 40 * idx);
    });
  }, [DAY_DEFS, selectedDayIndex, currentNight, weekStart]);

  // Use query data as source of truth (full TanStack Query commitment)
  const queryAssignments = currentNight.assignments || {};
  const queryNightId = currentNight.nightId || null;

  // Phase 1 Live Cache + Optimistic Layer
  // Provides assign/unassign with instant UI (Query + Zustand), perfect rollback,
  // conflict toasts, and realtime sync from other clients.
  const live = useLiveAssignments(selectedDay);

  // Graves Default Schedule page uses its own QueryClient — broadcast invalidates ours.
  React.useEffect(() => {
    const qc = currentNight.queryClient;
    if (!qc) return;

    const refreshScheduledData = async () => {
      await invalidateNightCoreQueries(qc);
      setPickerScheduleEpoch((e) => e + 1);
      try {
        const dateStr = formatLocalDateISO(selectedDay.date);
        const nid = queryNightId || nightId;
        const url = nid
          ? `/api/shiftbuilder/scheduled-roster?date=${dateStr}&night_id=${nid}`
          : `/api/shiftbuilder/scheduled-roster?date=${dateStr}`;
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setScheduledTmIdsTonight(boardTmIdsFromScheduled(data.allScheduled || []));
        }
      } catch {
        /* nightCore refetch is the primary path */
      }
    };

    const onScheduleChanged = () => {
      void refreshScheduledData();
    };

    window.addEventListener(GRAVES_DEFAULT_SCHEDULE_CHANGED_EVENT, onScheduleChanged);
    return () => {
      window.removeEventListener(GRAVES_DEFAULT_SCHEDULE_CHANGED_EVENT, onScheduleChanged);
    };
  }, [currentNight.queryClient, selectedDay, queryNightId, nightId]);

  // Subscribe to realtime for this night when we have an ID (idempotent).
  // Teardown on unmount / major day change is handled via effect below.
  React.useEffect(() => {
    if (queryNightId) {
      const cleanup = initLiveCacheForNight(queryNightId, nightDateKey(selectedDay.date), /* queryClient from useCurrentNight */ currentNight.queryClient);
      return () => {
        cleanup?.();
      };
    }
  }, [queryNightId, selectedDay.date, currentNight.queryClient]);

  const builderOperatorName =
    currentOperator?.full_name?.trim() ||
    currentOperator?.username?.trim() ||
    "Shift Builder";

  const logBuilderChange = useCallback(
    (params: {
      action: DeploymentChangeAction;
      slotKey?: string;
      previousTmId?: string | null;
      previousTmName?: string | null;
      newTmId?: string | null;
      newTmName?: string | null;
      payload?: Record<string, unknown>;
      targetNightId?: string | null;
    }) => {
      const activeNightId = params.targetNightId ?? nightId ?? queryNightId;
      if (!activeNightId) return;
      logDeploymentChange({
        nightId: activeNightId,
        nightDate: formatLocalDateISO(selectedDay.date),
        operatorName: builderOperatorName,
        action: params.action,
        slotKey: params.slotKey,
        previousTmId: params.previousTmId ?? null,
        previousTmName: params.previousTmName ?? null,
        newTmId: params.newTmId ?? null,
        newTmName: params.newTmName ?? null,
        payload: { source: "shiftbuilder", ...params.payload },
      });
    },
    [builderOperatorName, nightId, queryNightId, selectedDay.date],
  );

  // Global teardown safety on component unmount
  React.useEffect(() => {
    return () => {
      teardownAllLiveCache();
    };
  }, []);

  // === Realtime for night_tm_status + call_offs (TM schedule changes) ===
  // When operator (or another user) marks LOA, PTO, changes a shift, or adds call-off,
  // we want the planner + engine to see it immediately.
  //
  // IMPORTANT: Channel creation is async (dynamic import) so we use a cancellation
  // guard + captured instance arrays. This prevents overlapping subscriptions when
  // the date changes rapidly or during HMR/StrictMode double-invocation.
  React.useEffect(() => {
    if (!nightId) return;

    let cancelled = false;
    const createdChannels: any[] = [];
    const teardownFns: Array<() => void> = [];

    (async () => {
      // Dynamically import the realtime channel helpers (eliminates last static data.ts edge)
      const {
        createNightScheduleStatusChannel,
        createCallOffsChannel,
        createTMDefaultSchedulesChannel,
        createTMOnCallSchedulesChannel,
        unsubscribeChannel,
      } = await import("@/lib/shiftbuilder/data");

      if (cancelled) return;

      const nightDateIso = selectedDay.date.toISOString().slice(0, 10);

      const statusChannel = createNightScheduleStatusChannel(nightId, async () => {
        try {
          const dateStr = selectedDay.date.toISOString().slice(0, 10);
          const res = await fetch(`/api/shiftbuilder/scheduled-roster?date=${dateStr}`);
          if (res.ok) {
            const data = await res.json();
            setScheduledTmIdsTonight(boardTmIdsFromScheduled(data.allScheduled || []));
          }
        } catch {}
        console.log('[shiftbuilder] night_tm_status changed — refreshed via API');
      });
      createdChannels.push(statusChannel);

      const callOffChannel = createCallOffsChannel(nightDateIso, async () => {
        const { getCallOffsForDate } = await import("@/lib/shiftbuilder/tmCommands");
        const freshCalledOff = await getCallOffsForDate(selectedDay.date);
        setCalledOffIds(freshCalledOff);
        console.log('[shiftbuilder] call_offs changed — refreshed called off set');
      });
      createdChannels.push(callOffChannel);

      const defaultSchedulesChannel = createTMDefaultSchedulesChannel(async () => {
        try {
          const dateStr = selectedDay.date.toISOString().slice(0, 10);
          const res = await fetch(`/api/shiftbuilder/scheduled-roster?date=${dateStr}`);
          if (res.ok) {
            const data = await res.json();
            setScheduledTmIdsTonight(boardTmIdsFromScheduled(data.allScheduled || []));
          }
        } catch {}
        console.log('[shiftbuilder] tm_default_schedules changed — refreshed via API');
      });
      createdChannels.push(defaultSchedulesChannel);

      const onCallSchedulesChannel = createTMOnCallSchedulesChannel(async () => {
        try {
          const dateStr = selectedDay.date.toISOString().slice(0, 10);
          const res = await fetch(`/api/shiftbuilder/scheduled-roster?date=${dateStr}`);
          if (res.ok) {
            const data = await res.json();
            setScheduledTmIdsTonight(boardTmIdsFromScheduled(data.allScheduled || []));
          }
        } catch {}
        console.log('[shiftbuilder] tm_on_call_schedules changed — refreshed via API');
      });
      createdChannels.push(onCallSchedulesChannel);

      // Build teardown after we know we weren't cancelled
      if (!cancelled) {
        teardownFns.push(
          () => unsubscribeChannel(statusChannel),
          () => unsubscribeChannel(callOffChannel),
          () => unsubscribeChannel(defaultSchedulesChannel),
          () => unsubscribeChannel(onCallSchedulesChannel),
        );
      }
    })();

    return () => {
      cancelled = true;
      // Run every teardown we registered for *this* effect invocation
      teardownFns.forEach((fn) => {
        try { fn(); } catch {}
      });
      // Extra safety: remove any channel objects we captured even if unsubscribe failed
      createdChannels.forEach((ch) => {
        if (ch) {
          // fire-and-forget is acceptable here; we are unmounting / switching
          import("@/lib/shiftbuilder/data").then(({ unsubscribeChannel }) => {
            unsubscribeChannel(ch).catch(() => {});
          }).catch(() => {});
        }
      });
    };
  }, [nightId, selectedDay.date]);

  // Day arrow navigation — cross GRAVE week boundaries seamlessly.
  const goPrevDay = React.useCallback(() => {
    if (selectedDayIndex > 0) {
      setSelectedDayIndex(selectedDayIndex - 1);
    } else {
      // Cross into previous GRAVE week (Fri–Thu): jump to Thu (index 6)
      const prevWeek = addDays(weekStart, -7);
      setWeekStart(prevWeek);
      setSelectedDayIndex(6);
    }
  }, [selectedDayIndex, weekStart]);

  const goNextDay = React.useCallback(() => {
    if (selectedDayIndex < 6) {
      setSelectedDayIndex(selectedDayIndex + 1);
    } else {
      // Cross into next GRAVE week: jump to Fri (index 0)
      const nextWeek = addDays(weekStart, 7);
      setWeekStart(nextWeek);
      setSelectedDayIndex(0);
    }
  }, [selectedDayIndex, weekStart]);

  // Week navigation — used by the seamless half-circle caps on the date strip in FloatingNav
  const goPrevWeek = React.useCallback(() => {
    const prevWeek = addDays(weekStart, -7);
    const targetDays = buildDayDefs(prevWeek, todayDate);
    targetDays.forEach((d, i) => {
      setTimeout(() => currentNight?.prefetchNight?.(d.date), 40 * i);
    });
    setWeekStart(prevWeek);
    setSelectedDayIndex(0);
  }, [weekStart, currentNight, todayDate]);

  const goNextWeek = React.useCallback(() => {
    const nextWeek = addDays(weekStart, 7);
    const targetDays = buildDayDefs(nextWeek, todayDate);
    targetDays.forEach((d, i) => {
      setTimeout(() => currentNight?.prefetchNight?.(d.date), 40 * i);
    });
    setWeekStart(nextWeek);
    setSelectedDayIndex(0);
  }, [weekStart, currentNight, todayDate]);

  const handleNavDaySelect = React.useCallback(
    (navId: number, date: Date) => {
      const item = NAV_DAY_STRIP.find((d) => d.navId === navId);
      if (!item) return;

      if (item.bridge === "prev-week-last") {
        setWeekStart(addDays(weekStart, -7));
        setSelectedDayIndex(6);
        return;
      }
      if (item.bridge === "next-week-first") {
        setWeekStart(addDays(weekStart, 7));
        setSelectedDayIndex(0);
        return;
      }
      if (item.weekIndex != null && item.weekIndex !== selectedDayIndex) {
        setSelectedDayIndex(item.weekIndex);
      }
    },
    [NAV_DAY_STRIP, weekStart, selectedDayIndex],
  );

  // === Notes debounce handler ============================================
  // Defined here (rather than alongside notesRef/notesSaveTimerRef earlier)
  // so its deps array can reference `selectedDay` and `showToast` without
  // tripping the TDZ. The refs themselves are still declared up top so they
  // exist when the JSX wires them in.
  //
  // Capture night context at the moment of the keystroke. If the operator
  // switches days within the 600ms debounce window, the day-change effect
  // clears notesSaveTimerRef so the stale write never fires. If the timer
  // does fire, it targets the night the keystroke was issued against — not
  // whatever night happens to be selected when the network call resolves.
  const handleNotesInput = React.useCallback(() => {
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
    const captureNid = nightId;
    const captureDate = selectedDay.date;
    const captureDayName = selectedDay.name;
    // Feed current text to the AI completion hook (debounced internally).
    if (notesRef.current) {
      notesCompletion.handleChange(notesRef.current.innerText);
    }
    notesSaveTimerRef.current = setTimeout(async () => {
      if (!notesRef.current) return;
      const text = notesRef.current.innerText;
      try {
        let nid = captureNid;
        if (!nid) {
          const { getOrCreateNightForDate } = await import("@/lib/shiftbuilder/data");
          nid = await getOrCreateNightForDate(captureDate, captureDayName);
        }
        if (!nid) return;
        const { saveNightNotes } = await import("@/lib/shiftbuilder/data");
        await saveNightNotes(nid, text);
      } catch (e: any) {
        console.error("[shiftbuilder] notes save failed", e);
        showToast(`Couldn't save notes: ${e?.message ?? "unknown error"}`);
      }
    }, 600);
  }, [nightId, selectedDay.date, selectedDay.name, showToast, notesCompletion]);

  // Extracted accept handler — shared by Tab key and the click-to-accept kbd.
  // Uses execCommand("insertText") so the contentEditable undo stack is intact.
  const acceptNotesSuggestion = React.useCallback(() => {
    const accepted = notesCompletion.accept();
    if (notesRef.current) {
      const suffix = accepted.slice((notesRef.current.innerText ?? "").length);
      if (suffix) {
        notesRef.current.focus();
        const sel = window.getSelection();
        if (sel) {
          sel.selectAllChildren(notesRef.current);
          sel.collapseToEnd();
        }
        document.execCommand("insertText", false, suffix);
      }
    }
  }, [notesCompletion]);

  // === Handlers (fully restored) ===
  // Cycle the break group on a slot AND persist to break_assignments.
  // group=0 ("-") means the TM/slot is not on the break rotation for this shift.
  // For Option 1 we treat "-" as "no break record" (delete the row) rather than
  // storing group_num=0. This keeps the DB clean and means "no row = not on breaks".
  // Overlaps (AM/PM) default to no break (see assignment loading below).
  const setBreakGroupForSlot = (slotKey: string, group: BreakGroup) => {
    const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
    pendingHistoryRef.current = { description: `Cycled break group on ${slotKey}`, before };

    const targetNightId = nightId;
    const captureDate = selectedDay.date;
    const captureDayName = selectedDay.name;
    const slotAssignment = assignments[slotKey] || {};
    const tmId = slotAssignment.tmId ?? null;
    const rrSide = slotAssignment.rrSide ?? null;

    // Pre-translate the slot key + rrSide to the canonical DB form used in zone_assignments
    // (regular persistAssign does uiToDb; updateSlotBreakGroup does not, so we must).
    // Capture so the async write always targets the real row even if render state changes.
    let dbSlotKey = slotKey;
    let dbRrSide = rrSide;
    try {
      const translated = uiToDb(slotKey);
      dbSlotKey = translated.slot_key;
      dbRrSide = translated.rr_side ?? rrSide ?? null;
    } catch {}

    setAssignments((prev: any) => ({
      ...prev,
      [slotKey]: { ...prev[slotKey], breakGroup: group },
    }));

    logBuilderChange({
      action: "break_change",
      slotKey,
      targetNightId,
      payload: { breakGroup: group, tmId },
    });

    // Also push into the narrow store the board actually subscribes to (3.4), so BreakBadge
    // updates instantly when the operator taps a pill on the new isolated board.
    try {
      useShiftBuilderStore.getState().setAssignments((prev: any) => ({
        ...prev,
        [slotKey]: { ...(prev[slotKey] || {}), breakGroup: group },
      }));
    } catch {}

    (async () => {
      let nid = targetNightId;
      if (!nid) nid = await resolveNightIdForDate(captureDate, captureDayName);
      if (!nid) {
        showToast(`Couldn't save break group: no night context yet`);
        return;
      }
      try {
        const { updateSlotBreakGroup, deleteBreakAssignment, upsertBreakAssignment } = await import("@/lib/shiftbuilder/data");
        // Write using the canonical db keys so it hits the actual zone_assignments row.
        // Pass the captured tmId so the callee can recover if the assignment row
        // is still being created by an in-flight optimistic assign (common when
        // user immediately taps a break pill on a just-dropped TM).
        await updateSlotBreakGroup(nid, dbSlotKey, dbRrSide, group, tmId);

        // Also keep break_assignments in sync for the break-sheet / print path.
        if (tmId) {
          if (group === 0) {
            await deleteBreakAssignment(nid, tmId);
          } else {
            await upsertBreakAssignment({
              nightId: nid,
              tmId,
              groupNum: group,
              slotRef: slotKey,  // ui form is fine here (match key is night+tm_id)
            });
          }
        }

        const dateKey = captureDate.toISOString().slice(0, 10);
        const patchNightCache = (old: any) => {
          if (!old?.assignments) return old;
          return {
            ...old,
            assignments: {
              ...old.assignments,
              [slotKey]: {
                ...(old.assignments[slotKey] || {}),
                breakGroup: group,
                breakGroupExplicit: true,
              },
            },
          };
        };
        currentNight.queryClient?.setQueryData(["nightCore", dateKey], patchNightCache);
        currentNight.queryClient?.setQueryData(["night", dateKey], patchNightCache);
      } catch (e: any) {
        showToast(`Couldn't save break group: ${e?.message ?? "unknown error"}`);
      }
    })();
  };

  // Optimistic local update + fire-and-forget persist. The DB write doesn't
  // block the UI — we accept that the operator will see the assignment land
  // immediately and any error gets surfaced via toast.
  //
  // We capture `(nightId, selectedDay.date, selectedDay.name)` synchronously
  // at the moment the operator acts, and hand them to the persist helper.
  // The persist helper never re-reads state — so if the operator switches to
  // a different day before the network call resolves, the write still lands
  // on the night it was issued against.
  // ── Permission guard helpers (centralized so every mutation path is covered)
  const requireEdit = (): boolean => {
    if (!canEditAssignments) {
      showToast("Insufficient privileges — you cannot edit assignments", "error");
      return false;
    }
    return true;
  };
  const requireLock = (): boolean => {
    if (!canLockUnlock) {
      showToast("Insufficient privileges — you cannot lock/unlock slots", "error");
      return false;
    }
    return true;
  };

  const assign = (slotKey: string, tmId: string, tmName: string) => {
    if (!requireEdit()) return;
    if (isCurrentNightLocked) {
      showToast("This day is locked — changes are disabled", "error");
      return;
    }
    // Guard physical RRn (prevents uiToDb treating as aux+null rr_side, which was source of womens assignments landing on mens or vanishing on reload)
    if (/^RR\d+$/.test(slotKey)) {
      console.warn('[shiftbuilder] assign with physical RR key blocked — womens/mens would be lost');
      showToast('Select a specific side (M or W) on the RR card');
      return;
    }

    const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
    pendingHistoryRef.current = { description: `Assigned ${tmName} to ${slotKey}`, before };

    const targetNightId = nightId;
    const captureDate = selectedDay.date;
    const captureDayName = selectedDay.name;

    // Phase 1 Live Optimistic Path (preferred)
    // Uses useLiveAssignments → instant dual-cache update (Query + Zustand) + rollback on conflict.
    // Falls back to legacy direct set + persistAssign for safety during migration.
    const prevAssignment = assignments[slotKey];
    if (live?.assign) {
      live.assign(slotKey, tmId, tmName, {
        captureDate,
        captureDayName,
        targetNightId,
        isDraftMode,
      });
      // Still record history for Draft (Draft remains the proposal truth)
      // The live layer handles the committed view.
    } else {
      // Legacy path (being phased out)
      setAssignments((prev: any) => ({
        ...prev,
        [slotKey]: {
          ...prev[slotKey],
          tmId,
          tmName,
          breakGroup: prev[slotKey]?.breakGroup ?? 0,
          type: slotKey.startsWith("Z") ? "zone" : slotKey.startsWith("MRR") || slotKey.startsWith("WRR") ? "rr" : slotKey.startsWith("OL-") ? "overlap" : "aux",
          slotKey,
        },
      }));
      persistAssign(targetNightId, captureDate, captureDayName, slotKey, tmId, false);
    }
    logBuilderChange({
      action: "assign",
      slotKey,
      targetNightId,
      previousTmId: prevAssignment?.tmId ?? null,
      previousTmName: prevAssignment?.tmName ?? null,
      newTmId: tmId,
      newTmName: tmName,
    });
  };

  const unassign = (slotKey: string) => {
    if (!requireEdit()) return;
    if (isCurrentNightLocked) {
      showToast("This day is locked — changes are disabled", "error");
      return;
    }
    if (/^RR\d+$/.test(slotKey)) {
      console.warn('[shiftbuilder] unassign with physical RR key blocked');
      return;
    }

    const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
    pendingHistoryRef.current = { description: `Unassigned from ${slotKey}`, before };

    const targetNightId = nightId;
    const captureDate = selectedDay.date;
    const captureDayName = selectedDay.name;
    const prevAssignment = assignments[slotKey];
    const tmIdBeingRemoved = prevAssignment?.tmId ?? null;

    // Derive side for RR clears (MRR/WRR) so legacy direct delete path (if live layer not available) still targets the correct rr_side row.
    let derivedRrSide: 'mens' | 'womens' | null = null;
    let derivedSlotType: string | undefined;
    try {
      const { rr_side, slot_type } = uiToDb(slotKey);
      derivedRrSide = rr_side;
      derivedSlotType = slot_type;
    } catch {}

    // Prefer the live optimistic layer (now wired to the main board store + correct nightCore key).
    // This makes clear/X buttons instant like task drag, and keeps realtime + rollback working.
    if (live?.unassign) {
      live.unassign(slotKey, {
        captureDate,
        captureDayName,
        targetNightId,
        isDraftMode,
      });
    } else {
      // Fallback (legacy direct path)
      setAssignments((prev: any) => {
        const copy = { ...prev };
        delete copy[slotKey];
        return copy;
      });

      (async () => {
        let nid = targetNightId;
        if (!nid) {
          nid = await resolveNightIdForDate(captureDate, captureDayName);
        }
        if (nid) {
          import("@/lib/shiftbuilder/data").then(({ deleteZoneAssignment }) =>
            deleteZoneAssignment({
              nightId: nid,
              uiKey: slotKey,
              slotType: derivedSlotType,
              rrSide: derivedRrSide,
            }).catch((e: any) => console.error("[shiftbuilder] robust delete failed", e))
          );
        }
      })();
    }

    logBuilderChange({
      action: "unassign",
      slotKey,
      targetNightId,
      previousTmId: prevAssignment?.tmId ?? null,
      previousTmName: prevAssignment?.tmName ?? null,
    });

    // Drop the break_assignments row for this TM so a re-assign gets a fresh
    // group instead of inheriting a stale one. Fire-and-forget.
    if (tmIdBeingRemoved) {
      (async () => {
        let nid = targetNightId;
        if (!nid) nid = await resolveNightIdForDate(captureDate, captureDayName);
        if (nid) {
          try {
            const { deleteBreakAssignment } = await import("@/lib/shiftbuilder/data");
            await deleteBreakAssignment(nid, tmIdBeingRemoved);
          }
          catch (e: any) { console.error("[shiftbuilder] deleteBreakAssignment failed", e); }
        }
      })();
    }
  };

  const toggleLock = (slotKey: string) => {
    if (!requireLock()) return;
    const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
    const prevAssignment = assignments[slotKey];
    const willLock = !prevAssignment?.isLocked;
    pendingHistoryRef.current = { description: `${willLock ? "Locked" : "Unlocked"} ${slotKey}`, before };

    const targetNightId = nightId;
    const captureDate = selectedDay.date;
    const captureDayName = selectedDay.name;

    setAssignments((prev: any) => {
      const nextLocked = !prev[slotKey]?.isLocked;
      persistLock(targetNightId, captureDate, captureDayName, slotKey, nextLocked);
      return {
        ...prev,
        [slotKey]: { ...prev[slotKey], isLocked: nextLocked },
      };
    });
    logBuilderChange({
      action: willLock ? "lock" : "unlock",
      slotKey,
      targetNightId,
      previousTmId: prevAssignment?.tmId ?? null,
      previousTmName: prevAssignment?.tmName ?? null,
    });
  };

  // === Undo / Redo helpers (snapshot-based) ===
  const getCurrentSnapshot = (): Snapshot => ({
    assignments: { ...assignments },
    auxDefs: [...auxDefs],
  });

  const applySnapshot = (snapshot: Snapshot) => {
    setAssignments(snapshot.assignments);
    setAuxDefs(snapshot.auxDefs);
  };

  const recordWithSnapshot = (description: string, before: Snapshot, mutator: () => void) => {
    const prev = before; // already captured
    mutator();
    const next = getCurrentSnapshot();
    shiftHistory.recordChange(description, prev, next);
  };

  // === Dual-page print (Deployment + Break Sheet) ============================
  //
  // The artboard renders one view at a time on-screen (`currentView`). For
  // print we want BOTH pages as a single print job so the operator can choose
  // duplex in the print dialog and the two views end up on the two sides of
  // one piece of paper.
  //
  // Refactoring the ~470 lines of artboard JSX to take `view` as a prop would
  // touch 8 conditional sites; instead we capture each view's rendered HTML
  // by briefly toggling `currentView`, then inject both HTMLs into a hidden
  // `.print-dual-container` and call `window.print()`. Print CSS hides the
  // live artboard and shows the dual container with a page-break between the
  // two captures.
  //
  // Duplex/double-sided cannot be forced from CSS — that's a printer driver
  // setting. We default to landscape via @page and trust the operator's
  // print-dialog choice (or printer default) for duplex.
  const handlePrintBothPages = React.useCallback(async () => {
    handleSlotClose();
    const liveArtboard = document.querySelector(".print-artboard") as HTMLElement | null;
    if (!liveArtboard) {
      // Fallback: best-effort single-page print if the artboard isn't in the DOM.
      window.print();
      return;
    }

    const originalView = currentView;

    // Wait N animation frames so React has committed the new render before
    // we serialize the DOM.
    const nextFrames = (n: number) =>
      new Promise<void>((resolve) => {
        let count = 0;
        const tick = () => {
          count += 1;
          if (count >= n) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

    try {
      // Hide the live artboard during captures so it doesn't accidentally
      // get included as an extra (blank) page.
      if (liveArtboard) liveArtboard.style.visibility = 'hidden';

      // Capture deployment view.
      flushSync(() => { setCurrentView("deployment"); });
      await nextFrames(2);
      // Strip the temporary visibility:hidden we applied above so the captured
      // snapshot renders correctly inside the print-dual-container.
      if (liveArtboard) liveArtboard.style.visibility = '';
      const deploymentHTML =
        (document.querySelector(".print-artboard") as HTMLElement | null)?.outerHTML ?? "";
      if (liveArtboard) liveArtboard.style.visibility = 'hidden';

      // Capture breaks view
      flushSync(() => { setCurrentView("breaks"); });
      await nextFrames(2);

      // Force the artboard to the exact print height during capture so that
      // the breaks view's flex layout sees a full 816px tall container.
      // This allows `mt-auto` (and flex-1 areas) to pin the Overlaps section
      // to the very bottom of the landscape page.
      const artboardForBreaks = document.querySelector(".print-artboard") as HTMLElement | null;
      const prevHeight = artboardForBreaks?.style.height;
      const prevMinHeight = artboardForBreaks?.style.minHeight;
      const prevDisplay = artboardForBreaks?.style.display;
      const prevFlexDir = artboardForBreaks?.style.flexDirection;

      if (artboardForBreaks) {
        artboardForBreaks.style.height = "816px";
        artboardForBreaks.style.minHeight = "816px";
        artboardForBreaks.style.display = "flex";
        artboardForBreaks.style.flexDirection = "column";
      }

      // Force layout calculation
      artboardForBreaks?.getBoundingClientRect();
      await nextFrames(1);

      const breaksHTML =
        (document.querySelector(".print-artboard") as HTMLElement | null)?.outerHTML ?? "";

      // Restore
      if (artboardForBreaks) {
        artboardForBreaks.style.height = prevHeight || "";
        artboardForBreaks.style.minHeight = prevMinHeight || "";
        artboardForBreaks.style.display = prevDisplay || "";
        artboardForBreaks.style.flexDirection = prevFlexDir || "";
      }

      // Restore the operator's original view before printing — once the
      // container is injected and we trigger print, the visual freezes.
      flushSync(() => { setCurrentView(originalView); });
      await nextFrames(1);

      // Restore visibility of the live artboard (it will be hidden again
      // by the printing-dual-mode class right before window.print).
      if (liveArtboard) liveArtboard.style.visibility = '';

      if (!deploymentHTML || !breaksHTML) {
        console.warn("[shiftbuilder] dual-page print failed to capture views; falling back");
        window.print();
        return;
      }

      // Build the print-only container holding both captures. The captures
      // include the full `.print-artboard` markup with frozen classNames /
      // inline styles, so global CSS still applies during print.
      const container = document.createElement("div");
      container.className = "print-dual-container";
      container.innerHTML = deploymentHTML + breaksHTML;
      document.body.appendChild(container);

      // Post-process the breaks artboard (second one) to pin the overlaps
      // section directly above the footer.
      //
      // Layout contract we enforce here:
      //   .print-artboard (flex-col, 816px)
      //     .sheet-header      (flex-shrink: 0)
      //     .content-area      (flex: 1 1 0%, flex-col, overflow: hidden)
      //       .wave-grid       (flex: 1 1 0%, min-h: 0, overflow: hidden)
      //                        → takes remaining space; clips if waves are tall
      //       .overlaps-section (flex-shrink: 0, margin-top: 0)
      //                        → always visible, pinned just above the footer
      //     .sheet-footer      (flex-shrink: 0)
      const breaksArtboard = container.querySelectorAll('.print-artboard')[1];
      if (breaksArtboard) {
        // Content area: ensure it's a flex column so children can use flex sizing.
        const contentArea = breaksArtboard.querySelector('.flex-1.min-h-0.overflow-hidden.flex.flex-col') as HTMLElement | null;
        if (contentArea) {
          contentArea.style.display = 'flex';
          contentArea.style.flexDirection = 'column';
          contentArea.style.flex = '1 1 0%';
          contentArea.style.minHeight = '0';
          contentArea.style.overflow = 'hidden';
        }

        // Wave grid (first child of content area): take available space but
        // never push the overlaps section below the visible area.
        const waveGrid = contentArea?.firstElementChild as HTMLElement | null;
        if (waveGrid && waveGrid !== contentArea?.querySelector('.overlaps-section')) {
          waveGrid.style.flex = '1 1 0%';
          waveGrid.style.minHeight = '0';
          waveGrid.style.overflow = 'hidden';
          waveGrid.style.alignContent = 'start';
        }

        // Overlaps: never shrink, never pushed off-screen, pinned at the bottom
        // of the flex column just above the footer.
        const overlaps = breaksArtboard.querySelector('.overlaps-section') as HTMLElement | null;
        if (overlaps) {
          overlaps.style.flexShrink = '0';
          overlaps.style.marginTop = '0';
        }
      }

      // body class so print CSS knows to show the dual container.
      document.body.classList.add("printing-dual-mode");

      // Hide every other direct body child (the Next.js app root, any injected
      // scripts/portals, etc.) with display:none so they produce zero layout
      // in the print flow and can't generate a blank first page. We save and
      // restore each element's previous inline display value.
      const hiddenBodyChildren: { el: HTMLElement; prevDisplay: string }[] = [];
      Array.from(document.body.children).forEach((child) => {
        const el = child as HTMLElement;
        if (el !== container && el.tagName !== "SCRIPT" && el.tagName !== "STYLE") {
          hiddenBodyChildren.push({ el, prevDisplay: el.style.display });
          el.style.display = "none";
        }
      });

      // Trigger the dialog. window.print() is synchronous-ish in Chrome
      // (returns after the dialog closes) and async in Safari (returns
      // immediately while the dialog is shown). Either way the cleanup
      // below runs once the call returns.
      try {
        window.print();
      } finally {
        hiddenBodyChildren.forEach(({ el, prevDisplay }) => {
          el.style.display = prevDisplay;
        });
        document.body.classList.remove("printing-dual-mode");
        container.remove();
      }
    } catch (e) {
      console.error("[shiftbuilder] dual-page print error", e);
      document.body.classList.remove("printing-dual-mode");
      document.querySelector(".print-dual-container")?.remove();
    }
  }, [currentView, handleSlotClose]);

  // Prints all 7 days in the active week: 14 pages (deployment + break sheet per day).
  // Cycles through each day, waits for Supabase data to load, captures both views,
  // then prints the full batch in one window.print() call.
  const printHydrateApply = React.useMemo(
    () => ({
      setNightId,
      setSelectedTasks,
      setCardBorders,
      setNightBreakRows,
      setLoadingAssignments,
      loadingAssignmentsRef,
    }),
    [],
  );

  const preparePrintDay = React.useCallback(
    async (dayIdx: number) => {
      const def = DAY_DEFS[dayIdx];
      if (!def) return;
      flushSync(() => setSelectedDayIndex(dayIdx));
      await hydrateNightForPrint(def, currentNight.queryClient, printHydrateApply);
      await printNextFrames(6);
      await waitForPrintArtboardSettled();
    },
    [DAY_DEFS, currentNight.queryClient, printHydrateApply],
  );

  // === Print Command Center — generalized multi-day, multi-config print handler ===
  //
  // Generalizes handlePrintWeek: iterates only the days/pages requested in config,
  // assembles them in the specified page order, and applies dynamic @page margins
  // + zoom so the output matches exactly what the Print Command Center previewed.
  const handlePrintWithConfig = React.useCallback(async (config: PrintConfig, options: { exportMode?: boolean } = {}) => {
    const { exportMode = false } = options;
    handleSlotClose();
    const originalDayIndex = selectedDayIndex;
    const originalView = currentView;
    const originalCanvasMode = canvasMode;

    const waitForLoad = (timeoutMs = 15000) =>
      new Promise<void>((resolve, reject) => {
        if (!loadingAssignmentsRef.current) { resolve(); return; }
        const start = Date.now();
        const check = () => {
          if (!loadingAssignmentsRef.current) { resolve(); return; }
          if (Date.now() - start > timeoutMs) { reject(new Error("Timeout loading night data")); return; }
          setTimeout(check, 60);
        };
        setTimeout(check, 60);
      });

    const activeDays = config.days.filter(d => d.printDeploy || d.printBreaks);
    const overviewDays = config.includeOverview ? config.days.filter(d => d.inOverview) : [];
    const hasOverview = config.includeOverview && overviewDays.length > 0;
    const hasCover    = config.includeCoverPage;

    if (activeDays.length === 0 && !hasOverview && !hasCover) {
      showToast(exportMode ? "Nothing to export. (no pages selected)" : "No pages selected to print.", "error");
      return;
    }

    const customQueueOrder = config.customQueueOrder ?? null;
    const plannedQueue = applyCustomQueueOrder(
      buildPrintQueue(
        config.days,
        config.pageOrder,
        DAY_DEFS,
        config.includeOverview,
        config.overviewPosition,
        config.includeCoverPage,
        config.coverPagePosition,
      ),
      customQueueOrder,
    );
    const totalPages = plannedQueue.length;

    // Unique sorted day indices we need to load/capture
    const dayIndices = [...new Set(activeDays.map(d => d.dayIndex))].sort((a, b) => a - b);

    setPrintBusyMode(exportMode ? "export" : "print");
    setIsPrinting(true);
    setPrintProgress({
      current: 0,
      total: totalPages,
      label: exportMode ? "Gathering schedule data…" : "Preparing sheets…",
    });

    let pageProgress = 0;
    const bumpProgress = (label: string) => {
      pageProgress = Math.min(pageProgress + 1, totalPages);
      setPrintProgress({ current: pageProgress, total: totalPages, label });
    };

    try {
      // ── Phase 2: fetch overview data directly from Supabase ──────────────────
      let overviewHTML: string | null = null;
      let coverHTML: string | null = null;

      if (hasOverview) {
        setPrintProgress({ current: pageProgress, total: totalPages, label: "Building overview table…" });
        try {
          const { getActiveTeamMembers, getNightIdForDate, getNightAssignments } = await import("@/lib/shiftbuilder/data");
          const allTms = await getActiveTeamMembers();
          const tmNames = new Map(allTms.map((tm: any) => [tm.id, tm.name || tm.id]));

          const overviewNights: OverviewNight[] = [];
          for (const dayConf of overviewDays.slice().sort((a, b) => a.dayIndex - b.dayIndex)) {
            const def = DAY_DEFS[dayConf.dayIndex];
            const nightId = def ? await getNightIdForDate(def.date) : null;
            const assignments: Record<string, { tmId: string; tmName: string; breakGroup?: number } | null> = {};
            if (nightId) {
              const rows = await getNightAssignments(nightId);
              rows.forEach(row => {
                try {
                  const uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);
                  if (row.tmId) {
                    assignments[uiKey] = {
                      tmId: row.tmId,
                      tmName: row.tmName || tmNames.get(row.tmId) || row.tmId,
                      breakGroup: row.breakGroup ?? 0,
                    };
                  }
                } catch { /* unmappable slot — skip */ }
              });
            }
            overviewNights.push({ dayIndex: dayConf.dayIndex, assignments });
          }
          overviewHTML = buildOverviewArtboardHTML(overviewNights, DAY_DEFS);
        } catch (ovwErr) {
          console.warn("[shiftbuilder] overview fetch error — skipping overview page", ovwErr);
          overviewHTML = null;
        }
        if (overviewHTML) bumpProgress("Overview table");
      }

      // ── Build cover page HTML (no async needed) ───────────────────────────────
      if (hasCover) {
        coverHTML = buildCoverPageArtboardHTML(DAY_DEFS, config, totalPages);
        bumpProgress("Cover page");
      }



      const goldenPages = await generatePrintPreviewGoldenPages({
        config,
        dayDefs: DAY_DEFS,
        activeDays,
        coverHTML,
        overviewHTML,
        onProgress: (label) => {
          bumpProgress(label);
        },
      });

      if (goldenPages.length === 0) {
        showToast(exportMode ? "Nothing to export." : "Nothing to print.", "error");
        return;
      }

      if (exportMode) {
        setPrintProgress({ current: 0, total: goldenPages.length, label: "Rendering Golden sheets…" });
        const result = await exportGoldenPdf({
          pages: goldenPages,
          config,
          dayDefs: DAY_DEFS,
          onProgress: (p) => setPrintProgress(p),
        });
        saveLastPrintConfig(config);
        showToast(
          result.usedZip
            ? `ZIP downloaded (${result.filename}).`
            : "PDF downloaded (Golden print fidelity).",
          "success",
        );
        setIsPrintCenterOpen(false);
      } else {
        setPrintProgress({ current: totalPages, total: totalPages, label: "Sending to printer…" });
        saveLastPrintConfig(config);
        const session = mountGoldenPrintSession(goldenPages, config, "print");
        await waitForGoldenRenderSettled();
        await runBrowserPrint(session);
        setIsPrintCenterOpen(false);
      }
    } catch (e) {
      console.error("[shiftbuilder] print-with-config error", e);
      showToast(exportMode ? "Export failed — try again." : "Print failed — try again.", "error");
      document.body.classList.remove("printing-dual-mode", "sb-print-export-busy");
      document.querySelector(".print-dual-container")?.remove();
      document.getElementById("__pcc-print-override")?.remove();
      document.getElementById("__pcc-export-override")?.remove();
    } finally {
      flushSync(() => setSelectedDayIndex(originalDayIndex));
      await waitForLoad().catch(() => {});
      flushSync(() => {
        setCurrentView(originalView);
        setCanvasMode(originalCanvasMode);
      });
      setIsPrinting(false);
      setPrintProgress(null);
    }
  }, [DAY_DEFS, selectedDayIndex, currentView, showToast, handleSlotClose, canvasMode]);

  const handlePreviewSheet = React.useCallback(
    (args: { dayIndex: number; view: "deployment" | "breaks"; label: string }) => {
      setIsPrintCenterOpen(false);
      flushSync(() => {
        setCanvasMode("print-preview");
        setSelectedDayIndex(args.dayIndex);
        setCurrentView(args.view);
      });
      showToast(`Preview: ${args.label}`, "info");
    },
    [showToast],
  );

  const handlePrintWeek = React.useCallback(async () => {
    showToast("Preparing full week print…", "info");
    await handlePrintWithConfig(fullWeekPrintConfig());
  }, [handlePrintWithConfig, showToast]);

  const handleQuickPrintTonight = React.useCallback(async () => {
    await handlePrintWithConfig(tonightPrintConfig(selectedDayIndex));
  }, [handlePrintWithConfig, selectedDayIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isPrintCenter = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p" && !e.shiftKey;
      const isQuickPrintTonight = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "p" && e.shiftKey;
      if (isPrintCenter) {
        e.preventDefault();
        setIsPrintCenterOpen(true);
      }
      if (isQuickPrintTonight) {
        e.preventDefault();
        void handleQuickPrintTonight();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleQuickPrintTonight]);

  // === Master Command Palette (Phase 2 core) ===
  // Stable callbacks for useCommandActions — keeping these out of the call-site
  // so useCommandActions can detect actual changes (not new references every render).
  const cmdActionRunEngine = React.useCallback(() => {
    if (!canRunEngine) {
      showToast("Insufficient privileges — you cannot run the engine", "error");
      return;
    }
    if (isCurrentNightLocked) {
      showToast("This day is locked — engine cannot run", "error");
      return;
    }
    if (isDraftMode) applyDraft(); else enterDraftMode();
  }, [canRunEngine, isDraftMode, applyDraft, enterDraftMode, isCurrentNightLocked]);

  // Print button opens Command Center; direct "print tonight" shortcut still available via palette
  const cmdActionPrint = React.useCallback(() => { void handleQuickPrintTonight(); }, [handleQuickPrintTonight]);
  const cmdActionPrintWeek = React.useCallback(() => handlePrintWeek(), [handlePrintWeek]);
  const cmdActionOpenPrintCenter = React.useCallback(() => setIsPrintCenterOpen(true), []);

  const cmdActionLockDay = React.useCallback(async () => {
    if (!requireLock()) return;
    if (!nightId) {
      showToast("No active night selected", "error");
      return;
    }
    try {
      const { setNightLocked } = await import("@/lib/shiftbuilder/data");
      await setNightLocked(nightId, true);
      setIsCurrentNightLocked(true);
      logBuilderChange({ action: "night_lock", targetNightId: nightId });
      showToast(`Day locked`, "success");
    } catch (e: any) {
      console.error("Failed to lock day", e);
      showToast(`Failed to lock day: ${e?.message ?? "unknown"}`, "error");
    }
  }, [nightId, requireLock, logBuilderChange]);

  const cmdActionUnlockDay = React.useCallback(async () => {
    if (!requireLock()) return;
    if (!nightId) {
      showToast("No active night selected", "error");
      return;
    }
    try {
      const { setNightLocked } = await import("@/lib/shiftbuilder/data");
      await setNightLocked(nightId, false);
      setIsCurrentNightLocked(false);
      logBuilderChange({ action: "night_unlock", targetNightId: nightId });
      showToast(`Day unlocked`, "success");
    } catch (e: any) {
      console.error("Failed to unlock day", e);
      showToast(`Failed to unlock day: ${e?.message ?? "unknown"}`, "error");
    }
  }, [nightId, requireLock, logBuilderChange]);

  const handleToggleDayPublished = React.useCallback(async () => {
    if (!canPublish) {
      showToast("You don't have permission to publish schedules", "error");
      return;
    }

    const dateIso = formatLocalDateISO(selectedDay.date);
    const dayLabel = selectedDay.name;
    const willPublish = currentNightStatus !== "published";
    const action = willPublish ? "publish" : "unpublish";

    if (
      !window.confirm(
        `${willPublish ? "Publish" : "Unpublish"} ${dayLabel} (${dateIso})?` +
          (willPublish
            ? " This makes the schedule visible on /today."
            : " This hides the schedule from /today for most operators."),
      )
    ) {
      return;
    }

    setPublishDayBusy(true);
    try {
      let activeNightId = nightId ?? currentNight.nightId ?? null;
      if (!activeNightId) {
        const { getOrCreateNightForDate } = await import("@/lib/shiftbuilder/data");
        activeNightId = await getOrCreateNightForDate(selectedDay.date, selectedDay.name);
        setNightId(activeNightId);
      }

      const { setNightPublished } = await import("@/lib/shiftbuilder/data");
      await setNightPublished(activeNightId, willPublish);

      setCurrentNightStatus(willPublish ? "published" : "draft");
      logBuilderChange({
        action: willPublish ? "publish" : "unpublish",
        targetNightId: activeNightId,
      });
      showToast(`${dayLabel} ${willPublish ? "published" : "unpublished"}`, "success");
      currentNight.queryClient?.invalidateQueries({ queryKey: ["nightCore", dateIso] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : `Failed to ${action} day`;
      showToast(msg, "error");
    } finally {
      setPublishDayBusy(false);
    }
  }, [
    canPublish,
    selectedDay,
    currentNightStatus,
    nightId,
    currentNight.nightId,
    showToast,
    currentNight.queryClient,
    logBuilderChange,
  ]);

  const cmdActionUndo = React.useCallback(() => {
    const prev = shiftHistory.undo();
    if (prev) applySnapshot(prev);
  }, [shiftHistory, applySnapshot]);

  const cmdActionRedo = React.useCallback(() => {
    const next = shiftHistory.redo();
    if (next) applySnapshot(next);
  }, [shiftHistory, applySnapshot]);

  const cmdActionCycleBreak = React.useCallback(
    (slotKey: string) => {
      const current = (assignments[slotKey]?.breakGroup ?? 0) as BreakGroup;
      setBreakGroupForSlot(slotKey, nextBreakGroup(current));
    },
    [assignments, setBreakGroupForSlot]
  );

  const cmdActionClearBorders = React.useCallback(() => setCardBorders({}), []);

  // Temporarily disabled during aggressive dynamic import sweep to eliminate
  // the static import of useCommandActions (a major contributor to repeated
  // "module factory is not available" errors from this giant file).
  // Rich command palette actions will be restored once the core HMR stability is solid.
  // Command palette actions temporarily stubbed during the aggressive dynamic import
  // sweep to eliminate static imports of useCommandActions (a frequent source of
  // "module factory is not available" errors).
  // Rich functionality will be restored after HMR stability is solid.
  const commandActions: any[] = [];

  // handleCardClick and dismissQuickFan removed in Phase 1 (Command Palette Upgrade).
  // Card taps now use openPaletteForSlot / openPaletteForPerson directly.

  // CommandPalette callbacks section removed along with the hook call (part of the sweep).

  const handleCmdkAddTask = React.useCallback(
    async (uiKeys: string | string[], taskLabel: string) => {
      if (isCurrentNightLocked) {
        showToast("This day is locked — cannot add tasks", "error");
        return;
      }
      if (!nightId) {
        showToast("No active night selected", "error");
        return;
      }
      const keys = Array.isArray(uiKeys) ? uiKeys : [uiKeys];
      if (keys.length === 0 || !taskLabel?.trim()) return;

      try {
        const { addNightSlotTask, getNightSlotTasks } = await import("@/lib/shiftbuilder/data");
        for (const uiKey of keys) {
          const { slot_key, slot_type, rr_side } = uiToDb(uiKey);
          await addNightSlotTask({
            nightId,
            slotKey: slot_key,
            slotType: slot_type,
            rrSide: rr_side,
            taskLabel: taskLabel.trim(),
            sortOrder: 50,
          });
          logBuilderChange({
            action: "task_add",
            slotKey: uiKey,
            targetNightId: nightId,
            payload: { taskLabel: taskLabel.trim() },
          });
        }
        const fresh = await getNightSlotTasks(nightId);
        const byKey: Record<string, NightSlotTask[]> = {};
        for (const t of fresh) {
          const uiKey = dbToUi(t.slotKey, t.slotType, t.rrSide ?? null);
          if (!byKey[uiKey]) byKey[uiKey] = [];
          byKey[uiKey].push(t);
        }
        setSelectedTasks(byKey);
      } catch (e) {
        console.error("Failed to add task from palette (multi)", e);
        showToast("Failed to save task to one or more cards", "error");
      }
    },
    [nightId, showToast, logBuilderChange, isCurrentNightLocked]
  );

  // Dedicated handler for the new "Assign Sweeper" quick action from MarkerPad.
  // Forces the classic orange sweeper color and prevents duplicates.
  const handleAssignSweeperTask = React.useCallback(
    async (uiKey: string, sweeperLabel: string) => {
      if (!nightId) {
        showToast("No active night selected", "error");
        return;
      }
      try {
        const { addNightSlotTask, getNightSlotTasks } = await import("@/lib/shiftbuilder/data");
        const { slot_key, slot_type, rr_side } = uiToDb(uiKey);
        await addNightSlotTask({
          nightId,
          slotKey: slot_key,
          slotType: slot_type,
          rrSide: rr_side,
          taskLabel: sweeperLabel,
          sortOrder: 60,
          color: "#FF9F0A", // classic sweeper orange
        });
        logBuilderChange({
          action: "task_add",
          slotKey: uiKey,
          targetNightId: nightId,
          payload: { taskLabel: sweeperLabel, sweeper: true },
        });

        // Refresh tasks for the slot
        const fresh = await getNightSlotTasks(nightId);
        const byKey: Record<string, NightSlotTask[]> = {};
        for (const t of fresh) {
          const key = dbToUi(t.slotKey, t.slotType, t.rrSide ?? null);
          if (!byKey[key]) byKey[key] = [];
          byKey[key].push(t);
        }
        setSelectedTasks(byKey);
      } catch (e) {
        console.error("Failed to assign sweeper task", e);
        showToast("Failed to assign sweeper task", "error");
      }
    },
    [nightId, showToast, logBuilderChange]
  );

  const handleCmdkCycleBreak = React.useCallback(
    (slotKey: string) => {
      const current = (assignments[slotKey]?.breakGroup ?? 0) as BreakGroup;
      setBreakGroupForSlot(slotKey, nextBreakGroup(current));
    },
    [assignments, setBreakGroupForSlot]
  );

  const handleCmdkSetGravePool = React.useCallback(
    async (tmId: string, value: "Full" | "AM" | "PM" | null) => {
      const { setTMGravePool } = await import("@/lib/shiftbuilder/tmCommands");
      await setTMGravePool(tmId, value);
      setTMCommandEpoch((e) => e + 1);
    },
    [setTMCommandEpoch]
  );

  const handleCmdkSetDisplayName = React.useCallback(
    async (tmId: string, newName: string) => {
      const { setTMDisplayName } = await import("@/lib/shiftbuilder/tmCommands");
      await setTMDisplayName(tmId, newName);
      setTMCommandEpoch((e) => e + 1);
    },
    [setTMCommandEpoch]
  );

  const handleCmdkRemoveFromSchedule = React.useCallback(
    async (tmId: string, date: Date) => {
      if (!nightId) throw new Error("No night context — pick a day first");
      const { removeTMFromSchedule } = await import("@/lib/shiftbuilder/tmCommands");
      await removeTMFromSchedule({ tmId, nightId, nightDate: date });
      setTMCommandEpoch((e) => e + 1);
    },
    [nightId, setTMCommandEpoch]
  );

  const handleCmdkAddCoverage = React.useCallback(
    async (sourceKey: string, targetKey: string) => {
      if (!nightId) { showToast("No active night selected", "error"); return; }

      const captureDate = selectedDay.date;
      const accentColor = getSlotAccentColor(sourceKey);
      let targetLabel = getSlotCoverageLabel(targetKey);

      // Resolve nicer labels for special aux slots (e.g. the Z9SR aux may be keyed as AUX1 in current layout)
      // Use the aux def's locations[0] (e.g. "Z9 Smoking Room") when available.
      if (targetKey.startsWith("AUX") || targetKey === "Z9SR") {
        const matchingAux = auxDefs.find(
          (d) => d.key === targetKey || (targetKey === "Z9SR" && d.role === "z9sr")
        );
        if (matchingAux?.locations?.[0]) {
          targetLabel = matchingAux.locations[0];
        } else if (targetKey === "Z9SR") {
          targetLabel = "Zone 9 Smoking Room";
        }
      }

      const sourceKeys = expandCoverageToKeys(sourceKey);

      try {
        const { addNightSlotTask, getNightSlotTasks } = await import("@/lib/shiftbuilder/data");
        for (const sk of sourceKeys) {
          const { slot_key, slot_type, rr_side } = uiToDb(sk);
          await addNightSlotTask({
            nightId,
            slotKey: slot_key,
            slotType: slot_type,
            rrSide: rr_side,
            taskLabel: `And ${targetLabel}`,
            isCoverage: true,
            color: accentColor,
            sortOrder: 99,
          });
          logBuilderChange({
            action: "coverage_add",
            slotKey: sk,
            targetNightId: nightId,
            payload: {
              taskLabel: `And ${targetLabel}`,
              targetKey,
              targetLabel,
              sourceKey,
            },
          });
        }
        const fresh = await getNightSlotTasks(nightId);
        const byKey: Record<string, NightSlotTask[]> = {};
        for (const t of fresh) {
          const uiKey = dbToUi(t.slotKey, t.slotType, t.rrSide ?? null);
          if (!byKey[uiKey]) byKey[uiKey] = [];
          byKey[uiKey].push(t);
        }
        setSelectedTasks(byKey);
        const qc = currentNight?.queryClient;
        if (qc) {
          patchNightSecondaryTasksCache(qc, formatLocalDateISO(captureDate), fresh);
        }
        showToast(`Coverage added: And ${targetLabel}`, "success");
      } catch (err) {
        console.error("[SBC] coverage add failed:", err);
        showToast("Failed to add coverage bar", "error");
      }
    },
    [nightId, showToast, logBuilderChange, auxDefs, patchNightSecondaryTasksCache, currentNight.queryClient, selectedDay]
  );

  // Stable computed arrays/objects for the palette — new references only when
  // the underlying data actually changes, not on every SBC render.
  const cmdkWeekDays = React.useMemo(
    () => DAY_DEFS.map((d) => ({ date: d.date, name: d.name, short: d.short })),
    [DAY_DEFS]
  );

  // Single source of truth for "which TMs are already placed this night (committed + draft + live optimistic)".
  // Used by the MarkerPad picker, CMD-K, etc. to exclude TMs who are already scheduled/placed.
  // Pulls from local state (legacy), currentNight query data, *and* the liveAssignmentsStore
  // (optimistic writes + realtime bridge from useLiveAssignments + liveCache).
  const alreadyAssignedThisNight = React.useMemo(() => {
    const set = new Set<string>();
    // Local legacy
    Object.values(assignments).forEach((a: any) => a?.tmId && set.add(a.tmId));
    Object.values(draftAssignments).forEach((a: any) => a?.tmId && set.add(a.tmId));
    // TanStack Query (initial load + some updates)
    if (currentNight?.assignments) {
      Object.values(currentNight.assignments).forEach((a: any) => a?.tmId && set.add(a.tmId));
    }
    // The actual source the cards render from (Zustand + live layer)
    Object.values(storeAssignments).forEach((a: any) => a?.tmId && set.add(a.tmId));
    Object.values(storeDraftAssignments).forEach((a: any) => a?.tmId && set.add(a.tmId));
    // Live optimistic + realtime (for anything that bypasses the main store)
    const dateKey = formatLocalDateISO(selectedDay.date);
    const liveForNight = liveAssignmentsStore.getState().assignmentsByNight[dateKey] ?? {};
    Object.values(liveForNight).forEach((a: any) => a?.tmId && set.add(a.tmId));
    return set;
  }, [assignments, draftAssignments, currentNight?.assignments, storeAssignments, storeDraftAssignments, selectedDay, liveAssignVersion]);

  // Fresh assignments view for PlacementPad / CMD-K / clear-board.
  // Must mirror the board store exactly — layering legacy/query/live with Object.assign
  // leaves ghost assignments on cleared slots after drag moves (deleted keys never removed).
  const padAssignments = React.useMemo(
    () => buildPadAssignmentsFromStore(storeAssignments, storeDraftAssignments, isDraftMode),
    [storeAssignments, storeDraftAssignments, isDraftMode],
  );

  // === TM Picker lists — Graves Default Schedule (graves_default_schedule + night_on_call) ===
  // 1. Default = scheduled tonight (correct band) + eligible + unassigned
  // 2. Search = all eligible roster TMs; can add on-call for tonight
  const [pickerScheduleEpoch, setPickerScheduleEpoch] = React.useState(0);

  const effectiveGrave = fullGraveScheduledTonight;
  const effectivePM = pmOverlapScheduledTonight;
  const effectiveAM = amOverlapScheduledTonight;

  // Resolve scheduled ids (tm_id or UUID) → board roster rows for the picker.
  const markerRosterLookup = React.useMemo(
    () => buildTmLookupIndex([...effectiveRealRoster, ...effectiveGraveRoster]),
    [effectiveRealRoster, effectiveGraveRoster]
  );

  const buildScheduledUnassignedList = React.useCallback(
    (pathLabel: string) => {
      const scheduledRoleIds = new Set<string>([
        ...((effectiveGrave as any) || []),
        ...((effectivePM as any) || []),
        ...((effectiveAM as any) || []),
      ]);
      const seen = new Set<string>();
      const list: { tmId: string; tmName: string }[] = [];
      let lookupMisses = 0;
      let excludedAssigned = 0;

      for (const storedId of scheduledRoleIds) {
        const tm = resolveTmFromLookup(markerRosterLookup, storedId);
        if (!tm) {
          lookupMisses++;
          continue;
        }
        const tmId = assignmentTmId(tm);
        if (!tmId || seen.has(tmId)) continue;
        const isAssigned =
          alreadyAssignedThisNight.has(tmId) || alreadyAssignedThisNight.has(storedId);
        const isCalledOff = calledOffIds.has(tmId) || calledOffIds.has(storedId);
        if (isAssigned) {
          excludedAssigned++;
          continue;
        }
        if (isCalledOff) continue;
        const tmName = tm.name || tm.fullName;
        if (!tmName) continue;
        seen.add(tmId);
        list.push({ tmId, tmName });
      }

      return list;
    },
    [
      effectiveGrave,
      effectivePM,
      effectiveAM,
      markerRosterLookup,
      alreadyAssignedThisNight,
      calledOffIds,
    ]
  );

  const markerScheduledUnassigned = React.useMemo(
    () => buildScheduledUnassignedList("graves-default-schedule"),
    [buildScheduledUnassignedList, pickerScheduleEpoch, fullGraveScheduledTonight, pmOverlapScheduledTonight, amOverlapScheduledTonight]
  );

  // Broad pool used *only* when the operator types in the TM picker search box.
  // No scheduled filter — any TM that passes core isEligibleForSlot is allowed.
  const markerAllEligibleTms = React.useMemo(() => {
    return effectiveRealRoster
      .filter((t: any) => !alreadyAssignedThisNight.has(t.id) && !calledOffIds.has(t.id))
      .map((t: any) => {
        const tmName = t.name || t.fullName;
        if (!tmName) return null;
        return { tmId: t.id as string, tmName: tmName as string };
      })
      .filter(Boolean) as { tmId: string; tmName: string }[];
  }, [effectiveRealRoster, alreadyAssignedThisNight, calledOffIds]);

  const storeAssignmentsForFit = useAssignments() ?? {};
  const auxDefsForFit = useAuxDefs() ?? [];

  const deploymentRotationFitEnabled =
    viewMode === "canvas" && currentView === "deployment";

  const { fitBySlot: deploymentFitBySlot } = usePlacementFitMap({
      enabled: deploymentRotationFitEnabled,
      assignments: storeAssignmentsForFit,
      isDraftMode,
      draftAssignments,
      members: effectiveRealRoster as Array<Record<string, unknown>>,
      auxDefs: auxDefsForFit,
      currentIso: nightIsoFromDate(
        DAY_DEFS[selectedDayIndex]?.date ?? selectedDay.date,
      ),
      scheduledUnassigned: markerScheduledUnassigned,
      allEligibleTms: markerAllEligibleTms,
      weeklyRecentHistory: plannedThisWeekRecentHistory,
    });

  // Align with WeekHealthTracker pill index (selectedDayIndex), not deferred board index.
  const selectedDayDateKey = React.useMemo(
    () =>
      formatLocalDateISO(
        DAY_DEFS[selectedDayIndex]?.date ?? selectedDay.date,
      ),
    [DAY_DEFS, selectedDayIndex, selectedDay.date],
  );

  // TM ids across the full week plan — drives a single shared history fetch for all tracker days.
  const weekPlanTmIdsKey = React.useMemo(() => {
    const tmIds = new Set<string>();
    for (const [tmId] of plannedThisWeekRecentHistory.entries()) {
      if (tmId) tmIds.add(tmId);
    }
    for (const night of weekOverviewNights) {
      for (const a of Object.values(night.assignments || {})) {
        if ((a as any)?.tmId) tmIds.add((a as any).tmId);
      }
    }
    return [...tmIds].sort().join(",");
  }, [plannedThisWeekRecentHistory, weekOverviewNights]);

  // Per-day daily health percentages for days that have assignments in the week plan.
  // Powers the week average (mean of built days + repeat penalty) and both tracker surfaces.
  //
  // For each day with placements: run computeSlotPlacementFit (same path as the selected-day hook)
  // using weekHistories + plannedThisWeekRecentHistory, then computeDailyHealthPercent.
  // Days with no assignments are omitted (tracker shows "—"; they do not inflate the week mean).

  // Histories (30-night spread per TM) for all TMs that appear in the current week plan.
  // Incremental cache (memory + sessionStorage) — adding a TM does not invalidate prior entries.
  const [weekHistories, setWeekHistories] = React.useState<Record<string, ZoneDetailEntry | null>>({});
  /** Set when fetch for weekPlanTmIdsKey has completed (or key is empty). */
  const [weekHistoriesReadyKey, setWeekHistoriesReadyKey] = React.useState<string>("");
  const stableWeekDailyHealthsRef = React.useRef<Record<string, number>>({});

  const weekPlanTmIds = React.useMemo(
    () => (weekPlanTmIdsKey ? weekPlanTmIdsKey.split(",").filter(Boolean) : []),
    [weekPlanTmIdsKey],
  );

  const weekHistoriesReady = React.useMemo(() => {
    if (!weekPlanTmIdsKey) return true;
    if (weekHistoriesReadyKey === weekPlanTmIdsKey) return true;
    return allWeekPlacementHistoriesCached(weekPlanTmIds);
  }, [weekPlanTmIdsKey, weekHistoriesReadyKey, weekPlanTmIds]);

  const weekHistoriesFetching =
    !!weekPlanTmIdsKey && !weekHistoriesReady;

  // Merge React state with synchronous cache hits so first paint after refresh is warm.
  const effectiveWeekHistories = React.useMemo(() => {
    if (!weekPlanTmIds.length) return weekHistories;
    const cached = getCachedWeekPlacementHistories(weekPlanTmIds);
    return { ...cached, ...weekHistories };
  }, [weekPlanTmIds, weekHistories]);

  const dismissWeekHealthTracker = React.useCallback(() => {
    setIsWeekHealthTrackerDismissed(true);
    try {
      localStorage.setItem("oms_week_health_tracker_dismissed", "true");
    } catch {}
  }, []);

  const showWeekHealthTracker = React.useCallback(() => {
    setIsWeekHealthTrackerDismissed(false);
    try {
      localStorage.setItem("oms_week_health_tracker_dismissed", "false");
    } catch {}
  }, []);

  const handleToggleWeekHealthTracker = React.useCallback(() => {
    if (isWeekHealthTrackerDismissed) {
      showWeekHealthTracker();
    } else {
      dismissWeekHealthTracker();
    }
  }, [isWeekHealthTrackerDismissed, showWeekHealthTracker, dismissWeekHealthTracker]);

  // Incremental 30-night history load — only fetches TMs not yet in cache; never blanks on TM-set growth.
  React.useEffect(() => {
    if (!weekPlanTmIdsKey) {
      setWeekHistories({});
      setWeekHistoriesReadyKey("");
      return;
    }

    const cached = getCachedWeekPlacementHistories(weekPlanTmIds);
    if (Object.keys(cached).length > 0) {
      setWeekHistories((prev) => ({ ...prev, ...cached }));
    }
    if (allWeekPlacementHistoriesCached(weekPlanTmIds)) {
      setWeekHistoriesReadyKey(weekPlanTmIdsKey);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const histories = await ensureWeekPlacementHistories(weekPlanTmIds);
        if (cancelled) return;
        setWeekHistories((prev) => ({ ...prev, ...histories }));
        setWeekHistoriesReadyKey(weekPlanTmIdsKey);
      } catch {
        if (!cancelled && allWeekPlacementHistoriesCached(weekPlanTmIds)) {
          setWeekHistories(getCachedWeekPlacementHistories(weekPlanTmIds));
          setWeekHistoriesReadyKey(weekPlanTmIdsKey);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [weekPlanTmIdsKey, weekPlanTmIds]);

  // The complete, consistent weekDailyHealths map passed to health computes.
  // This is what powers both the stable week *average* (mean of these) and the visible per-day tracker.
  //
  // For *every* day with plan data, we compute the *actual* daily health % using the same method as the
  // main system for the selected day:
  //   - Use the week-loaded histories for 30-night spread of the relevant TMs.
  //   - Use the full week repeat/gap context (plannedThisWeekRecentHistory).
  //   - Treat *that day's assignments* as the "current board" for rotationBasics / neighbor context.
  //   - For each assigned relevant slot on that day, call computeSlotPlacementFit to get the verdict.
  //   - Average the verdicts → the day's health %.
  //
  // This makes the numbers in the tracker "accurate and matching the day".
  // When you select a day, the value for it in the tracker will match (or very closely match) the daily
  // health % shown in the main health pill / floater / pad for that day.
  //
  // Only compute after week histories are ready — avoids different numbers on first paint vs after refresh.
  const graveWeekDateKeys = React.useMemo(
    () => DAY_DEFS.map((d) => formatLocalDateISO(d.date)),
    [DAY_DEFS],
  );

  // One scoring path for every built day: same weekHistories, same computeSlotPlacementFit loop.
  // Selected day uses the live zustand board (+ draft when active); other days use weekOverview data.
  const weekDailyHealthsRaw = React.useMemo(() => {
    if (!weekPlanTmIdsKey || !weekHistoriesReady) {
      return {};
    }

    const result: Record<string, number> = {};
    const auxDefs = auxDefsForFit;
    const members = (effectiveRealRoster || []) as any[];

    const allWeekTms = new Set<string>();
    for (const [tmId] of plannedThisWeekRecentHistory.entries()) if (tmId) allWeekTms.add(tmId);
    for (const night of weekOverviewNights) {
      for (const a of Object.values(night.assignments || {})) {
        if ((a as any)?.tmId) allWeekTms.add((a as any).tmId);
      }
    }
    for (const a of Object.values(storeAssignmentsForFit)) {
      if ((a as any)?.tmId) allWeekTms.add((a as any).tmId);
    }
    const broadOther: Record<string, PlacementTmProfile | null> = {};
    for (const id of allWeekTms) {
      broadOther[id] = memberToPlacementProfile(members, id);
    }

    for (const night of weekOverviewNights) {
      if (!DAY_DEFS[night.dayIndex]) continue;
      const dayDef = DAY_DEFS[night.dayIndex];
      const dateKey = formatLocalDateISO(dayDef.date);
      const isActiveDay = night.dayIndex === selectedDayIndex;
      const boardReadyForDay = getBoardAssignmentsDayKey() === dateKey;
      const dayAssignments =
        isActiveDay && boardReadyForDay
          ? (storeAssignmentsForFit as Record<string, any>)
          : ((night.assignments || {}) as Record<string, any>);
      const dayIsDraft = isActiveDay && isDraftMode;
      const dayDraftAssignments = dayIsDraft ? draftAssignments : {};

      const hasAssignments = Object.values(dayAssignments).some(
        (a: any) => !!(a?.tmId || a?.tmName),
      );
      if (!hasAssignments) continue;

      const dayTms = new Set<string>();
      for (const a of Object.values(dayAssignments)) {
        if ((a as any)?.tmId) dayTms.add((a as any).tmId);
      }
      const dayOther: Record<string, PlacementTmProfile | null> = {};
      for (const id of dayTms) {
        dayOther[id] = memberToPlacementProfile(members, id) || broadOther[id];
      }

      const dayFitBySlot: Record<string, any> = {};
      const slotKeys = collectDeploymentSlotKeys(auxDefs);
      const dayIso = formatLocalDateISO(dayDef.date);

      for (const slotKey of slotKeys) {
        if (!shouldShowPlacementFitChip(slotKey)) continue;

        const row = resolveSlotAssignmentRow(
          slotKey,
          dayAssignments as any,
          dayIsDraft,
          dayDraftAssignments,
        );
        const assigned = !!(row?.tmName || row?.tmId);
        if (!assigned) continue;

        try {
          const dayScopedWeekHistory = filterWeeklyHistoryThroughNight(
            plannedThisWeekRecentHistory,
            dayIso,
          );
          dayFitBySlot[slotKey] = computeSlotPlacementFit({
            slotKey,
            assignments: dayAssignments as any,
            isDraftMode: dayIsDraft,
            draftAssignments: dayDraftAssignments,
            members,
            auxDefs,
            currentIso: dayIso,
            histories: effectiveWeekHistories,
            historiesLoading: false,
            otherTmProfiles: dayOther,
            weeklyRecentHistory: dayScopedWeekHistory,
          });
        } catch {
          dayFitBySlot[slotKey] = {
            fitVerdict: "acceptable" as const,
            fitSummary: "",
            fitFactLine: "",
          };
        }
      }

      const daily = computeDailyHealthPercent(
        auxDefs,
        dayAssignments as any,
        dayFitBySlot as any,
        dayIsDraft,
        dayDraftAssignments,
      );
      if (daily != null) {
        result[dateKey] = daily;
      }
    }

    return result;
  }, [
    weekOverviewNights,
    plannedThisWeekRecentHistory,
    weekHistoriesReady,
    weekPlanTmIdsKey,
    DAY_DEFS,
    effectiveWeekHistories,
    auxDefsForFit,
    effectiveRealRoster,
    selectedDayIndex,
    storeAssignmentsForFit,
    isDraftMode,
    draftAssignments,
    liveAssignVersion,
  ]);

  // Selected day: same fit map as card chips / ROT pill (immediate selectedDayIndex, not deferred board).
  const selectedDayLiveHealth = React.useMemo(() => {
    if (!deploymentRotationFitEnabled) return null;
    if (Object.keys(deploymentFitBySlot).length === 0) return null;
    return computeDailyHealthPercent(
      auxDefsForFit,
      storeAssignmentsForFit as Record<string, SlotAssignmentRow>,
      deploymentFitBySlot,
      isDraftMode,
      draftAssignments,
    );
  }, [
    deploymentRotationFitEnabled,
    auxDefsForFit,
    storeAssignmentsForFit,
    deploymentFitBySlot,
    isDraftMode,
    draftAssignments,
  ]);

  // Keep last good per-day % visible while incremental history fetches run (TM set grew, refresh, etc.).
  // Overlay selected day with live board fit so the header tracker pill matches ROT / chips.
  const weekDailyHealths = React.useMemo(() => {
    let base: Record<string, number>;
    if (Object.keys(weekDailyHealthsRaw).length > 0) {
      stableWeekDailyHealthsRef.current = weekDailyHealthsRaw;
      base = weekDailyHealthsRaw;
    } else if (weekHistoriesFetching) {
      base = stableWeekDailyHealthsRef.current;
    } else {
      base = weekDailyHealthsRaw;
    }

    if (selectedDayDateKey && selectedDayLiveHealth != null) {
      return { ...base, [selectedDayDateKey]: selectedDayLiveHealth };
    }
    return base;
  }, [
    weekDailyHealthsRaw,
    weekHistoriesFetching,
    selectedDayDateKey,
    selectedDayLiveHealth,
  ]);

  // Blank UI only when histories are still loading *and* we have nothing stable or live to show.
  const weekHealthLoading =
    weekHistoriesFetching &&
    Object.keys(weekDailyHealths).length === 0 &&
    selectedDayLiveHealth == null;

  const weekAverageHealth = React.useMemo(() => {
    const orderedKeys = DAY_DEFS.map((d) => formatLocalDateISO(d.date));
    return computeWeekAverageHealth(weekDailyHealths, orderedKeys);
  }, [weekDailyHealths, DAY_DEFS]);

  const runCoverageEngine = React.useCallback(
    async (options?: CoverageEngineRunOptions) => {
      const confirmMessage =
        options?.confirmMessage ??
        "Run Coverage Planner and enter Draft Mode? This will generate a preview without changing current assignments.";
      if (!options?.skipConfirm && !confirm(confirmMessage)) {
        return;
      }

      if (!engineConfig) {
        showToast("Engine config still loading — try again in a moment");
        return;
      }

      setEngineRunPhase("planner");
      const engineStart = performance.now();

      try {
        const orderedSlots = getSlotsInPlacementOrder(auxDefs);
        const rosterForEngine = graveOnly ? availableGraveRoster : availableRealRoster;

        // Enforce graves_default_schedule as the sole source of truth for who is working/scheduled this night.
        // Only pass scheduled TMs to the placement engine (planner + Grok) when schedule data is loaded.
        // This prevents the engine from placing "people not working from the draft schedule".
        const scheduledSet = effectiveScheduledTmIdsTonight || new Set<string>();
        const planningRoster = scheduledSet.size > 0
          ? rosterForEngine.filter((t: any) => {
              const id = boardTmId(t) || t?.id || t?.tmId || "";
              return scheduledSet.has(String(id));
            })
          : rosterForEngine;

        const { runWeightedPlanner } = await import("@/lib/shiftbuilder/placement");
        const { buildDefaultAdjacency } = await import("@/lib/shiftbuilder/scoring");
        const plannerResult = runWeightedPlanner({
          orderedSlots,
          assignments,
          roster: planningRoster,
          graveOnly,
          preserveOnlyLocked: !!options?.forceXai,
          scoringCtx: {
            config: engineConfig,
            skillScores: tmSkillScores,
            slotDifficulty,
            preferencesByTm: tmPreferencesByTm,
            pairAffinitiesByTm: tmPairAffinitiesByTm,
            accommodationsByTm: tmAccommodationsByTm,
            adjacency: buildDefaultAdjacency(),
            zoneMatrix: tmZoneMatrix,
          },
        });

        const plannerDraft = Object.fromEntries(
          Object.entries(plannerResult.proposedAssignments).filter(([, tmId]) => !!tmId),
        ) as Record<string, string>;

        const isGrokHybrid =
          !!options?.forceXai || engineConfig.placementMethod === "grok-hybrid";
        const useTools = options?.useTools !== false && isGrokHybrid;

        let grokResult: {
          picks: Array<{ slotKey: string; tmId: string; reason: string }>;
          explanation: string;
          warnings: string[];
          usedGrok: boolean;
          rawText: string;
          usage?: {
            inputTokens?: number;
            outputTokens?: number;
            model?: string;
            reasoningEffort?: string;
          };
        } = {
          picks: [],
          explanation: "",
          warnings: [],
          usedGrok: false,
          rawText: "",
        };

        let recordedRealEngineUsage = false;
        let healthOptimized: import("@/lib/shiftbuilder/rotationHealthEngineContext").HealthOptimizedDraftResult | null =
          null;
        if (isGrokHybrid) {
          setEngineRunPhase("xai");
          const operatorNotes = notesRef.current?.innerText || "";
          const tonightIso = formatLocalDateISO(selectedDay.date);
          const rotationHealth = computeShiftRotationHealth(
            auxDefsForFit,
            storeAssignmentsForFit,
            deploymentFitBySlot,
            {
              isDraftMode,
              draftAssignments,
              weeklyRecentHistory: plannedThisWeekRecentHistory,
              weekDailyHealths,
            },
          );
          const fitVerdictBySlot = Object.fromEntries(
            Object.entries(deploymentFitBySlot).map(([k, v]) => [
              k,
              { verdict: v.fitVerdict, summary: v.fitSummary },
            ]),
          );

          const {
            buildEngineRotationPack,
            buildHealthOptimizedDraft,
            formatRotationPackForPrompt,
          } = await import("@/lib/shiftbuilder/rotationHealthEngineContext");
          const rosterLookup = buildTmLookupIndex(planningRoster);
          const slotCandidates = orderedSlots
            .map((slotKey) => {
              const ranking = plannerResult.breakdown[slotKey];
              if (!ranking || ranking.preserved) return null;
              const candidates = ranking.topCandidates.slice(0, 5).map((c) => ({
                tmId: c.tmId,
                tmName: c.tmName,
              }));
              return candidates.length > 0 ? { slotKey, candidates } : null;
            })
            .filter(Boolean) as Array<{
            slotKey: string;
            candidates: Array<{ tmId: string; tmName: string }>;
          }>;

          healthOptimized = buildHealthOptimizedDraft({
            placementOrder: orderedSlots,
            plannerResult,
            tonightIso,
            auxDefs: auxDefsForFit,
            histories: effectiveWeekHistories,
            weeklyRecentHistory: plannedThisWeekRecentHistory,
            members: effectiveRealRoster as Array<Record<string, unknown>>,
            rosterById: rosterLookup,
            scheduledTmIds: effectiveScheduledTmIdsTonight,
            baseAssignments: storeAssignmentsForFit as Record<string, any>,
          });
          const draftForGrok =
            Object.keys(healthOptimized.draft).length > 0
              ? healthOptimized.draft
              : plannerDraft;

          const rotationPack = buildEngineRotationPack({
            tonightIso,
            assignments: storeAssignmentsForFit as Record<string, any>,
            auxDefs: auxDefsForFit,
            histories: effectiveWeekHistories,
            weeklyRecentHistory: plannedThisWeekRecentHistory,
            weekDailyHealths,
            graveWeekDateKeys,
            rosterById: rosterLookup,
            plannerDraft,
            healthOptimizedDraft: healthOptimized.draft,
            members: effectiveRealRoster as Array<Record<string, unknown>>,
            slotCandidates,
            maxCandidatesPerSlot: 4,
          });
          const rotationHealthPromptBlock = formatRotationPackForPrompt(
            rotationPack.brief,
            rotationPack.candidatePreviewsBySlot,
            healthOptimized.picks,
          );

          const rulesContext = {
            config: engineConfig,
            scoringContext: {
              config: engineConfig,
              skillScores: tmSkillScores,
              slotDifficulty,
              preferencesByTm: tmPreferencesByTm,
              pairAffinitiesByTm: tmPairAffinitiesByTm,
              accommodationsByTm: tmAccommodationsByTm,
              zoneMatrix: tmZoneMatrix,
            },
            auxDefs,
            currentDraft: new Map(Object.entries(draftForGrok)),
            scheduledTmIds: effectiveScheduledTmIdsTonight,
          };

          const { buildGrokEngineSnapshot } = await import("@/lib/shiftbuilder/grokEngine");
          let snapshot;
          try {
            snapshot = buildGrokEngineSnapshot({
              dayName: selectedDay.name,
              shiftDate: selectedDay.date,
              plannerResult,
              roster: planningRoster,
              operatorNotes,
              calledOffTmIds: calledOffIds,
              recentHistory: plannedThisWeekRecentHistory,
              config: engineConfig,
              placementOrder: orderedSlots,
              rulesContext,
              rotationHealthPercent:
                rotationHealth.dailyPercent ?? rotationHealth.percent,
              fitVerdictBySlot,
              rotationHealthBrief: rotationPack.brief,
              candidateRotationPreviews: rotationPack.candidatePreviewsBySlot,
              rotationHealthPromptBlock,
              healthOptimizedDraft: healthOptimized.draft,
            });
          } catch (err) {
            console.error("[engine] snapshot build failed:", err);
            showToast("Engine snapshot build failed — falling back to scoring only");
            applyPlannerResultAsDraft(plannerResult, planningRoster, {});
            return;
          }

          try {
            const { askGrokEngineDraft } = await import("./actions");
            grokResult = await askGrokEngineDraft(snapshot, {
              useTools,
              toolContext: {
                roster: planningRoster,
                auxDefs,
                engineConfig,
                currentDraft: draftForGrok,
                scoringData: {
                  skillScores: tmSkillScores,
                  slotDifficulty,
                  preferencesByTm: tmPreferencesByTm,
                  pairAffinitiesByTm: tmPairAffinitiesByTm,
                  accommodationsByTm: tmAccommodationsByTm,
                  zoneMatrix: tmZoneMatrix,
                },
                scheduledTmIds: effectiveScheduledTmIdsTonight,
                rotationEngineContext: {
                  tonightIso,
                  auxDefs: auxDefsForFit,
                  histories: effectiveWeekHistories,
                  weeklyRecentHistory: plannedThisWeekRecentHistory,
                  members: effectiveRealRoster as Array<Record<string, unknown>>,
                  rosterById: rosterLookup,
                },
              },
            });
            if (grokResult?.usage) {
              try {
                useShiftBuilderStore.getState().addAiUsage(grokResult.usage);
                updateOpsStatusBarContent?.();
                console.log(`[ai-usage-engine] recorded ${grokResult.usage.inputTokens || 0}+${grokResult.usage.outputTokens || 0} tok for ${grokResult.usage.model || 'grok'} effort=${grokResult.usage.reasoningEffort || ''} (usedGrok=${grokResult.usedGrok})`);
                recordedRealEngineUsage = true;
              } catch {
                /* ignore */
              }
            }
          } catch (err) {
            console.error("[engine] Grok call failed:", err);
            grokResult = {
              picks: [],
              explanation: "",
              warnings: ["Grok call failed"],
              usedGrok: false,
              rawText: "",
              usage: undefined,
            };
          }

          const proposedCount = grokResult.picks.length; // after guard
          console.groupCollapsed(
            `[GrokEngineCapture] ${selectedDay.name} — ${grokResult.usedGrok ? "Grok used" : "Grok skipped/failed"} (valid overrides: ${proposedCount})`,
          );
          console.log("Placement Method:", options?.forceXai ? "xai-button-forced" : engineConfig.placementMethod);
          console.log("Tools:", useTools ? "enabled" : "off");
          console.log("Grok warnings:", grokResult.warnings);
          console.log("Grok explanation:", grokResult.explanation || "(none provided)");
          if (!grokResult.usedGrok && grokResult.warnings.length === 0) {
            console.log("Note: Grok returned 0 picks (or all filtered) — no overrides applied; using full planner result.");
          }
          console.groupEnd();
        }

        // Ensure the xAI engine run is always tracked in the usage bar / 30d ledger (even if Grok call failed or produced 0 valid picks/overrides).
        // This makes the call count increase and the bar reflect the engine invocation.
        if (isGrokHybrid && !recordedRealEngineUsage) {
          const zeroOrFallbackUsage = grokResult?.usage || {
            inputTokens: 0,
            outputTokens: 0,
            model: "grok-4.3",
            reasoningEffort: "high",
          };
          try {
            useShiftBuilderStore.getState().addAiUsage(zeroOrFallbackUsage);
            updateOpsStatusBarContent?.();
            console.log(`[ai-usage-engine] ensured tracking (0 or fallback tokens) for xAI engine run (usedGrok=${grokResult?.usedGrok})`);
          } catch {
            /* ignore */
          }
        }

        const { mergeGrokOverridesIntoDraft } = await import("@/lib/shiftbuilder/grokEngine");
        const { proposedAssignments, reasoningBySlot } = mergeGrokOverridesIntoDraft({
          plannerResult,
          picks: grokResult.picks,
        });

        const engineDuration = Math.round(performance.now() - engineStart);
        const preservedCount = Object.values(plannerResult.breakdown).filter(
          (b) => b.preserved,
        ).length;
        const filledCount = Object.keys(plannerResult.proposedAssignments).length;
        const unfilledSlots = Object.keys(plannerResult.proposedAssignments).filter(
          (k) => !plannerResult.proposedAssignments[k],
        );

        const { logEngineRunSummary } = await import("@/lib/shiftbuilder/placement");
        logEngineRunSummary({
          mode: "interactive-draft",
          dayName: selectedDay.name,
          nightDate: selectedDay.date.toISOString().slice(0, 10),
          durationMs: engineDuration,
          rosterSize: rosterForEngine.length,
          slotsProcessed: orderedSlots.length,
          preservedSlots: preservedCount,
          filledSlots: filledCount,
          unfilledSlots: plannerResult.notes.length,
          usedGrok: grokResult.usedGrok,
          grokPicksApplied: grokResult.picks.length,
          matrixPreloaded: !!tmZoneMatrix && tmZoneMatrix.size > 0,
          warnings: grokResult.warnings,
          topUnfilledSlots: unfilledSlots.slice(0, 6),
          placementMethod: isGrokHybrid ? "grok-hybrid" : engineConfig.placementMethod,
        });

        applyPlannerResultAsDraft(
          { ...plannerResult, proposedAssignments },
          rosterForEngine,
          reasoningBySlot,
          grokResult.explanation,
          grokResult.warnings,
        );

        if (options?.forceXai) {
          const draftSlotCount = Object.keys(proposedAssignments).filter(Boolean).length;
          const openSlots = orderedSlots.length - draftSlotCount;
          const hadGrokCall = isGrokHybrid;
          const xaiNote = grokResult.usedGrok
            ? ""
            : hadGrokCall
              ? " (xAI consulted; 0 net overrides — planner + Grok reasons used)"
              : " (xAI skipped)";
          const healthNote =
            isGrokHybrid && healthOptimized?.projectedFitPercent != null
              ? ` · rot ${healthOptimized.projectedFitPercent}%${
                  healthOptimized.liftVsPlanner && healthOptimized.liftVsPlanner > 0
                    ? ` (+${healthOptimized.liftVsPlanner} vs planner)`
                    : ""
                }`
              : "";
          const baseMsg = hadGrokCall && grokResult.usedGrok
            ? `xAI draft: ${draftSlotCount} placements${openSlots > 0 ? ` (${openSlots} open — check schedule/gender pool)` : ""}${healthNote}`
            : `Planner draft: ${draftSlotCount} placements${xaiNote}${healthNote}`;
          const summary = grokResult.explanation ? ` — ${grokResult.explanation}` : "";
          showToast(
            baseMsg + summary,
            draftSlotCount > 0 ? "success" : "info",
          );
        }
      } finally {
        setEngineRunPhase("idle");
      }
    },
    [
      engineConfig,
      auxDefs,
      assignments,
      graveOnly,
      availableGraveRoster,
      availableRealRoster,
      tmSkillScores,
      slotDifficulty,
      tmPreferencesByTm,
      tmPairAffinitiesByTm,
      tmAccommodationsByTm,
      tmZoneMatrix,
      calledOffIds,
      effectiveRecentZoneHistory,
      selectedDay,
      effectiveScheduledTmIdsTonight,
      applyPlannerResultAsDraft,
      showToast,
      auxDefsForFit,
      storeAssignmentsForFit,
      deploymentFitBySlot,
      isDraftMode,
      draftAssignments,
      weekDailyHealths,
      effectiveWeekHistories,
      graveWeekDateKeys,
      plannedThisWeekRecentHistory,
      effectiveRealRoster,
    ],
  );

  React.useEffect(() => {
    runCoverageEngineRef.current = runCoverageEngine;
  }, [runCoverageEngine]);

  const runXaiEngineFromCanvas = React.useCallback(() => {
    if (!canRunEngine) {
      showToast("Insufficient privileges — you cannot run the engine", "error");
      return;
    }
    if (isCurrentNightLocked) {
      showToast("This day is locked — engine cannot run", "error");
      return;
    }
    void runCoverageEngine({
      forceXai: true,
      useTools: true,
      confirmMessage:
        "Run the xAI coverage engine for tonight? Weighted planner scores the board, then xAI uses engine rules, Graves Default Schedule, and rotation fit to propose a draft (nothing saves until you apply).",
    });
  }, [canRunEngine, isCurrentNightLocked, runCoverageEngine, showToast]);

  // getEligibleForCurrentSlot: used for the *default* list only (grave / PM / AM bands).
  const roleSetHasTm = React.useCallback(
    (roleSet: Set<string>, entryTmId: string) => {
      if (roleSet.has(entryTmId)) return true;
      const tm = resolveTmFromLookup(markerRosterLookup, entryTmId);
      if (!tm) return false;
      const aid = assignmentTmId(tm);
      return roleSet.has(aid) || roleSet.has(tm.id) || (!!tm.profileId && roleSet.has(tm.profileId));
    },
    [markerRosterLookup]
  );

  const getEligibleForCurrentSlot = React.useCallback(
    (baseList: { tmId: string; tmName: string }[]) => {
      if (!selectedSlotKey) return baseList;

      const isFullNightSlot = selectedSlotKey.startsWith('Z') ||
        selectedSlotKey === 'ADM' ||
        selectedSlotKey.startsWith('TR') ||
        selectedSlotKey.startsWith('AUX') ||
        selectedSlotKey.startsWith('SP');

      const isOLPMSlot = selectedSlotKey.startsWith('OL-PM') || selectedSlotKey.includes('PM-Overlap');
      const isOLAMSlot = selectedSlotKey.startsWith('OL-AM') || selectedSlotKey.includes('AM-Overlap');

      return baseList.filter((entry) => {
        const tm = resolveTmFromLookup(markerRosterLookup, entry.tmId);
        if (!tm) return false;

        if (isFullNightSlot && !roleSetHasTm((effectiveGrave as any) || new Set(), entry.tmId)) return false;
        if (isOLPMSlot && !roleSetHasTm((effectivePM as any) || new Set(), entry.tmId)) return false;
        if (isOLAMSlot && !roleSetHasTm((effectiveAM as any) || new Set(), entry.tmId)) return false;

        try {
          return isEligibleForSlot(tm, selectedSlotKey);
        } catch {
          return true;
        }
      });
    },
    [selectedSlotKey, markerRosterLookup, effectiveGrave, effectivePM, effectiveAM, roleSetHasTm]
  );

  // getBasicEligibleForSlot: used only for the search pool.
  // Core eligibility only — no "must be in the scheduled grave/overlap set" requirement.
  const getBasicEligibleForSlot = React.useCallback(
    (baseList: { tmId: string; tmName: string }[]) => {
      if (!selectedSlotKey) return baseList;

      return baseList.filter((entry) => {
        const tm = resolveTmFromLookup(markerRosterLookup, entry.tmId);
        if (!tm) return false;

        try {
          return isEligibleForSlot(tm, selectedSlotKey);
        } catch {
          return true;
        }
      });
    },
    [selectedSlotKey, markerRosterLookup]
  );

  const markerSlotScheduledUnassigned = React.useMemo(
    () => getEligibleForCurrentSlot(markerScheduledUnassigned),
    [getEligibleForCurrentSlot, markerScheduledUnassigned]
  );

  const markerSlotAllEligibleTms = React.useMemo(
    () => getBasicEligibleForSlot(markerAllEligibleTms),
    [getBasicEligibleForSlot, markerAllEligibleTms]
  );

  const handlePadAddOnCall = React.useCallback(
    async (tmId: string, tmName: string) => {
      const reliableNightId = queryNightId || nightId;
      const dateStr = formatLocalDateISO(selectedDay.date);
      try {
        const res = await fetch("/api/shiftbuilder/night-on-call", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nightId: reliableNightId,
            date: dateStr,
            tmId,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        setPickerScheduleEpoch((e) => e + 1);
        const dateKey = selectedDay.date.toISOString().slice(0, 10);
        await currentNight.queryClient?.invalidateQueries({ queryKey: ["nightCore", dateKey] });
        showToast(`${tmName} added on-call for tonight`, "success");
      } catch (e) {
        console.error("[shiftbuilder] on-call add failed", e);
        showToast("Failed to add on-call", "error");
      }
    },
    [queryNightId, nightId, selectedDay.date, currentNight.queryClient, showToast],
  );

  const handlePadMarkUnavailable = React.useCallback(
    async (tmId: string, tmName: string, status: string = "called_off") => {
      const reliableNightId = queryNightId || nightId;
      const dateStr = formatLocalDateISO(selectedDay.date);
      try {
        if (!reliableNightId) throw new Error("No night id");
      await updateNightTmStatus({
          nightId: reliableNightId,
          tmId,
          status,
          note: `Marked from placement picker (${status})`,
          tmName,
        });
        setPickerScheduleEpoch((e) => e + 1);
        const dateKey = selectedDay.date.toISOString().slice(0, 10);
        await currentNight.queryClient?.invalidateQueries({ queryKey: ["nightCore", dateKey] });
        showToast(`${tmName} marked ${status} for tonight`, "success");
      } catch (e) {
        console.error("[shiftbuilder] mark unavailable failed", e);
        showToast("Failed to mark unavailable", "error");
      }
    },
    [queryNightId, nightId, selectedDay.date, currentNight.queryClient, showToast],
  );

  const cmdkCompletionUnplaced = React.useMemo(() => {
    return Array.from(effectiveScheduledTmIdsTonight)
      .filter((id) => !alreadyAssignedThisNight.has(id))
      .map((id) => {
        const tm = effectiveRealRoster.find((t: any) => t.id === id);
        return tm?.name || tm?.fullName || id;
      })
      .filter(Boolean)
      .slice(0, 12) as string[];
  }, [effectiveScheduledTmIdsTonight, alreadyAssignedThisNight, effectiveRealRoster]);

  const cmdkCompletionAssignments = React.useMemo(
    () =>
      Object.fromEntries(
        Object.entries(assignments).map(([k, v]: [string, any]) => [
          k,
          { tmId: v?.tmId, tmName: v?.tmName },
        ])
      ),
    [assignments]
  );

  const cmdkSelectedSlotAssignment = React.useMemo(
    () =>
      cmdkInitialContext?.type === "slot"
        ? assignments[cmdkInitialContext.value]
        : null,
    [cmdkInitialContext, assignments]
  );

  const handleGenderClick = (slotKey: string) => {
    handleSlotToggle(slotKey);
  };

  // ESC closes the task selector popover too.
  useEffect(() => {
    if (!tasksOpenFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setTasksOpenFor(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tasksOpenFor]);

  // Listen for prefs changes coming from the Sudo Tasks tab (custom event + localStorage).
  useEffect(() => {
    const sync = () => {
      try {
        const raw = localStorage.getItem("shiftbuilder:taskUxPrefs");
        if (raw) {
          const p = JSON.parse(raw);
          if (typeof p.dragEnabled === "boolean") setTaskDragEnabled(p.dragEnabled);
        }
      } catch {}
    };
    sync();
    window.addEventListener("task-ux-prefs-changed", sync as any);
    return () => window.removeEventListener("task-ux-prefs-changed", sync as any);
  }, []);

  // ────────────────────────────────────────────────────────────────────────
  // dnd-kit: roster → card (assign), card → card (swap/move), card → roster
  // (unassign), card → nowhere (also unassign). Pointer + Touch + Keyboard
  // sensors give us mouse, iPad, and a11y parity from a single source.
  // ────────────────────────────────────────────────────────────────────────

  // Safe wrapper used only in the drag path to guarantee we never send
  // unmappable legacy keys ("admin", "z9_sr", old Z9, etc.) to the live layer or store.
  // This is the direct fix for the 400s on zone_assignments during reassignment.
  const safeNormalizeSlotKey = (key: string): string => {
    if (!key) return key;
    try {
      // If it already round-trips cleanly, keep it.
      uiToDb(key); // will not throw on the tolerant version
      return key;
    } catch {
      // Last resort: if it's a known bad legacy value, map it.
      const map: Record<string, string> = {
        admin: "ADM",
        "z9_sr": "Z9SR",
        Z9: "Z9", // example
      };
      return map[key] || key;
    }
  };
  const [activeDrag, setActiveDrag] = useState<{
    kind: "tm" | "assigned" | "task";
    label: string;
    fromSlot?: string;
  } | null>(null);

  const onDragStart = (event: DragStartEvent) => {
    const d = event.active.data.current as any;
    if (!d) return;

    if (d.type === "tm") {
      setActiveDrag({ kind: "tm", label: d.tmName });
    } 
    else if (d.type === "assigned") {
      setActiveDrag({ kind: "assigned", label: d.tmName, fromSlot: d.fromSlot });
      
      // CRITICAL: Mark this as a pending drag so the source card does NOT lose its
      // draggable state mid-gesture.
      // Use defensive access because of Turbopack HMR store module duplication issues
      // that have historically affected this project.
      const store = useShiftBuilderStore.getState();
      if (typeof store.setPendingDrag === 'function') {
        store.setPendingDrag({
          fromSlot: d.fromSlot,
          tmId: d.tmId,
          tmName: d.tmName,
        });
      } else {
        // Fallback: store the value directly on the state if setter is missing (HMR edge case)
        useShiftBuilderStore.setState({ pendingDrag: {
          fromSlot: d.fromSlot,
          tmId: d.tmId,
          tmName: d.tmName,
        }});
      }
    } 
    else if (d.type === "task") {
      setActiveDrag({ kind: "task", label: d.taskLabel, fromSlot: d.fromSlot });
    }
  };

  // Task reorder commits on drag end (not live onDragOver) so the source row stays
  // stable under the cursor — same feel as TM/name drags with the drag ghost.
  const onDragOver = undefined;

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    
    // Always clear pending drag when the gesture ends.
    // Defensive access due to known Turbopack + Zustand HMR quirks in this project.
    const store = useShiftBuilderStore.getState();
    if (typeof store.setPendingDrag === 'function') {
      store.setPendingDrag(null);
    } else {
      useShiftBuilderStore.setState({ pendingDrag: null });
    }

    const { active, over } = event;
    const a = active.data.current as any;
    if (!a) return;

    // WeekLens v2 (builder weekly) dnd skeleton.
    // Cells in the weekly artboard (when mode=builder) carry data attrs or custom payload.
    // We detect here and translate to a cross-night (or same-night) reassign on the correct week day,
    // using the same live store + history paths as the main board. Guarded so it never interferes with card/roster dnd.
    if (currentView === 'weekly' && canvasMode === 'builder' && !isPrintPreview) {
      // Placeholder: in a full pass we would read source night/slot + target from over/active data attrs
      // (the WeeklyOverview cells would emit data-weekly-cell + data-slot + data-day-index on the draggable areas).
      // For now we just acknowledge and let the normal flow continue (or early-return after a toast).
      // Real implementation wires to liveAssignmentsStore.setAssignmentsForNight for the specific night + recordChange.
      if (a.source === 'weekly-cell' || String(active.id || '').startsWith('weekly-')) {
        // Conservative: do nothing destructive in the skeleton; the applyWeekLensMove path below is the supported "one click" for suggestions.
        // Future: implement the direct cell-to-cell drop here with eligibility + health re-calc.
        return;
      }
    }

    // Fresh roster TM → slot
    if (a.type === "tm") {
      if (over?.data.current?.type === "slot") {
        const normalizedSlot = safeNormalizeSlotKey((over.data.current as any).slotKey);
        assign(normalizedSlot, a.tmId, a.tmName);
      }
      return;
    }

    // Task being dragged between cards. Must be checked BEFORE the "assigned"
    // TM block — a.type cannot simultaneously be "assigned" and "task", so
    // nesting this check inside the assigned block made it unreachable.
    if (a.type === "task") {
      const activatorEvent = event.activatorEvent as any;
      const isDuplicateDrag = !!(activatorEvent && (activatorEvent.altKey || activatorEvent.optionKey));

      const overData = over?.data.current as any;
      let toUiKey: string | null = null;
      if (overData?.type === "slot") {
        toUiKey = overData.slotKey;
      } else if (overData?.type === "task-item") {
        toUiKey = overData.slotKey;
      }
      if (!toUiKey) return;

      const fromUiKey = a.fromSlot;

      if (toUiKey === fromUiKey) {
        // Reorder within the same slot's task list (drag-to-sort) — commit once on drop.
        const hoverLabel =
          overData?.type === "task-item" && overData.taskLabel !== a.taskLabel
            ? overData.taskLabel
            : null;
        if (!hoverLabel) return;

        const currentList = selectedTasks[fromUiKey] ?? [];
        const reordered = [...currentList];
        const fromIdx = reordered.findIndex((t: any) => t.taskLabel === a.taskLabel);
        const toIdx = reordered.findIndex((t: any) => t.taskLabel === hoverLabel);
        if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;

        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);
        const orderedLabels = reordered.map((t: any) => t.taskLabel);

        setSelectedTasks((prev) => ({ ...prev, [fromUiKey]: reordered }));

        (async () => {
          let nid = nightId;
          if (!nid) nid = await resolveNightIdForDate(selectedDay.date, selectedDay.name);
          if (!nid) return;

          try {
            const { reorderNightSlotTasks } = await import("@/lib/shiftbuilder/data");
            const { slot_key, slot_type, rr_side } = uiToDb(fromUiKey);
            await reorderNightSlotTasks(nid, slot_key, slot_type, rr_side, orderedLabels);
          } catch (e: any) {
            console.error("[shiftbuilder] task reorder persist failed", e);
            showToast("Tasks reordered in UI but failed to save — refresh may revert");
          }
        })();
        return;
      }

      if (isDuplicateDrag) {
        // Option/Alt + drag task = duplicate (copy) to the target slot instead of move.
        // Use current selectedTasks (from render scope at handler creation / end time).
        const taskToCopy = (selectedTasks[fromUiKey] ?? []).find((t: any) => t.taskLabel === a.taskLabel);
        if (!taskToCopy) return;

        const { slot_key: toSlotKey, slot_type: toSlotType, rr_side: toRrSide } = uiToDb(toUiKey);

        // Optimistic add copy to target (keep source)
        setSelectedTasks((prev) => {
          const copied = {
            ...taskToCopy,
            slotKey: toSlotKey,
            slotType: toSlotType,
            rrSide: toRrSide,
            // id will be server generated on refresh
          };
          const newTo = [...(prev[toUiKey] ?? []), copied];
          return { ...prev, [toUiKey]: newTo };
        });

        (async () => {
          let nid = nightId;
          if (!nid) nid = await resolveNightIdForDate(selectedDay.date, selectedDay.name);
          if (!nid) return;

          try {
            const { addNightSlotTask } = await import("@/lib/shiftbuilder/data");
            await addNightSlotTask({
              nightId: nid,
              slotKey: toSlotKey,
              slotType: toSlotType,
              rrSide: toRrSide,
              taskLabel: a.taskLabel,
              catalogTaskId: a.catalogTaskId ?? null,
              color: a.color ?? null,
              // sortOrder will default / append in add
            });
            // Refresh the target slot's tasks so order/sort_order is correct
            const fresh = await (await import("@/lib/shiftbuilder/data")).getNightSlotTasks(nid);
            const byKey: Record<string, any[]> = {};
            for (const t of fresh) {
              const uiKey = t.slotKey; // already camelCase from the mapper in getNightSlotTasks
              if (!byKey[uiKey]) byKey[uiKey] = [];
              byKey[uiKey].push(t);
            }
            setSelectedTasks((prev) => ({ ...prev, ...byKey })); // merge, other slots unchanged
          } catch (e: any) {
            console.error("[shiftbuilder] task duplicate persist failed", e);
            showToast("Task duplicated in UI but failed to save — refresh may revert");
          }
        })();
        return;
      }

      // Normal move (different slot, no modifier)
      if (over?.data.current?.type === "slot") {
        const toUiKeyMove = (over.data.current as any).slotKey;
        const fromUiKeyMove = a.fromSlot;
        if (toUiKeyMove === fromUiKeyMove) return;

        const { slot_key: toSlotKey, slot_type: toSlotType, rr_side: toRrSide } = uiToDb(toUiKeyMove);
        const { slot_key: fromSlotKey, slot_type: fromSlotType, rr_side: fromRrSide } = uiToDb(fromUiKeyMove);

        // Optimistic move in the selectedTasks buckets (same shape the card renderers use)
        setSelectedTasks((prev) => {
          const fromList = prev[fromUiKeyMove] ?? [];
          const taskToMove = fromList.find((t) => t.taskLabel === a.taskLabel);
          if (!taskToMove) return prev;

          const newFrom = fromList.filter((t) => t.taskLabel !== a.taskLabel);
          const movedTask = {
            ...taskToMove,
            slotKey: toSlotKey,
            slotType: toSlotType,
            rrSide: toRrSide,
          };
          const newTo = [...(prev[toUiKeyMove] ?? []), movedTask];
          return { ...prev, [fromUiKeyMove]: newFrom, [toUiKeyMove]: newTo };
        });

        // Persist using the same coordinated-night pattern used for TM swaps
        (async () => {
          let nid = nightId;
          if (!nid) nid = await resolveNightIdForDate(selectedDay.date, selectedDay.name);
          if (!nid) return;

          try {
            const { moveNightSlotTask } = await import("@/lib/shiftbuilder/data");
            await moveNightSlotTask({
              nightId: nid,
              fromSlotKey,
              fromSlotType,
              fromRrSide,
              toSlotKey,
              toSlotType,
              toRrSide,
              taskLabel: a.taskLabel,
            });
          } catch (e: any) {
            console.error("[shiftbuilder] task move persist failed", e);
            showToast("Task moved in UI but failed to save — refresh may revert it");
          }
        })();
      }
      return;
    }

    // Already-assigned TM being moved
    if (a.type === "assigned") {
      console.log('[DRAG ASSIGNED] drop detected', {
        from: a.fromSlot,
        overType: over?.data?.current?.type,
        overKey: over?.data?.current?.slotKey,
        liveAvailable: !!live?.assign,
      });

      // → another slot: atomic swap (or move if target empty)
      if (over?.data.current?.type === "slot") {
        const rawToKey = (over.data.current as any).slotKey;
        const rawFromKey = a.fromSlot;
        if (rawToKey === rawFromKey) return; // dropped on self, no-op

        // Normalize right at the drag boundary so legacy keys never reach the store or live layer.
        const toKey = safeNormalizeSlotKey(rawToKey);
        const fromKey = safeNormalizeSlotKey(rawFromKey);

        const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
        pendingHistoryRef.current = { description: `Moved assignment from ${fromKey} to ${toKey}`, before };

        // Capture night context at action time — both persist calls must
        // target the SAME night id even if the user switches days mid-write.
        const captureDate = selectedDay.date;
        const captureDayName = selectedDay.name;

        // Read the *authoritative* current values from the main board store
        // (ShiftBuilderBoard + cards subscribe to this). The local `assignments`
        // useState is only for history/undo now and can be stale for visuals.
        const mainAssignments = useShiftBuilderStore.getState().assignments || {};
        const movingFromMain = mainAssignments[fromKey];
        const displacedFromMain = mainAssignments[toKey];

        const movingTmId: string | null = movingFromMain?.tmId ?? null;
        const displacedTmId: string | null = displacedFromMain?.tmId ?? null;

        // We keep a minimal local update only for the history/undo snapshot.
        // The real visual path is the main store (below). This reduces fighting layers.
        const movingSnap = movingFromMain;
        const displacedSnap = displacedFromMain;

        // Primary visual update: directly mutate the store the board/cards actually read.
        // This makes the move feel instant even if live layer has any internal delay.
        try {
          useShiftBuilderStore.getState().setAssignments((prev: any) => {
            const next = { ...prev };
            // Clear source
            if (displacedSnap) {
              next[fromKey] = { ...displacedSnap, slotKey: fromKey };
            } else {
              delete next[fromKey];
            }
            // Place moving TM in target
            if (movingSnap) {
              next[toKey] = { ...movingSnap, slotKey: toKey };
            }
            return next;
          });
          const isSwap = !!displacedTmId;
        console.log('[DRAG ASSIGNED] optimistic store patch applied', { 
          fromKey, 
          toKey, 
          movingTmId, 
          displacedTmId,
          operation: isSwap ? 'SWAP' : 'MOVE_TO_EMPTY'
        });
        } catch (e) {
          console.warn("[drag] direct store patch failed", e);
        }

        // Keep legacy assignments state aligned with the store (picker/pad/clear-board reads).
        setAssignments({ ...useShiftBuilderStore.getState().assignments });

        mirrorMainAssignmentsToLiveStore(captureDate);
        setLiveAssignVersion((v) => v + 1);

        // Persistence strategy for assigned drag (the cleanest path for both move and swap):
        // Do the optimistic visual update via the main store (already done above).
        // Then use pure background persistence for the actual DB writes.
        // This completely removes the live optimistic layer from the drag gesture,
        // which was the source of the partial re-patches that broke swaps while
        // move-to-empty started working.
        (async () => {
          try {
            const { upsertZoneAssignment } = await import("@/lib/shiftbuilder/data");
            const nid = nightId || await resolveNightIdForDate(captureDate, captureDayName);
            if (!nid) return;

            // Moving TM → target slot
            if (movingTmId) {
              const { slot_key, slot_type, rr_side } = uiToDb(toKey);
              await upsertZoneAssignment({
                nightId: nid,
                slotKey: slot_key,
                slotType: slot_type,
                rrSide: rr_side,
                tmId: movingTmId,
              });
            }

            // Displaced TM (swap) or clear source (move-to-empty)
            if (displacedTmId) {
              const { slot_key, slot_type, rr_side } = uiToDb(fromKey);
              await upsertZoneAssignment({
                nightId: nid,
                slotKey: slot_key,
                slotType: slot_type,
                rrSide: rr_side,
                tmId: displacedTmId,
              });
            } else {
              // Source slot should be cleared
              const { deleteZoneAssignment } = await import("@/lib/shiftbuilder/data");
              await deleteZoneAssignment({ nightId: nid, uiKey: fromKey });
            }

            const dateKey = formatLocalDateISO(captureDate);
            const qc = currentNight.queryClient;
            if (qc) {
              patchNightCoreAssignmentsCache(
                qc,
                dateKey,
                useShiftBuilderStore.getState().assignments ?? {},
              );
            }
          } catch (e) {
            console.error("[drag] background persist failed", e);
          }
        })();
          // Legacy fallback only
          (async () => {
            let nid = nightId;
            if (!nid) nid = await resolveNightIdForDate(captureDate, captureDayName);
            if (!nid) return;
            try {
              await persistAssign(nid, captureDate, captureDayName, toKey, movingTmId);
              await persistAssign(nid, captureDate, captureDayName, fromKey, displacedTmId);
            } catch (e: any) {
              console.error("[shiftbuilder] legacy drag persist failed", e);
            }
          })();

        // (Legacy fallback removed for assigned drag.)

        return;
      }

      // → roster panel: unassign
      if (over?.data.current?.type === "roster") {
        const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
        pendingHistoryRef.current = { description: `Unassigned from ${a.fromSlot}`, before };
        unassign(a.fromSlot);
        return;
      }
      // → nowhere: also unassign (drag-to-trash convention)
      if (!over) {
        unassign(a.fromSlot);
        return;
      }
    }
  };

  // === Live data effects ====================================================
  //
  // Visual day data flows through useCurrentNight (TanStack Query + keepPreviousData).
  // Side-effect sync below mirrors query slices into legacy mutation state (nightId,
  // notes pad, tasks, borders, call-offs). persistAssign still captures nightId at
  // action time to prevent wrong-day writes.
  // === Session-stable data loader ===========================================
  //
  // These 6 queries return data that does NOT vary by selected day — they
  // depend only on the TM roster / engine config, both of which change rarely
  // and are refreshed by bumping `tmCommandEpoch`. Isolating them here means
  // day-switches never re-fire these round-trips (each day switch triggered
  // ~6 unnecessary Supabase calls before this split).
  useEffect(() => {
    (async () => {
      try {
        const {
          getTMSkillScores,
          getSlotDifficultyRaw,
          getTMPreferences,
          getTMPairAffinities,
          getTMAccommodations,
          getTmZoneMatrix,
        } = await import("@/lib/shiftbuilder/data");

        const [
          activeConfig,
          skillScoreMap,
          slotDifficultyMap,
          preferenceRows,
          pairAffinityRows,
          accommodationRows,
          zoneMatrixRaw,
        ] = await Promise.all([
          (await import("@/lib/shiftbuilder/engineConfig")).getActiveEngineConfig(),
          getTMSkillScores(),
          getSlotDifficultyRaw(),
          getTMPreferences(),
          getTMPairAffinities(),
          getTMAccommodations(),
          getTmZoneMatrix(), // preloaded once for the whole engine run — eliminates per-TM N+1
        ]);

        setTmZoneMatrix(zoneMatrixRaw);

        setEngineConfig(activeConfig);
        setTmSkillScores(skillScoreMap);
        setSlotDifficulty(slotDifficultyMap);

        const prefByTm = new Map<string, any[]>();
        preferenceRows.forEach((r: any) => {
          if (!prefByTm.has(r.tmId)) prefByTm.set(r.tmId, []);
          prefByTm.get(r.tmId)!.push(r);
        });
        setTmPreferencesByTm(prefByTm);

        const pairByTm = new Map<string, any[]>();
        pairAffinityRows.forEach((r: any) => {
          if (!pairByTm.has(r.tmId)) pairByTm.set(r.tmId, []);
          pairByTm.get(r.tmId)!.push(r);
        });
        setTmPairAffinitiesByTm(pairByTm);

        const accByTm = new Map<string, any[]>();
        accommodationRows.forEach((r: any) => {
          if (!accByTm.has(r.tmId)) accByTm.set(r.tmId, []);
          accByTm.get(r.tmId)!.push(r);
        });
        setTmAccommodationsByTm(accByTm);
      } catch (e) {
        console.error("[shiftbuilder] stable data load failed", e);
      }
    })();
  }, [tmCommandEpoch]); // re-run only when operator refreshes roster/config

  // Query-sync side effects — useCurrentNight is the visual source of truth.
  React.useEffect(() => {
    setNightId(currentNight.nightId ?? null);
  }, [currentNight.nightId]);

  React.useEffect(() => {
    if (!currentNight.nightId) {
      setIsCurrentNightLocked(false);
      setCurrentNightStatus(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { getNightMeta } = await import("@/lib/shiftbuilder/data");
        const meta = await getNightMeta(currentNight.nightId!);
        if (!cancelled) {
          setIsCurrentNightLocked(!!meta.isLocked);
          setCurrentNightStatus(meta.status);
        }
      } catch {
        if (!cancelled) {
          setIsCurrentNightLocked(false);
          setCurrentNightStatus(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentNight.nightId]);

  React.useEffect(() => {
    if (notesSaveTimerRef.current) {
      clearTimeout(notesSaveTimerRef.current);
      notesSaveTimerRef.current = null;
    }
    const notesText = currentNight.notes ?? "";
    if (notesRef.current && notesRef.current.innerText !== notesText) {
      notesRef.current.innerText = notesText;
    }
  }, [currentNight.notes, selectedDay.date]);

  const hydratedTasksDayRef = React.useRef<string | null>(null);
  const previousHydratedTasksDayRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const dayKey = formatLocalDateISO(selectedDay.date);
    if (currentNight.isSecondaryLoading) return;
    if (hydratedTasksDayRef.current === dayKey) return;

    const nightTaskRows = currentNight.tasks as NightSlotTask[] | undefined;
    previousHydratedTasksDayRef.current = dayKey;
    hydratedTasksDayRef.current = dayKey;

    if (!nightTaskRows?.length) {
      setSelectedTasks({});
      return;
    }
    const tasksByUiKey: Record<string, NightSlotTask[]> = {};
    nightTaskRows.forEach((row) => {
      const uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);
      if (uiKey.startsWith("UNK:")) {
        if (row.slotType === "overlap" && (row.slotKey === "overlap_pm" || row.slotKey === "overlap_am")) {
          const half = row.slotKey === "overlap_pm" ? "PM" : "AM";
          for (let i = 0; i < 6; i++) {
            (tasksByUiKey[`OL-${half}-${i}`] ??= []).push(row);
          }
          return;
        }
        return;
      }
      (tasksByUiKey[uiKey] ??= []).push(row);
    });
    setSelectedTasks(tasksByUiKey);
  }, [currentNight.isSecondaryLoading, currentNight.tasks, selectedDay.date]);

  React.useEffect(() => {
    const next = effectiveCardBorders;
    setCardBorders((prev) => {
      // Stable source (from useShiftData stabilizers) means ref equality is now
      // meaningful: same content => exact same object. Bail fast with ref check first.
      // Stringify is cheap fallback + safety during optimistic local edits vs server.
      // This (combined with source stabilization) eliminates the max update depth
      // from cardBorders sync effect.
      if (prev === next) return prev;
      if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      return next;
    });
  }, [effectiveCardBorders]);

  React.useEffect(() => {
    // Use stabilized effective* (see useShiftData + bridge above) so that
    // identity only changes on real content mutation. Prevents effect firing
    // + setState on every render from fresh objects coming out of query layer.
    if (effectiveScheduledTmIdsTonight && effectiveScheduledTmIdsTonight.size > 0) {
      setScheduledTmIdsTonight(effectiveScheduledTmIdsTonight);
    }
  }, [effectiveScheduledTmIdsTonight]);

  React.useEffect(() => {
    if (effectiveRecentZoneHistory) {
      setRecentZoneHistory(effectiveRecentZoneHistory);
    }
  }, [effectiveRecentZoneHistory]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { getCallOffsForDate } = await import("@/lib/shiftbuilder/tmCommands");
      const callOffSet = await getCallOffsForDate(selectedDay.date);
      if (!cancelled) setCalledOffIds(callOffSet);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDay.date, sudoDataEpoch]);

  React.useEffect(() => {
    setLoadingAssignments(boardColdLoading);
    loadingAssignmentsRef.current = boardColdLoading;
  }, [boardColdLoading]);

  React.useEffect(() => {
    requestAnimationFrame(recomputeScale);
  }, [effectiveAssignments, selectedDay.date, boardColdLoading]);

  // === Persistence helpers ==================================================
  //
  // Race-free model: every mutator captures `(nightId, selectedDay.date,
  // selectedDay.name)` at the moment the user takes an action, and passes
  // those into the persist helpers. The persist helpers never re-read state.
  // This is the fix for the "clear Z1 on Day A, switch to Day B, wrong day's
  // Z1 gets cleared" bug — that was caused by an async chain re-resolving
  // nightId against state that had moved on.

  // Resolve a writable nightId for the given (date, dayName). Lazily creates
  // the night row (and its parent week) if needed. **Does NOT mutate React
  // state** — the load effect is the only setter of `nightId`. Returns null
  // on failure so callers can surface a toast.
  const resolveNightIdForDate = React.useCallback(
    async (date: Date, dayName: string): Promise<string | null> => {
      try {
        const { getOrCreateNightForDate } = await import("@/lib/shiftbuilder/data");
        return await getOrCreateNightForDate(date, dayName);
      } catch (e) {
        console.error("[shiftbuilder] failed to create night", e);
        return null;
      }
    },
    []
  );

  // Fire-and-forget persist of a single slot assignment.
  //
  // The caller passes `targetNightId` (the nightId captured at action time)
  // plus `captureDate` / `captureDayName` so we can lazy-create the night
  // row if it didn't exist yet — without ever re-reading current state. This
  // means a write fired on Day A will land on Day A even if the user has
  // switched to Day B before the network call resolves.
  const persistAssign = React.useCallback(
    async (
      targetNightId: string | null,
      captureDate: Date,
      captureDayName: string,
      uiKey: string,
      tmId: string | null,
      isLocked = false
    ) => {
      let nid = targetNightId;
      if (!nid) {
        nid = await resolveNightIdForDate(captureDate, captureDayName);
      }
      if (!nid) {
        showToast(`Couldn't save ${uiKey}: no night context yet — try again`);
        return;
      }
      try {
        const { slot_key, slot_type, rr_side } = uiToDb(uiKey);
        const { upsertZoneAssignment } = await import("@/lib/shiftbuilder/data");
        await upsertZoneAssignment({
          nightId: nid,
          slotKey: slot_key,
          slotType: slot_type,
          rrSide: rr_side,
          tmId,
          isLocked,
        });
        setLastSavedAt(new Date());
        const dateKey = formatLocalDateISO(captureDate);
        const qc = currentNight.queryClient;
        if (qc) {
          patchNightCoreAssignmentsCache(
            qc,
            dateKey,
            useShiftBuilderStore.getState().assignments ?? {},
          );
        }
      } catch (e: any) {
        console.error("[shiftbuilder] persist failed for", uiKey, e);
        showToast(`Couldn't save ${uiKey}: ${e?.message ?? "unknown error"}`);
      }
    },
    [resolveNightIdForDate, showToast, setLastSavedAt, currentNight.queryClient]
  );

  const persistLock = React.useCallback(
    async (
      targetNightId: string | null,
      captureDate: Date,
      captureDayName: string,
      uiKey: string,
      nextLocked: boolean
    ) => {
      let nid = targetNightId;
      if (!nid) {
        nid = await resolveNightIdForDate(captureDate, captureDayName);
      }
      if (!nid) {
        showToast(`Couldn't update lock on ${uiKey}: no night context yet`);
        return;
      }
      try {
        const { slot_key, slot_type, rr_side } = uiToDb(uiKey);
        const { toggleAssignmentLock } = await import("@/lib/shiftbuilder/data");
        await toggleAssignmentLock({
          nightId: nid,
          slotKey: slot_key,
          slotType: slot_type,
          rrSide: rr_side,
          currentLocked: !nextLocked, // toggle from the OTHER direction
        });
      } catch (e: any) {
        console.error("[shiftbuilder] lock persist failed for", uiKey, e);
        showToast(`Couldn't update lock on ${uiKey}: ${e?.message ?? "unknown error"}`);
      }
    },
    [resolveNightIdForDate, showToast]
  );

  // === Slot task selector — catalog load + persist helpers ===============

  // One-time catalog load. The catalog is small (dozens of rows) and changes
  // rarely, so we read it once and keep it in component state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getSlotTaskCatalog } = await import("@/lib/shiftbuilder/data");
        const rows = await getSlotTaskCatalog();
        if (!cancelled) setCatalog(rows);
      } catch (e) {
        if (!cancelled) console.error("[shiftbuilder] catalog load failed", e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Flat sorted list of recent task labels — deduplicated, used by MarkerPad chips.
  const recentTasks = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of catalog) {
      if (!seen.has(t.label)) { seen.add(t.label); out.push(t.label); }
      if (out.length >= 12) break;
    }
    return out;
  }, [catalog]);

  // All deployable slot keys (zones + RR sides + aux) — used for placed/total count in top bar
  const allSlotKeys = React.useMemo(() => {
    const keys: string[] = [];
    ZONE_DEFS.forEach(z => keys.push(z.key));
    RR_DEFS.forEach(r => { keys.push(`MRR${r.num}`); keys.push(`WRR${r.num}`); });
    auxDefs.forEach(a => keys.push(a.key));
    return keys;
  }, [auxDefs]);

  const placedCount = allSlotKeys.filter(k => !!assignments[k]?.tmId).length;
  const totalSlots = allSlotKeys.length;

  // Index catalog by `${slotType}:${slotKey}:${rrSide ?? ""}` so the popover
  // can list options for any given card in O(1).
  const catalogIndex = React.useMemo(() => {
    const idx: Record<string, CatalogTask[]> = {};
    for (const t of catalog) {
      const key = `${t.slotType}:${t.slotKey}:${t.rrSide ?? ""}`;
      (idx[key] ??= []).push(t);
    }
    // sort each bucket
    for (const k of Object.keys(idx)) {
      idx[k].sort((a, b) => (a.sortOrder - b.sortOrder) || a.label.localeCompare(b.label));
    }
    return idx;
  }, [catalog]);

  // Race-free add / remove. Same pattern as persistAssign: caller passes the
  // captured nightId + date so the write lands on the night the operator
  // actually clicked from, even if they switch days mid-flight.
  const persistAddTask = React.useCallback(
    async (
      targetNightId: string | null,
      captureDate: Date,
      captureDayName: string,
      uiKey: string,
      catalogTask: CatalogTask
    ) => {
      let nid = targetNightId;
      if (!nid) nid = await resolveNightIdForDate(captureDate, captureDayName);
      if (!nid) {
        showToast(`Couldn't add task: no night context yet — try again`);
        return;
      }
      try {
        const { addNightSlotTask } = await import("@/lib/shiftbuilder/data");
        const { slot_key, slot_type, rr_side } = uiToDb(uiKey);
        await addNightSlotTask({
          nightId: nid,
          slotKey: slot_key,
          slotType: slot_type,
          rrSide: rr_side,
          taskLabel: catalogTask.label,
          catalogTaskId: catalogTask.id,
          sortOrder: catalogTask.sortOrder,
        });
        const dateKey = formatLocalDateISO(captureDate);
        const qc = currentNight.queryClient;
        if (qc) {
          const { getNightSlotTasks } = await import("@/lib/shiftbuilder/data");
          const fresh = await getNightSlotTasks(nid);
          patchNightSecondaryTasksCache(qc, dateKey, fresh);
        }
        logBuilderChange({
          action: "task_add",
          slotKey: uiKey,
          targetNightId: nid,
          payload: {
            taskLabel: catalogTask.label,
            catalogTaskId: catalogTask.id,
          },
        });
      } catch (e: any) {
        console.error("[shiftbuilder] add task failed for", uiKey, e);
        showToast(`Couldn't add task: ${e?.message ?? "unknown error"}`);
      }
    },
    [resolveNightIdForDate, showToast, currentNight.queryClient, logBuilderChange]
  );

  const mapNightTasksToUiKeys = React.useCallback((rows: NightSlotTask[]) => {
    const tasksByUiKey: Record<string, NightSlotTask[]> = {};
    rows.forEach((row) => {
      const uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);
      if (uiKey.startsWith("UNK:")) {
        if (row.slotType === "overlap" && (row.slotKey === "overlap_pm" || row.slotKey === "overlap_am")) {
          const half = row.slotKey === "overlap_pm" ? "PM" : "AM";
          for (let i = 0; i < 6; i++) {
            (tasksByUiKey[`OL-${half}-${i}`] ??= []).push(row);
          }
        }
        return;
      }
      (tasksByUiKey[uiKey] ??= []).push(row);
    });
    return tasksByUiKey;
  }, []);

  const handleCopyPriorWeekSameDayTasks = React.useCallback(async () => {
    if (isCurrentNightLocked) {
      showToast("This day is locked — cannot copy tasks", "error");
      return;
    }

    const captureDate = selectedDay.date;
    const captureDayName = selectedDay.name;
    const priorDate = addDays(captureDate, -7);
    const priorDateLabel = formatLocalDateISO(priorDate);
    const existingCount = Object.values(selectedTasks).reduce(
      (sum, rows) => sum + rows.length,
      0,
    );
    const confirmMsg =
      existingCount > 0
        ? `Copy tasks from ${priorDateLabel} (last week's ${captureDayName})? This replaces all ${existingCount} task(s) on tonight's board.`
        : `Copy tasks from ${priorDateLabel} (last week's ${captureDayName})?`;
    if (!confirm(confirmMsg)) return;

    try {
      const { copyNightSlotTasksFromPriorWeekSameDay, getNightSlotTasks } =
        await import("@/lib/shiftbuilder/data");
      const result = await copyNightSlotTasksFromPriorWeekSameDay(
        captureDate,
        captureDayName,
      );

      if (result.targetNightId && result.targetNightId !== nightId) {
        setNightId(result.targetNightId);
      }

      const fresh = await getNightSlotTasks(result.targetNightId);
      const dateKey = formatLocalDateISO(captureDate);
      if (currentNight.queryClient) {
        patchNightSecondaryTasksCache(currentNight.queryClient, dateKey, fresh);
      }

      setSelectedTasks(mapNightTasksToUiKeys(fresh));
      hydratedTasksDayRef.current = dateKey;

      const sweeperNote =
        result.excludedSweepers > 0
          ? ` (${result.excludedSweepers} sweeper task${result.excludedSweepers === 1 ? "" : "s"} skipped)`
          : "";
      showToast(
        `Copied ${result.copied} task${result.copied === 1 ? "" : "s"} from last week's ${captureDayName}${sweeperNote}`,
        "success",
      );
    } catch (e: unknown) {
      console.error("[shiftbuilder] copy prior week tasks failed", e);
      const msg = e instanceof Error ? e.message : "Failed to copy tasks";
      showToast(msg, "error");
    }
  }, [
    isCurrentNightLocked,
    selectedDay.date,
    selectedDay.name,
    selectedTasks,
    nightId,
    showToast,
    currentNight.queryClient,
    mapNightTasksToUiKeys,
  ]);

  const persistRemoveTask = React.useCallback(
    async (
      targetNightId: string | null,
      captureDate: Date,
      captureDayName: string,
      uiKey: string,
      taskLabel: string
    ) => {
      let nid = targetNightId;
      if (!nid) nid = await resolveNightIdForDate(captureDate, captureDayName);
      if (!nid) {
        showToast(`Couldn't remove task: no night context yet`);
        return;
      }
      try {
        const { removeNightSlotTask } = await import("@/lib/shiftbuilder/data");
        const { slot_key, slot_type, rr_side } = uiToDb(uiKey);
        await removeNightSlotTask({
          nightId: nid,
          slotKey: slot_key,
          slotType: slot_type,
          rrSide: rr_side,
          taskLabel,
        });
        const dateKey = formatLocalDateISO(captureDate);
        const qc = currentNight.queryClient;
        if (qc) {
          const { getNightSlotTasks } = await import("@/lib/shiftbuilder/data");
          const fresh = await getNightSlotTasks(nid);
          patchNightSecondaryTasksCache(qc, dateKey, fresh);
        }
        logBuilderChange({
          action: "task_remove",
          slotKey: uiKey,
          targetNightId: nid,
          payload: { taskLabel },
        });
      } catch (e: any) {
        console.error("[shiftbuilder] remove task failed for", uiKey, e);
        showToast(`Couldn't remove task: ${e?.message ?? "unknown error"}`);
      }
    },
    [resolveNightIdForDate, showToast, currentNight.queryClient, logBuilderChange]
  );

  // Optimistic toggle. Local state updates immediately; persist is fire-and-
  // forget with the captured night context (same race-free pattern as
  // assignments).
  const toggleTaskForSlot = React.useCallback(
    (uiKey: string, catalogTask: CatalogTask) => {
      const targetNightId = nightId;
      const captureDate = selectedDay.date;
      const captureDayName = selectedDay.name;

      setSelectedTasks((prev) => {
        const existing = prev[uiKey] ?? [];
        const already = existing.find((t) => t.taskLabel === catalogTask.label);
        if (already) {
          // Remove
          const next = existing.filter((t) => t.taskLabel !== catalogTask.label);
          persistRemoveTask(targetNightId, captureDate, captureDayName, uiKey, catalogTask.label);
          return { ...prev, [uiKey]: next };
        }
        // Add — synthesize an optimistic row so the UI updates immediately.
        const optimistic: NightSlotTask = {
          id: `optimistic-${catalogTask.id}-${Date.now()}`,
          nightId: targetNightId ?? "",
          slotKey: catalogTask.slotKey,
          slotType: catalogTask.slotType,
          rrSide: catalogTask.rrSide,
          taskLabel: catalogTask.label,
          catalogTaskId: catalogTask.id,
          sortOrder: catalogTask.sortOrder,
          color: null,
          isCoverage: false,
        };
        persistAddTask(targetNightId, captureDate, captureDayName, uiKey, catalogTask);
        return { ...prev, [uiKey]: [...existing, optimistic] };
      });
    },
    [nightId, selectedDay.date, selectedDay.name, persistAddTask, persistRemoveTask]
  );

  // Direct "X" delete from task list on cards (hover affordance).
  // Optimistic UI update + reuse the existing persistRemoveTask helper.
  const handleRemoveTask = React.useCallback(
    (uiKey: string, taskLabel: string) => {
      const targetNightId = nightId;
      const captureDate = selectedDay.date;
      const captureDayName = selectedDay.name;

      // Optimistic removal from local state for instant feedback
      setSelectedTasks((prev) => {
        const existing = prev[uiKey] || [];
        const next = existing.filter((t) => t.taskLabel !== taskLabel);
        return { ...prev, [uiKey]: next };
      });

      persistRemoveTask(targetNightId, captureDate, captureDayName, uiKey, taskLabel);
    },
    [nightId, selectedDay.date, selectedDay.name, persistRemoveTask]
  );

  // Per-task color sphere — optimistic + persist
  const handleSetTaskColor = React.useCallback(
    (uiKey: string, taskLabel: string, color: string | null) => {
      const targetNightId = nightId;
      const captureDate = selectedDay.date;
      const captureDayName = selectedDay.name;

      const { slot_key, rr_side } = uiToDb(uiKey);

      // Optimistic update
      setSelectedTasks((prev) => {
        const existing = prev[uiKey] || [];
        const next = existing.map((t) =>
          t.taskLabel === taskLabel ? { ...t, color } : t
        );
        return { ...prev, [uiKey]: next };
      });

      logBuilderChange({
        action: "task_color",
        slotKey: uiKey,
        targetNightId,
        payload: { taskLabel, color },
      });

      // Persist to Supabase (use normalized db keys)
      import("@/lib/shiftbuilder/data").then(({ updateNightSlotTaskColor }) =>
        (updateNightSlotTaskColor as any)(targetNightId, slot_key, taskLabel, color, rr_side).catch((err: unknown) => {
          console.error('[ShiftBuilder] Failed to set task color:', err);
        })
      );
    },
    [nightId, selectedDay.date, selectedDay.name, logBuilderChange]
  );

  // Edit / rename an existing task label (inline edit)
  const handleEditTask = React.useCallback(
    (uiKey: string, oldLabel: string, newLabel: string) => {
      const targetNightId = nightId;

      const trimmed = newLabel.trim();
      if (!trimmed || trimmed === oldLabel) return;

      // Optimistic update — replace the label on the matching task
      setSelectedTasks((prev) => {
        const existing = prev[uiKey] || [];
        const next = existing.map((t) =>
          t.taskLabel === oldLabel ? { ...t, taskLabel: trimmed } : t
        );
        return { ...prev, [uiKey]: next };
      });

      const { slot_key, rr_side } = uiToDb(uiKey);
      import("@/lib/shiftbuilder/data").then(({ updateNightSlotTaskLabel }) =>
        (updateNightSlotTaskLabel as any)(targetNightId, slot_key, oldLabel, trimmed, rr_side).catch((err: unknown) => {
          console.error('[ShiftBuilder] Failed to edit task label:', err);
        })
      );
    },
    [nightId]
  );

  // Operator-authored custom task: insert into the catalog AND select it for
  // this night. Future popovers will show it as a normal catalog option.
  // If the catalog insert fails (other than the duplicate case which is
  // handled inside addSlotCatalogTask), we surface the toast and bail.
  const addCustomTaskForSlot = React.useCallback(
    async (uiKey: string, label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const targetNightId = nightId;
      const captureDate = selectedDay.date;
      const captureDayName = selectedDay.name;
      let dbKey: { slot_key: string; slot_type: SlotType; rr_side: 'mens' | 'womens' | null };
      try { dbKey = uiToDb(uiKey) as any; }
      catch (e: any) {
        showToast(`Couldn't add task: unknown slot ${uiKey}`);
        return;
      }
      try {
        const { addSlotCatalogTask } = await import("@/lib/shiftbuilder/data");
        const created = await addSlotCatalogTask({
          slotKey: dbKey.slot_key,
          slotType: dbKey.slot_type,
          rrSide: dbKey.rr_side,
          label: trimmed,
        });
        if (!created) return;
        // Append to local catalog so the popover sees it immediately. The
        // catalogIndex memo will rebuild on the next render.
        setCatalog((prev) => {
          if (prev.some((c) => c.id === created.id)) return prev;
          return [...prev, created];
        });
        // Auto-select for this night.
        toggleTaskForSlot(uiKey, created);
      } catch (e: any) {
        console.error("[shiftbuilder] addCustomTaskForSlot failed", e);
        showToast(`Couldn't add task: ${e?.message ?? "unknown error"}`);
      }
    },
    [nightId, selectedDay.date, selectedDay.name, showToast, toggleTaskForSlot]
  );

  // === Stable board callbacks (Phase 2 board isolation) ===
  // These are passed to the isolated ShiftBuilderBoard so it never captures
  // the giant parent scope. Day changes go through startTransition.
  const handleBoardDayPill = React.useCallback((idx: number) => {
    if (idx === selectedDayIndex) return;

    // === Phase 3.1 / 3.5 Measurement Point (board-internal week pills) ===
    if (typeof performance !== 'undefined' && performance.mark) {
      performance.mark('day-switch-start', { detail: { dayIndex: idx, source: 'board-week-pill' } });
    }

    const prefersReduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      setSelectedDayIndex(idx);
      return;
    }
    startDayTransition(() => setSelectedDayIndex(idx));
  }, [selectedDayIndex, startDayTransition]);

  const handleBoardBreakGroupChange = React.useCallback((g: ActiveBreakGroupFilter) => {
    setBreakGroup(g);
  }, []);

  const handlePadAssign = React.useCallback((slotKey: string, tmId: string, tmName: string) => {
    assign(slotKey, tmId, tmName);
  }, [assign]);

  const handlePadToggleLock = React.useCallback((slotKey: string) => {
    toggleLock(slotKey);
  }, [toggleLock]);

  const handlePadClearSlot = React.useCallback((slotKey: string) => {
    // Prefer the live optimistic path (updates TanStack Query cache + liveAssignmentsStore
    // + the main useShiftBuilderStore that the isolated board + cards subscribe to via
    // useAssignments()). This is the only way the removal is visible on regular Zone cards
    // (Z1-Z10 including Z9) because they have no header × — clearing happens via the
    // MarkerPad "Clear" footer button.
    //
    // The legacy `unassign` only touches the old local `assignments` state (plus DB via
    // persistAssign) and the board never sees it.
    // Aux cards (Z9SR etc.) have their own header × wired to onLiveUnassign and worked.

    // === TEMPORARY TARGETED DIAGNOSTIC for "only Jared on 2026-06-01 Z9 cannot clear" ===
    const isProblemDate = selectedDay.date.toISOString().slice(0, 10) === "2026-06-01";
    const isZ9 = slotKey === "Z9";
    if (isProblemDate && isZ9) {
      const currentAssignment = padAssignments?.[slotKey] || assignments[slotKey];
      console.log('%c[DEBUG] Clear attempt on problematic assignment (2026-06-01 Z9)', 'color: orange; font-weight: bold', {
        slotKey,
        currentAssignment,
        isLocked: currentAssignment?.isLocked,
        tmId: currentAssignment?.tmId,
        tmName: currentAssignment?.tmName,
        queryNightId,
        legacyNightId: nightId,
        liveUnassignAvailable: !!live?.unassign,
        dateKey: "2026-06-01",
      });
    }

    const prevAssignment = padAssignments[slotKey] ?? assignments[slotKey];
    const reliableNightId = queryNightId || nightId;
    if (live?.unassign) {
      live.unassign(slotKey, {
        captureDate: selectedDay.date,
        captureDayName: selectedDay.name,
        targetNightId: reliableNightId,
        isDraftMode,
      });
      logBuilderChange({
        action: "unassign",
        slotKey,
        targetNightId: reliableNightId,
        previousTmId: prevAssignment?.tmId ?? null,
        previousTmName: prevAssignment?.tmName ?? null,
      });
    } else {
      unassign(slotKey);
    }
    setSelectedSlotKey(null);
  }, [live, unassign, queryNightId, nightId, isDraftMode, selectedDay, assignments, padAssignments, logBuilderChange]);

  const handleClearBoard = React.useCallback(() => {
    if (!requireEdit()) return;
    if (isCurrentNightLocked) {
      showToast("This day is locked — changes are disabled", "error");
      return;
    }

    const slotKeys = collectDeploymentSlotKeys(auxDefs);
    const clearable: string[] = [];
    let lockedCount = 0;

    for (const slotKey of slotKeys) {
      const row = padAssignments[slotKey];
      if (!row?.tmId && !row?.tmName) continue;
      if (row.isLocked) {
        lockedCount += 1;
        continue;
      }
      if (/^RR\d+$/.test(slotKey)) continue;
      clearable.push(slotKey);
    }

    if (clearable.length === 0) {
      if (isDraftMode) {
        if (confirm("Discard the engine draft?")) {
          setIsDraftMode(false);
          setDraftAssignments({});
          showToast("Draft discarded", "info");
        }
        return;
      }
      showToast(
        lockedCount > 0
          ? "No clearable assignments — remaining slots are locked"
          : "Board is already empty",
        "info",
      );
      return;
    }

    const confirmMsg =
      lockedCount > 0
        ? `Clear ${clearable.length} assignment(s) on tonight's board? ${lockedCount} locked slot(s) will be kept.`
        : `Clear all ${clearable.length} assignment(s) on tonight's board?`;
    if (!confirm(confirmMsg)) return;

    if (isDraftMode) {
      setIsDraftMode(false);
      setDraftAssignments({});
    }

    const before = getCurrentSnapshot();
    const reliableNightId = queryNightId || nightId;
    const captureDate = selectedDay.date;
    const captureDayName = selectedDay.name;

    for (const slotKey of clearable) {
      const prevAssignment = padAssignments[slotKey];
      if (live?.unassign) {
        live.unassign(slotKey, {
          captureDate,
          captureDayName,
          targetNightId: reliableNightId,
          isDraftMode: false,
        });
        logBuilderChange({
          action: "unassign",
          slotKey,
          targetNightId: reliableNightId,
          previousTmId: prevAssignment?.tmId ?? null,
          previousTmName: prevAssignment?.tmName ?? null,
          payload: { bulkClear: true },
        });
      } else {
        unassign(slotKey);
      }
    }

    window.setTimeout(() => {
      recordChangeRef.current("Clear board", before, getCurrentSnapshot());
    }, 120);

    setSelectedSlotKey(null);
    showToast(`Cleared ${clearable.length} slot(s)`, "success");
  }, [
    requireEdit,
    isCurrentNightLocked,
    auxDefs,
    padAssignments,
    isDraftMode,
    getCurrentSnapshot,
    queryNightId,
    nightId,
    selectedDay,
    live,
    unassign,
    showToast,
    logBuilderChange,
  ]);

  const handlePadAddCoverage = React.useCallback(async (sourceKey: string, targetKey: string) => {
    await handleCmdkAddCoverage(sourceKey, targetKey);
  }, [handleCmdkAddCoverage]);

  const handleBoardRemoveTask = React.useCallback((slotKey: string, taskId: string) => {
    handleRemoveTask(slotKey, taskId);
  }, [handleRemoveTask]);

  const handleBoardSetTaskColor = React.useCallback((slotKey: string, taskId: string, color: string) => {
    handleSetTaskColor(slotKey, taskId, color);
  }, [handleSetTaskColor]);

  const handleBoardEditTask = React.useCallback((slotKey: string, taskId: string, newLabel: string) => {
    handleEditTask(slotKey, taskId, newLabel);
  }, [handleEditTask]);

  const handleBoardLiveAssign = React.useCallback((uiKey: string, tmId: string, tmName: string) => {
    if (/^RR\d+$/.test(uiKey)) {
      console.warn('[shiftbuilder] live assign physical RR blocked');
      return;
    }
    // Always prefer the reliable modern source from useCurrentNight (the legacy [nightId] useState can be null on some paths)
    const reliableNightId = queryNightId || nightId;
    live?.assign?.(uiKey, tmId, tmName, {
      captureDate: selectedDay.date,
      captureDayName: selectedDay.name,
      targetNightId: reliableNightId,
      isDraftMode,
    });
  }, [live, selectedDay.date, selectedDay.name, queryNightId, nightId, isDraftMode]);

  const handleBoardLiveUnassign = React.useCallback((uiKey: string) => {
    if (/^RR\d+$/.test(uiKey)) {
      console.warn('[shiftbuilder] live unassign physical RR blocked');
      return;
    }
    const reliableNightId = queryNightId || nightId;
    live?.unassign?.(uiKey, {
      captureDate: selectedDay.date,
      captureDayName: selectedDay.name,
      targetNightId: reliableNightId,
      isDraftMode,
    });
  }, [live, selectedDay.date, selectedDay.name, queryNightId, nightId, isDraftMode]);

  // Marker pad engine insight handler.
  // Accepts optional context (rationale, fairnessSignals, recentPlacements, rrSide) from the unilateral pad
  // and calls the specialized getEngineInsightForPlacement for a retrospective explanation
  // (why this placement, referencing Rot/Aff/Load + history) instead of generic suggestions.
  const handleBoardRequestEngineInsight = React.useCallback(async (slotKey: string, sideKeyOrContext?: string | any) => {
    let effectiveKey = slotKey;
    let sideKey: string | undefined;
    let extra: any = {};

    if (typeof sideKeyOrContext === 'string') {
      sideKey = sideKeyOrContext;
      effectiveKey = sideKey;
    } else if (sideKeyOrContext && typeof sideKeyOrContext === 'object') {
      extra = sideKeyOrContext;
    }

    const storeAssignments = useShiftBuilderStore.getState().assignments || {};
    const a = storeAssignments[effectiveKey] || {};
    const prov = a.provenance || {};
    const tmName = a.tmName || extra.tmName || "the assigned TM";

    const insightContext = {
      slotKey: effectiveKey,
      tmName,
      rationale: extra.rationale ?? prov.rationale,
      fairnessSignals: extra.fairnessSignals ?? prov.fairnessSignals,
      recentPlacements: extra.recentPlacements,
      isRR: effectiveKey.startsWith('MRR') || effectiveKey.startsWith('WRR'),
      rrSide: extra.rrSide || (effectiveKey.startsWith('M') ? 'mens' : effectiveKey.startsWith('W') ? 'womens' : null),
      tmAttributes: extra.tmAttributes,
      priorGoodExamples: extra.priorGoodExamples,
      slotSpecificHistory: extra.slotSpecificHistory,
      currentContext: extra.currentContext,
      suggestedCandidates: extra.suggestedCandidates,
      filledSlotKeys: Object.entries(storeAssignments)
        .filter(([, row]) => !!(row as { tmId?: string })?.tmId)
        .map(([key]) => key),
      emptySlotKeys: Object.entries(storeAssignments)
        .filter(([, row]) => !(row as { tmId?: string })?.tmId)
        .map(([key]) => key),
    };

    try {
      const { postEngineInsight } = await import("@/app/shiftbuilder/lib/engineInsightClient");
      const result = await postEngineInsight(insightContext);
      // Only track usage for non-cached calls (actual token spend) to session + monthly 30d tracker
      if (result && !result.cached && result.usage) {
        try {
          useShiftBuilderStore.getState().addAiUsage({
            inputTokens: result.usage.inputTokens,
            outputTokens: result.usage.outputTokens,
            model: result.usage.model,
            reasoningEffort: result.usage.reasoningEffort,
          });
          updateOpsStatusBarContent?.();
        } catch {}
      }
      return result.text ?? "";
    } catch (e) {
      console.warn("[placement pad] engine insight failed", e);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("XAI_API_KEY") || msg.includes("not configured")) {
        return "xAI is not configured on the server (XAI_API_KEY). Rotation highlights above are still live.";
      }
      return `Deeper xAI insight failed: ${msg}. Use the rotation highlights and engine rationale above.`;
    }
  }, []);

  /** Rotation health + xAI advisor entry point.
   *  Builds a compact week context (health snapshot + violations list from the stable full-week recent history +
   *  a short plan summary) and calls the weekAdvisor path in postEngineInsight.
   *  The returned analysis is surfaced via the ProvenanceGlass (keyed as week-advisor) or a toast fallback.
   *  This is the main "give us a breakdown of what could be moved where and why to make the rotation health higher".
   */
  const handleRequestRotationAdvisor = React.useCallback(
    async (opts?: { tmId?: string; slotKey?: string; focusWeek?: boolean }) => {
      const hist = plannedThisWeekRecentHistory;
      const viols: WeekRepeatViolation[] = getWeekRepeatViolations(hist);

      // Build a reliable tmId → display name map from the week data the operator is actually looking at.
      // This is critical: the advisor (and local suggestions) must emit human names ("Sheri O", "Jared", etc.)
      // and never raw "tm_xxx" identifiers. This follows the long-standing naming rules for cards, weekly overview, pad, matrix, etc.
      const tmNameById: Record<string, string> = {};
      const add = (id?: any, name?: any) => { if (id && name) tmNameById[String(id)] = String(name); };

      // Primary source when the user is on the WEEK BUILDER sheet or has the weekly overview data loaded.
      (weekOverviewNights || []).forEach((night: any) => {
        const ass = night?.assignments || {};
        Object.values(ass).forEach((row: any) => add(row?.tmId, row?.tmName || row?.display_name || row?.name));
      });

      // Current selected day's live assignments (optimistic layer).
      Object.values(assignments || {}).forEach((row: any) => add((row as any)?.tmId, (row as any)?.tmName));

      // Also walk the live store for any other days in the week (defensive).
      try {
        const storeState = (typeof liveAssignmentsStore !== 'undefined' ? liveAssignmentsStore.getState() : null) as any;
        if (storeState?.assignmentsByNight) {
          Object.values(storeState.assignmentsByNight).forEach((nightAss: any) => {
            if (nightAss && typeof nightAss === 'object') {
              Object.values(nightAss).forEach((row: any) => add((row as any)?.tmId, (row as any)?.tmName));
            }
          });
        }
      } catch {}

      // Compute a fresh health snapshot using the same full-week source the rest of the UI sees.
      const healthSnap = computeShiftRotationHealth(auxDefsForFit, storeAssignmentsForFit, deploymentFitBySlot, {
        isDraftMode,
        draftAssignments,
        weeklyRecentHistory: hist,
        weekDailyHealths, // complete per-day healths (proxies + rich) for true stable week mean
      });

      // Compact plan summary for the prompt (repeat offenders + rough per-slot counts this week).
      // Only relevant deployment slots (no overlaps, no admin) for the rotation advisor context.
      let weekPlanSummary = "";
      try {
        const bySlot: Record<string, number> = {};
        for (const [, recs] of hist.entries()) {
          for (const r of recs) {
            if (!shouldShowPlacementFitChip(r.slotKey)) continue;
            bySlot[r.slotKey] = (bySlot[r.slotKey] || 0) + 1;
          }
        }
        const top = Object.entries(bySlot).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, c]) => `${k}:${c}`).join(" ");
        const violSummary = viols.slice(0, 3).map((v) => {
          const nm = tmNameById[v.tmId] || v.tmId;
          return `${nm}@${v.slotKey}×${v.count}`;
        }).join("; ");
        weekPlanSummary = `Top loads: ${top || "—"}. Repeats: ${violSummary || "none"}.`;
      } catch {}

      // Local deterministic suggestions (instant, free) — we can surface these immediately while xAI thinks.
      // Pass a real name resolver so the returned suggestion objects carry .tmName.
      const localSuggestions = suggestLocalRotationMoves(viols, hist, auxDefsForFit, (tid) => tmNameById[tid]);

      // Build a clean local message. Avoid prepending "Asking xAI..." when there are no relevant violations
      // (the result will be the direct "no moves needed" or confirmation, which now aligns with the health numbers
      // since both health penalty and the violations list are computed only over main deployment slots).
      let localText = "";
      if (localSuggestions.length > 0) {
        localText = `Local suggestions (instant):\n${localSuggestions.map((s, i) => {
          const fromName = (s.from as any).tmName || s.from.tmId;
          const swap = (s.to as any).viaSwapWith;
          const swapName = swap ? (swap.tmName || swap.tmId) : null;
          const toPart = swapName ? `${s.to.slotKey} (swap with ${swapName})` : s.to.slotKey;
          return `${i + 1}. ${fromName} ${s.from.slotKey} → ${toPart} — ${s.reason}`;
        }).join("\n")}\n\n`;
      } else if (viols.length === 0) {
        const bal = (healthSnap as any).weeklyBalance ?? healthSnap.weeklyBalance;
        const maxR = (healthSnap as any).maxWeeklyRepeat ?? 0;
        const vN = (healthSnap as any).repeatViolations ?? 0;
        if (bal == null || bal >= 100 || vN === 0) {
          localText = "No high-impact single swaps available on main slots. Weekly rotation balance is strong. Full xAI plan may still surface optimization opportunities.\n\n";
        } else {
          localText = `No high-impact single swaps on main slots, but weeklyBalance is ${bal}%. Full rotation plan recommended.\n\n`;
        }
      } else {
        localText = "Asking xAI for ranked plan...\n\n";
      }

      // Prime synchronously with local suggestions + loading note so the glass shows *something* immediately.
      setWeekAdvisorText(localText);
      setProvenanceKey("week-rotation-advisor");

      try {
        const { postEngineInsight } = await import("@/app/shiftbuilder/lib/engineInsightClient");
        const result = await postEngineInsight({
          slotKey: opts?.slotKey || "WEEK-OVERVIEW",
          tmName: opts?.tmId ? `TM ${opts.tmId}` : "Week plan",
          weekAdvisor: true,
          rotationHealthSnapshot: {
            percent: healthSnap.percent,
            weeklyBalance: (healthSnap as any).weeklyBalance,
            maxWeeklyRepeat: (healthSnap as any).maxWeeklyRepeat,
            repeatViolations: (healthSnap as any).repeatViolations,
            xaiRepeatPenaltyReduction: (healthSnap as any).xaiRepeatPenaltyReduction,
          },
          violations: viols.map((v) => ({
            ...v,
            tmName: tmNameById[v.tmId] || (v as any).tmName || v.tmId,
          })),
          tmNames: tmNameById,
          weekPlanSummary,
          focusTmId: opts?.tmId,
          focusSlotKey: opts?.slotKey,
        });

        if (result && !result.cached && result.usage) {
          try {
            useShiftBuilderStore.getState().addAiUsage(result.usage as any);
            updateOpsStatusBarContent?.();
          } catch {}
        }

        // Update the text state — this will cause the glass (which is already mounted because we set the key above)
        // to re-render with the full local + xAI content. Setting the key again is harmless but not required.
        const advisorPart = result?.text || (viols.length === 0 ? "" : "xAI analysis unavailable.");
        const fullText = (localText + advisorPart).trim() || "No week rotation analysis available.";
        setWeekAdvisorText(fullText);
        // Keep (or re-assert) the key so the glass stays open.
        setProvenanceKey("week-rotation-advisor");
      } catch (e: any) {
        const msg = e?.message || String(e);
        const fallback = localText + (localText ? "\n\n" : "") + "(xAI advisor unavailable: " + msg + " — use the local suggestions or the WEEK BUILDER table / pad matrix to inspect repeats. The violations list in rotation health shows exactly what is costing the weeklyBalance points for the main deployment areas.)";
        setWeekAdvisorText(fallback);
        setProvenanceKey("week-rotation-advisor");
      }
    },
    [plannedThisWeekRecentHistory, auxDefsForFit, storeAssignmentsForFit, deploymentFitBySlot, isDraftMode, draftAssignments, assignments, weekOverviewNights],
  );

  /** WeekLens v2 conservative one-click apply for rotation suggestions.
   *  Only operates on relevant slots (via shouldShowPlacementFitChip in the suggestion source).
   *  Starts with simple "move TM to a fresh slot in family on one of the viol nights".
   *  Uses live store for the specific night + history recording so it is undoable and updates health immediately.
   *  Bilateral swaps and complex cases are intentionally left to the pad + main board for safety in v1.
   */
  const applyWeekLensMove = React.useCallback(async (sugg: any) => {
    if (!sugg || !sugg.from || !sugg.to) return;

    const fromTmId = sugg.from.tmId;
    const fromSlot = sugg.from.slotKey;
    const toSlot = sugg.to.slotKey;
    const fromName = sugg.from.tmName || fromTmId;

    if (!fromTmId || !fromSlot || !toSlot) return;

    try {
      // Resolve the target night for the move.
      // Prefer explicit nightDate on the suggestion (from suggestLocalRotationMoves), else find the first
      // night in weekOverviewNights where this TM is currently on the from slot.
      let targetDayIndex: number | null = null;
      let targetDate: Date | null = null;

      if (sugg.from.nightDate) {
        // Find the DAY_DEFS entry whose formatted date matches the ISO in the suggestion
        for (let i = 0; i < DAY_DEFS.length; i++) {
          if (formatLocalDateISO(DAY_DEFS[i].date) === sugg.from.nightDate) {
            targetDayIndex = i;
            targetDate = DAY_DEFS[i].date;
            break;
          }
        }
      }

      if (targetDayIndex == null) {
        // Fallback: scan the week data for the first occurrence of this (tm, fromSlot)
        for (const n of (weekOverviewNights || [])) {
          const a = n.assignments?.[fromSlot];
          if (a?.tmId === fromTmId) {
            targetDayIndex = n.dayIndex;
            targetDate = DAY_DEFS[n.dayIndex]?.date ?? null;
            break;
          }
        }
      }

      if (targetDayIndex == null || !targetDate) {
        console.warn('[WeekLens] could not resolve night for move', sugg);
        return;
      }

      const dateKey = formatLocalDateISO(targetDate);

      // Read the current (optimistic + live) assignments for exactly that night
      const store = liveAssignmentsStore.getState();
      const currentNightAss = { ...(store.assignmentsByNight[dateKey] || {}) };

      // Perform the conservative move:
      // - Clear the from slot (unassign)
      // - Place the TM on the to slot (assign). If 'to' was occupied we overwrite for this simple path
      //   (real bilateral swap cases are left to the advisor text or pad).
      if (currentNightAss[fromSlot]) {
        delete currentNightAss[fromSlot]; // or set to null if the store expects explicit nulls
      }

      currentNightAss[toSlot] = {
        tmId: fromTmId,
        tmName: fromName,
        // breakGroup left undefined; normal board flow will handle if needed
      } as any;

      // Write back — this is the same primitive used by all live assign paths.
      // The store subscription + liveAssignVersion bump will cause weekOverviewNights,
      // plannedThisWeekRecentHistory, the table, health, and sidebar to refresh.
      store.setAssignmentsForNight(dateKey, currentNightAss);

      // Record a lightweight history entry if the mechanism is available (best effort)
      try {
        // shiftHistory is in scope in Client; recordChange is the recorder.
        // We do a minimal description so undo works at the board level.
        // (If this throws it's non-fatal — the store update is the source of truth.)
        // @ts-ignore - shiftHistory may have recordChange
        if (typeof (window as any).__shiftHistoryRecord === 'function') {
          (window as any).__shiftHistoryRecord(`WeekLens move: ${fromName} ${fromSlot} → ${toSlot}`);
        }
      } catch {}

      // Refresh the advisor glass + local suggestions list immediately so the UI reflects the change.
      void handleRequestRotationAdvisor({ focusWeek: true });

      // Optional: if the user had a pad open for one of the affected slots, it will pick up the live change.
      console.log('[WeekLens] applied move', fromName, fromSlot, '→', toSlot, 'on', dateKey);
    } catch (e) {
      console.warn('[WeekLens] apply failed', e);
    }
  }, [handleRequestRotationAdvisor, weekOverviewNights, DAY_DEFS, formatLocalDateISO]);

  return (
    <div
      className="sb-builder-shell h-screen flex flex-col text-[#1C1C1E] dark:text-[#F2F2F4] overflow-hidden relative"
      style={{
        "--stage-accent": selectedDay?.color ?? "var(--sb-gold)",
        "--sb-builder-canvas-max": `${BUILDER_CANVAS_MAX_WIDTH_PX}px`,
      } as React.CSSProperties}
    >
      {/* ═══════════════════════════════════════════════════════════
          Floating Nav (Framer Motion + CVA)
          Glassmorphic bar with premium date selector transition.
          All other controls preserved visually.
          ═══════════════════════════════════════════════════════════ */}
      <FloatingNav
        contentMaxWidth={isBuilderLiveCanvas ? BUILDER_CANVAS_MAX_WIDTH_PX : undefined}
        days={NAV_DAY_STRIP.map((d) => ({
          id: d.navId,
          label: String(d.dateNum),
          shortLabel: d.shortLabel,
          weekdayShort: d.weekdayShort,
          dayLetter: d.dayLetter,
          isBridge: !!d.bridge,
          dateNum: d.dateNum,
          isToday: d.isToday,
          date: d.date,
          color:
            d.weekIndex != null && DAY_DEFS[d.weekIndex]
              ? DAY_DEFS[d.weekIndex].color
              : undefined,
        }))}
        selectedDayId={navIdForWeekDay(selectedDayIndex)}
        onDaySelect={(id, date) => {
          const item = NAV_DAY_STRIP.find((d) => d.navId === id);
          if (!item) return;
          if (
            item.weekIndex != null &&
            item.weekIndex === selectedDayIndex &&
            !item.bridge
          ) {
            return;
          }

          if (typeof performance !== "undefined" && performance.mark) {
            performance.mark("day-switch-start", {
              detail: { navId: id, date: date.toISOString().slice(0, 10) },
            });
          }

          currentNight.prefetchNight(date);

          const apply = () => handleNavDaySelect(id, date);
          const prefersReduced =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
          if (prefersReduced) {
            apply();
            return;
          }
          startDayTransition(apply);
        }}
        onDayHover={(id, date) => {
          // Aggressive hover prefetch — this is the key to making day switches feel instant
          currentNight.prefetchNight(date);
        }}
        currentView={currentView}
        onViewChange={setCurrentView}
        onToday={() => {
          const today = currentShiftDate();
          const newWeek = startOfShiftWeek(today);
          const idx = Math.max(0, Math.min(6, daysBetween(newWeek, today)));
          setWeekStart(newWeek);
          setSelectedDayIndex(idx);
        }}
        onLaunchpad={viewMode === "canvas" ? handleBackToLaunchpad : undefined}
        onPrevWeek={goPrevWeek}
        onNextWeek={goNextWeek}
        onCopyPriorWeekTasks={handleCopyPriorWeekSameDayTasks}
        onToggleWeekHealth={
          viewMode === "canvas" ? handleToggleWeekHealthTracker : undefined
        }
        weekHealthVisible={!isWeekHealthTrackerDismissed}
        weekHealthPercent={weekAverageHealth}
        weekHealthLoading={weekHealthLoading}
        onThemeToggle={toggleTheme}
        isDark={isDark}
        userInitials={currentOperator ? currentOperator.full_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "OP"}
        currentUser={currentOperator ? {
          full_name: currentOperator.full_name,
          username: currentOperator.username,
          role: currentOperator.role,
        } : undefined}
        onLogout={logoutOperator}
        onOpenSudo={handleOpenSudo}
        // Zoom cluster (Fit / − / +)
        onZoomFit={handleZoomFit}
        onZoomOut={handleZoomOut}
        onZoomIn={handleZoomIn}
        zoomLabel={stageZoomLabel}
        isZoomed={isStageZoomed}
        onPrint={() => setIsPrintCenterOpen(true)}
        isSyncing={boardBackgroundSync}
        rosterOpen={rosterOpen}
        onRosterToggle={() => setRosterOpen((v) => !v)}
        canvasMode={canvasMode}
        onCanvasModeChange={setCanvasMode}
        isDayPublished={currentNightStatus === "published"}
        canPublishDay={canPublish}
        onToggleDayPublished={
          canPublish ? () => void handleToggleDayPublished() : undefined
        }
        publishDayBusy={publishDayBusy}
      />

      {/* DndContext now lives inside InteractiveStage (narrowed surface).
          Only the actual droppable artboard + roster participate in the drag context.
          This is the major INP win for iPad drags + Pencil. */}
      <InteractiveStage
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        activeDrag={activeDrag}
        isDark={isDark}
      >
        {/* (Floating Placed pill removed from bottom-right per request — single instance now lives in top nav right section with visual progress) */}
        {/* autoScroll={false}: prevents dnd-kit's built-in scroll fighting with our
            fixed scroll container on iPad — we handle scroll ourselves via touch gestures. */}
      {/* The roster used to be a 268px flex sibling. It's now a floating
         Liquid Glass panel anchored to the left, position:fixed inside this
         relative container so the canvas can take the full width. When the
         operator collapses the roster, a sphere appears in its place.
         min-h-0 is still critical for the canvas's nested scroll behavior. */}
      <div className={`flex flex-1 relative ${isBuilderLiveCanvas ? 'sb-builder-main overflow-y-auto' : 'overflow-hidden min-h-0'}`}>
        {/* FLOATING ROSTER — thin chrome; heavy content (filtering + 6+ Virtual sections) now lives in isolated RosterRail (symmetric carve to ShiftBuilderBoard) */}
        <div
          aria-hidden={!rosterOpen}
          className={`sb-roster-shell fixed w-[268px] z-30 rounded-2xl overflow-hidden flex flex-col ${rosterOpen ? "" : "pointer-events-none"}`}
          style={{
            background: isDark ? "rgba(20,19,22,0.84)" : "rgba(252,252,250,0.90)",
            backdropFilter: "blur(48px) saturate(200%)",
            WebkitBackdropFilter: "blur(48px) saturate(200%)",
            border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.08)",
            boxShadow: isDark
              ? "inset 0 1px 0 rgba(255,255,255,0.10), 0 20px 60px rgba(0,0,0,0.55)"
              : "inset 0 1px 0 rgba(255,255,255,0.90), 0 20px 60px rgba(0,0,0,0.10)",
            transformOrigin: "0% 50%",
            transform: rosterOpen ? "scale(1)" : "scale(0.92) translateX(-8px)",
            opacity: rosterOpen ? 1 : 0,
            pointerEvents: rosterOpen ? "auto" : "none",
          }}
        >
          <RosterRail
            realRoster={effectiveRealRoster}
            graveRoster={effectiveGraveRoster}
            // assignments now pulled via narrow Zustand selector inside RosterRail (3.4)
            assignedThisNight={assignedThisNight}
            scheduledTmIdsTonight={effectiveScheduledTmIdsTonight}
            calledOffIds={calledOffIds}
            graveOnly={graveOnly}
            rosterSearch={rosterSearch}
            isDark={isDark}
            isCurrentNightLocked={isCurrentNightLocked}
            canEditAssignments={canEditAssignments}
            amOverlapDayName={amOverlapDayName}
            amOverlapDateNum={amOverlapDateNum}
            selectedDay={selectedDay}
            isRosterLoading={boardColdLoading}
          />
        </div>
        {/* Duplicate old roster glass + inline filter UI fully excised (replaced by isolated <RosterRail /> in the thin chrome wrapper above). Day picker / calendar popovers and stage remain as siblings inside the main flex row. */}
        {/* Floating day-of-week picker (appears to the right of the left rail
           when the colored day number is clicked). Glass panel, 7 day choices
           laid out horizontally so the "week of days" expands next to the
           calendar/day controls on the left rail exactly as requested. */}
        {dayPickerOpen && !rosterOpen && (
          <div
            id="left-rail-day-picker"
            className="fixed z-[70] flex items-center gap-1 rounded-2xl border border-white/70 bg-white/95 p-1 shadow-2xl shadow-black/10 backdrop-blur-xl"
            style={{
              left: "52px",
              top: "calc(50% + 297px - 16px)",   // vertically align with the day-number sphere
              transform: "translateY(-50%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {DAY_DEFS.map((day) => {
              const idx = day.index;
              const isSelected = idx === selectedDayIndex;
              const useOutline = currentView === "breaks" && isSelected;
              return (
                <button
                  key={idx}
                  onClick={() => {
                    setSelectedDayIndex(idx);
                    setDayPickerOpen(false);
                  }}
                  className={`sb-interactive relative min-w-[42px] h-8 px-2 rounded-xl text-[11px] font-semibold tracking-[-0.1px] flex items-center justify-center gap-1 ${useOutline ? "border shadow-sm" : isSelected ? "text-white shadow" : "text-[#6B7280] hover:bg-[#F3F4F6]"}`}
                  style={{
                    backgroundColor: useOutline ? "#fff" : (isSelected ? day.color : "transparent"),
                    borderColor: useOutline ? day.color : "transparent",
                    color: useOutline ? day.color : undefined,
                    borderWidth: useOutline ? "1.5px" : 0,
                  }}
                  title={`${day.name} · ${day.monthYear.split(" ")[0]} ${day.dateNum}`}
                >
                  <span>{day.short}</span>
                  <span className="tabular-nums opacity-80">{day.dateNum}</span>
                  {mounted && day.isToday && !isSelected && (
                    <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#007AFF]" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Full calendar popover — opens when the calendar icon in the left rail is tapped.
           Lets the operator jump to any date by picking a day in any month. */}
        {calendarOpen && !rosterOpen && (
          <div
            id="left-rail-calendar-popover"
            className="fixed z-[70] w-[280px] rounded-2xl border border-white/70 bg-white/95 p-3 shadow-2xl shadow-black/10 backdrop-blur-xl text-[12px]"
            style={{
              left: "52px",
              top: "calc(50% + 253px - 80px)",
              transform: "translateY(-50%)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2 px-1">
              <button
                onClick={() => setCalendarView(addDays(calendarView, -30))}
                className="w-6 h-6 rounded-full hover:bg-[#F3F4F6] flex items-center justify-center text-[#6B7280]"
                aria-label="Previous month"
              >
                ‹
              </button>

              <div className="font-semibold text-[#1C1C1E] tabular-nums">
                {MONTH_LONG[calendarView.getMonth()]} {calendarView.getFullYear()}
              </div>

              <button
                onClick={() => setCalendarView(addDays(calendarView, 32))}
                className="w-6 h-6 rounded-full hover:bg-[#F3F4F6] flex items-center justify-center text-[#6B7280]"
                aria-label="Next month"
              >
                ›
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 text-center text-[#8E8E93] font-medium mb-1">
              {["S","M","T","W","T","F","S"].map((d, i) => (
                <div key={i}>{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-0.5 text-center">
              {(() => {
                const year = calendarView.getFullYear();
                const month = calendarView.getMonth();

                const firstOfMonth = new Date(year, month, 1);
                const startWeekday = firstOfMonth.getDay(); // 0=Sun

                const daysInMonth = new Date(year, month + 1, 0).getDate();

                const cells: React.ReactNode[] = [];

                // Leading days from previous month (muted)
                for (let i = 0; i < startWeekday; i++) {
                  const d = new Date(year, month, 1 - (startWeekday - i));
                  cells.push(
                    <button
                      key={`prev-${i}`}
                      onClick={() => {
                        const newWeek = startOfShiftWeek(d);
                        const idx = Math.max(0, Math.min(6, daysBetween(newWeek, d)));
                        setWeekStart(newWeek);
                        setSelectedDayIndex(idx);
                        setCalendarOpen(false);
                      }}
                      className="h-7 w-7 text-[11px] text-[#C8C8CC] hover:bg-[#F3F4F6] rounded-md"
                    >
                      {d.getDate()}
                    </button>
                  );
                }

                // Current month days
                for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
                  const d = new Date(year, month, dayNum);
                  const currentSelectedDate = DAY_DEFS[selectedDayIndex]?.date;
                  const isSelectedDay = currentSelectedDate && sameDay(d, currentSelectedDate);

                  cells.push(
                    <button
                      key={dayNum}
                      onClick={() => {
                        const newWeek = startOfShiftWeek(d);
                        const idx = Math.max(0, Math.min(6, daysBetween(newWeek, d)));
                        setWeekStart(newWeek);
                        setSelectedDayIndex(idx);
                        setCalendarOpen(false);
                      }}
                      className={`h-7 w-7 text-[11px] rounded-md transition-colors ${
                        isSelectedDay
                          ? "bg-[#111] text-white font-semibold"
                          : "hover:bg-[#F3F4F6] text-[#1C1C1E]"
                      }`}
                    >
                      {dayNum}
                    </button>
                  );
                }

                // Trailing days from next month
                const remaining = 42 - cells.length;
                for (let i = 1; i <= remaining; i++) {
                  const d = new Date(year, month + 1, i);
                  cells.push(
                    <button
                      key={`next-${i}`}
                      onClick={() => {
                        const newWeek = startOfShiftWeek(d);
                        const idx = Math.max(0, Math.min(6, daysBetween(newWeek, d)));
                        setWeekStart(newWeek);
                        setSelectedDayIndex(idx);
                        setCalendarOpen(false);
                      }}
                      className="h-7 w-7 text-[11px] text-[#C8C8CC] hover:bg-[#F3F4F6] rounded-md"
                    >
                      {d.getDate()}
                    </button>
                  );
                }

                return cells;
              })()}
            </div>

            {/* Footer actions */}
            <div className="mt-2 pt-2 border-t border-[#E5E5E7] flex justify-between">
              <button
                onClick={() => {
                  const today = currentShiftDate();
                  const newWeek = startOfShiftWeek(today);
                  const idx = daysBetween(newWeek, today);
                  setWeekStart(newWeek);
                  setSelectedDayIndex(Math.max(0, Math.min(6, idx)));
                  setCalendarOpen(false);
                }}
                className="text-[11px] px-2 py-0.5 rounded-md text-[#007AFF] hover:bg-[#E5F0FF]"
              >
                Today
              </button>

              <button
                onClick={() => setCalendarOpen(false)}
                className="text-[11px] px-2 py-0.5 rounded-md text-[#6B7280] hover:bg-[#F3F4F6]"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* RIGHT: Scaled, centered artboard stage.
           stageHostRef is the gray scroll area; we measure its clientWidth /
           clientHeight here to compute the "Fit" scale. The print-stage wrapper
           is sized to the *scaled* dimensions so flex centers based on what's
           actually painted, not the un-scaled layout box. */}
        <div
          ref={stageHostRef}
          className={`sb-stage-host flex-1 min-w-0 ${isBuilderLiveCanvas ? "overflow-y-auto overflow-x-visible" : "overflow-auto"} ${isBuilderLiveCanvas ? "sb-builder-stage bg-[#F8F8FA] dark:bg-[#0C0C0E]" : "bg-[#F2F2F4] dark:bg-[#0D0D0F]"} flex ${isBuilderLiveCanvas ? 'flex-col items-stretch justify-start' : 'items-center justify-center'} transition-[padding] duration-300`}
          style={{
            // Explicit per-side padding so the artboard floats clear of every
            // piece of floating chrome. On iPad, globals.css max() merges safe-area.
            ["--sb-stage-inset-top" as string]: `${stageInsets.top}px`,
            ["--sb-stage-inset-right" as string]: `${stageInsets.right}px`,
            ["--sb-stage-inset-bottom" as string]: `${stageInsets.bottom}px`,
            ["--sb-stage-inset-left" as string]: `${stageInsets.left}px`,
            paddingTop: stageInsets.top,
            paddingRight: stageInsets.right,
            paddingBottom: stageInsets.bottom,
            paddingLeft: stageInsets.left,
          }}
        >
          {/* Unified builder canvas: week health + scaled board as one seamless surface. */}
          {isBuilderLiveCanvas && (
            <div
              className="sb-builder-canvas mx-auto flex min-h-0 w-full flex-1 flex-col"
              style={{ maxWidth: BUILDER_CANVAS_MAX_WIDTH_PX }}
            >
              <div className="sb-builder-scale-viewport w-full min-h-0 flex-1 overflow-visible">
                <div
                  ref={builderContentRef}
                  className="sb-builder-scale-inner w-full"
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top center",
                    marginBottom:
                      builderContentHeight > 0 && scale < 1
                        ? -Math.round(builderContentHeight * (1 - scale))
                        : undefined,
                  }}
                >
              <ShiftBuilderBoard
                nightId={queryNightId || nightId}
                selectedTasks={selectedTasks}
                cardBorders={effectiveCardBorders}
                focusedTmId={focusedWeeklyTmId}
                processedWaves={processedDayData?.waves}
                processedBreakCounts={processedDayData?.breakCounts}
                selectedDay={selectedDay}
                selectedDayIndex={selectedDayIndex}
                // Rotation health side drawer: pass clear and run engine so the drawer contains them
                canRunEngine={canRunEngine}
                onRunXaiEngine={runXaiEngineFromCanvas}
                onClearBoard={handleClearBoard}
                engineRunning={engineRunPhase !== "idle"}
                onApplyDraft={() => { void applyDraft(); }}
                onDiscardDraft={discardDraft}
                draftGrokExplanation={draftGrokExplanation}
                currentView={currentView as "deployment" | "breaks"}
                breakGroup={breakGroup}
                isDark={isDark}
                isDraftMode={isDraftMode}
                isCurrentNightLocked={isCurrentNightLocked}
                loadingAssignments={boardColdLoading}
                onDayPillClick={handleBoardDayPill}
                onBreakGroupChange={handleBoardBreakGroupChange}
                onRemoveTask={handleBoardRemoveTask}
                onSetTaskColor={handleBoardSetTaskColor}
                onEditTask={handleBoardEditTask}
                setBreakGroupForSlot={setBreakGroupForSlot}
                onLiveAssign={handleBoardLiveAssign}
                onLiveUnassign={handleBoardLiveUnassign}
                onAddAuxSlot={addAuxSlot}
                onRemoveAuxSlot={removeLastAuxSlot}
                canAddAux={canAddAux}
                canRemoveAux={canRemoveAux}
                onSetAuxRole={setAuxRole}
                onSetAuxLabel={setAuxLabel}
                onAddCoverage={handlePadAddCoverage}
                onRequestEngineInsight={handleBoardRequestEngineInsight}
                live={live}
                amOverlapDayName={amOverlapDayName}
                amOverlapDateNum={amOverlapDateNum}
                selectedSlotKey={selectedSlotKey}
                onSlotToggle={handleSlotToggle}
                onSlotClose={handleSlotClose}
                padAssignments={padAssignments}
                scheduledUnassigned={selectedSlotKey ? markerSlotScheduledUnassigned : markerScheduledUnassigned}
                allEligibleTms={selectedSlotKey ? markerSlotAllEligibleTms : markerAllEligibleTms}
                onAddOnCall={handlePadAddOnCall}
                onMarkUnavailable={handlePadMarkUnavailable}
                weeklyRecentHistory={plannedThisWeekRecentHistory}
                onClearSlot={handlePadClearSlot}
                onToggleLock={handlePadToggleLock}
                onAssign={handlePadAssign}
                onAssignSweeper={(slotKey, sweeperLabel) => handleAssignSweeperTask(slotKey, sweeperLabel)}
                onAddTask={(slotKey, label) => handleCmdkAddTask(slotKey, label)}
                nextDayColor={nextDayColor}
                members={effectiveRealRoster}
                fitBySlot={deploymentFitBySlot}
                artboardScale={scale}
                isPrintPreview={false}
                showWeekHealthBar={showWeekHealthBar}
                weekDailyHealths={weekDailyHealths}
                weekHealthDayDefs={DAY_DEFS}
                selectedDayDateKey={selectedDayDateKey}
                weekHealthLoading={weekHealthLoading}
                onWeekHealthSelectDay={(idx) => setSelectedDayIndex(idx)}
                onWeekHealthDismiss={dismissWeekHealthTracker}
              />
                </div>
              </div>
            </div>
          )}

          {/* Golden / preview / weekly frame — unmounted in builder deployment so dnd-kit never
              registers duplicate slot:* droppables from a hidden copy of the board. */}
          {!isBuilderLiveCanvas ? (
          <div
            className={`relative flex-shrink-0 flex flex-col items-center ${relaxedFrameClass}`}
            style={{
              width: NATURAL_WIDTH * scale,
              gap: 10,
            }}
          >
          <div
            className={`relative flex-shrink-0 ${relaxedFrameClass}`}
            style={{
              width: NATURAL_WIDTH * scale,
              height: NATURAL_HEIGHT * scale,
              overflow: "hidden",
            }}
          >
            {/* The actual scaled artboard (original print-stage-inner) */}
            <div
              className={`print-stage-inner relative overflow-hidden ${relaxedFrameClass}`}
              ref={positioningRef}
              style={{
                width: NATURAL_WIDTH,
                height: NATURAL_HEIGHT,
                transform: `scale(${scale})`,
                transformOrigin: "top left",
              }}
            >
            <BuilderCanvasVeil active={showCanvasVeil} />
            {/* Pill cluster moved out of this scaled wrapper — rendered as a
               sibling of .print-stage-inner below so it floats at the
               bottom-center of the canvas at a constant, tap-friendly size
               regardless of zoom level. */}

            {/* Fixed 1056px artboard — now isolated into ShiftBuilderBoard for day-switch perf.
                The scaling transform, refs, and stage chrome remain in the orchestrator.
                Board receives only the narrow day-specific prop bag + stable callbacks. */}
            {currentView === "weekly" ? (
              /* Weekly Overview as a first-class page (alongside Deploy / Breaks).
                 Builder / Preview toggle (in the nav, next to the page buttons) controls it universally.
                 - 'preview': clean, print-faithful (bit-for-bit with PDF output).
                 - 'builder': richer interactive WEEK BUILDER for the full week (xAI, health advisor, direct pad context, focus etc.).
                 Layout and data always match the sacred 1056×816 Golden spec.
                 Screen-only digital assists (no-print).

                 WeekLens v2 (builder only): Top Controls Bar (40px unscaled page chrome) + right Focus sidebar (~22%, unscaled)
                 are rendered OUTSIDE the golden paper. The inner 1056×816 artboard + LiveWeeklyOverviewArtboard
                 + layoutForWeekly solver are NEVER resized or structurally altered — 1:1 fidelity with print
                 is preserved even while the builder gets rich overlays, filters, and the sidebar. */
              <>
                {/* WeekLens v2 Top Controls Bar — now placed *above* the golden paper (not over it).
                    Rendered as absolute above a relative wrapper so the entire 816px artboard
                    (including its internal minimal banner) is fully visible below.
                    Unscaled (escapes the stage transform). Builder-only. */}
                {/* Restore the paper's own relative wrapper for proper artboard framing and centering.
                    The paper (1056x816) must remain a self-contained "page" that fits the artboard.
                    When the Focus panel is open we shift the paper left (marginRight) so the fixed Focus
                    on the right of the viewport sits outside the paper's white area. */}
                <div style={{ position: 'relative', width: 'min(1040px, 96vw)', margin: '0 auto' }}>
                  {!isPrintPreview && canvasMode === 'builder' && (
                    <div
                      className="no-print"
                      style={{
                        position: 'absolute',
                        top: -40,
                        left: 0,
                        right: 0,
                        zIndex: 120,
                        height: 38,
                        background: 'rgba(255,255,255,0.98)',
                        border: '1px solid #E5E5EA',
                        borderRadius: 6,
                        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '0 6px',
                        fontFamily: "var(--font-atkinson, system-ui)",
                        fontSize: 9,
                        boxSizing: 'border-box',
                        userSelect: 'none',
                      }}
                    >
                    {/* Left: subtle label + health snapshot pills + tiny sparkline */}
                    <div style={{ fontWeight: 700, color: '#6B7280', marginRight: 2, letterSpacing: '0.15px', lineHeight: 1 }}>WeekLens</div>
                    <div 
                      title="Weekly Balance (wk): rotation fairness / repeat reduction score for the full grave week (higher = better, used for AI suggestions)"
                      style={{ background: 'rgba(16,185,129,0.15)', color: '#15803d', padding: '0 4px', borderRadius: 999, fontWeight: 700, fontSize: 8, lineHeight: '14px', height: 14, display: 'flex', alignItems: 'center' }}
                    >wk</div>
                    {/* Per-day rotation health % — same data as the deploy-view tracker bar */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        paddingRight: 3,
                        marginRight: 2,
                        borderRight: '1px solid #E5E5EA',
                      }}
                      title="Per-day rotation health % (built days only). Click a day to select it."
                    >
                      <WeekHealthTracker
                        visible
                        variant="compact"
                        healthLoading={weekHealthLoading}
                        weekDailyHealths={weekDailyHealths}
                        dayDefs={DAY_DEFS}
                        selectedDayIndex={selectedDayIndex}
                        onSelectDay={(idx) => setSelectedDayIndex(idx)}
                      />
                    </div>
                    {/* Mini sparkline from actual week headcounts - tightly packed */}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 11, marginRight: 2, paddingRight: 3, borderRight: '1px solid #E5E5EA' }}>
                      {(weekOverviewNights || []).slice(0,7).map((n: any, i: number) => {
                        const cnt = Object.values(n.assignments || {}).filter((a: any) => !!a?.tmId).length;
                        const h = Math.max(2, Math.round((cnt / 30) * 11));
                        const col = (DAY_DEFS[n.dayIndex] || {}).color || '#888';
                        return <div key={i} style={{ width: 2, height: h, background: col, borderRadius: 1, opacity: 0.85 }} />;
                      })}
                    </div>
                    {/* Raw viol count to exactly match the banner inside the sheet for zero confusion */}
                    <div
                      onClick={() => setWeekLensFilters(new Set(['repeats']))}
                      style={{
                        background: rawWeekViolCount > 0 ? 'rgba(193,58,20,0.12)' : 'rgba(16,185,129,0.1)',
                        color: rawWeekViolCount > 0 ? '#C13A14' : '#15803d',
                        padding: '0 4px',
                        borderRadius: 999,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontSize: 8,
                        lineHeight: '14px',
                        height: 14,
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      title="Total (TM, slot) repeats this week — matches the banner viol. count inside the sheet exactly. Click to filter."
                    >
                      {rawWeekViolCount} viol.
                    </div>
                    {(() => {
                      const total = (weekOverviewNights || []).reduce((sum, n) => 
                        sum + Object.values(n.assignments || {}).filter((a: any) => !!a?.tmId).length, 0);
                      const avg = weekOverviewNights.length ? (total / weekOverviewNights.length).toFixed(1) : '—';
                      return <div title="Average daily headcount (filled slots) across the shown days" style={{ color: '#6B7280', fontSize: 8 }}>avg {avg}</div>;
                    })()}

                    {/* Quick filter chips — tight, consistent, high scannability */}
                    {(['zones','restrooms','support','repeats','empties'] as const).map(k => {
                      const active = weekLensFilters.has(k);
                      return (
                        <button
                          key={k}
                          onClick={() => {
                            const next = new Set(weekLensFilters);
                            if (active) next.delete(k); else next.add(k);
                            setWeekLensFilters(next);
                          }}
                          style={{
                            padding: '0 5px',
                            height: 18,
                            borderRadius: 3,
                            border: active ? '1px solid #6B21A8' : '1px solid #E5E5EA',
                            background: active ? 'rgba(107,33,168,0.12)' : '#fff',
                            color: active ? '#6B21A8' : '#6B7280',
                            fontSize: 8,
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            transition: 'all 80ms ease',
                            boxShadow: active ? 'inset 0 1px 1px rgba(0,0,0,0.05)' : 'none',
                          }}
                          onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
                          onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                          {k === 'zones' ? 'Zones' : k === 'restrooms' ? 'Restrooms' : k === 'support' ? 'Support' : k === 'repeats' ? 'Repeats' : 'Empties'}
                        </button>
                      );
                    })}

                    {/* Search — compact, seamless */}
                    <input
                      value={weekLensSearch}
                      onChange={(e) => setWeekLensSearch(e.target.value)}
                      placeholder="search name/slot"
                      style={{ 
                        flex: 1, 
                        maxWidth: 100, 
                        height: 16, 
                        fontSize: 8, 
                        border: '1px solid #E5E5EA', 
                        borderRadius: 2, 
                        padding: '0 3px',
                        boxSizing: 'border-box',
                      }}
                    />

                    {/* Prominent purple AI Optimize — calls the existing advisor */}
                    <button
                      onClick={() => void handleRequestRotationAdvisor({ focusWeek: true })}
                      style={{
                        background: 'linear-gradient(90deg, #6B21A8, #9333EA)',
                        color: '#fff',
                        fontWeight: 700,
                        fontSize: 8,
                        padding: '0 6px',
                        height: 16,
                        borderRadius: 999,
                        border: 'none',
                        cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(107,33,168,0.25)',
                        whiteSpace: 'nowrap',
                        transition: 'transform 70ms ease',
                      }}
                      onMouseDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
                      onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      title="AI Optimize Rotations — prescriptive moves to raise weeklyBalance (local + xAI)"
                    >
                      AI Optimize
                    </button>

                    {/* Sidebar toggle — descriptive */}
                    <button
                      onClick={() => setWeekLensSidebarOpen(v => !v)}
                      style={{
                        fontSize: 7,
                        padding: '0 3px',
                        height: 16,
                        borderRadius: 2,
                        border: '1px solid #E5E5EA',
                        background: weekLensSidebarOpen ? '#F4F4F6' : '#fff',
                        color: '#6B7280',
                        marginLeft: 1,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {weekLensSidebarOpen ? 'Close Focus' : 'Focus Panel'}
                    </button>
                  </div>
                )}

                {/* The sacred 1056×816 golden paper — NEVER resized by WeekLens chrome.
                    Layout solver, row heights, ovals (preview), banner, headcount, sections etc. stay identical to print.
                    The relative wrapper + absolute bar above + marginTop creates a flawless "page header" feel. */}
                <div
                  className="print-artboard mx-auto"
                  style={{
                    width: 1056,
                    height: 816,
                    background: "#fff",
                    boxShadow: "0 0 0 1px #E5E5EA",
                    overflow: "hidden",
                    // Push the whole paper down inside the relative wrapper so the absolute WeekLens bar
                    // (positioned at top: -40) sits cleanly *above* the 816px artboard.
                    marginTop: 42,
                    // When Focus panel is open, shift the paper left so the fixed Focus (on the right of the viewport)
                    // ends up outside the paper's white artboard area. This keeps the "page" (the 1056x816 paper)
                    // properly framed and fitting the artboard without the Focus intruding on the schedule content.
                    marginRight: weekLensSidebarOpen ? 260 : 0,
                    transition: 'margin-right 180ms ease-out, margin-top 180ms ease-out',
                    boxSizing: 'border-box',
                  }}
                >
                <WeeklyOverview
                  overviewNights={weekOverviewNights}
                  dayDefs={DAY_DEFS}
                  focusedTmId={focusedWeeklyTmId}
                  onFocusTm={(tmId) => {
                    setFocusedWeeklyTmId(tmId);
                    if (tmId) setWeekLensSidebarOpen(true); // auto-open the footprint + suggestions panel on focus
                  }}
                  onJumpToDayIndex={(idx) => {
                    setSelectedDayIndex(idx);
                    // focus stays so the new day's column is emphasized in context
                  }}
                  currentDayIndex={selectedDayIndex}
                  weeklyRecentHistory={plannedThisWeekRecentHistory}
                  mode={isPrintPreview ? 'preview' : 'builder'}
                  showDigitalAssists={!isPrintPreview} // xAI dots + builder assists only in builder mode; preview is clean print-faithful (ovals, viol, focus, load still diagnostic)
                  filters={weekLensFilters}
                  search={weekLensSearch}
                  sidebarOpen={weekLensSidebarOpen}
                  onActivateTmContext={(tmId, slotKey, dayIndex) => {
                    // Deeper integration: ensure day + focus, and open the context (pad) for the specific placement.
                    // This makes clicking in weekly (esp. builder mode) actually open/show the PlacementPad context
                    // for that (day, slot), pre-contextualized with week data via the focus and history.
                    setSelectedDayIndex(dayIndex);
                    setFocusedWeeklyTmId(tmId);
                    if (slotKey) {
                      handleSlotToggle(slotKey);
                    }
                  }}
                  onRequestXaiInsight={(tmId, context) => {
                    // xAI integration point for the week overview.
                    // For a specific placement or the full week view of the TM, request engine insight
                    // (opens glass or pre-loads pad with week rotation/fit provenance).
                    // When week:true we now prefer the dedicated rotation health advisor flow (prescriptive
                    // "what to move where + why" to raise the wk % / overall health). This directly answers
                    // "how can rotation health + xAI give us a breakdown of moves".
                    if (context?.week) {
                      void handleRequestRotationAdvisor({
                        tmId: tmId || undefined,
                        slotKey: context.slotKey,
                        focusWeek: true,
                      });
                      setFocusedWeeklyTmId(tmId || null);
                      return;
                    }
                    const key = context.slotKey || `${tmId}-week`;
                    setProvenanceKey(key);
                    setWeekAdvisorText(null); // clear any prior advisor result
                    setFocusedWeeklyTmId(tmId || null);
                  }}
                />
                {/* Render pad context directly when weekly overview page is active (board not rendered).
                    This ensures clicking names/cells in weekly (builder mode especially) opens and shows the PlacementPad context. */}
                {selectedSlotKey && currentView === "weekly" && (
                  <PlacementPad
                    slotKey={selectedSlotKey}
                    anchor="right"
                    hostId={selectedSlotKey}
                    onClose={() => setSelectedSlotKey(null)}
                    assignments={padAssignments}
                    selectedTasks={selectedTasks}
                    selectedDay={selectedDay}
                    members={effectiveRealRoster}
                    auxDefs={auxDefs}
                    isDark={isDark}
                    isCurrentNightLocked={isCurrentNightLocked}
                    setBreakGroupForSlot={setBreakGroupForSlot}
                    onAddCoverage={handlePadAddCoverage}
                    onLiveUnassign={handleBoardLiveUnassign}
                    onToggleLock={handlePadToggleLock}
                    onAssign={handlePadAssign}
                    onAddTask={(sk, label) => handleCmdkAddTask(sk, label)}
                    onRemoveTask={handleBoardRemoveTask}
                    onAssignSweeper={(sk, label) => handleAssignSweeperTask(sk, label)}
                    onRequestEngineInsight={handleBoardRequestEngineInsight}
                    scheduledUnassigned={selectedSlotKey ? markerSlotScheduledUnassigned : markerScheduledUnassigned}
                    allEligibleTms={selectedSlotKey ? markerSlotAllEligibleTms : markerAllEligibleTms}
                    onAddOnCall={handlePadAddOnCall}
                    onMarkUnavailable={handlePadMarkUnavailable}
                    isDraftMode={isDraftMode}
                    draftAssignments={draftAssignments}
                  />
                )}
              </div>
                </div> {/* close paper's relative wrapper (top bar lives above paper, paper is full width) */}

                {/* Focus sidebar — fixed to the right of the viewport.
                    Combined with the paper's marginRight shift (260px when open), this places the Focus box
                    outside the white artboard (the 1056x816 "page"). The schedule table stays fully contained
                    and fitting inside the framed artboard as before. */}
                {!isPrintPreview && canvasMode === 'builder' && (
                  <div
                    className="no-print"
                    style={{
                      position: 'fixed',
                      top: 96,
                      right: weekLensSidebarOpen ? 16 : -260,
                      zIndex: 110,
                      width: 220,
                      maxHeight: 'calc(100vh - 120px)',
                      background: 'rgba(255,255,255,0.98)',
                      border: '1px solid #E5E5EA',
                      borderRadius: 6,
                      boxShadow: '-3px 0 10px rgba(0,0,0,0.07)',
                      padding: '8px 6px',
                      fontFamily: "var(--font-atkinson, system-ui)",
                      fontSize: 10,
                      overflow: 'auto',
                      transition: 'right 180ms ease-out',
                      pointerEvents: weekLensSidebarOpen ? 'auto' : 'none',
                      boxSizing: 'border-box',
                      userSelect: 'none',
                    }}
                  >
                    <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 9, padding: '0 2px' }}>
                      <span>Focus</span>
                      <button onClick={() => setWeekLensSidebarOpen(false)} style={{ fontSize: 9, color: '#9CA3AF', lineHeight: 1, padding: '0 2px' }}>×</button>
                    </div>

                    {focusedWeeklyTmId ? (
                      <div>
                        {/* Mini weekly Gantt / footprint — tight, scannable, tint only on repeat days */}
                        <div style={{ fontWeight: 600, marginBottom: 3, fontSize: 10, display: 'flex', alignItems: 'center', gap: 3, padding: '0 2px' }}>
                          {(() => {
                            let nm = focusedWeeklyTmId;
                            for (const n of (weekOverviewNights || [])) {
                              for (const a of Object.values(n.assignments || {})) {
                                if ((a as any)?.tmId === focusedWeeklyTmId && (a as any)?.tmName) { nm = (a as any).tmName; break; }
                              }
                            }
                            return nm;
                          })()}
                          <span 
                            onMouseDown={(e) => {
                              const nameEl = e.currentTarget.parentElement;
                              if (nameEl) {
                                const nameText = nameEl.textContent?.trim().split(' ')[0] || focusedWeeklyTmId || '';
                                navigator.clipboard?.writeText(nameText);
                              }
                            }}
                            title="Copy focused TM name to clipboard"
                            style={{ cursor: 'pointer', fontSize: 9, opacity: 0.6, userSelect: 'none' }}
                          >⎘</span>
                        </div>

                        <div style={{ display: 'flex', gap: 1, marginBottom: 4, flexWrap: 'wrap', padding: '0 1px' }}>
                          {(() => {
                            const slotCounts: Record<string, number> = {};
                            (weekOverviewNights || []).forEach(n => {
                              Object.entries(n.assignments || {}).forEach(([sk, a]: any) => {
                                if (a?.tmId === focusedWeeklyTmId) slotCounts[sk] = (slotCounts[sk] || 0) + 1;
                              });
                            });
                            return (weekOverviewNights || []).map((n: any, idx: number) => {
                              const placed = Object.entries(n.assignments || {}).find(([,a]: any) => a?.tmId === focusedWeeklyTmId);
                              const slot = placed ? placed[0] : null;
                              const def = DAY_DEFS[n.dayIndex] || { short: '?', color: '#888', dateNum: n.dayIndex };
                              const isRepeatDay = slot && slotCounts[slot] > 1;
                              return (
                                <div key={idx} style={{
                                  fontSize: 6.5, textAlign: 'center', padding: '0 1px', minWidth: 16, height: 10, lineHeight: '10px',
                                  borderRadius: 1,
                                  background: isRepeatDay ? 'rgba(251,191,36,0.22)' : (slot ? 'rgba(0,0,0,0.025)' : 'transparent'),
                                  border: isRepeatDay ? `1px solid #F59E0B` : (slot ? `1px solid ${def.color}` : '1px dashed #ddd'),
                                  color: isRepeatDay ? '#B45309' : (slot ? def.color : '#aaa'),
                                  boxSizing: 'border-box',
                                }} title={slot ? `${def.name} ${def.dateNum}: ${slot}${isRepeatDay ? ' (repeat for this TM)' : ''}` : `${def.name} ${def.dateNum}: —`}>
                                  {(def.short?.[0] || '?') + def.dateNum}
                                </div>
                              );
                            });
                          })()}
                        </div>

                        <div style={{ fontSize: 8, color: '#6B7280', marginBottom: 4, padding: '0 2px', lineHeight: 1.1 }}>
                          Repeats on this TM contribute to weekly balance. Click any cell to jump + re-focus.
                        </div>

                        {/* Quick advisor trigger */}
                        <button
                          onClick={() => void handleRequestRotationAdvisor({ tmId: focusedWeeklyTmId || undefined, focusWeek: true })}
                          style={{ fontSize: 8, padding: '0 4px', height: 14, borderRadius: 2, background: '#6B21A8', color: '#fff', border: 'none', cursor: 'pointer', marginBottom: 4, width: '100%', lineHeight: 1 }}
                        >
                          Ask xAI for this TM's rotation plan
                        </button>

                        {/* Real local suggestions — ultra-compact cards */}
                        <div style={{ fontWeight: 600, fontSize: 7, marginBottom: 1, padding: '0 1px', color: '#6B7280' }}>Local suggestions (instant)</div>
                        {weekLensSuggestions && weekLensSuggestions.length > 0 ? (
                          weekLensSuggestions.slice(0, 3).map((s: any, i: number) => (
                            <div key={i} style={{ fontSize: 7, marginBottom: 2, padding: '1px 2px', background: '#F8F8F9', borderRadius: 2, border: '1px solid #eee', lineHeight: 1.1 }}>
                              <div>{s.from?.tmName || s.from?.tmId} {s.from?.slotKey} → {s.to?.slotKey}{s.to?.viaSwapWith ? ` (swap ${s.to.viaSwapWith.tmName || s.to.viaSwapWith.tmId})` : ''}</div>
                              <div style={{ color: '#6B7280', fontSize: 6 }}>{s.reason}</div>
                              <button
                                onClick={() => applyWeekLensMove(s)}
                                style={{ marginTop: 0, fontSize: 6, padding: '0 2px', height: 10, borderRadius: 1, background: '#fff', border: '1px solid #C13A14', color: '#C13A14', cursor: 'pointer' }}
                              >
                                Apply
                              </button>
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: 7, color: '#6B7280', padding: '0 1px' }}>No high-impact single swaps available. Full rotation plan recommended.</div>
                        )}

                        {/* Always surface full xAI */}
                        <button
                          onClick={() => void handleRequestRotationAdvisor({ tmId: focusedWeeklyTmId || undefined, focusWeek: true })}
                          style={{ fontSize: 7, padding: '0 3px', height: 12, borderRadius: 1, background: '#6B21A8', color: '#fff', border: 'none', cursor: 'pointer', marginTop: 1, width: '100%', lineHeight: 1 }}
                        >
                          View full xAI plan
                        </button>

                        <div style={{ fontSize: 6, color: '#9CA3AF', marginTop: 3, padding: '0 1px', lineHeight: 1.05 }}>
                          Only zones / restrooms (gender) / valid aux. Never overlaps/admin.
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: '#6B7280', fontSize: 10 }}>
                        Click any name in the Week Overview (builder) to focus. Sidebar shows that person's full-week footprint (mini Gantt above), repeat cost, and actionable rotation suggestions from the local engine + xAI.
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : isPrintPreview ? (
              <LivePrintPreviewArtboard
                selectedDay={selectedDay}
                selectedDayIndex={selectedDayIndex}
                currentView={currentView as "deployment" | "breaks"}
                selectedTasks={selectedTasks}
                amOverlapDayName={amOverlapDayName}
                amOverlapDateNum={amOverlapDateNum}
                nextDayColor={nextDayColor}
                breakGroup={breakGroup}
                weekDayDefs={DAY_DEFS}
              />
            ) : (
              <ShiftBuilderBoard
                // assignments + draftAssignments now come from narrow Zustand selectors inside the board (3.4)
                // This prevents the giant objects from forcing re-renders of the entire 1056×816 artboard subtree.
                nightId={queryNightId || nightId}
                selectedTasks={selectedTasks}  // still legacy during 3.1 transition
                cardBorders={effectiveCardBorders}
                focusedTmId={focusedWeeklyTmId}
                processedWaves={processedDayData?.waves}
                processedBreakCounts={processedDayData?.breakCounts}
                selectedDay={selectedDay}
                selectedDayIndex={selectedDayIndex}
                currentView={currentView as "deployment" | "breaks"}
                breakGroup={breakGroup}
                isDark={isDark}
                isDraftMode={isDraftMode}
                isCurrentNightLocked={isCurrentNightLocked}
                loadingAssignments={boardColdLoading}
                // auxDefs now from narrow Zustand selector in Board (3.4)
                onDayPillClick={handleBoardDayPill}
                onBreakGroupChange={handleBoardBreakGroupChange}
                onRemoveTask={handleBoardRemoveTask}
                onSetTaskColor={handleBoardSetTaskColor}
                onEditTask={handleBoardEditTask}
                setBreakGroupForSlot={setBreakGroupForSlot}
                onLiveAssign={handleBoardLiveAssign}
                onLiveUnassign={handleBoardLiveUnassign}
                onAddAuxSlot={addAuxSlot}
                onRemoveAuxSlot={removeLastAuxSlot}
                canAddAux={canAddAux}
                canRemoveAux={canRemoveAux}
                onSetAuxRole={setAuxRole}
                onSetAuxLabel={setAuxLabel}
                onAddCoverage={handlePadAddCoverage}
                onRequestEngineInsight={handleBoardRequestEngineInsight}
                live={live}
                amOverlapDayName={amOverlapDayName}
                amOverlapDateNum={amOverlapDateNum}
                selectedSlotKey={selectedSlotKey}
                onSlotToggle={handleSlotToggle}
                onSlotClose={handleSlotClose}
                padAssignments={padAssignments}
                scheduledUnassigned={selectedSlotKey ? markerSlotScheduledUnassigned : markerScheduledUnassigned}
                allEligibleTms={selectedSlotKey ? markerSlotAllEligibleTms : markerAllEligibleTms}
                onAddOnCall={handlePadAddOnCall}
                onMarkUnavailable={handlePadMarkUnavailable}
                weeklyRecentHistory={plannedThisWeekRecentHistory}
                onClearSlot={handlePadClearSlot}
                onToggleLock={handlePadToggleLock}
                onAssign={handlePadAssign}
                onAssignSweeper={(slotKey, sweeperLabel) => handleAssignSweeperTask(slotKey, sweeperLabel)}
                onAddTask={(slotKey, label) => handleCmdkAddTask(slotKey, label)}
                nextDayColor={nextDayColor}
                members={effectiveRealRoster}
                fitBySlot={deploymentFitBySlot}
                artboardScale={scale}
                isPrintPreview={false}
              />
            )}
            {/* End of isolated board / weekly sheet. */}

            {/* Quick Action Fan removed... */}
          </div> {/* /print-stage-inner (the scaled content) */}

          {/* Unscaled artboard overlay — centered inside the visual (scaled-size) frame.
              This + the relative wrapper above restore proper containment while giving
              Command Palette true "center of the artboard" behavior at 1:1 size. */}
          <div
            ref={artboardOverlayRef}
            className="absolute pointer-events-none"
            style={{
              left: '50%',
              top: '50%',
              width: NATURAL_WIDTH,
              height: NATURAL_HEIGHT,
              transform: 'translate(-50%, -50%)',
              zIndex: 10050,
            }}
          >
            {/* Builder/Preview toggle moved to FloatingNav — avoids covering top-right zone cards. */}
          </div>

          </div> {/* /scaled artboard frame */}

        </div>
          ) : null}

      </div> {/* /stageHostRef content area */}
    </div> {/* /main flex row (roster chrome wrapper + stageHost) */}

      </InteractiveStage>

      {/* Task selector popover — fires when the operator picks "Tasks" from
         the quick-action fan. Centered modal with backdrop. The list of
         options comes from `catalogIndex` keyed by the slot's DB shape, so
         a Zone card sees zone tasks, an RR side sees rr_side-specific
         tasks, etc. Checkbox state is computed from `selectedTasks[uiKey]`
         and toggling fires the race-free `toggleTaskForSlot`. */}
      {tasksOpenFor && (() => {
        const uiKey = tasksOpenFor;
        let dbKey: { slot_key: string; slot_type: string; rr_side: 'mens' | 'womens' | null };
        try { dbKey = uiToDb(uiKey) as any; }
        catch { return null; }
        const catalogKey = `${dbKey.slot_type}:${dbKey.slot_key}:${dbKey.rr_side ?? ""}`;
        const options = catalogIndex[catalogKey] ?? [];
        const selected = selectedTasks[uiKey] ?? [];
        const selectedLabels = new Set(selected.map((t) => t.taskLabel));
        const close = () => setTasksOpenFor(null);

        // Friendly heading: try to find a matching def label for the slot
        let title = uiKey;
        const zd = ZONE_DEFS.find((d) => d.key === uiKey);
        if (zd) title = zd.label;
        else if (/^[MW]RR\d+$/.test(uiKey)) {
          const side = uiKey.startsWith("M") ? "Men's" : "Women's";
          const num = uiKey.replace(/\D/g, "");
          title = `${side} RR ${num === "1" ? "1+2" : num}`;
        } else {
          const ad = auxDefs.find((d) => d.key === uiKey);
          if (ad) title = ad.label;
        }

        return (
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={close}
            role="dialog"
            aria-modal="true"
            aria-label="Select tasks"
          >
            <div
              className="bg-white rounded-lg shadow-2xl border border-[#E5E5E7] w-[420px] max-w-[92vw] max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-[#E5E5E7]">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.5px] text-[#6B7280] font-semibold">Tasks for</div>
                  <div className="text-[15px] font-bold text-[#1C1C1E]" style={{ fontFamily: "var(--font-atkinson)" }}>{title}</div>
                </div>
                <button
                  type="button"
                  className="text-[#6B7280] hover:text-[#111] text-[18px] leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-[#F4F4F5]"
                  onClick={close}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 py-2">
                {options.length === 0 ? (
                  <div className="px-3 py-6 text-center text-[12px] text-[#6B7280]">
                    No tasks defined for this slot.<br/>
                    <span className="text-[11px] text-[#9CA3AF]">Add catalog rows in <code>slot_task_catalog</code>.</span>
                  </div>
                ) : (
                  <ul className="flex flex-col">
                    {options.map((opt) => {
                      const checked = selectedLabels.has(opt.label);
                      return (
                        <li key={opt.id}>
                          <button
                            type="button"
                            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                              checked ? "bg-[#EFF6FF] text-[#1E3A8A]" : "hover:bg-[#F4F4F5] text-[#1C1C1E]"
                            }`}
                            onClick={() => toggleTaskForSlot(uiKey, opt)}
                          >
                            <div
                              className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                                checked ? "bg-[#1D4ED8] border-[#1D4ED8] text-white" : "bg-white border-[#D1D5DB]"
                              }`}
                              aria-hidden="true"
                            >
                              {checked && (
                                <span className="ms" style={{ fontSize: 11, fontVariationSettings: '"FILL" 1, "wght" 700, "opsz" 20', color: 'white' }}>check</span>
                              )}
                            </div>
                            <span className="text-[13.5px]" style={{ fontFamily: "var(--font-atkinson)" }}>{opt.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              {/* Custom task input — typed label + Enter to add. Persists to
                  catalog (so it's reusable) AND auto-selects for tonight. */}
              <CustomTaskInput uiKey={uiKey} onAdd={addCustomTaskForSlot} />

              <div className="px-4 py-2.5 border-t border-[#E5E5E7] flex items-center justify-between text-[11px] text-[#6B7280]">
                <span>{selected.length} selected</span>
                <button
                  type="button"
                  className="text-[#1D4ED8] hover:text-[#1E40AF] font-medium"
                  onClick={close}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toast container — fixed bottom-right, stacks vertically when multiple
         persist failures fire. pointer-events-none on the outer so it never
         intercepts clicks meant for the canvas; individual toasts re-enable
         pointer events for their dismiss button. */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`sb-toast-enter pointer-events-auto rounded-md shadow-lg border px-3 py-2 text-[13px] flex items-start gap-2 backdrop-blur-sm ${
              t.kind === "error"
                ? "bg-[#FFF5F5] border-[#FCA5A5] text-[#7F1D1D]"
                : t.kind === "success"
                ? "bg-[#F0FDF4] border-[#86EFAC] text-[#14532D]"
                : "bg-[#F0F9FF] border-[#7DD3FC] text-[#0C4A6E]"
            }`}
            role="status"
            aria-live="polite"
          >
            {t.kind === "error" && (
              <span className="ms mt-0.5 shrink-0" style={{ fontSize: 16, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}>error</span>
            )}
            <div className="flex-1 leading-snug">{t.message}</div>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="text-current opacity-50 hover:opacity-100 transition-opacity shrink-0"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Command Palette — loaded via thin LazyCommandPalette wrapper.
          The wrapper isolates the dynamic import("./CommandPalette") (and its dep on
          useCommandActions) into a tiny file. This prevents the giant Client.tsx from
          having the import() expression in its source, which was a major source of
          Turbopack "module factory is not available" errors during HMR/eval (the error
          would claim useCommandActions was "required from" the Client).
          The canvas (and thus OpsStatusBar) can now evaluate and mount reliably. */}
      {cmdkOpen && CommandPaletteLoader && (
        <CommandPaletteLoader
          open={cmdkOpen}
          onOpenChange={setCmdkOpen}
          initialContext={cmdkInitialContext}
          onAddTask={handleCmdkAddTask}
          onCycleBreak={handleCmdkCycleBreak}
          onSetGravePool={handleCmdkSetGravePool}
          onSetDisplayName={handleCmdkSetDisplayName}
          onRemoveFromSchedule={handleCmdkRemoveFromSchedule}
          onAddCoverage={handleCmdkAddCoverage}
          // Pass through any other context the palette needs
          selectedSlotAssignment={selectedSlotKey ? padAssignments[selectedSlotKey] : null}
        />
      )}

      {/* Night picker edge arrows removed — navigation lives in the bottom dock ← / → buttons */}

      {/* Print Command Center — full overlay with day selection, page order, margins */}
      <PrintCommandCenter
        open={isPrintCenterOpen}
        onClose={() => setIsPrintCenterOpen(false)}
        onPrint={handlePrintWithConfig}
        onExport={(config) => handlePrintWithConfig(config, { exportMode: true })}
        onPreviewSheet={handlePreviewSheet}
        DAY_DEFS={DAY_DEFS}
        selectedDayIndex={selectedDayIndex}
        isPrinting={isPrinting}
        printProgress={printProgress}
        isDark={isDark}
      />

      <PrintExportProgressOverlay
        active={isPrinting}
        mode={printBusyMode}
        progress={printProgress}
        isDark={isDark}
      />

      {/* Engine heart provenance glass kept for non-card entry points or explicit "why" flows.
          The primary baseline for "what appears when you click a placement card" is now the unilateral
          attached dash in ShiftBuilderBoard (rich matrix/insights/actions per the drawn spec).
          Card appearances 100% unchanged. */}
      {provenanceKey && (
        <ProvenanceGlass
          slotKey={provenanceKey}
          onClose={() => {
            setProvenanceKey(null);
            setWeekAdvisorText(null);
            try { (window as any).__lastWeekAdvisorText = null; } catch {}
          }}
          advisorText={provenanceKey && /advisor/i.test(provenanceKey) ? weekAdvisorText : undefined}
        />
      )}

      {/* Sudo admin window — loaded via runtime dynamic import of the thin loader. */}
      {sudoOpen && SudoWindowLoader && (
        <SudoWindowLoader
          open={sudoOpen}
          onClose={() => setSudoOpen(false)}
          currentNightId={nightId}
          weekStart={weekStart}
          currentOperator={currentOperator ? {
            id: currentOperator.id,
            full_name: currentOperator.full_name,
            username: currentOperator.username,
            role: currentOperator.role,
          } : null}
          onSignOut={logoutOperator}
          isDark={isDark}
          permissions={permissions}
          onDataChanged={async () => {
            // Refresh anything the sudo window might have mutated
            setTMCommandEpoch((e) => e + 1);
            setSudoDataEpoch((e) => e + 1);

            // Force the TanStack Query layer (useCurrentNight) to refetch the current night.
            // This is the primary source for many surfaces and will pick up assignment,
            // break, task, and note changes pushed from Sudo.
            try {
              const dateKey = selectedDay.date.toISOString().slice(0, 10);
              // Use the real core key that powers the board + live layer
            currentNight.queryClient?.invalidateQueries({ queryKey: ["nightCore", dateKey] });
            currentNight.queryClient?.invalidateQueries({ queryKey: ["night", dateKey] }); // legacy listeners too
            } catch {}

            // Force-refresh the current night's break data (and other day-specific data)
            // so the break sheet group columns immediately reflect pushes from Sudo Defaults.
            if (nightId) {
              try {
                const { getNightBreakAssignments } = await import("@/lib/shiftbuilder/data");
                const freshBreaks = await getNightBreakAssignments(nightId);
                const breakByTm: Record<string, any> = {};
                freshBreaks.forEach((r: any) => {
                  if (r.tmId && r.groupNum != null) breakByTm[r.tmId] = r.groupNum;
                });

                setAssignments((prev: any) => {
                  const next = { ...prev };
                  Object.keys(next).forEach(k => {
                    const a = next[k];
                    if (a.tmId && breakByTm[a.tmId] !== undefined) {
                      next[k] = { ...a, breakGroup: breakByTm[a.tmId] };
                    }
                  });
                  return next;
                });

                // Also patch the Zustand store that the isolated Board (and BreakBadge on cards)
                // subscribes to via useAssignments(). This makes defaults push from Sudo
                // immediately visible on placement cards without waiting for the query refetch.
                try {
                  useShiftBuilderStore.getState().setAssignments((prev: any) => {
                    const next = { ...prev };
                    Object.keys(next).forEach(k => {
                      const a = next[k];
                      if (a?.tmId && breakByTm[a.tmId] !== undefined) {
                        next[k] = { ...a, breakGroup: breakByTm[a.tmId] };
                      }
                    });
                    return next;
                  });
                } catch (e) {
                  console.warn('[sudo] failed to patch store with breakGroups after Sudo change', e);
                }

                // Per operator rule: after Sudo changes (e.g. Defaults push), only keep
                // break rows for TMs who are actually placed on the current deployment.
                // Scheduled-but-not-placed TMs must not appear on the break sheet.
                const currentPlaced = new Set(
                  Object.values(assignments || {})
                    .map((a: any) => a?.tmId)
                    .filter((id: any): id is string => !!id)
                );
                setNightBreakRows(
                  freshBreaks
                    .filter((r: any) => r.groupNum && r.groupNum > 0 &&
                      (currentPlaced.size === 0 || currentPlaced.has(r.tmId)))
                    .map((r: any) => ({ tmId: r.tmId, groupNum: r.groupNum, slotRef: r.slotRef ?? null }))
                );
              } catch (e) {
                console.warn("[sudo] failed to refresh break data after Sudo change", e);
              }
            }

            // Also refresh the live engine config
            try {
              const fresh = await (await import("@/lib/shiftbuilder/engineConfig")).getActiveEngineConfig();
              setEngineConfig(fresh);
            } catch (e) {
              console.warn("[sudo] failed to refresh engineConfig after change", e);
            }
          }}
        />
      )}

      {/* Permanent Ops Status Bar — visible only inside the canvas (hidden on launchpad for cleaner presentation) */}
      {viewMode === 'canvas' && <OpsStatusBar />}

      {/* Old CanvasEngineCluster / week rotation health box removed.
          The rotation health is now exclusively the compact side drawer (RotationHealthFloater with side-right-collapsed)
          rendered inside ShiftBuilderBoard. It includes the Clear and Run engine buttons (handlers passed through).
          No more overtaking box in the surface. */}

    </div>
  );
}

// ---------------------------------------------------------------------------
// Public entry — wraps everything with OpsAuthProvider and shows the PIN gate
// until a valid operator authenticates. After auth, renders the full experience.
// This is the minimal, non-disruptive gate the operator requested.
// ---------------------------------------------------------------------------
export default function ShiftBuilder() {
  return (
    <OpsAuthProvider>
      <ShiftBuilderGate />
    </OpsAuthProvider>
  );
}

function ShiftBuilderGate() {
  const { isAuthenticated, isLoading, hasRole } = useOpsAuth();
  const router = useRouter();

  // While hydrating from localStorage, show nothing (prevents flash).
  if (isLoading) {
    return (
      <BuilderLoadingShell
        label="LOADING OPS SESSION"
        sublabel="Preparing computer context"
      />
    );
  }

  if (!isAuthenticated) {
    return <PinGate />;
  }

  // Note: We are moving away from a separate /today page.
  // Granular permissions (canEdit, canPublish, etc.) are now
  // handled via usePermissions() from @/lib/auth/opsAuth.
  // The old hard redirect has been removed.

  // Full privileged experience
  return <AuthedShiftBuilder />;
}
