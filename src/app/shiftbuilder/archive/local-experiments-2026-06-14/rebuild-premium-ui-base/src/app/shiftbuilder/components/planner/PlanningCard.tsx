"use client";

import React from "react";
import type { ShiftAssignment } from "../../store/useShiftBuilderStore"; // temporary – will refine

export interface PlanningCardProps {
  assignment: ShiftAssignment;
  isReadOnly?: boolean;
  onClick?: () => void;
  onToggleLock?: () => void;
  onContextAction?: (action: string) => void;
  onWhyClick?: () => void; // New: for opening provenance details
  showPencilHover?: boolean;
}

/**
 * PlanningCard (Phase 1)
 * Unified card primitive aiming to replace/combine ZoneCard, RRCard, AuxCard.
 * Designed for:
 * - Pencil hover discoverability (gold ring + "Edit" cue)
 * - Optimistic updates (instant local state changes)
 * - Contextual power surface (right-click / long-press → actions)
 * - Rich provenance display (rationale, confidence, fairness signals)
 */
export function PlanningCard({
  assignment,
  isReadOnly = false,
  onClick,
  onToggleLock,
  onContextAction,
  onWhyClick,
  showPencilHover = true,
}: PlanningCardProps) {
  const [isPencilHovering, setIsPencilHovering] = React.useState(false);
  const [longPressTimer, setLongPressTimer] = React.useState<NodeJS.Timeout | null>(null);

  const hasTM = !!assignment.tmName;
  const isLocked = assignment.isLocked;
  const provenance = assignment.provenance;

  const handlePointerEnter = (e: React.PointerEvent) => {
    if (showPencilHover && e.pointerType === "pen") {
      setIsPencilHovering(true);
    }
  };

  const handlePointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "pen") {
      setIsPencilHovering(false);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      const timer = setTimeout(() => {
        onContextAction?.("open-menu");
      }, 420);
      setLongPressTimer(timer);
    }
  };

  const handlePointerUp = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      setLongPressTimer(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextAction?.("open-menu");
  };

  const slotLabel = getSlotLabel(assignment);

  return (
    <div
      className="group relative flex flex-col rounded-xl border p-3 transition-all select-none min-h-[76px]"
      style={{
        borderTopWidth: 5,
        borderTopColor: getAccentColor(assignment.slotKey),
        background: hasTM ? "var(--surface)" : "var(--surface-2)",
        borderColor: isPencilHovering ? "#C9A84C" : "var(--border)",
        boxShadow: isPencilHovering ? "0 0 0 2px rgba(201, 168, 76, 0.3)" : undefined,
        opacity: isReadOnly ? 0.6 : 1,
      }}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
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

      {/* Main Content */}
      <div className="mt-1 flex-1">
        {hasTM ? (
          <div className="text-[15px] font-semibold leading-tight tracking-[-0.2px]">
            {assignment.tmName}
          </div>
        ) : assignment.slotType === "rr" ? (
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
        ) : assignment.slotKey.includes("BW") ? (
          // Break slot rendering (Phase 1 improvement)
          <div className="text-[12px] text-muted-foreground/70">
            {assignment.slotKey.includes("BW1") && "Wave 1 · "}
            {assignment.slotKey.includes("BW2") && "Wave 2 · "}
            {assignment.slotKey.includes("BW3") && "Wave 3 · "}
            Row {assignment.slotKey.split("-Row")[1] || "?"}
          </div>
        ) : (
          <div className="text-[13px] text-muted-foreground/70">— Unfilled —</div>
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

      {/* Pencil hover affordance */}
      {isPencilHovering && (
        <div className="absolute bottom-1.5 right-2 rounded bg-[#C9A84C] px-2 py-0.5 text-[9px] font-medium text-black shadow-sm">
          Edit
        </div>
      )}
    </div>
  );
}

function getSlotLabel(assignment: ShiftAssignment): string {
  const { slotKey, slotType, rrSide } = assignment;
  if (slotKey.startsWith("Zone")) return slotKey.replace("Zone", "Zone ");
  if (slotType === "rr") {
    const num = slotKey.replace(/M|W|RR/g, "");
    const side = rrSide === "mens" ? "♂" : rrSide === "womens" ? "♀" : "";
    return `RR${num} ${side}`.trim();
  }
  if (slotKey.startsWith("BW")) return slotKey.replace("-", " · Row ");
  if (slotKey.includes("Overlap")) return slotKey.replace("-Overlap", " Overlap");
  return slotKey;
}

function getAccentColor(slotKey: string): string {
  if (slotKey.startsWith("Zone")) {
    const n = parseInt(slotKey.replace("Zone", "")) || 1;
    const colors = ["#E85D04", "#F59E0B", "#0EA5E9", "#EF4444", "#22C55E", "#3B82F6", "#8B5CF6", "#854D0E", "#DC2626", "#16A34A"];
    return colors[(n - 1) % colors.length];
  }
  if (slotKey.includes("RR")) return "#64748b";
  return "#475569";
}
