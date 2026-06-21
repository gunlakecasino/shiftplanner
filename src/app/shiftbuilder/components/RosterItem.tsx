"use client";

import React from "react";
import { useDraggable } from "@dnd-kit/core";

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

  const rowTone =
    isAssigned ? "placed" : emphasis === "on" ? "on" : emphasis === "scheduled" ? "scheduled" : "neutral";

  const avatarClass =
    isAssigned || emphasis === "on"
      ? "sb-roster-avatar--blue"
      : emphasis === "scheduled"
        ? "sb-roster-avatar--gold"
        : "sb-roster-avatar--neutral";

  const rowClass = [
    "sb-roster-row group flex items-center gap-2.5 px-2.5 py-2 text-sm touch-none border border-transparent",
    rowTone === "scheduled" ? "sb-roster-row--scheduled" : "",
    rowTone === "on" ? "sb-roster-row--on" : "",
    isAssigned ? "sb-roster-row--placed" : "",
    isDragging ? "sb-roster-row--dragging" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={rowClass}>
      <div className={`sb-roster-avatar ${avatarClass}`}>{initials}</div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="sb-roster-row__name truncate">{tm.name}</div>

          {tm.primarySection && (
            <span className="sb-roster-chip sb-roster-chip--section shrink-0">{tm.primarySection}</span>
          )}

          {tm.gravePool && (
            <span className="sb-roster-chip sb-roster-chip--pool shrink-0" title={`Grave pool: ${tm.gravePool}`}>
              G
            </span>
          )}
        </div>

        <div className="sb-roster-row__meta font-mono tabular-nums">{tm.id}</div>
      </div>

      {isAssigned && (
        <div className="sb-roster-placed-badge" title="Already placed on the board">
          <span
            className="ms"
            style={{ fontSize: 14, fontVariationSettings: '"FILL" 1, "wght" 500, "opsz" 20' }}
          >
            check_circle
          </span>
        </div>
      )}
    </div>
  );
});

export default RosterItem;