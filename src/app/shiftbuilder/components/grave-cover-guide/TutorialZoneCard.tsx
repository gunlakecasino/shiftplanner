"use client";

import React from "react";
import {
  ZONE_DEFS,
  ZONE_ICONS,
  cardAccentInk,
  getZoneColor,
} from "@/lib/shiftbuilder/constants";
import {
  CardAccentStripe,
  UnassignedInvite,
} from "../assignmentCardChrome";
import type { TutorialAssignment, TutorialSlotKey } from "./tutorialScenario";

type TutorialZoneCardProps = {
  slotKey: TutorialSlotKey;
  assignment: TutorialAssignment | null;
  highlighted?: boolean;
  pulse?: boolean;
  onAssignZoneDoubleClick?: (slotKey: TutorialSlotKey) => void;
};

export function TutorialZoneCard({
  slotKey,
  assignment,
  highlighted = false,
  pulse = false,
  onAssignZoneDoubleClick,
}: TutorialZoneCardProps) {
  const def = ZONE_DEFS.find((z) => z.key === slotKey)!;
  const color = getZoneColor(slotKey);
  const icon = ZONE_ICONS[slotKey] ?? "●";
  const isEmpty = !assignment;

  return (
    <div
      data-tutorial-slot={slotKey}
      className={`assignment-card sb-assignment-card sb-refined-card relative overflow-hidden flex flex-col min-h-[148px] rounded-2xl ${
        isEmpty ? "empty sb-card-empty" : ""
      } ${highlighted ? "sb-guide-target sb-guide-target--pulse" : ""} ${pulse ? "sb-guide-target--pulse" : ""}`}
      style={{ ["--card-accent" as string]: color }}
    >
      <CardAccentStripe color={color} />

      <div className="px-3 pt-2 flex items-center gap-1 flex-nowrap shrink-0">
        <span className="text-[12px] leading-none shrink-0" style={{ color: cardAccentInk(color) }}>
          {icon}
        </span>
        <span
          className="text-[10px] font-bold tracking-[0.07em] uppercase min-w-0 truncate"
          style={{ color: cardAccentInk(color) }}
        >
          {def.label}
        </span>
      </div>

      <div
        className="sb-card-assign-zone px-3.5 pt-1.5 pb-2 flex-1 flex flex-col min-h-0"
        onDoubleClick={(e) => {
          e.stopPropagation();
          onAssignZoneDoubleClick?.(slotKey);
        }}
      >
        {isEmpty ? (
          <UnassignedInvite
            size="zone"
            onClick={(e) => {
              e.stopPropagation();
              onAssignZoneDoubleClick?.(slotKey);
            }}
            title="Double-click upper area to open placement pad"
          />
        ) : (
          <h3
            className="flex items-baseline gap-1 min-w-0 text-[22px] font-bold leading-tight tracking-[-0.02em] text-gray-900"
            style={{ fontFamily: "var(--font-bricolage, var(--font-atkinson))" }}
          >
            {assignment.tmName}
          </h3>
        )}
      </div>
    </div>
  );
}