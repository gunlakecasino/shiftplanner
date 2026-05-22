"use client";

import React, { useState, useEffect, useRef } from "react";
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
  getNightBreakAssignments,
  upsertBreakAssignment,
  deleteBreakAssignment,
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


// === Golden-exact data definitions (restored) ===

// ── Date model ─────────────────────────────────────────────────────────────
// The operational "shift week" runs Friday → Thursday. A shift is named after
// the night it begins (Friday's grave = Fri 11p → Sat 7a). All date logic in
// this file flows from `weekStart` (a Friday) + a day index 0..6.
const SHIFT_WEEK_START_DOW = 5; // 0 = Sun, 5 = Fri

function startOfShiftWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  // distance back to the most recent Friday (inclusive)
  const back = (d.getDay() + 7 - SHIFT_WEEK_START_DOW) % 7;
  d.setDate(d.getDate() - back);
  return d;
}

// === Shift-aware "today" =====================================================
// A grave shift runs 11pm → 7am and is named after the day it BEGINS. So
// Friday's grave shift runs Fri 11pm → Sat 7am. At 6:30am Saturday morning the
// operator is still finishing Friday's deployment — the picker should still
// show Friday selected, not Saturday.
//
// SHIFT_ROLLOVER_HOUR/MINUTE define when "today" advances to the next calendar
// date. Before the rollover (midnight → 8:30am), we return *yesterday's*
// calendar date as the active shift date. After the rollover, we return
// today's calendar date.
const SHIFT_ROLLOVER_HOUR = 8;
const SHIFT_ROLLOVER_MINUTE = 30;

function currentShiftDate(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const hour = now.getHours();
  const minute = now.getMinutes();
  const beforeRollover =
    hour < SHIFT_ROLLOVER_HOUR ||
    (hour === SHIFT_ROLLOVER_HOUR && minute < SHIFT_ROLLOVER_MINUTE);
  if (beforeRollover) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

// Whole-day difference between two midnight-anchored Date values.
function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_LONG  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAY_LONG    = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

function formatWeekLabel(start: Date): string {
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} – ${end.getDate()}, ${end.getFullYear()}`;
  }
  return `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} – ${MONTH_SHORT[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
}

// Per-day accent colors (cycle through the 7 nights of the operational week).
const SHIFT_DAY_COLORS = ["#C13A14", "#0065bf", "#4d1a8a", "#1f7a3d", "#b8860b", "#8b4513", "#2f4f4f"];

interface DayDef {
  index: number;
  date: Date;
  short: string;
  name: string;
  dateNum: number;
  monthYear: string;
  color: string;
  meta: string;
  isToday: boolean;
}

function buildDayDefs(weekStart: Date, today: Date): DayDef[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const name = DAY_LONG[date.getDay()];
    return {
      index: i,
      date,
      short: name.charAt(0),
      name,
      dateNum: date.getDate(),
      monthYear: `${MONTH_LONG[date.getMonth()]} ${date.getFullYear()}`,
      color: SHIFT_DAY_COLORS[i],
      meta: "11p – 7a",
      isToday: sameDay(date, today),
    };
  });
}

// Placement order is now imported from @/lib/shiftbuilder/placement
// (single source of truth for the Coverage Planner)

// Zone identities — labels are rendered uppercase in the card per the Golden
const ZONE_DEFS = [
  { key: "Z1",  label: "ZONE 1",  locations: ["Main Entry North"] },
  { key: "Z2",  label: "ZONE 2",  locations: ["Main Entry South"] },
  { key: "Z3",  label: "ZONE 3",  locations: ["Food Court North"] },
  { key: "Z4",  label: "ZONE 4",  locations: ["Food Court South"] },
  { key: "Z5",  label: "ZONE 5",  locations: ["Slots West"] },
  { key: "Z6",  label: "ZONE 6",  locations: ["Slots East"] },
  { key: "Z7",  label: "ZONE 7",  locations: ["High Limit"] },
  { key: "Z8",  label: "ZONE 8",  locations: ["Table Games North"] },
  { key: "Z9",  label: "ZONE 9",  locations: ["Table Games South"] },
  { key: "Z10", label: "ZONE 10", locations: ["Poker"] },
];

// Restrooms — labels match the Golden ("RR 1+2", "RR 6", etc.)
const RR_DEFS = [
  { num: 1,  label: "RR 1+2", mensLoc: "Main Entry",  womensLoc: "Main Entry"  },
  { num: 6,  label: "RR 6",   mensLoc: "Slots",       womensLoc: "Slots"       },
  { num: 7,  label: "RR 7",   mensLoc: "High Limit",  womensLoc: "High Limit"  },
  { num: 8,  label: "RR 8",   mensLoc: "Table Games", womensLoc: "Table Games" },
  { num: 10, label: "RR 10",  mensLoc: "Poker",       womensLoc: "Poker"       },
];

// Auxiliary / Support slots
// NOTE: The first four (Z9SR, ADM, TR1, TR2) have **fixed positions** in PLACEMENT_ORDER.
// Any additional support slots the operator adds should be appended after TR2.
const DEFAULT_AUX_DEFS: AuxDef[] = [
  { key: "Z9SR", label: "Z9 SR",     locations: ["Z9 Smoking Room"] },
  { key: "ADM",  label: "ADMIN",     locations: ["Floor Admin"]     },
  { key: "TR1",  label: "TRASH 1",   locations: ["West Trash Run"]  },
  { key: "TR2",  label: "TRASH 2",   locations: ["East Trash Run"]  },
  { key: "SP1",  label: "SUPPORT 1", locations: ["Float Support"]   },
];

// Fallback accents for operator-added AUX slots (cycle through these so they
// don't all collapse to the same gray).
const EXTRA_AUX_COLORS = ["#6B7280", "#0EA5E9", "#A855F7", "#16A34A", "#DC2626"];

// Per-zone identity glyphs — match the Golden's symbol-per-zone treatment.
// Each zone has a unique shape rendered in the zone's accent color in the
// card header, giving operators a non-verbal visual anchor while scanning.
const ZONE_ICONS: Record<string, string> = {
  Z1:  "★", // ★ star
  Z2:  "◆", // ◆ diamond
  Z3:  "▲", // ▲ triangle up
  Z4:  "■", // ■ square
  Z5:  "⬟", // ⬟ black pentagon
  Z6:  "♥", // ♥ heart
  Z7:  "●", // ● circle
  Z8:  "◐", // ◐ half-disc
  Z9:  "☾", // ☾ moon
  Z10: "✚", // ✚ heavy cross
};

// RR cards reuse the zone glyph of the area they serve.
const RR_ICONS: Record<number, string> = {
  1:  "★", // ★ — RR 1+2 paired with the Z1/Z2 zone identity
  6:  "♥", // ♥
  7:  "●", // ●
  8:  "◐", // ◐
  10: "✚", // ✚
};

// AUX glyphs — chosen to evoke each AUX role without conflicting with the
// zone glyphs. Operator-added AUX slots fall back to a generic ✦.
const AUX_ICONS: Record<string, string> = {
  Z9SR: "☾", // ☾ moon (mirrors Z9)
  ADM:  "❖", // ❖ four-pointed-star (admin / paperwork)
  TR1:  "✖", // ✖ heavy cross (trash route)
  TR2:  "✖",
  SP1:  "✦", // ✦ four-pointed star
  SP2:  "✦",
};
const getAuxIcon = (key: string) => AUX_ICONS[key] || "✦";

// Exact Golden palette (eyeballed from friday_golden_zoneCardSheet.png)
const ZONE_COLORS: Record<string, string> = {
  Z1:  '#B89708', // gold
  Z2:  '#B89708', // gold — matches Z1 (Main Entry area)
  Z3:  '#E53935', // red
  Z4:  '#E53935', // red
  Z5:  '#E53935', // red
  Z6:  '#B7679A', // magenta
  Z7:  '#1976D2', // blue
  Z8:  '#6B5346', // brown
  Z9:  '#E53935', // red
  Z10: '#43A047', // green
};

const getZoneColor = (key: string) => ZONE_COLORS[key] || '#6B7280';

// RR accent — mirrors the zone color of the area each RR serves
const RR_COLORS: Record<number, string> = {
  1:  '#B89708', // RR 1+2 — gold (Main Entry, paired with Z1/Z2)
  6:  '#B7679A', // RR 6  — magenta (Slots East, matches Z6)
  7:  '#1976D2', // RR 7  — blue (High Limit, matches Z7)
  8:  '#6B5346', // RR 8  — brown (Table Games, paired with Z8)
  10: '#43A047', // RR 10 — green (Poker, paired with Z10)
};
const getRRAccent = (num: number) => RR_COLORS[num] || '#6B7280';

// AUX accent palette
const AUX_COLORS: Record<string, string> = {
  Z9SR: '#E53935', // red    (same as Z9)
  ADM:  '#B7679A', // magenta
  TR1:  '#FB8C00', // orange
  TR2:  '#FB8C00', // orange
  SP1:  '#1976D2', // blue
  SP2:  '#1976D2', // blue (kept in palette; SP2 is still a valid key if added back)
};
// Operator-added slots (keys like "AUX6", "AUX7") fall through to a stable
// color derived from the trailing digits so each added slot is visually
// distinct without needing a color picker yet.
const getAuxAccent = (key: string): string => {
  if (AUX_COLORS[key]) return AUX_COLORS[key];
  const m = key.match(/(\d+)$/);
  const idx = m ? parseInt(m[1], 10) : 0;
  return EXTRA_AUX_COLORS[idx % EXTRA_AUX_COLORS.length];
};

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

// Small black break-group badge used on every card type. Click cycles 1→2→3.
// Hit area extends beyond the visible glyph via padding+negative-margin so the
// chip stays at Golden-density visually but is comfortably tappable on iPad
// (28×24 effective hit area, satisfies the 24pt-minimum guidance for dense UI).
// Break-group state model:
//   0 (or no row) = off the break sheet this shift ("–" badge) — used for overlaps
//                   and anyone deliberately not put on the break rotation.
//   1/2/3         = numeric break group.
// Cycle order is 1 → 2 → 3 → – → 1. Choosing "–" removes the break record.
type BreakGroup = 0 | 1 | 2 | 3;
const nextBreakGroup = (cur: BreakGroup): BreakGroup => {
  // 1→2, 2→3, 3→0 (off), 0→1
  if (cur === 0) return 1;
  if (cur === 3) return 0;
  return ((cur + 1) as BreakGroup);
};

// BreakBadge: value 0 (or missing) = off the break sheet ("–") for this shift.
// Values 1/2/3 = the break wave. Cycle order 1→2→3→–→1. "-" deletes the DB record.
const BreakBadge: React.FC<{ value: number; onCycle: () => void; size?: "sm" | "md" }> = ({ value, onCycle, size = "md" }) => {
  const visual = size === "sm" ? "w-[18px] h-[14px] text-[9px]" : "w-[22px] h-[16px] text-[10.5px]";
  const label = value === 0 ? "Off the break sheet — tap to cycle" : `Break Group ${value} — tap to cycle`;
  const isOff = value === 0;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onCycle(); }}
      onPointerDown={(e) => e.stopPropagation()}
      className="-m-1.5 p-1.5 inline-flex items-center justify-center shrink-0"
      title={label}
      aria-label={label}
    >
      <span
        className={`${visual} ${isOff ? "bg-[#9CA3AF]" : "bg-[#1C1C1E]"} text-white font-bold rounded-[2px] flex items-center justify-center select-none leading-none`}
        style={{ fontFamily: 'var(--font-atkinson)' }}
      >
        {isOff ? "–" : value}
      </span>
    </button>
  );
};

