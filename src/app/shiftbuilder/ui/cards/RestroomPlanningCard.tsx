"use client";

import React from "react";
import { CardShell } from "./CardShell";

// Dev preview loose shape
type DevAssignment = any;

/**
 * Dedicated RestroomPlanningCard (mens / womens).
 * Thin consumer of CardShell. Owns only the RR-specific split empty state.
 * Future: independent mens/womens assignment, coverage indicators per side.
 */
interface RestroomPlanningCardProps {
  assignment: DevAssignment;
  isReadOnly?: boolean;
  onClick?: () => void;
  onToggleLock?: () => void;
  onContextAction?: (action: string) => void;
  onWhyClick?: () => void;
  showPencilHover?: boolean;
  // Per-side support for "male and female assigned to each"
  onClickSide?: (side: 'mens' | 'womens') => void;
  onDropToSide?: (side: 'mens' | 'womens', e: React.DragEvent) => void;
  onSideDragStart?: (side: 'mens' | 'womens') => void;
}

export function RestroomPlanningCard(props: RestroomPlanningCardProps) {
  const { assignment, onClickSide, onDropToSide, onSideDragStart, ...shellProps } = props;

  // Support dual assignment per restroom location (male + female for each RR)
  const mens = (assignment as any).mens || (assignment.rrSide === "mens" ? assignment : null);
  const womens = (assignment as any).womens || (assignment.rrSide === "womens" ? assignment : null);

  const mensName = mens?.tmName;
  const womensName = womens?.tmName;

  const hasAny = mensName || womensName;

  const handleSideClick = (side: 'mens' | 'womens') => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClickSide) {
      onClickSide(side);
    } else if (shellProps.onClick) {
      shellProps.onClick();
    }
  };

  const handleSideDrop = (side: 'mens' | 'womens') => (e: React.DragEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (onDropToSide) {
      onDropToSide(side, e);
    }
  };

  const handleSideDragOver = (e: React.DragEvent) => {
    e.stopPropagation();
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  // Small per-side provenance cue so the "heartbeat" (fairness / confidence) is visible even though RR uses nested mens/womens (no single top-level pill/footer from CardShell).
  const renderSideProvenance = (sideData: any) => {
    const p = sideData?.provenance;
    if (!p) return null;
    const pct = p.confidence !== undefined ? Math.round(p.confidence * 100) : null;
    const signals = p.fairnessSignals ? Object.entries(p.fairnessSignals).slice(0, 2) : null;
    return (
      <div className="mt-0.5 text-[9px] text-[#8B6F2E]/80 flex items-center gap-1.5">
        {pct !== null && <span className="tabular-nums font-semibold">{pct}%</span>}
        {signals && signals.map(([k, v]: any, i: number) => {
          const label = k.toLowerCase().includes('rot') ? 'R' : k.toLowerCase().includes('aff') ? 'A' : 'L';
          return <span key={i} className="tabular-nums">{label}{Number(v).toFixed(1)}</span>;
        })}
      </div>
    );
  };

  return (
    <CardShell assignment={assignment} {...shellProps}>
      {hasAny ? (
        <div className="flex gap-4 text-sm">
          {/* Mens side - per side interactive + draggable out. Heartbeat cues inline. */}
          <div 
            className="flex-1 min-w-0 p-1 rounded cursor-pointer hover:bg-[#F9F6EF]/50 transition"
            onClick={handleSideClick('mens')}
            onDrop={handleSideDrop('mens')}
            onDragOver={handleSideDragOver}
          >
            <div className="text-[9px] text-[#6B6B68] tracking-[0.5px]">♂ MENS</div>
            <div 
              className="text-[15px] font-semibold leading-tight text-[#1C1C1E] truncate"
              draggable={!!mensName}
              onDragStart={(e) => {
                e.stopPropagation();
                const sk = (props as any).assignment?.slotKey || '';
                e.dataTransfer.setData("text/plain", `${sk}:mens`);
                e.dataTransfer.effectAllowed = "move";
                if (onSideDragStart) onSideDragStart('mens');
              }}
            >
              {mensName || "—"}
            </div>
            {mens && renderSideProvenance(mens)}
          </div>
          {/* Womens side - per side interactive + draggable out */}
          <div 
            className="flex-1 min-w-0 p-1 rounded cursor-pointer hover:bg-[#F9F6EF]/50 transition"
            onClick={handleSideClick('womens')}
            onDrop={handleSideDrop('womens')}
            onDragOver={handleSideDragOver}
          >
            <div className="text-[9px] text-[#6B6B68] tracking-[0.5px]">♀ WOMENS</div>
            <div 
              className="text-[15px] font-semibold leading-tight text-[#1C1C1E] truncate"
              draggable={!!womensName}
              onDragStart={(e) => {
                e.stopPropagation();
                const sk = (props as any).assignment?.slotKey || '';
                e.dataTransfer.setData("text/plain", `${sk}:womens`);
                e.dataTransfer.effectAllowed = "move";
                if (onSideDragStart) onSideDragStart('womens');
              }}
            >
              {womensName || "—"}
            </div>
            {womens && renderSideProvenance(womens)}
          </div>
        </div>
      ) : (
        // Both open — exact spec with icons and actionable "Open". Still per-side drop/click targets.
        <div className="flex gap-7 text-[11px] pt-0.5">
          <div 
            className="text-center cursor-pointer hover:bg-[#F9F6EF]/50 rounded p-1 transition"
            onClick={handleSideClick('mens')}
            onDrop={handleSideDrop('mens')}
            onDragOver={handleSideDragOver}
          >
            <div className="text-base">♂</div>
            <div className="text-[9px] tracking-[0.4px] text-[#6B6B68] mt-0.5">MENS</div>
            <div className="text-[10px] text-[#8A8A85] font-medium">Open</div>
          </div>
          <div 
            className="text-center cursor-pointer hover:bg-[#F9F6EF]/50 rounded p-1 transition"
            onClick={handleSideClick('womens')}
            onDrop={handleSideDrop('womens')}
            onDragOver={handleSideDragOver}
          >
            <div className="text-base">♀</div>
            <div className="text-[9px] tracking-[0.4px] text-[#6B6B68] mt-0.5">WOMENS</div>
            <div className="text-[10px] text-[#8A8A85] font-medium">Open</div>
          </div>
        </div>
      )}
    </CardShell>
  );
}
