"use client";

import React from "react";
import type { ShiftAssignment } from "../../store/useShiftBuilderStore";
import { getAccentColor, getSlotLabel } from "./card-utils";

interface RestroomPlanningCardProps {
  assignment: ShiftAssignment;
  isReadOnly?: boolean;
  onClick?: () => void;
  onToggleLock?: () => void;
  onContextAction?: (action: string) => void;
  onWhyClick?: () => void;
  showPencilHover?: boolean;
  isPencilHovering?: boolean; // passed from parent for now
  onPointerHandlers?: any; // temporary until we extract shell
}

/**
 * RestroomPlanningCard
 * Dedicated component for RR (mens/womens) slots.
 * This allows specialized rendering, better empty states, and future-specific interactions
 * without polluting the main orchestrator or other card types.
 */
export function RestroomPlanningCard(props: RestroomPlanningCardProps) {
  const { assignment, isReadOnly, onClick, onToggleLock, onWhyClick, showPencilHover } = props;

  const hasTM = !!assignment.tmName;
  const isLocked = assignment.isLocked;
  const provenance = assignment.provenance;
  const slotLabel = getSlotLabel(assignment);

  // For RR we can eventually render split mens/womens content here
  const isMens = assignment.rrSide === "mens";

  return (
    <div
      className="group relative flex flex-col rounded-xl border p-3 transition-all select-none min-h-[76px]"
      style={{
        borderTopWidth: 5,
        borderTopColor: getAccentColor(assignment.slotKey),
        background: hasTM ? "var(--surface)" : "var(--surface-2)",
        opacity: isReadOnly ? 0.6 : 1,
      }}
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault();
        props.onContextAction?.("open-menu");
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold tracking-[0.5px] text-accent">
            {slotLabel}
          </span>

          {provenance?.confidence !== undefined && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onWhyClick?.();
              }}
              className="rounded bg-accent/10 px-1.5 py-px text-[9px] font-mono text-accent/80 hover:bg-accent/20 transition"
              title="Why this assignment?"
            >
              {Math.round(provenance.confidence * 100)}%
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {isLocked && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock?.();
              }}
              className="text-[13px] text-amber-600 hover:text-amber-500"
              title="Locked"
            >
              🔒
            </button>
          )}

          {assignment.source === "engine" && (
            <span className="rounded bg-blue-500/10 px-1.5 text-[9px] font-medium text-blue-600">E</span>
          )}
          {assignment.source === "manual" && hasTM && (
            <span className="rounded bg-foreground/10 px-1.5 text-[9px] font-medium text-foreground/70">M</span>
          )}
        </div>
      </div>

      {/* Main Content - RR specific */}
      <div className="mt-1 flex-1">
        {hasTM ? (
          <div className="text-[15px] font-semibold leading-tight tracking-[-0.2px]">
            {assignment.tmName}
          </div>
        ) : (
          <div className="flex gap-4 text-[11px] text-muted-foreground/70">
            <div>
              <div className="text-[9px] text-muted-foreground/50">M</div>
              <div>—</div>
            </div>
            <div>
              <div className="text-[9px] text-muted-foreground/50">W</div>
              <div>—</div>
            </div>
          </div>
        )}
      </div>

      {/* Provenance hints */}
      {provenance?.rationale && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onWhyClick?.();
          }}
          className="mt-1 line-clamp-1 text-[10px] text-muted-foreground/60 hover:text-accent text-left"
          title="Why this assignment?"
        >
          {provenance.rationale}
        </button>
      )}

      {provenance?.fairnessSignals && Object.keys(provenance.fairnessSignals).length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 text-[9px] text-muted-foreground/50">
          {Object.entries(provenance.fairnessSignals)
            .slice(0, 2)
            .map(([key, val]) => (
              <span key={key} className="rounded bg-foreground/5 px-1">
                {key}: {(val as number).toFixed(1)}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}
