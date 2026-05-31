"use client";

import React from "react";
import { useDraggable } from "@dnd-kit/core";

/**
 * RosterItem — Draggable team member row in the roster rail.
 *
 * Phase 1 Performance:
 * - Fully memoized (parent must pass stable props).
 * - Used inside virtualized lists so only visible items ever mount.
 * - Still owns its own useDraggable (dnd-kit requirement).
 */

export interface RosterItemProps {
  tm: {
    id: string;
    name: string;
    fullName?: string;
    primarySection?: string | null;
    gravePool?: string | null;
  };
  isAssigned: boolean;
  emphasis: "on" | "off" | "scheduled";
  isLocked?: boolean;
  canEdit?: boolean;
}

const RosterItem = React.memo(function RosterItem({
  tm,
  isAssigned,
  emphasis,
  isLocked = false,
  canEdit = true,
}: RosterItemProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `tm:${tm.id}`,
    data: { type: "tm", tmId: tm.id, tmName: tm.name },
    disabled: isAssigned || isLocked || !canEdit,
  });

  const initials = tm.name
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const isDraggable = !isAssigned && canEdit;

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group flex items-center gap-2.5 px-3 py-1.5 rounded-[3px] text-sm touch-none transition-all border border-transparent ${
        isAssigned
          ? "opacity-45 cursor-not-allowed"
          : `hover:bg-[#F8F8F9] hover:border-[#E5E5E7] hover:shadow-sm ${
              emphasis === "on"
                ? "border-l-2 border-[#007AFF] bg-white/70"
                : emphasis === "scheduled"
                ? "border-l-2 border-amber-400 bg-amber-50/60"
                : ""
            } cursor-grab active:cursor-grabbing`
      } ${isDragging ? "opacity-25 scale-[0.985]" : ""}`}
    >
      {/* Drag grip */}
      {isDraggable && (
        <div className="flex h-5 w-4 shrink-0 items-center justify-center text-[#9CA3AF] group-hover:text-[#6B7280] transition-colors">
          <span
            className="ms"
            style={{ fontSize: 14, fontVariationSettings: '"FILL" 1, "wght" 300, "opsz" 20' }}
          >
            drag_indicator
          </span>
        </div>
      )}

      {/* Avatar (initials) */}
      <div
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white ring-1 ring-white/70"
        style={{
          backgroundColor:
            emphasis === "on" ? "#007AFF" : emphasis === "scheduled" ? "#d97706" : "#5A5A5F",
        }}
      >
        {initials}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <div className="truncate font-semibold tracking-[-0.1px] text-[12.5px] text-[#1C1C1E]">
            {tm.name}
          </div>

          {tm.primarySection && (
            <span
              className="inline-flex items-center rounded px-1.5 py-px text-[9px] font-medium tracking-wide"
              style={{ backgroundColor: "#007AFF15", color: "#007AFF" }}
            >
              {tm.primarySection}
            </span>
          )}

          {tm.gravePool && (
            <span
              className="inline-flex items-center rounded px-1 py-px text-[8px] font-semibold tracking-[0.5px]"
              style={{ backgroundColor: "#34C75915", color: "#1f7a3d" }}
              title={`Grave pool: ${tm.gravePool}`}
            >
              G
            </span>
          )}
        </div>

        <div className="text-[10px] text-[#8E8E93] font-mono tabular-nums tracking-[-0.2px]">
          {tm.id}
        </div>
      </div>

      {isAssigned && (
        <div className="text-[#34C759] shrink-0" title="Already assigned this night">
          <span
            className="ms"
            style={{ fontSize: 16, fontVariationSettings: '"FILL" 1, "wght" 400, "opsz" 20' }}
          >
            check_circle
          </span>
        </div>
      )}
    </div>
  );
});

export default RosterItem;
