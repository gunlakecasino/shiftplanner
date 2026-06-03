"use client";

import React from "react";
import { getBookRestroomColor, getRestroomLabel, formatGenderCount, getRRLocations } from "./book-utils";

type DevAssignment = any;

interface BookRestroomCardProps {
  assignment: DevAssignment;
  onClick?: () => void;
  onClickSide?: (side: 'mens' | 'womens') => void;
  onDropToSide?: (side: 'mens' | 'womens', e: React.DragEvent) => void;
  onSideDragStart?: (side: 'mens' | 'womens') => void;
  onUnassignSide?: (side: 'mens' | 'womens') => void;
  isDragging?: boolean;
  isDropTarget?: boolean;
  highlightSide?: 'mens' | 'womens' | null;
}

/**
 * BookRestroomCard — exact per-side split matching the image
 * - Left colored vertical accent bar
 * - Two columns: MEN'S N  |  WOMEN'S N   (small square count badges)
 * - Bold name under each
 * - 1-2 location lines per gender below the name
 * - Independent click, drag (name carries :mens payload), drop targets
 * - Hover highlight on the specific half when a compatible drag is active
 */
export function BookRestroomCard(props: BookRestroomCardProps) {
  const { assignment, onClick, onClickSide, onDropToSide, onSideDragStart, onUnassignSide, isDragging, isDropTarget, highlightSide } = props;

  const color = getBookRestroomColor(assignment.slotKey);
  const label = getRestroomLabel(assignment.slotKey);

  const mens = assignment.mens || null;
  const womens = assignment.womens || null;

  const mensName = mens?.tmName;
  const womensName = womens?.tmName;

  const mensCount = mensName ? 1 : 0; // demo; real would aggregate coverage or tasks
  const womensCount = womensName ? 1 : 0;

  const mensLocs = getRRLocations('mens', assignment.slotKey);
  const womensLocs = getRRLocations('womens', assignment.slotKey);

  const makeSideHandlers = (side: 'mens' | 'womens') => ({
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      if (onClickSide) onClickSide(side);
      else if (onClick) onClick();
    },
    onDrop: (e: React.DragEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (onDropToSide) onDropToSide(side, e);
    },
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    },
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.setData("text/plain", `${assignment.slotKey}:${side}`);
      e.dataTransfer.effectAllowed = "move";
      if (onSideDragStart) onSideDragStart(side);
    },
  });

  const mensH = makeSideHandlers('mens');
  const womensH = makeSideHandlers('womens');

  const sideClass = (side: 'mens' | 'womens') =>
    `flex-1 min-w-0 px-1.5 py-1 rounded transition ${highlightSide === side ? "bg-[#F9F6EF] ring-1 ring-[#C9A84C]" : "hover:bg-[#F9F6EF]/60"}`;

  return (
    <div
      onClick={onClick}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { if (onDropToSide) { /* let halves handle precise */ } }}
      className={`group relative flex flex-col bg-white border border-[#E5E0D5] rounded-md overflow-hidden transition-all select-none shadow-sm h-full ${isDragging ? "opacity-40" : ""} ${isDropTarget ? "ring-2 ring-[#C9A84C]" : ""}`}
      style={{ minHeight: 80 }}
    >
      {/* Header row with small left colored square indicator (no full height bar - matches artboard) */}
      <div className="flex items-center px-1.5 pt-1 pb-0.5">
        {/* Small left colored square tag like in the zones and RR artboard cards */}
        <span 
          className="inline-block w-[9px] h-[9px] rounded-[1px] mr-1 flex-shrink-0" 
          style={{ backgroundColor: color, border: "1px solid rgba(0,0,0,0.08)" }} 
        />
        <div className="text-[9px] font-semibold tracking-[0.4px] text-[#3A3A38]">{label}</div>
      </div>

      {/* The critical per-side split — two independent targets, compact to match image */}
      <div className="flex text-[9px] px-1 pt-0 pb-1 gap-1">
        {/* MENS column */}
        <div
          className={sideClass('mens')}
          onClick={mensH.onClick}
          onDrop={mensH.onDrop}
          onDragOver={mensH.onDragOver}
          draggable={!!mensName}
          onDragStart={mensH.onDragStart}
        >
          <div className="flex items-center gap-1 text-[#6B6B68]">
            <span className="font-semibold tracking-[0.2px]">MEN'S</span>
            <span className="inline-block bg-[#1C1C1E] text-white text-[7.5px] font-semibold tabular-nums px-1 py-[0px] rounded-[1px] leading-none">{formatGenderCount(mensCount)}</span>
          </div>
          <div className="text-[11px] font-semibold text-[#1C1C1E] leading-tight truncate mt-0.5">
            {mensName || "—"}
          </div>
          {mensLocs.length > 0 && (
            <div className="text-[8px] text-[#8A8575] leading-[9px] mt-0.5">
              {mensLocs.slice(0, 2).map((l, i) => <div key={i} className="truncate">· {l}</div>)}
            </div>
          )}

          {/* unassign x - visible small per the screenshot */}
          {mensName && onUnassignSide && (
            <button onClick={(e) => { e.stopPropagation(); onUnassignSide('mens'); }} className="text-[9px] text-[#6B6B68] hover:text-red-600 mt-0.5">×</button>
          )}
        </div>

        {/* WOMENS column */}
        <div
          className={sideClass('womens')}
          onClick={womensH.onClick}
          onDrop={womensH.onDrop}
          onDragOver={womensH.onDragOver}
          draggable={!!womensName}
          onDragStart={womensH.onDragStart}
        >
          <div className="flex items-center gap-1 text-[#6B6B68]">
            <span className="font-semibold tracking-[0.2px]">WOMEN'S</span>
            <span className="inline-block bg-[#1C1C1E] text-white text-[7.5px] font-semibold tabular-nums px-1 py-[0px] rounded-[1px] leading-none">{formatGenderCount(womensCount)}</span>
          </div>
          <div className="text-[11px] font-semibold text-[#1C1C1E] leading-tight truncate mt-0.5">
            {womensName || "—"}
          </div>
          {womensLocs.length > 0 && (
            <div className="text-[8px] text-[#8A8575] leading-[9px] mt-0.5">
              {womensLocs.slice(0, 2).map((l, i) => <div key={i} className="truncate">· {l}</div>)}
            </div>
          )}

          {womensName && onUnassignSide && (
            <button onClick={(e) => { e.stopPropagation(); onUnassignSide('womens'); }} className="text-[9px] text-[#6B6B68] hover:text-red-600 mt-0.5">×</button>
          )}
        </div>
      </div>
    </div>
  );
}
