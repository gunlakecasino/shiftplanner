"use client";

import React from "react";
import { CardShell } from "./CardShell";

// Dev preview loose shape
type DevAssignment = any;

/**
 * AuxPlanningCard — dedicated callable component for AUX / support slots.
 * Thin wrapper over CardShell. Future: task summary, load indicators.
 */
interface AuxPlanningCardProps {
  assignment: DevAssignment;
  isReadOnly?: boolean;
  onClick?: () => void;
  onToggleLock?: () => void;
  onContextAction?: (action: string) => void;
  onWhyClick?: () => void;
  showPencilHover?: boolean;
}

export function AuxPlanningCard(props: AuxPlanningCardProps) {
  const { assignment, ...shellProps } = props;
  const hasTM = !!assignment.tmName;

  return (
    <CardShell assignment={assignment} {...shellProps}>
      {hasTM ? (
        <div className="text-[18px] font-semibold tracking-[-0.25px] text-[#1C1C1E]">{assignment.tmName}</div>
      ) : (
        <div className="text-[11px] text-[#A3A39F] text-center pt-1 tracking-[0.2px]">— Unfilled —</div>
      )}
    </CardShell>
  );
}
