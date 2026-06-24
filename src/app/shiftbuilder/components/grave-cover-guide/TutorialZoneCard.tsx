"use client";

import React from "react";
import {
  ZONE_DEFS,
  ZONE_ICONS,
  cardAccentInk,
  getZoneColor,
  COVERAGE_BAR_H,
} from "@/lib/shiftbuilder/constants";
import { taskLabelColorClass, taskLabelSizeClass, TASK_LABEL_SIZE_PX } from "@/lib/shiftbuilder/taskTextStyle";
import {
  CardAccentStripe,
  UnassignedInvite,
} from "../assignmentCardChrome";
import BreakBadge from "../BreakBadge";
import type { TutorialAssignment, TutorialSlotKey, TutorialTask } from "./tutorialScenario";

type TutorialZoneCardProps = {
  slotKey: TutorialSlotKey;
  assignment: TutorialAssignment | null;
  tasks?: TutorialTask[];
  highlighted?: boolean;
  pulse?: boolean;
  highlightTaskZone?: boolean;
  onAssignZoneDoubleClick?: (slotKey: TutorialSlotKey) => void;
  onTaskZoneDoubleClick?: (slotKey: TutorialSlotKey) => void;
};

export function TutorialZoneCard({
  slotKey,
  assignment,
  tasks = [],
  highlighted = false,
  pulse = false,
  highlightTaskZone = false,
  onAssignZoneDoubleClick,
  onTaskZoneDoubleClick,
}: TutorialZoneCardProps) {
  const def = ZONE_DEFS.find((z) => z.key === slotKey)!;
  const color = getZoneColor(slotKey);
  const icon = ZONE_ICONS[slotKey] ?? "●";
  const isEmpty = !assignment;
  const regularTasks = tasks.filter((t) => !t.isCoverage);
  const coverageTasks = tasks.filter((t) => t.isCoverage);
  const breakGroup = assignment?.breakGroup ?? 0;

  return (
    <div
      data-tutorial-slot={slotKey}
      className={`assignment-card sb-assignment-card sb-refined-card relative overflow-hidden flex flex-col min-h-0 rounded-2xl h-full ${
        isEmpty ? "empty sb-card-empty" : ""
      } ${highlighted ? "sb-guide-target" : ""} ${pulse ? "sb-guide-target--pulse" : ""}`}
      style={{
        ["--card-accent" as string]: color,
        paddingBottom: coverageTasks.length > 0 ? coverageTasks.length * COVERAGE_BAR_H + 4 : undefined,
      }}
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
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <BreakBadge value={breakGroup as 0 | 1 | 2 | 3} onCycle={() => {}} size="sm" />
        </div>
      </div>

      <div
        className="sb-card-assign-zone px-3.5 pt-1 pb-1.5 shrink-0"
        onDoubleClick={(e) => {
          e.stopPropagation();
          onAssignZoneDoubleClick?.(slotKey);
        }}
      >
        {isEmpty ? (
          <h3 className="text-[18px] font-bold text-[#9CA3AF] opacity-70 truncate">Unassigned</h3>
        ) : (
          <h3
            className="text-[18px] font-bold leading-tight tracking-[-0.02em] text-gray-900 truncate"
            style={{ fontFamily: "var(--font-bricolage, var(--font-atkinson))" }}
          >
            {assignment.tmName}
          </h3>
        )}
      </div>

      {isEmpty && (
        <>
          <div className="mx-3.5 h-px bg-[var(--ios-gray-6)] shrink-0" />
          <div className="px-3.5 py-1.5 shrink-0">
            <UnassignedInvite
              size="zone"
              onClick={(e) => {
                e.stopPropagation();
                onAssignZoneDoubleClick?.(slotKey);
              }}
              title="Double-click upper area to open placement pad"
            />
          </div>
        </>
      )}

      <div className="mx-3.5 h-px bg-[var(--ios-gray-6)] shrink-0" />

      <div
        className={`sb-card-task-scroll px-3 py-1.5 space-y-0.5 flex-1 min-h-[32px] overflow-y-auto ${
          highlightTaskZone ? "sb-guide-target sb-guide-target--pulse" : ""
        }`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onTaskZoneDoubleClick?.(slotKey);
        }}
      >
        {regularTasks.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-1.5 py-0.5 ${taskLabelColorClass(true)} ${taskLabelSizeClass(TASK_LABEL_SIZE_PX.zoneCard)}`}
          >
            <span className="w-1 h-3 rounded-full shrink-0" style={{ background: t.color ?? color }} />
            <span className="truncate font-medium">{t.taskLabel}</span>
          </div>
        ))}
        {regularTasks.length === 0 && !isEmpty && (
          <span className="text-[9px] text-[#9CA3AF] opacity-60">Double-click to add tasks</span>
        )}
      </div>

      {coverageTasks.map((t) => (
        <div
          key={t.id}
          className="sb-coverage-bar sb-coverage-bar--builder-calm absolute bottom-0 left-0 right-0 flex items-center px-2 text-[9px] font-semibold truncate"
          style={{
            height: COVERAGE_BAR_H,
            minHeight: COVERAGE_BAR_H,
            background: `color-mix(in srgb, ${getZoneColor(t.coverageTarget ?? "Z8")} 65%, var(--ios-background-secondary))`,
            borderTop: "1px solid color-mix(in srgb, var(--ios-background-secondary) 20%, transparent)",
          }}
        >
          {t.taskLabel}
        </div>
      ))}
    </div>
  );
}