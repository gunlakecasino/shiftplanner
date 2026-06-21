"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";

export type OpenTasksPadHandler = (
  slotKey: string,
  task?: NightSlotTask,
  options?: { addMode?: boolean },
) => void;

/** Lower card band — double-click anywhere (incl. empty space) opens Tasks Pad. */
export const CardTaskZone: React.FC<{
  slotKey: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onOpenTasksPad?: OpenTasksPadHandler;
  isLocked?: boolean;
  enabled?: boolean;
}> = ({
  slotKey,
  children,
  className = "",
  style,
  onOpenTasksPad,
  isLocked = false,
  enabled = true,
}) => {
  const handleDoubleClick = (e: React.MouseEvent) => {
    if (!enabled || isLocked || !onOpenTasksPad) return;
    if ((e.target as HTMLElement).closest("[data-task-host]")) return;
    e.stopPropagation();
    onOpenTasksPad(slotKey, undefined, { addMode: true });
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!enabled) return;
    e.stopPropagation();
  };

  return (
    <div
      data-card-task-zone
      data-slot-key={slotKey}
      className={`sb-card-task-zone ${className}`.trim()}
      style={style}
      onDoubleClick={enabled ? handleDoubleClick : undefined}
      onClick={enabled ? handleClick : undefined}
    >
      {children}
    </div>
  );
};

/** Upper assignee band — double-click opens Placement Pad (no single-click open). */
export function handleAssignZoneDoubleClick(
  e: React.MouseEvent,
  slotKey: string,
  onOpenPlacementPad: (slotKey: string, el: HTMLElement, event?: React.MouseEvent) => void,
  isLocked?: boolean,
) {
  if (isLocked) return;
  e.stopPropagation();
  onOpenPlacementPad(slotKey, e.currentTarget as HTMLElement, e);
}