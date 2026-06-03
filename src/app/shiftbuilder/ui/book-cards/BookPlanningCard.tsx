"use client";

import React from "react";
import { BookZoneCard } from "./BookZoneCard";
import { BookRestroomCard } from "./BookRestroomCard";
import { BookAuxCard } from "./BookAuxCard";

// Loose dev shape reused from v1 precision work
type DevAssignment = any;

export interface BookPlanningCardProps {
  assignment: DevAssignment;
  onClick?: () => void;
  onClickSide?: (side: 'mens' | 'womens') => void;
  onDrop?: (e: React.DragEvent) => void;
  onDropToSide?: (side: 'mens' | 'womens', e: React.DragEvent) => void;
  onDragStart?: (e: React.DragEvent) => void;
  onSideDragStart?: (side: 'mens' | 'womens') => void;
  onUnassign?: () => void;
  onUnassignSide?: (side: 'mens' | 'womens') => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
  // For RR per-side drop feedback
  highlightSide?: 'mens' | 'womens' | null;
}

/**
 * BookPlanningCard (v1.5)
 * Thin orchestrator dispatching to the exact visual treatment
 * of the "Weekly Zone Deployment Book" 8.5x11 print layout.
 * Each type is its own dedicated callable file for maintainability.
 */
export function BookPlanningCard(props: BookPlanningCardProps) {
  const { assignment } = props;

  if (assignment?.slotType === "zone" || (assignment?.slotKey || "").startsWith("Z")) {
    return <BookZoneCard {...props} />;
  }

  if (assignment?.slotType === "rr" || (assignment?.slotKey || "").startsWith("RR")) {
    return <BookRestroomCard {...props} />;
  }

  if (assignment?.slotType === "aux" || (assignment?.slotKey || "").startsWith("AUX") || (assignment?.slotKey || "").includes("TRASH") || (assignment?.slotKey || "").includes("SUPPORT")) {
    return <BookAuxCard {...props} />;
  }

  // Fallback to zone style
  return <BookZoneCard {...props} />;
}
