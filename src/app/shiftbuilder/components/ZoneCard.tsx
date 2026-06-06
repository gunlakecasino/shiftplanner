"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import {
  type BreakGroup, nextBreakGroup, COVERAGE_BAR_H,
  getZoneColor, ZONE_ICONS,
} from "@/lib/shiftbuilder/constants";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import { usePencilHover } from "@/lib/shiftbuilder/usePencilHover";
import { handleSpotlightMove } from "@/lib/shiftbuilder/spotlightMove";
import BreakBadge from "./BreakBadge";
import ZoneTaskList from "./ZoneTaskList";
import CoverageBar from "./CoverageBar";
import { PlacementFitChip } from "./PlacementFitChip";
import { AssignmentSkeleton, penHoverClass } from "./builderPrimitives";
import type { PrerenderedPlacementFit } from "./placementFitScore";

/**
 * ZoneCard (Phase 1 Live Cache migration)
 *
 * Mutation path update note:
 * - The dnd gesture wiring still comes from useSlotDnd (see its updated JSDoc).
 * - Preferred mutation functions (assign/unassign with full optimistic Query+Zustand
 *   updates, rollback on conflict, and realtime sync) now come from `useLiveAssignments`.
 * - Parent (ShiftBuilderClient) will pass `onLiveAssign`, `onLiveUnassign` etc.
 *   wired to the new hook. Old direct paths are being migrated surgically.
 *
 * See liveCache.ts, useLiveAssignments.ts, and the updated useSlotDnd.ts.
 * Draft Mode safety is preserved in the caller.
 */
export interface ZoneCardProps {
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
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;

  // Phase 1 Live optimistic layer (preferred for assign/unassign)
  onLiveAssign?: (uiKey: string, tmId: string, tmName: string) => void;
  onLiveUnassign?: (uiKey: string) => void;

  /** When true, the entire card is read-only (no drag, no drop, no editing) */
  isLocked?: boolean;
  /** Screen-only rotation fit chip (excluded from print). */
  fitChip?: PrerenderedPlacementFit | null;
  /** Builder mode flag for subtle digital-only UI sugar (e.g. empty card hints). No effect on print. */
  showDigitalAssists?: boolean;

  /** Weekly Overview focus: when provided, this card dims if its TM does not match, or highlights if it does. */
  focusedTmId?: string | null;
}

