"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";

export type OpenTasksPadHandler = (
  slotKey: string,
  task?: NightSlotTask,
  options?: { addMode?: boolean },
) => void;

export type OpenPlacementPadHandler = (
  slotKey: string,
  el: HTMLElement,
  event?: React.MouseEvent,
) => void;

/** Upper assignee band — one click/tap opens Placement Pad. */
export function handleAssignZoneClick(
  e: React.MouseEvent,
  slotKey: string,
  onOpenPlacementPad: OpenPlacementPadHandler,
  isLocked?: boolean,
) {
  if (isLocked) return;
  e.stopPropagation();
  onOpenPlacementPad(slotKey, e.currentTarget as HTMLElement, e);
}

export function assignZoneOpenHandlers(
  slotKey: string,
  onOpenPlacementPad: OpenPlacementPadHandler,
  isLocked?: boolean,
): {
  onClick?: (e: React.MouseEvent) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  role: "button";
  tabIndex: number;
} {
  const open = (e: React.MouseEvent) =>
    handleAssignZoneClick(e, slotKey, onOpenPlacementPad, isLocked);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (isLocked || (e.key !== "Enter" && e.key !== " ")) return;
    e.preventDefault();
    e.stopPropagation();
    onOpenPlacementPad(slotKey, e.currentTarget as HTMLElement);
  };
  const accessibility = {
    role: "button" as const,
    tabIndex: isLocked ? -1 : 0,
    onKeyDown,
  };
  return { ...accessibility, onClick: open };
}

/** Lower card band — one click/tap opens Tasks Pad. */
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
  const openTasksPad = (e: React.MouseEvent) => {
    if (!enabled || isLocked || !onOpenTasksPad) return;
    if ((e.target as HTMLElement).closest("[data-task-host]")) return;
    e.stopPropagation();
    onOpenTasksPad(slotKey, undefined, { addMode: true });
  };

  return (
    <div
      data-card-task-zone
      data-slot-key={slotKey}
      className={`sb-card-task-zone ${className}`.trim()}
      style={style}
      onClick={enabled ? openTasksPad : undefined}
    >
      {children}
    </div>
  );
};
