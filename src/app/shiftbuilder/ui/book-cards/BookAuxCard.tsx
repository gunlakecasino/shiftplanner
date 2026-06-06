"use client";

import React from "react";

type DevAssignment = any;

interface BookAuxCardProps {
  assignment: DevAssignment;
  onClick?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onUnassign?: () => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
}

/**
 * BookAuxCard
 * Matches the Auxiliary section in the image:
 * - Filled cards have light border, name, small colored pill (Z9 SR, ADMIN), x unassign
 * - Unassigned are dashed, centered "— Unassigned —", small gray count pill
 */
export function BookAuxCard(props: BookAuxCardProps) {
  const { assignment, onClick, onDragStart, onDrop, onUnassign, isDragging, isDropTarget } = props;

  const name = assignment.tmName;
  const hasName = !!name;
  const isUnassigned = !hasName;

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

  if (isUnassigned) {
    // Derive small title like "TRASH 1", "SUPPORT 1" from key to match the artboard labels above unassigned cards
    const unassignedTitle = assignment.auxPill || 
      (assignment.slotKey.includes("TRASH1") ? "TRASH 1" : 
       assignment.slotKey.includes("TRASH2") ? "TRASH 2" : 
       assignment.slotKey.includes("SUPPORT1") ? "SUPPORT 1" : 
       assignment.slotKey.includes("SUPPORT2") ? "SUPPORT 2" : "");

    return (
      <div
        onClick={onClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center border border-dashed border-[#C9C4B8] rounded-md bg-[#FAF9F6] text-[#9A9588] py-1.5 px-1 transition text-center h-full ${isDropTarget ? "ring-1 ring-[#C9A84C] bg-[#F9F6EF]" : ""}`}
        style={{ minHeight: 60 }}
      >
        {unassignedTitle && <div className="text-[7px] text-[#9A9588] tracking-[0.2px] mb-0.5">{unassignedTitle}</div>}
        <div className="text-[9px] tracking-[0.3px]">— Unassigned —</div>
        {/* small gray pill like image */}
        <div className="mt-0.5 text-[7.5px] bg-[#EDE8DC] text-[#7A7668] px-1 py-px rounded tabular-nums">
          {assignment.coverage ?? 3}
        </div>
      </div>
    );
  }

  // Filled aux style (Z9 SR, ADMIN, etc.) - name, small pill below, x visible
  const pill = assignment.auxPill || (assignment.slotKey.includes("Z9") ? "Z9 SR" : assignment.slotKey.includes("ADMIN") ? "ADMIN" : "AUX");

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={onClick}
      className={`group relative flex flex-col bg-white border border-[#E5E0D5] rounded-md overflow-hidden transition-all select-none h-full ${isDragging ? "opacity-40" : ""} ${isDropTarget ? "ring-2 ring-[#C9A84C]" : ""}`}
      style={{ minHeight: 60 }}
    >
      <div className="px-2 pt-1.5 pb-1.5">
        <div className="flex items-center justify-between">
          <div className="text-[12px] font-semibold text-[#1C1C1E]">{name}</div>
          <button
            onClick={(e) => { e.stopPropagation(); onUnassign?.(); }}
            className="text-[10px] text-[#6B6B68] hover:text-red-600"
            title="Unassign"
          >
            ×
          </button>
        </div>

        {/* small label pill like the image (Z9 SR, ADMIN) */}
        <div className="mt-0.5 inline-flex items-center text-[7.5px] bg-[#EDE8DC] text-[#5C5850] px-1 py-px rounded tracking-[0.2px]">
          {pill}
        </div>
      </div>
    </div>
  );
}
