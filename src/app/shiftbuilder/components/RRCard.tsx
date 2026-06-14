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
import { PlacementFitChip } from "./PlacementFitChip";
import { AssignmentSkeleton, penHoverClass } from "./builderPrimitives";
import type { PrerenderedPlacementFit } from "./placementFitScore";

/**
 * RRCard (Phase 1 Live Cache migration)
 * See ZoneCard.tsx for the full migration note pattern.
 * New optional onLiveAssign / onLiveUnassign props prepared for the optimistic layer.
 */

export interface RRCardProps {
  def: any;
  assignments: any;
  selectedTasks: Record<string, NightSlotTask[]>;
  setBreakGroupForSlot: (k: string, g: BreakGroup) => void;
  onGenderClick: (k: string, el: HTMLElement) => void;
  loading?: boolean;
  borderColor?: string;
  isDraftMode?: boolean;
  draftInfoW?: { proposedTmName: string; previousTmName?: string; proposedClear?: boolean };
  draftInfoM?: { proposedTmName: string; previousTmName?: string; proposedClear?: boolean };
  onRemoveTask?: (slotKey: string, taskLabel: string) => void;
  onSetTaskColor?: (slotKey: string, taskLabel: string, color: string | null) => void;
  onEditTask?: (slotKey: string, oldLabel: string, newLabel: string) => void;

  // Phase 1 Live optimistic layer (preferred for assign/unassign)
  onLiveAssign?: (uiKey: string, tmId: string, tmName: string) => void;
  onLiveUnassign?: (uiKey: string) => void;

  // Locked state for the night (disables interactions)
  isLocked?: boolean;
  fitChipW?: PrerenderedPlacementFit | null;
  fitChipM?: PrerenderedPlacementFit | null;
  /** Builder mode flag for subtle digital-only UI sugar. */
  showDigitalAssists?: boolean;

  /** Weekly Overview focus: dims non-matching sides/cards, highlights matching TM side(s). */
  focusedTmId?: string | null;

  /** Duplicate TM flagging (same TM in >1 position this night) — high-class digital assist only. */
  conflictingTms?: Set<string>;
  tmConflictSlots?: Record<string, string[]>;
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

  // Phase 1 Live optimistic layer
  onLiveAssign?: (uiKey: string, tmId: string, tmName: string) => void;
  onLiveUnassign?: (uiKey: string) => void;

  // Locked state for the night
  isLocked?: boolean;

  // For stacked side cards: hide the internal badge row so badge can live in the side card header (to pin name to upper corner like other cards)
  showBreakBadge?: boolean;
  isDraftMode?: boolean;
  draftInfo?: { proposedTmName: string; previousTmName?: string; proposedClear?: boolean };

  /** Weekly focus for this side. */
  focusedTmId?: string | null;

