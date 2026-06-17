"use client";

import React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { AuxDef, AuxRole } from "@/lib/shiftbuilder/placement";
import {
  type BreakGroup, nextBreakGroup,
  getAuxAccent, getAuxIcon,
} from "@/lib/shiftbuilder/constants";
import { useShiftBuilderStore } from "../store/useShiftBuilderStore";
import { applyAuxRole, applyAuxLabel } from "@/lib/shiftbuilder/auxLayout";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import { usePencilHover } from "@/lib/shiftbuilder/usePencilHover";
import { handleSpotlightMove } from "@/lib/shiftbuilder/spotlightMove";
import BreakBadge from "./BreakBadge";
import ZoneTaskList from "./ZoneTaskList";
import { PlacementFitChip } from "./PlacementFitChip";
import { penHoverClass } from "./builderPrimitives";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import AuxRolePicker from "./AuxRolePicker";
import { premiumSpring } from "@/lib/premiumSpring";
import {
  CardAccentStripe,
  SlotAssignmentBody,
  TaskListDivider,
  type SlotAssignmentState,
} from "./assignmentCardChrome";

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
  /** Opens the dedicated pop-up text/font attributes pad for a task (double-click path). */
  onOpenTaskTextEdit?: (slotKey: string, task: NightSlotTask) => void;
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
  onOpenTaskTextEdit,
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
    const newLabel = labelDraft.trim() || def.label;
    if (newLabel !== def.label) {
      if (onSetAuxLabel) {
        onSetAuxLabel(def.key, newLabel);
      } else {
        // fallback direct store update so custom label works even if handler prop not wired
        const store = useShiftBuilderStore.getState();
        store.setAuxDefs((prev: AuxDef[]) => applyAuxLabel(prev, def.key, newLabel));
      }
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
      className={`assignment-card sb-assignment-card relative overflow-hidden flex flex-col h-full min-h-0 rounded-[3px] touch-none ${isOver ? "drop-target-active" : ""} ${isDragging ? "sb-dragging" : ""} ${isEmpty ? "empty sb-card-empty" : ""} ${isBlank ? "sb-aux-blank" : ""} ${!isBlank ? penHoverClass(isPenHovering) : ""} ${isDimmed ? "sb-weekly-dim" : ""} ${isFocused ? "sb-weekly-highlight" : ""} ${showDigitalAssists && !isBlank ? "hover:shadow-[0_0_0_1px_rgba(0,122,255,0.12)] transition-shadow" : ""}`}
      style={{
        ["--card-accent" as string]: color,
        ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
      }}
    >
      <CardAccentStripe color={isBlank ? "#D1D5DB" : color} />
      <div
        className="flex items-start justify-between gap-1 px-2 pt-1 pb-1"
        style={{ borderBottom: `1px solid ${isBlank ? "#E5E7EB" : `${color}33`}` }}
      >
        {(isBlank && !def.label && !editingLabel) ? (
          <div 
            className="flex items-center gap-1 leading-none min-w-0 text-[#9CA3AF]"
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (!isLocked) {
                setLabelDraft("");
                setEditingLabel(true);
              }
            }}
            title="Double-click to set custom text label"
          >
            <span className="text-[14px] leading-none shrink-0 font-light">+</span>
            <span
              className="font-semibold tracking-[0.3px] uppercase truncate"
              style={{ fontSize: 9, fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
            >
              Set role
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1 leading-none min-w-0" style={{ color: (isBlank && def.label) ? '#9CA3AF' : color }}>
            <button
              type="button"
              className="flex items-center gap-1 min-w-0 text-left"
              onClick={(e) => {
                e.stopPropagation();
                if (!isLocked) {
                  if (isBlank) {
                    // for blank (custom or role) still allow opening picker to choose/ change role
                    computeAndSetPickerPosition();
                    setShowRolePicker((v) => !v);
                  } else {
                    computeAndSetPickerPosition();
                    setShowRolePicker((v) => !v);
                  }
                }
              }}
              title={isBlank ? "Set role or double-click label for custom" : "Change role"}
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
                  className="font-extrabold tracking-[0.4px] uppercase truncate px-1 py-[1px] inline-block"
                  style={{ fontSize: 10, fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!isLocked) setEditingLabel(true);
                  }}
                  title="Double-click to edit label (custom text for blank aux)"
                >
                  {def.label || (isBlank ? "Set role" : "")}
                </span>
              )}
            </button>
          </div>
        )}
        <div className="flex items-center gap-0.5 shrink-0">
          {!(isBlank && !def.label) && <PlacementFitChip fit={fitChip} />}
          {!(isBlank && !def.label) && <BreakBadge value={currentBreak} onCycle={cycleBreak} />}
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
              if (onSetAuxRole) {
                onSetAuxRole(def.key, r);
              } else {
                // fallback direct store update so role choice works even if handler prop not wired
                const store = useShiftBuilderStore.getState();
                store.setAuxDefs((prev: AuxDef[]) => applyAuxRole(prev, def.key, r));
              }
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

      <div 
        className={`flex flex-col flex-1 px-2 ${showDigitalAssists ? 'pt-1.5 pb-1.5' : 'px-3 pt-1.5 pb-1.5'} min-h-0 overflow-hidden`}
        style={{ 
          background: showDigitalAssists ? 'rgba(255,255,255,0.018)' : undefined,
        }}
      >
        {(isBlank && !def.label && !editingLabel) ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#9CA3AF] text-[10px] tracking-[0.2px] py-2">
            {showDigitalAssists && (
              <motion.div
                className="flex flex-col items-center gap-0.5"
                whileHover={{ scale: 1.02 }}
                transition={premiumSpring}
              >
                <motion.span 
                  className="text-[22px] leading-none opacity-60"
                  whileHover={{ scale: 1.15, rotate: 90 }}
                  transition={{ ...premiumSpring, stiffness: 300 }}
                >
                  +
                </motion.span>
                <span className="font-semibold tracking-[0.6px] text-[10px] text-[#8a8a8f]">SET ROLE</span>
                <span className="no-print text-[8.5px] opacity-60">Tap to choose role</span>
                <span className="no-print text-[7.5px] opacity-50 mt-0.5">or double-click to set custom text</span>
              </motion.div>
            )}
          </div>
        ) : (
          <SlotAssignmentBody
            state={
              loading && !hasTM
                ? { kind: "loading" }
                : isDraftMode && draftInfo?.proposedTmName
                  ? {
                      kind: "draft",
                      proposedName: draftInfo.proposedTmName,
                      previousName: draftInfo.previousTmName,
                    }
                  : hasTM
                    ? {
                        kind: "assigned",
                        tmName: a.tmName,
                        tmId: currentTmId,
                        isLocked: a.isLocked,
                      }
                    : { kind: "unassigned" }
            }
            scale="aux"
            showDigitalAssists={showDigitalAssists}
            isDuplicate={isDuplicate}
            otherSlotsForTm={otherSlotsForTm}
            inviteSize="aux"
            emptyPresentation="label"
            nameSizeOverride={
              hasTM
                ? ((selectedTasks[def.key]?.length || 0) > 0 ? 16 : showDigitalAssists ? 20 : 18)
                : undefined
            }
            onUnassignedClick={(e) => {
              e.stopPropagation();
              onCardClick(def.key, e.currentTarget, e);
            }}
          />
        )}

        {!(isBlank && !def.label) && (
          <>
            {/* Subtle task separator for interiors hierarchy (builder only). */}
            {(selectedTasks[def.key] || []).some((t) => !t.isCoverage) ? (
              <TaskListDivider hasTm={hasTM} showDigitalAssists={showDigitalAssists} />
            ) : null}
            <div className="mt-auto max-h-[26px] overflow-hidden flex-shrink-0">
              <ZoneTaskList
                tasks={selectedTasks[def.key]}
                hasTM={hasTM}
                slotKey={def.key}
                onRemoveTask={onRemoveTask}
                onSetTaskColor={onSetTaskColor}
                onEditTask={onEditTask}
                onOpenTaskTextEdit={onOpenTaskTextEdit}
                dense
                isPrintPreview={!showDigitalAssists}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export default AuxCard;