"use client";

import React from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import type { AuxDef, AuxRole } from "@/lib/shiftbuilder/placement";
import {
  type BreakGroup,
  nextBreakGroup,
  getAuxAccent,
  getAuxIcon,
} from "@/lib/shiftbuilder/constants";
import { useShiftBuilderStore } from "../store/useShiftBuilderStore";
import { applyAuxRole, applyAuxLabel } from "@/lib/shiftbuilder/auxLayout";
import { useSlotDnd } from "@/lib/shiftbuilder/useSlotDnd";
import { usePencilHover } from "@/lib/shiftbuilder/usePencilHover";
import { useCardLongPress } from "@/lib/shiftbuilder/useCardLongPress";
import { handleSpotlightMove } from "@/lib/shiftbuilder/spotlightMove";
import BreakBadge from "./BreakBadge";
import ZoneTaskList from "./ZoneTaskList";
import { penHoverClass } from "./builderPrimitives";
import type { PrerenderedPlacementFit } from "./placementFitScore";
import AuxRolePicker from "./AuxRolePicker";
import { premiumSpring } from "@/lib/premiumSpring";
import {
  CardAccentStripe,
  CardSlotHeader,
  SlotAssignmentBody,
  TaskListDivider,
  cardBodyInteriorClass,
  cardBodyInteriorStyle,
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
  onOpenTaskTextEdit?: (slotKey: string, task: NightSlotTask) => void;
  onLiveAssign?: (uiKey: string, tmId: string, tmName: string) => void;
  onLiveUnassign?: (uiKey: string) => void;
  isLocked?: boolean;
  fitChip?: PrerenderedPlacementFit | null;
  showDigitalAssists?: boolean;
  focusedTmId?: string | null;
  conflictingTms?: Set<string>;
  tmConflictSlots?: Record<string, string[]>;
  coveredByNames?: string[];
  onSetAuxRole?: (slotKey: string, role: AuxRole) => void;
  onSetAuxLabel?: (slotKey: string, label: string) => void;
  isTodayKiosk?: boolean;
  isPeerDimmed?: boolean;
  isCardSelected?: boolean;
  isAssignPulse?: boolean;
  isViewOnly?: boolean;
  onKioskLongPress?: (anchor: { x: number; y: number }) => void;
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
  showDigitalAssists = false,
  focusedTmId,
  conflictingTms,
  tmConflictSlots,
  coveredByNames = [],
  onSetAuxRole,
  onSetAuxLabel,
  isTodayKiosk = false,
  isPeerDimmed = false,
  isCardSelected = false,
  isAssignPulse = false,
  isViewOnly = false,
  onKioskLongPress,
}) => {
  const role = def.role ?? "blank";
  const isBlank = role === "blank";
  const isUnsetBlank = isBlank && !def.label?.trim();
  const isConfigured = !isUnsetBlank;
  const a = assignments[def.key] || {};
  const currentBreak = (a.breakGroup ?? 0) as BreakGroup;
  const color = getAuxAccent(def.key, role);
  const cycleBreak = () => setBreakGroupForSlot(def.key, nextBreakGroup(currentBreak));
  const { setRef, isOver, isDragging, listeners, attributes, hasTM } = useSlotDnd(
    def.key,
    "aux",
    { tmId: a.tmId, tmName: a.tmName },
    isLocked || isUnsetBlank,
  );

  const icon = getAuxIcon(def.key, role);
  const isEmpty = !hasTM && !loading;
  const currentTmId = a?.tmId;
  const isFocused = !!focusedTmId && currentTmId === focusedTmId;
  const isDimmed = !!focusedTmId && currentTmId !== focusedTmId;
  const isDuplicate = !!currentTmId && conflictingTms?.has(currentTmId);
  const otherSlotsForTm = currentTmId && tmConflictSlots?.[currentTmId]
    ? tmConflictSlots[currentTmId].filter((s) => s !== def.key)
    : [];

  const [showRolePicker, setShowRolePicker] = React.useState(false);
  const [editingLabel, setEditingLabel] = React.useState(false);
  const [labelDraft, setLabelDraft] = React.useState(def.label);
  const labelInputRef = React.useRef<HTMLInputElement>(null);

  const cardContainerRef = React.useRef<HTMLDivElement>(null);
  const pickerRef = React.useRef<HTMLDivElement>(null);
  const [pickerPosition, setPickerPosition] = React.useState<{ top: number; left: number } | null>(null);

  React.useEffect(() => {
    if (!showRolePicker) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (cardContainerRef.current?.contains(target)) return;
      if (pickerRef.current?.contains(target)) return;
      setShowRolePicker(false);
      setPickerPosition(null);
    };
    document.addEventListener("pointerdown", onDocPointerDown, true);
    return () => document.removeEventListener("pointerdown", onDocPointerDown, true);
  }, [showRolePicker]);

  React.useEffect(() => {
    setLabelDraft(def.label);
  }, [def.label]);

  React.useEffect(() => {
    if (editingLabel) labelInputRef.current?.focus();
  }, [editingLabel]);

  const openRolePicker = () => {
    if (isLocked) return;
    const rect = cardContainerRef.current?.getBoundingClientRect();
    if (rect) {
      setPickerPosition({ top: rect.bottom + 4, left: rect.left });
    }
    setShowRolePicker(true);
  };

  const toggleRolePicker = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (showRolePicker) {
      setShowRolePicker(false);
      setPickerPosition(null);
      return;
    }
    openRolePicker();
  };

  const { isPenHovering, penHoverHandlers, clearLongHoverTimer } = usePencilHover(
    (el) => { if (!isLocked && isConfigured) onCardClick(def.key, el); },
  );

  const longPress = useCardLongPress(
    isTodayKiosk && !isViewOnly && isConfigured && !!onKioskLongPress,
    (anchor) => onKioskLongPress?.(anchor),
  );

  const commitLabel = () => {
    setEditingLabel(false);
    const newLabel = labelDraft.trim();
    if (newLabel === def.label) return;
    if (onSetAuxLabel) {
      onSetAuxLabel(def.key, newLabel);
    } else {
      const store = useShiftBuilderStore.getState();
      store.setAuxDefs((prev: AuxDef[]) => applyAuxLabel(prev, def.key, newLabel));
    }
  };

  const handleRoleSelect = (r: Exclude<AuxRole, "blank">) => {
    if (onSetAuxRole) {
      onSetAuxRole(def.key, r);
    } else {
      const store = useShiftBuilderStore.getState();
      store.setAuxDefs((prev: AuxDef[]) => applyAuxRole(prev, def.key, r));
    }
    setShowRolePicker(false);
    setPickerPosition(null);
    clearLongHoverTimer();
  };

  const handleClearRole = () => {
    if (onSetAuxRole) {
      onSetAuxRole(def.key, "blank");
    } else {
      const store = useShiftBuilderStore.getState();
      store.setAuxDefs((prev: AuxDef[]) => applyAuxRole(prev, def.key, "blank"));
    }
    setShowRolePicker(false);
    setPickerPosition(null);
    clearLongHoverTimer();
  };

  const handleCustomLabel = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setLabelDraft(trimmed);
    if (onSetAuxLabel) {
      onSetAuxLabel(def.key, trimmed);
    } else {
      const store = useShiftBuilderStore.getState();
      store.setAuxDefs((prev: AuxDef[]) => applyAuxLabel(prev, def.key, trimmed));
    }
    setShowRolePicker(false);
    setPickerPosition(null);
    setEditingLabel(false);
    clearLongHoverTimer();
  };

  const headerLabel = isUnsetBlank && !editingLabel ? (
    <button
      type="button"
      className="flex items-center gap-1 min-w-0 text-left text-[#9CA3AF]"
      onClick={toggleRolePicker}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!isLocked) {
          setLabelDraft("");
          setEditingLabel(true);
        }
      }}
      title="Tap to set role · pick Custom for your own label"
    >
      <span className="text-[14px] leading-none shrink-0 font-light">+</span>
      <span>Set role</span>
    </button>
  ) : editingLabel ? (
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
      className="font-extrabold tracking-[0.4px] uppercase bg-transparent border-b border-current outline-none min-w-0 max-w-[88px]"
      style={{ fontSize: 10, fontFamily: "var(--font-ui, var(--font-inter-tight), system-ui)" }}
    />
  ) : (
    <button
      type="button"
      className="flex items-center gap-1 min-w-0 text-left"
      style={{ color: isBlank && def.label ? "#9CA3AF" : color }}
      onClick={toggleRolePicker}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!isLocked) setEditingLabel(true);
      }}
      title={isBlank ? "Tap to set role · double-click to edit label" : "Tap to change role · double-click to edit label"}
    >
      <span className="text-[11px] leading-none shrink-0">{icon}</span>
      <span className="truncate">{def.label || (isBlank ? "Set role" : "")}</span>
    </button>
  );

  const regularTasks = (selectedTasks[def.key] || []).filter((t) => !t.isCoverage);

  let assignmentState: SlotAssignmentState;
  if (loading && !hasTM) {
    assignmentState = { kind: "loading" };
  } else if (isDraftMode && draftInfo?.proposedTmName) {
    assignmentState = {
      kind: "draft",
      proposedName: draftInfo.proposedTmName,
      previousName: draftInfo.previousTmName,
    };
  } else if (hasTM) {
    assignmentState = {
      kind: "assigned",
      tmName: a.tmName,
      tmId: currentTmId,
      isLocked: a.isLocked,
    };
  } else if (coveredByNames.length > 0) {
    assignmentState = { kind: "covered", coveredByNames };
  } else {
    assignmentState = { kind: "unassigned" };
  }

  const headerAccent = isUnsetBlank ? "#9CA3AF" : isBlank && def.label ? "#9CA3AF" : color;

  return (
    <div
      ref={(node) => {
        setRef(node);
        cardContainerRef.current = node;
      }}
      onClick={(e) => {
        if (isLocked) return;
        if (isUnsetBlank) toggleRolePicker(e);
        else onCardClick(def.key, e.currentTarget, e);
      }}
      onPointerMove={(e) => {
        handleSpotlightMove(e);
        if (isTodayKiosk && isConfigured) longPress.onPointerMove(e);
      }}
      {...(isConfigured ? penHoverHandlers : {})}
      {...(isTodayKiosk && isConfigured
        ? {
            onPointerDown: longPress.onPointerDown,
            onPointerUp: longPress.onPointerUp,
            onPointerCancel: (e: React.PointerEvent) => {
              penHoverHandlers.onPointerCancel?.(e);
              longPress.onPointerCancel(e);
            },
          }
        : {})}
      {...(hasTM && !isLocked && isConfigured ? listeners : {})}
      {...(hasTM && !isLocked && isConfigured ? attributes : {})}
      data-slot-key={def.key}
      data-aux-role={role}
      className={`assignment-card sb-assignment-card sb-refined-card relative overflow-hidden flex flex-col h-full min-h-0 rounded-2xl touch-none ${isOver ? "drop-target-active" : ""} ${isDragging ? "sb-dragging" : ""} ${isEmpty && isConfigured ? "empty sb-card-empty" : ""} ${isUnsetBlank ? "sb-aux-blank" : ""} ${isConfigured ? penHoverClass(isPenHovering) : ""} ${isDimmed ? "sb-weekly-dim" : ""} ${isFocused ? "sb-weekly-highlight" : ""} ${showDigitalAssists && isConfigured && !isTodayKiosk ? "hover:shadow-[0_0_0_1px_rgba(0,122,255,0.12)] transition-shadow" : ""} ${isTodayKiosk && isConfigured ? "sb-today-kiosk-card" : ""} ${isPeerDimmed ? "sb-card-peer-dimmed" : ""} ${isCardSelected ? "sb-card-selected" : ""} ${isAssignPulse ? "sb-card-assign-pulse" : ""}`}
      style={{
        ["--card-accent" as string]: color,
        ...(borderColor && { border: `2px solid ${borderColor}`, boxShadow: `0 0 0 1px ${borderColor}33` }),
      }}
    >
      <CardAccentStripe color={isUnsetBlank ? "#D1D5DB" : color} />

      <CardSlotHeader
        icon={isUnsetBlank && !editingLabel ? undefined : icon}
        label={headerLabel}
        accentColor={headerAccent}
        compact
        titleClassName={isTodayKiosk ? "sb-kiosk-zone-title" : undefined}
        trailing={isConfigured ? (
          <>
            <span className={isViewOnly ? "sb-kiosk-action" : undefined}>
              <BreakBadge
                value={currentBreak}
                onCycle={cycleBreak}
                accentColor={isTodayKiosk ? color : undefined}
                kioskSize={isTodayKiosk}
              />
            </span>
            {hasTM && !isLocked && onLiveUnassign ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLiveUnassign(def.key);
                }}
                className="sb-kiosk-action text-[#9CA3AF] hover:text-[#EF4444] leading-none text-[13px] px-0.5"
                aria-label="Remove TM from slot"
                title="Clear this slot"
              >
                ×
              </button>
            ) : null}
          </>
        ) : undefined}
      />

      {showRolePicker && pickerPosition && createPortal(
        <div
          ref={pickerRef}
          data-aux-role-picker
          className="z-[9999]"
          style={{
            position: "fixed",
            top: pickerPosition.top,
            left: pickerPosition.left,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <AuxRolePicker
            onSelect={handleRoleSelect}
            onCustomLabel={handleCustomLabel}
            onClearRole={handleClearRole}
            showClearRole={isConfigured}
            initialCustomLabel={def.label}
            onClose={() => {
              setShowRolePicker(false);
              setPickerPosition(null);
            }}
          />
        </div>,
        document.body,
      )}

      <div
        className={cardBodyInteriorClass(showDigitalAssists, "min-h-0")}
        style={cardBodyInteriorStyle(showDigitalAssists, showDigitalAssists ? 8 : 10)}
      >
        {isUnsetBlank ? (
          <div className="flex-1 flex flex-col items-center justify-center text-[#9CA3AF] text-[10px] tracking-[0.2px] py-2 min-h-[64px]">
            {showDigitalAssists ? (
              <motion.button
                type="button"
                className="flex flex-col items-center gap-0.5"
                onClick={toggleRolePicker}
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
                <span className="no-print text-[7.5px] opacity-50 mt-0.5">or choose Custom in the picker</span>
              </motion.button>
            ) : (
              <button type="button" className="font-semibold tracking-[0.6px] uppercase" onClick={toggleRolePicker}>
                Set role
              </button>
            )}
          </div>
        ) : (
          <>
            <SlotAssignmentBody
              state={assignmentState}
              scale="aux"
              showDigitalAssists={showDigitalAssists}
              isDuplicate={isDuplicate}
              otherSlotsForTm={otherSlotsForTm}
              inviteSize="aux"
              emptyPresentation="label"
              nameSizeOverride={
                hasTM
                  ? (regularTasks.length > 0 ? 16 : showDigitalAssists ? 20 : 18)
                  : undefined
              }
              onUnassignedClick={(e) => {
                e.stopPropagation();
                onCardClick(def.key, e.currentTarget, e);
              }}
            />

            {regularTasks.length > 0 ? (
              <TaskListDivider hasTm={hasTM} showDigitalAssists={showDigitalAssists} />
            ) : null}

            <div className={`mt-auto min-h-0 overflow-hidden flex-shrink ${!hasTM && showDigitalAssists ? "bg-white/30 rounded-b-[3px] px-0.5 py-0.5 -mx-0.5" : ""}`}>
              <ZoneTaskList
                tasks={regularTasks}
                hasTM={hasTM}
                slotKey={def.key}
                onRemoveTask={onRemoveTask}
                onSetTaskColor={onSetTaskColor}
                onEditTask={onEditTask}
                onOpenTaskTextEdit={onOpenTaskTextEdit}
                dense
                textSize={hasTM ? "text-[9.5px]" : "text-[8.5px]"}
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