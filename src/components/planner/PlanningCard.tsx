"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { ShiftAssignment } from "@/app/shiftbuilder/types/shift-plan"; // we'll align types later

interface PlanningCardProps {
  assignment: ShiftAssignment;
  isReadOnly?: boolean;
  onClick?: (slotKey: string) => void;
  onContextMenu?: (slotKey: string, e: React.MouseEvent) => void;
  onToggleLock?: (slotKey: string) => void;
  className?: string;
}

export const PlanningCard = React.forwardRef<HTMLDivElement, PlanningCardProps>(
  function PlanningCard(
    {
      assignment,
      isReadOnly = false,
      onClick,
      onContextMenu,
      onToggleLock,
      className,
    },
    ref
  ) {
    const hasTM = !!assignment.tmName;
    const isLocked = assignment.isLocked;
    const provenance = assignment.provenance;

    const [isPencilHovering, setIsPencilHovering] = React.useState(false);

    const handlePointerEnter = (e: React.PointerEvent) => {
      if (e.pointerType === "pen") {
        setIsPencilHovering(true);
      }
    };

    const handlePointerLeave = (e: React.PointerEvent) => {
      if (e.pointerType === "pen") {
        setIsPencilHovering(false);
      }
    };

    const handleClick = () => {
      if (!isReadOnly && onClick) onClick(assignment.slotKey);
    };

    const handleContext = (e: React.MouseEvent) => {
      if (onContextMenu) {
        e.preventDefault();
        onContextMenu(assignment.slotKey, e);
      }
    };

    const slotLabel = getSlotLabel(assignment);

    return (
      <div
        ref={ref}
        className={cn(
          "group relative flex flex-col rounded-xl border p-3 transition-all select-none",
          "min-h-[78px]",
          isPencilHovering && "ring-2 ring-[#C9A84C]/70 ring-offset-2 ring-offset-[#FAFAF8]",
          hasTM ? "border-border bg-white" : "border-border/60 bg-zinc-50",
          isLocked && "opacity-90",
          isReadOnly && "pointer-events-none opacity-60",
          className
        )}
        onClick={handleClick}
        onContextMenu={handleContext}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        style={{
          borderTopWidth: 5,
          borderTopColor: getAccentColor(assignment.slotKey),
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold tracking-[0.5px] text-[#C13A14]">
              {slotLabel}
            </span>

            {provenance?.confidence !== undefined && (
              <span className="rounded bg-[#C13A14]/10 px-1.5 py-px text-[9px] font-mono text-[#C13A14]/80">
                {Math.round(provenance.confidence * 100)}%
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {isLocked && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleLock?.(assignment.slotKey);
                }}
                className="text-amber-600 hover:text-amber-500"
                title="Locked"
              >
                🔒
              </button>
            )}

            {assignment.source === "engine" && (
              <span className="rounded bg-blue-500/10 px-1.5 text-[9px] font-medium text-blue-600">E</span>
            )}
            {assignment.source === "manual" && hasTM && (
              <span className="rounded bg-zinc-900/10 px-1.5 text-[9px] font-medium text-zinc-600">M</span>
            )}
          </div>
        </div>

        {/* Main Content */}
        <div className="mt-1 flex-1">
          {hasTM ? (
            <div className="text-[15px] font-semibold leading-tight tracking-[-0.2px] text-zinc-950">
              {assignment.tmName}
            </div>
          ) : assignment.slotType === "rr" ? (
            <div className="flex gap-3 text-[11px] text-zinc-500">
              <span>M: —</span>
              <span>W: —</span>
            </div>
          ) : (
            <div className="text-[13px] text-zinc-400">— Unfilled —</div>
          )}
        </div>

        {/* Provenance hint */}
        {provenance?.rationale && (
          <div className="mt-1 line-clamp-1 text-[10px] text-zinc-500/70">
            {provenance.rationale}
          </div>
        )}

        {isPencilHovering && (
          <div className="absolute bottom-1.5 right-2 rounded bg-[#C9A84C] px-2 py-0.5 text-[9px] font-medium text-black shadow-sm">
            Edit
          </div>
        )}
      </div>
    );
  }
);

function getSlotLabel(a: ShiftAssignment): string {
  const { slotKey, slotType, rrSide } = a;
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
    const colors = ["#E85D04","#F59E0B","#0EA5E9","#EF4444","#22C55E","#3B82F6","#8B5CF6","#854D0E","#DC2626","#16A34A"];
    return colors[(n-1) % colors.length];
  }
  if (slotKey.includes("RR")) return "#64748b";
  return "#475569";
}
