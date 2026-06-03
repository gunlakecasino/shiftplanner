"use client";

import React from "react";
import { CardShell } from "./CardShell";

// Dev preview shape (loose for isolated ui/cards/ surface)
type DevAssignment = any;

/**
 * ZonePlanningCard
 * Dedicated, callable component for standard zone slots.
 * Now a thin consumer of CardShell for all shared chrome (pencil gold ring, header, provenance affordances).
 * This keeps type-specific logic minimal while allowing independent future evolution (e.g., coverage mini-bars, pair affinity hints).
 */
interface ZonePlanningCardProps {
  assignment: DevAssignment;
  isReadOnly?: boolean;
  onClick?: () => void;
  onToggleLock?: () => void;
  onContextAction?: (action: string) => void;
  onWhyClick?: () => void;
  showPencilHover?: boolean;
}

export function ZonePlanningCard(props: ZonePlanningCardProps) {
  const { assignment, ...shellProps } = props;
  const hasTM = !!assignment.tmName;

  return (
    <CardShell assignment={assignment} {...shellProps}>
      {hasTM ? (
        <div className="text-[18px] font-semibold leading-tight tracking-[-0.25px] text-[#1C1C1E]">
          {assignment.tmName}
        </div>
      ) : (
        <div className="text-center pt-0.5 border border-dashed border-transparent group-hover:border-[#D1D1CD] rounded transition-colors">
          <div className="text-[13px] font-medium text-[#6B6B68] tracking-[0.3px]">— Unfilled —</div>
          <div className="text-[10px] text-[#8A8A85] mt-0.5">Click to assign</div>
        </div>
      )}
    </CardShell>
  );
}
