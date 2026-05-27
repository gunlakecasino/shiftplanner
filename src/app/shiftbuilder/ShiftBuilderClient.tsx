"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal, flushSync } from "react-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
// NOTE: useDraggable/useDroppable are still used inline by ZoneCard, RRCard, AuxCard,
// OverlapSlot — they'll be removed from this import during Phase 3 when those
// components are extracted to components/ and import useSlotDnd from lib instead.
import {
  getNightIdForDate,
  getOrCreateNightForDate,
  getTeamMembersForNight,
  getActiveTeamMembers,
  getNightAssignments,
  upsertZoneAssignment,
  toggleAssignmentLock,
  getNightNotes,
  saveNightNotes,
  getGraveAvailableTeamMembers,
  getOnScheduleTmIdsForNight,
  getGravePMOverlapMembers,
  getGraveAMOverlapMembers,
  getSlotTaskCatalog,
  getNightSlotTasks,
  addNightSlotTask,
  removeNightSlotTask,
  addSlotCatalogTask,
  updateNightSlotTaskColor,
  updateNightSlotTaskLabel,
  moveNightSlotTask,
  getNightCardBorders,
  setNightCardBorder,
  removeNightCardBorder,
  getNightBreakAssignments,
  upsertBreakAssignment,
  deleteBreakAssignment,
  updateSlotBreakGroup,
  batchApplyDraftAssignments,
  type CatalogTask,
  type NightSlotTask,
} from "@/lib/shiftbuilder/data";
import { uiToDb, dbToUi, auxDbKeyToDef, type SlotType } from "@/lib/shiftbuilder/slot-keys";
import { useShiftHistory, type Snapshot } from "@/lib/shiftbuilder/useShiftHistory";
import { useCommandActions } from "@/lib/shiftbuilder/useCommandActions";
import {
  // Single source of truth — do NOT re-declare these locally in this file.
  PLACEMENT_ORDER,
  getSlotsInPlacementOrder,
  runCoveragePlanner,
  validatePlacementOrder,
  type AuxDef,
} from "@/lib/shiftbuilder/placement";
import { buildRichGrokContextSnapshot } from "@/lib/shiftbuilder/grokIntelligence";
import { askGrokForStructuredSuggestions } from "./actions";
import { CommandPalette } from "./CommandPalette";
import {
  setTMGravePool,
  setTMDisplayName,
  checkDisplayNameConflict,
  removeTMFromSchedule,
  getCallOffsForDate,
} from "@/lib/shiftbuilder/tmCommands";
import {
  runWeightedPlanner,
  type SlotRanking,
} from "@/lib/shiftbuilder/placement";
import { buildDefaultAdjacency } from "@/lib/shiftbuilder/scoring";
import {
  getActiveEngineConfig,
  type EngineConfig,
} from "@/lib/shiftbuilder/engineConfig";
import {
  getTMPreferences,
  getTMPairAffinities,
  getTMAccommodations,
  getSlotDifficultyRaw,
  getTMSkillScores,
  getRecentZoneHistory,
  getScheduledTmIdsForNight,
} from "@/lib/shiftbuilder/data";
import {
  buildGrokEngineSnapshot,
  mergeGrokOverridesIntoDraft,
  type GrokEngineSnapshot,
} from "@/lib/shiftbuilder/grokEngine";
import { askGrokEngineDraft } from "./actions";
import { SudoWindow } from "./sudo/SudoWindow";
import { XAISphere } from "./xai/XAISphere";
import {
  PrintCommandCenter,
  type PrintConfig,
  MARGIN_VALUES,
  MARGIN_ZOOM,
} from "./components/PrintCommandCenter";
import { useShiftCompletion } from "@/hooks/useShiftCompletion";
// ── Phase 1 extractions — pure code moved to lib/shiftbuilder ─────────────────
import {
  startOfShiftWeek, currentShiftDate, daysBetween, addDays, sameDay,
  formatWeekLabel, SHIFT_DAY_COLORS, MONTH_SHORT, MONTH_LONG, DAY_LONG,
  buildDayDefs, type DayDef,
} from "@/lib/shiftbuilder/dateUtils";
import {
  ZONE_DEFS, RR_DEFS, DEFAULT_AUX_DEFS, EXTRA_AUX_COLORS,
  ZONE_ICONS, RR_ICONS, AUX_ICONS, getAuxIcon,
  ZONE_COLORS, getZoneColor, RR_COLORS, getRRAccent, AUX_COLORS, getAuxAccent,
  type BreakGroup, nextBreakGroup, COVERAGE_BAR_H,
} from "@/lib/shiftbuilder/constants";
import { handleSpotlightMove } from "@/lib/shiftbuilder/spotlightMove";
import { usePencilHover } from "@/lib/shiftbuilder/usePencilHover";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
// ── Phase 2 extractions — primitive UI components ─────────────────────────────
import BreakBadge from "./components/BreakBadge";
import AssignmentLine from "./components/AssignmentLine";
import TaskRow, { TASK_COLOR_SPHERES } from "./components/TaskRow";
import CoverageBar from "./components/CoverageBar";
import ZoneTaskList from "./components/ZoneTaskList";
import ZoneCard from "./components/ZoneCard";
import RRCard from "./components/RRCard";
import AuxCard from "./components/AuxCard";
import OverlapSlot from "./components/OverlapSlot";
import MarkerPad from "./components/MarkerPad";
// Phase 4 — extracted hooks
import { useTheme } from "./hooks/useTheme";
import { useRosterPanels } from "./hooks/useRosterPanels";
import { useToast } from "./hooks/useToast";
import { useZoom, NATURAL_WIDTH, NATURAL_HEIGHT } from "./hooks/useZoom";


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

// ============================================================================
// Coverage helpers — support "Add Coverage" command
// ============================================================================

/** Returns the accent hex for any UI slot key (zone, RR side, aux). */
function getSlotAccentColor(uiKey: string): string {
  if (uiKey.startsWith('MRR') || uiKey.startsWith('WRR')) {
    const num = parseInt(uiKey.replace(/^[MW]RR/, ''), 10);
    return getRRAccent(num);
  }
  if (uiKey.startsWith('Z')) return getZoneColor(uiKey);
  return '#6B7280';
}

/** Returns a human-readable label for a slot (e.g. "Zone 3", "Restroom 7"). */
function getSlotCoverageLabel(uiKey: string): string {
  if (uiKey === 'Z9SR') return 'Zone 9SR';
  if (uiKey.startsWith('Z')) return `Zone ${uiKey.slice(1)}`;
  if (uiKey.startsWith('MRR') || uiKey.startsWith('WRR')) {
    return `Restroom ${uiKey.replace(/^[MW]RR/, '')}`;
  }
  return uiKey;
}

/** For an RR key (MRR7, WRR7, or MRR7 canonical) return both M and W keys.
 *  For zone keys return [key]. */
function expandCoverageToKeys(uiKey: string): string[] {
  if (uiKey.startsWith('MRR')) return [uiKey, `WRR${uiKey.slice(3)}`];
  if (uiKey.startsWith('WRR')) return [`MRR${uiKey.slice(3)}`, uiKey];
  return [uiKey];
}

/**
 * CoverageBar — rendered at the very bottom of a zone or RR card to show
 * that the TM is pulling double duty covering another slot.
 * Background is the accent color of the SOURCE slot.
 */
// RRCard, AuxCard, OverlapSlot (and their sub-components) now imported from components/ above.

// Roster row — useDraggable when not already assigned. When assigned we
// disable the drag handle but still render so the operator can see "in use".
const RosterItem: React.FC<{ tm: any; isAssigned: boolean; emphasis: "on" | "off" | "scheduled" }> = ({ tm, isAssigned, emphasis }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tm:${tm.id}`,
    data: { type: "tm", tmId: tm.id, tmName: tm.name },
    disabled: isAssigned,
  });

  const initials = tm.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isDraggable = !isAssigned;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-[3px] text-sm touch-none transition-all border border-transparent ${
        isAssigned
          ? "opacity-45 cursor-not-allowed"
          : `hover:bg-[#F8F8F9] hover:border-[#E5E5E7] hover:shadow-sm ${emphasis === "on" ? "border-l-2 border-[#007AFF] bg-white/70" : emphasis === "scheduled" ? "border-l-2 border-amber-400 bg-amber-50/60" : ""} cursor-grab active:cursor-grabbing`
      } ${isDragging ? "opacity-25 scale-[0.985]" : ""}`}
    >
      {/* Drag grip (Phase 2 affordance) */}
      {isDraggable && (
        <div className="flex h-5 w-4 shrink-0 items-center justify-center text-[#9CA3AF] group-hover:text-[#6B7280] transition-colors">
          <span className="ms" style={{ fontSize: 14, fontVariationSettings: '"FILL" 1, "wght" 300, "opsz" 20' }}>drag_indicator</span>
        </div>
      )}

      {/* Avatar (initials) — calmer, Golden-appropriate */}
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-1 ring-white/70"
        style={{ backgroundColor: emphasis === "on" ? "#007AFF" : emphasis === "scheduled" ? "#d97706" : "#5A5A5F" }}
      >
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate font-semibold tracking-[-0.1px] text-[12.5px] text-[#1C1C1E]">
            {tm.name}
          </div>

          {/* Primary Section Badge */}
          {tm.primarySection && (
            <span
              className="inline-flex items-center rounded px-1.5 py-px text-[9px] font-medium tracking-wide"
              style={{ backgroundColor: "#007AFF15", color: "#007AFF" }}
            >
              {tm.primarySection}
            </span>
          )}

          {/* GRAVE pool indicator when present (strong signal for this filter) */}
          {tm.gravePool && (
            <span
              className="inline-flex items-center rounded px-1 py-px text-[8px] font-semibold tracking-[0.5px]"
              style={{ backgroundColor: "#34C75915", color: "#1f7a3d" }}
              title={`Grave pool: ${tm.gravePool}`}
            >
              G
            </span>
          )}
        </div>

        <div className="text-[10px] text-[#8E8E93] font-mono tabular-nums tracking-[-0.2px]">
          {tm.id}
        </div>
      </div>

      {/* Status — very calm treatment (no loud pills) */}
      {isAssigned && (
        <div className="text-[#34C759] shrink-0" title="Already assigned this night">
          <span className="ms" style={{ fontSize: 16, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}>check_circle</span>
        </div>
      )}
    </div>
  );
};

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

const HeaderOverflow: React.FC<HeaderOverflowProps> = ({ onRunEngine, onPrint, onAddAuxSlot, onRemoveAuxSlot, lastAuxSlotLabel }) => {
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
            onClick={() => { setOpen(false); /* TODO: hook lock-and-finalize handler */ }}
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
const RosterDropZone: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => {
  const { setNodeRef, isOver, active } = useDroppable({
    id: "roster",
    data: { type: "roster" },
  });

  const isDraggingAssigned = active?.data.current?.type === "assigned";
  const isDraggingFromRoster = active?.data.current?.type === "tm";
  const highlight = isOver && (isDraggingAssigned || isDraggingFromRoster);

  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${highlight ? "roster-drop-active" : ""} transition-all duration-150 relative`}
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

// ── Print Command Center — Overview & Cover Page HTML Generators ──────────────
// Module-level so they don't get recreated on every render and can be called
// directly from handlePrintWithConfig's async pipeline.

/** Matches SHIFT_DAY_COLORS order (Fri → Thu). */
const _OVW_DAY_COLORS = ["#C13A14","#0065bf","#4d1a8a","#1f7a3d","#b8860b","#8b4513","#2f4f4f"];

interface OverviewNight {
  dayIndex: number;
  assignments: Record<string, { tmId: string; tmName: string } | null>;
}

/**
 * Generates a landscape .print-artboard HTML string for the Weekly Overview.
 * Shows all selected nights as columns and all slots (Zones, RRs, Aux) as rows.
 */
function buildOverviewArtboardHTML(
  overviewNights: OverviewNight[],
  dayDefs: DayDef[],
): string {
  const nights = [...overviewNights].sort((a, b) => a.dayIndex - b.dayIndex);
  const N = nights.length;

  // All slot rows with section grouping
  const slotRows: { key: string; label: string; section: string; accent: string }[] = [];
  ZONE_DEFS.forEach(z => slotRows.push({ key: z.key, label: z.label, section: "ZONES", accent: ZONE_COLORS[z.key] ?? "#6B7280" }));
  RR_DEFS.forEach(rr => {
    slotRows.push({ key: `MRR${rr.num}`, label: `${rr.label} M`, section: "RESTROOMS", accent: RR_COLORS[rr.num] ?? "#6B7280" });
    slotRows.push({ key: `WRR${rr.num}`, label: `${rr.label} W`, section: "RESTROOMS", accent: RR_COLORS[rr.num] ?? "#6B7280" });
  });
  DEFAULT_AUX_DEFS.forEach(a => slotRows.push({ key: a.key, label: a.label, section: "SUPPORT", accent: AUX_COLORS[a.key] ?? "#6B7280" }));

  const ROW_H = 24;
  const SEC_H = 20;
  const SLOT_W = 96;

  const nightDefs = nights.map(n => ({
    night: n,
    def: dayDefs[n.dayIndex] ?? { name: `Day ${n.dayIndex}`, short: "?", color: "#6B7280", dateNum: 0, monthYear: "" } as DayDef,
  }));

  // Column header cells
  const colHeaderCells = nightDefs.map(({ def }) =>
    `<div style="flex:1;text-align:center;font-size:10px;font-weight:700;color:${def.color};` +
    `padding:4px 2px;letter-spacing:0.04em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;` +
    `border-left:1px solid #E5E5EA;">${def.name.slice(0,3).toUpperCase()} ${def.dateNum}</div>`
  ).join("");

  // Table rows grouped by section
  let tableRowsHTML = "";
  (["ZONES", "RESTROOMS", "SUPPORT"] as const).forEach(sec => {
    const rows = slotRows.filter(r => r.section === sec);
    if (!rows.length) return;
    tableRowsHTML +=
      `<div style="display:flex;align-items:center;height:${SEC_H}px;background:#F2F2F7;` +
      `border-top:1px solid #C8C8CC;flex-shrink:0;">` +
      `<div style="width:${SLOT_W}px;padding:0 8px;font-size:8.5px;font-weight:800;color:#6B7280;` +
      `letter-spacing:0.09em;text-transform:uppercase;">${sec}</div>` +
      `<div style="flex:1;"></div></div>`;

    rows.forEach((slot, ri) => {
      const bg = ri % 2 === 0 ? "#FFFFFF" : "#F9F9FB";
      const cells = nightDefs.map(({ night }) => {
        const asgn = night.assignments[slot.key];
        const name = asgn?.tmName ?? "—";
        const disp = name.length > 15 ? name.slice(0, 14) + "…" : name;
        const filled = !!asgn?.tmId;
        return `<div style="flex:1;height:${ROW_H}px;line-height:${ROW_H}px;padding:0 5px;` +
          `font-size:9.5px;font-weight:${filled ? "600" : "400"};color:${filled ? "#1C1C1E" : "#AEAEB2"};` +
          `overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-left:1px solid #EBEBF0;">${disp}</div>`;
      }).join("");
      tableRowsHTML +=
        `<div style="display:flex;align-items:center;height:${ROW_H}px;background:${bg};` +
        `border-top:1px solid #F2F2F7;flex-shrink:0;">` +
        `<div style="width:${SLOT_W}px;height:${ROW_H}px;line-height:${ROW_H}px;padding:0 8px;` +
        `font-size:9.5px;font-weight:700;color:${slot.accent};overflow:hidden;text-overflow:ellipsis;` +
        `white-space:nowrap;border-right:1px solid #E5E5EA;">${slot.label}</div>${cells}</div>`;
    });
  });

  const stripeHTML = _OVW_DAY_COLORS.map(c => `<div style="flex:1;height:4px;background:${c};"></div>`).join("");
  const firstDef = nightDefs[0]?.def;
  const lastDef  = nightDefs[nightDefs.length - 1]?.def;
  const rangeLabel = firstDef && lastDef
    ? `${firstDef.name.slice(0,3)} ${firstDef.dateNum} – ${lastDef.name.slice(0,3)} ${lastDef.dateNum}`
    : "Week Overview";

  return (
    `<div class="print-artboard" style="padding:0;display:flex;flex-direction:column;overflow:hidden;background:#FFFFFF;">` +
    `<div style="display:flex;flex-shrink:0;">${stripeHTML}</div>` +
    `<div style="background:linear-gradient(135deg,#1C1C1E 0%,#2C2C2E 100%);padding:9px 20px 7px;` +
    `flex-shrink:0;display:flex;align-items:center;justify-content:space-between;">` +
    `<div><div style="font-size:13px;font-weight:800;color:#FFFFFF;letter-spacing:0.05em;text-transform:uppercase;">Week Overview</div>` +
    `<div style="font-size:9px;font-weight:500;color:#8E8E93;margin-top:1px;">${rangeLabel} · ${N} night${N !== 1 ? "s" : ""} · ${slotRows.length} slots</div></div>` +
    `<div style="font-size:10px;font-weight:600;color:#636366;letter-spacing:0.02em;">GLCR GRAVE SHIFT</div></div>` +
    `<div style="display:flex;background:#F8F8FB;border-bottom:2px solid #C8C8CC;flex-shrink:0;">` +
    `<div style="width:${SLOT_W}px;padding:4px 8px;font-size:9px;font-weight:700;color:#8E8E93;text-transform:uppercase;letter-spacing:0.06em;">Slot</div>` +
    `${colHeaderCells}</div>` +
    `<div style="flex:1;overflow:hidden;display:flex;flex-direction:column;">${tableRowsHTML}</div>` +
    `</div>`
  );
}

/**
 * Generates a dark-themed cover page artboard HTML string.
 * Shows week label, contents breakdown, total pages, and GLCR branding.
 */