const ZoneCard: React.FC<ZoneCardProps> = React.memo(({
  def,
  assignments,
  selectedTasks,
  setBreakGroupForSlot,
  onCardClick,
  loading = false,
  borderColor,
  isDraftMode = false,
  draftInfo,
  onRemoveTask,
  onSetTaskColor,
  onEditTask,
  onLiveAssign,
  onLiveUnassign,
  isLocked = false,
  fitChip,
  showDigitalAssists = false,
  focusedTmId,
}) => {
  const a = assignments[def.key] || {};
  const currentBreak = (a.breakGroup ?? 0) as BreakGroup;
  const color = getZoneColor(def.key);
  const cycleBreak = () => setBreakGroupForSlot(def.key, nextBreakGroup(currentBreak));
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(def.key, "zone", { tmId: a.tmId, tmName: a.tmName }, isLocked);

  // Phase 1 note: When onLiveAssign / onLiveUnassign are provided by parent,
  // they should be called from drag handlers / quick actions instead of (or in
  // addition to) the legacy direct setAssignments + persistAssign path.
  // The optimistic work (Query + Zustand + rollback) happens inside useLiveAssignments.

  const icon = ZONE_ICONS[def.key] ?? "●";
  const isEmpty = !hasTM && !loading;
  const currentTmId = a?.tmId;
  const isFocused = !!focusedTmId && currentTmId === focusedTmId;
  const isDimmed = !!focusedTmId && currentTmId !== focusedTmId;
  const { isPenHovering, penHoverHandlers, clearLongHoverTimer } = usePencilHover(
    (el) => { if (!isLocked) onCardClick(def.key, el); },
  );

  const zoneCoverageTasks = (selectedTasks[def.key] || []).filter(t => t.isCoverage);
  // +6 gap above the first coverage bar so it breathes away from task list text
  const coverageBodyPb = zoneCoverageTasks.length > 0
    ? zoneCoverageTasks.length * COVERAGE_BAR_H + 8
    : 6;

  return (
    <div
      ref={setRef}
      onClick={(e) => { if (!isLocked) onCardClick(def.key, e.currentTarget, e); }}
      onPointerMove={handleSpotlightMove}
      {...penHoverHandlers}
      {...(hasTM && !isLocked ? listeners : {})}
      {...(hasTM && !isLocked ? attributes : {})}

      data-slot-key={def.key}
      className={`assignment-card sb-assignment-card relative overflow-hidden cursor-pointer flex flex-col h-full rounded-[3px] touch-none ${isOver ? "drop-target-active" : ""} ${isDragging ? "sb-dragging" : ""} ${isEmpty ? "empty sb-card-empty" : ""} ${penHoverClass(isPenHovering)} ${isDimmed ? "sb-weekly-dim" : ""} ${isFocused ? "sb-weekly-highlight" : ""}`}
      style={{
        ["--card-accent" as any]: color,
        ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
      }}
    >
      {/* Colored top stripe */}
      <div className="h-[3px] w-full shrink-0" style={{ background: color }} />

      {/* Header: icon + label + break badge */}
      <div
        className="flex items-start justify-between gap-1 px-2 pt-1 pb-1"
        style={{ borderBottom: `1px solid ${color}33` }}
      >
        <div className="flex items-center gap-1 leading-none" style={{ color }}>
          <span className="text-[11px] leading-none">{icon}</span>
          <span
            className="font-extrabold tracking-[0.4px] uppercase"
            style={{ fontSize: 10.5, fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
          >
            {def.label}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <PlacementFitChip fit={fitChip} />
          <BreakBadge value={currentBreak} onCycle={cycleBreak} />
        </div>
      </div>

      {/* Body: large TM name + optional location lines */}
      <div className="flex flex-col flex-1 px-2 pt-1.5" style={{ paddingBottom: coverageBodyPb }}>
        {loading && !hasTM ? (
          <AssignmentSkeleton size="xl" />
        ) : isDraftMode && draftInfo ? (
          <div className="flex flex-col min-w-0">
            <span
              className="font-bold tracking-[-0.4px] text-[#111] dark:text-[#F2F2F4] truncate"
              style={{ fontSize: 20, lineHeight: 1.02, fontFamily: "var(--font-bricolage, var(--font-atkinson))" }}
            >
              {draftInfo.proposedTmName}
            </span>
            {draftInfo.previousTmName && (
              <span
                className="text-[9.5px] text-[#9CA3AF] line-through opacity-60 mt-0.5 tracking-[0.2px]"
                style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
              >
                was: {draftInfo.previousTmName}
              </span>
            )}
          </div>
        ) : hasTM ? (
          <>
            <div className="flex items-center gap-1 min-w-0">
              {a.isLocked && (
                <span className="ms shrink-0 text-[#FF9500]" aria-label="Locked" style={{ fontSize: 13, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}>lock</span>
              )}
              <span
                className="font-bold tracking-[-0.4px] text-[#111] dark:text-[#F2F2F4] truncate"
                style={{ fontSize: 22, lineHeight: 1.02, fontFamily: "var(--font-bricolage, var(--font-atkinson))" }}
              >
                {a.tmName}
              </span>
            </div>
          </>
        ) : (
          <div className="unassigned-label mt-0.5 text-[#6B7280] dark:text-[#6C6C72] font-medium tracking-[0.3px] text-[10.5px]" style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}>
            — Unassigned —
            {showDigitalAssists && (
              <span className="no-print ml-1 text-[8px] text-[#2F5C7C]/35 tracking-normal">drop to assign</span>
            )}
          </div>
        )}

        <ZoneTaskList
          tasks={(selectedTasks[def.key] || []).filter(t => !t.isCoverage)}
          hasTM={hasTM}
          slotKey={def.key}
          onRemoveTask={onRemoveTask}
          onSetTaskColor={onSetTaskColor}
          onEditTask={onEditTask}
        />
      </div>
      {/* Coverage bars span full card width */}
      {(selectedTasks[def.key] || [])
        .filter(t => t.isCoverage)
        .map(t => (
          <CoverageBar key={t.id} task={t} slotKey={def.key} onRemoveTask={onRemoveTask} />
        ))
      }
    </div>
  );
});

export default ZoneCard;
