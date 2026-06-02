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
import { getTmPlacementHistory, type ZoneDetailEntry } from "@/lib/shiftbuilder/data";

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
  /** When the full MarkerPad is open for a slot, the unilateral dash for that slot should auto-close for clean UX */
  activeMarkerSlotKey?: string | null;
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
  activeMarkerSlotKey,
  members = [],
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

  // Unilateral subtle "dash" callout for the selected card.
  // Contains provenance area + marker pad functionality.
  // Comes off one side of the card (right by default), subtle, paper-like.
  // Card components (ZoneCard etc) appearances are completely unchanged.
  // Selection is local to board for the visual; full drawer can still be triggered if needed.
  const [dashSlotKey, setDashSlotKey] = React.useState<string | null>(null);

  // Clear the dash when day or view changes (keeps it scoped to current artboard content)
  React.useEffect(() => {
    setDashSlotKey(null);
  }, [selectedDayIndex, currentView]);

  // Close dash on outside click (document level) when open — makes the unilateral dash feel light and non-drawer.
  React.useEffect(() => {
    if (!dashSlotKey) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // If click is not inside any data-slot-key wrapper or the placement dash callout, close.
      // (dash is the unilateral attached baseline for click-on-placement-card per drawn spec)
      if (!target.closest('[data-slot-key]') && !target.closest('.placement-dash')) {
        setDashSlotKey(null);
      }
    };
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [dashSlotKey]);

  // When the full MarkerPad drawer opens for the current dashed slot, auto-close the unilateral dash
  // so the two surfaces don't compete (clean UX for "new unilateral marker dash").
  React.useEffect(() => {
    if (dashSlotKey && activeMarkerSlotKey && dashSlotKey === activeMarkerSlotKey) {
      setDashSlotKey(null);
    }
  }, [activeMarkerSlotKey, dashSlotKey]);

  // History for the current dashed slot's TM (for Last 5 and Last 14 matrix)
  const [dashHistory, setDashHistory] = React.useState<ZoneDetailEntry | null>(null);
  const [dashHistoryLoading, setDashHistoryLoading] = React.useState(false);

  React.useEffect(() => {
    if (!dashSlotKey) {
      setDashHistory(null);
      setDashHistoryLoading(false);
      return;
    }
    const a = displayAssignments[dashSlotKey] || {};
    if (!a.tmId) {
      setDashHistory(null);
      setDashHistoryLoading(false);
      return;
    }
    setDashHistoryLoading(true);
    getTmPlacementHistory(a.tmId, 14)
      .then((h) => {
        setDashHistory(h);
        setDashHistoryLoading(false);
      })
      .catch(() => {
        setDashHistory(null);
        setDashHistoryLoading(false);
      });
  }, [dashSlotKey, displayAssignments]);

  // Helper used only inside breaks view wave rendering
  const slotRefType = (ref: string | null): "zone" | "rr" | "aux" => {
    if (!ref) return "zone";
    if (ref.startsWith("MRR") || ref.startsWith("WRR")) return "rr";
    if (/^Z\d+$/.test(ref)) return "zone";
    return "aux";
  };

  // Wrapped handlers so clicks on cards (or card sub-parts) set the unilateral dash.
  // IMPORTANT: We no longer auto-delegate to the parent onCardClick/onGenderClick here.
  // The rich dash (the drawn baseline with Placement Matrix / Last 5 / Insights + quick actions)
  // is now the primary thing that appears when you click a placement card.
  // Actions inside the dash (Lock / Coverage / Swap / Assign Sweeper) explicitly call the
  // original onCardClick / onGenderClick (which opens the full MarkerPad) + close the dash.
  // Clear is direct + fast. This prevents the "both dash + full drawer at once" clutter.
  const handleCardClickForDash = React.useCallback((k: string, el?: HTMLElement, e?: React.MouseEvent) => {
    setDashSlotKey(k);
    // Intentionally do NOT call onCardClick here for the initial trigger.
  }, []);

  const handleGenderClickForDash = React.useCallback((k: string, el?: HTMLElement, e?: React.MouseEvent) => {
    setDashSlotKey(k);
    // Intentionally do NOT call onGenderClick here for the initial trigger.
  }, []);

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
              <div className="grid grid-cols-5 gap-1.5 flex-1" style={{ gridAutoRows: "minmax(0, 1fr)" }}>
                {ZONE_DEFS.map((def) => {
                  const key = def.key;
                  const isDashed = dashSlotKey === key;
                  const accent = getZoneColor(key);
                  const a = displayAssignments[key] || {};
                  const prov = a.provenance || {};
                  const hasProv = prov.rationale || prov.fairnessSignals;

                  const isRightSideDash = ['Z4', 'Z5', 'Z9', 'Z10'].includes(key); // zone 4/5 and below (right cols in 5-col grid) open dash to LEFT

                  return (
                    <div key={key} className="relative h-full" data-slot-key={key}>
                      <ZoneCard
                        def={def}
                        assignments={displayAssignments}
                        selectedTasks={selectedTasks}
                        setBreakGroupForSlot={setBreakGroupForSlot}
                        onCardClick={handleCardClickForDash}
                        loading={loadingAssignments}
                        borderColor={cardBorders[key]}
                        isDraftMode={isDraftMode}
                        draftInfo={draftAssignments[key]}
                        onRemoveTask={onRemoveTask}
                        onSetTaskColor={onSetTaskColor}
                        onEditTask={onEditTask}
                        isLocked={isCurrentNightLocked}
                        onLiveAssign={onLiveAssign}
                        onLiveUnassign={onLiveUnassign}
                      />
                      {isDashed && (
                        <div
                          className={`placement-dash absolute top-0 ${isRightSideDash ? 'right-full mr-1.5' : 'left-full ml-1.5'} w-[268px] z-[60] overflow-hidden flex flex-col`}
                          style={{
                            borderRadius: 16,
                            background: "rgba(255,255,255,0.98)",
                            border: "1px solid rgba(0,0,0,0.08)",
                            boxShadow: "0 20px 48px -16px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.75)",
                            maxWidth: '268px',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Accent rail + soft glow — matches Marker Pad velvet treatment (flipped for right-side cards) */}
                          <div
                            style={isRightSideDash ? {
                              position: "absolute",
                              top: 12,
                              right: -1,
                              width: 3,
                              height: 44,
                              borderRadius: "3px 0 0 3px",
                              background: accent,
                              boxShadow: `0 0 12px ${accent}77`,
                            } : {
                              position: "absolute",
                              top: 12,
                              left: -1,
                              width: 3,
                              height: 44,
                              borderRadius: "0 3px 3px 0",
                              background: accent,
                              boxShadow: `0 0 12px ${accent}77`,
                            }}
                          />
                          {/* Unilateral tail/pointer for stronger "comes off the card" attachment (flipped for right-side cards) */}
                          <div
                            style={isRightSideDash ? {
                              position: "absolute",
                              right: "-7px",
                              top: "20px",
                              width: 0,
                              height: 0,
                              borderTop: "5px solid transparent",
                              borderBottom: "5px solid transparent",
                              borderLeft: "6px solid rgba(0,0,0,0.08)",
                            } : {
                              position: "absolute",
                              left: "-7px",
                              top: "20px",
                              width: 0,
                              height: 0,
                              borderTop: "5px solid transparent",
                              borderBottom: "5px solid transparent",
                              borderRight: "6px solid rgba(0,0,0,0.08)",
                            }}
                          />

                          {/* Close — matches Marker Pad round subtle × (positioned on outer edge for flipped left-dash) */}
                          <button
                            onClick={() => setDashSlotKey(null)}
                            style={{
                              position: "absolute",
                              top: 8,
                              [isRightSideDash ? 'left' : 'right']: 8,
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              background: "rgba(0,0,0,0.04)",
                              border: "1px solid rgba(0,0,0,0.08)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#8E8E93",
                              fontSize: 13,
                              lineHeight: 1,
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.08)";
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.04)";
                            }}
                          >
                            ×
                          </button>

                          {/* Header — premium avatar + name + break group pill like Marker Pad (taller for larger comps) */}
                          <div style={{ padding: "10px 14px 6px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                              {/* Small avatar circle (velvet style) — slightly larger */}
                              <div
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: "50%",
                                  background: a.tmName ? accent : "rgba(0,0,0,0.06)",
                                  color: "#fff",
                                  fontSize: 11,
                                  fontWeight: 800,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0,
                                  boxShadow: a.tmName ? "inset 0 1px 0 rgba(255,255,255,0.25)" : "none",
                                  fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)",
                                }}
                              >
                                {a.tmName ? a.tmName[0].toUpperCase() : "–"}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.1px", color: accent, textTransform: "uppercase", fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}>
                                  {def.label}
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.2px", color: "#111", fontFamily: "var(--font-bricolage, var(--font-atkinson))", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {a.tmName || "— Unassigned —"}
                                </div>
                                {(a.hours || a.pool) && (
                                  <div style={{ fontSize: 10, color: "#8E8E93", fontFamily: "var(--font-jetbrains, monospace)", marginTop: 1 }}>
                                    {a.hours ?? "11p–7a"} · {a.pool ?? "Full"}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Break Group pill — velvet active pill treatment, compact + optional clear x to build out UX (larger) */}
                            <div style={{ textAlign: "right", flexShrink: 0, marginRight: 24 }}>
                              <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: "1px", color: "#6C6C72", textTransform: "uppercase" }}>BREAK GROUP</div>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                <div
                                  style={{
                                    marginTop: 2,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 26,
                                    height: 26,
                                    borderRadius: 8,
                                    background: `linear-gradient(180deg, ${accent}cc, ${accent}88)`,
                                    border: `1px solid ${accent}`,
                                    color: "#fff",
                                    fontSize: 15,
                                    fontWeight: 800,
                                    fontFamily: "var(--font-bricolage, var(--font-atkinson))",
                                    boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 4px -2px ${accent}88`,
                                  }}
                                >
                                  {a.breakGroup ?? "—"}
                                </div>
                                {a.breakGroup != null && setBreakGroupForSlot && (
                                  <div
                                    onClick={(e) => { e.stopPropagation(); setBreakGroupForSlot(key, 0); }}
                                    style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: 4 }}
                                    title="Clear break group"
                                  >
                                    <span style={{ fontSize: 9, color: '#666', lineHeight: 1 }}>×</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Soft separator */}
                          <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 10px" }} />

                          {/* Tasks header + Assign Sweeper (premium pill like drawer) */}
                          <div style={{ padding: "7px 12px 5px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "#6C6C72" }}>TASKS</span>
                            <button
                              onClick={() => { onCardClick?.(key); setDashSlotKey(null); }}
                              style={{
                                fontSize: 8, fontWeight: 700, letterSpacing: "0.2px",
                                padding: "2px 6px", borderRadius: 6,
                                background: "rgba(0,0,0,0.06)",
                                border: "1px solid rgba(0,0,0,0.12)",
                                color: "rgba(0,0,0,0.65)",
                                cursor: "pointer",
                                fontFamily: "var(--font-atkinson)",
                              }}
                              onMouseEnter={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.10)";
                                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,0,0,0.20)";
                              }}
                              onMouseLeave={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.background = "rgba(0,0,0,0.06)";
                                (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(0,0,0,0.12)";
                              }}
                            >
                              sweeper
                            </button>
                          </div>

                          {/* Ability to add TM on blank cards */}
                          {!a.tmName && (
                            <div style={{ padding: "5px 12px 7px", background: "rgba(0,0,0,0.02)", borderTop: "1px solid rgba(0,0,0,0.05)", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                              <button
                                onClick={() => { onCardClick?.(key); setDashSlotKey(null); }}
                                style={{
                                  width: "100%",
                                  padding: "6px 8px",
                                  borderRadius: 8,
                                  background: accent,
                                  color: "#fff",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  border: "none",
                                  cursor: "pointer",
                                  fontFamily: "var(--font-atkinson)",
                                }}
                              >
                                + Add / Assign TM
                              </button>
                            </div>
                          )}

                          {/* History sections only for assigned TMs */}
                          {a.tmName && (
                            <>
                              {/* PLACEMENT MATRIX — wired to real dashHistory (prior placements only, per current TM) */}
                              <div style={{ padding: "5px 12px 7px" }}>
                                <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", color: "#6C6C72", marginBottom: 4 }}>PLACEMENT MATRIX</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  {/* Simple red ring icon matching the screenshot (red border, white fill, small red center dot) — larger */}
                                  <div style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    border: `3px solid ${accent}`,
                                    background: 'white',
                                    position: 'relative',
                                    flexShrink: 0,
                                  }}>
                                    <div style={{
                                      width: 10,
                                      height: 10,
                                      borderRadius: '50%',
                                      background: accent,
                                      position: 'absolute',
                                      top: '50%',
                                      left: '50%',
                                      transform: 'translate(-50%, -50%)',
                                    }} />
                                  </div>
                                  <div style={{ fontSize: 9.5, lineHeight: 1.15 }}>
                                    <div style={{ color: "#6C6C72", fontSize: 7.5 }}>LAST 14 PLACEMENTS</div>
                                    <div style={{ display: "flex", gap: 8, marginTop: 2, fontFamily: "var(--font-jetbrains, monospace)" }}>
                                      <span style={{ color: accent, fontWeight: 700 }}>RR <span style={{ color: "#111" }}>{(() => {
                                        const curIso = `${selectedDay.date.getFullYear()}-${String(selectedDay.date.getMonth()+1).padStart(2,'0')}-${String(selectedDay.date.getDate()).padStart(2,'0')}`;
                                        let r = 0; if (dashHistory?.zoneDates) Object.entries(dashHistory.zoneDates).forEach(([ui,ds]) => { if ((ui.startsWith('MRR')||ui.startsWith('WRR')) && ds.some(d=>d<curIso)) r += (ds.filter(d=>d<curIso).length); }); return r;
                                      })()}</span></span>
                                      <span style={{ color: "#8E8E93", fontWeight: 700 }}>ZONE <span style={{ color: "#111" }}>{(() => {
                                        const curIso = `${selectedDay.date.getFullYear()}-${String(selectedDay.date.getMonth()+1).padStart(2,'0')}-${String(selectedDay.date.getDate()).padStart(2,'0')}`;
                                        let z = 0; if (dashHistory?.zoneDates) Object.entries(dashHistory.zoneDates).forEach(([ui,ds]) => { if (/^Z\d+$/.test(ui) && ds.some(d=>d<curIso)) z += (ds.filter(d=>d<curIso).length); }); return z;
                                      })()}</span></span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* LAST 14 PLACEMENTS GRID — pills for zones, RRs (eligible), aux. Filled if placed in last 14 */}
                              <div style={{ padding: "5px 12px 7px" }}>
                                <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: "0.6px", color: "#6C6C72", marginBottom: 3 }}>LAST 14 PLACEMENTS</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                  {(() => {
                                    // Gender-aware RR sides for this TM (so a male TM doesn't show female RR pills in their last-14 matrix, etc.)
                                    const dashA = displayAssignments[dashSlotKey] || a;
                                    const tmId = dashA?.tmId;
                                    const rawGender = members?.find((m: any) => (m.id === tmId || m.tmId === tmId || m.tm_id === tmId))?.gender ?? null;
                                    const g = (() => {
                                      const s = String(rawGender || '').toUpperCase().trim();
                                      if (s === 'F' || s === 'FEMALE' || s.startsWith('F')) return 'F';
                                      if (s === 'M' || s === 'MALE' || s.startsWith('M')) return 'M';
                                      return '';
                                    })();

                                    const locs: { ui: string; label: string }[] = [
                                      ...ZONE_DEFS.map((d) => ({ ui: d.key, label: d.key })),
                                      // Only eligible RR side(s) for the current TM's gender (both if unknown/missing data)
                                      ...RR_DEFS.flatMap((d) => {
                                        const sides: { ui: string; label: string }[] = [];
                                        if (!g || g === 'M') sides.push({ ui: `MRR${d.num}`, label: `RR${d.num}M` });
                                        if (!g || g === 'F') sides.push({ ui: `WRR${d.num}`, label: `RR${d.num}W` });
                                        return sides;
                                      }),
                                      ...auxDefs
                                        .filter((d) => !d.key.startsWith('SP'))
                                        .map((d) => {
                                          let label = d.label || d.key;
                                          if (d.key.startsWith('TR')) {
                                            const num = d.key.replace(/\D/g, '');
                                            label = `T${num}`; // short per request; ui key stays TR* so history matching works
                                          }
                                          return { ui: d.key, label };
                                        }),
                                    ];
                                    // Filter to *prior* placements only (exclude current selected day's placement + any future relative to viewed night)
                                    const currentIso = `${selectedDay.date.getFullYear()}-${String(selectedDay.date.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.date.getDate()).padStart(2, '0')}`;
                                    let effectiveCounts: Record<string, number> = {};
                                    if (dashHistory?.zoneDates) {
                                      for (const [z, ds] of Object.entries(dashHistory.zoneDates)) {
                                        const prior = (ds || []).filter((d: string) => d < currentIso);
                                        if (prior.length > 0) effectiveCounts[z] = prior.length;
                                      }
                                    } else {
                                      effectiveCounts = dashHistory?.zoneCounts || {};
                                    }
                                    const placed = new Set(Object.keys(effectiveCounts));
                                    const getPillAccent = (ui: string): string => {
                                      if (/^Z\d+$/.test(ui)) return getZoneColor(ui);
                                      if (ui.startsWith('MRR') || ui.startsWith('WRR')) {
                                        const num = parseInt(ui.replace(/\D/g, ''), 10) || 1;
                                        return getRRAccent(num);
                                      }
                                      return getAuxAccent(ui);
                                    };
                                    return locs.map((loc, idx) => {
                                      const was = placed.has(loc.ui);
                                      const locAccent = getPillAccent(loc.ui);
                                      return (
                                        <span
                                          key={idx}
                                          style={{
                                            width: "40px",
                                            textAlign: "center",
                                            whiteSpace: "nowrap",
                                            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                                            background: was ? `${locAccent}33` : "transparent",
                                            border: was ? `1px solid ${locAccent}` : "1px solid #ccc",
                                            color: was ? locAccent : "#666",
                                            fontFamily: "var(--font-jetbrains, monospace)",
                                            boxSizing: "border-box",
                                          }}
                                          title={loc.ui}
                                        >
                                          {loc.label}
                                        </span>
                                      );
                                    });
                                  })()}
                                </div>
                              </div>

                              {/* LAST 5 PLACEMENTS — dynamic from history, RR shows number */}
                              <div style={{ padding: "5px 12px 7px", background: "rgba(0,0,0,0.02)", borderTop: "1px solid rgba(0,0,0,0.05)", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                                <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: "0.6px", color: "#6C6C72", marginBottom: 3 }}>LAST 5 PLACEMENTS</div>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  {(() => {
                                    let pills: string[] = ["Z1", "RR3", "Z4"];
                                    if (dashHistory && dashSlotKey === key && dashHistory.zoneDates) {
                                      const currentIso = `${selectedDay.date.getFullYear()}-${String(selectedDay.date.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.date.getDate()).padStart(2, '0')}`;
                                      const filteredDates: Record<string, string[]> = {};
                                      for (const [ui, ds] of Object.entries(dashHistory.zoneDates)) {
                                        const prior = (ds || []).filter((d: string) => d < currentIso);
                                        if (prior.length) filteredDates[ui] = prior;
                                      }
                                      const sorted = Object.entries(filteredDates)
                                        .map(([ui, dates]) => ({ ui, latest: dates.sort().reverse()[0] || '' }))
                                        .sort((a, b) => b.latest.localeCompare(a.latest));
                                      pills = sorted.slice(0, 5).map(({ ui }) => {
                                        if (ui.startsWith('MRR')) return ui.replace('MRR', 'RR') + 'M';
                                        if (ui.startsWith('WRR')) return ui.replace('WRR', 'RR') + 'W';
                                        if (ui.startsWith('TR')) return ui.replace('TR', 'TRASH');
                                        if (ui.startsWith('SP')) return ui.replace('SP', 'SUPPORT');
                                        return ui;
                                      });
                                    }
                                    const getColorForPill = (label: string): string => {
                                      if (label.includes('RR')) {
                                        const num = parseInt(label.replace(/\D/g, ''), 10) || 1;
                                        return getRRAccent(num); // now match the RR card accent, like last14 grid
                                      }
                                      if (/^Z\d+$/.test(label)) return getZoneColor(label);
                                      if (label.includes('Z9SR') || label.includes('SR')) return getAuxAccent('Z9SR');
                                      if (label.includes('TRASH')) return getAuxAccent('TR1');
                                      if (label.includes('SUPPORT')) return getAuxAccent('SP1');
                                      return accent; // fallback current dash accent
                                    };
                                    return pills.map((b, i) => {
                                      const pAccent = getColorForPill(b);
                                      const bg = `${pAccent}22`;
                                      const border = `${pAccent}44`;
                                      const col = pAccent;
                                      return (
                                        <span
                                          key={i}
                                          style={{
                                            fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
                                            background: bg, border: `1px solid ${border}`, color: col,
                                            fontFamily: "var(--font-jetbrains, monospace)", letterSpacing: "0.2px",
                                          }}
                                        >
                                          {b}
                                        </span>
                                      );
                                    });
                                  })()}
                                </div>
                                <div style={{ fontSize: 7, color: "#8E8E93", marginTop: 2 }}>NOT RECENTLY PLACED</div>
                              </div>

                              {/* INSIGHTS — engine heart, velvet typography (responsive, no internal scroll; content drives dash height) */}
                              <div style={{ padding: "6px 12px 7px" }}>
                                <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", color: "#6C6C72", marginBottom: 2 }}>INSIGHTS</div>
                                <div style={{ fontSize: 10, lineHeight: 1.25, color: "#2F2F2D" }}>
                                  {hasProv && prov.rationale ? prov.rationale : "Engine placed for rotation balance + coverage."}
                                </div>
                                {prov.fairnessSignals && (
                                  <div style={{ marginTop: 4, display: "flex", gap: 6, fontSize: 8.5, color: "#5C4A2E", fontFamily: "var(--font-jetbrains, monospace)" }}>
                                    {Object.entries(prov.fairnessSignals).slice(0, 3).map(([k, v]: [string, any]) => {
                                      const lab = k.toLowerCase().includes('rot') ? 'Rot' : k.toLowerCase().includes('aff') ? 'Aff' : 'Load';
                                      return <span key={k}>{lab} {Number(v).toFixed(1)}</span>;
                                    })}
                                  </div>
                                )}
                              </div>
                            </>
                          )}

                          {/* Footer actions — EXACT visual language from Marker Pad (glass, radius 9, hover, red Clear) */}
                          <div style={{ display: "flex", gap: 4, padding: "4px 6px 6px", borderTop: "1px solid rgba(0,0,0,0.06)", flexShrink: 0 }}>
                            <button
                              onClick={() => { onCardClick?.(key); setDashSlotKey(null); }}
                              style={{ flex: 1, height: 26, borderRadius: 8, fontSize: 9.5, fontWeight: 700, letterSpacing: "-0.1px", fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)", background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.75)", cursor: "pointer" }}
                            >Lock</button>
                            <button
                              onClick={() => { if (onLiveUnassign) onLiveUnassign(key); setDashSlotKey(null); }}
                              style={{ flex: 1, height: 26, borderRadius: 8, fontSize: 9.5, fontWeight: 700, letterSpacing: "-0.1px", fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)", background: "rgba(229,57,53,0.15)", border: "1px solid rgba(229,57,53,0.4)", color: "#E53935", cursor: "pointer" }}
                            >Clear</button>
                            <button
                              onClick={() => { onCardClick?.(key); setDashSlotKey(null); }}
                              style={{ flex: 1, height: 26, borderRadius: 8, fontSize: 9.5, fontWeight: 700, letterSpacing: "-0.1px", fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)", background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.75)", cursor: "pointer" }}
                            >Coverage</button>
                            <button
                              onClick={() => { onCardClick?.(key); setDashSlotKey(null); }}
                              style={{ flex: 1, height: 26, borderRadius: 8, fontSize: 9.5, fontWeight: 700, letterSpacing: "-0.1px", fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)", background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.75)", cursor: "pointer" }}
                            >Swap</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
              <div className="grid grid-cols-5 gap-1.5 flex-1" style={{ gridAutoRows: "minmax(0, 1fr)" }}>
                {RR_DEFS.map((def) => {
                  const key = `RR${def.num}`; // physical key for dash (sides use MRR/WRR internally)
                  const isDashed = dashSlotKey === key || (dashSlotKey && (dashSlotKey === `MRR${def.num}` || dashSlotKey === `WRR${def.num}`));
                  const accent = getRRAccent(def.num);
                  const mKey = `MRR${def.num}`;
                  const wKey = `WRR${def.num}`;
                  const mA = displayAssignments[mKey] || {};
                  const wA = displayAssignments[wKey] || {};
                  const mProv = mA.provenance || {};
                  const wProv = wA.provenance || {};
                  // focusedSk: prefer live dashSlotKey (supports direct WRR click/assign for persist). Only falls back when no side dash active.
                  const focusedSk = (dashSlotKey && (dashSlotKey.startsWith('MRR') || dashSlotKey.startsWith('WRR'))) ? dashSlotKey : (!mA.tmName ? mKey : wKey);

                  return (
                    <div key={def.num} className="relative" data-slot-key={key}>
                      <RRCard
                        def={def}
                        assignments={displayAssignments}
                        selectedTasks={selectedTasks}
                        setBreakGroupForSlot={setBreakGroupForSlot}
                        onGenderClick={handleGenderClickForDash}
                        loading={loadingAssignments}
                        borderColor={cardBorders[`RR${def.num}`] || cardBorders[mKey] || cardBorders[wKey]}
                        isDraftMode={isDraftMode}
                        draftInfo={draftAssignments[mKey] || draftAssignments[wKey]}
                        onRemoveTask={onRemoveTask}
                        onSetTaskColor={onSetTaskColor}
                        onEditTask={onEditTask}
                        isLocked={isCurrentNightLocked}
                        onLiveAssign={onLiveAssign}
                        onLiveUnassign={onLiveUnassign}
                      />
                      {isDashed && (
                        <div
                          className="placement-dash absolute bottom-0 left-full ml-1.5 w-[268px] z-[60] overflow-hidden flex flex-col"
                          style={{
                            borderRadius: 16,
                            background: "rgba(255,255,255,0.98)",
                            border: "1px solid rgba(0,0,0,0.08)",
                            boxShadow: "0 20px 48px -16px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.75)",
                            maxWidth: '268px',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Left accent rail + soft glow — matches Marker Pad (now bottom-pinned for RR/aux: opposite of zones' top-0) */}
                          <div style={{ position: "absolute", bottom: 12, left: -1, width: 3, height: 44, borderRadius: "0 3px 3px 0", background: accent, boxShadow: `0 0 12px ${accent}77` }} />
                          {/* Unilateral tail/pointer (bottom-pinned so attachment near card bottom, dash extends upward) */}
                          <div style={{ position: "absolute", left: "-7px", bottom: "20px", width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderRight: "6px solid rgba(0,0,0,0.08)" }} />

                          <button onClick={() => setDashSlotKey(null)} style={{ position: "absolute", bottom: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#8E8E93", fontSize: 13, cursor: "pointer" }}>×</button>

                          {/* RR header — per-side focused, velvet avatar + label (taller, larger comps) */}
                          {(() => {
                            const isMens = focusedSk.startsWith('M');
                            const sideA = isMens ? mA : wA;
                            const sideLabel = isMens ? "MEN'S" : "WOMEN'S";
                            const sideName = sideA.tmName || "— OPEN —";
                            return (
                              <div style={{ padding: "11px 15px 7px 15px", display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: sideA.tmName ? accent : "rgba(0,0,0,0.06)", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: sideA.tmName ? "inset 0 1px 0 rgba(255,255,255,0.25)" : "none" }}>
                                    {sideA.tmName ? sideA.tmName[0].toUpperCase() : "–"}
                                  </div>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.1px", color: accent, textTransform: "uppercase" }}>{def.label} · {sideLabel}</div>
                                    <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.2px", color: "#111", fontFamily: "var(--font-bricolage, var(--font-atkinson))", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sideName}</div>
                                    {(sideA.hours || sideA.pool) && (
                                      <div style={{ fontSize: 10, color: "#8E8E93", fontFamily: "var(--font-jetbrains, monospace)", marginTop: 1 }}>
                                        {sideA.hours ?? "11p–7a"} · {sideA.pool ?? "Full"}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div style={{ textAlign: "right", flexShrink: 0, marginRight: 24 }}>
                                  <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: "1px", color: "#6C6C72", textTransform: "uppercase" }}>BREAK GROUP</div>
                                  <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                    <div style={{ marginTop: 2, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, background: `linear-gradient(180deg, ${accent}cc, ${accent}88)`, border: `1px solid ${accent}`, color: "#fff", fontSize: 15, fontWeight: 800, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25)` }}>
                                      {sideA.breakGroup ?? mA.breakGroup ?? wA.breakGroup ?? "—"}
                                    </div>
                                    {(sideA.breakGroup ?? mA.breakGroup ?? wA.breakGroup) != null && setBreakGroupForSlot && (
                                      <div
                                        onClick={(e) => { e.stopPropagation(); setBreakGroupForSlot(focusedSk, 0); }}
                                        style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: 4 }}
                                        title="Clear break group"
                                      >
                                        <span style={{ fontSize: 9, color: '#666', lineHeight: 1 }}>×</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 10px" }} />

                          <div style={{ padding: "7px 12px 5px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "#6C6C72" }}>TASKS</span>
                            <button onClick={() => { onGenderClick?.(focusedSk); setDashSlotKey(null); }} style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.2px", padding: "2px 6px", borderRadius: 6, background: "rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.65)" }}>sweeper</button>
                          </div>

                          {/* Ability to add TM on blank cards (per side) — uses focusedSk (dashSlotKey side or sensible default) so WRR +Add persists to womens */}
                          {!(( focusedSk.startsWith('M') ? mA : wA).tmName) && (
                            <div style={{ padding: "5px 12px 7px", background: "rgba(0,0,0,0.02)", borderTop: "1px solid rgba(0,0,0,0.05)", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                              <button
                                onClick={() => { onGenderClick?.(focusedSk); setDashSlotKey(null); }}
                                style={{
                                  width: "100%",
                                  padding: "6px 8px",
                                  borderRadius: 8,
                                  background: accent,
                                  color: "#fff",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  border: "none",
                                  cursor: "pointer",
                                  fontFamily: "var(--font-atkinson)",
                                }}
                              >
                                + Add / Assign TM (this side)
                              </button>
                            </div>
                          )}

                          {/* History sections only for assigned TMs (per side) */}
                          {(( focusedSk.startsWith('M') ? mA : wA).tmName) && (
                            <>
                              {/* Matrix + last 5 + insights — same premium treatment */}
                              <div style={{ padding: "5px 12px 7px" }}>
                                <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", color: "#6C6C72", marginBottom: 4 }}>PLACEMENT MATRIX</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  {/* Simple red ring icon matching the screenshot (red border, white fill, small red center dot) — larger */}
                                  <div style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    border: `3px solid ${accent}`,
                                    background: 'white',
                                    position: 'relative',
                                    flexShrink: 0,
                                  }}>
                                    <div style={{
                                      width: 10,
                                      height: 10,
                                      borderRadius: '50%',
                                      background: accent,
                                      position: 'absolute',
                                      top: '50%',
                                      left: '50%',
                                      transform: 'translate(-50%, -50%)',
                                    }} />
                                  </div>
                                  <div style={{ fontSize: 9.5, lineHeight: 1.15 }}>
                                    <div style={{ color: "#6C6C72", fontSize: 7.5 }}>LAST 14 PLACEMENTS</div>
                                    <div style={{ display: "flex", gap: 8, marginTop: 2, fontFamily: "var(--font-jetbrains, monospace)" }}>
                                      <span style={{ color: accent, fontWeight: 700 }}>RR <span style={{ color: "#111" }}>{(() => {
                                        const curIso = `${selectedDay.date.getFullYear()}-${String(selectedDay.date.getMonth()+1).padStart(2,'0')}-${String(selectedDay.date.getDate()).padStart(2,'0')}`;
                                        let r = 0; const dh = dashHistory; if (dh?.zoneDates) Object.entries(dh.zoneDates).forEach(([ui,ds]) => { if ((ui.startsWith('MRR')||ui.startsWith('WRR')) && ds.some(d=>d<curIso)) r += ds.filter(d=>d<curIso).length; }); return r;
                                      })()}</span></span>
                                      <span style={{ color: "#8E8E93", fontWeight: 700 }}>ZONE <span style={{ color: "#111" }}>{(() => {
                                        const curIso = `${selectedDay.date.getFullYear()}-${String(selectedDay.date.getMonth()+1).padStart(2,'0')}-${String(selectedDay.date.getDate()).padStart(2,'0')}`;
                                        let z = 0; const dh = dashHistory; if (dh?.zoneDates) Object.entries(dh.zoneDates).forEach(([ui,ds]) => { if (/^Z\d+$/.test(ui) && ds.some(d=>d<curIso)) z += ds.filter(d=>d<curIso).length; }); return z;
                                      })()}</span></span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* LAST 14 PLACEMENTS GRID — full, same as zone (eligible RR sides, no support, T1/T2, prior filter, equal width colored pills) */}
                              <div style={{ padding: "5px 12px 7px" }}>
                                <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: "0.6px", color: "#6C6C72", marginBottom: 3 }}>LAST 14 PLACEMENTS</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                  {(() => {
                                    const localSideKey = focusedSk;
                                    const dashA = displayAssignments[dashSlotKey] || (localSideKey.startsWith('M') ? mA : wA);
                                    const tmId = dashA?.tmId;
                                    const rawGender = members?.find((m: any) => (m.id === tmId || m.tmId === tmId || m.tm_id === tmId))?.gender ?? null;
                                    const g = (() => {
                                      const s = String(rawGender || '').toUpperCase().trim();
                                      if (s === 'F' || s === 'FEMALE' || s.startsWith('F')) return 'F';
                                      if (s === 'M' || s === 'MALE' || s.startsWith('M')) return 'M';
                                      return '';
                                    })();
                                    const locs: { ui: string; label: string }[] = [
                                      ...ZONE_DEFS.map((d) => ({ ui: d.key, label: d.key })),
                                      ...RR_DEFS.flatMap((d) => {
                                        const sides: { ui: string; label: string }[] = [];
                                        if (!g || g === 'M') sides.push({ ui: `MRR${d.num}`, label: `RR${d.num}M` });
                                        if (!g || g === 'F') sides.push({ ui: `WRR${d.num}`, label: `RR${d.num}W` });
                                        return sides;
                                      }),
                                      ...auxDefs.filter((d) => !d.key.startsWith('SP')).map((d) => {
                                        let label = d.label || d.key;
                                        if (d.key.startsWith('TR')) { const num = d.key.replace(/\D/g, ''); label = `T${num}`; }
                                        return { ui: d.key, label };
                                      }),
                                    ];
                                    const currentIso = `${selectedDay.date.getFullYear()}-${String(selectedDay.date.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.date.getDate()).padStart(2, '0')}`;
                                    let effectiveCounts: Record<string, number> = {};
                                    if (dashHistory?.zoneDates) {
                                      for (const [z, ds] of Object.entries(dashHistory.zoneDates)) {
                                        const prior = (ds || []).filter((d: string) => d < currentIso);
                                        if (prior.length > 0) effectiveCounts[z] = prior.length;
                                      }
                                    } else {
                                      effectiveCounts = dashHistory?.zoneCounts || {};
                                    }
                                    const placed = new Set(Object.keys(effectiveCounts));
                                    const getPillAccent = (ui: string): string => {
                                      if (/^Z\d+$/.test(ui)) return getZoneColor(ui);
                                      if (ui.startsWith('MRR') || ui.startsWith('WRR')) {
                                        const num = parseInt(ui.replace(/\D/g, ''), 10) || 1;
                                        return getRRAccent(num);
                                      }
                                      return getAuxAccent(ui);
                                    };
                                    return locs.map((loc, idx) => {
                                      const was = placed.has(loc.ui);
                                      const locAccent = getPillAccent(loc.ui);
                                      return (
                                        <span
                                          key={idx}
                                          style={{
                                            width: "40px",
                                            textAlign: "center",
                                            whiteSpace: "nowrap",
                                            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                                            background: was ? `${locAccent}33` : "transparent",
                                            border: was ? `1px solid ${locAccent}` : "1px solid #ccc",
                                            color: was ? locAccent : "#666",
                                            fontFamily: "var(--font-jetbrains, monospace)",
                                            boxSizing: "border-box",
                                          }}
                                          title={loc.ui}
                                        >
                                          {loc.label}
                                        </span>
                                      );
                                    });
                                  })()}
                                </div>
                              </div>

                              <div style={{ padding: "5px 12px 7px", background: "rgba(0,0,0,0.02)", borderTop: "1px solid rgba(0,0,0,0.05)", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                                <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: "0.6px", color: "#6C6C72", marginBottom: 3 }}>LAST 5 PLACEMENTS</div>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  {(() => {
                                    let pills: string[] = ["Z2", "RR"];
                                    if (dashHistory && dashSlotKey && (dashSlotKey === mKey || dashSlotKey === wKey || dashSlotKey.startsWith('MRR') || dashSlotKey.startsWith('WRR')) && dashHistory.zoneDates) {
                                      const currentIso = `${selectedDay.date.getFullYear()}-${String(selectedDay.date.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.date.getDate()).padStart(2, '0')}`;
                                      const filteredDates: Record<string, string[]> = {};
                                      for (const [ui, ds] of Object.entries(dashHistory.zoneDates)) {
                                        const prior = (ds || []).filter((d: string) => d < currentIso);
                                        if (prior.length) filteredDates[ui] = prior;
                                      }
                                      const sorted = Object.entries(filteredDates)
                                        .map(([ui, dates]) => ({ ui, latest: dates.sort().reverse()[0] || '' }))
                                        .sort((a, b) => b.latest.localeCompare(a.latest));
                                      pills = sorted.slice(0, 5).map(({ ui }) => {
                                        if (ui.startsWith('MRR')) return ui.replace('MRR', 'RR') + 'M';
                                        if (ui.startsWith('WRR')) return ui.replace('WRR', 'RR') + 'W';
                                        if (ui.startsWith('TR')) return ui.replace('TR', 'TRASH');
                                        if (ui.startsWith('SP')) return ui.replace('SP', 'SUPPORT');
                                        return ui;
                                      });
                                    }
                                    const getColorForPill = (label: string): string => {
                                      if (label.includes('RR')) {
                                        const num = parseInt(label.replace(/\D/g, ''), 10) || 1;
                                        return getRRAccent(num);
                                      }
                                      if (/^Z\d+$/.test(label)) return getZoneColor(label);
                                      if (label.includes('Z9SR') || label.includes('SR')) return getAuxAccent('Z9SR');
                                      if (label.includes('TRASH')) return getAuxAccent('TR1');
                                      if (label.includes('SUPPORT')) return getAuxAccent('SP1');
                                      return accent;
                                    };
                                    return pills.map((b, i) => {
                                      const pAccent = getColorForPill(b);
                                      const bg = `${pAccent}22`;
                                      const border = `${pAccent}44`;
                                      const col = pAccent;
                                      return (
                                        <span key={i} style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: bg, border: `1px solid ${border}`, color: col, fontFamily: "var(--font-jetbrains, monospace)" }}>{b}</span>
                                      );
                                    });
                                  })()}
                                </div>
                                <div style={{ fontSize: 7, color: "#8E8E93", marginTop: 2 }}>NOT RECENTLY PLACED</div>
                              </div>

                              <div style={{ padding: "6px 12px 7px" }}>
                                <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", color: "#6C6C72", marginBottom: 2 }}>INSIGHTS</div>
                                <div style={{ fontSize: 10, lineHeight: 1.25, color: "#2F2F2D" }}>
                                  {(() => {
                                    const sk = focusedSk;
                                    const sa = sk.startsWith('M') ? mA : wA;
                                    return sa.provenance?.rationale || "Per-side fairness for restroom coverage.";
                                  })()}
                                </div>
                              </div>
                            </>
                          )}

                          <div style={{ display: "flex", gap: 4, padding: "4px 6px 6px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                            {/* All actions target the currently focused side in this dash (prevents cross-side overwrite bugs on add/refresh). focusedSk guarantees WRR when womens side active. */}
                            <button onClick={() => { onGenderClick?.(focusedSk); setDashSlotKey(null); }} style={{ flex: 1, height: 26, borderRadius: 8, fontSize: 9.5, fontWeight: 700, background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.75)" }}>Lock</button>
                            <button onClick={() => { onLiveUnassign?.(focusedSk); setDashSlotKey(null); }} style={{ flex: 1, height: 26, borderRadius: 8, fontSize: 9.5, fontWeight: 700, background: "rgba(229,57,53,0.15)", border: "1px solid rgba(229,57,53,0.4)", color: "#E53935" }}>Clear</button>
                            <button onClick={() => { onGenderClick?.(focusedSk); setDashSlotKey(null); }} style={{ flex: 1, height: 26, borderRadius: 8, fontSize: 9.5, fontWeight: 700, background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.75)" }}>Coverage</button>
                            <button onClick={() => { onGenderClick?.(focusedSk); setDashSlotKey(null); }} style={{ flex: 1, height: 26, borderRadius: 8, fontSize: 9.5, fontWeight: 700, background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.75)" }}>Swap</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
                className="grid gap-1.5 flex-1"
                style={{
                  gridTemplateColumns: `repeat(${auxDefs.length}, minmax(0, 1fr))`,
                  gridAutoRows: "minmax(0, 1fr)",
                }}
              >
                {auxDefs.map((def) => {
                  const key = def.key;
                  const isDashed = dashSlotKey === key;
                  const accent = getAuxAccent(key);
                  const a = displayAssignments[key] || {};
                  const prov = a.provenance || {};
                  const hasProv = prov.rationale || prov.fairnessSignals;

                  return (
                    <div key={key} className="relative h-full" data-slot-key={key}>
                      <AuxCard
                        def={def}
                        assignments={displayAssignments}
                        selectedTasks={selectedTasks}
                        setBreakGroupForSlot={setBreakGroupForSlot}
                        onCardClick={handleCardClickForDash}
                        loading={loadingAssignments}
                        borderColor={cardBorders[key]}
                        isDraftMode={isDraftMode}
                        draftInfo={draftAssignments[key]}
                        onRemoveTask={onRemoveTask}
                        onSetTaskColor={onSetTaskColor}
                        onEditTask={onEditTask}
                        isLocked={isCurrentNightLocked}
                        onLiveAssign={onLiveAssign}
                        onLiveUnassign={onLiveUnassign}
                      />
                      {isDashed && (
                        <div
                          className="placement-dash absolute bottom-0 left-full ml-1.5 w-[268px] z-[60] overflow-hidden flex flex-col"
                          style={{
                            borderRadius: 16,
                            background: "rgba(255,255,255,0.98)",
                            border: "1px solid rgba(0,0,0,0.08)",
                            boxShadow: "0 20px 48px -16px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.75)",
                            maxWidth: '268px',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {/* Left accent rail + soft glow (bottom-pinned for aux: opposite of zones' top pin down) */}
                          <div style={{ position: "absolute", bottom: 12, left: -1, width: 3, height: 44, borderRadius: "0 3px 3px 0", background: accent, boxShadow: `0 0 12px ${accent}77` }} />
                          {/* Unilateral tail/pointer (bottom-pinned so attachment near card bottom, dash extends upward) */}
                          <div style={{ position: "absolute", left: "-7px", bottom: "20px", width: 0, height: 0, borderTop: "5px solid transparent", borderBottom: "5px solid transparent", borderRight: "6px solid rgba(0,0,0,0.08)" }} />

                          <button onClick={() => setDashSlotKey(null)} style={{ position: "absolute", bottom: 8, right: 8, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.08)", display: "flex", alignItems: "center", justifyContent: "center", color: "#8E8E93", fontSize: 13, cursor: "pointer" }}>×</button>

                          {/* AUX header — premium avatar style (taller, larger comps) */}
                          <div style={{ padding: "11px 15px 7px 15px", display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                              <div style={{ width: 28, height: 28, borderRadius: "50%", background: a.tmName ? accent : "rgba(0,0,0,0.06)", color: "#fff", fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: a.tmName ? "inset 0 1px 0 rgba(255,255,255,0.25)" : "none" }}>
                                {a.tmName ? a.tmName[0].toUpperCase() : "–"}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "1.1px", color: accent, textTransform: "uppercase" }}>{def.label}</div>
                                <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: "-0.2px", color: "#111", fontFamily: "var(--font-bricolage, var(--font-atkinson))", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.tmName || "— Unassigned —"}</div>
                                {(a.hours || a.pool) && (
                                  <div style={{ fontSize: 10, color: "#8E8E93", fontFamily: "var(--font-jetbrains, monospace)", marginTop: 1 }}>
                                    {a.hours ?? "11p–7a"} · {a.pool ?? "Full"}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ textAlign: "right", flexShrink: 0, marginRight: 24 }}>
                              <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: "1px", color: "#6C6C72", textTransform: "uppercase" }}>BREAK GROUP</div>
                              <div style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                                <div style={{ marginTop: 2, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, background: `linear-gradient(180deg, ${accent}cc, ${accent}88)`, border: `1px solid ${accent}`, color: "#fff", fontSize: 15, fontWeight: 800, boxShadow: `inset 0 1px 0 rgba(255,255,255,0.25)` }}>
                                  {a.breakGroup ?? "—"}
                                </div>
                                {a.breakGroup != null && setBreakGroupForSlot && (
                                  <div
                                    onClick={(e) => { e.stopPropagation(); setBreakGroupForSlot(key, 0); }}
                                    style={{ width: 14, height: 14, borderRadius: '50%', background: 'rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginLeft: 4 }}
                                    title="Clear break group"
                                  >
                                    <span style={{ fontSize: 9, color: '#666', lineHeight: 1 }}>×</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div style={{ height: 1, background: "rgba(0,0,0,0.06)", margin: "0 10px" }} />

                          <div style={{ padding: "7px 12px 5px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.8px", textTransform: "uppercase", color: "#6C6C72" }}>TASKS</span>
                            <button onClick={() => { onCardClick?.(key); setDashSlotKey(null); }} style={{ fontSize: 8, fontWeight: 700, letterSpacing: "0.2px", padding: "2px 6px", borderRadius: 6, background: "rgba(0,0,0,0.06)", border: "1px solid rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.65)" }}>sweeper</button>
                          </div>

                          {/* Ability to add TM on blank cards */}
                          {!a.tmName && (
                            <div style={{ padding: "5px 12px 7px", background: "rgba(0,0,0,0.02)", borderTop: "1px solid rgba(0,0,0,0.05)", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                              <button
                                onClick={() => { onCardClick?.(key); setDashSlotKey(null); }}
                                style={{
                                  width: "100%",
                                  padding: "6px 8px",
                                  borderRadius: 8,
                                  background: accent,
                                  color: "#fff",
                                  fontSize: 10,
                                  fontWeight: 700,
                                  border: "none",
                                  cursor: "pointer",
                                  fontFamily: "var(--font-atkinson)",
                                }}
                              >
                                + Add / Assign TM
                              </button>
                            </div>
                          )}

                          {/* History sections only for assigned TMs */}
                          {a.tmName && (
                            <>
                              <div style={{ padding: "5px 12px 7px" }}>
                                <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", color: "#6C6C72", marginBottom: 4 }}>PLACEMENT MATRIX</div>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  {/* Simple red ring icon matching the screenshot (red border, white fill, small red center dot) — larger */}
                                  <div style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: '50%',
                                    border: `3px solid ${accent}`,
                                    background: 'white',
                                    position: 'relative',
                                    flexShrink: 0,
                                  }}>
                                    <div style={{
                                      width: 10,
                                      height: 10,
                                      borderRadius: '50%',
                                      background: accent,
                                      position: 'absolute',
                                      top: '50%',
                                      left: '50%',
                                      transform: 'translate(-50%, -50%)',
                                    }} />
                                  </div>
                                  <div style={{ fontSize: 9.5, lineHeight: 1.15 }}>
                                    <div style={{ color: "#6C6C72", fontSize: 7.5 }}>LAST 14 PLACEMENTS</div>
                                    <div style={{ display: "flex", gap: 8, marginTop: 2, fontFamily: "var(--font-jetbrains, monospace)" }}>
                                      <span style={{ color: accent, fontWeight: 700 }}>AUX <span style={{ color: "#111" }}>{(() => {
                                        const curIso = `${selectedDay.date.getFullYear()}-${String(selectedDay.date.getMonth()+1).padStart(2,'0')}-${String(selectedDay.date.getDate()).padStart(2,'0')}`;
                                        let a = 0; const dh = dashHistory; if (dh?.zoneDates) Object.entries(dh.zoneDates).forEach(([ui,ds]) => { if (!/^Z\d+$/.test(ui) && !(ui.startsWith('MRR')||ui.startsWith('WRR')) && ds.some(d=>d<curIso)) a += ds.filter(d=>d<curIso).length; }); return a;
                                      })()}</span></span>
                                      <span style={{ color: "#8E8E93", fontWeight: 700 }}>OTHER <span style={{ color: "#111" }}>{(() => {
                                        const curIso = `${selectedDay.date.getFullYear()}-${String(selectedDay.date.getMonth()+1).padStart(2,'0')}-${String(selectedDay.date.getDate()).padStart(2,'0')}`;
                                        let o = 0; const dh = dashHistory; if (dh?.zoneDates) Object.entries(dh.zoneDates).forEach(([ui,ds]) => { if (/^Z\d+$/.test(ui) && ds.some(d=>d<curIso)) o += ds.filter(d=>d<curIso).length; }); return o;
                                      })()}</span></span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* LAST 14 PLACEMENTS GRID — full, same as zone (no support, T1/T2, prior filter, equal width colored pills) */}
                              <div style={{ padding: "5px 12px 7px" }}>
                                <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: "0.6px", color: "#6C6C72", marginBottom: 3 }}>LAST 14 PLACEMENTS</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                                  {(() => {
                                    const locs: { ui: string; label: string }[] = [
                                      ...ZONE_DEFS.map((d) => ({ ui: d.key, label: d.key })),
                                      ...RR_DEFS.flatMap((d) => [
                                        { ui: `MRR${d.num}`, label: `RR${d.num}M` },
                                        { ui: `WRR${d.num}`, label: `RR${d.num}W` },
                                      ]),
                                      ...auxDefs.filter((d) => !d.key.startsWith('SP')).map((d) => {
                                        let label = d.label || d.key;
                                        if (d.key.startsWith('TR')) { const num = d.key.replace(/\D/g, ''); label = `T${num}`; }
                                        return { ui: d.key, label };
                                      }),
                                    ];
                                    const currentIso = `${selectedDay.date.getFullYear()}-${String(selectedDay.date.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.date.getDate()).padStart(2, '0')}`;
                                    let effectiveCounts: Record<string, number> = {};
                                    if (dashHistory?.zoneDates) {
                                      for (const [z, ds] of Object.entries(dashHistory.zoneDates)) {
                                        const prior = (ds || []).filter((d: string) => d < currentIso);
                                        if (prior.length > 0) effectiveCounts[z] = prior.length;
                                      }
                                    } else {
                                      effectiveCounts = dashHistory?.zoneCounts || {};
                                    }
                                    const placed = new Set(Object.keys(effectiveCounts));
                                    const getPillAccent = (ui: string): string => {
                                      if (/^Z\d+$/.test(ui)) return getZoneColor(ui);
                                      if (ui.startsWith('MRR') || ui.startsWith('WRR')) {
                                        const num = parseInt(ui.replace(/\D/g, ''), 10) || 1;
                                        return getRRAccent(num);
                                      }
                                      return getAuxAccent(ui);
                                    };
                                    return locs.map((loc, idx) => {
                                      const was = placed.has(loc.ui);
                                      const locAccent = getPillAccent(loc.ui);
                                      return (
                                        <span
                                          key={idx}
                                          style={{
                                            width: "40px",
                                            textAlign: "center",
                                            whiteSpace: "nowrap",
                                            fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                                            background: was ? `${locAccent}33` : "transparent",
                                            border: was ? `1px solid ${locAccent}` : "1px solid #ccc",
                                            color: was ? locAccent : "#666",
                                            fontFamily: "var(--font-jetbrains, monospace)",
                                            boxSizing: "border-box",
                                          }}
                                          title={loc.ui}
                                        >
                                          {loc.label}
                                        </span>
                                      );
                                    });
                                  })()}
                                </div>
                              </div>

                              <div style={{ padding: "5px 12px 7px", background: "rgba(0,0,0,0.02)", borderTop: "1px solid rgba(0,0,0,0.05)", borderBottom: "1px solid rgba(0,0,0,0.05)" }}>
                                <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: "0.6px", color: "#6C6C72", marginBottom: 3 }}>LAST 5 PLACEMENTS</div>
                                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                  {(() => {
                                    let pills: string[] = ["Z9", "AUX"];
                                    if (dashHistory && dashSlotKey === key && dashHistory.zoneDates) {
                                      const currentIso = `${selectedDay.date.getFullYear()}-${String(selectedDay.date.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.date.getDate()).padStart(2, '0')}`;
                                      const filteredDates: Record<string, string[]> = {};
                                      for (const [ui, ds] of Object.entries(dashHistory.zoneDates)) {
                                        const prior = (ds || []).filter((d: string) => d < currentIso);
                                        if (prior.length) filteredDates[ui] = prior;
                                      }
                                      const sorted = Object.entries(filteredDates)
                                        .map(([ui, dates]) => ({ ui, latest: dates.sort().reverse()[0] || '' }))
                                        .sort((a, b) => b.latest.localeCompare(a.latest));
                                      pills = sorted.slice(0, 5).map(({ ui }) => {
                                        if (ui.startsWith('MRR')) return ui.replace('MRR', 'RR') + 'M';
                                        if (ui.startsWith('WRR')) return ui.replace('WRR', 'RR') + 'W';
                                        if (ui.startsWith('TR')) return ui.replace('TR', 'TRASH');
                                        if (ui.startsWith('SP')) return ui.replace('SP', 'SUPPORT');
                                        return ui;
                                      });
                                    }
                                    const getColorForPill = (label: string): string => {
                                      if (label.includes('RR')) {
                                        const num = parseInt(label.replace(/\D/g, ''), 10) || 1;
                                        return getRRAccent(num);
                                      }
                                      if (/^Z\d+$/.test(label)) return getZoneColor(label);
                                      if (label.includes('Z9SR') || label.includes('SR')) return getAuxAccent('Z9SR');
                                      if (label.includes('TRASH')) return getAuxAccent('TR1');
                                      if (label.includes('SUPPORT')) return getAuxAccent('SP1');
                                      return accent;
                                    };
                                    return pills.map((b, i) => {
                                      const pAccent = getColorForPill(b);
                                      const bg = `${pAccent}22`;
                                      const border = `${pAccent}44`;
                                      const col = pAccent;
                                      return (
                                        <span key={i} style={{ fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4, background: bg, border: `1px solid ${border}`, color: col, fontFamily: "var(--font-jetbrains, monospace)" }}>{b}</span>
                                      );
                                    });
                                  })()}
                                </div>
                                <div style={{ fontSize: 7, color: "#8E8E93", marginTop: 2 }}>NOT RECENTLY PLACED</div>
                              </div>

                              <div style={{ padding: "6px 12px 7px" }}>
                                <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.7px", textTransform: "uppercase", color: "#6C6C72", marginBottom: 2 }}>INSIGHTS</div>
                                <div style={{ fontSize: 10, lineHeight: 1.25, color: "#2F2F2D" }}>
                                  {hasProv && prov.rationale ? prov.rationale : "Aux support placement per load + coverage."}
                                </div>
                                {prov.fairnessSignals && (
                                  <div style={{ marginTop: 4, display: "flex", gap: 6, fontSize: 8.5, color: "#5C4A2E", fontFamily: "var(--font-jetbrains, monospace)" }}>
                                    {Object.entries(prov.fairnessSignals).slice(0, 3).map(([k, v]) => {
                                      const lab = k.toLowerCase().includes("rot") ? "Rot" : k.toLowerCase().includes("aff") ? "Aff" : "Load";
                                      return <span key={k}>{lab} {Number(v).toFixed(1)}</span>;
                                    })}
                                  </div>
                                )}
                              </div>
                            </>
                          )}

                          <div style={{ display: "flex", gap: 4, padding: "4px 6px 6px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                            <button onClick={() => { onCardClick?.(key); setDashSlotKey(null); }} style={{ flex: 1, height: 26, borderRadius: 8, fontSize: 9.5, fontWeight: 700, background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.75)" }}>Lock</button>
                            <button onClick={() => { if (onLiveUnassign) onLiveUnassign(key); setDashSlotKey(null); }} style={{ flex: 1, height: 26, borderRadius: 8, fontSize: 9.5, fontWeight: 700, background: "rgba(229,57,53,0.15)", border: "1px solid rgba(229,57,53,0.4)", color: "#E53935" }}>Clear</button>
                            <button onClick={() => { onCardClick?.(key); setDashSlotKey(null); }} style={{ flex: 1, height: 26, borderRadius: 8, fontSize: 9.5, fontWeight: 700, background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.75)" }}>Coverage</button>
                            <button onClick={() => { onCardClick?.(key); setDashSlotKey(null); }} style={{ flex: 1, height: 26, borderRadius: 8, fontSize: 9.5, fontWeight: 700, background: "rgba(0,0,0,0.05)", border: "1px solid rgba(0,0,0,0.12)", color: "rgba(0,0,0,0.75)" }}>Swap</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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
