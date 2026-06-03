"use client";

import React from "react";
import { CardShell } from "./CardShell";
import { getBreakWaveLabel } from "./card-utils";

// Dev preview loose shape
type DevAssignment = any;

/**
 * BreakPlanningCard — dedicated callable component for break wave/row slots.
 * Owns only break-specific wave labeling in empty state.
 * Future: wave progress, duration hints, stagger visuals.
 */
interface BreakPlanningCardProps {
  assignment: DevAssignment;
  isReadOnly?: boolean;
  onClick?: () => void;
  onToggleLock?: () => void;
  onContextAction?: (action: string) => void;
  onWhyClick?: () => void;
  showPencilHover?: boolean;
}

export function BreakPlanningCard(props: BreakPlanningCardProps) {
  const { assignment, ...shellProps } = props;
  const hasTM = !!assignment.tmName;
  const waveLabel = getBreakWaveLabel(assignment.slotKey);

  return (
    <CardShell assignment={assignment} {...shellProps}>
      {hasTM ? (
        <div className="flex items-center gap-2">
          <div className="text-[18px] font-semibold tracking-[-0.25px] text-[#1C1C1E]">{assignment.tmName}</div>
          <span className="rounded-full bg-[#EDE4D3] px-2 py-px text-[9px] font-medium text-[#8B6F2E]/80 tracking-[0.3px]">{waveLabel}</span>
        </div>
      ) : (
        <div className="flex items-center justify-center gap-2 text-[12px] text-[#9A9A95]">
          <span className="rounded-full bg-[#EDE4D3] px-2 py-px text-[9px] font-medium text-[#8B6F2E]/70 tracking-[0.3px]">{waveLabel}</span>
          <span className="text-[#A3A39F] tracking-[0.2px]">Unfilled</span>
        </div>
      )}
    </CardShell>
  );
}
