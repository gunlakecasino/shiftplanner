"use client";

import React from "react";
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
} from "@/lib/shiftbuilder/constants";
import type { AuxDef } from "@/lib/shiftbuilder/placement";
import type { DayDef } from "@/lib/shiftbuilder/dateUtils";
import { useAssignments, useDraftAssignments, useAuxDefs, useShiftBuilderStore } from "../store/useShiftBuilderStore";

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

  // Live cache interface (passed through for optimistic)
  live?: any;

  // Breaks view overlap headers (pre-computed in parent for now)
  amOverlapDayName?: string;
  amOverlapDateNum?: number;
  nextDayColor?: string;
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
  live,
  amOverlapDayName,
  amOverlapDateNum,
  nextDayColor,
  processedWaves,
  processedBreakCounts,
}: ShiftBuilderBoardProps) {
  // 3.4 — Narrow Zustand subscriptions (primary source). Only re-renders this island
  // when the selected slice actually mutates. Falls back to props during transition.
  const assignments = useAssignments() ?? assignmentsProp ?? {};
  const draftAssignments = useDraftAssignments() ?? draftAssignmentsProp ?? {};
  const auxDefs = useAuxDefs() ?? auxDefsProp ?? {};

  // Respect pending drag so source cards do not lose their draggable state
  // or visual TM during an active reassignment drag. This is critical for
  // making assigned TM drag feel solid like task drag.
  const pendingDrag = useShiftBuilderStore(s => s.pendingDrag) ?? null;

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

  const isAnyDragActive = !!pendingDrag;
  // === Local derived (was in giant parent; now scoped to board only) ===
  // Always call the hook (Rules of Hooks). Prefer worker value when available.
  const computedBreakCounts = React.useMemo(() => {
    const counts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
    Object.values(assignments).forEach((a: any) => {
      if (!a?.tmName) return;
      const g = (a.breakGroup ?? 0) as 1 | 2 | 3;
      if (g === 1 || g === 2 || g === 3) counts[g]++;
    });
    return counts;
  }, [assignments]);

  const breakCounts = processedBreakCounts ?? computedBreakCounts;

  const inRotationCount = breakCounts[1] + breakCounts[2] + breakCounts[3];

  // Helper used only inside breaks view wave rendering
  const slotRefType = (ref: string | null): "zone" | "rr" | "aux" => {
    if (!ref) return "zone";
    if (ref.startsWith("MRR") || ref.startsWith("WRR")) return "rr";
    if (/^Z\d+$/.test(ref)) return "zone";
    return "aux";
  };

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
              style={{ color: selectedDay.color, fontSize: 26, letterSpacing: "-0.8px", fontFamily: "var(--font-atkinson)" }}
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
                  className="min-w-[18px] h-[16px] px-1 text-[9px] flex items-center justify-center font-bold tracking-[-0.2px] rounded-[3px] cursor-pointer"
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
                      className="min-w-[15px] h-[15px] px-1 text-[9px] flex items-center justify-center font-bold rounded-[2px] cursor-pointer"
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

      {isDraftMode && (
        <div
          className="mx-2 mt-1 mb-2 px-3 py-1.5 bg-amber-100 border border-amber-300 rounded text-amber-800 text-xs font-medium flex items-center justify-between gap-3"
          style={{ fontFamily: "var(--font-atkinson)" }}
        >
          <span className="truncate">
            📝 DRAFT MODE — Engine suggestions shown. Previous assignments faded below.
          </span>
          {/* Apply/Discard buttons are wired in parent (they need full history + engine context). 
              For visual parity we keep the banner; the buttons are provided by the orchestrator via portal or kept outside. */}
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
                  {ZONE_DEFS.filter((d) => !!assignments[d.key]?.tmName).length} / 10 FILLED
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5" style={{ gridAutoRows: "minmax(135px, auto)" }}>
                {ZONE_DEFS.map((def) => (
                  <ZoneCard
                    key={def.key}
                    def={def}
                    assignments={displayAssignments}
                    selectedTasks={selectedTasks}
                    setBreakGroupForSlot={setBreakGroupForSlot}
                    onCardClick={onCardClick}
                    loading={loadingAssignments}
                    borderColor={cardBorders[def.key]}
                    isDraftMode={isDraftMode}
                    draftInfo={draftAssignments[def.key]}
                    onRemoveTask={onRemoveTask}
                    onSetTaskColor={onSetTaskColor}
                    onEditTask={onEditTask}
                    isLocked={isCurrentNightLocked}
                    onLiveAssign={onLiveAssign}
                    onLiveUnassign={onLiveUnassign}
                  />
                ))}
              </div>
            </section>

            {/* RESTROOMS — Golden: 1 row × 5 cols */}
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
                    assignments={displayAssignments}
                    selectedTasks={selectedTasks}
                    setBreakGroupForSlot={setBreakGroupForSlot}
                    onGenderClick={onGenderClick ?? ((k: string) => {})}
                    loading={loadingAssignments}
                    borderColor={cardBorders[`RR${def.num}`] || cardBorders[`MRR${def.num}`] || cardBorders[`WRR${def.num}`]}
                    isDraftMode={isDraftMode}
                    draftInfo={draftAssignments[`MRR${def.num}`] || draftAssignments[`WRR${def.num}`]}
                    onRemoveTask={onRemoveTask}
                    onSetTaskColor={onSetTaskColor}
                    onEditTask={onEditTask}
                    isLocked={isCurrentNightLocked}
                    onLiveAssign={onLiveAssign}
                    onLiveUnassign={onLiveUnassign}
                  />
                ))}
              </div>
            </section>

            {/* AUXILIARY */}
            <section className="mb-2">
              <div className="sheet-section-header">
                <span className="label">AUXILIARY</span>
                <div className="divider" />
                <span className="count">
                  {auxDefs.filter((d) => !!assignments[d.key]?.tmName).length} / {auxDefs.length} FILLED
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
                    assignments={displayAssignments}
                    selectedTasks={selectedTasks}
                    setBreakGroupForSlot={setBreakGroupForSlot}
                    onCardClick={onCardClick}
                    loading={loadingAssignments}
                    borderColor={cardBorders[def.key]}
                    isDraftMode={isDraftMode}
                    draftInfo={draftAssignments[def.key]}
                    onRemoveTask={onRemoveTask}
                    onSetTaskColor={onSetTaskColor}
                    onEditTask={onEditTask}
                    isLocked={isCurrentNightLocked}
                    onLiveAssign={onLiveAssign}
                    onLiveUnassign={onLiveUnassign}
                  />
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            {/* 3 Break Wave Columns — Golden tight layout */}
            <div className="grid grid-cols-3 gap-1 mb-1.5">
              {[1, 2, 3].map((wave) => {
                // Prefer pre-processed data from the worker when available (big perf win)
                let waveAssignments: any[];
                if (processedWaves && processedWaves[wave - 1]) {
                  waveAssignments = processedWaves[wave - 1].items || [];
                } else {
                  // Fallback (main thread) – will be removed once worker is fully wired
                  waveAssignments = Object.entries(assignments)
                    .map(([slotKey, a]: [string, any]) => {
                      if (!a?.tmId || a.breakGroup !== wave) return null;
                      return {
                        ...a,
                        slotKey,
                        type: slotRefType(slotKey),
                        tmName: a.tmName,
                      };
                    })
                    .filter(Boolean) as any[];
                }

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
            <section className="mt-auto pt-2 overlaps-section" data-print-target="overlaps">
              <div className="sheet-section-header">
                <span className="label">OVERLAPS</span>
                <div className="divider" />
              </div>

              <div className="space-y-2">
                {[
                  {
                    time: "11p – 1a (swing)",
                    key: "PM" as const,
                    dayName: selectedDay.name,
                    dateNum: selectedDay.dateNum,
                    headerColor: selectedDay.color,
                  },
                  {
                    time: "5a – 7a (day shift)",
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
                      <div className="flex-1 grid grid-cols-6 gap-1.5">
                        {Array.from({ length: 6 }).map((_, i) => (
                          <OverlapSlot
                            key={i}
                            slotKey={`OL-${row.key}-${i}`}
                            assignments={displayAssignments}
                            selectedTasks={selectedTasks}
                            onCardClick={onCardClick}
                            loading={loadingAssignments}
                            isDraftMode={isDraftMode}
                            draftInfo={draftAssignments[`OL-${row.key}-${i}`]}
                            onRemoveTask={onRemoveTask}
                            onSetTaskColor={onSetTaskColor}
                            onEditTask={onEditTask}
                            isLocked={isCurrentNightLocked}
                          />
                        ))}
                      </div>
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
  );
});

export default ShiftBuilderBoard;
