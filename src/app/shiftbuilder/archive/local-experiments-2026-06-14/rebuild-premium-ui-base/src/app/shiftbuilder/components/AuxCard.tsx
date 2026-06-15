"use client";

import React from "react";
import { createPortal } from "react-dom";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { AuxDef, AuxRole } from "@/lib/shiftbuilder/placement";
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
import AuxRolePicker from "./AuxRolePicker";

export interface AuxCardProps {
  def: AuxDef;
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
  onLiveAssign?: (uiKey: string, tmId: string, tmName: string) => void;
  onLiveUnassign?: (uiKey: string) => void;
  isLocked?: boolean;
  fitChip?: PrerenderedPlacementFit | null;
  showDigitalAssists?: boolean;
  focusedTmId?: string | null;
  conflictingTms?: Set<string>;
  tmConflictSlots?: Record<string, string[]>;
  onSetAuxRole?: (slotKey: string, role: Exclude<AuxRole, "blank">) => void;
  onSetAuxLabel?: (slotKey: string, label: string) => void;
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
  onLiveUnassign,
  isLocked = false,
  fitChip,
  showDigitalAssists = false,
  focusedTmId,
  conflictingTms,
  tmConflictSlots,
  onSetAuxRole,
  onSetAuxLabel,
}) => {
  const role = def.role ?? "blank";
  const isBlank = role === "blank";
  const a = assignments[def.key] || {};
  const currentBreak = (a.breakGroup ?? 0) as BreakGroup;
  const color = getAuxAccent(def.key, role);
  const cycleBreak = () => setBreakGroupForSlot(def.key, nextBreakGroup(currentBreak));
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(
    def.key,
    "aux",
    { tmId: a.tmId, tmName: a.tmName },
    isLocked || isBlank,
  );

  const icon = getAuxIcon(def.key, role);
  const isEmpty = !hasTM && !loading;
  const currentTmId = a?.tmId;
  const isFocused = !!focusedTmId && currentTmId === focusedTmId;
  const isDimmed = !!focusedTmId && currentTmId !== focusedTmId;
  const isDuplicate = !!currentTmId && conflictingTms?.has(currentTmId);
  const otherSlotsForTm = currentTmId && tmConflictSlots?.[currentTmId]
    ? tmConflictSlots[currentTmId].filter(s => s !== def.key)
    : [];

  const [showRolePicker, setShowRolePicker] = React.useState(false);
  const [editingLabel, setEditingLabel] = React.useState(false);
  const [labelDraft, setLabelDraft] = React.useState(def.label);
  const labelInputRef = React.useRef<HTMLInputElement>(null);

  // For custom positioned picker to avoid clipping in grids/sections
  const cardContainerRef = React.useRef<HTMLDivElement>(null);
  const [pickerPosition, setPickerPosition] = React.useState<{ top: number; left: number } | null>(null);

  // Close picker on outside click (for custom positioned portal)
  React.useEffect(() => {
    if (!showRolePicker) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!cardContainerRef.current?.contains(target)) {
        setShowRolePicker(false);
        setPickerPosition(null);
      }
    };
    document.addEventListener("mousedown", onDocClick, true);
    return () => document.removeEventListener("mousedown", onDocClick, true);
  }, [showRolePicker]);

  React.useEffect(() => {
    setLabelDraft(def.label);
  }, [def.label]);

  React.useEffect(() => {
    if (editingLabel) labelInputRef.current?.focus();
  }, [editingLabel]);

  const { isPenHovering, penHoverHandlers, clearLongHoverTimer } = usePencilHover(
    (el) => { if (!isLocked && !isBlank) onCardClick(def.key, el); },
  );

  const handleBlankClick = (e: React.MouseEvent, el: HTMLElement) => {
    if (isLocked) return;
    e.stopPropagation();
    computeAndSetPickerPosition();
    setShowRolePicker((v) => !v);
  };

  const computeAndSetPickerPosition = () => {
    const rect = cardContainerRef.current?.getBoundingClientRect();
    if (rect) {
      // Use fixed positioning with viewport coords (no scrollY needed)
      setPickerPosition({
        top: rect.bottom + 4,
        left: rect.left,
      });
    }
  };

  const commitLabel = () => {
    setEditingLabel(false);
    if (onSetAuxLabel && labelDraft.trim() !== def.label) {
      onSetAuxLabel(def.key, labelDraft.trim() || def.label);
    }
  };

  return (
    <div
      ref={(node) => {
        setRef(node);
        cardContainerRef.current = node;
      }}
      onClick={(e) => {
        if (isLocked) return;
        if (isBlank) handleBlankClick(e, e.currentTarget);
        else onCardClick(def.key, e.currentTarget, e);
      }}
      onPointerMove={handleSpotlightMove}
      {...(isBlank ? {} : penHoverHandlers)}
      {...(hasTM && !isLocked && !isBlank ? listeners : {})}
      {...(hasTM && !isLocked && !isBlank ? attributes : {})}
      data-slot-key={def.key}
      data-aux-role={role}
      className={`assignment-card sb-assignment-card relative flex flex-col h-full rounded-[3px] touch-none ${isOver ? "drop-target-active" : ""} ${isDragging ? "sb-dragging" : ""} ${isEmpty ? "empty sb-card-empty" : ""} ${isBlank ? "sb-aux-blank" : ""} ${!isBlank ? penHoverClass(isPenHovering) : ""} ${isDimmed ? "sb-weekly-dim" : ""} ${isFocused ? "sb-weekly-highlight" : ""}`}
      style={{
        ["--card-accent" as string]: color,
        ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
      }}
    >
      <div className="h-[3px] w-full shrink-0" style={{ background: isBlank ? "#D1D5DB" : color }} />
      <div
        className="flex items-start justify-between gap-1 px-2 pt-1 pb-1"
        style={{ borderBottom: `1px solid ${isBlank ? "#E5E7EB" : `${color}33`}` }}
      >
        {isBlank ? (
          <div className="flex items-center gap-1 leading-none min-w-0 text-[#9CA3AF]">
            <span className="text-[14px] leading-none shrink-0 font-light">+</span>
            <span
              className="font-semibold tracking-[0.3px] uppercase truncate"
              style={{ fontSize: 9, fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
            >
              Set role
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 leading-none min-w-0" style={{ color }}>
            <button
              type="button"
              className="flex items-center gap-1 min-w-0 text-left"
              onClick={(e) => {
                e.stopPropagation();
                if (!isLocked) {
                  computeAndSetPickerPosition();
                  setShowRolePicker((v) => !v);
                }
              }}
              title="Change role"
            >
              <span className="text-[11px] leading-none shrink-0">{icon}</span>
              {editingLabel ? (
                <input
                  ref={labelInputRef}
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onBlur={commitLabel}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitLabel();
                    if (e.key === "Escape") {
                      setLabelDraft(def.label);
                      setEditingLabel(false);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="font-extrabold tracking-[0.4px] uppercase bg-transparent border-b border-current outline-none min-w-0 max-w-[72px]"
                  style={{ fontSize: 10, fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
                />
              ) : (
                <span
                  className="font-extrabold tracking-[0.4px] uppercase truncate"
                  style={{ fontSize: 10, fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!isLocked && onSetAuxLabel) setEditingLabel(true);
                  }}
                  title="Double-click to edit label"
                >
                  {def.label}
                </span>
              )}
            </button>
          </div>
        )}
        <div className="flex items-center gap-0.5 shrink-0">
          {!isBlank && <PlacementFitChip fit={fitChip} />}
          {!isBlank && <BreakBadge value={currentBreak} onCycle={cycleBreak} />}
        </div>
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

      {showRolePicker && onSetAuxRole && pickerPosition && createPortal(
        <div
          className="z-[9999]"
          style={{
            position: "fixed",
            top: pickerPosition.top,
            left: pickerPosition.left,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <AuxRolePicker
            onSelect={(r) => {
              onSetAuxRole(def.key, r);
              setShowRolePicker(false);
              setPickerPosition(null);
              clearLongHoverTimer();
            }}
            onClose={() => {
              setShowRolePicker(false);
              setPickerPosition(null);
            }}
          />
        </div>,
        document.body
      )}

      <div className="flex flex-col flex-1 px-2 pt-1.5 pb-1.5 min-h-0">
        {isBlank ? (
          <div className="flex-1 flex items-center justify-center text-[#9CA3AF] text-[10px] tracking-[0.2px]">
            {showDigitalAssists && (
              <span className="no-print opacity-70">Tap to choose role</span>
            )}
          </div>
        ) : loading && !hasTM ? (
          <AssignmentSkeleton size="lg" />
        ) : isDraftMode && draftInfo ? (
          <div className="flex flex-col min-w-0">
            <span
              className="font-bold tracking-[-0.3px] text-[#111] dark:text-[#F2F2F4] truncate"
              style={{ fontSize: 18, lineHeight: 1.02, fontFamily: "var(--font-bricolage, var(--font-atkinson))" }}
            >
              {draftInfo.proposedTmName}
            </span>
            {isDuplicate && showDigitalAssists && (
              <span
                className="ml-1 inline-flex items-center rounded px-1 py-px text-[9px] font-mono tracking-[0.6px] bg-[#B89708]/12 text-[#8B6910] dark:bg-[#B89708]/15 dark:text-[#E9B948] border border-[#B89708]/30"
                title={`Duplicate assignment — also in: ${otherSlotsForTm.join(', ')}`}
              >
                2×
              </span>
            )}
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
          <div className="flex items-center gap-1 min-w-0">
            {a.isLocked && (
              <span className="ms shrink-0 text-[#FF9500]" aria-label="Locked" style={{ fontSize: 12, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}>lock</span>
            )}
            <span
              className="font-bold tracking-[-0.3px] text-[#111] dark:text-[#F2F2F4] truncate"
              style={{
                fontSize: (selectedTasks[def.key]?.length || 0) > 0 ? 16 : 20,
                lineHeight: 1.02,
                fontFamily: "var(--font-bricolage, var(--font-atkinson))",
              }}
            >
              {a.tmName}
            </span>
            {isDuplicate && showDigitalAssists && (
              <span
                className="ml-1 inline-flex items-center rounded px-1 py-px text-[9px] font-mono tracking-[0.6px] bg-[#B89708]/12 text-[#8B6910] dark:bg-[#B89708]/15 dark:text-[#E9B948] border border-[#B89708]/30"
                title={`Duplicate assignment — also in: ${otherSlotsForTm.join(', ')}`}
              >
                2×
              </span>
            )}
          </div>
        ) : (
          <div className="unassigned-label mt-0.5 text-[10.5px] tracking-[0.3px]" style={{ fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}>
            <span className="sb-unassigned-primary">— Unassigned —</span>
            {showDigitalAssists && (
              <span className="sb-unassigned-hint no-print">
                <span className="ms" style={{ fontSize: 11, fontVariationSettings: '"FILL" 0, "wght" 400, "opsz" 20' }}>south</span>
                Drop to assign
              </span>
            )}
          </div>
        )}

        {!isBlank && (
          <div className="mt-auto max-h-[26px] overflow-hidden flex-shrink-0">
            <ZoneTaskList
              tasks={selectedTasks[def.key]}
              hasTM={hasTM}
              slotKey={def.key}
              onRemoveTask={onRemoveTask}
              onSetTaskColor={onSetTaskColor}
              onEditTask={onEditTask}
              dense
            />
          </div>
        )}
      </div>
    </div>
  );
});

export default AuxCard;