// Dashed assignment line — TM name rides on top, or empty when unfilled.
const AssignmentLine: React.FC<{ tmName?: string | null; placeholder?: string; size?: "sm" | "md"; isLocked?: boolean; loading?: boolean }> = ({ tmName, placeholder = "", size = "md", isLocked = false, loading = false }) => {
  const text = size === "sm" ? "text-[9px]" : "text-[11px]";
  if (loading) {
    return (
      <div className={`border-b border-dashed border-[#B0B0B6] pb-[1px] ${text} leading-tight`}>
        <span className="inline-block h-[10px] w-3/4 rounded-sm bg-[#E5E5E7] animate-pulse" />
      </div>
    );
  }
  return (
    <div className={`border-b border-dashed border-[#B0B0B6] pb-[1px] ${text} leading-tight truncate flex items-center gap-1 ${tmName ? "font-semibold text-[#111]" : "text-[#C8C8CC]"}`}>
      {isLocked && tmName && (
        <svg width={size === "sm" ? 8 : 10} height={size === "sm" ? 8 : 10} viewBox="0 0 24 24" fill="currentColor" className="text-[#FF9500] shrink-0" aria-label="Locked">
          <path d="M6 10V7a6 6 0 1 1 12 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1zm2 0h8V7a4 4 0 0 0-8 0v3z" />
        </svg>
      )}
      <span className="truncate">{tmName || placeholder || " "}</span>
    </div>
  );
};

