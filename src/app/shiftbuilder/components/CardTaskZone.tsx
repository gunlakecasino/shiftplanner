"use client";

import React from "react";
import type { NightSlotTask } from "@/lib/shiftbuilder/data";
import { isCoarsePointerDevice } from "@/lib/shiftbuilder/tabletDevice";

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

/**
 * iPad / finger: single tap opens pads.
 * Uses coarse pointer (not min-width 768) so Split View / Stage Manager still
 * single-taps — previously those modes fell back to double-click.
 */
export function padUsesSingleTap(): boolean {
  return isCoarsePointerDevice();
}

/** Upper assignee band — tap (iPad) or double-click (desktop) opens Placement Pad. */
export function handleAssignZoneDoubleClick(
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
  onDoubleClick?: (e: React.MouseEvent) => void;
} {
  const open = (e: React.MouseEvent) =>
    handleAssignZoneDoubleClick(e, slotKey, onOpenPlacementPad, isLocked);
  if (padUsesSingleTap()) {
    return { onClick: open };
  }
  return { onDoubleClick: open };
}

/** Lower card band — tap (iPad) or double-click (desktop) opens Tasks Pad. */
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

  const handleClick = (e: React.MouseEvent) => {
    if (!enabled) return;
    if (padUsesSingleTap()) {
      openTasksPad(e);
      return;
    }
    e.stopPropagation();
  };

  return (
    <div
      data-card-task-zone
      data-slot-key={slotKey}
      className={`sb-card-task-zone ${className}`.trim()}
      style={style}
      onDoubleClick={enabled && !padUsesSingleTap() ? openTasksPad : undefined}
      onClick={enabled ? handleClick : undefined}
    >
      {children}
    </div>
  );
};