"use client";

import React from "react";
import { getAccentColor, getSlotLabel } from "./card-utils";

// Loose shape for the isolated dev preview surface (Phase 1 ui/cards/ work).
type DevAssignment = any;

interface CardShellProps {
  assignment: DevAssignment;
  isReadOnly?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  onToggleLock?: () => void;
  onContextAction?: (action: string) => void;
  onWhyClick?: () => void;
  showPencilHover?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * CardShell
 * Shared visual and interaction foundation for all PlanningCard variants.
 * Handles the common wrapper, header, provenance hints, pencil hover, and base events.
 * Type-specific cards only need to provide their unique main content via children.
 */
export function CardShell({
  assignment,
  isReadOnly = false,
  children,
  onClick,
  onToggleLock,
  onContextAction,
  onWhyClick,
  showPencilHover = true,
  className,
  style,
}: CardShellProps) {
  const [isPencilHovering, setIsPencilHovering] = React.useState(false);

  const provenance = assignment.provenance;
  const slotLabel = getSlotLabel(assignment);
  const hasTM = !!assignment.tmName;
  const isLocked = assignment.isLocked;

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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextAction?.("open-menu");
  };

  const accentColor = getAccentColor(assignment.slotKey);

  // Exact color-coded confidence pills per spec
  function getConfidencePillClasses(conf: number) {
    const pct = Math.round(conf * 100);
    if (pct >= 90) {
      // ≥90% → soft green bg + dark text
      return "rounded-full bg-emerald-100 px-2 py-px text-[9px] font-semibold tabular-nums text-emerald-800 hover:bg-emerald-200 transition-all";
    } else if (pct >= 75) {
      // 75–89% → warm gold/amber bg + dark text
      return "rounded-full bg-amber-100 px-2 py-px text-[9px] font-semibold tabular-nums text-amber-800 hover:bg-amber-200 transition-all";
    } else {
      // <75% → soft red bg + dark text
      return "rounded-full bg-red-100 px-2 py-px text-[9px] font-semibold tabular-nums text-red-700 hover:bg-red-200 transition-all";
    }
  }

  return (
    <div
      className={`group relative flex flex-col rounded-3xl border overflow-hidden transition-all select-none min-h-[82px] ${isPencilHovering ? "scale-[1.02]" : "hover:scale-[1.003]"} ${className || ""}`}
      style={{
        background: hasTM ? "#fff" : "#f9f9f7",
        borderColor: isPencilHovering ? "#C9A84C" : "#e5e5e3",
        boxShadow: isPencilHovering 
          ? "0 0 0 4px rgba(201, 168, 76, 0.35), inset 0 0 0 1px rgba(201, 168, 76, 0.3), 0 10px 18px -4px rgb(0 0 0 / 0.07)" 
          : "0 1px 2px 0 rgb(0 0 0 / 0.03)",
        transition: "transform 140ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 140ms ease, border-color 140ms ease",
        opacity: isReadOnly ? 0.55 : 1,
        ...style,
      }}
      onClick={onClick}
      onContextMenu={handleContextMenu}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      {/* Colored top border / header strip — exactly 9.5px tall with rounded top corners to follow the card edge */}
      <div 
        className="absolute top-0 left-0 right-0 h-[9.5px] rounded-t-3xl z-10"
        style={{ 
          backgroundColor: isPencilHovering ? "#C9A84C" : accentColor 
        }} 
      />

      {/* Shared Header */}
      <div className="flex items-center justify-between pt-5 px-4">
        <div className="flex items-center gap-2">
          {/* Card label (e.g. Z1, RR2 ♂, AUX, BW2 · Row 1) */}
          <span 
            className="text-[12px] font-semibold tracking-[0.7px] uppercase"
            style={{ color: accentColor }}
          >
            {slotLabel}
          </span>

          {provenance?.confidence !== undefined && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onWhyClick?.();
              }}
              className={getConfidencePillClasses(provenance.confidence)}
              title="Why this assignment? (tap for provenance)"
            >
              {Math.round(provenance.confidence * 100)}%
            </button>
          )}
        </div>

        {/* Clean top-right cluster for badges */}
        <div className="flex items-center gap-1">
          {isLocked && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock?.();
              }}
              className="text-[12px] text-amber-600 hover:text-amber-500 transition"
              title="Locked — tap to unlock"
            >
              🔒
            </button>
          )}
          {assignment.source === "engine" && (
            <span className="rounded bg-blue-500/10 px-1 py-px text-[8px] font-medium text-blue-600" title="Engine assigned">E</span>
          )}
          {assignment.source === "manual" && hasTM && (
            <span className="rounded bg-foreground/10 px-1 py-px text-[8px] font-medium text-foreground/70" title="Manual override">M</span>
          )}
        </div>
      </div>

      {/* Main card body with proper padding below the colored top bar + header */}
      <div className="px-4 pb-4">
        {/* Type-specific content goes here (name or unfilled state) */}
        <div className="mt-5 flex-1">{children}</div>

        {/* Shared Provenance hints */}
        {provenance?.rationale && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onWhyClick?.();
            }}
            className="mt-1.5 line-clamp-1 text-[10px] text-[#6E6E6A] hover:text-[#8B6F2E] text-left transition-colors"
            title="Why this assignment?"
          >
            {provenance.rationale}
          </button>
        )}

        {/* Provenance footer — single consistent block with hover glow */}
        {provenance?.confidence !== undefined && (
          <div className="mt-2.5 rounded px-1 py-0.5 transition-all group-hover:bg-[#F9F6EF]/70">
            {/* Gold bar + % */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-[2px] rounded-full bg-[#EDE4D3] overflow-hidden">
                <div 
                  className="h-[2px] bg-[#C9A84C] transition-all duration-200" 
                  style={{ width: `${Math.max(12, Math.round(provenance.confidence * 100))}%` }} 
                />
              </div>
              <span className="text-[9.5px] font-medium tabular-nums text-[#8B6F2E]">
                {Math.round(provenance.confidence * 100)}
              </span>
            </div>

            {/* Refined metrics strip - no emojis, ultra-luxe minimalist */}
            {provenance?.fairnessSignals && Object.keys(provenance.fairnessSignals).length > 0 && (
              <div className="mt-1 flex items-center gap-4 text-[9px] text-[#5C4A2E]">
                {Object.entries(provenance.fairnessSignals)
                  .slice(0, 3)
                  .map(([key, val]) => {
                    const lower = key.toLowerCase();
                    const label = lower.includes('rot') ? 'Rot' : lower.includes('aff') ? 'Aff' : 'Load';
                    return (
                      <span 
                        key={key} 
                        className="tabular-nums font-semibold tracking-[0.3px]"
                        title={`${label} fairness signal: ${Number(val).toFixed(2)}`}
                      >
                        {label} {Number(val).toFixed(1)}
                      </span>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pencil hover affordance — top-right for stronger affordance */}
      {isPencilHovering && (
        <div className="absolute top-1.5 right-2 rounded-full bg-[#C9A84C] px-2 py-[1px] text-[9px] font-medium tracking-[0.4px] text-black shadow flex items-center gap-1 opacity-90 transition-opacity">
          <span>✎</span>
          <span>Edit</span>
        </div>
      )}
    </div>
  );
}