// Spotlight cursor tracker — attached to every .assignment-card via
// onPointerMove. Updates --mouse-x/--mouse-y CSS variables directly on the
// DOM node (no React re-render) so the spotlight radial gradient defined in
// .assignment-card::before follows the cursor smoothly. The card's accent
// color comes from a separate inline style (--card-accent) so the glow
// inherits whatever the zone/RR/AUX color is.
const handleSpotlightMove = (e: React.PointerEvent<HTMLElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - r.top}px`);
};

// Shared hook: turn a slot key into a "card is both droppable AND draggable"
// node. Draggable only activates when the card is filled, so empty cards just
// receive drops; filled cards can be picked up and moved/swapped/unassigned.
function useSlotDnd(slotKey: string, slotType: "zone" | "rr" | "aux" | "overlap", tm: { tmId?: string | null; tmName?: string | null }) {
  const { setNodeRef: setDropRef, isOver, active } = useDroppable({
    id: `slot:${slotKey}`,
    data: { type: "slot", slotKey, slotType },
  });
  const hasTM = !!tm.tmName;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `assigned:${slotKey}`,
    data: { type: "assigned", fromSlot: slotKey, tmId: tm.tmId, tmName: tm.tmName },
    disabled: !hasTM,
  });
  const setRef = (el: HTMLElement | null) => {
    setDropRef(el);
    setDragRef(el);
  };
  // Only count as "valid drop target" when an incoming drag is a TM or an
  // assigned card from a different slot (don't highlight when hovering itself).
  const incomingFromOther =
    isOver && active && active.data.current?.type !== undefined &&
    !(active.data.current?.type === "assigned" && active.data.current?.fromSlot === slotKey);
  return { setRef, isOver: !!incomingFromOther, isDragging, listeners, attributes, hasTM };
}

interface ZoneCardProps {
  def: any;
  assignments: any;
  selectedTasks: Record<string, NightSlotTask[]>;
  setBreakGroupForSlot: (k: string, g: BreakGroup) => void;
  onCardClick: (k: string, el: HTMLElement, event?: React.MouseEvent) => void;
  loading?: boolean;
  borderColor?: string;
  isDraftMode?: boolean;
  draftInfo?: { proposedTmName: string; previousTmName?: string };
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
}

const ZoneCard: React.FC<ZoneCardProps> = ({ 
  def, 
  assignments, 
  selectedTasks, 
  setBreakGroupForSlot, 
  onCardClick, 
  loading = false, 
  borderColor,
  isDraftMode = false,
  draftInfo,
  onRemoveTask 
}) => {
  const a = assignments[def.key] || {};
  const currentBreak = (a.breakGroup ?? 0) as BreakGroup;
  const color = getZoneColor(def.key);
  const cycleBreak = () => setBreakGroupForSlot(def.key, nextBreakGroup(currentBreak));
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(def.key, "zone", { tmId: a.tmId, tmName: a.tmName });

  const icon = ZONE_ICONS[def.key] ?? "●";
  const isEmpty = !hasTM && !loading;

  return (
    <div
      ref={setRef}
      onClick={(e) => onCardClick(def.key, e.currentTarget, e)}
      onPointerMove={handleSpotlightMove}

      {...(hasTM ? listeners : {})}
      {...(hasTM ? attributes : {})}
      data-slot-key={def.key}
      className={`assignment-card relative cursor-pointer flex flex-col rounded-[3px] transition-all ${isOver ? "drop-target-active" : ""} ${isDragging ? "opacity-30" : ""} ${isEmpty ? "empty" : ""}`}
      style={{ 
        ["--card-accent" as any]: color,
        ...(borderColor && { boxShadow: `0 0 0 3px ${borderColor}40, 0 0 0 6px ${borderColor}15` })
      }}
    >
      {/* Colored top stripe */}
      <div className="h-[3px] w-full shrink-0" style={{ background: color }} />

      {/* Header: icon + label + break badge.
         The bottom border uses the zone color at low alpha to delineate
         the header from the body without competing with the top stripe. */}
      <div
        className="flex items-start justify-between gap-1 px-2 pt-1 pb-1"
        style={{ borderBottom: `1px solid ${color}33` }}
      >
        <div className="flex items-center gap-1 leading-none" style={{ color }}>
          <span className="text-[11px] leading-none">{icon}</span>
          <span
            className="font-extrabold tracking-[0.4px] uppercase"
            style={{ fontSize: 10.5, fontFamily: "var(--font-atkinson)" }}
          >
            {def.label}
          </span>
        </div>
        <BreakBadge value={currentBreak} onCycle={cycleBreak} />
      </div>

      {/* Body: large TM name + optional location lines */}
      <div className="flex flex-col flex-1 px-2 pt-1.5 pb-1.5">
        {loading && !hasTM ? (
          <div className="h-[18px] w-3/4 rounded-sm bg-[#E5E5E7] animate-pulse" />
        ) : isDraftMode && draftInfo ? (
          <div className="flex flex-col min-w-0">
            <span
              className="font-bold tracking-[-0.3px] text-[#111] truncate"
              style={{ fontSize: 18, lineHeight: 1.05, fontFamily: "var(--font-atkinson)" }}
            >
              {draftInfo.proposedTmName}
            </span>
            {draftInfo.previousTmName && (
              <span 
                className="text-[10px] text-[#9CA3AF] line-through opacity-60 mt-0.5 tracking-[0.2px]"
                style={{ fontFamily: "var(--font-atkinson)" }}
              >
                was: {draftInfo.previousTmName}
              </span>
            )}
          </div>
        ) : hasTM ? (
          <div className="flex items-center gap-1 min-w-0">
            {a.isLocked && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-[#FF9500] shrink-0" aria-label="Locked">
                <path d="M6 10V7a6 6 0 1 1 12 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1zm2 0h8V7a4 4 0 0 0-8 0v3z" />
              </svg>
            )}
            <span
              className="font-bold tracking-[-0.3px] text-[#111] truncate"
              style={{ fontSize: 20, lineHeight: 1.05, fontFamily: "var(--font-atkinson)" }}
            >
              {a.tmName}
            </span>
          </div>
        ) : (
          <div className="unassigned-label mt-0.5 text-[#6B7280] font-medium tracking-[0.4px] text-[10.5px]" style={{ fontFamily: "var(--font-atkinson)" }}>
            — Unassigned —
          </div>
        )}

        <ZoneTaskList tasks={selectedTasks[def.key]} hasTM={hasTM} slotKey={def.key} onRemoveTask={onRemoveTask} />
      </div>
    </div>
  );
};

// Compact list of selected tasks shown at the bottom of a Zone / AUX card.
// Replaces the static `def.locations` strings we used to render. When empty,
// renders nothing so the card collapses gracefully.
const ZoneTaskList: React.FC<{
  tasks: NightSlotTask[] | undefined;
  hasTM: boolean;
  slotKey: string;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
}> = ({ tasks, hasTM, slotKey, onRemoveTask }) => {
  if (!tasks || tasks.length === 0) return null;
  return (
    <div
      className={`mt-auto pt-1 text-[11px] leading-tight ${hasTM ? "text-[#6B7280]" : "text-[#9CA3AF]"}`}
      style={{ fontFamily: "var(--font-atkinson)" }}
    >
      {tasks.map((t) => (
        <div
          key={t.id}
          className="group/task flex items-center justify-between truncate hover:bg-white/60 rounded px-0.5 -mx-0.5"
        >
          <span className="truncate">{t.taskLabel}</span>
          {onRemoveTask && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemoveTask(slotKey, t.taskLabel);
              }}
              className="ml-1 opacity-0 group-hover/task:opacity-100 text-red-400 hover:text-red-500 transition-opacity text-[13px] leading-none font-bold"
              title="Remove task"
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

interface RRCardProps {
  def: any;
  assignments: any;
  selectedTasks: Record<string, NightSlotTask[]>;
  setBreakGroupForSlot: (k: string, g: BreakGroup) => void;
  onGenderClick: (k: string, el: HTMLElement) => void;
  loading?: boolean;
  borderColor?: string;
  isDraftMode?: boolean;
  draftInfo?: { proposedTmName: string; previousTmName?: string };
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
}

// One gender side of an RR card is its own droppable/draggable so a TM can be
// dropped on M's or W's individually. Lifted into its own component so it
// can call the hooks (rules-of-hooks).
const RRSide: React.FC<{
  slotKey: string;
  label: string;
  assignment: any;
  tasks: NightSlotTask[] | undefined;
  setBreakGroupForSlot: (k: string, g: BreakGroup) => void;
  onClick: (k: string, el: HTMLElement, e?: React.MouseEvent) => void;
  loading?: boolean;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
}> = ({ slotKey, label, assignment, tasks, setBreakGroupForSlot, onClick, loading = false, onRemoveTask }) => {
  const a = assignment || {};
  const breakNum = (a.breakGroup ?? 0) as BreakGroup;
  const cycle = () => setBreakGroupForSlot(slotKey, nextBreakGroup(breakNum));
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(slotKey, "rr", { tmId: a.tmId, tmName: a.tmName });
  const dim = !hasTM && !loading;

  return (
    <div
      ref={setRef}
      onClick={(e) => onClick(slotKey, e.currentTarget, e)}

      {...(hasTM ? listeners : {})}
      {...(hasTM ? attributes : {})}
      data-slot-key={slotKey}
      className={`flex flex-col cursor-pointer rounded-[2px] transition-opacity ${isOver ? "drop-target-active" : ""} ${isDragging ? "opacity-30" : ""} ${dim ? "opacity-60" : ""}`}
    >
      {/* Label + badge row */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] font-bold tracking-[0.5px] text-[#1C1C1E]" style={{ fontFamily: 'var(--font-atkinson)' }}>{label}</span>
        <BreakBadge value={breakNum} onCycle={cycle} size="sm" />
      </div>
      {/* Name immediately under label (not pushed to bottom) — mirrors
         Zone/AUX cards' large-name treatment. */}
      <div className="min-w-0">
        {loading && !hasTM ? (
          <div className="h-[14px] w-3/4 rounded-sm bg-[#E5E5E7] animate-pulse" />
        ) : hasTM ? (
          <div className="flex items-center gap-1 min-w-0">
            {a.isLocked && (
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="text-[#FF9500] shrink-0" aria-label="Locked">
                <path d="M6 10V7a6 6 0 1 1 12 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1zm2 0h8V7a4 4 0 0 0-8 0v3z" />
              </svg>
            )}
            <span
              className="font-bold tracking-[-0.2px] text-[#111] truncate"
              style={{ fontSize: 16, lineHeight: 1.05, fontFamily: "var(--font-atkinson)" }}
            >
              {a.tmName}
            </span>
          </div>
        ) : (
          <div className="unassigned-label mt-px text-[#6B7280] font-medium tracking-[0.3px] text-[9.5px]" style={{ fontFamily: "var(--font-atkinson)" }}>
            — Unassigned —
          </div>
        )}
      </div>
      {/* Per-side selected tasks. Smaller type to fit the half-card width. */}
      {tasks && tasks.length > 0 && (
        <div
          className={`mt-1 text-[10px] leading-tight ${hasTM ? "text-[#6B7280]" : "text-[#9CA3AF]"}`}
          style={{ fontFamily: "var(--font-atkinson)" }}
        >
          {tasks.map((t) => (
            <div
              key={t.id}
              className="group/task flex items-center justify-between truncate hover:bg-white/60 rounded px-0.5 -mx-0.5"
            >
              <span className="truncate">{t.taskLabel}</span>
              {onRemoveTask && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveTask(slotKey, t.taskLabel);
                  }}
                  className="ml-1 opacity-0 group-hover/task:opacity-100 text-red-400 hover:text-red-500 transition-opacity text-[13px] leading-none font-bold"
                  title="Remove task"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const RRCard: React.FC<RRCardProps> = ({ 
  def, 
  assignments, 
  selectedTasks, 
  setBreakGroupForSlot, 
  onGenderClick, 
  loading = false, 
  borderColor,
  isDraftMode = false,
  draftInfo,
  onRemoveTask 
}) => {
  const mKey = `MRR${def.num}`;
  const wKey = `WRR${def.num}`;
  const color = getRRAccent(def.num);
  const icon = RR_ICONS[def.num] ?? "●";
  // The whole RR card dims only when BOTH halves are empty.
  const mEmpty = !assignments[mKey]?.tmName;
  const wEmpty = !assignments[wKey]?.tmName;
  const bothEmpty = mEmpty && wEmpty && !loading;

  return (
    <div
      onPointerMove={handleSpotlightMove}
      className={`assignment-card relative flex flex-col rounded-[3px] transition-all ${bothEmpty ? "empty" : ""}`}
      style={{ 
        ["--card-accent" as any]: color,
        ...(borderColor && { boxShadow: `0 0 0 3px ${borderColor}40, 0 0 0 6px ${borderColor}15` })
      }}
    >
      <div className="h-[3px] w-full shrink-0" style={{ background: color }} />
      <div
        className="flex items-center gap-1 px-2 pt-1 pb-1 leading-none"
        style={{ color, borderBottom: `1px solid ${color}33` }}
      >
        <span className="text-[11px] leading-none">{icon}</span>
        <span
          className="font-extrabold tracking-[0.4px] uppercase"
          style={{ fontSize: 10.5, fontFamily: "var(--font-atkinson)" }}
        >
          {def.label}
        </span>
      </div>
      <div className="flex flex-col flex-1 px-2 pt-1.5 pb-1.5">
        {isDraftMode && draftInfo && (
          <div className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded w-fit mb-1 font-medium tracking-wider">DRAFT</div>
        )}
        <div className="grid grid-cols-2 gap-2 flex-1">
          <RRSide
            slotKey={mKey}
            label="MEN&rsquo;S"
            assignment={assignments[mKey]}
            tasks={selectedTasks[mKey]}
            setBreakGroupForSlot={setBreakGroupForSlot}
            onClick={onGenderClick}
            loading={loading}
            onRemoveTask={onRemoveTask}
          />
          <RRSide
            slotKey={wKey}
            label="WOMEN&rsquo;S"
            assignment={assignments[wKey]}
            tasks={selectedTasks[wKey]}
            setBreakGroupForSlot={setBreakGroupForSlot}
            onClick={onGenderClick}
            loading={loading}
            onRemoveTask={onRemoveTask}
          />
        </div>
      </div>
    </div>
  );
};

interface AuxCardProps {
  def: any;
  assignments: any;
  selectedTasks: Record<string, NightSlotTask[]>;
  setBreakGroupForSlot: (k: string, g: BreakGroup) => void;
  onCardClick: (k: string, el: HTMLElement, event?: React.MouseEvent) => void;
  loading?: boolean;
  borderColor?: string;
  isDraftMode?: boolean;
  draftInfo?: { proposedTmName: string; previousTmName?: string };
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
}

const AuxCard: React.FC<AuxCardProps> = ({ 
  def, 
  assignments, 
  selectedTasks, 
  setBreakGroupForSlot, 
  onCardClick, 
  loading = false, 
  borderColor,
  isDraftMode = false,
  draftInfo,
  onRemoveTask 
}) => {
  const a = assignments[def.key] || {};
  const currentBreak = (a.breakGroup ?? 0) as BreakGroup;
  const color = getAuxAccent(def.key);
  const cycleBreak = () => setBreakGroupForSlot(def.key, nextBreakGroup(currentBreak));
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(def.key, "aux", { tmId: a.tmId, tmName: a.tmName });

  const icon = getAuxIcon(def.key);
  const isEmpty = !hasTM && !loading;

  return (
    <div
      ref={setRef}
      onClick={(e) => onCardClick(def.key, e.currentTarget, e)}
      onPointerMove={handleSpotlightMove}

      {...(hasTM ? listeners : {})}
      {...(hasTM ? attributes : {})}
      data-slot-key={def.key}
      className={`assignment-card relative cursor-pointer flex flex-col rounded-[3px] transition-all ${isOver ? "drop-target-active" : ""} ${isDragging ? "opacity-30" : ""} ${isEmpty ? "empty" : ""}`}
      style={{ 
        ["--card-accent" as any]: color,
        ...(borderColor && { boxShadow: `0 0 0 3px ${borderColor}40, 0 0 0 6px ${borderColor}15` })
      }}
    >
      <div className="h-[3px] w-full shrink-0" style={{ background: color }} />
      <div
        className="flex items-start justify-between gap-1 px-2 pt-1 pb-1"
        style={{ borderBottom: `1px solid ${color}33` }}
      >
        <div className="flex items-center gap-1 leading-none min-w-0" style={{ color }}>
          <span className="text-[11px] leading-none shrink-0">{icon}</span>
          <span
            className="font-extrabold tracking-[0.4px] uppercase truncate"
            style={{ fontSize: 10, fontFamily: "var(--font-atkinson)" }}
          >
            {def.label}
          </span>
        </div>
        <BreakBadge value={currentBreak} onCycle={cycleBreak} />
      </div>

      <div className="flex flex-col flex-1 px-2 pt-1.5 pb-1.5">
        {loading && !hasTM ? (
          <div className="h-[16px] w-3/4 rounded-sm bg-[#E5E5E7] animate-pulse" />
        ) : isDraftMode && draftInfo ? (
          <div className="flex flex-col min-w-0">
            <span
              className="font-bold tracking-[-0.2px] text-[#111] truncate"
              style={{ fontSize: 16, lineHeight: 1.05, fontFamily: "var(--font-atkinson)" }}
            >
              {draftInfo.proposedTmName}
            </span>
            {draftInfo.previousTmName && (
              <span 
                className="text-[9px] text-[#9CA3AF] line-through opacity-55 mt-px tracking-[0.2px]"
                style={{ fontFamily: "var(--font-atkinson)" }}
              >
                was: {draftInfo.previousTmName}
              </span>
            )}
          </div>
        ) : isDraftMode && draftInfo ? (
          <div className="flex flex-col min-w-0">
            <span
              className="font-bold tracking-[-0.2px] text-[#111] truncate"
              style={{ fontSize: 16, lineHeight: 1.05, fontFamily: "var(--font-atkinson)" }}
            >
              {draftInfo.proposedTmName}
            </span>
            {draftInfo.previousTmName && (
              <span 
                className="text-[9px] text-[#9CA3AF] line-through opacity-55 mt-px tracking-[0.2px]"
                style={{ fontFamily: "var(--font-atkinson)" }}
              >
                was: {draftInfo.previousTmName}
              </span>
            )}
          </div>
        ) : hasTM ? (
          <div className="flex items-center gap-1 min-w-0">
            {a.isLocked && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="text-[#FF9500] shrink-0" aria-label="Locked">
                <path d="M6 10V7a6 6 0 1 1 12 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1zm2 0h8V7a4 4 0 0 0-8 0v3z" />
              </svg>
            )}
            <span
              className="font-bold tracking-[-0.2px] text-[#111] truncate"
              style={{ fontSize: 18, lineHeight: 1.05, fontFamily: "var(--font-atkinson)" }}
            >
              {a.tmName}
            </span>
          </div>
        ) : (
          <div className="unassigned-label mt-0.5 text-[#6B7280] font-medium tracking-[0.4px] text-[10.5px]" style={{ fontFamily: "var(--font-atkinson)" }}>
            — Unassigned —
          </div>
        )}

        <ZoneTaskList tasks={selectedTasks[def.key]} hasTM={hasTM} slotKey={def.key} onRemoveTask={onRemoveTask} />
      </div>
    </div>
  );
};

// Roster row — useDraggable when not already assigned. When assigned we
// disable the drag handle but still render so the operator can see "in use".
const RosterItem: React.FC<{ tm: any; isAssigned: boolean; emphasis: "on" | "off" }> = ({ tm, isAssigned, emphasis }) => {
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
          : `hover:bg-[#F8F8F9] hover:border-[#E5E5E7] hover:shadow-sm ${emphasis === "on" ? "border-l-2 border-[#007AFF] bg-white/70" : ""} cursor-grab active:cursor-grabbing`
      } ${isDragging ? "opacity-25 scale-[0.985]" : ""}`}
    >
      {/* Drag grip (Phase 2 affordance) */}
      {isDraggable && (
        <div className="flex h-5 w-4 shrink-0 items-center justify-center text-[#9CA3AF] group-hover:text-[#6B7280] transition-colors">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="3" cy="3" r="1" />
            <circle cx="9" cy="3" r="1" />
            <circle cx="3" cy="9" r="1" />
            <circle cx="9" cy="9" r="1" />
          </svg>
        </div>
      )}

      {/* Avatar (initials) — calmer, Golden-appropriate */}
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-1 ring-white/70"
        style={{ backgroundColor: emphasis === "on" ? "#007AFF" : "#5A5A5F" }}
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
          </svg>
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
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
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
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

// One overlap cell (Break Sheet view) — a small assignable card. Backed by
// zone_assignments rows with slot_type='overlap', so it uses the same
// race-free persist path as zones / RRs / aux.
//
// SlotKey shape is OL-PM-0..5 and OL-AM-0..5. uiToDb / dbToUi know how to
// translate these.
interface OverlapSlotProps {
  slotKey: string;
  assignments: any;
  selectedTasks: Record<string, NightSlotTask[]>;
  onCardClick: (k: string, el: HTMLElement, event?: React.MouseEvent) => void;
  loading?: boolean;
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
}
const OverlapSlot: React.FC<OverlapSlotProps & { isDraftMode?: boolean; draftInfo?: { proposedTmName: string; previousTmName?: string } }> = ({ slotKey, assignments, selectedTasks, onCardClick, loading = false, isDraftMode = false, draftInfo, onRemoveTask }) => {
  const a = assignments[slotKey] || {};
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(slotKey, "overlap", { tmId: a.tmId, tmName: a.tmName });
  const dim = !hasTM && !loading;
  const tasks = selectedTasks[slotKey];

  return (
    <div
      ref={setRef}
      onClick={(e) => onCardClick(slotKey, e.currentTarget, e)}

      {...(hasTM ? listeners : {})}
      {...(hasTM ? attributes : {})}
      data-slot-key={slotKey}
      className={`assignment-card relative border border-[#E5E5E7] rounded-[3px] bg-white min-h-[40px] px-2 py-1 cursor-pointer transition-all ${
        isOver ? "drop-target-active" : ""
      } ${isDragging ? "opacity-30" : ""} ${dim ? "opacity-60" : ""}`}
    >
      {loading && !hasTM ? (
        <div className="h-[12px] w-3/4 rounded-sm bg-[#E5E5E7] animate-pulse" />
      ) : hasTM ? (
        <div className="flex items-center gap-1 min-w-0">
          {a.isLocked && (
            <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" className="text-[#FF9500] shrink-0" aria-label="Locked">
              <path d="M6 10V7a6 6 0 1 1 12 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1zm2 0h8V7a4 4 0 0 0-8 0v3z" />
            </svg>
          )}
          <span
            className="font-bold tracking-[-0.2px] text-[#111] truncate"
            style={{ fontSize: 12, lineHeight: 1.1, fontFamily: "var(--font-atkinson)" }}
          >
            {a.tmName}
          </span>
        </div>
      ) : (
        <div
          className="text-[9.5px] text-[#9CA3AF] font-medium tracking-[0.3px]"
          style={{ fontFamily: "var(--font-atkinson)" }}
        >
          — Unassigned —
        </div>
      )}
      {tasks && tasks.length > 0 && (
        <div
          className={`mt-0.5 text-[8px] leading-tight ${hasTM ? "text-[#6B7280]" : "text-[#9CA3AF]"}`}
          style={{ fontFamily: "var(--font-atkinson)" }}
        >
          {tasks.map((t) => (
            <div
              key={t.id}
              className="group/task flex items-center justify-between truncate hover:bg-white/60 rounded px-0.5 -mx-0.5"
            >
              <span className="truncate">{t.taskLabel}</span>
              {onRemoveTask && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveTask(slotKey, t.taskLabel);
                  }}
                  className="ml-1 opacity-0 group-hover/task:opacity-100 text-red-400 hover:text-red-500 transition-opacity text-[13px] leading-none font-bold"
                  title="Remove task"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

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

export default function ShiftBuilder() {
  // Default the day picker to the active shift date. `currentShiftDate()`
  // returns yesterday's calendar date until 8:30am local time (so the operator
  // finishing Friday's grave at 6:30am Saturday morning still lands on
  // Friday); after 8:30am it returns today.
  const [selectedDayIndex, setSelectedDayIndex] = useState<number>(() => {
    const shift = currentShiftDate();
    const ws = startOfShiftWeek(shift);
    return daysBetween(ws, shift);
  });
  const [currentView, setCurrentView] = useState<"deployment" | "breaks">("deployment");
  const [breakGroup, setBreakGroup] = useState<1 | 2 | 3>(1);
  const [assignments, setAssignments] = useState<any>(() => ({})); // live data only — the Golden visual structure + fallback names live in the card renderers and GOLDEN_VISUAL_SPEC. The robust scale below guarantees the paper itself is always visible.
  const [realRoster, setRealRoster] = useState<any[]>([]);
  const [graveRoster, setGraveRoster] = useState<any[]>([]); // GRAVE-shift filtered roster (Option B)
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Session undo/redo (in-memory, one tab)
  const shiftHistory = useShiftHistory();

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
  const [weekStart, setWeekStart] = useState<Date>(() => startOfShiftWeek(currentShiftDate()));
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

  // Roster: "Other TMs" (not on schedule for this night) is collapsed by
  // default to keep the panel focused on TMs the operator actually has to
  // place. Click the header to reveal the off-schedule list.
  // Phase 2: Persisted to localStorage so the operator's preference sticks.
  const [otherTmsExpanded, setOtherTmsExpanded] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("oms_roster_other_expanded");
    return saved === "true";
  });

  // Persist the expanded state
  useEffect(() => {
    localStorage.setItem("oms_roster_other_expanded", String(otherTmsExpanded));
  }, [otherTmsExpanded]);

  // === Floating Roster open/close state ===================================
  // The roster lives as a floating Liquid Glass panel anchored to the left
  // edge. The operator can collapse it to a small sphere to maximize canvas
  // focus. Defaults to closed so the 1056×816 canvas is the primary focal
  // point on launch (consistent with the Command Palette + canvas-first direction).
  const [rosterOpen, setRosterOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("oms_roster_open");
    return saved === null ? false : saved === "true";
  });
  useEffect(() => {
    localStorage.setItem("oms_roster_open", String(rosterOpen));
  }, [rosterOpen]);

  // Called-off TMs for the currently selected night (from `call_offs` table)
  const [calledOffIds, setCalledOffIds] = useState<Set<string>>(new Set());
  const [calledOffExpanded, setCalledOffExpanded] = useState(true);

  // TMs explicitly marked as scheduled to work this specific night (from
  // `night_tm_status`, populated by the SUDO Schedules tab when an ADP
  // export is imported). Empty when no schedule data exists for the night
  // — the engine filter only applies when this set is non-empty.
  const [scheduledTmIdsTonight, setScheduledTmIdsTonight] = useState<Set<string>>(new Set());

  // === Sudo window ===
  const [sudoOpen, setSudoOpen] = useState(false);

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

  // "Already Deployed" (assigned on other nights this week) — collapsed by default
  // when viewing GRAVE so the focus stays on the current night + pure pool.
  const [deployedExpanded, setDeployedExpanded] = useState(false);

  // New overlap pools for GRAVE edge coverage
  const [pmOverlapsExpanded, setPmOverlapsExpanded] = useState(false);
  const [amOverlapsExpanded, setAmOverlapsExpanded] = useState(false);
  const [portersExpanded, setPortersExpanded] = useState(false);

  // Roster search/filter (Phase 1)
  const [rosterSearch, setRosterSearch] = useState("");

  // GRAVE shift filter (YOLO Phase 2 improvement)
  // When true, only show TMs who have availability in the 11pm–6:55am window.
  const [graveOnly, setGraveOnly] = useState(true); // Default ON for GRAVE nights — very useful for operators
  const [cmdkOpen, setCmdkOpen] = useState(false);

  // Phase 1: Context passed to the command palette when opening via card tap
  const [cmdkInitialContext, setCmdkInitialContext] = useState<{
    type: 'slot' | 'person';
    value: string;
  } | null>(null);

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
    setCardBorders(prev => ({ ...prev, [slotKey]: color }));
  };

  const removeCardBorder = (slotKey: string) => {
    setCardBorders(prev => {
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });
  };

  // When the GRAVE filter is active, collapse the "Already Deployed", overlap pools,
  // and "GRAVE Pool" by default. This keeps the roster focused on people scheduled for *this*
  // specific 11pm–6:55am night.
  useEffect(() => {
    if (graveOnly) {
      setDeployedExpanded(false);
      setPortersExpanded(false);
      setPmOverlapsExpanded(false);
      setAmOverlapsExpanded(false);
      setOtherTmsExpanded(false);
    }
  }, [graveOnly]);

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
  const filterTerm = rosterSearch.trim().toLowerCase();

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
  // NOTE: handleNotesInput is defined later, AFTER `selectedDay` and
  // `showToast` are declared. Defining it here would TDZ on those bindings
  // in the deps array.

  // Toast queue — bottom-right notifications for persist failures (and any
  // other operator-visible feedback). Auto-dismiss after 5s; manual dismiss
  // via the X. Replaces the silent console.error in persist* helpers.
  type ToastKind = "error" | "info" | "success";
  interface ToastItem { id: number; message: string; kind: ToastKind; }
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);
  const showToast = React.useCallback((message: string, kind: ToastKind = "error") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);
  const dismissToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

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

  const applyDraft = () => {
    if (!isDraftMode || Object.keys(draftAssignments).length === 0) return;

    if (!confirm("Apply the draft assignments and save them permanently? This cannot be undone automatically.")) {
      return;
    }

    const before = { assignments: { ...assignments }, auxDefs: [...auxDefs] };
    pendingHistoryRef.current = { description: "Apply Engine Draft", before };

    Object.entries(draftAssignments).forEach(([slotKey, info]) => {
      if (info.proposedClear) {
        unassign(slotKey);
      } else if (info.proposedTmId) {
        assign(slotKey, info.proposedTmId, info.proposedTmName);
      }
    });

    // Exit draft mode
    setIsDraftMode(false);
    setDraftAssignments({});
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

    const result = await askGrokForStructuredSuggestions({
      snapshot,
      rosterForGuard: availableGraveRoster,
      userQuestion:
        focus.type === "slot"
          ? `Best suggestions for slot ${focus.value}`
          : focus.type === "person"
          ? `Best things to do with ${focus.value}`
          : undefined,
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
  useEffect(() => {
    if (pendingHistoryRef.current) {
      const { description, before } = pendingHistoryRef.current;
      const after: Snapshot = {
        assignments: { ...assignments },
        auxDefs: [...auxDefs],
      };
      shiftHistory.recordChange(description, before, after);
      pendingHistoryRef.current = null;
    }
  }, [assignments, auxDefs, shiftHistory]);

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

  // === Phase 1: Clean contextual palette openers (will replace fan behavior) ===
  const openPaletteForSlot = React.useCallback((slotKey: string) => {
    setCmdkInitialContext({ type: 'slot', value: slotKey });
    setCmdkOpen(true);
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
  const goPrevWeek = () => setWeekStart((w) => addDays(w, -7));
  const goNextWeek = () => setWeekStart((w) => addDays(w, 7));
  const goThisWeek = () => setWeekStart(startOfShiftWeek(todayDate));

  // Each pill group collapses to its active value by default and expands
  // inline on tap. Click-outside or ESC dismisses; selecting collapses with
  // the new active value (handled per-group at the onClick call sites).
  const weekPill = useCollapsiblePill();
  const dayPill = useCollapsiblePill();
  const viewPill = useCollapsiblePill();

  // === Zoom & centering ===
  // The artboard is locked at 1056×816 (the print contract). zoomMode controls
  // how we present that fixed rectangle inside the on-screen scroll area.
  //   "fit" → auto-scale to fit the available area (never larger than 100%)
  //   number → explicit scale factor (0.5 / 0.75 / 1 / 1.25)
  type ZoomMode = "fit" | 0.5 | 0.75 | 1 | 1.25;
  const [zoomMode, setZoomMode] = useState<ZoomMode>("fit");
  // Start with a safe, viewport-derived value so the artboard is always visible
  // at a usable size on first paint, even before any measurement effects run.
  const [fitScale, setFitScale] = useState(() => {
    if (typeof window === 'undefined') return 0.85;
    const w = window.innerWidth - 268 - 80;
    const h = window.innerHeight - 90;
    return Math.max(0.35, Math.min(1, Math.min(w / 1056, h / 816)));
  });
  const stageHostRef = useRef<HTMLDivElement>(null);

  // Natural content footprint inside the scroll area: just the artboard now —
  // the pill cluster floats absolutely over the bottom of the artboard, so it
  // doesn't add to the layout height. 1056 × 816 = 11" × 8.5" at 96 dpi.
  const NATURAL_WIDTH = 1056;
  const NATURAL_HEIGHT = 816;

  // Robust scale computer: prefers measuring the actual stage host, falls back
  // to viewport math so the artboard is *never* invisible/tiny after async
  // Supabase loads or initial layout jitter.
  const recomputeScale = React.useCallback(() => {
    const el = stageHostRef.current;
    let availW = 0;
    let availH = 0;

    if (el && el.clientWidth > 50 && el.clientHeight > 50) {
      availW = el.clientWidth - 24;
      availH = el.clientHeight - 24;
    } else {
      // Fallback: estimate from window (header ~48px + outer paddings + safe margin)
      availW = window.innerWidth - 268 - 80; // 268 = fixed roster rail + gaps
      availH = window.innerHeight - 90;       // header + top/bottom chrome
    }

    const next = Math.min(1, availW / NATURAL_WIDTH, availH / NATURAL_HEIGHT);
    setFitScale(Math.max(0.25, next));
  }, []);

  useEffect(() => {
    // Multiple attempts to catch the layout after the full shell (header + flex-1)
    // has settled. This guarantees the 1056×816 paper is visible even if the
    // very first measurement happens before the viewport sizes are final.
    const t1 = requestAnimationFrame(recomputeScale);
    const t2 = window.setTimeout(recomputeScale, 80);
    const t3 = window.setTimeout(recomputeScale, 220);

    const ro = stageHostRef.current
      ? new ResizeObserver(recomputeScale)
      : null;
    if (ro && stageHostRef.current) ro.observe(stageHostRef.current);

    const onResize = () => recomputeScale();
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
    };
  }, [recomputeScale]);

  // The canvas's available width changes when the floating roster opens or
  // closes (we adjust padding-left). Re-fit the artboard whenever that flips
  // so the "Fit" zoom mode lands on the new visible area. Run it after the
  // CSS transition completes so the measurement reflects the final width.
  useEffect(() => {
    const t1 = requestAnimationFrame(recomputeScale);
    const t2 = window.setTimeout(recomputeScale, 320); // matches the 280ms panel transition + buffer
    return () => {
      cancelAnimationFrame(t1);
      clearTimeout(t2);
    };
  }, [rosterOpen, recomputeScale]);

  const scale = zoomMode === "fit" ? fitScale : zoomMode;

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
  }, [nightId, selectedDay.date, selectedDay.name, showToast]);

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

    if (tmId) {
      (async () => {
        let nid = targetNightId;
        if (!nid) nid = await resolveNightIdForDate(captureDate, captureDayName);
        if (!nid) {
          showToast(`Couldn't save break group: no night context yet`);
          return;
        }
        try {
          if (group === 0) {
            // "-" means not on breaks this shift → remove any existing record
            await deleteBreakAssignment(nid, tmId);
          } else {
            await upsertBreakAssignment({
              nightId: nid,
              tmId,
              groupNum: group,
              slotRef: slotKey,
            });
          }
        } catch (e: any) {
          showToast(`Couldn't save break group: ${e?.message ?? "unknown error"}`);
        }
      })();
    }
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
        type: slotKey.startsWith("Z") ? "zone" : slotKey.startsWith("MRR") || slotKey.startsWith("WRR") ? "rr" : "aux",
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
      // Capture deployment view.
      // flushSync forces React to commit the new state synchronously before
      // returning — without it, React 19's concurrent rendering can defer
      // the commit past our RAF window, and BOTH captures end up as the
      // last-rendered view (the symptom: print only shows the break page).
      flushSync(() => { setCurrentView("deployment"); });
      await nextFrames(2);
      const deploymentHTML =
        (document.querySelector(".print-artboard") as HTMLElement | null)?.outerHTML ?? "";

      // Capture breaks view
      flushSync(() => { setCurrentView("breaks"); });
      await nextFrames(2);
      const breaksHTML =
        (document.querySelector(".print-artboard") as HTMLElement | null)?.outerHTML ?? "";

      // Restore the operator's original view before printing — once the
      // container is injected and we trigger print, the visual freezes.
      flushSync(() => { setCurrentView(originalView); });
      await nextFrames(1);

      // Debug visibility — operators can open Web Inspector and verify the
      // captures actually contain different content.
      console.log("[print] deployment capture length:", deploymentHTML.length);
      console.log("[print] breaks capture length:", breaksHTML.length);
      console.log("[print] captures identical?", deploymentHTML === breaksHTML);

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

      // body class so print CSS knows to hide the live artboard and show
      // only the dual container.
      document.body.classList.add("printing-dual-mode");

      // Trigger the dialog. window.print() is synchronous-ish in Chrome
      // (returns after the dialog closes) and async in Safari (returns
      // immediately while the dialog is shown). Either way the cleanup
      // below runs once the call returns.
      try {
        window.print();
      } finally {
        document.body.classList.remove("printing-dual-mode");
        container.remove();
      }
    } catch (e) {
      console.error("[shiftbuilder] dual-page print error", e);
      document.body.classList.remove("printing-dual-mode");
      document.querySelector(".print-dual-container")?.remove();
    }
  }, [currentView]);

  // === Master Command Palette (Phase 2 core) ===
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
    onRunEngine: () => {
      if (isDraftMode) {
        applyDraft();
      } else {
        enterDraftMode();
      }
    },
    onDiscardDraft: discardDraft,
    onPrint: () => handlePrintBothPages(),
    onUndo: () => {
      const prev = shiftHistory.undo();
      if (prev) applySnapshot(prev);
    },
    onRedo: () => {
      const next = shiftHistory.redo();
      if (next) applySnapshot(next);
    },
    assign,
    isDraftMode,
    onApplyGrokSuggestions: applyGrokSuggestions,
    onTriggerGrokBoardAnalysis: triggerGrokBoardAnalysis,
  });

  // handleCardClick and dismissQuickFan removed in Phase 1 (Command Palette Upgrade).
  // Card taps now use openPaletteForSlot / openPaletteForPerson directly.

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

  // ────────────────────────────────────────────────────────────────────────
  // dnd-kit: roster → card (assign), card → card (swap/move), card → roster
  // (unassign), card → nowhere (also unassign). Pointer + Touch + Keyboard
  // sensors give us mouse, iPad, and a11y parity from a single source.
  // ────────────────────────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const [activeDrag, setActiveDrag] = useState<{ tmName: string; fromSlot?: string } | null>(null);

  const onDragStart = (event: DragStartEvent) => {
    const d = event.active.data.current as any;
    if (!d) return;
    if (d.type === "tm") setActiveDrag({ tmName: d.tmName });
    else if (d.type === "assigned") setActiveDrag({ tmName: d.tmName, fromSlot: d.fromSlot });
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
        const targetNightId = nightId;
        const captureDate = selectedDay.date;
        const captureDayName = selectedDay.name;

        let movingTmId: string | null = null;
        let displacedTmId: string | null = null;
        setAssignments((prev: any) => {
          const next = { ...prev };
          const moving = next[fromKey];
          const displaced = next[toKey];
          movingTmId = moving?.tmId ?? null;
          displacedTmId = displaced?.tmId ?? null;
          if (displaced) next[fromKey] = { ...displaced, slotKey: fromKey };
          else delete next[fromKey];
          next[toKey] = { ...moving, slotKey: toKey };
          return next;
        });
        // Persist both sides of the swap. Fire-and-forget; the optimistic UI
        // is already live.
        persistAssign(targetNightId, captureDate, captureDayName, toKey, movingTmId);
        persistAssign(targetNightId, captureDate, captureDayName, fromKey, displacedTmId); // null if it was an empty move
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

  useEffect(() => {
    const epoch = ++loadEpochRef.current;

    // Hard reset every per-day surface synchronously, BEFORE the new data
    // arrives. The operator must never see Day A's content under the Day B
    // label, and writes issued in that window must not land on Day A by
    // mistake.
    setNightId(null);
    setAssignments({});
    setSelectedTasks({}); // also reset per-night task selections on day switch
    setCalledOffIds(new Set());
    setScheduledTmIdsTonight(new Set());
    if (notesRef.current) notesRef.current.innerText = "";
    if (notesSaveTimerRef.current) {
      clearTimeout(notesSaveTimerRef.current);
      notesSaveTimerRef.current = null;
    }

    setLoadingAssignments(true);
    (async () => {
      try {
        const id = await getNightIdForDate(selectedDay.date);
        if (loadEpochRef.current !== epoch) return;

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
          callOffSet,
          activeConfig,
          skillScoreMap,
          slotDifficultyMap,
          preferenceRows,
          pairAffinityRows,
          accommodationRows,
          recentHistory,
          scheduledTonightSet,
        ] = await Promise.all([
          id ? getTeamMembersForNight(id) : getActiveTeamMembers().then(all => all.map(tm => ({ ...tm, isOnSchedule: false }))),
          getGraveAvailableTeamMembers(),
          id ? getNightAssignments(id) : Promise.resolve([]),
          id ? getNightNotes(id) : Promise.resolve(""),
          id ? getOnScheduleTmIdsForNight(id) : Promise.resolve(new Set<string>()),
          id ? getGravePMOverlapMembers(id) : Promise.resolve([]),
          id ? getGraveAMOverlapMembers(id) : Promise.resolve([]),
          id ? getNightSlotTasks(id) : Promise.resolve([] as NightSlotTask[]),
          id ? getNightBreakAssignments(id) : Promise.resolve([]),
          getCallOffsForDate(selectedDay.date),
          getActiveEngineConfig(),
          getTMSkillScores(),
          getSlotDifficultyRaw(),
          getTMPreferences(),
          getTMPairAffinities(),
          getTMAccommodations(),
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

        // Engine config + reference data for the Phase 1 weighted scoring layer.
        setEngineConfig(activeConfig);
        setTmSkillScores(skillScoreMap);
        setSlotDifficulty(slotDifficultyMap);
        // Group preferences by tm_id for fast lookup.
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
        setRecentZoneHistory(recentHistory);

        // Build sets for fast lookup
        const pmOverlapIds = new Set(pmOverlapMembers.map((m: any) => m.id));
        const amOverlapIds = new Set(amOverlapMembers.map((m: any) => m.id));

        setGraveRoster(
          graveMembers.map((m: any) => ({
            ...m,
            isOnWeek: weekOnScheduleSet.has(m.id),
            isPMOverlap: pmOverlapIds.has(m.id),
            isAMOverlap: amOverlapIds.has(m.id),
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
            // Pull from break_assignments by tm_id.
            // No row (or explicit "-") means the TM is not on the break rotation
            // for this shift. Overlaps (AM/PM) and anyone never given a break
            // will correctly show "-" by default.
            breakGroup: row.tmId && breakByTm[row.tmId] !== undefined ? breakByTm[row.tmId] : 0,
            source: "manual",
          };
        });
        // Replace assignments outright — we already cleared at day-switch
        // time, so this just installs the freshly loaded set. Merging
        // would risk Day A's stale entries persisting through if the
        // clear-then-load contract is ever violated.
        setAssignments(ui);

        // Translate loaded night_slot_tasks rows into UI-keyed buckets so the
        // card renderers can read them by Golden slot key (Z1, MRR1, etc.).
        const tasksByUiKey: Record<string, NightSlotTask[]> = {};
        nightTaskRows.forEach((row) => {
          const uiKey = dbToUi(row.slotKey, row.slotType, row.rrSide ?? null);
          if (uiKey.startsWith("UNK:")) {
            console.warn("[shiftbuilder] unrecognized DB slot for task, skipping:", row);
            return;
          }
          (tasksByUiKey[uiKey] ??= []).push(row);
        });
        setSelectedTasks(tasksByUiKey);

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
      } catch (e: any) {
        console.error("[shiftbuilder] persist failed for", uiKey, e);
        showToast(`Couldn't save ${uiKey}: ${e?.message ?? "unknown error"}`);
      }
    },
    [resolveNightIdForDate, showToast]
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
    <div className="h-screen flex flex-col bg-[#F8F8F9] text-[#1C1C1E] overflow-hidden relative">
      {/* === Floating brand chip — replaces the sticky header. Top-left,
          identity-only. The roster panel sits below it (starts at top-14)
          so the two never overlap. */}
      <div
        className="fixed top-3 left-3 z-40 flex items-center gap-2 px-3 h-9 rounded-full border border-white/60 shadow-lg shadow-black/10"
        style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
        }}
      >
        <div className="w-5 h-5 rounded-md bg-black flex items-center justify-center">
          <span className="text-white text-[10px] font-semibold tracking-[-0.5px]">Z</span>
        </div>
        <div className="text-[12.5px] font-semibold tracking-[-0.2px]">ZDS Forge</div>
        <span className="text-[#C8C8CC] mx-0.5">·</span>
        <div className="text-[11.5px] text-[#6B7280]">Shift Planner</div>
      </div>

      {/* === Floating zoom chip — replaces the inline zoom selector. Top-right.
          Operator's only inline "view state" control; everything else lives in
          the command palette (Cmd+K) or the bottom pill cluster. */}
      <div
        className="fixed top-3 right-3 z-40 flex items-center gap-1.5 h-9 px-3 rounded-full border border-white/60 shadow-lg shadow-black/10 text-[12.5px] text-[#1C1C1E]"
        style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
        }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6B7280]">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <select
          value={String(zoomMode)}
          onChange={(e) => {
            const v = e.target.value;
            setZoomMode(v === "fit" ? "fit" : (Number(v) as 0.5 | 0.75 | 1 | 1.25));
          }}
          className="bg-transparent outline-none border-none pr-0.5 cursor-pointer font-medium"
          title="Zoom"
        >
          <option value="fit">{mounted && zoomMode === "fit" ? `Fit · ${Math.round(fitScale * 100)}%` : "Fit"}</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
          <option value="1.25">125%</option>
        </select>
      </div>

      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
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
          className="fixed left-3 top-14 bottom-3 w-[280px] z-30 rounded-2xl border border-white/60 bg-white/80 shadow-2xl shadow-black/10 overflow-hidden flex flex-col"
          style={{
            // Genie-out origin: where the collapsed sphere sits (left edge,
            // vertically centered). Spring spec mirrors the day-pill cluster
            // for visual consistency.
            transformOrigin: "0% 50%",
            transform: rosterOpen ? "scale(1)" : "scale(0.15)",
            opacity: rosterOpen ? 1 : 0,
            pointerEvents: rosterOpen ? "auto" : "none",
            backdropFilter: "blur(24px) saturate(160%)",
            WebkitBackdropFilter: "blur(24px) saturate(160%)",
            transition: "transform 280ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          {/* Collapse handle — top-right of the panel. Small chevron-left
             that genies the panel back to a sphere. */}
          <button
            type="button"
            onClick={() => setRosterOpen(false)}
            className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full hover:bg-black/5 active:bg-black/10 transition-colors flex items-center justify-center text-[#6B7280] hover:text-[#1C1C1E]"
            aria-label="Collapse roster"
            title="Collapse roster"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <RosterDropZone className="flex flex-col h-full min-h-0">
          {/* Strategic GRAVE-first header. pt-4 + pr-10 leaves space for the
             floating-panel collapse chevron in the top-right corner. */}
          <div className="px-5 pt-4 pb-3 pr-10 flex-shrink-0">
            <div className="text-[13px] font-semibold tracking-[0.6px] text-[#1C1C1E] uppercase" style={{ fontFamily: "var(--font-atkinson)" }}>
              {graveOnly ? "GRAVE Available" : "Available Team Members"}
            </div>
            <div className="text-[10px] text-[#6B7280] mt-0.5 tracking-[0.2px]">
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
                className="w-full bg-white border border-[#E5E5E7] rounded-[3px] pl-8 pr-3 py-1.5 text-[12px] placeholder:text-[#9CA3AF] focus:outline-none focus:border-[#C7C7CC] transition-colors"
                style={{ fontFamily: "var(--font-geist-sans)" }}
              />
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </div>
            </div>

            {/* Stronger GRAVE toggle — printed tool aesthetic, not subtle UI widget */}
            <div className="flex border border-[#D1D1D6] rounded-[4px] overflow-hidden text-[11px] font-medium shadow-sm bg-white">
              <button
                onClick={() => setGraveOnly(false)}
                className={`flex-1 px-3 py-1.5 transition-all active:scale-[0.985] ${
                  !graveOnly
                    ? "bg-[#1C1C1E] text-white shadow-inner"
                    : "text-[#3C3C43] hover:bg-[#F8F8F9]"
                }`}
              >
                All
              </button>
              <button
                onClick={() => setGraveOnly(true)}
                className={`flex-1 px-3 py-1.5 border-l border-[#D1D1D6] transition-all active:scale-[0.985] ${
                  graveOnly
                    ? "bg-[#1C1C1E] text-white shadow-inner"
                    : "text-[#3C3C43] hover:bg-[#F8F8F9]"
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

              // Best judgment: compute "on this night" from live assignments
              // so the GRAVE pool shows a useful "On this GRAVE shift" vs "Available" split.
              const assignedThisNight = new Set(
                Object.values(assignments)
                  .map((a: any) => a?.tmId)
                  .filter(Boolean)
              );

              const sourceRoster = rawRoster.map((tm: any) => ({
                ...tm,
                isOnSchedule: assignedThisNight.has(tm.id),
              }));

              let onThisNight, alreadyDeployed, porters, pmOverlaps, amOverlaps, regularGravePool;

              const isPorter = (tm: any) => (tm.primarySection || '').toLowerCase().includes('porter');

              // Called-off TMs live in their own bucket. Filter them out of
              // every other group so they appear ONLY under "Called Off".
              const calledOff = sourceRoster.filter((t: any) => calledOffIds.has(t.id));
              const notCalledOff = sourceRoster.filter((t: any) => !calledOffIds.has(t.id));

              if (graveOnly) {
                onThisNight = notCalledOff.filter((t: any) => t.isOnSchedule);
                alreadyDeployed = notCalledOff.filter((t: any) => t.isOnWeek && !t.isOnSchedule);

                const notAssignedThisNight = notCalledOff.filter((t: any) => !t.isOnSchedule);

                // Porters first (any role containing "porter")
                porters = notAssignedThisNight.filter((t: any) => isPorter(t));

                // Then overlaps from non-porters
                const nonPorters = notAssignedThisNight.filter((t: any) => !isPorter(t));

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
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              transform: calledOffExpanded ? "rotate(90deg)" : "rotate(0deg)",
                              transition: "transform 120ms ease",
                            }}
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
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
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              transform: deployedExpanded ? "rotate(90deg)" : "rotate(0deg)",
                              transition: "transform 120ms ease",
                            }}
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          Already Deployed
                        </span>
                        <span className="tabular-nums">
                          {filteredOnThisNight.length}{filterTerm ? ` / ${onThisNight.length}` : ""}
                        </span>
                      </button>
                      {deployedExpanded && filteredOnThisNight.map((tm: any) => {
                        const isAssigned = Object.values(assignments).some((a: any) => a.tmId === tm.id);
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
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              transform: portersExpanded ? "rotate(90deg)" : "rotate(0deg)",
                              transition: "transform 120ms ease",
                            }}
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          Porters
                        </span>
                        <span className="tabular-nums">
                          {filteredPorters.length}{filterTerm ? ` / ${porters.length}` : ""}
                        </span>
                      </button>
                      {portersExpanded && filteredPorters.map((tm: any) => {
                        const isAssigned = Object.values(assignments).some((a: any) => a.tmId === tm.id);
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
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              transform: amOverlapsExpanded ? "rotate(90deg)" : "rotate(0deg)",
                              transition: "transform 120ms ease",
                            }}
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          AM Overlaps (in 5:00–5:30am)
                        </span>
                        <span className="tabular-nums">
                          {filteredAMOverlaps.length}{filterTerm ? ` / ${amOverlaps.length}` : ""}
                        </span>
                      </button>
                      {amOverlapsExpanded && filteredAMOverlaps.map((tm: any) => {
                        const isAssigned = Object.values(assignments).some((a: any) => a.tmId === tm.id);
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
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              transform: pmOverlapsExpanded ? "rotate(90deg)" : "rotate(0deg)",
                              transition: "transform 120ms ease",
                            }}
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          PM Overlaps (out at 1:00am)
                        </span>
                        <span className="tabular-nums">
                          {filteredPMOverlaps.length}{filterTerm ? ` / ${pmOverlaps.length}` : ""}
                        </span>
                      </button>
                      {pmOverlapsExpanded && filteredPMOverlaps.map((tm: any) => {
                        const isAssigned = Object.values(assignments).some((a: any) => a.tmId === tm.id);
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
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{
                              transform: otherTmsExpanded ? "rotate(90deg)" : "rotate(0deg)",
                              transition: "transform 120ms ease",
                            }}
                          >
                            <polyline points="9 18 15 12 9 6" />
                          </svg>
                          Not Scheduled
                        </span>
                        <span className="tabular-nums">
                          {filteredRegularGrave.length}{filterTerm ? ` / ${regularGravePool.length}` : ""}
                        </span>
                      </button>
                      {otherTmsExpanded && filteredRegularGrave.map((tm: any) => {
                        const isAssigned = Object.values(assignments).some((a: any) => a.tmId === tm.id);
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

        {/* Collapsed-state sphere — rendered only when rosterOpen is false.
           Spring-scales in as the panel scales out; tap to genie the panel
           back. Position mirrors the panel's transform-origin so the visual
           handoff feels continuous. */}
        <button
          type="button"
          onClick={() => setRosterOpen(true)}
          aria-label="Open roster"
          title="Open roster"
          className="fixed left-3 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full border border-white/60 shadow-xl shadow-black/15 flex items-center justify-center text-[#1C1C1E] hover:scale-105 active:scale-95"
          style={{
            background: "rgba(255,255,255,0.9)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            transform: rosterOpen ? "translateY(-50%) scale(0)" : "translateY(-50%) scale(1)",
            opacity: rosterOpen ? 0 : 1,
            pointerEvents: rosterOpen ? "none" : "auto",
            transition: "transform 240ms cubic-bezier(0.32, 0.72, 0, 1), opacity 200ms cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          {/* Users icon (lucide-style inline). Indicates "roster of people". */}
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </button>

        {/* RIGHT: Scaled, centered artboard stage.
           stageHostRef is the gray scroll area; we measure its clientWidth /
           clientHeight here to compute the "Fit" scale. The print-stage wrapper
           is sized to the *scaled* dimensions so flex centers based on what's
           actually painted, not the un-scaled layout box. */}
        <div
          ref={stageHostRef}
          className="flex-1 overflow-auto bg-[#F2F2F4] flex items-center justify-center transition-[padding] duration-300"
          style={{
            // Explicit per-side padding so the artboard floats clear of every
            // piece of floating chrome:
            //   • Top:    brand chip (top-3, h-9 ≈ 48px) — pad ~60px so the
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
            paddingTop: 60,
            paddingRight: 64,
            paddingBottom: 72,
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
                      // Solid black on deployment, outlined (no-fill + 1.5px stroke) on break sheet
                      // for contrast against the red "Break Sheet" title.
                      ...(currentView === "deployment"
                        ? { color: '#1C1C1E' }
                        : {
                            color: 'transparent',
                            WebkitTextStroke: '1.5px #1C1C1E',
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
                    <div className="text-[11px] text-[#4B5563] mt-0.5 leading-none">
                      {currentView === "deployment"
                        ? `${selectedDay.monthYear} · Day ${selectedDayIndex + 1} of 7`
                        : `${selectedDay.name} · ${selectedDay.monthYear}`}
                    </div>
                    {currentView === "deployment" ? (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[8.5px] font-bold tracking-[1px] text-[#1C1C1E]" style={{ fontFamily: 'var(--font-atkinson)' }}>BREAKS</span>
                        <div className="flex gap-[2px]">
                          {[1, 2, 3].map((g) => (
                            <div
                              key={g}
                              className="w-[14px] h-[14px] rounded-full bg-[#1C1C1E] text-white text-[8px] font-bold leading-none flex items-center justify-center tabular-nums"
                              style={{ fontFamily: 'var(--font-atkinson)' }}
                              title={`Break ${g}: ${breakCounts[g as 1 | 2 | 3]} TM${breakCounts[g as 1 | 2 | 3] === 1 ? "" : "s"}`}
                            >
                              {breakCounts[g as 1 | 2 | 3] || ""}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-[10px] font-bold tabular-nums text-[#111]">{inRotationCount}</span>
                        <span className="text-[8.5px] font-bold tracking-[1px] text-[#1C1C1E]" style={{ fontFamily: 'var(--font-atkinson)' }}>IN ROTATION</span>
                        <span className="text-[8.5px] font-bold tracking-[1px] text-[#1C1C1E] ml-1.5" style={{ fontFamily: 'var(--font-atkinson)' }}>BREAKS</span>
                        <div className="flex gap-[2px]">
                          {[1, 2, 3].map((g) => (
                            <div
                              key={g}
                              className="w-[14px] h-[14px] rounded-full bg-[#1C1C1E] text-white text-[8px] font-bold leading-none flex items-center justify-center tabular-nums"
                              style={{ fontFamily: 'var(--font-atkinson)' }}
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
                      style={{ color: '#1C1C1E', fontFamily: 'var(--font-atkinson)' }}
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
                            color: isActive ? '#fff' : '#6B7280',
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
                    <div className="grid grid-cols-5 gap-1.5" style={{ gridAutoRows: "135px" }}>
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
                    <div className="grid grid-cols-5 gap-1.5" style={{ gridAutoRows: "112px" }}>
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
                        gridAutoRows: "112px",
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
                        />
                      ))}
                    </div>
                  </section>

                  {/* NOTES AND SIDE TASKS — fills the remaining vertical space inside
                     the 816px paper. Ruled lines come from the .notes-pad background;
                     the area is contentEditable so operators can scribble during a
                     shift and have those notes carry into print. */}
                  <section className="flex-1 min-h-0 flex flex-col">
                    <div className="sheet-section-header">
                      <span className="label">NOTES AND SIDE TASKS</span>
                      <div className="divider" />
                    </div>
                    <div
                      ref={notesRef}
                      contentEditable
                      suppressContentEditableWarning
                      spellCheck={false}
                      onInput={handleNotesInput}
                      className="notes-pad flex-1 min-h-0 outline-none border border-[#E5E5E7] rounded-[3px] bg-white"
                    />
                  </section>
                </>
              ) : (
                <>
                  {/* 3 Break Wave Columns — Golden tight layout */}
                  <div className="grid grid-cols-3 gap-1 mb-1.5">
                    {[1, 2, 3].map((wave) => {
                      const waveAssignments = Object.values(assignments).filter(
                        (a: any) => a.breakGroup === wave
                      );
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
                          className="border border-[#E5E5E7] rounded-[3px] bg-white overflow-hidden flex flex-col"
                          style={{ borderTop: `3px solid ${waveColor}` }}
                        >
                          {/* Golden header per wave: big number on the left, BREAK N + count on the right */}
                          <div className="px-3 pt-2 pb-1 flex items-end gap-2.5 border-b border-[#F2F2F4]">
                            <div
                              className="font-black tabular-nums leading-none text-[#1C1C1E]"
                              style={{ fontSize: 42, letterSpacing: '-2px', fontFamily: 'var(--font-atkinson)' }}
                            >
                              {wave}
                            </div>
                            <div className="-mb-0.5">
                              <div
                                className="font-extrabold tracking-[1px] uppercase leading-none text-[#1C1C1E]"
                                style={{ fontSize: 13, fontFamily: 'var(--font-atkinson)' }}
                              >
                                Break {wave}
                              </div>
                              <div className="text-[10px] text-[#6B7280] mt-0.5">{count} people</div>
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
                                    <span className="text-[#6B7280] font-bold tracking-[1.2px] uppercase text-[7.5px]" style={{ fontFamily: 'var(--font-atkinson)' }}>{label}</span>
                                    <div className="flex-1 h-px bg-[#E5E7EB]" />
                                  </div>
                                  <div className="space-y-1">
                                    {items.map((a: any, idx: number) => {
                                      const accent = accentFor(a);
                                      return (
                                        <div key={idx} className="flex items-center gap-1.5">
                                          <div className="flex-1 border-b border-dashed border-[#C8C8CC] pb-px min-w-0">
                                            <div className="font-semibold text-[#111] truncate text-[9px] leading-tight">
                                              {a.tmName || " "}
                                            </div>
                                          </div>
                                          <div
                                            className="text-[8.5px] font-extrabold tracking-[0.4px] px-1.5 py-px rounded-[2px] whitespace-nowrap border bg-white"
                                            style={{ borderColor: accent, color: accent, fontFamily: 'var(--font-atkinson)' }}
                                          >
                                            {chipLabel(a)}
                                          </div>
                                          <span className="text-[7.5px] text-[#9CA3AF] uppercase tracking-[0.5px] w-3 text-center">
                                            {a.type === "rr" ? ((a.slotKey || "").startsWith("M") ? "M" : "W") : ""}
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

                  {/* OVERLAPS — Golden: full-width section at bottom, two rows
                     (11p–1a and 5a–7a) of 6 empty slots each. */}
                  <section className="mt-auto pt-2">
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

              {/* Sheet footer — Golden: "OMS ⚙  Weekly Zone Deployment Book · GRAVES" left,
                 version center, "— N of 14 —" right. The "GRAVES" tag
                 replaced the old "GRAVE · 11PM – 7AM" header line that used
                 to sit above the week pills. */}
              <div className="sheet-footer flex-shrink-0">
                <div className="flex items-center gap-1">
                  <span className="font-bold tracking-[1px] text-[#1C1C1E]">OMS</span>
                  <span className="text-[#9CA3AF]">⚙</span>
                  <span className="text-[#6B7280]">Weekly Zone Deployment Book</span>
                  <span className="text-[#C8C8CC] mx-1">·</span>
                  <span className="font-semibold tracking-[1px] text-[#1C1C1E]">GRAVES</span>
                </div>
                <div className="text-[#9CA3AF]">v3.4</div>
                <div className="text-[#6B7280]">— {currentView === "deployment" ? (selectedDayIndex * 2 + 1) : (selectedDayIndex * 2 + 2)} of 14 —</div>
              </div>
            </div>


            {/* Quick Action Fan removed in Phase 1 of Command Palette Upgrade.
                All card interactions now route through the contextual Command Palette
                via openPaletteForSlot / openPaletteForPerson. */}
          </div>
          </div>

          {/* ╭─ Floating pill cluster ─────────────────────────────────────╮
             │  position: fixed → anchored to the browser viewport's        │
             │  bottom edge so the cluster stays put through scroll/resize. │
             │                                                              │
             │  Vertical: bottom-3 (12px) — same baseline as the status     │
             │  pill (bottom-right) so the bottom chrome reads as a single  │
             │  horizontal band instead of stacked floating layers.         │
             │                                                              │
             │  Horizontal: follows the canvas center. The canvas shifts    │
             │  right by 296px when the roster panel is open (to clear it), │
             │  so the cluster shifts by half that = 148px. Collapsed: true │
             │  viewport center.                                            │
             │                                                              │
             │  z-40 sits above artboard content, below header/fan.         │
             │  Not inside .print-artboard → won't print.                   │
             ╰──────────────────────────────────────────────────────────────╯ */}
          <div
            className="fixed bottom-3 -translate-x-1/2 flex items-center gap-2 z-40 transition-[left] duration-300"
            style={{ left: rosterOpen ? "calc(50% + 148px)" : "50%" }}
          >
            {/* Small sphere / orb button to open Command Palette */}
            <button
              onClick={() => setCmdkOpen(true)}
              className="w-6 h-6 rounded-full bg-white border border-[#E5E5E7] shadow-sm flex items-center justify-center hover:bg-[#F3F4F6] active:scale-95 transition-all"
              title="Open Command Palette (⌘K)"
              aria-label="Open Command Palette"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>

            {/* ─── Week stepper ────────────────────────────────────────── */}
            <div
              ref={weekPill.wrapRef}
              className="flex items-center gap-0.5 bg-white border border-[#E5E5E7] rounded-full p-0.5 shadow-md"
            >
              {weekPill.expanded ? (
                <>
                  <button
                    onClick={goPrevWeek}
                    className="w-7 h-7 rounded-full text-[#6B7280] hover:bg-[#F3F4F6] flex items-center justify-center"
                    aria-label="Previous week"
                    title="Previous week"
                  >‹</button>
                  <div
                    className="px-3 h-7 flex items-center text-[12px] font-semibold tracking-[-0.1px] text-[#1C1C1E] select-none whitespace-nowrap min-w-[148px] justify-center"
                    title={`Week of ${formatWeekLabel(weekStart)}`}
                  >
                    {formatWeekLabel(weekStart)}
                  </div>
                  <button
                    onClick={goNextWeek}
                    className="w-7 h-7 rounded-full text-[#6B7280] hover:bg-[#F3F4F6] flex items-center justify-center"
                    aria-label="Next week"
                    title="Next week"
                  >›</button>
                  <button
                    onClick={() => { goThisWeek(); weekPill.setExpanded(false); }}
                    disabled={isCurrentWeek}
                    className={`h-7 px-3 ml-0.5 text-[11px] font-semibold rounded-full transition-all ${isCurrentWeek ? "text-[#C8C8CC] cursor-default" : "text-[#007AFF] hover:bg-[#E5F0FF]"}`}
                    title="Jump to current week"
                  >Today</button>
                </>
              ) : (
                <button
                  onClick={() => weekPill.setExpanded(true)}
                  className="w-7 h-7 rounded-full text-[#1C1C1E] hover:bg-[#F3F4F6] flex items-center justify-center"
                  title={`Week of ${formatWeekLabel(weekStart)} — tap to change`}
                  aria-label={`Week of ${formatWeekLabel(weekStart)} — tap to change week`}
                  aria-expanded={false}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </button>
              )}
            </div>

            {/* ─── Day picker ──────────────────────────────────────────── */}
            <div
              ref={dayPill.wrapRef}
              className="flex items-center gap-1 bg-white border border-[#E5E5E7] rounded-full p-0.5 shadow-md"
            >
              {dayPill.expanded ? (
                DAY_DEFS.map((day) => {
                  const idx = day.index;
                  const isSelected = idx === selectedDayIndex;
                  const useOutline = currentView === "breaks" && isSelected;
                  return (
                    <button
                      key={idx}
                      onClick={() => { setSelectedDayIndex(idx); dayPill.setExpanded(false); }}
                      className={`relative min-w-[40px] h-7 px-2 rounded-full text-[11px] font-semibold tracking-[-0.2px] transition-all flex items-center justify-center gap-1 ${useOutline ? "border shadow-sm" : isSelected ? "text-white shadow" : "text-[#6B7280] hover:bg-[#F3F4F6]"}`}
                      style={{ backgroundColor: useOutline ? "white" : (isSelected ? day.color : "transparent"), borderColor: useOutline ? day.color : "transparent", color: useOutline ? day.color : undefined, borderWidth: useOutline ? "1.5px" : 0 }}
                      title={`${day.name} · ${day.monthYear.split(" ")[0]} ${day.dateNum}`}
                      aria-expanded={true}
                    >
                      <span>{day.short}</span>
                      <span className="tabular-nums opacity-80">{day.dateNum}</span>
                      {mounted && day.isToday && !isSelected && (
                        <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#007AFF]" />
                      )}
                    </button>
                  );
                })
              ) : (
                <button
                  onClick={() => dayPill.setExpanded(true)}
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums transition-all ${currentView === "breaks" ? "bg-white border-[1.5px] shadow-sm" : "text-white shadow"}`}
                  style={{
                    backgroundColor: currentView === "breaks" ? "white" : selectedDay.color,
                    borderColor: currentView === "breaks" ? selectedDay.color : "transparent",
                    color: currentView === "breaks" ? selectedDay.color : "#fff",
                  }}
                  title={`${selectedDay.name} · ${selectedDay.monthYear.split(" ")[0]} ${selectedDay.dateNum} — tap to change day`}
                  aria-label={`${selectedDay.name} ${selectedDay.dateNum} — tap to change day`}
                  aria-expanded={false}
                >
                  {selectedDay.dateNum}
                </button>
              )}
            </div>

            {/* ─── View toggle ─────────────────────────────────────────── */}
            <div
              ref={viewPill.wrapRef}
              className="flex items-center bg-white border border-[#E5E5E7] rounded-full p-0.5 shadow-md"
            >
              {viewPill.expanded ? (
                <>
                  <button
                    onClick={() => { setCurrentView("deployment"); viewPill.setExpanded(false); }}
                    className={`px-4 py-1 text-[12px] font-semibold rounded-full transition-all ${currentView === "deployment" ? "bg-[#111] text-white" : "text-[#6B7280] hover:bg-[#F3F4F6]"}`}
                  >Deployment</button>
                  <button
                    onClick={() => { setCurrentView("breaks"); viewPill.setExpanded(false); }}
                    className={`px-4 py-1 text-[12px] font-semibold rounded-full transition-all ${currentView === "breaks" ? "bg-[#111] text-white" : "text-[#6B7280] hover:bg-[#F3F4F6]"}`}
                  >Breaks &amp; Overlaps</button>
                </>
              ) : (
                <button
                  onClick={() => viewPill.setExpanded(true)}
                  className="w-7 h-7 rounded-full flex items-center justify-center bg-[#111] text-white"
                  title={`${currentView === "deployment" ? "Deployment" : "Breaks & Overlaps"} — tap to switch view`}
                  aria-label={`View: ${currentView === "deployment" ? "Deployment" : "Breaks & Overlaps"} — tap to switch`}
                  aria-expanded={false}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 1 21 5 17 9" />
                    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                    <polyline points="7 23 3 19 7 15" />
                    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Floating ghost that follows the cursor / finger during drag.
         Rendered outside the artboard so it isn't clipped by overflow:hidden. */}
      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <div className="rounded-md bg-[#1C1C1E] text-white px-3 py-1.5 text-sm font-semibold shadow-lg pointer-events-none whitespace-nowrap">
            {activeDrag.tmName}
            {activeDrag.fromSlot && (
              <span className="opacity-60 ml-2 text-[11px]">from {activeDrag.fromSlot}</span>
            )}
          </div>
        ) : null}
      </DragOverlay>
      </DndContext>

      {/* === Floating status pill — bottom-right. Replaces the old full-width
          status strip. Same content for now (the "Draft • Last saved" text is
          still a placeholder pending real pending-write tracking; "Engine
          ready" is also static). Matches brand chip + zoom chip visual
          treatment for a consistent floating-chrome system. */}
      <div
        className="fixed bottom-3 right-3 z-40 flex items-center gap-3 h-9 px-4 rounded-full border border-white/60 shadow-lg shadow-black/10 text-[11.5px] text-[#8E8E93]"
        style={{
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
        }}
      >
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF9500]" aria-hidden="true" />
          <span className="font-medium">Draft</span>
          <span className="text-[#C8C8CC]">·</span>
          <span>Last saved moments ago</span>
        </div>
        <span className="text-[#C8C8CC]">|</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34C759]" aria-hidden="true" />
          <span>Engine ready</span>
        </div>
      </div>

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
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
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
        onAddTask={async (uiKey, taskLabel) => {
          if (!nightId) {
            showToast("No active night selected", "error");
            return;
          }
          try {
            const { slot_key, slot_type, rr_side } = uiToDb(uiKey);
            await addNightSlotTask({
              nightId,
              slotKey: slot_key,
              slotType: slot_type,
              rrSide: rr_side,
              taskLabel,
              sortOrder: 50,
            });
            // Refresh tasks so cards show the new one immediately
            const fresh = await getNightSlotTasks(nightId);
            const byKey: Record<string, NightSlotTask[]> = {};
            for (const t of fresh) {
              if (!byKey[t.slotKey]) byKey[t.slotKey] = [];
              byKey[t.slotKey].push(t);
            }
            setSelectedTasks(byKey);
          } catch (e) {
            console.error("Failed to add task from palette", e);
            showToast("Failed to save task", "error");
          }
        }}
        onCycleBreak={(slotKey) => {
          const current = assignments[slotKey]?.breakGroup ?? 0;
          const next = (current % 3) + 1; // simple cycle 1->2->3->1
          setBreakGroupForSlot(slotKey, next as any);
        }}
        selectedSlotAssignment={cmdkInitialContext?.type === 'slot' ? assignments[cmdkInitialContext.value] : null}
        isDraftMode={isDraftMode}
        onApplyGrokSuggestions={applyGrokSuggestions}
        requestGrokStructuredSuggestions={requestGrokStructuredSuggestions}
        onTriggerGrokBoardAnalysis={triggerGrokBoardAnalysis}
        commandRoster={realRoster}
        commandShiftDate={selectedDay.date}
        commandWeekDays={DAY_DEFS.map(d => ({ date: d.date, name: d.name, short: d.short }))}
        onSetGravePool={async (tmId, value) => {
          await setTMGravePool(tmId, value);
          setTMCommandEpoch(e => e + 1);
        }}
        onSetDisplayName={async (tmId, newName) => {
          await setTMDisplayName(tmId, newName);
          setTMCommandEpoch(e => e + 1);
        }}
        onRemoveFromSchedule={async (tmId, date) => {
          if (!nightId) throw new Error("No night context — pick a day first");
          await removeTMFromSchedule({ tmId, nightId, nightDate: date });
          setTMCommandEpoch(e => e + 1);
        }}
        onCheckDisplayNameConflict={checkDisplayNameConflict}
        whyBreakdown={draftBreakdown}
        whyReasoning={draftGrokReasoning}
        whyGrokExplanation={draftGrokExplanation}
        whyWarnings={draftEngineWarnings}
        whyAvailable={isDraftMode && Object.keys(draftBreakdown).length > 0}
        onOpenSudo={() => setSudoOpen(true)}
      />

      <SudoWindow
        open={sudoOpen}
        onClose={() => setSudoOpen(false)}
        onDataChanged={() => setTMCommandEpoch((e) => e + 1)}
      />
    </div>
  );
}