  conflictingTms?: Set<string>;
  tmConflictSlots?: Record<string, string[]>;
  showDigitalAssists?: boolean;
}> = ({ slotKey, label, assignment, tasks, setBreakGroupForSlot, onClick, loading = false, onRemoveTask, onSetTaskColor, onEditTask, onLiveAssign, onLiveUnassign, isLocked = false, showBreakBadge = true, isDraftMode = false, draftInfo, focusedTmId, conflictingTms, tmConflictSlots, showDigitalAssists = false }) => {
  const a = assignment || {};
  const breakNum = (a.breakGroup ?? 0) as BreakGroup;
  const cycle = () => setBreakGroupForSlot(slotKey, nextBreakGroup(breakNum));
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(slotKey, "rr", { tmId: a.tmId, tmName: a.tmName });

  // Phase 1 Live layer ready (onLiveAssign / onLiveUnassign when wired by parent).
  const dim = !hasTM && !loading;
  const currentTmId = assignment?.tmId;
  const isFocused = !!focusedTmId && currentTmId === focusedTmId;
  const isDimmed = !!focusedTmId && currentTmId !== focusedTmId;

  const isDuplicate = !!currentTmId && conflictingTms?.has(currentTmId);
  const otherSlotsForTm = currentTmId && tmConflictSlots?.[currentTmId]
    ? tmConflictSlots[currentTmId].filter(s => s !== slotKey)
    : [];
  const { isPenHovering, penHoverHandlers, clearLongHoverTimer } = usePencilHover(
    (el) => onClick(slotKey, el),
  );

  return (
    <div
      ref={setRef}
      onClick={(e) => { if (!isLocked) onClick(slotKey, e.currentTarget, e); }}
      {...penHoverHandlers}
      {...(hasTM && !isLocked ? listeners : {})}
      {...(hasTM && !isLocked ? attributes : {})}
      data-slot-key={slotKey}
      className={`flex flex-col flex-1 rounded-[2px] sb-assignment-card touch-none ${isOver ? "drop-target-active" : ""} ${isDragging ? "sb-dragging" : ""} ${dim ? "sb-card-empty" : ""} ${penHoverClass(isPenHovering)} ${isDimmed ? "sb-weekly-dim" : ""} ${isFocused ? "sb-weekly-highlight" : ""}`}
    >
      {/* Label + badge row (skip label if empty, for stacked side cards where header already includes the side info). Badge row only if showBreakBadge (for stacked, badge lives in side-card header to pin name upper like Zone/Aux cards) */}
      {showBreakBadge && label && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-[8px] font-bold tracking-[0.8px] text-[#1C1C1E] dark:text-[#9CA3AF] uppercase" style={{ fontFamily: 'var(--font-ui, var(--font-inter-tight), system-ui)' }}>{label}</span>
          <BreakBadge value={breakNum} onCycle={cycle} size="sm" />
        </div>
      )}
      {showBreakBadge && !label && (
        <div className="flex items-center justify-end mb-1">
          <BreakBadge value={breakNum} onCycle={cycle} size="sm" />
        </div>
      )}
      {/* Name immediately under label */}
      <div className="min-w-0">
        {loading && !hasTM && !(isDraftMode && draftInfo?.proposedTmName) ? (
          <AssignmentSkeleton size="lg" />
        ) : isDraftMode && draftInfo?.proposedTmName && !draftInfo.proposedClear ? (
          <div className="flex flex-col min-w-0">
            <span
              className="font-bold tracking-[-0.3px] text-[#111] dark:text-[#F2F2F4] truncate"
              style={{ fontSize: 18, lineHeight: 1.02, fontFamily: "var(--font-bricolage, var(--font-atkinson))" }}
            >
              {draftInfo.proposedTmName}
            </span>
            {isDuplicate && (
              <span
                className="ml-1 inline-flex items-center rounded px-1 py-px text-[9px] font-mono tracking-[0.6px] bg-[#B89708]/12 text-[#8B6910] dark:bg-[#B89708]/15 dark:text-[#E9B948] border border-[#B89708]/30"
                title={`Duplicate assignment — also in: ${otherSlotsForTm.join(', ')}`}
              >
                2×
              </span>
            )}
            {draftInfo.previousTmName && (
              <span
                className="text-[8.5px] text-[#9CA3AF] line-through opacity-60 mt-0.5"
                style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
              >
                was: {draftInfo.previousTmName}
              </span>
            )}
          </div>
        ) : hasTM ? (
          <div className="flex items-center gap-1 min-w-0">
            {a.isLocked && (
              <span className="ms shrink-0 text-[#FF9500]" aria-label="Locked" style={{ fontSize: 11, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}>lock</span>
            )}
            <span
              className="font-bold tracking-[-0.3px] text-[#111] dark:text-[#F2F2F4] truncate"
              style={{ fontSize: 18, lineHeight: 1.02, fontFamily: "var(--font-bricolage, var(--font-atkinson))" }}
            >
              {a.tmName}
            </span>
            {isDuplicate && (
              <span
                className="ml-1 inline-flex items-center rounded px-1 py-px text-[9px] font-mono tracking-[0.6px] bg-[#B89708]/12 text-[#8B6910] dark:bg-[#B89708]/15 dark:text-[#E9B948] border border-[#B89708]/30"
                title={`Duplicate assignment — also in: ${otherSlotsForTm.join(', ')}`}
              >
                2×
              </span>
            )}
          </div>
        ) : (
          <div className="unassigned-label mt-px text-[9.5px] tracking-[0.3px]" style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}>
            <span className="sb-unassigned-primary">— Unassigned —</span>
            {showDigitalAssists && (
              <span className="sb-unassigned-hint no-print">
                <span className="ms" style={{ fontSize: 10, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20' }}>south</span>
                Drop to assign
              </span>
            )}
          </div>
        )}
      </div>
      {/* Per-side selected tasks */}
      {tasks && tasks.length > 0 && (
        <div
          className={`mt-0.5 text-[10px] leading-[1.25] ${hasTM ? "text-[#6B7280]" : "text-[#9CA3AF]"}`}
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
              textSize="text-[10px]"
              textColorClass={hasTM ? "text-[#1f2937] dark:text-[#C7C7CC]" : "text-[#6B7280] dark:text-[#636366]"}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const RRCard: React.FC<RRCardProps> = React.memo(({
  def,
  assignments,
  selectedTasks,
  setBreakGroupForSlot,
  onGenderClick,
  loading = false,
  borderColor,
  isDraftMode = false,
  draftInfoW,
  draftInfoM,
  onRemoveTask,
  onSetTaskColor,
  onEditTask,
  onLiveAssign,
  onLiveUnassign,
  isLocked = false,
  fitChipW,
  fitChipM,
  showDigitalAssists = false,
  focusedTmId,
  conflictingTms,
  tmConflictSlots,
}) => {
  const mKey = `MRR${def.num}`;
  const wKey = `WRR${def.num}`;
  const color = getRRAccent(def.num);
  const icon = RR_ICONS[def.num] ?? "●";
  const wDraftName =
    isDraftMode && draftInfoW?.proposedTmName && !draftInfoW.proposedClear
      ? draftInfoW.proposedTmName
      : "";
  const mDraftName =
    isDraftMode && draftInfoM?.proposedTmName && !draftInfoM.proposedClear
      ? draftInfoM.proposedTmName
      : "";
  const mEmpty = !assignments[mKey]?.tmName && !mDraftName;
  const wEmpty = !assignments[wKey]?.tmName && !wDraftName;
  const bothEmpty = mEmpty && wEmpty && !loading;

  // For stacked side cards: compute breaks per side so badge can be in the side card header (pins name to upper corner like Zone/Aux cards)
  const mA = assignments[mKey] || {};
  const wA = assignments[wKey] || {};
  const mBreak = (mA.breakGroup ?? 0) as BreakGroup;
  const wBreak = (wA.breakGroup ?? 0) as BreakGroup;
  const cycleW = () => setBreakGroupForSlot(wKey, nextBreakGroup(wBreak));
  const cycleM = () => setBreakGroupForSlot(mKey, nextBreakGroup(mBreak));

  // Separate coverage tasks per side now that sides are independent stacked cards.
  // Women's RR cards need their own coverage banners (e.g. "AND ZONE X" style).
  const mTasks = selectedTasks[mKey] || [];
  const wTasks = selectedTasks[wKey] || [];
  const mRegular = mTasks.filter(t => !t.isCoverage);
  const wRegular = wTasks.filter(t => !t.isCoverage);
  const wCoverageTasks = wTasks.filter(t => t.isCoverage);
  const mCoverageTasks = mTasks.filter(t => t.isCoverage);

  return (
    <div
      onPointerMove={handleSpotlightMove}
      className={`relative overflow-hidden flex flex-col gap-1 ${bothEmpty ? "empty" : ""}`}
      style={{
        ["--card-accent" as any]: color,
      }}
    >
      {/* WOMEN'S RR card (stacked above men's per the experiment: cut the shared card in half and stack so each side is its own visual card) */}
      <div
        className={`assignment-card sb-assignment-card relative overflow-hidden flex flex-col rounded-[3px] flex-1 ${wEmpty && !loading ? "empty sb-card-empty" : ""}`}
        style={{
          ["--card-accent" as any]: color,
          ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
        }}
      >
        <div className="h-[3px] w-full shrink-0" style={{ background: color }} />
        <div
          className="flex items-center justify-between gap-1 px-2 pt-0.5 pb-0.5 leading-none"
          style={{ color, borderBottom: `1px solid ${color}33` }}
        >
          <div className="flex items-center gap-1 leading-none min-w-0" style={{ color }}>
            <span className="text-[11px] leading-none">{icon}</span>
            <span
              className="font-extrabold tracking-[0.4px] uppercase truncate"
              style={{ fontSize: 10.5, fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
            >
              {def.label} WOMEN'S
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <PlacementFitChip fit={fitChipW} />
            <BreakBadge value={wBreak} onCycle={cycleW} size="sm" />
          </div>
        </div>
        <div
          className="flex flex-col flex-1 px-2 pt-1"
          style={{ paddingBottom: (wCoverageTasks.length > 0 ? wCoverageTasks.length * COVERAGE_BAR_H + 4 : 4) }}
        >
          <RRSide
            slotKey={wKey}
            label=""
            assignment={assignments[wKey]}
            tasks={wRegular}
            setBreakGroupForSlot={setBreakGroupForSlot}
            onClick={onGenderClick}
            loading={loading}
            onRemoveTask={onRemoveTask}
            onSetTaskColor={onSetTaskColor}
            onEditTask={onEditTask}
            isLocked={isLocked}
            showBreakBadge={false}
            isDraftMode={isDraftMode}
            draftInfo={draftInfoW}
            focusedTmId={focusedTmId}
            conflictingTms={conflictingTms}
            tmConflictSlots={tmConflictSlots}
            showDigitalAssists={showDigitalAssists}
          />
          {/* Women's coverage banners (independent per side now) */}
          {wCoverageTasks.map(t => (
            <CoverageBar key={t.id} task={t} slotKey={wKey} onRemoveTask={onRemoveTask} />
          ))}
        </div>
      </div>

      {/* MEN'S RR card (below the women's) */}
      <div
        className={`assignment-card sb-assignment-card relative overflow-hidden flex flex-col rounded-[3px] flex-1 ${mEmpty && !loading ? "empty sb-card-empty" : ""}`}
        style={{
          ["--card-accent" as any]: color,
          ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
        }}
      >
        <div className="h-[3px] w-full shrink-0" style={{ background: color }} />
        <div
          className="flex items-center justify-between gap-1 px-2 pt-0.5 pb-0.5 leading-none"
          style={{ color, borderBottom: `1px solid ${color}33` }}
        >
          <div className="flex items-center gap-1 leading-none min-w-0" style={{ color }}>
            <span className="text-[11px] leading-none">{icon}</span>
            <span
              className="font-extrabold tracking-[0.4px] uppercase truncate"
              style={{ fontSize: 10.5, fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
            >
              {def.label} MEN'S
            </span>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            <PlacementFitChip fit={fitChipM} />
            <BreakBadge value={mBreak} onCycle={cycleM} size="sm" />
          </div>
        </div>
        <div
          className="flex flex-col flex-1 px-2 pt-1"
          style={{ paddingBottom: (mCoverageTasks.length > 0 ? mCoverageTasks.length * COVERAGE_BAR_H + 4 : 4) }}
        >
          <RRSide
            slotKey={mKey}
            label=""
            assignment={assignments[mKey]}
            tasks={mRegular}
            setBreakGroupForSlot={setBreakGroupForSlot}
            onClick={onGenderClick}
            loading={loading}
            onRemoveTask={onRemoveTask}
            onSetTaskColor={onSetTaskColor}
            onEditTask={onEditTask}
            isLocked={isLocked}
            showBreakBadge={false}
            isDraftMode={isDraftMode}
            draftInfo={draftInfoM}
            focusedTmId={focusedTmId}
            conflictingTms={conflictingTms}
            tmConflictSlots={tmConflictSlots}
            showDigitalAssists={showDigitalAssists}
          />
          {/* Men's coverage banners (independent per side now) */}
          {mCoverageTasks.map(t => (
            <CoverageBar key={t.id} task={t} slotKey={mKey} onRemoveTask={onRemoveTask} />
          ))}
        </div>
      </div>

      {/* Coverage bars are now rendered inside each side card (women's and men's independently) */}
    </div>
  );
});

export default RRCard;
