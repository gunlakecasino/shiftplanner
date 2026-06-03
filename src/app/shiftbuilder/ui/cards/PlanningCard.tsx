"use client";

import React from "react";
import { ZonePlanningCard } from "./ZonePlanningCard";
import { RestroomPlanningCard } from "./RestroomPlanningCard";
import { AuxPlanningCard } from "./AuxPlanningCard";
import { BreakPlanningCard } from "./BreakPlanningCard";

// Loose dev shape for the isolated ui/cards/ preview surface (no dependency on production store export).
type DevAssignment = any;

/**
 * PlanningCard (New UI — Phase 1+)
 *
 * This is now a thin orchestrator.
 * Each card type has its own dedicated, highly tuned component.
 * This structure gives us maximum efficiency, clarity, and the ability to
 * evolve each slot type independently while sharing common behavior.
 */

export interface PlanningCardProps {
  assignment: DevAssignment;
  isReadOnly?: boolean;
  onClick?: () => void;
  onToggleLock?: () => void;
  onContextAction?: (action: string) => void;
  onWhyClick?: () => void;
  showPencilHover?: boolean;
  // Per-side handlers (only used by RestroomPlanningCard for male/female independent assignment + provenance)
  onClickSide?: (side: 'mens' | 'womens') => void;
  onDropToSide?: (side: 'mens' | 'womens', e: React.DragEvent) => void;
  // Optional: allow side drags to notify outer for source fade / draggingKey visuals
  onSideDragStart?: (side: 'mens' | 'womens') => void;
}

export function PlanningCard(props: PlanningCardProps) {
  const { assignment } = props;

  // Dispatch to the correct specialized component (per-type callable files)
  if (assignment?.slotType === "zone") {
    return <ZonePlanningCard {...props} />;
  }

  if (assignment?.slotType === "rr") {
    return <RestroomPlanningCard {...props} />;
  }

  if (assignment?.slotType === "aux") {
    return <AuxPlanningCard {...props} />;
  }

  if ((assignment?.slotKey || "").includes("BW") || assignment?.slotType === "break") {
    return <BreakPlanningCard {...props} />;
  }

  // Fallback
  return <ZonePlanningCard {...props} />;
}