function buildCoverPageArtboardHTML(
  dayDefs: DayDef[],
  config: PrintConfig,
  totalPages: number,
): string {
  const deployCount = config.days.filter(d => d.printDeploy).length;
  const breaksCount = config.days.filter(d => d.printBreaks).length;
  const ovwCount    = config.includeOverview ? 1 : 0;

  const contents: { label: string; pages: number; color: string }[] = [];
  if (deployCount) contents.push({ label: "Deployment Sheets", pages: deployCount, color: "#34C759" });
  if (breaksCount) contents.push({ label: "Break Sheets",       pages: breaksCount, color: "#FF9F0A" });
  if (ovwCount)    contents.push({ label: "Week Overview",       pages: 1,           color: "#5856D6" });

  const activeDefs = config.days
    .filter(d => d.printDeploy || d.printBreaks)
    .map(d => dayDefs[d.dayIndex])
    .filter((d): d is DayDef => !!d);
  const firstDef = activeDefs[0];
  const lastDef  = activeDefs[activeDefs.length - 1];
  const weekRange = firstDef && lastDef
    ? `${firstDef.name} ${firstDef.dateNum} – ${lastDef.name} ${lastDef.dateNum}, ${firstDef.monthYear.split(" ")[1] ?? firstDef.monthYear}`
    : "Shift Week";

  const stripeHTML = _OVW_DAY_COLORS.map(c => `<div style="flex:1;background:${c};"></div>`).join("");

  const contentsHTML = contents.map(c =>
    `<div style="display:flex;align-items:center;gap:14px;padding:6px 0;border-bottom:1px solid #2C2C2E;">` +
    `<div style="width:8px;height:8px;border-radius:50%;background:${c.color};flex-shrink:0;"></div>` +
    `<div style="flex:1;font-size:13px;font-weight:500;color:#EBEBF5;">${c.label}</div>` +
    `<div style="font-size:13px;font-weight:600;color:#8E8E93;">${c.pages} page${c.pages !== 1 ? "s" : ""}</div></div>`
  ).join("");

  const nightChips = activeDefs.map(def =>
    `<div style="padding:3px 10px;border-radius:4px;font-size:10px;font-weight:700;color:#FFFFFF;background:${def.color};letter-spacing:0.03em;">${def.name.slice(0,3).toUpperCase()} ${def.dateNum}</div>`
  ).join("");

  const printedDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    `<div class="print-artboard" style="padding:0;display:flex;flex-direction:column;overflow:hidden;background:#1C1C1E;">` +
    `<div style="display:flex;height:6px;flex-shrink:0;">${stripeHTML}</div>` +
    `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 80px;">` +
    `<div style="font-size:11px;font-weight:700;color:#636366;letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px;">Gun Lake Casino Resort</div>` +
    `<div style="font-size:46px;font-weight:900;color:#FFFFFF;text-align:center;line-height:1.05;letter-spacing:-0.01em;margin-bottom:4px;">GRAVE SHIFT</div>` +
    `<div style="font-size:46px;font-weight:900;color:#FFFFFF;text-align:center;line-height:1.05;letter-spacing:-0.01em;margin-bottom:20px;">PRINT BOOK</div>` +
    `<div style="font-size:16px;font-weight:600;color:#8E8E93;margin-bottom:24px;letter-spacing:0.01em;">${weekRange}</div>` +
    `<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-bottom:36px;">${nightChips}</div>` +
    `<div style="width:380px;background:#2C2C2E;border-radius:10px;padding:16px 20px;">` +
    `<div style="font-size:10px;font-weight:700;color:#636366;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:8px;">Contents</div>` +
    `${contentsHTML}` +
    `<div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;margin-top:4px;">` +
    `<div style="font-size:12px;font-weight:600;color:#8E8E93;text-transform:uppercase;letter-spacing:0.06em;">Total Pages</div>` +
    `<div style="font-size:22px;font-weight:800;color:#FFFFFF;">${totalPages}</div></div></div></div>` +
    `<div style="padding:10px 28px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid #2C2C2E;flex-shrink:0;">` +
    `<div style="font-size:9px;color:#48484A;letter-spacing:0.06em;text-transform:uppercase;">Confidential · Internal Use Only</div>` +
    `<div style="font-size:9px;color:#48484A;letter-spacing:0.06em;">Printed ${printedDate}</div></div>` +
    `</div>`
  );
}

