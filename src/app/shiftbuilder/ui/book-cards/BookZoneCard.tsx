"use client";

import React from "react";
import { getBookZoneColor, getZoneLabel, formatCoverage, getSubLocations } from "./book-utils";

type DevAssignment = any;

interface BookZoneCardProps {
  assignment: DevAssignment;
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onUnassign?: () => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
}

/**
 * BookZoneCard
 * Precise visual match to the Weekly Zone Deployment Book cards:
 * - Colored top bar with left diamond indicator + "ZONE N" + right coverage pill
 * - Bold assignee name
 * - 1-2 lines of light location subtext
 * - Tight spacing, clean card with thin border
 * - Fully interactive for drag (whole card or name), drop, click (for provenance/edit)
 */
export function BookZoneCard(props: BookZoneCardProps) {
  const { assignment, onClick, onDragStart, onDrop, onUnassign, isDragging, isDropTarget } = props;

  const color = getBookZoneColor(assignment.slotKey);
  const label = getZoneLabel(assignment.slotKey);
  const name = assignment.tmName;
  const hasName = !!name;
  const coverage = assignment.coverage ?? (hasName ? 1 : 0); // demo numbers; real data can override
  const locations = getSubLocations(assignment);
  const isLocked = assignment.isLocked;

  const handleDragStart = (e: React.DragEvent) => {
    if (onDragStart) onDragStart(e);
    else {
      e.dataTransfer.setData("text/plain", assignment.slotKey);
      e.dataTransfer.effectAllowed = "move";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (onDrop) onDrop(e);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  return (
    <div
      draggable={hasName || true}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={onClick}
      className={`group relative flex flex-col bg-white border border-[#E5E0D5] rounded-md overflow-hidden transition-all select-none shadow-sm h-full ${isDragging ? "opacity-40 scale-[0.985]" : ""} ${isDropTarget ? "ring-2 ring-[#C9A84C] ring-offset-1" : ""}`}
      style={{ minHeight: 80 }}
    >
      {/* Colored top header bar - thin strip with left accent square + label + right black coverage pill (exact to artboard) */}
      <div
        className="flex items-center justify-between h-[18px] px-1.5"
        style={{ backgroundColor: color, color: "#fff" }}
      >
        <div className="flex items-center gap-1">
          {/* Small left colored square / tag matching the image style */}
          <span 
            className="inline-block w-[10px] h-[10px] rounded-[1px] flex-shrink-0" 
            style={{ backgroundColor: "rgba(255,255,255,0.85)", border: "1px solid rgba(0,0,0,0.1)" }} 
          />
          <span className="text-[9px] font-semibold tracking-[0.5px] uppercase leading-none">{label}</span>
        </div>

        {/* Coverage number badge - small black rounded pill */}
        <div className="bg-[#1C1C1E] text-white text-[8px] font-semibold tabular-nums px-1 py-0 rounded-[2px] leading-none flex items-center h-[12px]">
          {formatCoverage(coverage) || (hasName ? "1" : "0")}
        </div>
      </div>

      {/* Body - tighter to match artboard card height and typography */}
      <div className="px-2 pt-1 pb-1.5 flex flex-col flex-1 text-[11px]">
        {hasName ? (
          <div className="text-[12px] font-semibold leading-tight tracking-[-0.1px] text-[#1C1C1E] truncate">
            {name}
          </div>
        ) : (
          <div className="text-[10px] text-[#9A9588] pt-0.5">— Unassigned —</div>
        )}

        {/* Sub-locations with · bullets, truncated like the image */}
        {locations.length > 0 && (
          <div className="mt-0.5 text-[8.5px] leading-[10px] text-[#8A8575]">
            {locations.slice(0, 2).map((loc, i) => (
              <div key={i} className="truncate">· {loc}</div>
            ))}
          </div>
        )}
      </div>

      {/* Lock indicator */}
      {isLocked && (
        <div className="absolute top-[22px] right-1 text-[9px] text-amber-600" title="Locked">🔒</div>
      )}

      {/* Unassign x - visible small, bottom right, matching artboard */}
      {hasName && onUnassign && (
        <button
          onClick={(e) => { e.stopPropagation(); onUnassign(); }}
          className="absolute bottom-0.5 right-1 text-[10px] text-[#6B6B68] hover:text-red-600 transition"
          title="Unassign"
        >
          ×
        </button>
      )}
    </div>
  );
}
