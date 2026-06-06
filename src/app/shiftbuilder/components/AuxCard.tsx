"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import {
  type BreakGroup, nextBreakGroup,
  getAuxAccent, getAuxIcon,
} from "@/lib/shiftbuilder/constants";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import { usePencilHover } from "@/lib/shiftbuilder/usePencilHover";
import { handleSpotlightMove } from "@/lib/shiftbuilder/spotlightMove";
import BreakBadge from "./BreakBadge";
import ZoneTaskList from "./ZoneTaskList";
import { PlacementFitChip } from "./PlacementFitChip";
import { AssignmentSkeleton, penHoverClass } from "./builderPrimitives";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import type { XaiFit } from "@/lib/shiftbuilder/placementPadInsightSchema";

/** AuxCard — Phase 1 Live layer prep (same pattern as ZoneCard / RRCard). */

export interface AuxCardProps {
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

  // Phase 1 Live optimistic layer
  onLiveAssign?: (uiKey: string, tmId: string, tmName: string) => void;
  onLiveUnassign?: (uiKey: string) => void;

  // Locked state for the night (disables interactions)
  isLocked?: boolean;
  fitChip?: PrerenderedPlacementFit | null;
  /** Optional xAI for corner magic one line surface. */
  xaiFitChip?: XaiFit;
  /** Builder mode flag for subtle digital-only UI sugar (e.g. empty card hints). */
  showDigitalAssists?: boolean;
}

const AuxCard: React.FC<AuxCardProps> = React.memo(({
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
  xaiFitChip,
  showDigitalAssists = false,
}) => {
  const a = assignments[def.key] || {};
  const currentBreak = (a.breakGroup ?? 0) as BreakGroup;
  const color = getAuxAccent(def.key);
  const cycleBreak = () => setBreakGroupForSlot(def.key, nextBreakGroup(currentBreak));
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(def.key, "aux", { tmId: a.tmId, tmName: a.tmName }, isLocked);

  // Phase 1 Live layer ready (onLive* props when wired).
  const icon = getAuxIcon(def.key);
  const isEmpty = !hasTM && !loading;
  const { isPenHovering, penHoverHandlers, clearLongHoverTimer } = usePencilHover(
    (el) => { if (!isLocked) onCardClick(def.key, el); },
  );

  return (
    <div
      ref={setRef}
      onClick={(e) => { if (!isLocked) onCardClick(def.key, e.currentTarget, e); }}
      onPointerMove={handleSpotlightMove}
      {...penHoverHandlers}
      {...(hasTM && !isLocked ? listeners : {})}
      {...(hasTM && !isLocked ? attributes : {})}
      data-slot-key={def.key}
      className={`assignment-card sb-assignment-card relative cursor-pointer flex flex-col h-full rounded-[3px] touch-none ${isOver ? "drop-target-active" : ""} ${isDragging ? "sb-dragging" : ""} ${isEmpty ? "empty sb-card-empty" : ""} ${penHoverClass(isPenHovering)}`}
      style={{
        ["--card-accent" as any]: color,
        ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
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
            style={{ fontSize: 10, fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
          >
            {def.label}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <PlacementFitChip fit={fitChip} xaiFit={xaiFitChip} />
          <BreakBadge value={currentBreak} onCycle={cycleBreak} />
        </div>
        {/* Explicit remove button for Aux slots (including Z9SR) so clearing is reliable and doesn't require drag or refresh */}
        {hasTM && !isLocked && onLiveUnassign && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLiveUnassign(def.key);
            }}
            className="ml-auto text-[#9CA3AF] hover:text-[#EF4444] leading-none"
            aria-label="Remove TM from slot"
            title="Clear this slot"
          >
            ×
          </button>
        )}
      </div>

      <div className="flex flex-col flex-1 px-2 pt-1.5 pb-1.5">
        {loading && !hasTM ? (
          <AssignmentSkeleton size="lg" />
        ) : isDraftMode && draftInfo ? (
          <div className="flex flex-col min-w-0">
            <span
              className="font-bold tracking-[-0.3px] text-[#111] dark:text-[#F2F2F4] truncate"
              style={{ fontSize: 18, lineHeight: 1.02, fontFamily: "var(--font-bricolage, var(--font-atkinson))" }}
            >
              {draftInfo.proposedTmName}
            </span>
            {draftInfo.previousTmName && (
              <span
                className="text-[9px] text-[#9CA3AF] line-through opacity-55 mt-px tracking-[0.2px]"
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
                <span className="ms shrink-0 text-[#FF9500]" aria-label="Locked" style={{ fontSize: 12, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}>lock</span>
              )}
              <span
                className="font-bold tracking-[-0.3px] text-[#111] dark:text-[#F2F2F4] truncate"
                style={{ fontSize: 20, lineHeight: 1.02, fontFamily: "var(--font-bricolage, var(--font-atkinson))" }}
              >
                {a.tmName}
              </span>
            </div>
            {/* Digital builder only: subliminal xAI magic one-line (the "headline" from pad analyst).
                Rendered as elegant digital ink annotation under the large Atkinson name — part of the cohesive authoring veil.
                no-print + showDigitalAssists gate ensures 0 height/metric change in print-preview or PDF clone; Golden fidelity pristine.
                Uses same refined ✧ mark as the corner chip for family language. Clicking anywhere on card (incl. this line) re-opens PlacementPad for fresh insight. */}
            {xaiFitChip?.headline && (
              <div
                className="no-print mt-px pl-1 border-l border-[#2F5C7C]/25 dark:border-[#5B8AA8]/25 text-[6px] text-[#2F5C7C] dark:text-[#5B8AA8] truncate font-normal tracking-[0.15px] leading-[1.1] flex items-center gap-1 opacity-90 hover:opacity-100 transition-opacity"
                style={{ fontFamily: "var(--font-atkinson, var(--font-ui, system-ui))" }}
                title={`xAI insight: ${xaiFitChip.headline}${xaiFitChip.fitSummary ? ` — ${xaiFitChip.fitSummary}` : ""}\n(Builder only; hidden in Preview/PDF. Click card to refine via PlacementPad.)`}
              >
                <span className="text-[#2F5C7C]/50 dark:text-[#5B8AA8]/60" style={{ fontSize: "5.5px", letterSpacing: "-0.1px" }}>✧</span>
                {xaiFitChip.headline}
              </div>
            )}
          </>
        ) : (
          <div className="unassigned-label mt-0.5 text-[#6B7280] dark:text-[#6C6C72] font-medium tracking-[0.3px] text-[10.5px]" style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}>
            — Unassigned —
            {showDigitalAssists && (
              <span className="no-print ml-1 text-[8px] text-[#2F5C7C]/35 tracking-normal">drop to assign</span>
            )}
          </div>
        )}

        <ZoneTaskList tasks={selectedTasks[def.key]} hasTM={hasTM} slotKey={def.key} onRemoveTask={onRemoveTask} onSetTaskColor={onSetTaskColor} onEditTask={onEditTask} />
      </div>
    </div>
  );
});

export default AuxCard;
