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
  onRemoveTask,
  onSetTaskColor,
  onEditTask,
}) => {
  const a = assignments[def.key] || {};
  const currentBreak = (a.breakGroup ?? 0) as BreakGroup;
  const color = getZoneColor(def.key);
  const cycleBreak = () => setBreakGroupForSlot(def.key, nextBreakGroup(currentBreak));
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(def.key, "zone", { tmId: a.tmId, tmName: a.tmName });

  const icon = ZONE_ICONS[def.key] ?? "●";
  const isEmpty = !hasTM && !loading;
  const { isPenHovering, penHoverHandlers, clearLongHoverTimer } = usePencilHover(
    (el) => onCardClick(def.key, el),
  );

  const zoneCoverageTasks = (selectedTasks[def.key] || []).filter(t => t.isCoverage);
  const coverageBodyPb = zoneCoverageTasks.length > 0
    ? zoneCoverageTasks.length * COVERAGE_BAR_H + 2
    : 6;

  return (
    <div
      ref={setRef}
      onClick={(e) => onCardClick(def.key, e.currentTarget, e)}
      onPointerMove={handleSpotlightMove}
      {...penHoverHandlers}
      {...(hasTM ? listeners : {})}
      {...(hasTM ? attributes : {})}
      onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
        clearLongHoverTimer();
        if (hasTM && (listeners as any)?.onPointerDown) {
          (listeners as any).onPointerDown(e);
        }
      }}
      data-slot-key={def.key}
      className={`assignment-card relative overflow-hidden cursor-pointer flex flex-col rounded-[3px] transition-all touch-none ${isOver ? "drop-target-active" : ""} ${isDragging ? "opacity-30" : ""} ${isEmpty ? "empty" : ""} ${isPenHovering ? "ring-2 ring-[#FFD60A] ring-offset-1 animate-pulse" : ""}`}
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
        <BreakBadge value={currentBreak} onCycle={cycleBreak} />
      </div>

      {/* Body: large TM name + optional location lines */}
      <div className="flex flex-col flex-1 px-2 pt-1.5" style={{ paddingBottom: coverageBodyPb }}>
        {loading && !hasTM ? (
          <div className="h-[18px] w-3/4 rounded-sm bg-[#E5E5E7] animate-pulse" />
        ) : isDraftMode && draftInfo ? (
          <div className="flex flex-col min-w-0">
            <span
              className="font-bold tracking-[-0.4px] text-[#111] dark:text-[#F2F2F4] truncate"
              style={{ fontSize: 19, lineHeight: 1.02, fontFamily: "var(--font-bricolage, var(--font-atkinson))" }}
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
          <div className="flex items-center gap-1 min-w-0">
            {a.isLocked && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="text-[#FF9500] shrink-0" aria-label="Locked">
                <path d="M6 10V7a6 6 0 1 1 12 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1zm2 0h8V7a4 4 0 0 0-8 0v3z" />
              </svg>
            )}
            <span
              className="font-bold tracking-[-0.4px] text-[#111] dark:text-[#F2F2F4] truncate"
              style={{ fontSize: 21, lineHeight: 1.02, fontFamily: "var(--font-bricolage, var(--font-atkinson))" }}
            >
              {a.tmName}
            </span>
          </div>
        ) : (
          <div className="unassigned-label mt-0.5 text-[#6B7280] dark:text-[#6C6C72] font-medium tracking-[0.3px] text-[10.5px]" style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}>
            — Unassigned —
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
};

export default ZoneCard;