export default function ShiftBuilder() {
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
    const d = new Date(saved);
    return isNaN(d.getTime()) ? null : d;
  };

  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    const savedDate = getSavedDate();
    if (savedDate) {
      const ws = startOfShiftWeek(savedDate);
      const idx = Math.max(0, Math.min(6, daysBetween(ws, savedDate)));
      return idx;
    }
    // Fallback: last index only (legacy), else compute from current shift
    const legacy = localStorage.getItem("oms_selected_day_index");
    if (legacy !== null) {
      const idx = parseInt(legacy, 10);
      if (!isNaN(idx) && idx >= 0 && idx <= 6) return idx;
    }
    const shift = currentShiftDate();
    const ws = startOfShiftWeek(shift);
    return daysBetween(ws, shift);
  });

  const [currentView, setCurrentView] = useState<"deployment" | "breaks">(() => {
    const saved = localStorage.getItem("oms_current_view");
    return (saved === "breaks" || saved === "deployment") ? saved : "deployment";
  });

  // Day picker popover state for the left-rail colored day number.
  // When true we render a floating horizontal strip of the 7 days immediately
  // to the right of the left control rail.
  const [dayPickerOpen, setDayPickerOpen] = useState(false);

  // Calendar popover (full month picker) for jumping to any date via the left-rail calendar icon.
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarView, setCalendarView] = useState<Date>(() => new Date());

  // Centered expandable control cluster (new primary control surface).
  // Single orb centered on the browser. Tapping expands a centered row of all actions
  // (roster icon is now inside the "drawer"/cluster). Expands from the center, stays centered.
  // controlsExpanded removed — centered orb replaced by Velvet bottom dock

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

  // (centered-control-orb collapse effect removed — orb replaced by Velvet bottom dock)

  const [breakGroup, setBreakGroup] = useState<1 | 2 | 3>(1);
  const [assignments, setAssignments] = useState<any>(() => ({})); // live data only — the Golden visual structure + fallback names live in the card renderers and GOLDEN_VISUAL_SPEC. The robust scale below guarantees the paper itself is always visible.
  const [realRoster, setRealRoster] = useState<any[]>([]);
  const [graveRoster, setGraveRoster] = useState<any[]>([]); // GRAVE-shift filtered roster (Option B)
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Session undo/redo (in-memory, one tab)
  const shiftHistory = useShiftHistory();

  // Stable ref to recordChange so the history effect below doesn't depend on
  // the shiftHistory object (which is a new reference every render) — prevents
  // the effect firing on every render instead of only when state actually changes.
  const recordChangeRef = useRef(shiftHistory.recordChange);
  useEffect(() => { recordChangeRef.current = shiftHistory.recordChange; });

  const positioningRef = useRef<HTMLDivElement>(null);

  // Undo/Redo recording coordination
  const pendingHistoryRef = useRef<{ description: string; before: Snapshot } | null>(null);



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

  // === Live data: nightId resolves from the selected date ==================
  // Null means "no row exists in Supabase for this date yet" — the UI renders
  // empty cards and the first persist will lazy-create the night. Saving any
  // value here re-fetches roster + assignments via the effects below.
  const [nightId, setNightId] = useState<string | null>(null);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  // === Slot task catalog + selections ===================================
  // catalog: the menu of POSSIBLE tasks per slot (slot_task_catalog rows),
  // loaded once on mount. Indexed in a useMemo below by `${slotType}:${slotKey}:${rrSide ?? ""}`
  // for O(1) lookup from the popover.
  //
  // selectedTasks: per-night SELECTIONS, keyed by the UI slot key (Z1, MRR1,
  // etc.) so the card renderers can read tasks for a slot without round-tripping
  // through the db key. Replaces the static `def.locations` arrays.
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

  // === Dark mode state ======================================================
  const { isDark, toggleTheme } = useTheme();
  // Raw break_assignments rows for the current night — used to render the
  // break sheet from the authoritative source rather than from zone_assignments,
  // so all 23 TMs always appear regardless of who is actually placed tonight.
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
    scheduledAMExpanded, setScheduledAMExpanded,
    rosterSearch, setRosterSearch,
    graveOnly, setGraveOnly,
    cmdkOpen, setCmdkOpen,
    cmdkInitialContext, setCmdkInitialContext,
  } = useRosterPanels();

  // Persist the exact selected GRAVE day (calendar date) so refresh restores
  // both the correct weekStart and the day index within that week.
  useEffect(() => {
    if (DAY_DEFS.length > 0) {
      const d = DAY_DEFS[selectedDayIndex]?.date;
      if (d) {
        localStorage.setItem("oms_selected_date", d.toISOString());
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
  const [printProgress, setPrintProgress] = useState<{ current: number; total: number; label: string } | null>(null);

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
      setNightCardBorder(nightId, slotKey, color).catch((e) => {
        console.error("Failed to persist card border", e);
        showToast("Couldn't save border (will retry on reload)", "error");
      });
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
      removeNightCardBorder(nightId, slotKey).catch((e) => {
        console.error("Failed to remove card border", e);
        showToast("Couldn't remove border (will retry on reload)", "error");
      });
    }
  };

  // Live break counts — one TM per (slot, break_group). Powers the three
  // small badges in the artboard header so operators can see at a glance
  // how balanced the wave loads are. Recomputes whenever assignments shift.
  const breakCounts = React.useMemo(() => {
    const counts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
    Object.values(assignments).forEach((a: any) => {
      if (!a?.tmName) return;
      const g = (a.breakGroup ?? 0) as BreakGroup;
      // Off-the-sheet (0) intentionally excluded from rotation counts.
      if (g === 1 || g === 2 || g === 3) counts[g]++;
    });
    return counts;
  }, [assignments]);
  const inRotationCount = breakCounts[1] + breakCounts[2] + breakCounts[3];

  // === Roster filtering (Phase 1 + GRAVE Phase 2) ============================
  // Component-level Set for O(1) "is this TM already on the board?" checks.
  // Replaces the O(n) Object.values().some() pattern used across the roster rail
  // and the completionScheduledUnplaced filter.
  const assignedThisNight = React.useMemo(
    () => new Set(Object.values(assignments).map((a: any) => a?.tmId).filter(Boolean)),
    [assignments]
  );

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

  // === Dynamic AUX slots ===
  // Defaults to 5; operator can append from the overflow menu. Keys are
  // unique per slot — assignments are stored by key in `assignments`, so a
  // newly added slot starts empty and survives roster drags / engine runs
  // exactly like a default slot.
  const [auxDefs, setAuxDefs] = useState<AuxDef[]>(DEFAULT_AUX_DEFS);
  const addAuxSlot = () => {
    const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
    pendingHistoryRef.current = { description: "Added custom AUX slot", before };

    setAuxDefs((prev) => {
      let n = prev.length + 1;
      let candidate = `AUX${n}`;
      while (prev.some((d) => d.key === candidate)) {
        n++;
        candidate = `AUX${n}`;
      }

      const next = [...prev, { key: candidate, label: `AUX ${n}`, locations: [] }];

      // Validate placement order for new dynamic slots
      const warnings = validatePlacementOrder(next);
      if (warnings.length > 0) {
        console.warn("[Placement] AUX slot added out of order:", warnings);
        // Future: surface toast / warning in UI
      }

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
  const scheduleFilterActive = scheduledTmIdsTonight.size > 0;

  const availableGraveRoster = React.useMemo(
    () =>
      graveRoster.filter(
        (t: any) =>
          !calledOffIds.has(t.id) &&
          (!scheduleFilterActive || scheduledTmIdsTonight.has(t.id))
      ),
    [graveRoster, calledOffIds, scheduleFilterActive, scheduledTmIdsTonight]
  );
  const availableRealRoster = React.useMemo(
    () =>
      realRoster.filter(
        (t: any) =>
          !calledOffIds.has(t.id) &&
          (!scheduleFilterActive || scheduledTmIdsTonight.has(t.id))
      ),
    [realRoster, calledOffIds, scheduleFilterActive, scheduledTmIdsTonight]
  );

  // === Draft Mode Controls ===
  //
  // Phase 1: Grok-hybrid engine. Pipeline:
  //   1. Deterministic weighted planner produces Top-K candidate ranking per slot
  //   2. Build snapshot (rankings + notes + call-offs + history + config) for Grok
  //   3. Grok overrides deterministic picks where it has judgment to add
  //   4. Server-side guard rejects any pick not in the candidate list
  //   5. Failures fall back to deterministic top-scorer (no UX disruption)
  const enterDraftMode = async () => {
    if (!confirm("Run Coverage Planner and enter Draft Mode? This will generate a preview without changing current assignments.")) {
      return;
    }

    if (!engineConfig) {
      showToast("Engine config still loading — try again in a moment");
      return;
    }

    const orderedSlots = getSlotsInPlacementOrder(auxDefs);
    const rosterForEngine = graveOnly ? availableGraveRoster : availableRealRoster;

    // Step 1: deterministic weighted planner
    const plannerResult = runWeightedPlanner({
      orderedSlots,
      assignments,
      roster: rosterForEngine,
      graveOnly,
      scoringCtx: {
        config: engineConfig,
        skillScores: tmSkillScores,
        slotDifficulty,
        preferencesByTm: tmPreferencesByTm,
        pairAffinitiesByTm: tmPairAffinitiesByTm,
        accommodationsByTm: tmAccommodationsByTm,
        adjacency: buildDefaultAdjacency(),
      },
    });

    // Step 2: build Grok snapshot
    const operatorNotes = notesRef.current?.innerText || "";
    let snapshot: GrokEngineSnapshot;
    try {
      snapshot = buildGrokEngineSnapshot({
        dayName: selectedDay.name,
        shiftDate: selectedDay.date,
        plannerResult,
        roster: rosterForEngine,
        operatorNotes,
        calledOffTmIds: calledOffIds,
        recentHistory: recentZoneHistory,
        config: engineConfig,
        placementOrder: orderedSlots,
      });
    } catch (err) {
      console.error("[engine] snapshot build failed:", err);
      showToast("Engine snapshot build failed — falling back to scoring only");
      applyPlannerResultAsDraft(plannerResult, rosterForEngine, {});
      return;
    }

    // Step 3: ask Grok (with timeout fallback)
    let grokResult;
    try {
      grokResult = await askGrokEngineDraft(snapshot);
    } catch (err) {
      console.error("[engine] Grok call failed:", err);
      grokResult = { picks: [], explanation: "", warnings: ["Grok call failed"], usedGrok: false, rawText: "" };
    }

    // Step 4: merge Grok overrides with deterministic picks
    const { proposedAssignments, reasoningBySlot } = mergeGrokOverridesIntoDraft({
      plannerResult,
      picks: grokResult.picks,
    });

    applyPlannerResultAsDraft(
      { ...plannerResult, proposedAssignments },
      rosterForEngine,
      reasoningBySlot,
      grokResult.explanation,
      grokResult.warnings
    );
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
    const newDraft: typeof draftAssignments = {};
    Object.entries(result.proposedAssignments).forEach(([slotKey, tmId]) => {
      const current = assignments[slotKey];
      const tm = rosterForLookup.find((t: any) => t.id === tmId);
      if (tm) {
        newDraft[slotKey] = {
          proposedTmId: tmId,
          proposedTmName: tm.name || tm.fullName || tm.id,
          previousTmId: current?.tmId,
          previousTmName: current?.tmName,
        };
      }
    });
    setDraftAssignments(newDraft);
    setDraftBreakdown(result.breakdown);
    setDraftGrokReasoning(reasoningBySlot);
    setDraftGrokExplanation(grokExplanation);
    setDraftEngineWarnings(warnings);
    setIsDraftMode(true);
  };

  const applyDraft = async () => {
    if (!isDraftMode || Object.keys(draftAssignments).length === 0) return;

    if (!confirm("Apply the draft assignments and save them permanently? This cannot be undone automatically.")) {
      return;
    }

    // Snapshot before state for undo
    const before: Snapshot = { assignments: { ...assignments }, auxDefs: [...auxDefs] };

    // Compute the full new assignments state in one pass — no N separate setAssignments calls
    const newAssignments = { ...assignments };
    for (const [slotKey, info] of Object.entries(draftAssignments)) {
      if (info.proposedClear) {
        delete newAssignments[slotKey];
      } else if (info.proposedTmId) {
        newAssignments[slotKey] = {
          ...newAssignments[slotKey],
          tmId: info.proposedTmId,
          tmName: info.proposedTmName,
          breakGroup: newAssignments[slotKey]?.breakGroup ?? 0,
          type: slotKey.startsWith("Z") ? "zone"
            : slotKey.startsWith("MRR") || slotKey.startsWith("WRR") ? "rr"
            : slotKey.startsWith("OL-") ? "overlap"
            : "aux",
          slotKey,
        };
      }
    }

    // Single state update + one atomic history entry (we have before & after explicitly
    // so we skip the pendingHistoryRef pattern entirely)
    setAssignments(newAssignments);
    const after: Snapshot = { assignments: newAssignments, auxDefs: [...auxDefs] };
    recordChangeRef.current("Apply Engine Draft", before, after);

    // Exit draft mode immediately (UI feels instant)
    setIsDraftMode(false);
    setDraftAssignments({});

    // Resolve night once, then batch-persist the whole draft in a single call
    let nid = nightId;
    if (!nid) nid = await resolveNightIdForDate(selectedDay.date, selectedDay.name);
    if (!nid) {
      showToast("Draft applied locally but couldn't save — no night context. Reload and try again.");
      return;
    }

    try {
      const slots = Object.entries(draftAssignments).map(([slotKey, info]) => {
        const { slot_key, slot_type, rr_side } = uiToDb(slotKey);
        return {
          slotKey: slot_key,
          slotType: slot_type,
          rrSide: rr_side,
          tmId: info.proposedClear ? null : (info.proposedTmId ?? null),
        };
      });

      await batchApplyDraftAssignments(nid, slots);
      setLastSavedAt(new Date());
    } catch (e: any) {
      console.error("[shiftbuilder] batchApplyDraft failed", e);
      showToast(`Draft saved locally but DB write failed: ${e?.message ?? "unknown error"}`);
    }
  };

  const discardDraft = () => {
    if (!isDraftMode) return;

    if (confirm("Discard the current engine draft?")) {
      setIsDraftMode(false);
      setDraftAssignments({});
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
    const rosterToUse = graveOnly ? graveRoster : realRoster;

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

    const result = await askGrokForStructuredSuggestions({
      snapshot,
      rosterForGuard: availableGraveRoster,
      userQuestion: resolvedQuestion,
    });

    return result;
  };

  const triggerGrokBoardAnalysis = () => {
    // Opens the palette (if not already) and the palette's global board button will be visible and prominent
    setCmdkOpen(true);
    // The prominent "Grok: Analyze Full Board" button is always at the top of the palette now
  };
  // Pop the most recently added AUX slot. Defaults are protected so the
  // operator can't accidentally remove SUPPORT 1 / TRASH 1 / etc. Any TM
  // assigned to the popped slot is automatically freed (their assignment
  // entry is cleared, so they re-appear as available in the roster).
  const canRemoveAux = auxDefs.length > DEFAULT_AUX_DEFS.length;
  const removeLastAuxSlot = () => {
    if (!canRemoveAux) return;
    const removed = auxDefs[auxDefs.length - 1];
    const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
    pendingHistoryRef.current = { description: `Removed ${removed.label}`, before };

    setAuxDefs((prev) => prev.slice(0, -1));
    setAssignments((a: any) => {
      if (!a[removed.key]) return a;
      const copy = { ...a };
      delete copy[removed.key];
      return copy;
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
  const [markerSlotKey, setMarkerSlotKey] = useState<string | null>(null);

  // === Phase 1: Clean contextual palette openers (will replace fan behavior) ===
  // Card tap now opens the Marker Pad; ⌘K still opens the full palette.
  const openPaletteForSlot = React.useCallback((slotKey: string) => {
    // If the pad is already showing this slot, toggle it closed
    setMarkerSlotKey(prev => prev === slotKey ? null : slotKey);
  }, []);

  const openPaletteForPerson = React.useCallback((tm: any) => {
    // Use id when available for stability; fall back to name
    const value = tm?.id || tm?.fullName || tm?.name || '';
    setCmdkInitialContext({ type: 'person', value });
    setCmdkOpen(true);
  }, []);

  // When palette closes, clear the one-time context so next manual ⌘K is clean
  React.useEffect(() => {
    if (!cmdkOpen) {
      // Small delay so the palette can read the value on this open cycle
      const t = setTimeout(() => setCmdkInitialContext(null), 50);
      return () => clearTimeout(t);
    }
  }, [cmdkOpen]);

  const isCurrentWeek = sameDay(weekStart, startOfShiftWeek(todayDate));

  // Each pill group collapses to its active value by default and expands
  // inline on tap. Click-outside or ESC dismisses; selecting collapses with
  // the new active value (handled per-group at the onClick call sites).
  // Left-rail day/week/view controls now live in the fixed left control rail
  // (no more bottom floating pill cluster). The old collapsible pill hooks
  // are retired with the bottom UI.

  // === Zoom & centering (extracted to useZoom) ===
  const { zoomMode, setZoomMode, fitScale, stageHostRef, scale, recomputeScale } = useZoom({ rosterOpen });

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
          const slotKey = cardEl.getAttribute('data-slot-key');
          if (slotKey) {
            openPaletteForSlot(slotKey);
          }
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
  }, [openPaletteForSlot]);

  const selectedDay = DAY_DEFS[selectedDayIndex];

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
          nid = await getOrCreateNightForDate(captureDate, captureDayName);
        }
        if (!nid) return;
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
    const tmId = assignments[slotKey]?.tmId ?? null;

    setAssignments((prev: any) => ({
      ...prev,
      [slotKey]: { ...prev[slotKey], breakGroup: group },
    }));

    (async () => {
      let nid = targetNightId;
      if (!nid) nid = await resolveNightIdForDate(captureDate, captureDayName);
      if (!nid) {
        showToast(`Couldn't save break group: no night context yet`);
        return;
      }
      try {
        // Always persist to zone_assignments.break_group — the canonical card display source.
        await updateSlotBreakGroup(
          nid,
          slotKey,
          assignments[slotKey]?.rrSide ?? null,
          group,
        );

        // Also keep break_assignments in sync for the break-sheet / print path.
        if (tmId) {
          if (group === 0) {
            await deleteBreakAssignment(nid, tmId);
          } else {
            await upsertBreakAssignment({
              nightId: nid,
              tmId,
              groupNum: group,
              slotRef: slotKey,
            });
          }
        }
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
  const assign = (slotKey: string, tmId: string, tmName: string) => {
    const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
    pendingHistoryRef.current = { description: `Assigned ${tmName} to ${slotKey}`, before };

    const targetNightId = nightId;
    const captureDate = selectedDay.date;
    const captureDayName = selectedDay.name;

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
  };

  const unassign = (slotKey: string) => {
    const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
    pendingHistoryRef.current = { description: `Unassigned from ${slotKey}`, before };

    const targetNightId = nightId;
    const captureDate = selectedDay.date;
    const captureDayName = selectedDay.name;
    const tmIdBeingRemoved = assignments[slotKey]?.tmId ?? null;

    setAssignments((prev: any) => {
      const copy = { ...prev };
      delete copy[slotKey];
      return copy;
    });
    persistAssign(targetNightId, captureDate, captureDayName, slotKey, null);

    // Drop the break_assignments row for this TM so a re-assign gets a fresh
    // group instead of inheriting a stale one. Fire-and-forget.
    if (tmIdBeingRemoved) {
      (async () => {
        let nid = targetNightId;
        if (!nid) nid = await resolveNightIdForDate(captureDate, captureDayName);
        if (nid) {
          try { await deleteBreakAssignment(nid, tmIdBeingRemoved); }
          catch (e: any) { console.error("[shiftbuilder] deleteBreakAssignment failed", e); }
        }
      })();
    }
  };

  const toggleLock = (slotKey: string) => {
    const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
    const willLock = !assignments[slotKey]?.isLocked;
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
  }, [currentView]);

  // Prints all 7 days in the active week: 14 pages (deployment + break sheet per day).
  // Cycles through each day, waits for Supabase data to load, captures both views,
  // then prints the full batch in one window.print() call.
  const handlePrintWeek = React.useCallback(async () => {
    const originalDayIndex = selectedDayIndex;
    const originalView = currentView;

    const nextFrames = (n: number) =>
      new Promise<void>((resolve) => {
        let count = 0;
        const tick = () => { count++; if (count >= n) resolve(); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });

    // Wait until night data is fully loaded for the current day.
    // Fast path: if not loading right now, the data is already ready — resolve immediately.
    // Slow path: a fetch is in flight — poll at 60ms intervals until loadingAssignmentsRef
    //            goes false (fetch done) or we exceed the timeout.
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

    // Shared post-processing for breaks artboards: pin overlaps above footer.
    const postProcessBreaksArtboard = (artboard: Element) => {
      const el = artboard as HTMLElement;
      const contentArea = el.querySelector(".flex-1.min-h-0.overflow-hidden.flex.flex-col") as HTMLElement | null;
      if (contentArea) {
        contentArea.style.display = "flex";
        contentArea.style.flexDirection = "column";
        contentArea.style.flex = "1 1 0%";
        contentArea.style.minHeight = "0";
        contentArea.style.overflow = "hidden";
      }
      const waveGrid = contentArea?.firstElementChild as HTMLElement | null;
      if (waveGrid && !waveGrid.classList.contains("overlaps-section")) {
        waveGrid.style.flex = "1 1 0%";
        waveGrid.style.minHeight = "0";
        waveGrid.style.overflow = "hidden";
        waveGrid.style.alignContent = "start";
      }
      const overlaps = el.querySelector(".overlaps-section") as HTMLElement | null;
      if (overlaps) { overlaps.style.flexShrink = "0"; overlaps.style.marginTop = "0"; }
    };

    showToast(`Preparing week print… 0 / ${DAY_DEFS.length}`, "info");

    const allPages: string[] = [];

    try {
      for (let dayIdx = 0; dayIdx < DAY_DEFS.length; dayIdx++) {
        // Switch day and wait for Supabase data to settle.
        flushSync(() => setSelectedDayIndex(dayIdx));
        await waitForLoad();
        await nextFrames(4); // Extra frames for React to fully commit all derived state

        const liveArtboard = document.querySelector(".print-artboard") as HTMLElement | null;
        if (!liveArtboard) continue;

        // ── Deployment capture ────────────────────────────────────────
        flushSync(() => setCurrentView("deployment"));
        await nextFrames(2);
        liveArtboard.style.visibility = "";
        const deploymentHTML = liveArtboard.outerHTML;
        liveArtboard.style.visibility = "hidden";

        // ── Breaks capture ────────────────────────────────────────────
        flushSync(() => setCurrentView("breaks"));
        await nextFrames(2);

        const prevH   = liveArtboard.style.height;
        const prevMH  = liveArtboard.style.minHeight;
        const prevD   = liveArtboard.style.display;
        const prevFD  = liveArtboard.style.flexDirection;
        liveArtboard.style.height        = "816px";
        liveArtboard.style.minHeight     = "816px";
        liveArtboard.style.display       = "flex";
        liveArtboard.style.flexDirection = "column";
        liveArtboard.getBoundingClientRect();
        await nextFrames(1);
        liveArtboard.style.visibility = "";
        const breaksHTML = liveArtboard.outerHTML;
        // Restore inline overrides
        liveArtboard.style.height        = prevH  || "";
        liveArtboard.style.minHeight     = prevMH || "";
        liveArtboard.style.display       = prevD  || "";
        liveArtboard.style.flexDirection = prevFD || "";
        liveArtboard.style.visibility    = "";

        if (deploymentHTML && breaksHTML) allPages.push(deploymentHTML, breaksHTML);

        showToast(`Preparing week print… ${dayIdx + 1} / ${DAY_DEFS.length}`, "info");
      }

      if (allPages.length === 0) { showToast("Nothing to print.", "error"); return; }

      // ── Build print container ─────────────────────────────────────
      const container = document.createElement("div");
      container.className = "print-dual-container";
      container.innerHTML = allPages.join("");
      document.body.appendChild(container);

      // Post-process every even-indexed artboard (index 1, 3, 5… = breaks pages).
      container.querySelectorAll(".print-artboard").forEach((ab, i) => {
        if (i % 2 === 1) postProcessBreaksArtboard(ab);
      });

      document.body.classList.add("printing-dual-mode");
      const hiddenBodyChildren: { el: HTMLElement; prevDisplay: string }[] = [];
      Array.from(document.body.children).forEach((child) => {
        const el = child as HTMLElement;
        if (el !== container && el.tagName !== "SCRIPT" && el.tagName !== "STYLE") {
          hiddenBodyChildren.push({ el, prevDisplay: el.style.display });
          el.style.display = "none";
        }
      });

      try {
        window.print();
      } finally {
        hiddenBodyChildren.forEach(({ el, prevDisplay }) => { el.style.display = prevDisplay; });
        document.body.classList.remove("printing-dual-mode");
        container.remove();
      }
    } catch (e) {
      console.error("[shiftbuilder] week print error", e);
      showToast("Week print failed — try again.", "error");
      document.body.classList.remove("printing-dual-mode");
      document.querySelector(".print-dual-container")?.remove();
    } finally {
      // Always restore the operator's original day and view.
      flushSync(() => setSelectedDayIndex(originalDayIndex));
      await waitForLoad().catch(() => {});
      flushSync(() => setCurrentView(originalView));
    }
  }, [DAY_DEFS, selectedDayIndex, currentView, showToast]);

  // === Print Command Center — generalized multi-day, multi-config print handler ===
  //
  // Generalizes handlePrintWeek: iterates only the days/pages requested in config,
  // assembles them in the specified page order, and applies dynamic @page margins
  // + zoom so the output matches exactly what the Print Command Center previewed.
  const handlePrintWithConfig = React.useCallback(async (config: PrintConfig) => {
    const originalDayIndex = selectedDayIndex;
    const originalView = currentView;

    const nextFrames = (n: number) =>
      new Promise<void>((resolve) => {
        let count = 0;
        const tick = () => { count++; if (count >= n) resolve(); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });

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

    const postProcessBreaksArtboard = (artboard: Element) => {
      const el = artboard as HTMLElement;
      const contentArea = el.querySelector(".flex-1.min-h-0.overflow-hidden.flex.flex-col") as HTMLElement | null;
      if (contentArea) {
        contentArea.style.display = "flex";
        contentArea.style.flexDirection = "column";
        contentArea.style.flex = "1 1 0%";
        contentArea.style.minHeight = "0";
        contentArea.style.overflow = "hidden";
      }
      const waveGrid = contentArea?.firstElementChild as HTMLElement | null;
      if (waveGrid && !waveGrid.classList.contains("overlaps-section")) {
        waveGrid.style.flex = "1 1 0%";
        waveGrid.style.minHeight = "0";
        waveGrid.style.overflow = "hidden";
        waveGrid.style.alignContent = "start";
      }
      const overlaps = el.querySelector(".overlaps-section") as HTMLElement | null;
      if (overlaps) { overlaps.style.flexShrink = "0"; overlaps.style.marginTop = "0"; }
    };

    const activeDays = config.days.filter(d => d.printDeploy || d.printBreaks);
    const overviewDays = config.includeOverview ? config.days.filter(d => d.inOverview) : [];
    const hasOverview = config.includeOverview && overviewDays.length > 0;
    const hasCover    = config.includeCoverPage;

    if (activeDays.length === 0 && !hasOverview) {
      showToast("No pages selected to print.", "error");
      return;
    }

    // Custom queue order injected by PrintCommandCenter via a loose property
    const customQueueOrder = ((config as unknown as Record<string, unknown>)._customQueueOrder ?? null) as string[] | null;

    // Unique sorted day indices we need to load/capture
    const dayIndices = [...new Set(activeDays.map(d => d.dayIndex))].sort((a, b) => a - b);
    // Total steps: capture days + (1 if overview) + (1 for assembly)
    const totalSteps = dayIndices.length + (hasOverview ? 1 : 0);

    setIsPrinting(true);
    setPrintProgress({ current: 0, total: totalSteps, label: "Preparing…" });

    // captured[dayIndex] = { deployHTML?, breaksHTML? }
    const capturedPages = new Map<number, { deployHTML?: string; breaksHTML?: string }>();

    try {
      for (let i = 0; i < dayIndices.length; i++) {
        const dayIdx = dayIndices[i];
        const dayConf = activeDays.find(d => d.dayIndex === dayIdx)!;
        const dayName = DAY_DEFS[dayIdx]?.name ?? `Day ${dayIdx}`;

        setPrintProgress({ current: i, total: totalSteps, label: `Loading ${dayName}…` });

        flushSync(() => setSelectedDayIndex(dayIdx));
        await waitForLoad();
        await nextFrames(4);

        // Extra safety for break sheet data: explicitly re-fetch breaks for this exact night
        // right before capture. This ensures the wave/group columns have the correct day's
        // break selection even if the normal load effect's timing is racy during rapid day switching in print.
        if (dayConf.printBreaks && nightId) {
          try {
            const fresh = await getNightBreakAssignments(nightId);
            setNightBreakRows(
              (fresh as any[])
                .filter((r: any) => r.groupNum && r.groupNum > 0 &&
                  (scheduledTmIdsTonight.size === 0 || scheduledTmIdsTonight.has(r.tmId)))
                .map((r: any) => ({ tmId: r.tmId, groupNum: r.groupNum, slotRef: r.slotRef ?? null }))
            );
            await nextFrames(2); // let React commit the new nightBreakRows before capture
          } catch (e) {
            console.warn("[print] extra break data load failed for day", dayIdx, e);
          }
        }

        const liveArtboard = document.querySelector(".print-artboard") as HTMLElement | null;
        if (!liveArtboard) continue;

        const captured: { deployHTML?: string; breaksHTML?: string } = {};

        if (dayConf.printDeploy) {
          flushSync(() => setCurrentView("deployment"));
          await nextFrames(2);
          liveArtboard.style.visibility = "";
          captured.deployHTML = liveArtboard.outerHTML;
          liveArtboard.style.visibility = "hidden";
        }

        if (dayConf.printBreaks) {
          flushSync(() => setCurrentView("breaks"));
          await nextFrames(2);
          const prevH = liveArtboard.style.height;
          const prevMH = liveArtboard.style.minHeight;
          const prevD = liveArtboard.style.display;
          const prevFD = liveArtboard.style.flexDirection;
          liveArtboard.style.height = "816px";
          liveArtboard.style.minHeight = "816px";
          liveArtboard.style.display = "flex";
          liveArtboard.style.flexDirection = "column";
          liveArtboard.getBoundingClientRect();
          await nextFrames(1);
          liveArtboard.style.visibility = "";
          captured.breaksHTML = liveArtboard.outerHTML;
          liveArtboard.style.height = prevH || "";
          liveArtboard.style.minHeight = prevMH || "";
          liveArtboard.style.display = prevD || "";
          liveArtboard.style.flexDirection = prevFD || "";
          liveArtboard.style.visibility = "";
        }

        capturedPages.set(dayIdx, captured);
        setPrintProgress({ current: i + 1, total: totalSteps, label: `Captured ${dayName}` });
      }

      // ── Phase 2: fetch overview data directly from Supabase ──────────────────
      let overviewHTML: string | null = null;
      let coverHTML: string | null = null;

      if (hasOverview) {
        const ovwStep = dayIndices.length;
        setPrintProgress({ current: ovwStep, total: totalSteps, label: "Building overview…" });
        try {
          const allTms = await getActiveTeamMembers();
          const tmNames = new Map(allTms.map(tm => [tm.id, tm.name || tm.id]));

          const overviewNights: OverviewNight[] = [];
          for (const dayConf of overviewDays.slice().sort((a, b) => a.dayIndex - b.dayIndex)) {
            const def = DAY_DEFS[dayConf.dayIndex];
            const nightId = def ? await getNightIdForDate(def.date) : null;
            const assignments: Record<string, { tmId: string; tmName: string } | null> = {};
            if (nightId) {
              const rows = await getNightAssignments(nightId);
              rows.forEach(row => {
                try {
                  const uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);
                  if (row.tmId) {
                    assignments[uiKey] = {
                      tmId: row.tmId,
                      tmName: row.tmName || tmNames.get(row.tmId) || row.tmId,
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
        setPrintProgress({ current: ovwStep + 1, total: totalSteps, label: "Overview ready" });
      }

      // ── Build cover page HTML (no async needed) ───────────────────────────────
      if (hasCover) {
        const deployCount = activeDays.filter(d => d.printDeploy).length;
        const breaksCount = activeDays.filter(d => d.printBreaks).length;
        const pageCountForCover = deployCount + breaksCount + (overviewHTML ? 1 : 0);
        coverHTML = buildCoverPageArtboardHTML(DAY_DEFS, config, pageCountForCover + 1 /* +1 for the cover itself */);
      }

      // ── Assemble pages ────────────────────────────────────────────────────────
      const allPageHTML: string[] = [];
      const allPageIsBreaks: boolean[] = [];

      if (customQueueOrder && customQueueOrder.length > 0) {
        // Custom drag-to-reorder: respect the queue exactly as the operator arranged it
        const pageMap = new Map<string, { html: string; isBreaks: boolean }>();
        if (coverHTML)    pageMap.set("__cover",    { html: coverHTML,    isBreaks: false });
        if (overviewHTML) pageMap.set("__overview", { html: overviewHTML, isBreaks: false });
        for (const d of activeDays) {
          const c = capturedPages.get(d.dayIndex);
          if (!c) continue;
          if (d.printDeploy && c.deployHTML) pageMap.set(`${d.dayIndex}-d`, { html: c.deployHTML, isBreaks: false });
          if (d.printBreaks && c.breaksHTML) pageMap.set(`${d.dayIndex}-b`, { html: c.breaksHTML, isBreaks: true  });
        }
        for (const queueId of customQueueOrder) {
          const page = pageMap.get(queueId);
          if (page) { allPageHTML.push(page.html); allPageIsBreaks.push(page.isBreaks); }
        }
      } else {
        // Default positional assembly: cover (if first), then day pages, then cover (if last)
        const insertSpecial = (pos: "first" | "last" | null, html: string | null, isBreaks: boolean) => {
          if (html && pos === "first") { allPageHTML.push(html); allPageIsBreaks.push(isBreaks); }
        };
        const appendSpecial = (pos: "first" | "last" | null, html: string | null, isBreaks: boolean) => {
          if (html && pos === "last") { allPageHTML.push(html); allPageIsBreaks.push(isBreaks); }
        };

        insertSpecial(hasCover    ? config.coverPagePosition    : null, coverHTML,    false);
        insertSpecial(overviewHTML ? config.overviewPosition : null, overviewHTML, false);

        // Day pages in selected order
        if (config.pageOrder === "paired") {
          for (const d of activeDays) {
            const c = capturedPages.get(d.dayIndex);
            if (!c) continue;
            if (d.printDeploy && c.deployHTML) { allPageHTML.push(c.deployHTML); allPageIsBreaks.push(false); }
            if (d.printBreaks && c.breaksHTML) { allPageHTML.push(c.breaksHTML); allPageIsBreaks.push(true);  }
          }
        } else if (config.pageOrder === "deploy-first") {
          for (const d of activeDays) {
            const c = capturedPages.get(d.dayIndex);
            if (c && d.printDeploy && c.deployHTML) { allPageHTML.push(c.deployHTML); allPageIsBreaks.push(false); }
          }
          for (const d of activeDays) {
            const c = capturedPages.get(d.dayIndex);
            if (c && d.printBreaks && c.breaksHTML) { allPageHTML.push(c.breaksHTML); allPageIsBreaks.push(true); }
          }
        } else { // breaks-first
          for (const d of activeDays) {
            const c = capturedPages.get(d.dayIndex);
            if (c && d.printBreaks && c.breaksHTML) { allPageHTML.push(c.breaksHTML); allPageIsBreaks.push(true);  }
          }
          for (const d of activeDays) {
            const c = capturedPages.get(d.dayIndex);
            if (c && d.printDeploy && c.deployHTML) { allPageHTML.push(c.deployHTML); allPageIsBreaks.push(false); }
          }
        }

        appendSpecial(overviewHTML ? config.overviewPosition : null, overviewHTML, false);
        appendSpecial(hasCover     ? config.coverPagePosition : null, coverHTML,    false);
      }

      if (allPageHTML.length === 0) { showToast("Nothing to print.", "error"); return; }

      setPrintProgress({ current: totalSteps, total: totalSteps, label: "Sending to printer…" });

      // Build container
      const container = document.createElement("div");
      container.className = "print-dual-container";
      container.innerHTML = allPageHTML.join("");
      document.body.appendChild(container);

      // Post-process breaks artboards
      container.querySelectorAll(".print-artboard").forEach((ab, i) => {
        if (allPageIsBreaks[i]) postProcessBreaksArtboard(ab);
      });

      // Inject dynamic @page margin + zoom override
      const marginValue = MARGIN_VALUES[config.margins];
      const zoomValue = MARGIN_ZOOM[config.margins];
      const dynamicStyle = document.createElement("style");
      dynamicStyle.id = "__pcc-print-override";
      dynamicStyle.textContent = `
        @page { margin: ${marginValue} !important; }
        @media print {
          .print-dual-container .print-artboard { zoom: ${zoomValue} !important; }
        }
      `;
      document.head.appendChild(dynamicStyle);

      // Hide other body children (prevents blank first page)
      document.body.classList.add("printing-dual-mode");
      const hiddenBodyChildren: { el: HTMLElement; prevDisplay: string }[] = [];
      Array.from(document.body.children).forEach((child) => {
        const el = child as HTMLElement;
        if (el !== container && el.tagName !== "SCRIPT" && el.tagName !== "STYLE") {
          hiddenBodyChildren.push({ el, prevDisplay: el.style.display });
          el.style.display = "none";
        }
      });

      try {
        window.print();
      } finally {
        hiddenBodyChildren.forEach(({ el, prevDisplay }) => { el.style.display = prevDisplay; });
        document.body.classList.remove("printing-dual-mode");
        container.remove();
        document.getElementById("__pcc-print-override")?.remove();
      }
    } catch (e) {
      console.error("[shiftbuilder] print-with-config error", e);
      showToast("Print failed — try again.", "error");
      document.body.classList.remove("printing-dual-mode");
      document.querySelector(".print-dual-container")?.remove();
      document.getElementById("__pcc-print-override")?.remove();
    } finally {
      flushSync(() => setSelectedDayIndex(originalDayIndex));
      await waitForLoad().catch(() => {});
      flushSync(() => setCurrentView(originalView));
      setIsPrinting(false);
      setPrintProgress(null);
      setIsPrintCenterOpen(false);
    }
  }, [DAY_DEFS, selectedDayIndex, currentView, showToast]);

  // === Master Command Palette (Phase 2 core) ===
  // Stable callbacks for useCommandActions — keeping these out of the call-site
  // so useCommandActions can detect actual changes (not new references every render).
  const cmdActionRunEngine = React.useCallback(() => {
    if (isDraftMode) applyDraft(); else enterDraftMode();
  }, [isDraftMode, applyDraft, enterDraftMode]);

  // Print button opens Command Center; direct "print tonight" shortcut still available via palette
  const cmdActionPrint = React.useCallback(() => setIsPrintCenterOpen(true), []);
  const cmdActionPrintWeek = React.useCallback(() => handlePrintWeek(), [handlePrintWeek]);
  const cmdActionOpenPrintCenter = React.useCallback(() => setIsPrintCenterOpen(true), []);

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
      const current = assignments[slotKey]?.breakGroup ?? 0;
      const next = (current % 3) + 1;
      setBreakGroupForSlot(slotKey, next as any);
    },
    [assignments, setBreakGroupForSlot]
  );

  const cmdActionClearBorders = React.useCallback(() => setCardBorders({}), []);

  const commandActions = useCommandActions({
    graveRoster,
    realRoster,
    assignments,
    auxDefs,
    selectedDayIndex,
    DAY_DEFS,
    graveOnly,
    shiftHistory,
    onSetGraveOnly: setGraveOnly,
    onSetSelectedDayIndex: setSelectedDayIndex,
    onAddAuxSlot: addAuxSlot,
    onRemoveLastAuxSlot: removeLastAuxSlot,
    onRunEngine: cmdActionRunEngine,
    onDiscardDraft: discardDraft,
    onPrint: cmdActionPrint,
    onPrintWeek: cmdActionPrintWeek,
    onUndo: cmdActionUndo,
    onRedo: cmdActionRedo,
    assign,
    isDraftMode,
    scheduledTmIdsTonight,
    calledOffIds,
    onApplyGrokSuggestions: applyGrokSuggestions,
    onTriggerGrokBoardAnalysis: triggerGrokBoardAnalysis,
    // Phase 3 hot-word callbacks
    onRemoveFromSlot: unassign,
    onToggleLock: toggleLock,
    onCycleBreak: cmdActionCycleBreak,
    onOpenPaletteForSlot: openPaletteForSlot,
    onClearAllBorders: cmdActionClearBorders,
    onOpenPrintCenter: cmdActionOpenPrintCenter,
  });

  // handleCardClick and dismissQuickFan removed in Phase 1 (Command Palette Upgrade).
  // Card taps now use openPaletteForSlot / openPaletteForPerson directly.

  // =========================================================================
  // Stable CommandPalette prop callbacks
  // =========================================================================
  // All palette callbacks are defined here with useCallback so they get stable
  // references across SBC renders. Passing inline arrow functions directly in
  // the JSX prop list causes CommandPalette to re-render on every SBC render
  // (even when the palette is closed) because every new function reference
  // invalidates React's shallow-equality check. These callbacks are the primary
  // source of choppiness when typing in the palette.

  const handleCmdkAddTask = React.useCallback(
    async (uiKeys: string | string[], taskLabel: string) => {
      if (!nightId) {
        showToast("No active night selected", "error");
        return;
      }
      const keys = Array.isArray(uiKeys) ? uiKeys : [uiKeys];
      if (keys.length === 0 || !taskLabel?.trim()) return;

      try {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nightId, showToast]
  );

  const handleCmdkCycleBreak = React.useCallback(
    (slotKey: string) => {
      const current = assignments[slotKey]?.breakGroup ?? 0;
      const next = (current % 3) + 1;
      setBreakGroupForSlot(slotKey, next as any);
    },
    [assignments, setBreakGroupForSlot]
  );

  const handleCmdkSetGravePool = React.useCallback(
    async (tmId: string, value: "Full" | "AM" | "PM" | null) => {
      await setTMGravePool(tmId, value);
      setTMCommandEpoch((e) => e + 1);
    },
    [setTMCommandEpoch]
  );

  const handleCmdkSetDisplayName = React.useCallback(
    async (tmId: string, newName: string) => {
      await setTMDisplayName(tmId, newName);
      setTMCommandEpoch((e) => e + 1);
    },
    [setTMCommandEpoch]
  );

  const handleCmdkRemoveFromSchedule = React.useCallback(
    async (tmId: string, date: Date) => {
      if (!nightId) throw new Error("No night context — pick a day first");
      await removeTMFromSchedule({ tmId, nightId, nightDate: date });
      setTMCommandEpoch((e) => e + 1);
    },
    [nightId, setTMCommandEpoch]
  );

  const handleCmdkAddCoverage = React.useCallback(
    async (sourceKey: string, targetKey: string) => {
      if (!nightId) { showToast("No active night selected", "error"); return; }

      const accentColor = getSlotAccentColor(sourceKey);
      const targetLabel = getSlotCoverageLabel(targetKey);
      const sourceKeys = expandCoverageToKeys(sourceKey);

      try {
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
        }
        const fresh = await getNightSlotTasks(nightId);
        const byKey: Record<string, NightSlotTask[]> = {};
        for (const t of fresh) {
          const uiKey = dbToUi(t.slotKey, t.slotType, t.rrSide ?? null);
          if (!byKey[uiKey]) byKey[uiKey] = [];
          byKey[uiKey].push(t);
        }
        setSelectedTasks(byKey);
        showToast(`Coverage added: And ${targetLabel}`, "success");
      } catch (err) {
        console.error("[SBC] coverage add failed:", err);
        showToast("Failed to add coverage bar", "error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nightId, showToast]
  );

  // Stable computed arrays/objects for the palette — new references only when
  // the underlying data actually changes, not on every SBC render.
  const cmdkWeekDays = React.useMemo(
    () => DAY_DEFS.map((d) => ({ date: d.date, name: d.name, short: d.short })),
    [DAY_DEFS]
  );

  // Scheduled tonight, not yet placed — fed into MarkerPad TM picker (default list)
  const markerScheduledUnassigned = React.useMemo(
    () =>
      Array.from(scheduledTmIdsTonight)
        .filter((id) => !assignedThisNight.has(id))
        .map((id) => {
          const tm = realRoster.find((t: any) => t.id === id);
          const tmName = tm?.name || tm?.fullName;
          if (!tmName) return null;
          return { tmId: id, tmName };
        })
        .filter(Boolean) as { tmId: string; tmName: string }[],
    [scheduledTmIdsTonight, assignedThisNight, realRoster]
  );

  // Full roster minus currently-placed TMs — used when the operator types in the
  // TM picker search box so they can find anyone, not just scheduled-unassigned.
  const markerAllEligibleTms = React.useMemo(
    () =>
      realRoster
        .filter((t: any) => !assignedThisNight.has(t.id))
        .map((t: any) => {
          const tmName = t.name || t.fullName;
          if (!tmName) return null;
          return { tmId: t.id as string, tmName: tmName as string };
        })
        .filter(Boolean) as { tmId: string; tmName: string }[],
    [realRoster, assignedThisNight]
  );

  const cmdkCompletionUnplaced = React.useMemo(
    () =>
      Array.from(scheduledTmIdsTonight)
        .filter((id) => !assignedThisNight.has(id))
        .map((id) => {
          const tm = realRoster.find((t: any) => t.id === id);
          return tm?.name || tm?.fullName || id;
        })
        .filter(Boolean)
        .slice(0, 12) as string[],
    [scheduledTmIdsTonight, assignedThisNight, realRoster]
  );

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

  const handleGenderClick = (slotKey: string, element?: HTMLElement, event?: React.MouseEvent) => {
    openPaletteForSlot(slotKey);
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
  // iPad + Apple Pencil Pro 2 sensor tuning:
  // • PointerSensor distance reduced to 4px so Pencil drags activate sooner.
  // • TouchSensor delay raised to 250ms / tolerance 8px — gives finger a brief
  //   moment to distinguish tap from drag without feeling sluggish.
  // • KeyboardSensor for a11y parity.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const [activeDrag, setActiveDrag] = useState<{
    kind: "tm" | "assigned" | "task";
    label: string;
    fromSlot?: string;
  } | null>(null);

  const onDragStart = (event: DragStartEvent) => {
    const d = event.active.data.current as any;
    if (!d) return;
    if (d.type === "tm") setActiveDrag({ kind: "tm", label: d.tmName });
    else if (d.type === "assigned") setActiveDrag({ kind: "assigned", label: d.tmName, fromSlot: d.fromSlot });
    else if (d.type === "task") setActiveDrag({ kind: "task", label: d.taskLabel, fromSlot: d.fromSlot });
  };

  const onDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);
    const { active, over } = event;
    const a = active.data.current as any;
    if (!a) return;

    // Fresh roster TM → slot
    if (a.type === "tm") {
      if (over?.data.current?.type === "slot") {
        assign((over.data.current as any).slotKey, a.tmId, a.tmName);
      }
      return;
    }

    // Task being dragged between cards. Must be checked BEFORE the "assigned"
    // TM block — a.type cannot simultaneously be "assigned" and "task", so
    // nesting this check inside the assigned block made it unreachable.
    if (a.type === "task") {
      if (over?.data.current?.type === "slot") {
        const toUiKey = (over.data.current as any).slotKey;
        const fromUiKey = a.fromSlot;
        if (toUiKey === fromUiKey) return;

        const { slot_key: toSlotKey, slot_type: toSlotType, rr_side: toRrSide } = uiToDb(toUiKey);
        const { slot_key: fromSlotKey, slot_type: fromSlotType, rr_side: fromRrSide } = uiToDb(fromUiKey);

        // Optimistic move in the selectedTasks buckets (same shape the card renderers use)
        setSelectedTasks((prev) => {
          const fromList = prev[fromUiKey] ?? [];
          const taskToMove = fromList.find((t) => t.taskLabel === a.taskLabel);
          if (!taskToMove) return prev;

          const newFrom = fromList.filter((t) => t.taskLabel !== a.taskLabel);
          const movedTask = {
            ...taskToMove,
            slotKey: toSlotKey,
            slotType: toSlotType,
            rrSide: toRrSide,
          };
          const newTo = [...(prev[toUiKey] ?? []), movedTask];
          return { ...prev, [fromUiKey]: newFrom, [toUiKey]: newTo };
        });

        // Persist using the same coordinated-night pattern used for TM swaps
        (async () => {
          let nid = nightId;
          if (!nid) nid = await resolveNightIdForDate(selectedDay.date, selectedDay.name);
          if (!nid) return;

          try {
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
      // → another slot: atomic swap (or move if target empty)
      if (over?.data.current?.type === "slot") {
        const toKey = (over.data.current as any).slotKey;
        const fromKey = a.fromSlot;
        if (toKey === fromKey) return; // dropped on self, no-op

        const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
        pendingHistoryRef.current = { description: `Moved assignment from ${fromKey} to ${toKey}`, before };

        // Capture night context at action time — both persist calls must
        // target the SAME night id even if the user switches days mid-write.
        const captureDate = selectedDay.date;
        const captureDayName = selectedDay.name;

        // Read TM IDs BEFORE setAssignments — React calls the updater lazily
        // during reconciliation, not synchronously. If we set these inside the
        // updater and then read them in the async IIFE below, they are still
        // null when persistAssign runs, causing a DELETE instead of an upsert.
        const movingTmId: string | null = assignments[fromKey]?.tmId ?? null;
        const displacedTmId: string | null = assignments[toKey]?.tmId ?? null;

        setAssignments((prev: any) => {
          const next = { ...prev };
          const moving = next[fromKey];
          const displaced = next[toKey];
          if (displaced) next[fromKey] = { ...displaced, slotKey: fromKey };
          else delete next[fromKey];
          next[toKey] = { ...moving, slotKey: toKey };
          return next;
        });

        // IMPORTANT BUG FIX (discovered while adding task drag):
        // The old code passed the possibly-null `targetNightId` to two independent
        // fire-and-forget persistAssign calls. When the night row didn't exist yet
        // for this day, both could concurrently call getOrCreateNightForDate and
        // create *two different* night rows. One (or both) assignments would land
        // on the "loser" night and disappear on reload.
        //
        // Fix: resolve once (serializing the creation), then pass the concrete nid
        // to both persists. This also makes the upcoming task-move drag safe.
        (async () => {
          let nid = nightId;
          if (!nid) {
            // Use the day values captured at drag-start — not selectedDay, which
            // could have changed if the operator switched days during the drag.
            nid = await resolveNightIdForDate(captureDate, captureDayName);
          }
          if (!nid) {
            showToast("Move recorded locally but failed to create night row — refresh may lose it");
            return;
          }
          try {
            // MUST await sequentially: fire-and-forget means a quick refresh
            // races the DB writes and both slots reload as empty from Supabase.
            await persistAssign(nid, captureDate, captureDayName, toKey, movingTmId);
            await persistAssign(nid, captureDate, captureDayName, fromKey, displacedTmId);
          } catch (e: any) {
            console.error("[shiftbuilder] drag persist failed", e);
            showToast("Move couldn't be saved — refresh may revert it");
          }
        })();
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
  // Single source of truth: the SELECTED DAY drives a load. Previously we had
  // two effects (one resolving nightId from the date, another loading data
  // from the resolved nightId), which left a window where Day A's nightId
  // could leak into a render that was already displaying Day B — every write
  // issued in that window persisted to the wrong night.
  //
  // The new shape:
  //   1. Day changes → bump `loadEpochRef`, clear every per-day surface
  //      (assignments, nightId, notes pad, pending notes-save timer).
  //   2. Resolve the nightId for the new date.
  //   3. Load roster + assignments + notes in parallel.
  //   4. Every async result is gated on `loadEpochRef.current === epoch`;
  //      late resolves are dropped silently.
  //
  // Combined with persistAssign capturing nightId at action time, this kills
  // the entire family of "wrong day got written" races.
  const loadEpochRef = useRef<number>(0);
  // Tracks loadingAssignments inside async callbacks (state can't be read stably from closures).
  const loadingAssignmentsRef = useRef<boolean>(false);

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
        const [
          activeConfig,
          skillScoreMap,
          slotDifficultyMap,
          preferenceRows,
          pairAffinityRows,
          accommodationRows,
        ] = await Promise.all([
          getActiveEngineConfig(),
          getTMSkillScores(),
          getSlotDifficultyRaw(),
          getTMPreferences(),
          getTMPairAffinities(),
          getTMAccommodations(),
        ]);

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

  useEffect(() => {
    const epoch = ++loadEpochRef.current;

    // Hard reset every per-day surface synchronously, BEFORE the new data
    // arrives. The operator must never see Day A's content under the Day B
    // label, and writes issued in that window must not land on Day A by
    // mistake.
    setNightId(null);
    setAssignments({});
    setSelectedTasks({}); // also reset per-night task selections on day switch
    setCardBorders({});   // reset visual borders when switching days
    setCalledOffIds(new Set());
    setScheduledTmIdsTonight(new Set());
    if (notesRef.current) notesRef.current.innerText = "";
    if (notesSaveTimerRef.current) {
      clearTimeout(notesSaveTimerRef.current);
      notesSaveTimerRef.current = null;
    }

    setLoadingAssignments(true);
    loadingAssignmentsRef.current = true;
    (async () => {
      try {
        const id = await getNightIdForDate(selectedDay.date);
        if (loadEpochRef.current !== epoch) return;

        // Day-varying queries only — session-stable data (engineConfig, skills,
        // prefs, pairings, accommodations, difficulty) is loaded separately in the
        // `[tmCommandEpoch]` effect above and never re-fires on day switches.
        const [
          members,
          graveMembers,
          dbAssignments,
          notesText,
          weekOnScheduleSet,
          pmOverlapMembers,
          amOverlapMembers,
          nightTaskRows,
          breakRows,
          nightBorderMap,
          callOffSet,
          recentHistory,
          scheduledTonightSet,
        ] = await Promise.all([
          id ? getTeamMembersForNight(id) : getActiveTeamMembers().then(all => all.map(tm => ({ ...tm, isOnSchedule: false }))),
          getGraveAvailableTeamMembers(),
          id ? getNightAssignments(id) : Promise.resolve([]),
          id ? getNightNotes(id) : Promise.resolve(""),
          id ? getOnScheduleTmIdsForNight(id, selectedDay.date.toISOString().slice(0, 10)) : Promise.resolve(new Set<string>()),
          getGravePMOverlapMembers(),
          getGraveAMOverlapMembers(),
          id ? getNightSlotTasks(id) : Promise.resolve([] as NightSlotTask[]),
          id ? getNightBreakAssignments(id) : Promise.resolve([]),
          id ? getNightCardBorders(id) : Promise.resolve({} as Record<string, string>),
          getCallOffsForDate(selectedDay.date),
          getRecentZoneHistory(selectedDay.date, 7),
          id ? getScheduledTmIdsForNight(id) : Promise.resolve(new Set<string>()),
        ]);

        // Final epoch gate — if the user switched days while loading, drop
        // everything on the floor. The next effect run will load Day B
        // fresh.
        if (loadEpochRef.current !== epoch) return;

        // Commit nightId only after we're sure we're still the active load.
        setNightId(id);
        setRealRoster(members);
        setCalledOffIds(callOffSet);
        setScheduledTmIdsTonight(scheduledTonightSet);

        // Session-stable data (engineConfig, skills, prefs, pairings,
        // accommodations, difficulty) is handled by the stable effect above —
        // no need to process it here. Only update day-varying derived state.
        setRecentZoneHistory(recentHistory);

        // Derive isPMOverlap / isAMOverlap directly from grave_pool — the
        // authoritative source. (The pmOverlapMembers / amOverlapMembers lists
        // are still loaded for any downstream use but are no longer the flag source.)
        setGraveRoster(
          graveMembers.map((m: any) => ({
            ...m,
            isOnWeek: weekOnScheduleSet.has(m.id),
            isPMOverlap: m.gravePool === 'PM',
            isAMOverlap: m.gravePool === 'AM',
          }))
        ); // For the GRAVE shift filter toggle, enriched with week-level + real overlap data

        // Populate the contentEditable notes pad. We assign innerText
        // imperatively because contentEditable doesn't respond to React's
        // re-rendering pattern without wiping caret position. Only update
        // when the loaded value actually differs from what's already shown.
        if (notesRef.current && notesRef.current.innerText !== notesText) {
          notesRef.current.innerText = notesText ?? "";
        }

        // Build a tm_id → group_num lookup from break_assignments so we can
        // attach the persisted break group onto each assignment row as we
        // translate. (break_assignments is keyed by tm_id, not slot_key, so
        // a single TM has one break group regardless of where they're
        // working.) group_num 0 means "off the break sheet" — preserve it
        // explicitly so the UI shows "–" instead of defaulting to 1.
        const breakByTm: Record<string, BreakGroup> = {};
        breakRows.forEach((r: any) => {
          if (r.tmId && r.groupNum !== null && r.groupNum !== undefined) {
            breakByTm[r.tmId] = r.groupNum as BreakGroup;
          }
        });

        // Store the raw break rows so the break sheet can render TMs who are
        // scheduled or placed tonight. Filter out template TMs who aren't
        // working tonight to prevent wrong-people / duplicate-chip issues.
        const placedTmIdSet = new Set(
          (dbAssignments as any[]).map((r: any) => r.tmId).filter(Boolean)
        );
        const relevantBreakTmIds = new Set<string>([
          ...Array.from(scheduledTonightSet as Set<string>),
          ...Array.from(placedTmIdSet),
        ]);
        setNightBreakRows(
          (breakRows as any[])
            .filter((r: any) => r.groupNum && r.groupNum > 0 &&
              (relevantBreakTmIds.size === 0 || relevantBreakTmIds.has(r.tmId)))
            .map((r: any) => ({ tmId: r.tmId, groupNum: r.groupNum, slotRef: r.slotRef ?? null }))
        );

        // Translate DB rows → UI shape. The slot-keys translator owns the
        // mapping; everything downstream just sees Golden keys.
        const ui: Record<string, any> = {};
        dbAssignments.forEach((row: any) => {
          const uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);
          if (uiKey.startsWith("UNK:")) {
            console.warn("[shiftbuilder] unrecognized DB slot, skipping:", row);
            return;
          }
          // For RR cards the UI keys are MRR{n} / WRR{n}, so each rr_side
          // becomes its own assignment entry — that matches what the rest
          // of the page expects.
          ui[uiKey] = {
            slotKey: uiKey,
            tmId: row.tmId,
            tmName: row.tmName ?? null,
            type: row.slotType,
            rrSide: row.rrSide ?? null,
            isLocked: !!row.isLocked,
            // zone_assignments.break_group is the canonical display source.
            // break_assignments (breakByTm) is retained for the break-sheet / print path only.
            breakGroup: row.breakGroup ?? 0,
            source: "manual",
          };
        });
        // Replace assignments outright — we already cleared at day-switch
        // time, so this just installs the freshly loaded set. Merging
        // would risk Day A's stale entries persisting through if the
        // clear-then-load contract is ever violated.
        setAssignments(ui);
        // Mark as "saved" now that we've loaded fresh data from DB — prevents
        // the dock from showing "Not saved" when the data is actually current.
        setLastSavedAt(new Date());

        // Translate loaded night_slot_tasks rows into UI-keyed buckets so the
        // card renderers can read them by Golden slot key (Z1, MRR1, etc.).
        const tasksByUiKey: Record<string, NightSlotTask[]> = {};
        nightTaskRows.forEach((row) => {
          const uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);
          if (uiKey.startsWith("UNK:")) {
            // Defensive fallback: handle legacy group-level overlap keys written
            // by early migrations (slot_key='overlap_pm' or 'overlap_am', no card
            // index). Distribute the task to all 6 per-card slots in that window
            // so it appears on every overlap card rather than being silently lost.
            if (row.slotType === "overlap" && (row.slotKey === "overlap_pm" || row.slotKey === "overlap_am")) {
              const half = row.slotKey === "overlap_pm" ? "PM" : "AM";
              for (let i = 0; i < 6; i++) {
                (tasksByUiKey[`OL-${half}-${i}`] ??= []).push(row);
              }
              return;
            }
            console.warn("[shiftbuilder] unrecognized DB slot for task, skipping:", row);
            return;
          }
          (tasksByUiKey[uiKey] ??= []).push(row);
        });
        setSelectedTasks(tasksByUiKey);

        // Load persisted card borders for this night (visual attention marks)
        setCardBorders(nightBorderMap || {});

        // Detect operator-added AUX slots from loaded rows so the layout
        // survives reload. Defaults are protected (they're always in
        // auxDefs); we only ADD operator extras.
        const extraAux: AuxDef[] = [];
        const seen = new Set<string>();
        dbAssignments.forEach((row: any) => {
          if (row.slotType !== "aux") return;
          const extra = auxDbKeyToDef(row.slotKey);
          if (!extra || seen.has(extra.uiKey)) return;
          if (DEFAULT_AUX_DEFS.some(d => d.key === extra.uiKey)) return;
          seen.add(extra.uiKey);
          extraAux.push({ key: extra.uiKey, label: extra.label, locations: [] });
        });
        // Merge operator-added AUX slots without wiping ones the user created
        // in the current session (non-destructive like the assignments merge).
        setAuxDefs((prev: AuxDef[]) => {
          const base = [...DEFAULT_AUX_DEFS];
          const existingKeys = new Set(base.map(d => d.key));
          for (const ex of extraAux) {
            if (!existingKeys.has(ex.key)) {
              base.push(ex);
              existingKeys.add(ex.key);
            }
          }
          // Also preserve any extras that were already in prev but not in this night's DB
          for (const p of prev) {
            if (!existingKeys.has(p.key)) base.push(p);
          }
          return base;
        });
      } catch (e) {
        if (loadEpochRef.current === epoch) console.error("[shiftbuilder] load failed", e);
      } finally {
        if (loadEpochRef.current === epoch) {
          setLoadingAssignments(false);
          loadingAssignmentsRef.current = false;
          // Belt-and-suspenders: after the Supabase pull mutates roster/assignments
          // (which can cause sibling DOM to affect the measured size of the
          // artboard stage host), force an immediate re-measure so the
          // "pdf render canvas" never ends up at the wrong scale or visually
          // collapsed after hydration.
          requestAnimationFrame(recomputeScale);
        }
      }
    })();
  }, [selectedDay.date, tmCommandEpoch]);

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
        await upsertZoneAssignment({
          nightId: nid,
          slotKey: slot_key,
          slotType: slot_type,
          rrSide: rr_side,
          tmId,
          isLocked,
        });
        setLastSavedAt(new Date());
      } catch (e: any) {
        console.error("[shiftbuilder] persist failed for", uiKey, e);
        showToast(`Couldn't save ${uiKey}: ${e?.message ?? "unknown error"}`);
      }
    },
    [resolveNightIdForDate, showToast, setLastSavedAt]
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
      } catch (e: any) {
        console.error("[shiftbuilder] add task failed for", uiKey, e);
        showToast(`Couldn't add task: ${e?.message ?? "unknown error"}`);
      }
    },
    [resolveNightIdForDate, showToast]
  );

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
        const { slot_key, slot_type, rr_side } = uiToDb(uiKey);
        await removeNightSlotTask({
          nightId: nid,
          slotKey: slot_key,
          slotType: slot_type,
          rrSide: rr_side,
          taskLabel,
        });
      } catch (e: any) {
        console.error("[shiftbuilder] remove task failed for", uiKey, e);
        showToast(`Couldn't remove task: ${e?.message ?? "unknown error"}`);
      }
    },
    [resolveNightIdForDate, showToast]
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

      // Persist to Supabase (use normalized db keys)
      (updateNightSlotTaskColor as any)(targetNightId, slot_key, taskLabel, color, rr_side).catch((err: unknown) => {
        console.error('[ShiftBuilder] Failed to set task color:', err);
        // Could add a toast here later if desired
      });
    },
    [nightId, selectedDay.date, selectedDay.name]
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
      (updateNightSlotTaskLabel as any)(targetNightId, slot_key, oldLabel, trimmed, rr_side).catch((err: unknown) => {
        console.error('[ShiftBuilder] Failed to edit task label:', err);
      });
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

  return (
    <div className="h-screen flex flex-col text-[#1C1C1E] dark:text-[#F2F2F4] overflow-hidden relative" style={{ background: "var(--sb-substrate, #FAFAF8)" }}>
      {/* ═══════════════════════════════════════════════════════════
          VELVET TOP BAR — reference design faithful implementation
          Height: 56px. Liquid-glass: blur(48px) saturate(200%).
          Left:   avatar + "Shift Builder · Grave" + subtitle
          Center: day scrubber colored pills (Fri→Thu)
          Right:  PLACED · Draft pill · Search ⌘K · ☀/🌙 · Publish PDF
          ═══════════════════════════════════════════════════════════ */}
      {(() => {
        const placedCount = allSlotKeys.filter(k => !!assignments[k]?.tmId).length;
        const totalSlots = allSlotKeys.length;
        return (
          <div
            className="fixed top-0 left-0 right-0 z-40 flex items-center px-3"
            style={{
              height: 56,
              background: isDark
                ? "rgba(18,17,20,0.90)"
                : "rgba(248,248,246,0.92)",
              backdropFilter: "blur(48px) saturate(200%)",
              WebkitBackdropFilter: "blur(48px) saturate(200%)",
              borderBottom: isDark
                ? "1px solid rgba(255,255,255,0.07)"
                : "1px solid rgba(0,0,0,0.06)",
              boxShadow: isDark
                ? "0 1px 0 rgba(255,255,255,0.04), 0 4px 20px rgba(0,0,0,0.35)"
                : "0 1px 0 rgba(255,255,255,0.80), 0 4px 20px rgba(0,0,0,0.06)",
            }}
          >
            {/* ── Left: Brand identity ── */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Avatar circle — user initial */}
              <div
                className="w-[30px] h-[30px] rounded-full flex items-center justify-center font-bold text-[13px] shrink-0"
                style={{
                  background: isDark
                    ? "linear-gradient(135deg, #2C2C2E, #1C1C1E)"
                    : "linear-gradient(135deg, #E5E5EA, #D1D1D6)",
                  border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.10)",
                  color: isDark ? "#F2F2F4" : "#1C1C1E",
                  fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                  letterSpacing: "-0.4px",
                  boxShadow: isDark
                    ? "inset 0 1px 0 rgba(255,255,255,0.10)"
                    : "inset 0 1px 0 rgba(255,255,255,0.90)",
                }}
              >B</div>
              <div className="flex flex-col leading-none">
                <div
                  className="font-bold tracking-[-0.3px]"
                  style={{
                    fontSize: 12.5,
                    color: isDark ? "#F2F2F4" : "#111111",
                    fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                  }}
                >Shift Builder · Grave</div>
                <div
                  style={{
                    fontSize: 9.5, marginTop: 1,
                    color: isDark ? "#636366" : "#9CA3AF",
                    fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                  }}
                >GLCR · Internal Maintenance · Brian C.</div>
              </div>
            </div>

            {/* ── Center: Day scrubber — absolutely centered so left/right widths don't affect it ── */}
            <div
              className="flex items-center gap-1"
              style={{
                position: "absolute",
                left: "50%",
                transform: "translateX(-50%)",
                pointerEvents: "auto",
              }}
            >
              {DAY_DEFS.map((def, i) => {
                const isActive = i === selectedDayIndex;
                return (
                  <button
                    key={def.name}
                    type="button"
                    onClick={() => setSelectedDayIndex(i)}
                    title={`${def.name} ${def.dateNum} · ${def.monthYear}`}
                    className="shrink-0 flex items-center justify-center rounded-full transition-all"
                    style={{
                      height: 32,
                      minWidth: isActive ? 60 : 32,
                      gap: isActive ? 5 : 0,
                      background: isActive
                        ? def.color
                        : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                      border: isActive
                        ? `1px solid ${def.color}`
                        : `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
                      boxShadow: isActive ? `0 2px 12px ${def.color}55` : "none",
                      padding: "0 10px",
                    }}
                  >
                    {isActive && (
                      <span
                        className="font-bold leading-none"
                        style={{
                          fontSize: 13,
                          color: "#ffffff",
                          fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                          letterSpacing: "-0.2px",
                        }}
                      >{def.dateNum}</span>
                    )}
                    <span
                      className="font-extrabold tracking-[0.4px] uppercase leading-none"
                      style={{
                        fontSize: isActive ? 10 : 10,
                        color: isActive ? "#ffffffcc" : isDark ? "#636366" : "#9CA3AF",
                        fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                      }}
                    >
                      {def.name.slice(0, 3)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ── Right controls ── */}
            <div className="flex items-center gap-2 shrink-0 ml-auto">

              {/* PLACED counter */}
              <div
                className="flex items-center gap-1 text-[11px] font-semibold shrink-0"
                style={{
                  color: isDark ? "#8E8E93" : "#6B7280",
                  fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                }}
              >
                <span style={{ color: isDark ? "#C7C7CC" : "#374151" }}>PLACED</span>
                <span>{placedCount}/{totalSlots}</span>
              </div>

              {/* Hairline separator */}
              <span className="w-px h-4 rounded-full shrink-0" style={{ background: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.09)" }} />

              {/* Draft amber pill */}
              {isDraftMode && (
                <div
                  className="flex items-center gap-1.5 px-2.5 h-[26px] rounded-full font-semibold shrink-0"
                  style={{
                    background: "rgba(245,158,11,0.14)",
                    color: "#E9A825",
                    border: "1px solid rgba(245,158,11,0.32)",
                    fontSize: 10.5,
                    fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                  }}
                >
                  <span className="w-[6px] h-[6px] rounded-full bg-amber-400 animate-pulse shrink-0" />
                  Draft
                </div>
              )}

              {/* Search · Assign · Command ⌘K */}
              <button
                type="button"
                onClick={() => setCmdkOpen(true)}
                title="Open command palette (⌘K)"
                className="flex items-center gap-1.5 px-3 h-[30px] rounded-full border transition-colors shrink-0"
                style={{
                  background: isDark ? "rgba(38,38,40,0.80)" : "rgba(240,240,240,0.80)",
                  borderColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)",
                  color: isDark ? "#8E8E93" : "#9CA3AF",
                  fontSize: 11,
                  fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                <span className="ms" style={{ fontSize: 15, fontVariationSettings: '"FILL" 0, "wght" 300' }}>search</span>
                <span>Search · Assign · Command</span>
                <span
                  className="px-1 py-px rounded text-[10px] font-bold"
                  style={{
                    background: isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.09)",
                    color: isDark ? "#C7C7CC" : "#6B7280",
                    fontFamily: "var(--font-jetbrains, monospace)",
                  }}
                >⌘K</span>
              </button>

              {/* Dark mode toggle */}
              <button
                onClick={toggleTheme}
                title={isDark ? "Switch to light mode" : "Switch to dark mode"}
                className="flex items-center justify-center w-[30px] h-[30px] rounded-full border transition-colors shrink-0"
                style={{
                  background: isDark ? "rgba(38,38,40,0.80)" : "rgba(240,240,240,0.80)",
                  borderColor: isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.09)",
                  color: isDark ? "#C7C7CC" : "#374151",
                }}
                aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              >
                <span className="ms" style={{ fontSize: 17 }}>{isDark ? "light_mode" : "dark_mode"}</span>
              </button>

            </div>
          </div>
        );
      })()}


      {/* autoScroll={false}: prevents dnd-kit's built-in scroll fighting with our
          fixed scroll container on iPad — we handle scroll ourselves via touch gestures. */}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} autoScroll={false}>
      {/* The roster used to be a 268px flex sibling. It's now a floating
         Liquid Glass panel anchored to the left, position:fixed inside this
         relative container so the canvas can take the full width. When the
         operator collapses the roster, a sphere appears in its place.
         min-h-0 is still critical for the canvas's nested scroll behavior. */}
      <div className="flex flex-1 overflow-hidden min-h-0 relative">
        {/* FLOATING ROSTER — `position: fixed` panel anchored to the left.
           Spring-animates between full panel (rosterOpen=true) and a small
           sphere (rosterOpen=false) via transform + opacity. transform-origin
           is set to the sphere's position so the panel appears to genie out
           from there.
        */}
        <div
          aria-hidden={!rosterOpen}
          className="fixed left-3 top-[64px] bottom-3 w-[280px] z-30 rounded-2xl overflow-hidden flex flex-col"
          style={{
            // Velvet liquid-glass + genie-out animation
            background: isDark ? "rgba(20,19,22,0.84)" : "rgba(252,252,250,0.90)",
            backdropFilter: "blur(48px) saturate(200%)",
            WebkitBackdropFilter: "blur(48px) saturate(200%)",
            border: isDark ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(0,0,0,0.08)",
            boxShadow: isDark
              ? "inset 0 1px 0 rgba(255,255,255,0.10), 0 20px 60px rgba(0,0,0,0.55)"
              : "inset 0 1px 0 rgba(255,255,255,0.90), 0 20px 60px rgba(0,0,0,0.10)",
            transformOrigin: "0% 50%",
            transform: rosterOpen ? "scale(1)" : "scale(0.15)",
            opacity: rosterOpen ? 1 : 0,
            pointerEvents: rosterOpen ? "auto" : "none",
            transition: "transform 280ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          {/* Collapse handle — top-right of the panel. Small chevron-left
             that genies the panel back to a sphere. */}
          <button
            type="button"
            onClick={() => setRosterOpen(false)}
            className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full hover:bg-black/5 dark:hover:bg-white/10 active:bg-black/10 dark:active:bg-white/15 transition-colors flex items-center justify-center text-[#6B7280] dark:text-[#8E8E93] hover:text-[#1C1C1E] dark:hover:text-[#F2F2F4]"
            aria-label="Collapse roster"
            title="Collapse roster"
          >
            <span className="ms" style={{ fontSize: 18, fontVariationSettings: '"FILL" 0, "wght" 300, "opsz" 20' }}>chevron_left</span>
          </button>

          <RosterDropZone className="flex flex-col h-full min-h-0">
          {/* Strategic GRAVE-first header. pt-4 + pr-10 leaves space for the
             floating-panel collapse chevron in the top-right corner. */}
          <div className="px-5 pt-4 pb-3 pr-10 flex-shrink-0">
            <div className="text-[13px] font-semibold tracking-[0.6px] text-[#1C1C1E] dark:text-[#F2F2F4] uppercase" style={{ fontFamily: "var(--font-atkinson)" }}>
              {graveOnly ? "GRAVE Available" : "Available Team Members"}
            </div>
            <div className="text-[10px] text-[#6B7280] dark:text-[#8E8E93] mt-0.5 tracking-[0.2px]">
              {graveOnly 
                ? `11pm–6:55am eligible pool — ${graveRoster.length} TMs` 
                : "All active TMs • Drag to any slot"}
            </div>
          </div>

          {/* Unified filter strip: Search + strong GRAVE segmented control */}
          <div className="px-4 pb-3 flex-shrink-0 space-y-2">
            {/* Minimal Golden search */}
            <div className="relative">
              <input
                type="text"
                value={rosterSearch}
                onChange={(e) => setRosterSearch(e.target.value)}
                placeholder={graveOnly ? "Search GRAVE pool…" : "Search team members…"}
                className="w-full bg-white dark:bg-[#2C2C2E] dark:text-[#F2F2F4] border border-[#E5E5E7] dark:border-[#3A3A3C] rounded-[3px] pl-8 pr-3 py-1.5 text-[12px] placeholder:text-[#9CA3AF] dark:placeholder:text-[#636366] focus:outline-none focus:border-[#C7C7CC] dark:focus:border-[#636366] transition-colors"
                style={{ fontFamily: "var(--font-geist-sans)" }}
              />
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
                <span className="ms" style={{ fontSize: 14, fontVariationSettings: '"FILL" 0, "wght" 300, "opsz" 20' }}>search</span>
              </div>
            </div>

            {/* Stronger GRAVE toggle — printed tool aesthetic, not subtle UI widget */}
            <div className="flex border border-[#D1D1D6] dark:border-[#3A3A3C] rounded-[4px] overflow-hidden text-[11px] font-medium shadow-sm bg-white dark:bg-[#2C2C2E]">
              <button
                onClick={() => setGraveOnly(false)}
                className={`flex-1 px-3 py-1.5 transition-all active:scale-[0.985] ${
                  !graveOnly
                    ? "bg-[#1C1C1E] text-white shadow-inner"
                    : isDark ? "text-[#8E8E93] hover:bg-[#3A3A3C]" : "text-[#3C3C43] hover:bg-[#F8F8F9]"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setGraveOnly(true)}
                className={`flex-1 px-3 py-1.5 border-l border-[#D1D1D6] dark:border-[#3A3A3C] transition-all active:scale-[0.985] ${
                  graveOnly
                    ? "bg-[#1C1C1E] text-white shadow-inner"
                    : isDark ? "text-[#8E8E93] hover:bg-[#3A3A3C]" : "text-[#3C3C43] hover:bg-[#F8F8F9]"
                }`}
                title="Only TMs with grave_pool availability for 11pm–6:55am"
              >
                GRAVE only
              </button>
            </div>
            {graveOnly && (
              <div className="text-[9px] text-[#8E8E93] px-1 tracking-[0.3px]">
                Filtered to TMs marked for grave rotations
              </div>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto px-4 pb-8 space-y-1.5">
            {realRoster.length === 0 && (
              <div className="text-xs text-[#8E8E93] px-2 py-1">Loading roster…</div>
            )}

            {(() => {
              // Respect GRAVE shift filter when enabled (Option B - data backed)
              const rawRoster = graveOnly ? graveRoster : realRoster;

              // assignedThisNight is computed at component level (useMemo) — use it directly.
              const sourceRoster = rawRoster.map((tm: any) => ({
                ...tm,
                isOnSchedule: assignedThisNight.has(tm.id),
              }));

              let onThisNight, alreadyDeployed, porters, pmOverlaps, amOverlaps, regularGravePool;
              let scheduledUnplacedGraves: any[] = [];
              let scheduledUnplacedPM: any[] = [];
              let scheduledUnplacedAM: any[] = [];

              const isPorter = (tm: any) => (tm.primarySection || '').toLowerCase().includes('porter');

              // Called-off TMs live in their own bucket. Filter them out of
              // every other group so they appear ONLY under "Called Off".
              const calledOff = sourceRoster.filter((t: any) => calledOffIds.has(t.id));
              const notCalledOff = sourceRoster.filter((t: any) => !calledOffIds.has(t.id));

              if (graveOnly) {
                onThisNight = notCalledOff.filter((t: any) => t.isOnSchedule);
                alreadyDeployed = notCalledOff.filter((t: any) => t.isOnWeek && !t.isOnSchedule);

                const notAssignedThisNight = notCalledOff.filter((t: any) => !t.isOnSchedule);

                // Scheduled-tonight-unplaced: ADP schedule says they're working but no zone yet.
                // Only active when schedule data has been imported for tonight.
                const hasScheduleData = scheduledTmIdsTonight.size > 0;
                const scheduledUnplaced = hasScheduleData
                  ? notAssignedThisNight.filter((t: any) => scheduledTmIdsTonight.has(t.id))
                  : [];
                const scheduledUnplacedIds = new Set(scheduledUnplaced.map((t: any) => t.id));

                scheduledUnplacedGraves = scheduledUnplaced.filter(
                  (t: any) => !isPorter(t) && t.gravePool === 'Full'
                );
                scheduledUnplacedPM = scheduledUnplaced.filter((t: any) => t.isPMOverlap);
                scheduledUnplacedAM = scheduledUnplaced.filter(
                  (t: any) => t.isAMOverlap && !t.isPMOverlap
                );

                // Remaining unplaced — exclude TMs already shown in the scheduled section
                const remaining = hasScheduleData
                  ? notAssignedThisNight.filter((t: any) => !scheduledUnplacedIds.has(t.id))
                  : notAssignedThisNight;

                // Porters first (any role containing "porter")
                porters = remaining.filter((t: any) => isPorter(t));

                // Then overlaps from non-porters
                const nonPorters = remaining.filter((t: any) => !isPorter(t));

                pmOverlaps = nonPorters.filter((t: any) => t.isPMOverlap);
                amOverlaps = nonPorters.filter((t: any) => t.isAMOverlap && !t.isPMOverlap);
                regularGravePool = nonPorters.filter((t: any) => !t.isPMOverlap && !t.isAMOverlap);
              } else {
                onThisNight = notCalledOff.filter((t: any) => t.isOnSchedule);
                alreadyDeployed = [];
                porters = [];
                pmOverlaps = [];
                amOverlaps = [];
                regularGravePool = notCalledOff.filter((t: any) => !t.isOnSchedule);
              }

              const filteredCalledOff = (rosterSearch.trim().toLowerCase()
                ? calledOff.filter((tm: any) =>
                    tm.name.toLowerCase().includes(rosterSearch.trim().toLowerCase()) ||
                    tm.id.toLowerCase().includes(rosterSearch.trim().toLowerCase())
                  )
                : calledOff);

              const filterTerm = rosterSearch.trim().toLowerCase();

              const filteredOnThisNight = filterTerm
                ? onThisNight.filter((tm: any) =>
                    tm.name.toLowerCase().includes(filterTerm) ||
                    tm.id.toLowerCase().includes(filterTerm) ||
                    (tm.primarySection || "").toLowerCase().includes(filterTerm)
                  )
                : onThisNight;

              const filteredDeployed = filterTerm
                ? alreadyDeployed.filter((tm: any) =>
                    tm.name.toLowerCase().includes(filterTerm) ||
                    tm.id.toLowerCase().includes(filterTerm) ||
                    (tm.primarySection || "").toLowerCase().includes(filterTerm)
                  )
                : alreadyDeployed;

              const filteredPorters = filterTerm
                ? porters.filter((tm: any) =>
                    tm.name.toLowerCase().includes(filterTerm) ||
                    tm.id.toLowerCase().includes(filterTerm) ||
                    (tm.primarySection || "").toLowerCase().includes(filterTerm)
                  )
                : porters;

              const filteredPMOverlaps = filterTerm
                ? pmOverlaps.filter((tm: any) =>
                    tm.name.toLowerCase().includes(filterTerm) ||
                    tm.id.toLowerCase().includes(filterTerm) ||
                    (tm.primarySection || "").toLowerCase().includes(filterTerm)
                  )
                : pmOverlaps;

              const filteredAMOverlaps = filterTerm
                ? amOverlaps.filter((tm: any) =>
                    tm.name.toLowerCase().includes(filterTerm) ||
                    tm.id.toLowerCase().includes(filterTerm) ||
                    (tm.primarySection || "").toLowerCase().includes(filterTerm)
                  )
                : amOverlaps;

              const filteredRegularGrave = filterTerm
                ? regularGravePool.filter((tm: any) =>
                    tm.name.toLowerCase().includes(filterTerm) ||
                    tm.id.toLowerCase().includes(filterTerm) ||
                    (tm.primarySection || "").toLowerCase().includes(filterTerm)
                  )
                : regularGravePool;

              const filteredSchedGraves = filterTerm
                ? scheduledUnplacedGraves.filter((tm: any) =>
                    tm.name.toLowerCase().includes(filterTerm) ||
                    tm.id.toLowerCase().includes(filterTerm) ||
                    (tm.primarySection || "").toLowerCase().includes(filterTerm)
                  )
                : scheduledUnplacedGraves;

              const filteredSchedPM = filterTerm
                ? scheduledUnplacedPM.filter((tm: any) =>
                    tm.name.toLowerCase().includes(filterTerm) ||
                    tm.id.toLowerCase().includes(filterTerm) ||
                    (tm.primarySection || "").toLowerCase().includes(filterTerm)
                  )
                : scheduledUnplacedPM;

              const filteredSchedAM = filterTerm
                ? scheduledUnplacedAM.filter((tm: any) =>
                    tm.name.toLowerCase().includes(filterTerm) ||
                    tm.id.toLowerCase().includes(filterTerm) ||
                    (tm.primarySection || "").toLowerCase().includes(filterTerm)
                  )
                : scheduledUnplacedAM;

              return (
                <>
                  {/* 0. Called Off — TMs explicitly removed from tonight's schedule. */}
                  {filteredCalledOff.length > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => setCalledOffExpanded(v => !v)}
                        aria-expanded={calledOffExpanded}
                        className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-[#C2410C] font-semibold px-1 pt-2 pb-0.5 hover:text-[#9A3412] transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: calledOffExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                          Called Off
                        </span>
                        <span className="tabular-nums">{filteredCalledOff.length}</span>
                      </button>
                      {calledOffExpanded && filteredCalledOff.map((tm: any) => (
                        <div
                          key={tm.id}
                          className="px-2 py-1 mx-1 my-0.5 rounded-md bg-orange-50/60 border border-orange-200/60 flex items-center gap-2 text-[12px]"
                        >
                          <span className="line-through text-orange-700/80 font-medium truncate flex-1">
                            {tm.name || tm.fullName || tm.id}
                          </span>
                          <span className="text-[9px] uppercase tracking-[0.6px] text-orange-600/70 font-semibold">
                            off
                          </span>
                        </div>
                      ))}
                      <div className="h-px bg-[#E5E5E7] mx-1 my-1" />
                    </>
                  )}

                  {/* 0b. Scheduled Tonight — Not Yet Placed (Graves / PM / AM) */}
                  {graveOnly && scheduledTmIdsTonight.size > 0 && (filteredSchedGraves.length > 0 || filteredSchedPM.length > 0 || filteredSchedAM.length > 0) && (
                    <>
                      {/* Section label */}
                      <div className="flex items-center gap-2 px-1 pt-2 pb-0.5">
                        <div className="flex-1 h-px bg-amber-500/25" />
                        <span className="text-[9px] uppercase tracking-[1.2px] text-amber-600/80 font-semibold whitespace-nowrap">
                          On Schedule — Not Placed
                        </span>
                        <div className="flex-1 h-px bg-amber-500/25" />
                      </div>

                      {/* Graves sub-group */}
                      {filteredSchedGraves.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setScheduledGravesExpanded(v => !v)}
                            aria-expanded={scheduledGravesExpanded}
                            className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-amber-600 font-semibold px-1 pt-1 pb-0.5 hover:text-amber-500 transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: scheduledGravesExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                              Graves
                            </span>
                            <span className="tabular-nums">{filteredSchedGraves.length}{filterTerm ? ` / ${scheduledUnplacedGraves.length}` : ""}</span>
                          </button>
                          {scheduledGravesExpanded && filteredSchedGraves.map((tm: any) => {
                            const isAssigned = assignedThisNight.has(tm.id);
                            return <RosterItem key={tm.id} tm={tm} isAssigned={isAssigned} emphasis="scheduled" />;
                          })}
                        </>
                      )}

                      {/* PM Overlaps sub-group */}
                      {filteredSchedPM.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setScheduledPMExpanded(v => !v)}
                            aria-expanded={scheduledPMExpanded}
                            className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-amber-600 font-semibold px-1 pt-1 pb-0.5 hover:text-amber-500 transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: scheduledPMExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                              PM Overlaps (out at 1:00am)
                            </span>
                            <span className="tabular-nums">{filteredSchedPM.length}{filterTerm ? ` / ${scheduledUnplacedPM.length}` : ""}</span>
                          </button>
                          {scheduledPMExpanded && filteredSchedPM.map((tm: any) => {
                            const isAssigned = assignedThisNight.has(tm.id);
                            return <RosterItem key={tm.id} tm={tm} isAssigned={isAssigned} emphasis="scheduled" />;
                          })}
                        </>
                      )}

                      {/* AM Overlaps sub-group */}
                      {filteredSchedAM.length > 0 && (
                        <>
                          <button
                            type="button"
                            onClick={() => setScheduledAMExpanded(v => !v)}
                            aria-expanded={scheduledAMExpanded}
                            className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-amber-600 font-semibold px-1 pt-1 pb-0.5 hover:text-amber-500 transition-colors"
                          >
                            <span className="flex items-center gap-1.5">
                              <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: scheduledAMExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                              AM Overlaps (in 5:00–5:30am)
                            </span>
                            <span className="tabular-nums">{filteredSchedAM.length}{filterTerm ? ` / ${scheduledUnplacedAM.length}` : ""}</span>
                          </button>
                          {scheduledAMExpanded && filteredSchedAM.map((tm: any) => {
                            const isAssigned = assignedThisNight.has(tm.id);
                            return <RosterItem key={tm.id} tm={tm} isAssigned={isAssigned} emphasis="scheduled" />;
                          })}
                        </>
                      )}

                      <div className="h-px bg-amber-500/20 mx-1 my-1" />
                    </>
                  )}

                  {/* 1. Already Deployed — Assigned on this GRAVE night (collapsed) */}
                  {graveOnly && filteredOnThisNight.length > 0 && (
                    <>
                      <div className="h-px bg-[#E5E5E7] mx-1 my-1" />
                      <button
                        type="button"
                        onClick={() => setDeployedExpanded(v => !v)}
                        aria-expanded={deployedExpanded}
                        className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-[#8E8E93] font-semibold px-1 pt-2 pb-0.5 hover:text-[#1C1C1E] transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: deployedExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                          Already Deployed
                        </span>
                        <span className="tabular-nums">
                          {filteredOnThisNight.length}{filterTerm ? ` / ${onThisNight.length}` : ""}
                        </span>
                      </button>
                      {deployedExpanded && filteredOnThisNight.map((tm: any) => {
                        const isAssigned = assignedThisNight.has(tm.id);
                        return <RosterItem key={tm.id} tm={tm} isAssigned={isAssigned} emphasis="off" />;
                      })}
                    </>
                  )}

                  {/* 2. Porters (collapsed by default) */}
                  {graveOnly && filteredPorters.length > 0 && (
                    <>
                      <div className="h-px bg-[#E5E5E7] mx-1 my-1" />
                      <button
                        type="button"
                        onClick={() => setPortersExpanded(v => !v)}
                        aria-expanded={portersExpanded}
                        className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-[#8E8E93] font-semibold px-1 pt-2 pb-0.5 hover:text-[#1C1C1E] transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: portersExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                          Porters
                        </span>
                        <span className="tabular-nums">
                          {filteredPorters.length}{filterTerm ? ` / ${porters.length}` : ""}
                        </span>
                      </button>
                      {portersExpanded && filteredPorters.map((tm: any) => {
                        const isAssigned = assignedThisNight.has(tm.id);
                        return <RosterItem key={tm.id} tm={tm} isAssigned={isAssigned} emphasis="off" />;
                      })}
                    </>
                  )}

                  {/* 3. AM Overlaps (collapsed) */}
                  {graveOnly && filteredAMOverlaps.length > 0 && (
                    <>
                      <div className="h-px bg-[#E5E5E7] mx-1 my-1" />
                      <button
                        type="button"
                        onClick={() => setAmOverlapsExpanded(v => !v)}
                        aria-expanded={amOverlapsExpanded}
                        className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-[#8E8E93] font-semibold px-1 pt-2 pb-0.5 hover:text-[#1C1C1E] transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: amOverlapsExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                          AM Overlaps (in 5:00–5:30am)
                        </span>
                        <span className="tabular-nums">
                          {filteredAMOverlaps.length}{filterTerm ? ` / ${amOverlaps.length}` : ""}
                        </span>
                      </button>
                      {amOverlapsExpanded && filteredAMOverlaps.map((tm: any) => {
                        const isAssigned = assignedThisNight.has(tm.id);
                        return <RosterItem key={tm.id} tm={tm} isAssigned={isAssigned} emphasis="off" />;
                      })}
                    </>
                  )}

                  {/* 4. PM Overlaps (collapsed) */}
                  {graveOnly && filteredPMOverlaps.length > 0 && (
                    <>
                      <div className="h-px bg-[#E5E5E7] mx-1 my-1" />
                      <button
                        type="button"
                        onClick={() => setPmOverlapsExpanded(v => !v)}
                        aria-expanded={pmOverlapsExpanded}
                        className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-[#8E8E93] font-semibold px-1 pt-2 pb-0.5 hover:text-[#1C1C1E] transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: pmOverlapsExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                          PM Overlaps (out at 1:00am)
                        </span>
                        <span className="tabular-nums">
                          {filteredPMOverlaps.length}{filterTerm ? ` / ${pmOverlaps.length}` : ""}
                        </span>
                      </button>
                      {pmOverlapsExpanded && filteredPMOverlaps.map((tm: any) => {
                        const isAssigned = assignedThisNight.has(tm.id);
                        return <RosterItem key={tm.id} tm={tm} isAssigned={isAssigned} emphasis="off" />;
                      })}
                    </>
                  )}

                  {/* 5. Not Scheduled — Regular GRAVE Pool */}
                  {filteredRegularGrave.length > 0 && (
                    <>
                      <div className="h-px bg-[#E5E5E7] mx-1 my-1" />
                      <button
                        type="button"
                        onClick={() => setOtherTmsExpanded(v => !v)}
                        aria-expanded={otherTmsExpanded}
                        className="w-full flex items-center justify-between text-[10px] uppercase tracking-[1px] text-[#8E8E93] font-semibold px-1 pt-2 pb-0.5 hover:text-[#1C1C1E] transition-colors"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="ms" style={{ fontSize: 12, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20', display: 'inline-block', transform: otherTmsExpanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 120ms ease" }}>chevron_right</span>
                          Not Scheduled
                        </span>
                        <span className="tabular-nums">
                          {filteredRegularGrave.length}{filterTerm ? ` / ${regularGravePool.length}` : ""}
                        </span>
                      </button>
                      {otherTmsExpanded && filteredRegularGrave.map((tm: any) => {
                        const isAssigned = assignedThisNight.has(tm.id);
                        return <RosterItem key={tm.id} tm={tm} isAssigned={isAssigned} emphasis="off" />;
                      })}
                    </>
                  )}

                  {filterTerm && filteredOnThisNight.length === 0 && filteredPorters.length === 0 && filteredAMOverlaps.length === 0 && filteredPMOverlaps.length === 0 && filteredRegularGrave.length === 0 && (
                    <div className="text-xs text-[#8E8E93] px-2 py-2">No matches for “{rosterSearch}”</div>
                  )}
                </>
              );
            })()}
          </div>
        </RosterDropZone>
        </div>
        {/* End floating roster panel */}

        {/* Old left-anchored roster trigger removed — now part of the centered expandable control cluster below. */}

        {/* Old left rail (roster trigger + collapsible ⋮ controls) fully removed.
           Replaced by a single centered expandable control cluster (see below). */}

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
                  className={`relative min-w-[42px] h-8 px-2 rounded-xl text-[11px] font-semibold tracking-[-0.1px] transition-all flex items-center justify-center gap-1 ${useOutline ? "border shadow-sm" : isSelected ? "text-white shadow" : "text-[#6B7280] hover:bg-[#F3F4F6]"}`}
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
          className="flex-1 overflow-auto bg-[#F2F2F4] dark:bg-[#0D0D0F] flex items-center justify-center transition-[padding] duration-300"
          style={{
            // Explicit per-side padding so the artboard floats clear of every
            // piece of floating chrome:
            //   • Top:    Velvet top bar (56px) — pad 72px so the
            //              artboard's top edge sits 12px below it.
            //   • Right:  zoom chip top-right + status pill bottom-right —
            //              the artboard never extends under either.
            //   • Bottom: pill cluster + status pill share the bottom-3
            //              baseline (~40px tall) — pad ~72px so the
            //              artboard's bottom edge clears both with breathing
            //              room.
            //   • Left:   when roster panel is open, 296px (280px panel +
            //              16px gap); when collapsed, 64px so the sphere
            //              (left-3, 48px wide) has air around it.
            paddingTop: 72,
            paddingRight: markerSlotKey ? 308 : 64,
            paddingBottom: 80,
            paddingLeft: rosterOpen ? 296 : 64,
          }}
        >
          <div
            className="print-stage flex-shrink-0 relative"
            style={{ width: NATURAL_WIDTH * scale, height: NATURAL_HEIGHT * scale }}
          >
          <div
            className="print-stage-inner relative"
            ref={positioningRef}
            style={{
              width: NATURAL_WIDTH,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
            }}
          >
            {/* Pill cluster moved out of this scaled wrapper — rendered as a
               sibling of .print-stage-inner below so it floats at the
               bottom-center of the canvas at a constant, tap-friendly size
               regardless of zoom level. */}

            {/* Fixed 1056px artboard — strictly 11×8.5" (1056px), centered, never resizes with window */}
            <div className="print-artboard">
              {/* Golden header: BIG 15 + day name + month/day-of-week + BREAKS dots
                 on the left; GRAVE meta + week pills + GROUP selector on the right. */}
              <div className="sheet-header flex items-end justify-between flex-shrink-0 pb-1.5 mb-2">
                {/* LEFT */}
                <div className="flex items-end gap-3">
                  <div
                    className="font-black tabular-nums leading-[0.78]"
                    style={{
                      fontSize: 58,
                      letterSpacing: '-3px',
                      fontFamily: 'var(--font-atkinson)',
                      // Solid on deployment, outlined on break sheet for contrast with title.
                      // In dark mode use a lighter stroke/fill so the number is actually visible.
                      ...(currentView === "deployment"
                        ? { color: isDark ? '#E5E5E7' : '#1C1C1E' }
                        : {
                            color: 'transparent',
                            WebkitTextStroke: `1.5px ${isDark ? '#9CA3AF' : '#1C1C1E'}`,
                            textShadow: 'none',
                          }),
                    }}
                  >
                    {selectedDay.dateNum}
                  </div>
                  <div className="-mb-0.5 flex flex-col">
                    <div
                      className="font-bold leading-none"
                      style={{ color: selectedDay.color, fontSize: 26, letterSpacing: '-0.8px', fontFamily: 'var(--font-atkinson)' }}
                    >
                      {currentView === "deployment" ? selectedDay.name : "Break Sheet"}
                    </div>
                    <div className="text-[11px] mt-0.5 leading-none" style={{ color: isDark ? '#9CA3AF' : '#4B5563' }}>
                      {currentView === "deployment"
                        ? `${selectedDay.monthYear} · Day ${selectedDayIndex + 1} of 7`
                        : `${selectedDay.name} · ${selectedDay.monthYear}`}
                    </div>
                    {currentView === "deployment" ? (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[8.5px] font-bold tracking-[1px]" style={{ color: isDark ? '#E5E5E7' : '#1C1C1E', fontFamily: 'var(--font-atkinson)' }}>BREAKS</span>
                        <div className="flex gap-[2px]">
                          {[1, 2, 3].map((g) => (
                            <div
                              key={g}
                              className="w-[14px] h-[14px] rounded-full text-[8px] font-bold leading-none flex items-center justify-center tabular-nums"
                              style={{ background: isDark ? '#E5E5E7' : '#1C1C1E', color: isDark ? '#1C1C1E' : '#fff', fontFamily: 'var(--font-atkinson)' }}
                              title={`Break ${g}: ${breakCounts[g as 1 | 2 | 3]} TM${breakCounts[g as 1 | 2 | 3] === 1 ? "" : "s"}`}
                            >
                              {breakCounts[g as 1 | 2 | 3] || ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] font-bold tabular-nums" style={{ color: isDark ? '#F2F2F4' : '#111' }}>{inRotationCount}</span>
                        <span className="text-[8.5px] font-bold tracking-[1px]" style={{ color: isDark ? '#E5E5E7' : '#1C1C1E', fontFamily: 'var(--font-atkinson)' }}>IN ROTATION</span>
                        <span className="text-[8.5px] font-bold tracking-[1px] ml-1.5" style={{ color: isDark ? '#E5E5E7' : '#1C1C1E', fontFamily: 'var(--font-atkinson)' }}>BREAKS</span>
                        <div className="flex gap-[2px]">
                          {[1, 2, 3].map((g) => (
                            <div
                              key={g}
                              className="w-[14px] h-[14px] rounded-full text-[8px] font-bold leading-none flex items-center justify-center tabular-nums"
                              style={{ background: isDark ? '#E5E5E7' : '#1C1C1E', color: isDark ? '#1C1C1E' : '#fff', fontFamily: 'var(--font-atkinson)' }}
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

                {/* RIGHT */}
                <div className="flex flex-col items-end gap-1.5">
                  {/* "GRAVE · 11PM – 7AM" used to live here for the deployment
                     view; removed because it added vertical space above the
                     week pills with no operational value (the shift type is
                     also conveyed by the footer "GRAVES" tag). The breaks
                     view still shows "BY BREAK WAVE" since that label is
                     genuinely disambiguating between the two view modes. */}
                  {currentView === "breaks" && (
                    <div
                      className="text-[9.5px] font-bold tracking-[1.2px] uppercase"
                      style={{ color: isDark ? '#9CA3AF' : '#1C1C1E', fontFamily: 'var(--font-atkinson)' }}
                    >
                      BY BREAK WAVE
                    </div>
                  )}

                  {/* Week pills */}
                  <div className="flex gap-[2px]">
                    {DAY_DEFS.map((d, i) => {
                      const isActive = i === selectedDayIndex;
                      return (
                        <div
                          key={i}
                          onClick={() => setSelectedDayIndex(i)}
                          className="min-w-[18px] h-[16px] px-1 text-[9px] flex items-center justify-center font-bold tracking-[-0.2px] rounded-[3px] cursor-pointer"
                          style={{
                            background: isActive ? d.color : 'transparent',
                            color: isActive ? '#fff' : (isDark ? '#9CA3AF' : '#6B7280'),
                            fontFamily: 'var(--font-atkinson)',
                          }}
                          title={d.name}
                        >
                          {d.short}
                        </div>
                      );
                    })}
                  </div>

                  {/* Group selector (Golden shows GROUP label + three numbered pills) */}
                  {currentView === "deployment" && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[8.5px] font-bold tracking-[1px] text-[#1C1C1E]" style={{ fontFamily: 'var(--font-atkinson)' }}>GROUP</span>
                      <div className="flex gap-[3px]">
                        {[1,2,3].map(g => {
                          const isActive = breakGroup === g;
                          return (
                            <div
                              key={g}
                              onClick={() => setBreakGroup(g as 1|2|3)}
                              className="min-w-[15px] h-[15px] px-1 text-[9px] flex items-center justify-center font-bold rounded-[2px] cursor-pointer"
                              style={{
                                background: isActive ? '#1C1C1E' : '#E5E5E7',
                                color: isActive ? '#fff' : '#6B7280',
                                fontFamily: 'var(--font-atkinson)',
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

                  {/* Undo / Redo — calm, operational, Golden-aligned */}
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      onClick={() => {
                        const prev = shiftHistory.undo();
                        if (prev) applySnapshot(prev);
                      }}
                      disabled={!shiftHistory.canUndo}
                      className="text-[10px] px-2 py-0.5 rounded border border-[#E5E5E7] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8F8F9] active:bg-[#F4F4F6] transition-colors"
                      style={{ fontFamily: "var(--font-atkinson)" }}
                      title={shiftHistory.getUndoDescription() ? `Undo: ${shiftHistory.getUndoDescription()}` : "Undo"}
                    >
                      Undo
                    </button>
                    <button
                      onClick={() => {
                        const next = shiftHistory.redo();
                        if (next) applySnapshot(next);
                      }}
                      disabled={!shiftHistory.canRedo}
                      className="text-[10px] px-2 py-0.5 rounded border border-[#E5E5E7] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8F8F9] active:bg-[#F4F4F6] transition-colors"
                      style={{ fontFamily: "var(--font-atkinson)" }}
                      title={shiftHistory.getRedoDescription() ? `Redo: ${shiftHistory.getRedoDescription()}` : "Redo"}
                    >
                      Redo
                    </button>
                  </div>
                </div>
              </div>

              {isDraftMode && (
                <div
                  className="mx-2 mt-1 mb-2 px-3 py-1.5 bg-amber-100 border border-amber-300 rounded text-amber-800 text-xs font-medium flex items-center justify-between gap-3"
                  style={{ fontFamily: "var(--font-atkinson)" }}
                >
                  <span className="truncate">
                    📝 DRAFT MODE — Engine suggestions shown. Previous assignments faded below.
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={applyDraft}
                      className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-medium tracking-[0.2px] hover:bg-emerald-700 active:scale-[0.985] transition-all"
                    >
                      Apply Draft
                    </button>
                    <button
                      onClick={discardDraft}
                      className="px-2.5 py-0.5 rounded-full bg-white/70 text-amber-900 border border-amber-300 text-[11px] font-medium tracking-[0.2px] hover:bg-white active:scale-[0.985] transition-all"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              )}
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              {currentView === "deployment" ? (
                <>
                  {/* ZONES — Golden: 2 rows × 5 cols */}
                  <section className="mb-2">
                    <div className="sheet-section-header">
                      <span className="label">ZONES</span>
                      <div className="divider" />
                      <span className="count">
                        {ZONE_DEFS.filter(d => !!assignments[d.key]?.tmName).length} / 10 FILLED
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5" style={{ gridAutoRows: "minmax(135px, auto)" }}>
                      {ZONE_DEFS.map((def) => (
                        <ZoneCard
                          key={def.key}
                          def={def}
                          assignments={assignments}
                          selectedTasks={selectedTasks}
                          setBreakGroupForSlot={setBreakGroupForSlot}
                          onCardClick={openPaletteForSlot}
                          loading={loadingAssignments}
                          borderColor={cardBorders[def.key]}
                          isDraftMode={isDraftMode}
                          draftInfo={draftAssignments[def.key]}
                          onRemoveTask={handleRemoveTask}
                          onSetTaskColor={handleSetTaskColor}
                          onEditTask={handleEditTask}
                        />
                      ))}
                    </div>
                  </section>

                  {/* RESTROOMS — Golden: 1 row × 5 cols, internal MEN'S / WOMEN'S split */}
                  <section className="mb-2">
                    <div className="sheet-section-header">
                      <span className="label">RESTROOMS</span>
                      <div className="divider" />
                      <span className="count">
                        {RR_DEFS.reduce((acc, d) => {
                          const m = !!assignments[`MRR${d.num}`]?.tmName;
                          const w = !!assignments[`WRR${d.num}`]?.tmName;
                          return acc + (m ? 1 : 0) + (w ? 1 : 0);
                        }, 0)} / 10 FILLED
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5" style={{ gridAutoRows: "minmax(112px, auto)" }}>
                      {RR_DEFS.map((def) => (
                        <RRCard
                          key={def.num}
                          def={def}
                          assignments={assignments}
                          selectedTasks={selectedTasks}
                          setBreakGroupForSlot={setBreakGroupForSlot}
                          onGenderClick={handleGenderClick}
                          loading={loadingAssignments}
                          borderColor={cardBorders[`RR${def.num}`] || cardBorders[`MRR${def.num}`] || cardBorders[`WRR${def.num}`]}
                          isDraftMode={isDraftMode}
                          draftInfo={draftAssignments[`MRR${def.num}`] || draftAssignments[`WRR${def.num}`]}
                          onRemoveTask={handleRemoveTask}
                          onSetTaskColor={handleSetTaskColor}
                          onEditTask={handleEditTask}
                        />
                      ))}
                    </div>
                  </section>

                  {/* AUXILIARY — default 5 slots, dynamically resizable.
                     gridTemplateColumns derived from count so adding a slot
                     reflows the row without touching Tailwind classes. */}
                  <section className="mb-2">
                    <div className="sheet-section-header">
                      <span className="label">AUXILIARY</span>
                      <div className="divider" />
                      <span className="count">
                        {auxDefs.filter(d => !!assignments[d.key]?.tmName).length} / {auxDefs.length} FILLED
                      </span>
                    </div>
                    <div
                      className="grid gap-1.5"
                      style={{
                        gridTemplateColumns: `repeat(${auxDefs.length}, minmax(0, 1fr))`,
                        gridAutoRows: "minmax(112px, auto)",
                      }}
                    >
                      {auxDefs.map((def) => (
                        <AuxCard
                          key={def.key}
                          def={def}
                          assignments={assignments}
                          selectedTasks={selectedTasks}
                          setBreakGroupForSlot={setBreakGroupForSlot}
                          onCardClick={openPaletteForSlot}
                          loading={loadingAssignments}
                          borderColor={cardBorders[def.key]}
                          isDraftMode={isDraftMode}
                          draftInfo={draftAssignments[def.key]}
                          onRemoveTask={handleRemoveTask}
                          onSetTaskColor={handleSetTaskColor}
                          onEditTask={handleEditTask}
                        />
                      ))}
                    </div>
                  </section>

                  {/* Notes pad removed — space now flows to cards */}
                </>
              ) : (
                <>
                  {/* 3 Break Wave Columns — Golden tight layout */}
                  <div className="grid grid-cols-3 gap-1 mb-1.5">
                    {(() => {
                      // Build a tmId → placed-assignment reverse lookup so we can show
                      // each TM's actual tonight-slot even when rendering from break_assignments.
                      const tmToAssignment: Record<string, any> = {};
                      Object.values(assignments).forEach((a: any) => {
                        if (a.tmId) tmToAssignment[a.tmId] = a;
                      });

                      // Derive slot type from a slotRef string (e.g. "Z3" → zone, "MRR7" → rr)
                      const slotRefType = (ref: string | null): 'zone' | 'rr' | 'aux' => {
                        if (!ref) return 'zone';
                        if (ref.startsWith('MRR') || ref.startsWith('WRR')) return 'rr';
                        if (/^Z\d+$/.test(ref)) return 'zone'; // Z1–Z10 only (not Z9SR)
                        return 'aux';
                      };

                      return [1, 2, 3].map((wave) => {
                      // Use nightBreakRows as the authoritative TM list so ALL scheduled
                      // TMs appear in every night's break sheet, not just those placed tonight.
                      const waveRows = nightBreakRows.filter(r => r.groupNum === wave);

                      // Build display-ready objects — prefer the actual tonight assignment
                      // (for correct slot chip), fall back to slotRef from break_assignments.
                      const waveAssignments = waveRows.map(r => {
                        const actual = tmToAssignment[r.tmId];
                        const tm = (realRoster as any[]).find((m: any) => m.id === r.tmId);
                        const tmName = actual?.tmName ?? tm?.name ?? tm?.fullName ?? r.tmId;
                        if (actual) return { ...actual, tmName };
                        // TM not placed tonight — use template slotRef for chip
                        const slotKey = r.slotRef ?? null;
                        return {
                          tmId: r.tmId,
                          tmName,
                          slotKey,
                          type: slotRefType(slotKey),
                          breakGroup: wave,
                          notPlaced: true,
                        };
                      });

                      const count = waveAssignments.length;
                      const waveColor =
                        wave === 1 ? "#1a2332" : wave === 2 ? "#5a6b7d" : "#c8d3dc";

                      const getLocs = (a: any) => {
                        if (a.type === "zone") {
                          const z = ZONE_DEFS.find((zz) => zz.key === a.slotKey);
                          return z ? z.locations.join(" · ") : "";
                        }
                        if (a.type === "rr") {
                          const num = parseInt((a.slotKey || "").replace(/\D/g, "")) || 1;
                          const def = RR_DEFS.find((r) => r.num === num);
                          return def ? `${def.mensLoc} / ${def.womensLoc}` : "";
                        }
                        if (a.type === "aux") {
                          const aux = auxDefs.find((x) => x.key === a.slotKey);
                          return aux ? aux.locations.join(" · ") : "";
                        }
                        return "";
                      };

                      return (
                        <div
                          key={wave}
                          className="border border-[#E5E5E7] dark:border-[#3A3A3C] rounded-[3px] bg-white dark:bg-[#1C1C1E] overflow-hidden flex flex-col"
                          style={{ borderTop: `3px solid ${waveColor}` }}
                        >
                          {/* Golden header per wave: big number on the left, BREAK N + count on the right */}
                          <div className="px-3 pt-2 pb-1 flex items-end gap-2.5 border-b border-[#F2F2F4] dark:border-[#2C2C2E]">
                            <div
                              className="font-black tabular-nums leading-none text-[#1C1C1E] dark:text-[#F2F2F4]"
                              style={{ fontSize: 42, letterSpacing: '-2px', fontFamily: 'var(--font-atkinson)' }}
                            >
                              {wave}
                            </div>
                            <div className="-mb-0.5">
                              <div
                                className="font-extrabold tracking-[1px] uppercase leading-none text-[#1C1C1E] dark:text-[#F2F2F4]"
                                style={{ fontSize: 13, fontFamily: 'var(--font-atkinson)' }}
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

                              const label =
                                cat === "zone" ? "ZONES" : cat === "rr" ? "RESTROOMS" : "AUXILIARY";

                              // Accent for each slot pill — matches the Golden chip color exactly.
                              const accentFor = (a: any): string => {
                                if (a.type === "zone") return getZoneColor(a.slotKey);
                                if (a.type === "rr") {
                                  const num = parseInt((a.slotKey || "").replace(/\D/g, ""), 10) || 1;
                                  return getRRAccent(num);
                                }
                                return getAuxAccent(a.slotKey);
                              };

                              // Friendly chip label (e.g. "ZONE 1", "RR 6 M", "TRASH 1").
                              const chipLabel = (a: any): string => {
                                if (a.type === "zone") {
                                  return `ZONE ${(a.slotKey || "").replace(/\D/g, "")}`;
                                }
                                if (a.type === "rr") {
                                  const num = (a.slotKey || "").replace(/\D/g, "");
                                  const side = (a.slotKey || "").startsWith("M") ? "M" : "W";
                                  const def = RR_DEFS.find(r => r.num === parseInt(num, 10));
                                  return def ? `${def.label} ${side}` : `RR ${num} ${side}`;
                                }
                                const def = auxDefs.find(d => d.key === a.slotKey);
                                return def ? def.label : a.slotKey;
                              };

                              return (
                                <div key={cat}>
                                  <div className="flex items-center gap-1 mb-1">
                                    <span className="text-[#6B7280] dark:text-[#8E8E93] font-bold tracking-[1.2px] uppercase text-[7.5px]" style={{ fontFamily: 'var(--font-atkinson)' }}>{label}</span>
                                    <div className="flex-1 h-px bg-[#E5E7EB] dark:bg-[#3A3A3C]" />
                                  </div>
                                  <div className="space-y-1">
                                    {items.map((a: any, idx: number) => {
                                      const accent = accentFor(a);
                                      // Only show a chip when the TM is actually placed
                                      // tonight. For scheduled-but-not-placed TMs the
                                      // template slotRef is stale/misleading — suppress it.
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
                                              style={{ borderColor: accent, color: accent, fontFamily: 'var(--font-atkinson)' }}
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
                    }); // end [1,2,3].map
                    })() /* end IIFE */}
                  </div>

                  {/* OVERLAPS — Golden: full-width section at bottom, two rows
                     (11p–1a and 5a–7a) of 6 empty slots each. 
                     The mt-auto + print post-processing pins this to the bottom
                     of the landscape break sheet page. */}
                  <section className="mt-auto pt-2 overlaps-section" data-print-target="overlaps">
                    <div className="sheet-section-header">
                      <span className="label">OVERLAPS</span>
                      <div className="divider" />
                      <span className="count">
                        {(() => {
                          let f = 0;
                          for (const half of ["PM", "AM"]) {
                            for (let i = 0; i < 6; i++) {
                              if (assignments[`OL-${half}-${i}`]?.tmName) f++;
                            }
                          }
                          return `${f} / 12 FILLED`;
                        })()}
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {[
                        { time: "11p – 1a", key: "PM" },
                        { time: "5a – 7a",  key: "AM" },
                      ].map((row) => (
                        <div key={row.key} className="flex items-center gap-2">
                          <div
                            className="w-[60px] flex-shrink-0 text-[10px] font-bold tracking-[0.4px] text-[#1C1C1E]"
                            style={{ fontFamily: 'var(--font-atkinson)' }}
                          >
                            {row.time}
                          </div>
                          <div className="flex-1 grid grid-cols-6 gap-1.5">
                            {Array.from({ length: 6 }).map((_, i) => (
                              <OverlapSlot
                                key={i}
                                slotKey={`OL-${row.key}-${i}`}
                                assignments={assignments}
                                selectedTasks={selectedTasks}
                                onCardClick={openPaletteForSlot}
                                loading={loadingAssignments}
                                isDraftMode={isDraftMode}
                                draftInfo={draftAssignments[`OL-${row.key}-${i}`]}
                                onRemoveTask={handleRemoveTask}
                                onSetTaskColor={handleSetTaskColor}
                                onEditTask={handleEditTask}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}
              </div>

              {/* Sheet footer */}
              <div className="sheet-footer flex-shrink-0">
                <div className="flex items-center gap-1">
                  <span className="font-bold tracking-[1px] text-[#1C1C1E]">SBS</span>
                  <span className="text-[#9CA3AF]">⚙</span>
                  <span className="text-[#6B7280]">Weekly Zone Deployment Book</span>
                  <span className="text-[#C8C8CC] mx-1">·</span>
                  <span className="font-semibold tracking-[1px] text-[#1C1C1E]">GRAVES</span>
                </div>
                <div className="text-[#9CA3AF] text-center">v0.7</div>
                <div className="text-[#6B7280] text-right">— {currentView === "deployment" ? (selectedDayIndex * 2 + 1) : (selectedDayIndex * 2 + 2)} of 14 —</div>
              </div>
            </div>


            {/* Quick Action Fan removed in Phase 1 of Command Palette Upgrade.
                All card interactions now route through the contextual Command Palette
                via openPaletteForSlot / openPaletteForPerson. */}
          </div>
          </div>

        </div>
      </div>

      {/* Floating ghost that follows the cursor / finger during drag.
         Rendered outside the artboard so it isn't clipped by overflow:hidden. */}
      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          activeDrag.kind === "task" ? (
            /* Task drag ghost — compact Velvet pill with drag_indicator */
            <div
              className="flex items-center gap-1.5 rounded-lg pointer-events-none whitespace-nowrap"
              style={{
                padding: "5px 10px 5px 7px",
                background: isDark ? "rgba(36,35,40,0.96)" : "rgba(255,255,255,0.96)",
                color: isDark ? "#E5E5E7" : "#1C1C1E",
                border: isDark ? "1px solid rgba(255,255,255,0.13)" : "1px solid rgba(0,0,0,0.09)",
                boxShadow: isDark
                  ? "0 8px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)"
                  : "0 8px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.90)",
                backdropFilter: "blur(20px)",
                fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
              }}
            >
              <span className="ms" style={{ fontSize: 16, color: "#9CA3AF", fontVariationSettings: '"FILL" 1, "wght" 300, "opsz" 20' }}>drag_indicator</span>
              <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "-0.2px" }}>{activeDrag.label}</span>
              {activeDrag.fromSlot && (
                <span style={{ fontSize: 10, opacity: 0.45, marginLeft: 2 }}>{activeDrag.fromSlot}</span>
              )}
            </div>
          ) : (
            /* TM drag ghost — name chip */
            <div
              className="flex items-center gap-1.5 rounded-lg pointer-events-none whitespace-nowrap"
              style={{
                padding: "6px 12px 6px 9px",
                background: isDark ? "rgba(36,35,40,0.96)" : "rgba(255,255,255,0.96)",
                color: isDark ? "#F2F2F4" : "#1C1C1E",
                border: isDark ? "1px solid rgba(255,255,255,0.13)" : "1px solid rgba(0,0,0,0.09)",
                boxShadow: isDark
                  ? "0 8px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.10)"
                  : "0 8px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.90)",
                backdropFilter: "blur(20px)",
                fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
              }}
            >
              <span className="ms" style={{ fontSize: 16, color: "#9CA3AF", fontVariationSettings: '"FILL" 1, "wght" 300, "opsz" 20' }}>person</span>
              <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "-0.3px" }}>{activeDrag.label}</span>
              {activeDrag.fromSlot && (
                <span style={{ fontSize: 10, opacity: 0.45, marginLeft: 2 }}>{activeDrag.fromSlot}</span>
              )}
            </div>
          )
        ) : null}
      </DragOverlay>
      </DndContext>

      {/* ═══════════════════════════════════════════════════════════
          VELVET BOTTOM DOCK — reference-faithful centered glass pill
          − zoom% + | undo redo ‹ › | Deployment Breaks | ↑4 · ↓4 | 🟢 · saved
          Height: 44px. Liquid glass. Replaces old status pill.
          ═══════════════════════════════════════════════════════════ */}
      {(() => {
        let savedAgo = "Loading…";
        if (lastSavedAt) {
          const secs = Math.floor((Date.now() - lastSavedAt.getTime()) / 1000);
          if (secs < 10)  savedAgo = "Saved";
          else if (secs < 60) savedAgo = "Just now";
          else {
            const mins = Math.floor(secs / 60);
            savedAgo = mins < 120
              ? `${mins}m ago`
              : `${Math.floor(mins / 60)}h ago`;
          }
        }

        const zoomPct = mounted
          ? Math.round((zoomMode === "fit" ? (fitScale ?? 1) : (zoomMode as number)) * 100)
          : 100;
        const numericSteps: Array<0.5 | 0.75 | 1 | 1.25> = [0.5, 0.75, 1, 1.25];
        const stepZoom = (dir: -1 | 1) => {
          if (zoomMode === "fit") {
            setZoomMode(dir > 0 ? 1.25 : 0.75);
            return;
          }
          const idx = numericSteps.indexOf(zoomMode);
          if (idx !== -1) setZoomMode(numericSteps[Math.max(0, Math.min(numericSteps.length - 1, idx + dir))]);
        };

        const dockBg = isDark ? "rgba(22,21,24,0.90)" : "rgba(252,252,250,0.92)";
        const dockBorder = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";
        const dockText = isDark ? "#8E8E93" : "#6B7280";
        const dockSep = isDark ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.08)";
        const dockBtnBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)";
        const dockActiveText = isDark ? "#F2F2F4" : "#111111";

        return (
          <div
            className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 flex items-center rounded-full border"
            style={{
              height: 44,
              background: dockBg,
              backdropFilter: "blur(48px) saturate(200%)",
              WebkitBackdropFilter: "blur(48px) saturate(200%)",
              borderColor: dockBorder,
              boxShadow: isDark
                ? "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 32px rgba(0,0,0,0.45)"
                : "inset 0 1px 0 rgba(255,255,255,0.90), 0 8px 32px rgba(0,0,0,0.08)",
              fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
              overflow: "hidden",
            }}
          >
            {/* − zoom% + */}
            <div className="flex items-center h-full" style={{ borderRight: `1px solid ${dockSep}` }}>
              <button
                type="button"
                onClick={() => stepZoom(-1)}
                title="Zoom out"
                className="flex items-center justify-center h-full px-2.5 transition-colors disabled:opacity-30"
                style={{ color: dockText }}
                disabled={!mounted || (zoomMode !== "fit" && numericSteps.indexOf(zoomMode) === 0)}
              >
                <span className="ms" style={{ fontSize: 18 }}>remove</span>
              </button>
              <button
                type="button"
                onClick={() => setZoomMode("fit")}
                title="Reset to fit"
                className="text-[11.5px] font-bold px-1 h-full transition-colors"
                style={{ color: dockActiveText, minWidth: 40, textAlign: "center", fontFamily: "var(--font-jetbrains, monospace)" }}
              >{zoomPct}%</button>
              <button
                type="button"
                onClick={() => stepZoom(1)}
                title="Zoom in"
                className="flex items-center justify-center h-full px-2.5 transition-colors disabled:opacity-30"
                style={{ color: dockText }}
                disabled={!mounted || (zoomMode !== "fit" && numericSteps.indexOf(zoomMode) === numericSteps.length - 1)}
              >
                <span className="ms" style={{ fontSize: 18 }}>add</span>
              </button>
            </div>

            {/* Undo / Redo / ← → */}
            <div className="flex items-center h-full" style={{ borderRight: `1px solid ${dockSep}` }}>
              <button
                type="button"
                onClick={() => { const prev = shiftHistory.undo(); if (prev) { setAssignments(prev.assignments); } }}
                disabled={!shiftHistory.canUndo}
                title="Undo (⌘Z)"
                className="flex items-center justify-center h-full px-3 disabled:opacity-30 transition-colors"
                style={{ color: dockText }}
              >
                <span className="ms" style={{ fontSize: 20, fontVariationSettings: '"FILL" 0, "wght" 300' }}>undo</span>
              </button>
              <button
                type="button"
                onClick={() => { const next = shiftHistory.redo(); if (next) { setAssignments(next.assignments); } }}
                disabled={!shiftHistory.canRedo}
                title="Redo (⌘⇧Z)"
                className="flex items-center justify-center h-full px-3 disabled:opacity-30 transition-colors"
                style={{ color: dockText }}
              >
                <span className="ms" style={{ fontSize: 20, fontVariationSettings: '"FILL" 0, "wght" 300' }}>redo</span>
              </button>

              {/* ← → day navigation (grouped together) */}
              <button
                type="button"
                onClick={goPrevDay}
                title="Previous day"
                className="flex items-center justify-center h-full px-2.5 transition-colors"
                style={{ color: dockText, borderLeft: `1px solid ${dockSep}` }}
              >
                <span className="ms" style={{ fontSize: 20 }}>chevron_left</span>
              </button>
              <button
                type="button"
                onClick={goNextDay}
                title="Next day"
                className="flex items-center justify-center h-full px-2.5 transition-colors"
                style={{ color: dockText }}
              >
                <span className="ms" style={{ fontSize: 20 }}>chevron_right</span>
              </button>
            </div>

            {/* Deployment / Breaks view tabs */}
            <div className="flex items-center gap-0 h-full px-1" style={{ borderRight: `1px solid ${dockSep}` }}>
              {(["deployment", "breaks"] as const).map(view => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setCurrentView(view)}
                  className="flex items-center justify-center h-[32px] px-3 rounded-full text-[12px] font-bold transition-all mx-0.5"
                  style={{
                    background: currentView === view ? dockBtnBg : "transparent",
                    color: currentView === view ? dockActiveText : dockText,
                    border: currentView === view
                      ? `1px solid ${isDark ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.08)"}`
                      : "1px solid transparent",
                  }}
                >{view.charAt(0).toUpperCase() + view.slice(1)}</button>
              ))}
            </div>

            {/* Save indicator */}
            <div className="flex items-center gap-2 px-3">
              <span
                className="w-[7px] h-[7px] rounded-full shrink-0"
                style={{
                  background: lastSavedAt
                    ? (Date.now() - lastSavedAt.getTime() < 120_000 ? "#34C759" : "#FF9F0A")
                    : "#8E8E93",
                }}
              />
              <span className="text-[11px]" style={{ color: dockText }}>{savedAgo}</span>
            </div>
          </div>
        );
      })()}

      {/* XAISphere removed — Ask AI button in bottom dock handles toggle */}

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
            className={`pointer-events-auto rounded-md shadow-lg border px-3 py-2 text-[13px] flex items-start gap-2 backdrop-blur-sm ${
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

      {/* Velvet Marker Pad — floating right panel, opens on card tap */}
      <MarkerPad
        slotKey={markerSlotKey}
        assignments={assignments}
        selectedTasks={selectedTasks}
        recentTasks={recentTasks}
        setBreakGroupForSlot={setBreakGroupForSlot}
        onAddTask={(slotKey, label) => handleCmdkAddTask(slotKey, label)}
        onRemoveTask={handleRemoveTask}
        onToggleLock={(slotKey) => toggleLock(slotKey)}
        onClearSlot={(slotKey) => { unassign(slotKey); setMarkerSlotKey(null); }}
        onAddCoverage={(sourceKey, targetKey) => handleCmdkAddCoverage(sourceKey, targetKey)}
        onAssign={(slotKey, tmId, tmName) => assign(slotKey, tmId, tmName)}
        scheduledUnassigned={markerScheduledUnassigned}
        allEligibleTms={markerAllEligibleTms}
        onClose={() => setMarkerSlotKey(null)}
        auxDefs={auxDefs}
        isDark={isDark}
        tmGender={markerSlotKey && assignments[markerSlotKey]?.tmId
          ? (realRoster.find((r: any) => r.id === assignments[markerSlotKey].tmId)?.gender ?? null)
          : null}
      />

      {/* Master Command Palette — Phase 2 core */}
      <CommandPalette
        open={cmdkOpen}
        onOpenChange={setCmdkOpen}
        actions={commandActions}
        onAddCardBorder={addCardBorder}
        onRemoveCardBorder={removeCardBorder}
        initialContext={cmdkInitialContext}
        onRemoveFromSlot={unassign}
        onToggleLock={toggleLock}
        onAssign={assign}
        catalog={catalog}
        onAddTask={handleCmdkAddTask}
        onCycleBreak={handleCmdkCycleBreak}
        selectedSlotAssignment={cmdkSelectedSlotAssignment}
        isDraftMode={isDraftMode}
        onApplyGrokSuggestions={applyGrokSuggestions}
        requestGrokStructuredSuggestions={requestGrokStructuredSuggestions}
        onTriggerGrokBoardAnalysis={triggerGrokBoardAnalysis}
        commandRoster={realRoster}
        commandShiftDate={selectedDay.date}
        commandWeekDays={cmdkWeekDays}
        onSetGravePool={handleCmdkSetGravePool}
        onSetDisplayName={handleCmdkSetDisplayName}
        onRemoveFromSchedule={handleCmdkRemoveFromSchedule}
        onCheckDisplayNameConflict={checkDisplayNameConflict}
        whyBreakdown={draftBreakdown}
        whyReasoning={draftGrokReasoning}
        whyGrokExplanation={draftGrokExplanation}
        whyWarnings={draftEngineWarnings}
        whyAvailable={isDraftMode && Object.keys(draftBreakdown).length > 0}
        onOpenSudo={() => setSudoOpen(true)}
        completionDay={selectedDay.name}
        completionScheduledUnplaced={cmdkCompletionUnplaced}
        completionAssignments={cmdkCompletionAssignments}
        onAddCoverage={handleCmdkAddCoverage}
      />

      {/* Night picker edge arrows removed — navigation lives in the bottom dock ← / → buttons */}

      {/* Print Command Center — full overlay with day selection, page order, margins */}
      <PrintCommandCenter
        open={isPrintCenterOpen}
        onClose={() => setIsPrintCenterOpen(false)}
        onPrint={handlePrintWithConfig}
        DAY_DEFS={DAY_DEFS}
        selectedDayIndex={selectedDayIndex}
        isPrinting={isPrinting}
        printProgress={printProgress}
        isDark={isDark}
      />

      <SudoWindow
        open={sudoOpen}
        onClose={() => setSudoOpen(false)}
        currentNightId={nightId}
        weekStart={weekStart}
        onDataChanged={async () => {
          // Refresh anything the sudo window might have mutated
          setTMCommandEpoch((e) => e + 1);
          setSudoDataEpoch((e) => e + 1);

          // Force-refresh the current night's break data (and other day-specific data)
          // so the break sheet group columns immediately reflect pushes from Sudo Defaults.
          if (nightId) {
            try {
              const freshBreaks = await getNightBreakAssignments(nightId);
              const breakByTm: Record<string, BreakGroup> = {};
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

              setNightBreakRows(
                freshBreaks
                  .filter((r: any) => r.groupNum && r.groupNum > 0 &&
                    (scheduledTmIdsTonight.size === 0 || scheduledTmIdsTonight.has(r.tmId)))
                  .map((r: any) => ({ tmId: r.tmId, groupNum: r.groupNum, slotRef: r.slotRef ?? null }))
              );
            } catch (e) {
              console.warn("[sudo] failed to refresh break data after Sudo change", e);
            }
          }

          // Also refresh the live engine config
          try {
            const fresh = await getActiveEngineConfig();
            setEngineConfig(fresh);
          } catch (e) {
            console.warn("[sudo] failed to refresh engineConfig after change", e);
          }
        }}
      />
    </div>
  );
}
