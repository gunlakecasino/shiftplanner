"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import {
  type BreakGroup, nextBreakGroup, COVERAGE_BAR_H,
  getRRAccent, RR_ICONS,
} from "@/lib/shiftbuilder/constants";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import { usePencilHover } from "@/lib/shiftbuilder/usePencilHover";
import { handleSpotlightMove } from "@/lib/shiftbuilder/spotlightMove";
import BreakBadge from "./BreakBadge";
import TaskRow from "./TaskRow";
import CoverageBar from "./CoverageBar";

export interface RRCardProps {
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
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
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
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;
}> = ({ slotKey, label, assignment, tasks, setBreakGroupForSlot, onClick, loading = false, onRemoveTask, onSetTaskColor, onEditTask }) => {
  const a = assignment || {};
  const breakNum = (a.breakGroup ?? 0) as BreakGroup;
  const cycle = () => setBreakGroupForSlot(slotKey, nextBreakGroup(breakNum));
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(slotKey, "rr", { tmId: a.tmId, tmName: a.tmName });
  const dim = !hasTM && !loading;
  const { isPenHovering, penHoverHandlers, clearLongHoverTimer } = usePencilHover(
    (el) => onClick(slotKey, el),
  );

  return (
    <div
      ref={setRef}
      onClick={(e) => onClick(slotKey, e.currentTarget, e)}
      {...penHoverHandlers}
      {...(hasTM ? listeners : {})}
      {...(hasTM ? attributes : {})}
      onPointerDown={(e: React.PointerEvent<HTMLDivElement>) => {
        clearLongHoverTimer();
        if (hasTM && (listeners as any)?.onPointerDown) {
          (listeners as any).onPointerDown(e);
        }
      }}
      data-slot-key={slotKey}
      className={`flex flex-col cursor-pointer rounded-[2px] transition-opacity touch-none ${isOver ? "drop-target-active" : ""} ${isDragging ? "opacity-30" : ""} ${dim ? "opacity-60" : ""} ${isPenHovering ? "ring-2 ring-[#FFD60A] ring-offset-1 animate-pulse" : ""}`}
    >
      {/* Label + badge row */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] font-bold tracking-[0.5px] text-[#1C1C1E]" style={{ fontFamily: 'var(--font-atkinson)' }}>{label}</span>
        <BreakBadge value={breakNum} onCycle={cycle} size="sm" />
      </div>
      {/* Name immediately under label */}
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
              className="font-bold tracking-[-0.2px] text-[#111] dark:text-[#F2F2F4] truncate"
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
      {/* Per-side selected tasks */}
      {tasks && tasks.length > 0 && (
        <div
          className={`mt-0.5 text-[9.5px] leading-[1.25] ${hasTM ? "text-[#6B7280]" : "text-[#9CA3AF]"}`}
          style={{ fontFamily: "var(--font-atkinson)" }}
        >
          {tasks.map((t) => (
            <TaskRow
              key={t.id}
              task={t}
              slotKey={slotKey}
              onRemoveTask={onRemoveTask}
              onSetTaskColor={onSetTaskColor}
              onEditTask={onEditTask}
              textSize="text-[9.5px]"
              textColorClass={hasTM ? "text-[#374151] dark:text-[#C7C7CC]" : "text-[#6B7280] dark:text-[#636366]"}
            />
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
  onRemoveTask,
  onSetTaskColor,
  onEditTask,
}) => {
  const mKey = `MRR${def.num}`;
  const wKey = `WRR${def.num}`;
  const color = getRRAccent(def.num);
  const icon = RR_ICONS[def.num] ?? "●";
  const mEmpty = !assignments[mKey]?.tmName;
  const wEmpty = !assignments[wKey]?.tmName;
  const bothEmpty = mEmpty && wEmpty && !loading;

  // Separate coverage tasks from regular tasks so coverage bars span the full
  // card width rather than sitting inside one narrow gender column.
  const mTasks = selectedTasks[mKey] || [];
  const wTasks = selectedTasks[wKey] || [];
  const mRegular = mTasks.filter(t => !t.isCoverage);
  const wRegular = wTasks.filter(t => !t.isCoverage);
  const rrCoverageTasks: NightSlotTask[] = [];
  const seenCoverageLabels = new Set<string>();
  for (const t of [...mTasks, ...wTasks]) {
    if (t.isCoverage && !seenCoverageLabels.has(t.taskLabel)) {
      seenCoverageLabels.add(t.taskLabel);
      rrCoverageTasks.push(t);
    }
  }

  // Status ring — outline, not box-shadow, to avoid conflicting with globals.css hover shadow.
  const mHasTM = !mEmpty;
  const wHasTM = !wEmpty;
  const eitherHasTM = mHasTM || wHasTM;
  const allWithTMHaveTasks =
    (!mHasTM || mRegular.length > 0) && (!wHasTM || wRegular.length > 0);
  const statusOutline = eitherHasTM
    ? allWithTMHaveTasks
      ? "1.5px solid rgba(52,199,89,0.7)"
      : "1.5px solid rgba(255,149,0,0.55)"
    : undefined;

  return (
    <div
      onPointerMove={handleSpotlightMove}
      className={`assignment-card relative overflow-hidden flex flex-col rounded-[3px] transition-all ${bothEmpty ? "empty" : ""}`}
      style={{
        ["--card-accent" as any]: color,
        ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
        ...(statusOutline && { outline: statusOutline, outlineOffset: "-1px" }),
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
      <div
        className="flex flex-col flex-1 px-2 pt-1.5"
        style={{ paddingBottom: rrCoverageTasks.length > 0 ? rrCoverageTasks.length * COVERAGE_BAR_H + 2 : 6 }}
      >
        {isDraftMode && draftInfo && (
          <div className="text-[8px] bg-amber-100 text-amber-700 px-1 rounded w-fit mb-1 font-medium tracking-wider">DRAFT</div>
        )}
        <div className="grid grid-cols-2 gap-2 flex-1">
          <RRSide
            slotKey={mKey}
            label="MEN&rsquo;S"
            assignment={assignments[mKey]}
            tasks={mRegular}
            setBreakGroupForSlot={setBreakGroupForSlot}
            onClick={onGenderClick}
            loading={loading}
            onRemoveTask={onRemoveTask}
            onSetTaskColor={onSetTaskColor}
            onEditTask={onEditTask}
          />
          <RRSide
            slotKey={wKey}
            label="WOMEN'S"
            assignment={assignments[wKey]}
            tasks={wRegular}
            setBreakGroupForSlot={setBreakGroupForSlot}
            onClick={onGenderClick}
            loading={loading}
            onRemoveTask={onRemoveTask}
            onSetTaskColor={onSetTaskColor}
            onEditTask={onEditTask}
          />
        </div>
      </div>
      {/* Coverage bars span the full RR card width */}
      {rrCoverageTasks.map(t => (
        <CoverageBar key={t.id} task={t} slotKey={mKey} onRemoveTask={onRemoveTask} />
      ))}
    </div>
  );
};

export default RRCard;
